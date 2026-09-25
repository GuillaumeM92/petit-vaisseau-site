// The cinematic style (style 6, only on the site): an orchestral piece that builds up. Spiccato strings
// play an ostinato from the start; a theme comes in on the horns; the build adds the violins, the
// brass chords, rolls and a cymbal swell; the climax restates the theme with the whole orchestra over
// timpani and big drums; a held chord closes it with a timpani roll and a gong.
//
// Same principles as the other styles (composer.js): a seed decides everything, each layer draws from
// its own random stream, the melody is made of 2-bar motifs that come back, chords are plain triads
// (no dissonance: a melody note never rubs a semitone against the chord).
import { MusicRng } from './rng.js';
import { InstrumentId as I, InstrumentCount, Instruments } from './instruments.js';
import { MusicMode, MusicRoom, MusicStyle } from './styles.js';

// composer.js NoteRole (not imported: composer.js imports this module)
const Role = { Accompaniment: 1, Bass: 2, Pad: 3, Melody: 4, Color: 5, Drums: 6 };

const Keys = [0, 2, 3, 5, 7, 8, 9, 10];
const NoteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MinorScale = [0, 2, 3, 5, 7, 8, 10], MajorScale = [0, 2, 4, 5, 7, 9, 11];

// Chords by degree, from the tonic: [semitones, third] (4 major, 3 minor).
const Degrees = {
  I: [0, 4], i: [0, 3], ii: [2, 3], iii: [4, 3], bIII: [3, 4], IV: [5, 4], iv: [5, 3], V: [7, 4], v: [7, 3],
  bVI: [8, 4], vi: [9, 3], bVII: [10, 4],
};

// 8-bar progressions, one chord a bar: A (the theme), B (the build, ending on a chord that wants to
// move on), C (the climax).
const Minor = {
  A: [
    ['i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'bVII'], ['i', 'bVI', 'bVII', 'i', 'i', 'bVI', 'bVII', 'V'],
    ['i', 'iv', 'bVI', 'V', 'i', 'iv', 'bVI', 'V'], ['i', 'bVII', 'bVI', 'bVII', 'i', 'bVII', 'bVI', 'V'],
    ['i', 'bIII', 'bVII', 'iv', 'i', 'bIII', 'bVII', 'bVII'], ['i', 'i', 'bVI', 'bVI', 'bIII', 'bIII', 'bVII', 'bVII'],
  ],
  B: [
    ['bVI', 'bVII', 'i', 'i', 'bVI', 'bVII', 'V', 'V'], ['iv', 'bVI', 'bVII', 'i', 'iv', 'bVI', 'bVII', 'bVII'],
    ['bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'bVII', 'V'], ['bIII', 'bVII', 'bVI', 'bVI', 'bIII', 'bVII', 'iv', 'V'],
  ],
  C: [
    ['i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bVII', 'i'], ['bVI', 'bVII', 'i', 'i', 'bVI', 'bVII', 'i', 'i'],
    ['i', 'bVII', 'bVI', 'bVII', 'i', 'bVII', 'bVI', 'i'], ['i', 'bVI', 'bVII', 'bIII', 'bVI', 'iv', 'bVII', 'i'],
  ],
  Outro: [['bVI', 'bVII', 'i', 'i'], ['iv', 'bVII', 'i', 'i'], ['bVI', 'V', 'i', 'i']],
};
const Major = {
  A: [
    ['I', 'bVII', 'IV', 'I', 'I', 'bVII', 'IV', 'V'], ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'I', 'V'],
    ['I', 'V', 'vi', 'IV', 'I', 'V', 'IV', 'V'], ['I', 'bVI', 'bVII', 'I', 'I', 'bVI', 'bVII', 'V'],
    ['I', 'IV', 'vi', 'V', 'I', 'IV', 'bVII', 'V'],
  ],
  B: [
    ['IV', 'V', 'vi', 'vi', 'IV', 'V', 'bVII', 'V'], ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'bVII', 'V'],
    ['bVI', 'bVII', 'I', 'I', 'bVI', 'bVII', 'V', 'V'], ['ii', 'IV', 'vi', 'V', 'ii', 'IV', 'V', 'V'],
  ],
  C: [
    ['I', 'V', 'vi', 'IV', 'I', 'V', 'IV', 'I'], ['I', 'bVII', 'IV', 'I', 'I', 'bVI', 'bVII', 'I'],
    ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'V', 'I'], ['IV', 'V', 'I', 'vi', 'IV', 'V', 'I', 'I'],
  ],
  Outro: [['IV', 'V', 'I', 'I'], ['bVI', 'bVII', 'I', 'I'], ['IV', 'bVII', 'I', 'I']],
};

