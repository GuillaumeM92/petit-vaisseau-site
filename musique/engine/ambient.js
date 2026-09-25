// The ambient style (style 8, only on the site): slow music to focus. A warm pad holds a chord every two
// bars (each one fading into the next), a deep drone comes and goes, glass notes fall here and there
// with their echo, a soft voice sings a few long notes now and then. No drums, nothing sudden: the
// layers enter and leave one at a time over some three minutes, then the last chord fades away.
//
// Same principles as the other styles: a seed decides everything, each layer has its own random
// stream, plain triads, no note a semitone against the chord.
import { MusicRng } from './rng.js';
import { InstrumentId as I, InstrumentCount, Instruments } from './instruments.js';
import { MusicMode, MusicRoom, MusicStyle } from './styles.js';

const Role = { Accompaniment: 1, Bass: 2, Pad: 3, Melody: 4, Color: 5, Drums: 6 }; // composer.js NoteRole

const Keys = [0, 2, 3, 5, 7, 8, 9, 10];
const NoteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const M = MusicMode;
const Scales = {
  [M.Major]: [0, 2, 4, 5, 7, 9, 11], [M.Minor]: [0, 2, 3, 5, 7, 8, 10], [M.Dorian]: [0, 2, 3, 5, 7, 9, 10],
  [M.Mixolydian]: [0, 2, 4, 5, 7, 9, 10], [M.Lydian]: [0, 2, 4, 6, 7, 9, 11],
};
const Degrees = {
  I: [0, 4], i: [0, 3], II: [2, 4], ii: [2, 3], iii: [4, 3], bIII: [3, 4], IV: [5, 4], iv: [5, 3], V: [7, 4],
  bVI: [8, 4], vi: [9, 3], bVII: [10, 4],
};
// Four chords of two bars each: a section. Two per piece, which alternate.
const Progressions = {
  [M.Major]: [['I', 'IV', 'vi', 'IV'], ['I', 'vi', 'IV', 'I'], ['IV', 'I', 'V', 'vi'], ['I', 'iii', 'IV', 'I'], ['I', 'V', 'IV', 'I']],
  [M.Lydian]: [['I', 'II', 'I', 'II'], ['I', 'II', 'vi', 'I'], ['vi', 'II', 'I', 'I'], ['I', 'iii', 'II', 'I']],
  [M.Dorian]: [['i', 'IV', 'i', 'IV'], ['i', 'IV', 'bVII', 'i'], ['i', 'bIII', 'IV', 'i'], ['iv', 'i', 'bVII', 'i']],
  [M.Minor]: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'iv', 'bVI', 'i'], ['i', 'bVI', 'i', 'bVII'], ['bVI', 'bIII', 'i', 'i']],
  [M.Mixolydian]: [['I', 'bVII', 'IV', 'I'], ['I', 'bVII', 'I', 'bVII'], ['IV', 'bVII', 'I', 'I']],
};
// How the layers come and go, section by section: [drone, glass (0 none, 1 sparse, 2 more), melody].
const Arcs = [
  [[0, 0, 0], [1, 1, 0], [1, 1, 1], [1, 2, 1], [0, 2, 0], [1, 1, 1], [0, 1, 0]],
  [[1, 0, 0], [1, 1, 0], [0, 2, 0], [1, 1, 1], [1, 2, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 1, 0], [1, 2, 1], [1, 1, 1], [0, 1, 0]],
];

const mod = (a, n) => ((a % n) + n) % n;
const fround = Math.fround;
const nearest = (candidates, target) => candidates.reduce((b, m) => Math.abs(m - target) < Math.abs(b - target) ? m : b, candidates[0]);
const lowRoot = (ch, lo) => lo + mod(ch.root - lo, 12);

function chordOf(key, degree) {
  const [offset, third] = Degrees[degree];
  const root = (key + offset) % 12;
  const tones = [root, (root + third) % 12, (root + 7) % 12];
  return { root, tones, thirdInterval: third, name: NoteNames[root] + (third === 3 ? 'm' : ''), has: (m) => tones.includes(mod(m, 12)) };
}

// Close-position triad nearest the previous one (as composer.js).
function voice(ch, prev, lo, center) {
  let best = null, bestCost = Number.MAX_VALUE;
  for (let mask = 0; mask < 8; mask++) {
    const v = [0, 0, 0];
    for (let i = 0; i < 3; i++) v[i] = lo + mod(ch.tones[i] - lo, 12) + (((mask >> i) & 1) !== 0 ? 12 : 0);
    v.sort((a, b) => a - b);
    if (v[2] - v[0] > 12) continue;
    let cost = Math.abs((v[0] + v[1] + v[2]) / 3 - center) * 0.5;
    if (prev) for (let i = 0; i < 3; i++) cost += Math.abs(v[i] - prev[i]);
    if (cost < bestCost) { bestCost = cost; best = v; }
  }
  return best;
}

