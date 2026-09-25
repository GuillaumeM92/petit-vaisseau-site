// Writes a piece from a seed: a line-by-line port of the game's SongComposer.cs (keep in sync),
// so a number plays the same piece here and in Le Tapis Vert.
//
// The seed first picks a style, then within what that style allows: form and length, tempo, key
// and mode, chord progressions (plain triads), which instrument accompanies and how, which one leads
// each section, the bass, optional layers (string pad, glockenspiel sparkles, harp sweeps, a
// countermelody, soft drums) and the room it is heard in. The melody is built from 2-bar motifs
// that come back when a section returns. Each layer draws from its own random stream, so forcing
// one choice (Overrides) leaves the rest of the piece unchanged.
import { MusicRng } from './rng.js';
import { InstrumentId, InstrumentCount, Instruments } from './instruments.js';
import { AllStyles, StyleWeights, getStyle, AccompPattern, ColorLayer, DrumsMode, MusicMode, MusicStyle } from './styles.js';

export const NoteRole = { Accompaniment: 1, Bass: 2, Pad: 3, Melody: 4, Color: 5, Drums: 6 };

// Choices that replace what the seed would pick. Auto (-1) lets the seed decide; Off (-2) removes an
// optional layer.
export const Auto = -1, Off = -2;
export function defaultOverrides() {
  return { Style: Auto, Form: Auto, Tempo: Auto, Key: Auto, Mode: Auto, ProgressionA: Auto, ProgressionB: Auto,
    Accomp: Auto, Pattern: Auto, LeadA: Auto, LeadB: Auto, Bass: Auto, Pad: Auto, Color: Auto, Drums: Auto, Room: Auto };
}

const ArpGain = 0.099, MelodyGain = 0.105, BassGain = 0.093;

// Tied notes for the winds, the horn, the violin and the cello, whose recorded notes swell in.
export const Settings = { Slurs: true };
const isTied = (id) => id === InstrumentId.Flute || id === InstrumentId.Oboe || id === InstrumentId.Clarinet || id === InstrumentId.Horn
  || id === InstrumentId.Violin || id === InstrumentId.Cello;

const Keys = [0, 2, 3, 5, 7, 8, 9, 10];
const Scales = [
  [0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 9, 10],
  [0, 2, 4, 5, 7, 9, 10], [0, 2, 4, 6, 7, 9, 11],
];
const Pentatonics = [
  [0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 3, 5, 7, 9],
  [0, 2, 4, 7, 10], [0, 2, 4, 6, 9],
];
export const NoteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Everything that can lead or accompany, across all styles.
export const Leads = [InstrumentId.Piano, InstrumentId.Flute, InstrumentId.Violin, InstrumentId.Clarinet, InstrumentId.Oboe,
  InstrumentId.Harp, InstrumentId.Marimba, InstrumentId.Horn, InstrumentId.Cello];
export const Accomps = [InstrumentId.Piano, InstrumentId.Harp, InstrumentId.Marimba, InstrumentId.Strings];

const mod = (a, n) => ((a % n) + n) % n;
const pickOverride = (drawn, overrideValue) => overrideValue >= 0 ? overrideValue : drawn;
const indices = (count) => Array.from({ length: count }, (_, i) => i);
const fround = Math.fround;

