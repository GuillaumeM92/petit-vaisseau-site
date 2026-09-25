// The fantasy style (style 9, only on the site): a tavern band in a fantasy world. A dance tune in two
// parts (A played twice, B played twice) in an old mode, as a jig (6/8), a reel (4/4) or a dance in
// three; the band plays it round after round, the tune passing from the flute to the fiddle and then
// to everyone, the piccolo on top. A harp and a bouncing bass underneath, sometimes a drone like a
// bagpipe's, a frame drum and a tambourine.
//
// Same principles as the other styles: a seed decides everything, each layer has its own random
// stream, plain triads; the long and accented notes of the tune are the chord's, only quick passing
// notes step between them (as in the tunes it imitates), and the drone keeps quiet when it would rub.
import { MusicRng } from './rng.js';
import { InstrumentId as I, InstrumentCount, Instruments } from './instruments.js';
import { MusicMode, MusicRoom, MusicStyle } from './styles.js';

const Role = { Accompaniment: 1, Bass: 2, Pad: 3, Melody: 4, Color: 5, Drums: 6 }; // composer.js NoteRole

const Keys = [0, 2, 4, 5, 7, 9]; // the keys fiddles and whistles like: C, D, E, F, G, A
const NoteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const M = MusicMode;
const Scales = {
  [M.Major]: [0, 2, 4, 5, 7, 9, 11], [M.Minor]: [0, 2, 3, 5, 7, 8, 10], [M.Dorian]: [0, 2, 3, 5, 7, 9, 10],
  [M.Mixolydian]: [0, 2, 4, 5, 7, 9, 10],
};
const Degrees = {
  I: [0, 4], i: [0, 3], ii: [2, 3], bIII: [3, 4], IV: [5, 4], iv: [5, 3], V: [7, 4], v: [7, 3],
  bVI: [8, 4], vi: [9, 3], bVII: [10, 4],
};
// 4-bar progressions (one chord a bar); a part plays one twice, its last bar coming home.
const Progressions = {
  [M.Dorian]: { A: [['i', 'i', 'bVII', 'bVII'], ['i', 'bVII', 'i', 'bVII'], ['i', 'IV', 'i', 'bVII'], ['i', 'i', 'IV', 'bVII']],
    B: [['bIII', 'bVII', 'i', 'i'], ['bVII', 'bVII', 'i', 'i'], ['IV', 'IV', 'i', 'bVII'], ['bIII', 'IV', 'bVII', 'i']] },
  [M.Mixolydian]: { A: [['I', 'I', 'bVII', 'bVII'], ['I', 'bVII', 'IV', 'I'], ['I', 'IV', 'bVII', 'I'], ['I', 'I', 'IV', 'bVII']],
    B: [['bVII', 'bVII', 'I', 'I'], ['IV', 'IV', 'I', 'bVII'], ['IV', 'bVII', 'I', 'I'], ['v', 'bVII', 'I', 'I']] },
  [M.Minor]: { A: [['i', 'bVII', 'bVI', 'bVII'], ['i', 'i', 'bVII', 'bVII'], ['i', 'bIII', 'bVII', 'i'], ['i', 'iv', 'bVII', 'i']],
    B: [['bIII', 'bVII', 'i', 'i'], ['bVI', 'bVII', 'i', 'i'], ['bIII', 'bVII', 'bVI', 'bVII'], ['iv', 'bVII', 'bIII', 'i']] },
  [M.Major]: { A: [['I', 'IV', 'V', 'I'], ['I', 'I', 'IV', 'V'], ['I', 'V', 'IV', 'V'], ['I', 'vi', 'IV', 'V']],
    B: [['IV', 'I', 'V', 'I'], ['vi', 'IV', 'V', 'I'], ['IV', 'V', 'I', 'I'], ['ii', 'V', 'I', 'I']] },
};
const HomeChord = { [M.Major]: 'I', [M.Mixolydian]: 'I', [M.Dorian]: 'i', [M.Minor]: 'i' };

