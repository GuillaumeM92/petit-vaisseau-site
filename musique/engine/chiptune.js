// The chiptune style (style 7, only on the site): video game music from an 8-bit console. A pulse wave
// sings the theme in quick motifs, another plays the chords as the console's very fast arpeggios (or
// broken, or on the offbeats), the triangle jumps octaves in the bass, the noise channel drums. The
// theme comes back with a second voice a third below; the bridge changes colour; the end is short.
//
// Same principles as the other styles: a seed decides everything, each layer has its own random
// stream, 2-bar motifs come back with their section, plain triads and no semitone against the chord.
// Timing is exact (no humanizing): a console plays on its frames.
import { MusicRng } from './rng.js';
import { InstrumentId as I, InstrumentCount, Instruments } from './instruments.js';
import { MusicMode, MusicRoom, MusicStyle } from './styles.js';

const Role = { Accompaniment: 1, Bass: 2, Pad: 3, Melody: 4, Color: 5, Drums: 6 }; // composer.js NoteRole

const Keys = [0, 2, 3, 5, 7, 8, 9, 10];
const NoteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const Scales = { [MusicMode.Major]: [0, 2, 4, 5, 7, 9, 11], [MusicMode.Minor]: [0, 2, 3, 5, 7, 8, 10], [MusicMode.Dorian]: [0, 2, 3, 5, 7, 9, 10] };
const Degrees = {
  I: [0, 4], i: [0, 3], ii: [2, 3], iii: [4, 3], bIII: [3, 4], IV: [5, 4], iv: [5, 3], V: [7, 4], v: [7, 3],
  bVI: [8, 4], vi: [9, 3], bVII: [10, 4],
};

// 4-bar progressions, played twice in a section (A: the theme, B: the bridge).
const Progressions = {
  [MusicMode.Major]: {
    A: [['I', 'V', 'vi', 'IV'], ['I', 'IV', 'V', 'IV'], ['I', 'vi', 'IV', 'V'], ['I', 'iii', 'IV', 'V'], ['I', 'bVII', 'IV', 'I']],
    B: [['IV', 'V', 'iii', 'vi'], ['vi', 'IV', 'I', 'V'], ['ii', 'V', 'I', 'vi'], ['IV', 'IV', 'V', 'V'], ['bVI', 'bVII', 'I', 'I']],
  },
  [MusicMode.Minor]: {
    A: [['i', 'bVI', 'bVII', 'i'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'iv', 'bVII', 'bIII'], ['i', 'bVI', 'bIII', 'bVII'], ['i', 'i', 'bVI', 'bVII']],
    B: [['bVI', 'bVII', 'i', 'i'], ['iv', 'bVII', 'bIII', 'bVI'], ['bIII', 'bVII', 'iv', 'V'], ['bVI', 'bIII', 'bVII', 'V']],
  },
  [MusicMode.Dorian]: {
    A: [['i', 'IV', 'i', 'IV'], ['i', 'bVII', 'IV', 'i'], ['i', 'IV', 'bVII', 'i']],
    B: [['bIII', 'IV', 'i', 'i'], ['bVII', 'IV', 'bIII', 'IV'], ['iv', 'bVII', 'i', 'i']],
  },
};

// Rhythm cells of the theme, in sixteenths.
const Cells = [[2, 2, 2, 2], [4, 2, 2], [3, 3, 2], [2, 1, 1, 2, 2], [4, 4], [6, 2], [1, 1, 2, 4], [2, 2, 4]];
const CellWeights = [0.18, 0.16, 0.14, 0.1, 0.12, 0.1, 0.1, 0.1];

// Drum patterns, one bar in sixteenths: [slot, hit] (36 kick, 38 snare, 42 closed hat, 46 open hat).
const hats = (every, from = 0) => Array.from({ length: 16 / every }, (_, i) => [from + i * every, 42]);
const DrumPatterns = [
  { name: 'rock', hits: [[0, 36], [8, 36], [10, 36], [4, 38], [12, 38], ...hats(2)] },
  { name: 'drive', hits: [[0, 36], [6, 36], [8, 36], [14, 36], [4, 38], [12, 38], ...hats(4, 2), [14, 46]] },
  { name: 'shuffle', hits: [[0, 36], [7, 36], [10, 36], [4, 38], [12, 38], ...hats(4), [6, 42], [14, 46]] },
  { name: 'half', hits: [[0, 36], [10, 36], [8, 38], ...hats(2)] },
];

