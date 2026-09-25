// Synthesized instruments, made into note banks when first needed (no file to download): the voices of
// an 8-bit console (the chiptune universe). Each tone note is one period of 32 steps, like the console's
// sequencers, stored at the sample rate that makes that period exact (f × 32), and looped on that
// period: a note is always perfectly in tune and its loop never clicks. The mixer plays them like the
// recorded ones.
import { newBank, addNote, finishBank, StoredScale } from './notebank.js';

const Steps = 32;
const Full = 32767 * StoredScale; // the level every bank is stored at (see notebank.js)
const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// One period of each waveform, in [-1, 1].
const Waves = {
  pulse12: (i) => (i < 4 ? 1 : -1),    // duty 12.5 %: thin, nasal
  pulse25: (i) => (i < 8 ? 1 : -1),    // duty 25 %: the classic lead
  pulse50: (i) => (i < 16 ? 1 : -1),   // square: round, hollow
  // the console's triangle: a 4-bit staircase, 15 → 0 → 15
  triangle: (i) => ((i < 16 ? 15 - i : i - 16) / 7.5 - 1),
};

// A tone bank: every note from `lo` to `hi`, one looped period each (plus a copy, so the mixer's
// interpolation always has the next sample).
function toneBank(wave, lo, hi, level) {
  const bank = newBank();
  const shape = Waves[wave];
  // a pulse wave's average is not zero: centred, so a note starts and stops without a thump
  let mean = 0;
  for (let i = 0; i < Steps; i++) mean += shape(i) / Steps;
  for (let midi = lo; midi <= hi; midi++) {
    const data = new Int16Array(Steps * 3);
    for (let i = 0; i < data.length; i++) data[i] = Math.round((shape(i % Steps) - mean) * Full * level);
    addNote(bank, midi, data, Math.round(freq(midi) * Steps), 0, Steps);
  }
  finishBank(bank);
  return bank;
}

// The console's noise: a 15-bit shift register clocked at one of its periods; `short` = the 93-step
// "metallic" mode.
function noise(seconds, period, short, envelope, rate = 44100, seed = 1) {
  const n = Math.round(seconds * rate), out = new Float32Array(n);
  let reg = seed, phase = 0;
  const clock = 1789773 / period / rate; // register steps per output sample
  for (let i = 0; i < n; i++) {
    phase += clock;
    while (phase >= 1) {
      phase -= 1;
      const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
      reg = (reg >> 1) | (bit << 14);
    }
    out[i] = ((reg & 1) ? -1 : 1) * envelope(i / rate);
  }
  return out;
}

// The console's volume is 4 bits: envelopes go down in 16 steps.
const steps16 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 15) / 15;
const decay = (seconds) => (t) => steps16(Math.exp(-t / seconds * 3));

// A pitch sweeping down on the triangle: the kick (and toms).
function sweep(seconds, from, to, rate = 44100) {
  const n = Math.round(seconds * rate), out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate, f = to + (from - to) * Math.exp(-t / (seconds * 0.25));
    phase = (phase + f / rate) % 1;
    const step = Math.floor(phase * Steps);
    out[i] = Waves.triangle(step) * steps16(1 - t / seconds);
  }
  return out;
}

const mix = (...parts) => {
  const out = new Float32Array(Math.max(...parts.map(([p]) => p.length)));
  for (const [p, g] of parts) for (let i = 0; i < p.length; i++) out[i] += p[i] * g;
  return out;
};

// The drum kit (midi numbers are the hits, as in the recorded kits).
function drumBank() {
  const bank = newBank();
  const hits = {
    36: mix([sweep(0.16, 220, 45), 1], [noise(0.02, 16, false, decay(0.02)), 0.35]),                 // kick
    37: mix([sweep(0.2, 180, 60), 1]),                                                               // tom
    38: mix([noise(0.18, 64, false, decay(0.18)), 0.85], [sweep(0.08, 260, 160), 0.45]),             // snare
    42: noise(0.05, 8, false, decay(0.05), 44100, 7),                                                // closed hat
    46: noise(0.22, 8, false, decay(0.22), 44100, 11),                                               // open hat
    49: noise(0.9, 16, true, decay(0.9), 44100, 3),                                                  // crash (metallic)
  };
  for (const [midi, f] of Object.entries(hits)) {
    const data = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) data[i] = Math.round(f[i] * Full * 0.8);
    addNote(bank, Number(midi), data, 44100);
  }
  finishBank(bank);
  return bank;
}

// The bank of a synthesized instrument (Instruments[].Synth).
export function synthBank(kind) {
  switch (kind) {
    case 'pulse12': return toneBank('pulse12', 36, 108, 0.55);
    case 'pulse25': return toneBank('pulse25', 36, 108, 0.55);
    case 'pulse50': return toneBank('pulse50', 36, 108, 0.5);
    case 'triangle': return toneBank('triangle', 24, 84, 0.9);
    case 'noise': return drumBank();
  }
  throw new Error(kind);
}