export const AmbientTempo = [56, 72];
export const AmbientLeads = [I.SoftVoice, I.Glass];

export function composeAmbient(seed, o) {
  const plan = new MusicRng(seed);
  const song = { seed, style: MusicStyle.Ambient, uses: new Array(InstrumentCount).fill(false), beatsPerBar: 4 };
  const pick = (drawn, value) => value >= 0 ? value : drawn;

  // ---- plan
  song.key = pick(plan.pick(Keys), o.Key);
  const tempo = plan.range(AmbientTempo[0], AmbientTempo[1] + 1);
  song.tempo = o.TempoFeel === 's' ? AmbientTempo[0] : o.TempoFeel === 'f' ? AmbientTempo[1]
    : o.Tempo >= 0 ? Math.min(Math.max(o.Tempo, AmbientTempo[0]), AmbientTempo[1]) : tempo;
  song.mode = pick(plan.pickWeighted([M.Major, M.Lydian, M.Dorian, M.Minor, M.Mixolydian], [0.3, 0.25, 0.2, 0.15, 0.1]), o.Mode);
  const progs = Progressions[song.mode];
  const p1 = plan.range(0, progs.length);
  const p2 = (p1 + 1 + plan.range(0, progs.length - 1)) % progs.length;
  const arc = Arcs[plan.range(0, Arcs.length)];
  song.leadA = pick(plan.pickWeighted(AmbientLeads, [0.65, 0.35]), o.LeadA);
  const alternate = plan.nextDouble() < 0.6; // the second progression in every other section
  song.room = pick(MusicRoom.Space, o.Room);
  song.form = arc.map(() => 'S').join('') + 'O';
  song.accomp = I.Pad; song.leadB = song.leadA; song.leadA2 = song.leadA; song.hasBass = true; song.bass = I.Drone; song.pad = I.Pad;
  song.plan = { arc: arc.map((a) => a.join('')).join(' '), lead: Instruments[song.leadA].Name };

  const bpb = 4, beat = 60 / song.tempo;
  song.barSeconds = beat * bpb;

  // ---- form: sections of 8 bars (4 chords of 2 bars), then the last chord, held
  const degrees = [], sections = [];
  arc.forEach((layers, n) => {
    const prog = progs[alternate && n % 2 === 1 ? p2 : p1];
    sections.push({ label: String.fromCharCode(65 + n), bar: degrees.length, layers, n });
    for (const d of prog) degrees.push(d, d);
  });
  const lastBar = degrees.length;
  degrees.push(progs[p1][0], progs[p1][0], progs[p1][0]);
  sections.push({ label: 'Outro', bar: lastBar, layers: [1, 1, 0], n: arc.length });
  const bars = degrees.length;
  const chords = degrees.map((d) => chordOf(song.key, d));
  song.chordNames = chords.map((c) => c.name);
  song.sections = sections.map((s) => ({ label: s.label, bar: s.bar }));
  song.length = bars * song.barSeconds;
  const sectionAt = (b) => sections[Math.min(Math.trunc(b / 8), sections.length - 1)];

  const notes = [];
  let role = 0;
  function add(human, beats, instrument, midi, durationBeats, gain, extra = null) {
    const info = Instruments[instrument];
    const note = { time: Math.max(0, beats * beat + (human ? human.normal() * 0.012 : 0)), instrument, midi,
      duration: fround(durationBeats * beat), gain: fround(gain), pan: info.Pan, send: info.Send, role, slur: false };
    if (extra) Object.assign(note, extra);
    notes.push(note);
    song.uses[instrument] = true;
  }

  // ---- the pad: an open chord every two bars, overlapping the next (slow attack, long release)
  role = Role.Pad;
  let prev = null;
  for (let b = 0; b < bars; b += 2) {
    const ch = chords[b], last = b >= lastBar;
    const v = voice(ch, prev, 55, 62);
    prev = v;
    const low = lowRoot(ch, 43);
    const len = last ? 3 * bpb : 2 * bpb + 1.5;
    const fade = last ? 0.8 : 1;
    add(null, b * bpb, I.Pad, low, len, 0.042 * fade);
    for (const m of v) add(null, b * bpb, I.Pad, m, len, 0.035 * fade);
    if (last) break;
  }

  // ---- the drone: the chord's root, deep, in the sections that have it
  role = Role.Bass;
  for (let b = 0; b < bars; b += 2) {
    const s = sectionAt(b), ch = chords[b], last = b >= lastBar;
    if (!s.layers[0]) continue;
    add(null, b * bpb, I.Drone, lowRoot(ch, 31), last ? 3 * bpb : 2 * bpb + 1, 0.11);
    if (last) break;
  }

  // the notes that sound well over a chord: its own, and the mode's that rub none of them
  const scaleDegrees = Scales[song.mode];
  const scaleFor = (ch, lo, hi) => {
    const out = [];
    for (let m = lo; m <= hi; m++) {
      if (ch.has(m)) { out.push(m); continue; }
      if (!scaleDegrees.includes(mod(m - song.key, 12))) continue;
      if (ch.tones.some((t) => mod(m - t, 12) === 1 || mod(t - m, 12) === 1)) continue;
      out.push(m);
    }
    return out;
  };

  // ---- glass: a few notes on each chord, anywhere on the eighths, each with an echo bouncing left and right
  role = Role.Color;
  const glass = new MusicRng(seed * 31 + 4);
  const glassOn = song.leadA !== I.Glass;
  for (let b = 0; b < lastBar; b += 2) {
    const s = sectionAt(b), ch = chords[b];
    if (!s.layers[1] || !glassOn && s.layers[2]) continue;
    const count = s.layers[1] === 2 ? glass.range(4, 7) : glass.range(1, 4);
    const pool = scaleFor(ch, 72, 91);
    const slots = new Set();
    while (slots.size < count) slots.add(glass.range(0, 15));
    let p = nearest(pool, glass.range(74, 86));
    for (const slot of [...slots].sort((a, b) => a - b)) {
      const j = pool.indexOf(p) + glass.pick([-2, -1, 1, 2, 3]);
      p = pool[Math.min(Math.max(j, 0), pool.length - 1)];
      const t = b * bpb + slot / 2, g = 0.07 * (0.8 + 0.3 * glass.nextDouble());
      const side = glass.nextDouble() < 0.5 ? -1 : 1;
      add(glass, t, I.Glass, p, 3, g, { pan: 0.1 * side });
      add(null, t + 0.75, I.Glass, p, 3, g * 0.4, { pan: -0.4 * side });
      add(null, t + 1.5, I.Glass, p, 3, g * 0.18, { pan: 0.4 * side });
    }
  }

  // ---- the voice: a slow motif now and then (two bars sung, two bars of silence)
  role = Role.Melody;
  const mel = new MusicRng(seed * 31 + 3);
  const center = mel.pickWeighted([67, 69, 72], [0.35, 0.35, 0.3]);
  const lowest = center - 7, highest = center + 7;
  const Cells = [[4, 4], [2, 6], [3, 1, 4], [8], [2, 2, 4], [6, 2]];
  const motifs = [0, 1].map(() => {
    const onsets = [], durations = [], moves = [0];
    let pos = mel.pick([0, 0, 1, 2]);
    while (pos < 6) for (const step of mel.pick(Cells)) { if (pos >= 6) break; onsets.push(pos); pos += step; }
    for (let i = 0; i < onsets.length; i++) durations.push(i + 1 < onsets.length ? onsets[i + 1] - onsets[i] : 8 - onsets[i]);
    for (let i = 1; i < onsets.length; i++) moves.push(mel.pickWeighted([-2, -1, 1, 2, 3, -3], [0.15, 0.3, 0.3, 0.12, 0.07, 0.06]));
    return { onsets, durations, moves };
  });
  const glassLead = song.leadA === I.Glass;
  for (const s of sections) {
    if (!s.layers[2]) continue;
    for (let k = 0; k < 2; k++) {
      const motif = motifs[(s.n + k) % 2], bar0 = s.bar + 4 * k;
      let p = -1;
      motif.onsets.forEach((e, i) => {
        const at = bar0 * bpb + e;
        const ch = chords[Math.trunc(at / bpb)];
        const scale = scaleFor(ch, lowest, highest);
        if (p < 0) p = nearest(scale.filter((m) => ch.has(m)), center);
        else {
          let j = scale.indexOf(nearest(scale, p)) + motif.moves[i];
          if (j < 0 || j >= scale.length) j -= 2 * motif.moves[i];
          p = scale[Math.min(Math.max(j, 0), scale.length - 1)];
        }
        const d = motif.durations[i];
        if (d >= 2 || i === motif.onsets.length - 1) p = nearest(scale.filter((m) => ch.has(m)), p);
        if (glassLead) add(mel, at, I.Glass, p + 12, d + 2, 0.11);
        else add(mel, at, I.SoftVoice, p, d * 0.95, 0.15 * (0.9 + 0.15 * mel.nextDouble()));
      });
    }
  }
  // the last chord: one glass note on its root
  role = Role.Color;
  add(null, lastBar * bpb + 1, I.Glass, lowRoot(chords[lastBar], 79), 6, 0.06);

  notes.sort((a, b) => a.time - b.time);
  song.notes = notes;
  return song;
}
