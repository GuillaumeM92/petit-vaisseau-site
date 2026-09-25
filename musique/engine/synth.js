// Synthesized instruments, made into note banks when first needed (no file to download): the voices of
// an 8-bit console (the chiptune universe) and the ambient universe's pad, glass, soft voice and drone.
// The console's tone notes are one period of 32 steps, like its sequencers, stored at the sample rate
// that makes that period exact (f × 32) and looped on it: always in tune, a loop that never clicks.
// The mixer plays them like the recorded ones.
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

// ---------------- the ambient universe's instruments ----------------

// One cycle of a wave made of these harmonics' amplitudes, in a table read with interpolation.
function cycle(amps, size = 4096) {
  const t = new Float32Array(size + 1);
  for (let i = 0; i <= size; i++) {
    let v = 0;
    for (let h = 0; h < amps.length; h++) v += amps[h] * Math.sin(2 * Math.PI * (h + 1) * i / size);
    t[i] = v;
  }
  return t;
}
const read = (t, phase) => { const x = phase * (t.length - 1), i = x | 0; return t[i] + (t[i + 1] - t[i]) * (x - i); };

// Stores a note at the common level (its RMS over [from, to) matched), looped over all of it when `loop`.
function store(bank, midi, f, rate, loop, from = 0, to = f.length) {
  let e = 0;
  for (let i = from; i < to; i++) e += f[i] * f[i];
  const scale = Full * 0.35 / Math.sqrt(e / (to - from));
  const data = new Int16Array(f.length + (loop ? 1 : 0));
  for (let i = 0; i < f.length; i++) data[i] = Math.round(f[i] * scale);
  if (loop) data[f.length] = data[0];
  addNote(bank, midi, data, rate, 0, loop ? f.length : 0);
}

// The pad: three voices of a soft saw a few cents apart and a quiet octave above, breathing slowly.
// The loop lasts exactly 4 s and every voice makes a whole number of cycles in it (its frequency is
// rounded to a quarter of a hertz: under 4 cents off), so it loops without a seam.
function padBank() {
  const bank = newBank(), rate = 22050, T = 4, n = rate * T;
  for (let midi = 36; midi <= 84; midi += 3) {
    // a soft saw, its harmonics stopping below half the sample rate (no aliasing), even an octave up
    const top = Math.floor((rate / 2 - 1500) / (freq(midi + 12) * 1.01));
    const saw = cycle(Array.from({ length: Math.min(14, top) }, (_, h) => Math.pow(h + 1, -1.6) * Math.exp(-h / 7)));
    const voices = [[-7, 1], [6, 1], [0, 0.8], [1202, 0.22]].map(([cents, g]) => [Math.round(freq(midi) * Math.pow(2, cents / 1200) * T) / T, g]);
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      let v = 0;
      for (const [hz, g] of voices) v += g * read(saw, (hz * t) % 1);
      f[i] = v * (1 + 0.08 * Math.sin(2 * Math.PI * t / 2)); // a slow breath, two per loop
    }
    store(bank, midi, f, rate, true);
  }
  finishBank(bank);
  return bank;
}

// Glass: a soft bell whose partials (slightly stretched, like a real one) die away one after another.
function glassBank() {
  const bank = newBank(), rate = 32000, n = rate * 4;
  const partials = [[1, 1, 3.2], [2, 0.3, 1.7], [3.01, 0.14, 1.1], [4.07, 0.1, 0.6], [5.43, 0.05, 0.4]];
  for (let midi = 60; midi <= 99; midi += 3) {
    const f = new Float32Array(n);
    for (const [ratio, g, tau] of partials) {
      const hz = freq(midi) * ratio;
      if (hz > rate / 2 - 1000) continue;
      for (let i = 0; i < n; i++) f[i] += g * Math.sin(2 * Math.PI * hz * i / rate) * Math.exp(-i / rate / tau);
    }
    for (let i = 0; i < 128; i++) f[i] *= i / 128; // a soft strike
    store(bank, midi, f, rate, false, 0, Math.round(rate * 0.6)); // level matched on the strike
  }
  finishBank(bank);
  return bank;
}

// A sine with a little of its harmonics, one exact period per note (as the console's): the soft voice
// and the deep drone.
function sineBank(lo, hi, amps) {
  const bank = newBank(), wave = cycle(amps, 64);
  for (let midi = lo; midi <= hi; midi++) {
    const f = new Float32Array(64);
    for (let i = 0; i < 64; i++) f[i] = wave[i];
    store(bank, midi, f, Math.round(freq(midi) * 64), true);
  }
  finishBank(bank);
  return bank;
}

// The bank of a synthesized instrument (Instruments[].Synth).
export function synthBank(kind) {
  switch (kind) {
    case 'pad': return padBank();
    case 'glass': return glassBank();
    case 'soft': return sineBank(52, 91, [1, 0.12, 0.05, 0.02]);
    case 'sub': return sineBank(24, 60, [1, 0.1]);
    case 'pulse12': return toneBank('pulse12', 36, 108, 0.55);
    case 'pulse25': return toneBank('pulse25', 36, 108, 0.55);
    case 'pulse50': return toneBank('pulse50', 36, 108, 0.5);
    case 'triangle': return toneBank('triangle', 24, 84, 0.9);
    case 'noise': return drumBank();
  }
  throw new Error(kind);
}