const mod = (a, n) => ((a % n) + n) % n;
const fround = Math.fround;
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const nearest = (candidates, target) => candidates.reduce((b, m) => Math.abs(m - target) < Math.abs(b - target) ? m : b, candidates[0]);
const lowRoot = (ch, lo) => lo + mod(ch.root - lo, 12);

function chordOf(key, degree) {
  const [offset, third] = Degrees[degree];
  const root = (key + offset) % 12;
  const tones = [root, (root + third) % 12, (root + 7) % 12];
  return { root, tones, thirdInterval: third, name: NoteNames[root] + (third === 3 ? 'm' : ''), has: (m) => tones.includes(mod(m, 12)) };
}

export const ChiptuneTempo = [116, 156];
export const ChiptuneLeads = [I.Pulse25, I.Pulse12, I.Square];

export function composeChiptune(seed, o) {
  const plan = new MusicRng(seed);
  const song = { seed, style: MusicStyle.Chiptune, uses: new Array(InstrumentCount).fill(false), beatsPerBar: 4 };
  const pick = (drawn, value) => value >= 0 ? value : drawn;

  // ---- plan
  song.key = pick(plan.pick(Keys), o.Key);
  const tempo = plan.range(ChiptuneTempo[0], ChiptuneTempo[1] + 1);
  song.tempo = o.TempoFeel === 's' ? ChiptuneTempo[0] : o.TempoFeel === 'f' ? ChiptuneTempo[1]
    : o.Tempo >= 0 ? Math.min(Math.max(o.Tempo, ChiptuneTempo[0]), ChiptuneTempo[1]) : tempo;
  const mode = plan.pickWeighted([MusicMode.Major, MusicMode.Minor, MusicMode.Dorian], [0.45, 0.4, 0.15]);
  song.mode = o.Mode >= 0 ? (o.Mode === MusicMode.Minor ? MusicMode.Minor : o.Mode === MusicMode.Dorian ? MusicMode.Dorian : MusicMode.Major) : mode;
  const P = Progressions[song.mode];
  const progA = P.A[plan.range(0, P.A.length)], progB = P.B[plan.range(0, P.B.length)];
  song.form = plan.pickWeighted(['IAABAABO', 'IAABCAAO', 'IABABCAO'], [0.35, 0.35, 0.3]);
  const longIntro = plan.nextDouble() < 0.4;
  song.leadA = pick(plan.pickWeighted(ChiptuneLeads, [0.45, 0.35, 0.2]), o.LeadA);
  const leadBSame = plan.nextDouble() < 0.5;
  const accompPattern = plan.pickWeighted(['arp', 'broken', 'offbeat'], [0.45, 0.3, 0.25]);
  const echo = plan.nextDouble() < 0.45;
  const bassPattern = plan.pickWeighted(['octaves', 'drive', 'walk', 'syncop'], [0.35, 0.25, 0.2, 0.2]);
  const drumPattern = DrumPatterns[plan.pickWeighted(range(DrumPatterns.length, (i) => i), [0.35, 0.25, 0.2, 0.2])];
  const drumsOn = o.Drums === -2 ? false : o.Drums >= 0 || plan.nextDouble() < 0.88;
  song.room = pick(MusicRoom.Dry, o.Room);
  // the other pulse accompanies; the B section may hand the theme to it
  const others = ChiptuneLeads.filter((l) => l !== song.leadA);
  const accomp = others[0];
  song.leadB = leadBSame ? song.leadA : others[1];
  song.accomp = accomp; song.leadA2 = song.leadA; song.hasBass = true; song.bass = I.Triangle; song.pad = -1;
  song.plan = { accomp: accompPattern, echo, bass: bassPattern, drums: drumsOn ? drumPattern.name : 'none' };

  const bpb = 4, beat = 60 / song.tempo;
  song.barSeconds = beat * bpb;

  // ---- form
  const degrees = [], sections = [];
  let aCount = 0, bCount = 0;
  for (const kind of song.form) {
    const bar = degrees.length;
    if (kind === 'I') { degrees.push(...(longIntro ? progA : progA.slice(0, 2))); sections.push({ label: 'Intro', bar, kind, n: 0, len: longIntro ? 4 : 2 }); }
    else if (kind === 'A') { degrees.push(...progA, ...progA); sections.push({ label: 'A' + "'".repeat(aCount), bar, kind, n: aCount++, len: 8 }); }
    else if (kind === 'B') { degrees.push(...progB, ...progB); sections.push({ label: 'B' + "'".repeat(bCount), bar, kind, n: bCount++, len: 8 }); }
    else if (kind === 'C') { degrees.push(...progB, ...progB); sections.push({ label: 'C', bar, kind, n: 0, len: 8 }); }
    else { degrees.push(progA[0], progA[0]); sections.push({ label: 'Outro', bar, kind, n: 0, len: 2 }); }
  }
  const bars = degrees.length;
  const chords = degrees.map((d) => chordOf(song.key, d));
  song.chordNames = chords.map((c) => c.name);
  song.sections = sections.map((s) => ({ label: s.label, bar: s.bar }));
  song.length = bars * song.barSeconds;
  const sectionAt = [];
  for (const s of sections) for (let b = s.bar; b < s.bar + s.len; b++) sectionAt[b] = s;
  const outroBar = sections[sections.length - 1].bar;

  const notes = [];
  let role = 0;
  const Level = 1;
  function add(sixteenths, instrument, midi, durationSixteenths, gain, extra = null) {
    const info = Instruments[instrument];
    const note = { time: sixteenths * beat / 4, instrument, midi, duration: fround(durationSixteenths * beat / 4),
      gain: fround(gain * Level), pan: info.Pan, send: info.Send, role, slur: false };
    if (extra) Object.assign(note, extra);
    notes.push(note);
    song.uses[instrument] = true;
  }

  // ---- accompaniment: the chord, on the second pulse
  role = Role.Accompaniment;
  for (let b = 0; b < bars; b++) {
    const s = sectionAt[b], ch = chords[b], t0 = b * 16;
    const r = lowRoot(ch, 60);
    const triad = [r, r + ch.thirdInterval, r + 7];
    if (b === outroBar + 1) break;
    if (b === outroBar) { // the last chord, held
      for (const m of triad) add(t0, accomp, m, 24, 0.028);
      break;
    }
    const intro = s.kind === 'I' && !longIntro; // a short intro is drums and bass only
    if (intro) continue;
    const g = s.kind === 'C' ? 0.05 : 0.042;
    if (accompPattern === 'arp' || s.kind === 'C') {
      // the console's chord: cycling through its notes every 32nd
      const cycle = [0, 1, 2, 1];
      for (let k = 0; k < 32; k++) add(t0 + k / 2, accomp, (k % 8 < 4 ? triad : triad.map((m) => m + 12))[cycle[k % 4]] , 0.5, g);
    } else if (accompPattern === 'broken') {
      const order = [0, 2, 1, 2, 0, 2, 1, 2];
      for (let k = 0; k < 16; k++) add(t0 + k, accomp, triad[order[k % 8]] + (k >= 8 && k % 2 ? 12 : 0), 0.9, g * (k % 4 === 0 ? 1 : 0.8));
    } else {
      // chords on the offbeats, short
      for (let k = 2; k < 16; k += 4) for (const m of triad) add(t0 + k, accomp, m, 1.2, g * 0.45);
    }
  }

  // ---- bass: the triangle
  role = Role.Bass;
  for (let b = 0; b < bars; b++) {
    const s = sectionAt[b], ch = chords[b], t0 = b * 16;
    const r = lowRoot(ch, 36);
    if (b === outroBar + 1) break;
    if (b === outroBar) { add(t0, I.Triangle, r, 24, 0.085); break; }
    const g = 0.08;
    switch (s.kind === 'C' ? 'walk' : bassPattern) {
      case 'octaves': for (let k = 0; k < 16; k += 2) add(t0 + k, I.Triangle, r + (k % 4 === 2 ? 12 : 0), 1.7, g); break;
      case 'drive': for (let k = 0; k < 16; k += 2) add(t0 + k, I.Triangle, k === 12 ? r + 7 : r, 1.7, g); break;
      case 'walk': [0, 7, 12, 7].forEach((iv, k) => add(t0 + 4 * k, I.Triangle, r + iv, 3.6, g)); break;
      default: [[0, 0, 3], [3, 0, 3], [6, 12, 2], [8, 0, 3], [11, 7, 3], [14, 12, 2]].forEach(([at, iv, len]) => add(t0 + at, I.Triangle, r + iv, len - 0.3, g));
    }
  }

  // ---- the theme: 2-bar motifs
  role = Role.Melody;
  const mel = new MusicRng(seed * 31 + 3);
  const scaleDegrees = Scales[song.mode];
  const center = mel.pickWeighted([74, 76, 79], [0.35, 0.4, 0.25]);
  const lowest = center - 8, highest = center + 10;
  const cellA = mel.pickWeighted(range(Cells.length, (i) => i), CellWeights);
  const cellB = mel.pickWeighted(range(Cells.length, (i) => i), CellWeights);
  const leapChance = 0.12 + 0.18 * mel.nextDouble();
  const scaleFor = (ch) => {
    const out = [];
    for (let m = lowest - 14; m <= highest + 3; m++) {
      if (ch.has(m)) { out.push(m); continue; }
      if (!scaleDegrees.includes(mod(m - song.key, 12))) continue;
      if (ch.tones.some((t) => mod(m - t, 12) === 1 || mod(t - m, 12) === 1)) continue;
      out.push(m);
    }
    return out;
  };

  function newMotif() {
    const motif = { onsets: [], durations: [], moves: [] };
    let pos = mel.pick([0, 0, 2]);
    while (pos < 28) {
      for (const step of Cells[mel.nextDouble() < 0.65 ? cellA : cellB]) {
        if (pos >= 28) break;
        motif.onsets.push(pos); pos += step;
      }
    }
    for (let i = 0; i < motif.onsets.length; i++)
      motif.durations.push(i + 1 < motif.onsets.length ? motif.onsets[i + 1] - motif.onsets[i] : 32 - motif.onsets[i] - 2);
    motif.moves.push(0);
    let last = 0;
    for (let i = 1; i < motif.onsets.length; i++) {
      let move;
      if (Math.abs(last) >= 3 && mel.nextDouble() < 0.7) move = -Math.sign(last) * mel.pickWeighted([1, 2], [0.6, 0.4]);
      else if (mel.nextDouble() < leapChance) move = mel.pick([-1, 1]) * mel.range(2, 5); // a jump along the chord
      else move = mel.pickWeighted([-2, -1, 1, 2, 0], [0.15, 0.3, 0.3, 0.15, 0.1]);
      motif.moves.push(move); last = move;
    }
    return motif;
  }

  let previous = -1;
  // voices: [instrument, gain, delay in sixteenths, harmony (a third below)]
  function realize(motif, bar0, target, resolve, voices) {
    let p = -1;
    const count = motif.onsets.length;
    for (let i = 0; i < count; i++) {
      const e = motif.onsets[i], d = motif.durations[i];
      const at = bar0 * 16 + e;
      const ch = chords[Math.trunc(at / 16)];
      const all = scaleFor(ch);
      const scale = all.filter((m) => m >= lowest && m <= highest);
      if (p < 0) p = nearest(scale.filter((m) => ch.has(m)), target);
      else {
        let j = all.indexOf(nearest(all, p)) + motif.moves[i];
        if (j < 0 || j >= all.length || all[j] < lowest || all[j] > highest) j -= 2 * motif.moves[i];
        p = all[Math.min(Math.max(j, 0), all.length - 1)];
      }
      const strong = e % 8 === 0 || d >= 6 || i === count - 1;
      if (strong) {
        const pool = [];
        for (let m = lowest - 2; m <= highest + 2; m++) if (resolve && i === count - 1 ? mod(m, 12) === ch.root : ch.has(m)) pool.push(m);
        p = nearest(pool, p);
      }
      if (previous >= 0 && Math.abs(p - previous) === 6) {
        const other = scale.filter((m) => m !== p && Math.abs(m - previous) !== 6);
        if (other.length) p = nearest(other, p);
      }
      previous = p;
      // short notes detached like the console's, long ones held
      const held = d >= 4 ? d - 0.5 : d * 0.75;
      for (const [inst, g, delay, harmony] of voices) {
        let m = p;
        if (harmony) { const j = all.indexOf(p) - 2; m = j >= 0 ? all[j] : p - 12; }
        add(at + delay, inst, m, held, g * (e % 4 === 0 ? 1 : 0.88));
      }
    }
  }

  const plans = [[[0, 0], [0, 0], [1, 0], [0, 0]], [[0, 0], [1, 0], [0, 0], [1, 0]], [[0, 0], [0, 2], [1, 0], [1, 0]]];
  const planA = plans[mel.pickWeighted([0, 1, 2], [0.4, 0.35, 0.25])];
  const planB = plans[mel.pickWeighted([0, 1, 2], [0.4, 0.35, 0.25])];
  const first = newMotif();
  const motifsA = [first, mel.nextDouble() < 0.5 ? { ...first, moves: first.moves.map((m) => -m) } : newMotif()];
  const motifsB = [newMotif(), newMotif()];
  const MelodyGain = 0.1;
  for (const s of sections) {
    let voices, motifs, planS;
    if (s.kind === 'A') {
      voices = [[song.leadA, MelodyGain, 0, false]];
      if (echo) voices.push([song.leadA, MelodyGain * 0.32, 3, false]);
      // the theme's return: a second voice a third below, on the other pulse
      if (s.n > 0) voices.push([accomp, MelodyGain * 0.55, 0, true]);
      motifs = motifsA; planS = planA;
    } else if (s.kind === 'B') {
      voices = [[song.leadB, MelodyGain, 0, false]];
      if (echo) voices.push([song.leadB, MelodyGain * 0.32, 3, false]);
      motifs = motifsB; planS = planB;
    } else continue; // intro, bridge (C) and end: no theme
    let target = center;
    for (let k = 0; k < 4; k++) {
      const [which, climb] = planS[k];
      realize(motifs[which], s.bar + 2 * k, target + climb, k === 3, voices);
      target = Math.min(Math.max(previous + mel.pick([-2, 0, 2]), center - 4), center + 5);
    }
  }
  // the end: the tonic, held
  add(outroBar * 16, song.leadA, nearest(range(40, (i) => 60 + i).filter((m) => mod(m, 12) === chords[outroBar].root), center), 24, MelodyGain);

  // ---- drums: the noise channel (the triangle's kick)
  role = Role.Drums;
  if (drumsOn) {
    for (let b = 0; b < bars; b++) {
      const s = sectionAt[b], t0 = b * 16, i = b - s.bar;
      if (b === outroBar) { add(t0, I.Noise, 49, 16, 0.08); add(t0, I.Noise, 36, 4, 0.14); break; }
      if (s.kind === 'I' && longIntro && i < 2) continue;
      const lastOfSection = i === s.len - 1 && s.kind !== 'I';
      for (const [slot, hit] of (s.kind === 'C' ? DrumPatterns[3] : drumPattern).hits) {
        if (lastOfSection && slot >= 8) continue;
        add(t0 + slot, I.Noise, hit, 2, hit === 36 ? 0.14 : hit === 38 ? 0.1 : hit === 46 ? 0.045 : 0.035);
      }
      if (lastOfSection) // a fill: snare and toms in sixteenths
        for (let k = 8; k < 16; k++) add(t0 + k, I.Noise, k < 12 ? 38 : 37, 1, k < 12 ? 0.07 + 0.01 * (k - 8) : 0.12);
      if (i === 0 && s.kind !== 'I') add(t0, I.Noise, 49, 16, 0.06);
    }
  }

  notes.sort((a, b) => a.time - b.time);
  song.notes = notes;
  return song;
}
