// Notes of one instrument, indexed by MIDI number, as 16-bit samples: a port of the game's
// NoteBank.cs. Notes in between are played from the nearest one, pitch-shifted. A held
// instrument's note loops between loopStart and loopEnd for as long as it is held.

// Every bank is stored at this level (the RMS-matched attack times this factor) and the mixer
// multiplies it back.
export const StoredScale = 0.14852598;

export function newBank() {
  return {
    samples: new Array(128).fill(null), rates: new Int32Array(128), loopStart: new Int32Array(128),
    loopEnd: new Int32Array(128), nearest: new Int32Array(128).fill(-1), sustainStart: new Int32Array(128),
  };
}

export function addNote(bank, midi, data, rate, loopStart = 0, loopEnd = 0) {
  bank.samples[midi] = data;
  bank.rates[midi] = rate;
  bank.loopStart[midi] = loopStart;
  bank.loopEnd[midi] = loopEnd;
}

export function finishBank(bank) {
  let any = false;
  for (let m = 0; m < 128; m++) {
    let best = -1;
    for (let k = 0; k < 128; k++)
      if (bank.samples[k] && (best < 0 || Math.abs(k - m) < Math.abs(best - m))) best = k;
    bank.nearest[m] = best;
    any ||= best >= 0;
  }
  for (let k = 0; k < 128; k++)
    if (bank.samples[k]) bank.sustainStart[k] = findSustain(bank.samples[k], bank.rates[k]);
  return any;
}

// Where a note has reached its full tone: the first 10 ms window at 70 % of the level held between
// 0.3 and 1.5 s (the recorded winds swell in first). A tied note starts from there.
function findSustain(data, rate) {
  const window = Math.trunc(rate / 100);
  const from = Math.trunc(0.3 * rate), to = Math.min(data.length, Math.trunc(1.5 * rate));
  if (to - from < window) return 0;
  const steady = rms(data, from, to);
  for (let start = 0; start + window <= from; start += window)
    if (rms(data, start, start + window) >= 0.7 * steady) return start;
  return from;
}

function rms(data, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / (to - from));
}

// A WAV file (16-bit PCM, any channel count: the first channel is kept, as in the game).
export function parseWav(buffer) {
  const view = new DataView(buffer);
  let pos = 12, rate = 0, channels = 1, data = null;
  while (pos + 8 <= view.byteLength) {
    const id = String.fromCharCode(view.getUint8(pos), view.getUint8(pos + 1), view.getUint8(pos + 2), view.getUint8(pos + 3));
    const size = view.getInt32(pos + 4, true);
    if (id === 'fmt ') {
      channels = view.getInt16(pos + 10, true);
      rate = view.getInt32(pos + 12, true);
    } else if (id === 'data') {
      const n = Math.trunc(size / 2 / channels);
      data = new Int16Array(n);
      for (let i = 0; i < n; i++) data[i] = view.getInt16(pos + 8 + i * 2 * channels, true);
    }
    pos += 8 + size + (size & 1);
  }
  return { data, rate };
}