// A degree of a progression written for the major scale, read in the piece's mode.
function makeChord(key, degree, mode) {
  const maj = [0, 4, 7], min = [0, 3, 7], sus = [0, 5, 7];
  let offset, triad;
  const M = MusicMode;
  if (degree === 'Vsus') { offset = 7; triad = sus; }
  else if (mode === M.Minor && degree === 'I') { offset = 0; triad = min; }
  else if (mode === M.Minor && degree === 'ii') { offset = 5; triad = min; }
  else if (mode === M.Minor && degree === 'iii') { offset = 3; triad = maj; }
  else if (mode === M.Minor && degree === 'IV') { offset = 5; triad = min; }
  else if (mode === M.Minor && degree === 'V') { offset = 7; triad = min; }
  else if (mode === M.Minor && degree === 'vi') { offset = 8; triad = maj; }
  else if (mode === M.Dorian && degree === 'I') { offset = 0; triad = min; }
  else if (mode === M.Dorian && degree === 'iii') { offset = 3; triad = maj; }
  else if (mode === M.Dorian && degree === 'V') { offset = 7; triad = min; }
  else if (mode === M.Dorian && degree === 'vi') { offset = 10; triad = maj; }
  else if (mode === M.Mixolydian && degree === 'iii') { offset = 7; triad = min; }
  else if (mode === M.Mixolydian && degree === 'V') { offset = 10; triad = maj; }
  else if (mode === M.Lydian && degree === 'ii') { offset = 2; triad = maj; }
  else if (mode === M.Lydian && degree === 'IV') { offset = 2; triad = maj; }
  else if (degree === 'I') { offset = 0; triad = maj; }
  else if (degree === 'ii') { offset = 2; triad = min; }
  else if (degree === 'iii') { offset = 4; triad = min; }
  else if (degree === 'IV') { offset = 5; triad = maj; }
  else if (degree === 'V') { offset = 7; triad = maj; }
  else if (degree === 'vi') { offset = 9; triad = min; }
  else throw new Error(degree);
  const root = (key + offset) % 12;
  const tones = triad.map((t) => (root + t) % 12);
  return {
    root, tones, thirdInterval: triad[1],
    name: NoteNames[root] + (triad[1] === 3 ? 'm' : triad[1] === 5 ? 'sus4' : ''),
    has: (midi) => tones.includes(mod(midi, 12)),
  };
}

// Close-position triad nearest the previous one (smooth chord changes).
function voice(ch, prev, lo = 55, center = 62) {
  let best = null, bestCost = Number.MAX_VALUE;
  for (let mask = 0; mask < 8; mask++) {
    const v = [0, 0, 0];
    for (let i = 0; i < 3; i++) v[i] = lo + mod(ch.tones[i] - lo, 12) + (((mask >> i) & 1) !== 0 ? 12 : 0);
    v.sort((a, b) => a - b);
    if (v[2] - v[0] > 12) continue;
    let cost = Math.abs((v[0] + v[1] + v[2]) / 3.0 - center) * 0.5;
    if (prev) for (let i = 0; i < 3; i++) cost += Math.abs(v[i] - prev[i]);
    if (cost < bestCost) { bestCost = cost; best = v; }
  }
  return best;
}

