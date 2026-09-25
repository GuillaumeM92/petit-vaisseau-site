// The lo-fi style (style 10, only on the site): a slow beat to study to. A four-bar loop of chords
// played lazily on a muffled piano or an electric piano, an upright bass on the kick, a boom-bap beat
// with swung hats, a few notes of melody laid back behind the beat, the crackle of a record under it
// all. The beat comes in after the keys, drops out for a break and leaves before the end.
//
// Same principles as the other styles: a seed decides everything, each layer has its own random stream.
// Its two variants: jazzy (the default: soft sevenths, the genre's colour) and simple (plain triads).
// Only the round sevenths are used, major on major chords and minor on minor ones; the dominant chords
// (V, bVII) keep their triad, the dominant seventh's tritone being the tense, bluesy sound avoided here.
import { MusicRng } from './rng.js';
import { InstrumentId as I, InstrumentCount, Instruments } from './instruments.js';
import { MusicMode, MusicRoom, MusicStyle } from './styles.js';

const Role = { Accompaniment: 1, Bass: 2, Pad: 3, Melody: 4, Color: 5, Drums: 6 }; // composer.js NoteRole

export const LofiVariants = ['jazzy', 'simple'];

const Keys = [0, 2, 3, 5, 7, 8, 9, 10];
const NoteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const M = MusicMode;
const Pentatonics = { [M.Major]: [0, 2, 4, 7, 9], [M.Minor]: [0, 3, 5, 7, 10], [M.Dorian]: [0, 3, 5, 7, 9], [M.Mixolydian]: [0, 2, 4, 7, 10] };
// [semitones from the tonic, third, seventh added when jazzy (-1: none)]
const Degrees = {
  I: [0, 4, 11], i: [0, 3, 10], ii: [2, 3, 10], iii: [4, 3, 10], bIII: [3, 4, 11], IV: [5, 4, 11], iv: [5, 3, 10],
  V: [7, 4, -1], v: [7, 3, 10], bVI: [8, 4, 11], vi: [9, 3, 10], bVII: [10, 4, -1],
};
const Loops = {
  [M.Major]: [['I', 'iii', 'vi', 'IV'], ['IV', 'V', 'iii', 'vi'], ['I', 'vi', 'ii', 'V'], ['vi', 'IV', 'I', 'V'], ['IV', 'I', 'ii', 'vi']],
  [M.Minor]: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'iv', 'bVII', 'bIII'], ['i', 'bVII', 'bVI', 'bVII'], ['iv', 'i', 'bVI', 'bVII']],
  [M.Dorian]: [['i', 'IV', 'i', 'IV'], ['i', 'bIII', 'IV', 'i'], ['i', 'IV', 'bVII', 'bIII']],
  [M.Mixolydian]: [['I', 'bVII', 'IV', 'I'], ['IV', 'bVII', 'I', 'I']],
};
// Drum patterns, one bar in sixteenths: [slot, hit, level] (36 kick, 38 snare, 37 rim, 42 hat, 46 open hat).
const Beats = [
  { name: 'boom-bap', hits: [[0, 36, 1], [7, 36, 0.6], [10, 36, 0.85], [4, 38, 1], [12, 38, 1]] },
  { name: 'lazy', hits: [[0, 36, 1], [10, 36, 0.8], [4, 38, 0.95], [12, 38, 0.95], [15, 36, 0.4]] },
  { name: 'rim', hits: [[0, 36, 1], [6, 36, 0.55], [9, 36, 0.75], [4, 37, 1], [12, 37, 1], [14, 37, 0.35]] },
];

const mod = (a, n) => ((a % n) + n) % n;
const fround = Math.fround;
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const nearest = (candidates, target) => candidates.reduce((b, m) => Math.abs(m - target) < Math.abs(b - target) ? m : b, candidates[0]);
const lowRoot = (ch, lo) => lo + mod(ch.root - lo, 12);