// The dances: eighths in a bar, beats in a bar (the beat the tempo counts), tempo range, rhythm cells
// of the tune (in eighths, one bar each; the last ones end a phrase) and rounds of the tune.
const Dances = {
  jig: { eighths: 6, beats: 2, tempo: [100, 118], rounds: 3,
    cells: [[1, 1, 1, 1, 1, 1], [2, 1, 2, 1], [2, 1, 1, 1, 1], [1, 1, 1, 2, 1]], weights: [0.4, 0.3, 0.18, 0.12], ends: [[3, 3], [2, 1, 3]] },
  reel: { eighths: 8, beats: 4, tempo: [100, 116], rounds: 2,
    cells: [[1, 1, 1, 1, 1, 1, 1, 1], [2, 1, 1, 2, 1, 1], [1, 1, 2, 1, 1, 2], [2, 2, 1, 1, 1, 1]], weights: [0.45, 0.2, 0.18, 0.17], ends: [[2, 2, 4], [1, 1, 2, 4]] },
  dance: { eighths: 6, beats: 3, tempo: [126, 150], rounds: 3,
    cells: [[2, 2, 2], [2, 1, 1, 2], [1, 1, 1, 1, 2], [3, 1, 2]], weights: [0.3, 0.25, 0.2, 0.25], ends: [[2, 4], [4, 2]] },
};

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
const rubs = (ch, m) => !ch.has(m) && ch.tones.some((t) => mod(m - t, 12) === 1 || mod(t - m, 12) === 1);

export const FantasyLeads = [I.FluteStac, I.Fiddle, I.Flute, I.Oboe];
export const FantasyDances = ['jig', 'reel', 'dance']; // its variants (the listener's "style")
export const FantasyTempo = [100, 150];