// The strings' ostinato, one bar in sixteenths: [slot, tone, accent], tone indexing the chord from its
// low root: 0 root, 1 fifth, 2 octave, 3 third above, 4 fifth above. Each has its tempo range.
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const Ostinatos = [
  { name: 'eighths', tempo: [104, 124], notes: range(8, (i) => [2 * i, [0, 0, 1, 0, 2, 0, 1, 0][i], i % 4 === 0]) },
  { name: 'gallop', tempo: [92, 108],
    notes: range(12, (i) => [4 * Math.trunc(i / 3) + [0, 2, 3][i % 3], i === 6 ? 2 : i === 9 ? 1 : 0, i % 3 === 0]) },
  { name: 'sixteenths', tempo: [80, 96], notes: range(16, (i) => [i, i === 12 ? 1 : i % 4 === 2 ? 2 : 0, i % 4 === 0]) },
  { name: 'tresillo', tempo: [100, 120], notes: range(8, (i) => [2 * i, i === 3 ? 2 : i === 6 ? 1 : 0, i === 0 || i === 3 || i === 6]) },
  { name: 'drive', tempo: [80, 94],
    notes: range(16, (i) => [i, i === 6 ? 2 : i === 12 ? 1 : 0, [0, 3, 6, 9, 12, 14].includes(i)]) },
];
const OstinatoWeights = [0.24, 0.18, 0.18, 0.22, 0.18];

// Who carries the theme in A, and how the climax doubles it. CinematicLeads: what a listener can ask for.
const Leads = [I.Horns, I.Cello, I.Strings];
const LeadWeights = [0.55, 0.25, 0.2];
export const CinematicLeads = [I.Horns, I.Trumpet, I.Strings, I.Cello];
const Doubles = [[I.Horns, I.Trumpet], [I.Horns, I.Strings], [I.Trumpet, I.Strings]];
const DoubleWeights = [0.5, 0.3, 0.2];

// Melody rhythm cells, in eighths.
const Cells = [[4, 4], [6, 2], [3, 1, 4], [4, 2, 2], [8], [2, 2, 4]];
const CellWeights = [0.24, 0.2, 0.16, 0.14, 0.14, 0.12];

// Suspended cymbal swells (Cymbals midi 55-57): when each reaches its peak, in seconds (bake report).
const Swells = [[57, 7.161], [56, 3.497], [55, 1.445]];

const mod = (a, n) => ((a % n) + n) % n;
const fround = Math.fround;
const velocity = (v) => fround(Math.pow(v, 1.4));

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

const nearest = (candidates, target) => candidates.reduce((b, m) => Math.abs(m - target) < Math.abs(b - target) ? m : b, candidates[0]);
const lowRoot = (ch, lo) => lo + mod(ch.root - lo, 12);

export const CinematicTempo = [80, 124];