function chordOf(key, degree) {
  const [offset, third, seventh] = Degrees[degree];
  const root = (key + offset) % 12;
  const tones = [root, (root + third) % 12, (root + 7) % 12];
  return { root, tones, thirdInterval: third, seventh: seventh < 0 ? -1 : (root + seventh) % 12, name: NoteNames[root] + (third === 3 ? 'm' : ''),
    has: (m) => tones.includes(mod(m, 12)) };
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

export const LofiLeads = [I.Piano, I.EPiano];
export const LofiTempo = [70, 88];

export function composeLofi(seed, o) {
  const plan = new MusicRng(seed);
  const song = { seed, style: MusicStyle.Lofi, uses: new Array(InstrumentCount).fill(false), beatsPerBar: 4 };
  const pick = (drawn, value) => value >= 0 ? value : drawn;

  // ---- plan
  song.key = pick(plan.pick(Keys), o.Key);
  const tempo = plan.range(LofiTempo[0], LofiTempo[1] + 1);
  song.tempo = o.TempoFeel === 's' ? LofiTempo[0] : o.TempoFeel === 'f' ? LofiTempo[1] : tempo;
  const mode = plan.pickWeighted([M.Major, M.Minor, M.Dorian, M.Mixolydian], [0.35, 0.25, 0.25, 0.15]);
  song.mode = o.Mode >= 0 ? (o.Mode === M.Lydian ? M.Major : o.Mode) : mode;
  const loops = Loops[song.mode];
  const loop = loops[plan.range(0, loops.length)];
  const keysInst = plan.pickWeighted([I.EPiano, I.Piano], [0.55, 0.45]);
  song.leadA = pick(keysInst === I.EPiano ? I.Piano : I.EPiano, o.LeadA);
  const comp = plan.pickWeighted(['lazy', 'pulse', 'broken'], [0.45, 0.3, 0.25]);
  const beat = Beats[plan.pickWeighted(range(Beats.length, (i) => i), [0.45, 0.3, 0.25])];
  const swing = 0.56 + 0.06 * plan.nextDouble(); // the second sixteenth of each eighth comes late
  const drums = o.Drums === -2 ? false : o.Drums >= 0 || plan.nextDouble() < 0.9;
  const shaker = plan.nextDouble() < 0.35;
  const jazzy = LofiVariants[o.Variant >= 0 ? o.Variant % 2 : 0] === 'jazzy';
  song.room = pick(MusicRoom.Tape, o.Room);
  song.accomp = keysInst; song.leadB = song.leadA; song.leadA2 = song.leadA; song.hasBass = true; song.bass = I.Bass; song.pad = -1;
  song.plan = { keys: Instruments[keysInst].Name, comp, beat: drums ? beat.name : 'none', swing: swing.toFixed(2), jazzy };

  const beatSec = 60 / song.tempo;
  song.barSeconds = beatSec * 4;

  // ---- form: the loop, over and over, with the layers coming and going
  const plan16 = [['Intro', 4, { beat: 0, bass: 0, mel: 0 }], ['A', 8, { beat: 1, bass: 1, mel: 0 }], ['B', 8, { beat: 1, bass: 1, mel: 1 }],
    ['Break', 4, { beat: 0, bass: 1, mel: 1 }], ['B', 8, { beat: 1, bass: 1, mel: 2 }], ['A', 8, { beat: 1, bass: 1, mel: 0 }], ['Outro', 4, { beat: 0, bass: 0, mel: 0 }]];
  const degrees = [], sections = [];
  for (const [label, len, layers] of plan16) {
    sections.push({ label, bar: degrees.length, len, layers });
    for (let k = 0; k < len; k++) degrees.push(loop[k % 4]);
  }
  degrees.push(loop[0]); // the last chord, alone
  const bars = degrees.length;
  const chords = degrees.map((d) => chordOf(song.key, d));
  song.form = sections.map((s) => ({ Intro: 'I', Break: 'K', Outro: 'O' })[s.label] || s.label).join('');
  song.chordNames = chords.map((c) => c.name);
  song.sections = sections.map((s) => ({ label: s.label, bar: s.bar }));
  song.length = bars * song.barSeconds;
  const sectionAt = (b) => [...sections].reverse().find((s) => s.bar <= b) || sections[0];

  const notes = [];
  let role = 0;
  const Level = 1;
  // time in sixteenths, swung; `late` in seconds (laid back)
  const at16 = (s) => { const pair = Math.floor(s / 2), odd = s - pair * 2; return (pair * 2 + (odd ? 2 * swing * odd : 0)) * beatSec / 4; };
  function add(human, sixteenths, instrument, midi, durationSixteenths, gain, extra = null, late = 0) {
    const info = Instruments[instrument];
    const note = { time: Math.max(0, at16(sixteenths) + late + (human ? human.normal() * 0.008 : 0)), instrument, midi,
      duration: fround(durationSixteenths * beatSec / 4), gain: fround(gain * Level), pan: info.Pan, send: info.Send, role, slur: false };
    if (extra) Object.assign(note, extra);
    notes.push(note);
    song.uses[instrument] = true;
  }

  // ---- the keys: the loop's chords, rolled a little
  role = Role.Accompaniment;
  const keys = new MusicRng(seed * 31 + 1);
  let prev = null;
  const kg = keysInst === I.EPiano ? 0.08 : 0.04;
  // jazzy: the seventh on top of the triad (soft), where the chord takes one
  const chordNotes = (ch, v) => jazzy && ch.seventh >= 0 ? [...v, v[0] + mod(ch.seventh - v[0], 12)] : v;
  for (let b = 0; b < bars; b++) {
    const ch = chords[b], t0 = b * 16, last = b === bars - 1;
    const v = voice(ch, prev, 53, 62);
    prev = v;
    const low = lowRoot(ch, 43);
    const strum = (s, len, g) => chordNotes(ch, v).forEach((m, j) => add(keys, s, keysInst, m, len, g, null, j * 0.025));
    if (last) { add(keys, t0, keysInst, low, 16, kg * 0.8); strum(t0, 16, kg * 0.8); break; }
    if (comp === 'lazy') { strum(t0, 9, kg); strum(t0 + 10, 6, kg * 0.75); }
    else if (comp === 'pulse') { strum(t0, 5, kg); strum(t0 + 6, 4, kg * 0.7); strum(t0 + 10, 6, kg * 0.8); }
    else [0, 2, 1, 2, 0, 2, 1, 2].forEach((j, k) => add(keys, t0 + 2 * k, keysInst, v[j] + (k >= 4 && j === 2 ? 0 : 0), 3, kg * (k % 4 === 0 ? 0.9 : 0.7)));
    if (comp !== 'broken') add(keys, t0, keysInst, low, 14, kg * 0.7);
  }

  // ---- the bass: the upright, on the kick
  role = Role.Bass;
  const bassHits = beat.hits.filter(([, h]) => h === 36);
  for (let b = 0; b < bars; b++) {
    const s = sectionAt(b), ch = chords[b], t0 = b * 16, r = lowRoot(ch, 31);
    if (b === bars - 1) { add(null, t0, I.Bass, r, 12, 0.045); break; }
    if (!s.layers.bass) continue;
    bassHits.forEach(([slot, , lvl], k) => add(null, t0 + slot, I.Bass, k === bassHits.length - 1 && b % 2 ? r + 7 : r, 5, 0.055 * (0.7 + 0.3 * lvl)));
  }

  // ---- the melody: a few notes of the pentatonic, laid back
  role = Role.Melody;
  const mel = new MusicRng(seed * 31 + 3);
  const penta = [];
  for (let m = 64; m <= 86; m++) if (Pentatonics[song.mode].includes(mod(m - song.key, 12))) penta.push(m);
  const Cells = [[4, 4, 8], [2, 2, 4, 8], [6, 2, 8], [3, 3, 2, 8], [8, 4, 4]];
  const motifs = range(2, () => {
    const onsets = [], durs = [], moves = [0];
    let pos = mel.pick([0, 2, 4]);
    while (pos < 20) for (const d of mel.pick(Cells)) { if (pos >= 20) break; onsets.push(pos); durs.push(d); pos += d; }
    for (let i = 1; i < onsets.length; i++) moves.push(mel.pickWeighted([-2, -1, 1, 2, 0], [0.15, 0.3, 0.3, 0.15, 0.1]));
    return { onsets, durs, moves };
  });
  const center = mel.pick([72, 74, 76]);
  for (const s of sections) {
    if (!s.layers.mel) continue;
    for (let k = 0; k < s.len; k += 4) {
      const motif = motifs[(k / 4 + (s.layers.mel === 2 ? 1 : 0)) % 2];
      let p = -1;
      motif.onsets.forEach((e, i) => {
        const at = (s.bar + k) * 16 + e, ch = chords[Math.trunc(at / 16)];
        if (p < 0) p = nearest(penta.filter((m) => ch.has(m)), center);
        else {
          let j = penta.indexOf(nearest(penta, p)) + motif.moves[i];
          j = Math.min(Math.max(j, 0), penta.length - 1);
          p = penta[j];
        }
        if (motif.durs[i] >= 4) { const tones = penta.filter((m) => ch.has(m)); if (tones.length) p = nearest(tones, p); }
        add(mel, at, song.leadA, p, motif.durs[i] * 0.9, (song.leadA === I.EPiano ? 0.25 : 0.12) * (0.85 + 0.2 * mel.nextDouble()), null, 0.015 + 0.015 * mel.nextDouble());
      });
    }
  }

  // ---- the beat
  role = Role.Drums;
  const dr = new MusicRng(seed * 31 + 4);
  const D = 2; // the beat's level against the keys
  if (drums) {
    for (let b = 0; b < bars - 1; b++) {
      const s = sectionAt(b), t0 = b * 16;
      if (!s.layers.beat) continue;
      const fill = (b - s.bar) === s.len - 1;
      for (const [slot, hit, lvl] of beat.hits) {
        if (fill && hit === 36 && slot > 8) continue;
        // the snare a hair late, the rest on the grid
        add(null, t0 + slot, I.LofiKit, hit, 4, D * (hit === 36 ? 0.12 : 0.1) * lvl, null, hit === 36 ? 0 : 0.012);
      }
      for (let k = 0; k < 16; k += 2) {
        if (fill && k === 14) { add(null, t0 + k, I.LofiKit, 46, 4, D * 0.05); continue; }
        add(dr, t0 + k, I.LofiKit, 42, 2, D * 0.05 * (k % 4 === 0 ? 1 : 0.65) * (0.85 + 0.3 * dr.nextDouble()));
        if (dr.nextDouble() < 0.15) add(dr, t0 + k + 1, I.LofiKit, 42, 1, D * 0.02); // a ghost
      }
      if (shaker) for (let k = 1; k < 16; k += 2) add(dr, t0 + k, I.LofiKit, 70, 1, D * 0.025 * (0.8 + 0.4 * dr.nextDouble()));
    }
  }

  // ---- the record's crackle, all along
  role = Role.Color;
  add(null, 0, I.Vinyl, 60, bars * 16, 0.035);

  notes.sort((a, b) => a.time - b.time);
  song.notes = notes;
  return song;
}