export function composeFantasy(seed, o) {
  const plan = new MusicRng(seed);
  const song = { seed, style: MusicStyle.Fantasy, uses: new Array(InstrumentCount).fill(false) };
  const pick = (drawn, value) => value >= 0 ? value : drawn;

  // ---- plan
  const danceName = FantasyDances[pick(plan.pickWeighted([0, 1, 2], [0.4, 0.35, 0.25]), o.Variant) % 3];
  const dance = Dances[danceName];
  song.key = pick(plan.pick(Keys), o.Key);
  const tempo = plan.range(dance.tempo[0], dance.tempo[1] + 1);
  song.tempo = o.TempoFeel === 's' ? dance.tempo[0] : o.TempoFeel === 'f' ? dance.tempo[1] : tempo;
  const mode = plan.pickWeighted([M.Dorian, M.Mixolydian, M.Minor, M.Major], [0.35, 0.25, 0.25, 0.15]);
  song.mode = o.Mode >= 0 ? (o.Mode === M.Lydian ? M.Major : o.Mode) : mode;
  const P = Progressions[song.mode];
  const progA = P.A[plan.range(0, P.A.length)], progB = P.B[plan.range(0, P.B.length)];
  song.leadA = pick(plan.pickWeighted(FantasyLeads, [0.35, 0.35, 0.15, 0.15]), o.LeadA);
  const others = [I.Fiddle, I.FluteStac, I.Oboe].filter((l) => l !== song.leadA);
  song.leadB = plan.pick(others);
  const bassInst = plan.nextDouble() < 0.55 ? I.BassoonStac : I.Bass;
  const accomp = plan.pickWeighted(['arp', 'strum'], [0.55, 0.45]);
  const drone = plan.nextDouble() < 0.55;
  const drums = o.Drums === -2 ? false : o.Drums >= 0 || plan.nextDouble() < 0.85;
  const longIntro = plan.nextDouble() < 0.4;
  song.room = pick(plan.pickWeighted([MusicRoom.Salon, MusicRoom.Warm, MusicRoom.Studio], [0.4, 0.35, 0.25]), o.Room);
  song.beatsPerBar = dance.beats;
  song.accomp = I.Harp; song.leadA2 = song.leadB; song.hasBass = true; song.bass = bassInst; song.pad = drone ? I.Bassoon : -1;
  song.plan = { dance: danceName, accomp, drone, drums, bass: Instruments[bassInst].Name, lead: Instruments[song.leadA].Name, second: Instruments[song.leadB].Name };

  const E = dance.eighths;
  const eighth = 60 / song.tempo / (danceName === 'jig' ? 3 : 2);
  song.barSeconds = eighth * E;

  // ---- form: an intro, the tune (AABB) round after round, the last chord
  const home = HomeChord[song.mode];
  const part = (prog) => [...prog, ...prog.slice(0, 3), home];
  const degrees = [], sections = [];
  const intro = longIntro ? 4 : 2;
  sections.push({ label: 'Intro', bar: 0, kind: 'I', round: -1 });
  for (let b = 0; b < intro; b++) degrees.push(home);
  for (let r = 0; r < dance.rounds; r++)
    for (const [kind, prog] of [['A', progA], ['A', progA], ['B', progB], ['B', progB]]) {
      sections.push({ label: kind + (r ? String(r + 1) : ''), bar: degrees.length, kind, round: r });
      degrees.push(...part(prog));
    }
  const lastBar = degrees.length;
  sections.push({ label: 'Outro', bar: lastBar, kind: 'O', round: dance.rounds });
  degrees.push(home, home);
  const bars = degrees.length;
  const chords = degrees.map((d) => chordOf(song.key, d));
  song.form = sections.map((s) => s.kind).join('');
  song.chordNames = chords.map((c) => c.name);
  song.sections = sections.map((s) => ({ label: s.label, bar: s.bar }));
  song.length = bars * song.barSeconds;
  const sectionAt = (b) => [...sections].reverse().find((s) => s.bar <= b);

  const notes = [];
  let role = 0;
  const Level = 0.8; // the band, measured against the other universes
  function add(human, eighths, instrument, midi, durationEighths, gain, extra = null) {
    const info = Instruments[instrument];
    const note = { time: Math.max(0, eighths * eighth + (human ? human.normal() * 0.006 : 0)), instrument, midi,
      duration: fround(durationEighths * eighth), gain: fround(gain * Level), pan: info.Pan, send: info.Send, role, slur: false };
    if (extra) Object.assign(note, extra);
    notes.push(note);
    song.uses[instrument] = true;
  }
  const takes = new Uint8Array(InstrumentCount);
  const alt = (instrument) => (takes[instrument] ^= 1) === 0;

  // ---- the tune: an 8-bar part is four 2-bar phrases, a b a c (c coming home), for A and for B
  role = Role.Melody;
  const mel = new MusicRng(seed * 31 + 3);
  const scaleDegrees = Scales[song.mode];
  const center = mel.pickWeighted([74, 76, 77], [0.35, 0.4, 0.25]); // the flutes' recorded staccato starts at A4
  const scale = [];
  for (let m = 55; m <= 96; m++) if (scaleDegrees.includes(mod(m - song.key, 12))) scale.push(m);
  const cellOf = () => mel.pickWeighted(range(dance.cells.length, (i) => i), dance.weights);

  // a phrase: two bars of rhythm and a contour of scale steps
  function newPhrase(ending) {
    const onsets = [], durations = [];
    for (let bar = 0; bar < 2; bar++) {
      const cell = bar === 1 && ending ? mel.pick(dance.ends) : dance.cells[cellOf()];
      let pos = bar * E;
      for (const d of cell) { onsets.push(pos); durations.push(d); pos += d; }
    }
    const moves = [0];
    let dir = mel.pick([-1, 1]);
    for (let i = 1; i < onsets.length; i++) {
      if (mel.nextDouble() < 0.28) dir = -dir; // turns, as in the tunes
      moves.push(mel.nextDouble() < 0.12 ? dir * 2 : dir); // mostly steps, some skips of a third
    }
    return { onsets, durations, moves };
  }
  const tune = (lift) => {
    const a = newPhrase(false), b = newPhrase(false), c = newPhrase(true);
    return { phrases: [a, b, a, c], lift };
  };
  const tuneA = tune(0), tuneB = tune(mel.pick([3, 4, 5]));

  // plays a part of the tune from `bar0` for these voices ([instrument, shift, gain])
  function playPart(t, bar0, voices) {
    let p = -1;
    t.phrases.forEach((ph, k) => {
      const last = k === 3;
      ph.onsets.forEach((e, i) => {
        const at = (bar0 + 2 * k) * E + e;
        const b = Math.trunc(at / E), ch = chords[b];
        const strong = e % (danceName === 'reel' ? 4 : danceName === 'jig' ? 3 : 2) === 0 || ph.durations[i] >= 2;
        if (p < 0 || (i === 0 && k % 2 === 0)) p = nearest(scale.filter((m) => ch.has(m)), center + t.lift);
        else {
          let j = scale.indexOf(nearest(scale, p)) + ph.moves[i];
          const lo = center + t.lift - 7, hi = center + t.lift + 9;
          if (scale[j] === undefined || scale[j] < lo || scale[j] > hi) j -= 2 * ph.moves[i];
          p = scale[Math.min(Math.max(j, 0), scale.length - 1)];
        }
        if (strong) { const near = scale.filter((m) => ch.has(m) && Math.abs(m - p) <= 4); p = near.length ? nearest(near, p) : nearest(scale.filter((m) => ch.has(m)), p); }
        else if (rubs(ch, p) && ph.durations[i] > 1) p = nearest(scale.filter((m) => !rubs(ch, m)), p);
        if (last && i === ph.onsets.length - 1) p = nearest(scale.filter((m) => mod(m, 12) === ch.root), p);
        // within the tune's compass (the same note an octave away if it strayed)
        while (p < center + t.lift - 7) p += 12;
        while (p > center + t.lift + 12) p -= 12;
        const d = ph.durations[i];
        for (const [inst, shift, g] of voices) {
          const held = inst === I.Flute || inst === I.Oboe ? d * 0.92 : d; // the short samples ring as recorded
          add(mel, at, inst, p + shift, held, g * (strong ? 1 : 0.85), inst === I.Fiddle || inst === I.FluteStac ? { alt: alt(inst) } : null);
        }
      });
    });
  }

  const G = 0.1;
  // each voice's level in a running tune, measured (the short samples are dense and loud)
  const trim = { [I.Oboe]: 1.26, [I.Flute]: 1.26, [I.FluteStac]: 0.53, [I.Fiddle]: 0.4, [I.Piccolo]: 1.8 };
  for (const s of sections) {
    if (s.kind !== 'A' && s.kind !== 'B') continue;
    const t = s.kind === 'A' ? tuneA : tuneB;
    const r = s.round, second = s.bar !== sections.find((x) => x.kind === s.kind && x.round === r).bar;
    const voices = [];
    if (r === 0) voices.push([second && s.kind === 'B' ? song.leadB : song.leadA, 0, G]);
    else if (r === dance.rounds - 1) {
      voices.push([song.leadA, 0, G * 0.85], [song.leadB, 0, G * 0.7]);
      if (s.kind === 'B') voices.push([I.Piccolo, 12, G * 0.45]);
    } else voices.push([s.kind === 'A' ? song.leadB : song.leadA, 0, G], ...(second ? [[song.leadA, 0, G * 0.55]] : []));
    playPart(t, s.bar, voices.map(([inst, sh, g]) => [inst, sh, g * (trim[inst] ?? 1)]));
  }

  // ---- the harp: arpeggios or a "boom-chuck"
  role = Role.Accompaniment;
  const acc = new MusicRng(seed * 31 + 1);
  for (let b = 0; b < bars; b++) {
    const ch = chords[b], t0 = b * E, r = lowRoot(ch, 48);
    if (b >= lastBar) { if (b === lastBar) [r - 12, r, r + 7, r + 12 + ch.thirdInterval].forEach((m, j) => add(acc, t0 + j * 0.25, I.Harp, m, 8, 0.03)); continue; }
    if (b < intro && !longIntro) continue;
    const g = 0.028;
    if (accomp === 'arp') {
      const shape = E === 6 ? [0, 7, 12, 12 + ch.thirdInterval, 12, 7] : [0, 7, 12, 12 + ch.thirdInterval, 19, 12 + ch.thirdInterval, 12, 7];
      shape.forEach((iv, k) => add(acc, t0 + k, I.Harp, r + iv, 2.5, g * (k === 0 ? 1 : 0.75)));
    } else {
      // "boom-chuck": a low note on the beat, the chord (quickly rolled) between
      const strum = { jig: [[0, 0], [2, -1], [3, 7], [5, -1]], reel: [[0, 0], [2, -1], [4, 7], [6, -1]], dance: [[0, 0], [2, -1], [4, -1]] }[danceName];
      for (const [k, iv] of strum) {
        if (iv >= 0) add(acc, t0 + k, I.Harp, r - 12 + iv, 2, g);
        else for (const [j, m] of [r, r + ch.thirdInterval, r + 7].entries()) add(acc, t0 + k + j * 0.06, I.Harp, m + 12, 1.2, g * 0.6);
      }
    }
  }

  // ---- the bass: a note a beat, root and fifth
  role = Role.Bass;
  for (let b = intro; b < bars; b++) {
    const ch = chords[b], t0 = b * E, r = lowRoot(ch, 36);
    const bg = bassInst === I.Bass ? 0.045 : 0.04;
    if (b >= lastBar) { if (b === lastBar) add(null, t0, bassInst, r, 6, bg); continue; }
    const beat = danceName === 'jig' ? 3 : danceName === 'dance' ? E : 2; // in three, only on the first beat
    for (let k = 0, n = 0; k < E; k += beat, n++)
      add(acc, t0 + k, bassInst, n % 2 ? r + 7 : r, bassInst === I.Bass ? beat * 1.05 : beat * 0.8, bg * (n ? 0.85 : 1), bassInst === I.BassoonStac ? { alt: alt(bassInst) } : null);
  }

  // ---- the drone: the key's tonic and fifth held by the bassoon, silent where it would rub
  role = Role.Pad;
  if (drone) {
    for (const [iv, g] of [[0, 0.035], [7, 0.025]]) {
      const m = 38 + mod(song.key + iv - 38, 12);
      let from = -1;
      for (let b = 0; b <= lastBar; b++) {
        const ok = b < lastBar && !rubs(chords[b], m) && sectionAt(b).kind !== 'B';
        if (ok && from < 0) from = b;
        if (!ok && from >= 0) { add(null, from * E, I.Bassoon, m, (b - from) * E + 0.5, g); from = -1; }
      }
      add(null, lastBar * E, I.Bassoon, m, 2 * E, g);
    }
  }

  // ---- the drums: a frame drum on the beats and a tambourine
  role = Role.Drums;
  const D = 0.4; // the kit's level against the band
  if (drums) {
    const beat = danceName === 'jig' ? 3 : 2;
    for (let b = intro - 2; b < lastBar; b++) {
      const t0 = b * E, s = sectionAt(b);
      const quiet = s.kind === 'I' || (s.round === 0 && s.kind === 'A' && s.bar === sections.find((x) => x.kind === 'A').bar);
      for (let k = 0, n = 0; k < E; k += beat, n++) {
        add(null, t0 + k, I.Folk, n === 0 ? 36 + (alt(I.Folk) ? 1 : 0) : 38 + (b % 2), 4, D * (n === 0 ? 0.09 : 0.06));
        if (quiet) continue;
        add(null, t0 + k, I.Folk, 42 + (b % 2), 4, D * 0.05);
        for (let e = 1; e < beat; e++) add(null, t0 + k + e, I.Folk, 44 + ((k + e) % 2), 4, D * 0.03);
      }
      if (!quiet && b % 4 === 3) add(null, t0 + E - 1, I.Folk, 46 + (b % 8 === 7 ? 1 : 0), 4, D * 0.04);
    }
    add(null, lastBar * E, I.Folk, 36, 4, D * 0.1);
    add(null, lastBar * E, I.Folk, 42, 4, D * 0.06);
  }

  notes.sort((a, b) => a.time - b.time);
  song.notes = notes;
  return song;
}