// A tritone leap sounds harsh: the nearest other note that doesn't make one.
function avoidTritone(candidates, p, previous) {
  let best = p, bestD = Number.MAX_SAFE_INTEGER;
  for (const m of candidates) {
    const d = Math.abs(m - p);
    if (m !== p && Math.abs(m - previous) !== 6 && d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function nearest(candidates, target) {
  let best = target, bestD = Number.MAX_SAFE_INTEGER;
  for (const m of candidates) {
    const d = Math.abs(m - target);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

const arpPan = (midi) => Math.min(Math.max(-0.25 + 0.5 * ((midi - 48) / 30), -0.4), 0.4);

// The style a seed plays in, without composing it (its first draw, as in compose).
export const styleOf = (seed) => new MusicRng(seed).pickWeighted(AllStyles, StyleWeights);

export function compose(seed, overrides) {
  const o = { ...defaultOverrides(), ...(overrides || {}) };
  const plan = new MusicRng(seed);
  const song = { seed, uses: new Array(InstrumentCount).fill(false) };

  // ---- plan (every draw always happens, then an override may replace it)
  song.style = pickOverride(plan.pickWeighted(AllStyles, StyleWeights), o.Style);
  const style = getStyle(song.style);
  const bpb = song.beatsPerBar = style.BeatsPerBar;
  song.key = pickOverride(plan.pick(Keys), o.Key);
  song.tempo = pickOverride(plan.range(style.TempoMin, style.TempoMax + 1), o.Tempo);
  song.progressionA = pickOverride(plan.range(0, style.ProgressionsA.length), o.ProgressionA) % style.ProgressionsA.length;
  song.progressionB = pickOverride(plan.range(0, style.ProgressionsB.length), o.ProgressionB) % style.ProgressionsB.length;
  song.form = style.Forms[pickOverride(plan.pickWeighted(indices(style.Forms.length), style.FormWeights), o.Form) % style.Forms.length];
  const longIntro = plan.nextDouble() < style.LongIntroChance;
  song.accomp = pickOverride(plan.pickWeighted(style.Accomps, style.AccompWeights), o.Accomp);
  const pattern = plan.pickWeighted(style.Patterns, style.PatternWeights);
  song.pattern = o.Pattern >= 0 ? o.Pattern : song.accomp === InstrumentId.Strings ? AccompPattern.Held : pattern;
  const leadA = plan.pickWeighted(style.Leads, style.LeadWeights);
  const leadBSame = plan.nextDouble() < 0.5;
  const leadBAlt = plan.pickWeighted(style.Leads, style.LeadWeights);
  const leadA2Same = plan.nextDouble() < 0.7;
  const bassRoll = plan.nextDouble();
  const bassInIntro = plan.nextDouble() < 0.5;
  const padOn = plan.nextDouble() < style.PadChance;
  const color = plan.pickWeighted(style.Colors, style.ColorWeights);
  const drums = plan.pickWeighted(style.Drums, style.DrumWeights);

  // A lead that isn't the accompanying instrument (except the piano, which can do both).
  const avoid = (lead) => lead === song.accomp && lead !== InstrumentId.Piano ? InstrumentId.Piano : lead;
  song.leadA = pickOverride(avoid(leadA), o.LeadA);
  song.leadB = pickOverride(leadBSame ? song.leadA : avoid(leadBAlt), o.LeadB);
  song.leadA2 = leadA2Same ? song.leadA : song.leadB;
  let bass = bassRoll < style.NoBassChance ? null
    : bassRoll < style.NoBassChance + style.CelloBassChance ? InstrumentId.Cello : InstrumentId.Bass;
  if (o.Bass === Off) bass = null;
  else if (o.Bass >= 0) bass = o.Bass;
  song.hasBass = bass !== null;
  song.bass = bass ?? InstrumentId.Bass;
  song.pad = o.Pad === Off ? -1
    : o.Pad >= 0 ? o.Pad
    : padOn && song.accomp !== InstrumentId.Strings ? InstrumentId.Strings : -1;
  song.color = o.Color === Off ? ColorLayer.None : pickOverride(color, o.Color);
  song.drums = o.Drums === Off ? DrumsMode.None : pickOverride(drums, o.Drums);

  // Mode and room on their own streams.
  const modeRng = new MusicRng(seed * 31 + 5);
  song.mode = pickOverride(modeRng.pickWeighted(style.Modes, style.ModeWeights), o.Mode);
  const roomRng = new MusicRng(seed * 31 + 6);
  song.room = pickOverride(roomRng.pickWeighted(style.Rooms, style.RoomWeights), o.Room);

  const beat = 60.0 / song.tempo;
  song.barSeconds = beat * bpb;

  // ---- form
  const degrees = [];
  const sections = [];
  let aCount = 0, bCount = 0;
  for (const kind of song.form) {
    const start = degrees.length;
    switch (kind) {
      case 'I': degrees.push(...(longIntro ? style.LongIntro : style.Intro)); sections.push({ label: 'Intro', bar: start, kind }); break;
      case 'A': degrees.push(...style.ProgressionsA[song.progressionA]); sections.push({ label: 'A' + "'".repeat(aCount++), bar: start, kind }); break;
      case 'B': degrees.push(...style.ProgressionsB[song.progressionB]); sections.push({ label: 'B' + "'".repeat(bCount++), bar: start, kind }); break;
      default: degrees.push(...style.Outro); sections.push({ label: 'Outro', bar: start, kind }); break;
    }
  }
  const bars = degrees.length;
  const chords = degrees.map((d) => makeChord(song.key, d, song.mode));
  song.chordNames = chords.map((c) => c.name);
  song.sections = sections.map((s) => ({ label: s.label, bar: s.bar }));
  song.length = bars * song.barSeconds;
  const aStart = sections.find((s) => s.kind === 'A').bar;
  const bStart = sections.find((s) => s.kind === 'B').bar;
  const outroStart = [...sections].reverse().find((s) => s.kind === 'O').bar;

  const notes = [];
  let role = 0;

  function add(human, beats, instrument, midi, durationBeats, gain, pan = null, send = null, slur = false) {
    const info = Instruments[instrument];
    const time = beats * beat + (human ? human.normal() * 0.005 : 0);
    notes.push({
      time: Math.max(0, time), instrument, midi, duration: fround(durationBeats * beat),
      gain: fround(gain), pan: pan ?? info.Pan, send: send ?? info.Send, role, slur,
    });
    song.uses[instrument] = true;
  }

  const velocity = (v) => fround(Math.pow(v, 1.4));

  // ---- accompaniment
  role = NoteRole.Accompaniment;
  const acc = new MusicRng(seed * 31 + 1);
  const accGain = fround(ArpGain * (song.accomp === InstrumentId.Marimba ? 0.8 : 1));
  let prevVoicing = null, prevLow = null;
  for (let b = 0; b < bars; b++) {
    const ch = chords[b];
    const t0 = b * bpb;
    const last = b === bars - 1;
    const lo = 48 + mod(ch.root - 48, 12);
    const arp = [lo, lo + 7, lo + 12, lo + 12 + ch.thirdInterval, lo + 19];
    const voicing = voice(ch, prevVoicing);
    prevVoicing = voicing;
    if (song.pattern === AccompPattern.Held) {
      for (const m of voicing)
        add(acc, t0, song.accomp, m, last ? bpb : bpb + 0.05, 0.0215 * velocity(0.6 + 0.1 * acc.nextDouble()), arpPan(m));
      continue;
    }
    if (last) {
      for (let j = 0; j < 4; j++)
        add(acc, t0 + j * 0.12, song.accomp, arp[j], bpb, accGain * velocity(0.5), arpPan(arp[j]));
      continue;
    }
    switch (song.pattern) {
      case AccompPattern.Arpeggio: {
        const order = bpb === 3 ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 3, 4, 3, 2, 1];
        for (let k = 0; k < order.length; k++) {
          const v = (k === 0 ? 0.5 : 0.38) + 0.06 * acc.nextDouble();
          add(acc, t0 + k / 2.0, song.accomp, arp[order[k]], 1.4, accGain * velocity(v), arpPan(arp[order[k]]));
        }
        break;
      }
      case AccompPattern.SlowArpeggio:
        for (let k = 0; k < bpb; k++) {
          const v = (k === 0 ? 0.5 : 0.42) + 0.06 * acc.nextDouble();
          add(acc, t0 + k, song.accomp, arp[k], 2.2, accGain * velocity(v), arpPan(arp[k]));
        }
        break;
      case AccompPattern.Rolled: {
        const rolled = [lo, lo + 7, lo + 12 + ch.thirdInterval, lo + 19];
        for (let half = 0; half < (bpb === 4 ? 2 : 1); half++)
          for (let j = 0; j < rolled.length; j++) {
            const v = (half === 0 ? 0.5 : 0.4) + 0.05 * acc.nextDouble();
            add(acc, t0 + half * 2 + j * 0.08, song.accomp, rolled[j], bpb === 4 ? 1.9 : 2.9, accGain * 0.8 * velocity(v), arpPan(rolled[j]));
          }
        break;
      }
      case AccompPattern.Waltz:
        // "Oom-pah-pah": the bass has the first beat, the chord answers on the others.
        for (let k = 1; k < bpb; k++)
          for (const m of voicing)
            add(acc, t0 + k, song.accomp, m, 0.8, accGain * 0.5 * velocity((k === 1 ? 0.48 : 0.42) + 0.05 * acc.nextDouble()), arpPan(m));
        break;
      case AccompPattern.Alberti: {
        // Classical broken chord: low, high, middle, high, in eighths.
        const low = voice(ch, prevLow, 48, 55);
        prevLow = low;
        const alberti = [0, 2, 1, 2];
        for (let k = 0; k < bpb * 2; k++) {
          const v = (k === 0 ? 0.5 : 0.4) + 0.05 * acc.nextDouble();
          add(acc, t0 + k / 2.0, song.accomp, low[alberti[k % 4]], 0.9, accGain * 0.85 * velocity(v), arpPan(low[alberti[k % 4]]));
        }
        break;
      }
    }
  }

  // ---- bass
  role = NoteRole.Bass;
  const bassRng = new MusicRng(seed * 31 + 2);
  if (song.hasBass) {
    const slow = song.style === MusicStyle.Relaxing || song.style === MusicStyle.Contemplative;
    for (let b = bassInIntro ? 0 : aStart; b < bars; b++) {
      const ch = chords[b];
      const t0 = b * bpb;
      const last = b === bars - 1;
      let root = 36 + mod(ch.root - 36, 12);
      if (song.bass === InstrumentId.Cello) {
        add(bassRng, t0, InstrumentId.Cello, root, last ? bpb : bpb - 0.1, 0.061 * velocity(0.75));
        continue;
      }
      if (root > 45) root -= 12;
      const fifth = root + 7;
      // Plucked: each note rings until the next one.
      if (bpb === 3 || slow || last) {
        add(bassRng, t0, InstrumentId.Bass, root, last ? bpb : bpb + 0.02, BassGain * velocity(0.8));
        continue;
      }
      add(bassRng, t0, InstrumentId.Bass, root, 2.02, BassGain * velocity(0.8));
      add(bassRng, t0 + 2, InstrumentId.Bass, bassRng.nextDouble() < 0.5 ? root : fifth, 2.02, BassGain * velocity(0.68));
    }
  }

  // ---- string pad
  role = NoteRole.Pad;
  if (song.pad >= 0) {
    let prev = null;
    for (let b = 0; b < bars; b++) {
      const v = voice(chords[b], prev, 52, 60);
      prev = v;
      for (const m of v) add(null, b * bpb, song.pad, m, b === bars - 1 ? bpb : bpb + 0.05, 0.0085);
    }
  }

  // ---- melody: 2-bar motifs, each section's motifs coming back when the section returns.
  role = NoteRole.Melody;
  const mel = new MusicRng(seed * 31 + 3);
  const span = 2 * bpb * 2; // two bars, in eighths
  const center = mel.pickWeighted([68, 72, 76], [0.3, 0.45, 0.25]);
  const lowest = center - 8, highest = center + 11;
  const leapChance = 0.06 + 0.22 * mel.nextDouble();
  const cellA = mel.pickWeighted(indices(style.RhythmCells.length), style.RhythmCellWeights);
  const cellB = mel.pickWeighted(indices(style.RhythmCells.length), style.RhythmCellWeights);
  const scale = [];
  const scaleDegrees = style.Diatonic ? Scales[song.mode] : Pentatonics[song.mode];
  for (let m = 55; m < 95; m++) if (scaleDegrees.includes(mod(m - song.key, 12))) scale.push(m);

  function newMotif() {
    const motif = { onsets: [], durations: [], moves: [] };
    let pos = bpb === 3 ? 0 : mel.pick([0, 2]);
    while (pos < span - 4) {
      const cell = style.RhythmCells[mel.nextDouble() < 0.65 ? cellA : cellB];
      for (const step of cell) {
        if (pos >= span - 4) break;
        motif.onsets.push(pos);
        pos += step;
      }
    }
    for (let i = 0; i < motif.onsets.length; i++)
      motif.durations.push(i + 1 < motif.onsets.length ? motif.onsets[i + 1] - motif.onsets[i] : span - motif.onsets[i] - 1);
    motif.moves.push(0);
    const limit = style.Diatonic ? 4 : 3; // a leap of up to a fifth / sixth
    let last = 0;
    for (let i = 1; i < motif.onsets.length; i++) {
      let move;
      if (Math.abs(last) >= 3 && mel.nextDouble() < 0.75)
        move = -Math.sign(last) * mel.pickWeighted([1, 2], [0.7, 0.3]); // fill the leap back in
      else if (mel.nextDouble() < leapChance)
        move = mel.pick([-1, 1]) * mel.range(3, limit + 1);
      else
        move = mel.pickWeighted([-2, -1, 1, 2, 0], [0.15, 0.3, 0.3, 0.15, 0.1]);
      motif.moves.push(move);
      last = move;
    }
    return motif;
  }

  // The same rhythm, the line turned upside down: an answer to the motif.
  const answer = (motif) => ({ onsets: motif.onsets, durations: motif.durations, moves: motif.moves.map((m) => -m) });

  let previous = -1; // the last melody note, across motifs
  function realize(motif, bar0, target, resolve, lead) {
    const shift = Instruments[lead].MelodyShift;
    let p = -1, first = -1;
    const count = motif.onsets.length;
    for (let i = 0; i < count; i++) {
      const e = motif.onsets[i], d = motif.durations[i], move = motif.moves[i];
      const beats = bar0 * bpb + e / 2.0;
      const ch = chords[Math.min(Math.trunc(beats / bpb), bars - 1)];
      if (p < 0) {
        const tones = scale.filter((m) => ch.has(m) && m >= lowest && m <= highest);
        p = nearest(tones, target);
        if (previous >= 0 && Math.abs(p - previous) === 6) p = avoidTritone(tones, p, previous);
      } else {
        let j = scale.indexOf(nearest(scale, p)) + move;
        if (j < 0 || j >= scale.length || scale[j] < lowest || scale[j] > highest) j -= 2 * move;
        p = scale[Math.min(Math.max(j, 0), scale.length - 1)];
      }
      const strong = e % (bpb * 2) === 0 || d >= 4 || i === count - 1;
      if (strong) {
        const toRoot = resolve && i === count - 1;
        const pool = [];
        for (let m = lowest - 2; m < highest + 3; m++)
          if (toRoot ? mod(m, 12) === ch.root : ch.has(m)) pool.push(m);
        p = nearest(pool, p);
        if (previous >= 0 && Math.abs(p - previous) === 6 && !toRoot) p = avoidTritone(pool, p, previous);
      } else if (previous >= 0 && Math.abs(p - previous) === 6) p = avoidTritone(scale, p, previous);
      previous = p;
      const v = 0.6 + (d >= 4 ? 0.1 : 0) + 0.1 * mel.nextDouble();
      // A wind (or a bowed string) plays a motif in one breath (bow): each note but the first is
      // tied to the previous one, which is held until it (the mixer then fades it out).
      const tied = Settings.Slurs && isTied(lead);
      const held = tied && i + 1 < count ? d / 2.0 + 0.1 : d / 2.0 * 0.95;
      add(mel, beats, lead, p + shift, held, MelodyGain * velocity(v), null, null, tied && i > 0);
      if (first < 0) first = p;
    }
    return first;
  }

  // How the 8 bars of a section use its two motifs (the last one resolving).
  const phrasePlans = [
    [[0, 0], [0, 0], [1, 0], [0, 0]], [[0, 0], [1, 0], [0, 0], [1, 0]],
    [[0, 0], [0, 3], [1, 0], [1, 0]], [[0, 0], [1, 0], [1, 0], [0, 0]],
  ];
  const planWeights = [0.35, 0.25, 0.2, 0.2];
  const planA = phrasePlans[mel.pickWeighted(indices(4), planWeights)];
  const planB = phrasePlans[mel.pickWeighted(indices(4), planWeights)];

  let melodyTarget = center;
  let motifsA = null, motifsB = null;
  let firstA = true;
  for (const { bar: bar0, kind } of sections) {
    if (kind !== 'A' && kind !== 'B') continue;
    let lead, m1, m2;
    if (kind === 'A') {
      lead = firstA ? song.leadA : song.leadA2;
      firstA = false;
      if (!motifsA) {
        const first = newMotif();
        motifsA = [first, mel.nextDouble() < 0.5 ? answer(first) : newMotif()];
      }
      [m1, m2] = motifsA;
    } else {
      lead = song.leadB;
      if (!motifsB) {
        const first = newMotif();
        motifsB = [first, mel.nextDouble() < 0.5 ? answer(first) : newMotif()];
      }
      [m1, m2] = motifsB;
    }
    const phrasePlan = kind === 'A' ? planA : planB;
    for (let k = 0; k < 4; k++) {
      const [which, climb] = phrasePlan[k];
      const start = realize(which === 0 ? m1 : m2, bar0 + 2 * k, melodyTarget + climb, k === 3, lead);
      melodyTarget = Math.min(Math.max(start + mel.pick([-2, 0, 2]), center - 5), center + 7);
    }
  }

  // ---- color layer: in the B sections and when A comes back
  role = NoteRole.Color;
  const col = new MusicRng(seed * 31 + 4);
  const colorSections = sections.filter((s) => s.kind === 'B' || (s.kind === 'A' && s.bar !== aStart));
  for (const { bar: bar0, kind } of colorSections) {
    switch (song.color) {
      case ColorLayer.Sparkles:
        for (let b = bar0; b < bar0 + 8; b += 2) {
          const ch = chords[b];
          const m = 79 + mod(ch.root - 79, 12);
          const up = [m, m + ch.thirdInterval, m + 7];
          for (let j = 0; j < 3; j++)
            add(col, b * bpb + j * 0.5, InstrumentId.Glockenspiel, up[j], 1.5, 0.085 * velocity(0.5 + 0.1 * col.nextDouble()));
        }
        break;
      case ColorLayer.HarpSweep: {
        const ch = chords[bar0];
        const sweep = [];
        for (let m = 55; m <= 86 && sweep.length < 8; m++) if (ch.has(m)) sweep.push(m);
        for (let j = 0; j < sweep.length; j++)
          add(col, bar0 * bpb - 2 + j * 0.25, InstrumentId.Harp, sweep[j], 2.5, 0.05 * velocity(0.4 + 0.05 * j));
        break;
      }
      case ColorLayer.Countermelody: {
        if (kind !== 'B') break;
        const v = (song.bass === InstrumentId.Cello && song.hasBass) || song.leadB === InstrumentId.Cello ? InstrumentId.Horn : InstrumentId.Cello;
        let line = 55;
        for (let b = bar0; b < bar0 + 8; b++) {
          const ch = chords[b];
          const halves = bpb === 4 ? 2 : 1;
          for (let half = 0; half < halves; half++) {
            const pool = [];
            for (let m = 50; m <= 64; m++) if (ch.has(m) && m !== line) pool.push(m);
            line = nearest(pool, line + (half === 0 ? 0 : col.pick([-2, 2])));
            add(col, b * bpb + half * 2, v, line, bpb === 4 ? 1.95 : 2.9, 0.06 * velocity(0.6));
          }
        }
        break;
      }
    }
  }

  // ---- soft drums (recorded orchestral bass drum and snare taps, two takes each in turn)
  role = NoteRole.Drums;
  if (song.drums !== DrumsMode.None) {
    for (let b = song.drums === DrumsMode.FromA ? aStart : bStart; b <= outroStart && b < bars - 1; b++) {
      const t0 = b * bpb;
      if (bpb === 3) {
        add(null, t0, InstrumentId.Kick, 36 + b % 2, 0, 0.15);
        add(null, t0 + 1, InstrumentId.Tap, 60 + b % 2, 0, 0.04);
        add(null, t0 + 2, InstrumentId.Tap, 61 - b % 2, 0, 0.045);
      } else if (style.SparseDrums) {
        add(null, t0, InstrumentId.Kick, 36 + b % 2, 0, 0.13);
        add(null, t0 + 2, InstrumentId.Tap, 60 + b % 2, 0, 0.045);
      } else {
        add(null, t0, InstrumentId.Kick, 36, 0, 0.16);
        add(null, t0 + 2, InstrumentId.Kick, 37, 0, 0.12);
        add(null, t0 + 1, InstrumentId.Tap, 60 + b % 2, 0, 0.05);
        add(null, t0 + 3, InstrumentId.Tap, 61 - b % 2, 0, 0.06);
      }
    }
  }

  notes.sort((a, b) => a.time - b.time);
  song.notes = notes;
  return song;
}