export function composeCinematic(seed, o) {
  const plan = new MusicRng(seed);
  const song = { seed, style: MusicStyle.Cinematic, uses: new Array(InstrumentCount).fill(false), beatsPerBar: 4 };
  const pick = (drawn, value) => value >= 0 ? value : drawn;

  // ---- plan
  const ostinato = Ostinatos[plan.pickWeighted(range(Ostinatos.length, (i) => i), OstinatoWeights)];
  song.key = pick(plan.pick(Keys), o.Key);
  const tempo = plan.range(ostinato.tempo[0], ostinato.tempo[1] + 1);
  // "slower" / "livelier" are relative to the ostinato (its tempo range)
  song.tempo = o.TempoFeel === 's' ? ostinato.tempo[0] : o.TempoFeel === 'f' ? ostinato.tempo[1]
    : o.Tempo >= 0 ? Math.min(Math.max(o.Tempo, CinematicTempo[0]), CinematicTempo[1]) : tempo;
  const major = plan.nextDouble() < 0.35;
  song.mode = o.Mode >= 0 ? (o.Mode === MusicMode.Minor || o.Mode === MusicMode.Dorian ? MusicMode.Minor : MusicMode.Major)
    : major ? MusicMode.Major : MusicMode.Minor;
  const P = song.mode === MusicMode.Major ? Major : Minor;
  const progA = P.A[plan.range(0, P.A.length)], progB = P.B[plan.range(0, P.B.length)];
  const progC = P.C[plan.range(0, P.C.length)], outro = P.Outro[plan.range(0, P.Outro.length)];
  song.form = plan.pickWeighted(['IABCCO', 'IABCO', 'IAABCCO'], [0.45, 0.25, 0.3]);
  const longIntro = plan.nextDouble() < 0.35;
  // the soft horn of the other styles asks for the horns here
  song.leadA = pick(plan.pickWeighted(Leads, LeadWeights), o.LeadA === I.Horn ? I.Horns : o.LeadA);
  const doubles = Doubles[plan.pickWeighted([0, 1, 2], DoubleWeights)];
  const bMelody = plan.nextDouble() < 0.5;       // a cello line in the build, or only chords
  const brassRhythm = plan.pickWeighted(['whole', 'tresillo', 'halves'], [0.35, 0.4, 0.25]);
  const bigDrums = o.Drums === -2 ? false : o.Drums >= 0 || plan.nextDouble() < 0.7;
  const snareRoll = o.Drums !== -2 && plan.nextDouble() < 0.6;
  const roomRng = new MusicRng(seed * 31 + 6);
  song.room = pick(roomRng.pickWeighted([MusicRoom.Hall, MusicRoom.Studio], [0.6, 0.4]), o.Room);
  // what the page shows (the lead and accompaniment of the other styles)
  song.accomp = I.CellosSpic; song.leadB = song.leadA; song.leadA2 = doubles[0];
  song.hasBass = true; song.bass = I.BassesSpic; song.pad = I.Strings;
  song.plan = { ostinato: ostinato.name, doubles: doubles.map((d) => Instruments[d].Name).join('+'), brassRhythm, bMelody, bigDrums, snareRoll };

  const bpb = 4, beat = 60 / song.tempo;
  song.barSeconds = beat * bpb;

  // ---- form
  const degrees = [], sections = [];
  let aCount = 0, cCount = 0;
  for (const kind of song.form) {
    const bar = degrees.length;
    if (kind === 'I') { degrees.push(...(longIntro ? progA : progA.slice(0, 4))); sections.push({ label: 'Intro', bar, kind, n: 0 }); }
    else if (kind === 'A') { degrees.push(...progA); sections.push({ label: 'A' + "'".repeat(aCount), bar, kind, n: aCount++ }); }
    else if (kind === 'B') { degrees.push(...progB); sections.push({ label: 'B', bar, kind, n: 0 }); }
    else if (kind === 'C') { degrees.push(...progC); sections.push({ label: 'C' + "'".repeat(cCount), bar, kind, n: cCount++ }); }
    else { degrees.push(...outro); sections.push({ label: 'Outro', bar, kind, n: 0 }); }
  }
  const bars = degrees.length;
  const chords = degrees.map((d) => chordOf(song.key, d));
  song.chordNames = chords.map((c) => c.name);
  song.sections = sections.map((s) => ({ label: s.label, bar: s.bar }));
  song.length = bars * song.barSeconds;
  const sectionAt = [];
  for (const s of sections) for (let b = s.bar; b < s.bar + (s.kind === 'I' ? (longIntro ? 8 : 4) : s.kind === 'O' ? 4 : 8); b++) sectionAt[b] = s;
  const outroBar = sections[sections.length - 1].bar;
  const finalBar = outroBar + 2; // the held last chord

  // How loud each bar is: soft intro, the build rising to the climax, the end fading.
  const intensity = (b) => {
    const s = sectionAt[b], i = b - s.bar;
    switch (s.kind) {
      case 'I': return 0.72;
      case 'A': return s.n === 0 ? 0.82 : 0.86;
      case 'B': return 0.84 + 0.16 * i / 7;
      case 'C': return 1;
      default: return i < 2 ? 0.92 - 0.08 * i : 0.85;
    }
  };

  const notes = [];
  let role = 0;
  const Level = 0.8; // the whole orchestra, measured against the other styles (climax about 5 dB above them)
  const takes = new Uint8Array(InstrumentCount);
  function add(human, beats, instrument, midi, durationBeats, gain, extra = null) {
    const info = Instruments[instrument];
    const time = beats * beat + (human ? human.normal() * human.jitter : 0);
    const note = { time: Math.max(0, time), instrument, midi, duration: fround(durationBeats * beat), gain: fround(gain * Level),
      pan: info.Pan, send: info.Send, role, slur: false };
    if (extra) Object.assign(note, extra);
    notes.push(note);
    song.uses[instrument] = true;
    return note;
  }
  // spiccato and hits alternate between the two recorded takes
  const alt = (instrument) => (takes[instrument] ^= 1) === 0;

  // ---- ostinato (spiccato strings)
  role = Role.Accompaniment;
  const ost = new MusicRng(seed * 31 + 1); ost.jitter = 0.003;
  const ostPlayers = (s) => {
    // [instrument, lowest root, gain]: cellos from the start, basses and violas from the build (or
    // the second A), violins on top from the build.
    const p = [[I.CellosSpic, 36, 0.045]];
    if (s.kind === 'B' || s.kind === 'C' || (s.kind === 'A' && s.n > 0)) p.push([I.BassesSpic, 24, 0.025]);
    if (s.kind === 'B' || s.kind === 'C') p.push([I.ViolasSpic, 48, 0.03]);
    if (s.kind === 'O') p.push([I.BassesSpic, 24, 0.025]);
    return p;
  };
  let prevHigh = null;
  for (let b = 0; b < finalBar; b++) {
    const ch = chords[b], s = sectionAt[b], k = intensity(b);
    const fadeOut = b >= outroBar ? 1 - 0.3 * (b - outroBar) : 1;
    for (const [inst, lo, g] of ostPlayers(s)) {
      const r = lowRoot(ch, lo);
      const tones = [r, r + 7, r + 12, r + 12 + ch.thirdInterval, r + 19];
      for (const [slot, tone, accent] of ostinato.notes) {
        const v = (accent ? 0.95 : 0.7) + 0.05 * ost.nextDouble();
        add(ost, b * bpb + slot / 4, inst, tones[tone], 0.5, g * k * fadeOut * velocity(v), { alt: alt(inst) });
      }
    }
    // the violins' broken chords above, in the ostinato's grid (eighths at most)
    if (s.kind === 'B' || s.kind === 'C') {
      const high = voice(ch, prevHigh, 67, 74);
      prevHigh = high;
      const order = [0, 1, 2, 1];
      const step = ostinato.notes.length > 8 && song.tempo < 90 ? 1 : 2;
      for (let slot = 0, j = 0; slot < 16; slot += step, j++) {
        const v = (slot % 8 === 0 ? 0.9 : 0.68) + 0.05 * ost.nextDouble();
        add(ost, b * bpb + slot / 4, I.ViolinsSpic, high[order[j % 4]], 0.5, 0.035 * k * velocity(v), { alt: alt(I.ViolinsSpic) });
      }
    }
  }

  // ---- held strings: a soft pad and the cellos' long roots, where the brass doesn't take over
  role = Role.Pad;
  let prevPad = null;
  for (let b = 0; b < bars; b++) {
    const s = sectionAt[b], ch = chords[b], k = intensity(b);
    const last = b === finalBar;
    if (b > finalBar) break;
    const len = last ? 2 * bpb : bpb + 0.05;
    const v = voice(ch, prevPad, 55, 63);
    prevPad = v;
    const stringsFree = s.kind !== 'C' && !(s.kind === 'A' && song.leadA === I.Strings);
    if (stringsFree || last) for (const m of v) add(null, b * bpb, I.Strings, m, len, 0.013 * k);
    const celloFree = !(s.kind === 'A' && song.leadA === I.Cello) && !(s.kind === 'B' && bMelody);
    if (celloFree || last) add(null, b * bpb, I.Cello, lowRoot(ch, 36), len, 0.05 * k);
  }

  // ---- brass chords: horns in the build, trombones and tuba from its second half and in the climax
  role = Role.Bass;
  const brass = new MusicRng(seed * 31 + 2); brass.jitter = 0.006;
  let prevTbn = null, prevHorns = null;
  for (let b = 0; b <= finalBar; b++) {
    const s = sectionAt[b], ch = chords[b], k = intensity(b), i = b - s.bar;
    const last = b === finalBar;
    const tbn = voice(ch, prevTbn, 48, 55); prevTbn = tbn;
    const tuba = lowRoot(ch, 34);
    const hits = last ? [[0, 2 * bpb]]
      : s.kind === 'B' ? [[0, bpb + 0.05]]
      : s.kind === 'C' || (s.kind === 'O' && b < finalBar) ? (brassRhythm === 'whole' ? [[0, bpb + 0.05]]
        : brassRhythm === 'halves' ? [[0, 1.9], [2, 1.9]] : [[0, 1.4], [1.5, 1.4], [3, 0.9]])
      : [];
    if (s.kind === 'B' && i < 4) {
      // horns hold the chord alone
      const hv = voice(ch, prevHorns, 50, 57); prevHorns = hv;
      for (const m of hv) add(brass, b * bpb, I.Horns, m, bpb + 0.05, 0.028 * k);
      continue;
    }
    for (const [at, len] of hits) {
      const accent = at === 0 ? 1 : 0.85;
      for (const m of tbn) add(brass, b * bpb + at, I.Trombone, m, len, 0.04 * k * accent);
      add(brass, b * bpb + at, I.Tuba, tuba, len, 0.063 * k * accent);
    }
    if (s.kind === 'B' || last) {
      const hv = voice(ch, prevHorns, 50, 57); prevHorns = hv;
      for (const m of hv) add(brass, b * bpb, I.Horns, m, last ? 2 * bpb : bpb + 0.05, 0.028 * k);
    }
  }

  // ---- the theme: 2-bar motifs over the mode's scale, never a semitone against the chord
  role = Role.Melody;
  const mel = new MusicRng(seed * 31 + 3); mel.jitter = 0.005;
  const scaleDegrees = song.mode === MusicMode.Major ? MajorScale : MinorScale;
  const center = mel.pickWeighted([64, 65, 67], [0.35, 0.4, 0.25]);
  const lowest = center - 7, highest = center + 9;
  const cellA = mel.pickWeighted(range(Cells.length, (i) => i), CellWeights);
  const cellB = mel.pickWeighted(range(Cells.length, (i) => i), CellWeights);
  const scaleFor = (ch) => {
    const out = [];
    for (let m = lowest - 3; m <= highest + 3; m++) {
      const pc = mod(m - song.key, 12);
      if (ch.has(m)) { out.push(m); continue; }
      if (!scaleDegrees.includes(pc)) continue;
      if (ch.tones.some((t) => mod(m - t, 12) === 1 || mod(t - m, 12) === 1)) continue;
      out.push(m);
    }
    return out;
  };

  function newMotif() {
    const motif = { onsets: [], durations: [], moves: [] };
    let pos = 0;
    while (pos < 12) {
      for (const step of Cells[mel.nextDouble() < 0.65 ? cellA : cellB]) {
        if (pos >= 12) break;
        motif.onsets.push(pos); pos += step;
      }
    }
    for (let i = 0; i < motif.onsets.length; i++)
      motif.durations.push(i + 1 < motif.onsets.length ? motif.onsets[i + 1] - motif.onsets[i] : 16 - motif.onsets[i]);
    // a heroic opening leap (a fourth or a fifth up) half the time, then mostly steps
    motif.moves.push(0);
    let last = 0;
    for (let i = 1; i < motif.onsets.length; i++) {
      let move;
      if (i === 1 && mel.nextDouble() < 0.5) move = mel.pick([3, 4]);
      else if (Math.abs(last) >= 3 && mel.nextDouble() < 0.8) move = -Math.sign(last) * mel.pickWeighted([1, 2], [0.7, 0.3]);
      else if (mel.nextDouble() < 0.12) move = mel.pick([-1, 1]) * mel.range(2, 4);
      else move = mel.pickWeighted([-2, -1, 1, 2, 0], [0.15, 0.32, 0.3, 0.13, 0.1]);
      motif.moves.push(move); last = move;
    }
    return motif;
  }

  let previous = -1;
  function realize(motif, bar0, target, resolve, voices) {
    let p = -1;
    const count = motif.onsets.length;
    for (let i = 0; i < count; i++) {
      const e = motif.onsets[i], d = motif.durations[i];
      const beats = bar0 * bpb + e / 2;
      const ch = chords[Math.trunc(beats / bpb)];
      const scale = scaleFor(ch).filter((m) => m >= lowest && m <= highest);
      if (p < 0) p = nearest(scale.filter((m) => ch.has(m)), target);
      else {
        const all = scaleFor(ch);
        let j = all.indexOf(nearest(all, p)) + motif.moves[i];
        if (j < 0 || j >= all.length || all[j] < lowest || all[j] > highest) j -= 2 * motif.moves[i];
        p = all[Math.min(Math.max(j, 0), all.length - 1)];
      }
      const strong = e % 8 === 0 || d >= 4 || i === count - 1;
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
      const v = 0.62 + (d >= 4 ? 0.1 : 0) + 0.1 * mel.nextDouble();
      for (const [inst, shift, g] of voices) {
        // one breath (bow) per motif: every note but the first is tied to the one before
        const held = i + 1 < count ? d / 2 + 0.1 : d / 2 * 0.95;
        add(mel, beats, inst, p + shift, held, g * velocity(v), { slur: i > 0 });
      }
    }
  }

  const plans = [[[0, 0], [0, 0], [1, 0], [0, 0]], [[0, 0], [1, 0], [0, 0], [1, 0]], [[0, 0], [0, 2], [1, 0], [1, 0]]];
  const planA = plans[mel.pickWeighted([0, 1, 2], [0.4, 0.35, 0.25])];
  const planB = plans[mel.pickWeighted([0, 1, 2], [0.4, 0.35, 0.25])];
  const first = newMotif();
  const motifsA = [first, mel.nextDouble() < 0.5 ? { ...first, moves: first.moves.map((m) => -m) } : newMotif()];
  const motifsB = [newMotif(), newMotif()];
  // a voice's register: the horns and cellos an octave below the theme (VSCO has no held horn note
  // between C4 and D5, and that is where they sound heroic), the trumpets on it, the violins on it
  // when they lead and an octave above when they double
  // Trim: a held note's loudness measured against the horns' (the violin section is tuned for soft pads).
  const Trim = { [I.Strings]: 0.39, [I.Cello]: 0.84, [I.Trumpet]: 0.84 };
  const lead = (inst, g, doubling = false) =>
    [inst, inst === I.Cello || inst === I.Horns ? -12 : inst === I.Strings && doubling ? 12 : 0, g * (Trim[inst] ?? 1)];
  const MelodyGain = 0.14;
  for (const s of sections) {
    let voices, motifs, planS;
    if (s.kind === 'A') { voices = [lead(song.leadA, MelodyGain * (s.n ? 1.3 : 1.2))]; motifs = motifsA; planS = planA; }
    else if (s.kind === 'C') {
      // the violins, an octave up, stand out more than the brass: kept lower
      const second = (inst) => MelodyGain * (inst === I.Strings ? 0.55 : 0.8);
      voices = [lead(doubles[0], 1.25 * MelodyGain, true), lead(doubles[1], 1.25 * second(doubles[1]), true)];
      if (s.n > 0) voices.push(lead(doubles[0] === I.Horns && doubles[1] !== I.Trumpet ? I.Trumpet : I.Horns, MelodyGain * 0.5, true));
      motifs = motifsA; planS = planA;
    } else if (s.kind === 'B' && bMelody) { voices = [[I.Cello, -12, MelodyGain * 0.8]]; motifs = motifsB; planS = planB; }
    else continue;
    let target = center;
    for (let k = 0; k < 4; k++) {
      const [which, climb] = planS[k];
      realize(motifs[which], s.bar + 2 * k, target + climb, k === 3, voices);
      target = Math.min(Math.max(previous + mel.pick([-2, 0, 2]), center - 4), center + 5);
    }
  }

  // ---- percussion
  role = Role.Drums;
  const perc = new MusicRng(seed * 31 + 4); perc.jitter = 0.002;
  const timp = (ch, fifth = false) => { const pc = fifth ? (ch.root + 7) % 12 : ch.root; return 45 + mod(pc - 45, 12); };
  const tHit = (beats, ch, g, fifth = false) => add(perc, beats, I.Timpani, timp(ch, fifth), 4, 0.7 * g * velocity(0.85 + 0.1 * perc.nextDouble()), { alt: alt(I.Timpani) });
  const cHit = bigDrums ? (beats, g, strong = false) => add(perc, beats, I.Drums, (strong ? 38 : 36) + (alt(I.Drums) ? 1 : 0), 6, 0.9 * g) : () => {};
  for (let b = 0; b <= finalBar; b++) {
    const s = sectionAt[b], ch = chords[b], k = intensity(b), i = b - s.bar, t0 = b * bpb;
    if (b === finalBar) {
      // the last chord: a roll that swells in, the gong and the cymbal
      add(perc, t0 - 0.5, I.TimpaniRoll, timp(ch), 2 * bpb - 0.5, 0.11, { attack: 1.2 });
      tHit(t0, ch, 0.11);
      add(perc, t0, I.Cymbals, 60, 10, 0.075);
      add(perc, t0, I.Cymbals, 51, 8, 0.05);
      if (bigDrums) add(perc, t0, I.Drums, 38, 6, 0.09);
      break;
    }
    switch (s.kind) {
      case 'I':
        if (i === 0) tHit(t0, ch, 0.06);
        break;
      case 'A':
        tHit(t0, ch, 0.075 * k);
        if (i % 4 === 3) tHit(t0 + 2, ch, 0.06 * k, true);
        break;
      case 'B':
        tHit(t0, ch, 0.085 * k);
        tHit(t0 + 2, ch, 0.07 * k, true);
        if (i === 7) add(perc, t0, I.TimpaniRoll, timp(ch), bpb, 0.12, { attack: 3.2 * beat });
        if (i === 6 && snareRoll) add(perc, t0, I.Drums, 42, 2 * bpb, 0.07, { attack: 7.5 * beat });
        if (i === 4) cHit(t0, 0.05);
        break;
      case 'C': {
        const pattern = brassRhythm === 'tresillo' ? [0, 1.5, 3] : [0, 2, 2.5, 3];
        for (const at of pattern) tHit(t0 + at, ch, (at === 0 ? 0.09 : 0.068) * k, at === 3 && pattern.length === 3);
        if (i % 4 === 3) for (let j = 0; j < 4; j++) tHit(t0 + 2 + j * 0.5, ch, (0.06 + 0.012 * j) * k, j % 2 === 1);
        cHit(t0, 0.085, i % 4 === 0);
        cHit(t0 + 2, 0.06);
        if (brassRhythm === 'tresillo') cHit(t0 + 1.5, 0.05);
        if (i === 0) {
          add(perc, t0, I.Cymbals, alt(I.Cymbals) ? 53 : 54, 8, 0.075);
          add(perc, t0, I.Cymbals, 49, 8, 0.06);
        } else if (i === 4) add(perc, t0, I.Cymbals, 51, 8, 0.045);
        break;
      }
      case 'O':
        tHit(t0, ch, 0.08 * k);
        break;
    }
  }
  // a cymbal swell that peaks on the first beat of each climax (the longest that fits after the build starts)
  for (const s of sections) {
    if (s.kind !== 'C') continue;
    const room = (s.n === 0 ? 4 : 2) * song.barSeconds;
    const [midi, peak] = Swells.find(([, p]) => p <= room) || Swells[Swells.length - 1];
    add(null, s.bar * bpb - peak / beat, I.Cymbals, midi, (peak + 2.5) / beat, s.n === 0 ? 0.07 : 0.05);
  }

  notes.sort((a, b) => a.time - b.time);
  song.notes = notes;
  return song;
}
