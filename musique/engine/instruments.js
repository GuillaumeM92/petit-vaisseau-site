// The recorded instruments (notes/<Name>/<midi>[_L<loopStart>_<loopEnd>].wav), with the game's
// level matching (MusicInstruments.cs, keep in sync).
export const InstrumentId = {
  Piano: 0, Bass: 1, Harp: 2, Marimba: 3, Glockenspiel: 4, Violin: 5, Strings: 6, Cello: 7, Flute: 8, Clarinet: 9, Oboe: 10, Horn: 11,
  Kick: 12, Tap: 13,
  // Only in the new styles (made by tools/bake-notes.py from VSCO 2 CE): the cinematic orchestra.
  Trumpet: 14, Trombone: 15, Tuba: 16, Horns: 17, ViolinsSpic: 18, ViolasSpic: 19, CellosSpic: 20, BassesSpic: 21,
  Timpani: 22, TimpaniRoll: 23, Cymbals: 24, Drums: 25,
};

export const InstrumentCount = 26;

// Gain: level matching (includes the files' headroom); Attack/Release in seconds (Attack 0 keeps
// the recording's own); MelodyShift: semitones added to the melody when it leads; Pan, Send: default
// placement and reverb send.
export const Instruments = [
  { Name: 'Piano', Gain: 1.121, Attack: 0, Release: 0.3, Pan: 0, Send: 0.35, MelodyShift: 0 },
  { Name: 'Bass', Gain: 1.1, Attack: 0, Release: 0.15, Pan: 0, Send: 0.1, MelodyShift: 0 },
  { Name: 'Harp', Gain: 1.265, Attack: 0, Release: 0.8, Pan: -0.15, Send: 0.4, MelodyShift: 0 },
  { Name: 'Marimba', Gain: 7.47, Attack: 0, Release: 0.3, Pan: 0.1, Send: 0.3, MelodyShift: 0 },
  { Name: 'Glockenspiel', Gain: 1.499, Attack: 0, Release: 0.8, Pan: 0.25, Send: 0.5, MelodyShift: 0 },
  { Name: 'Violin', Gain: 1.0, Attack: 0.04, Release: 0.25, Pan: 0.15, Send: 0.45, MelodyShift: 0 },
  { Name: 'Strings', Gain: 1.296, Attack: 0.25, Release: 0.45, Pan: -0.1, Send: 0.5, MelodyShift: 0 },
  { Name: 'Cello', Gain: 0.861, Attack: 0.06, Release: 0.3, Pan: -0.05, Send: 0.25, MelodyShift: -12 },
  { Name: 'Flute', Gain: 0.374, Attack: 0.03, Release: 0.15, Pan: 0.15, Send: 0.45, MelodyShift: 0 },
  { Name: 'Clarinet', Gain: 0.405, Attack: 0.02, Release: 0.12, Pan: 0.15, Send: 0.4, MelodyShift: 0 },
  { Name: 'Oboe', Gain: 0.45, Attack: 0.02, Release: 0.12, Pan: 0.15, Send: 0.4, MelodyShift: 0 },
  { Name: 'Horn', Gain: 0.472, Attack: 0.06, Release: 0.2, Pan: -0.1, Send: 0.45, MelodyShift: -12 },
  { Name: 'Kick', Gain: 0.513, Attack: 0, Release: 0, Pan: 0, Send: 0.05, MelodyShift: 0 },
  { Name: 'Tap', Gain: 0.418, Attack: 0, Release: 0, Pan: -0.1, Send: 0.4, MelodyShift: 0 },
  // Gains measured so that a held note matches the horn and strings above, and a short one (spiccato,
  // hits) the piano's attack. Placed as an orchestra on a scoring stage: violins left, cellos and basses
  // right, horns left of centre, trumpets and low brass right. The kits' midi numbers are articulations
  // (see engine/cinematic.js).
  { Name: 'Trumpet', Gain: 0.447, Attack: 0, Release: 0.2, Pan: 0.15, Send: 0.45, MelodyShift: 0 },
  { Name: 'Trombone', Gain: 0.44, Attack: 0, Release: 0.25, Pan: 0.3, Send: 0.45, MelodyShift: 0 },
  { Name: 'Tuba', Gain: 0.51, Attack: 0, Release: 0.25, Pan: 0.35, Send: 0.4, MelodyShift: 0 },
  { Name: 'Horns', Gain: 0.46, Attack: 0, Release: 0.3, Pan: -0.2, Send: 0.5, MelodyShift: 0 },
  { Name: 'ViolinsSpic', Gain: 1.07, Attack: 0, Release: 0, Pan: -0.3, Send: 0.4, MelodyShift: 0 },
  { Name: 'ViolasSpic', Gain: 1.23, Attack: 0, Release: 0, Pan: 0.05, Send: 0.4, MelodyShift: 0 },
  { Name: 'CellosSpic', Gain: 1.08, Attack: 0, Release: 0, Pan: 0.25, Send: 0.35, MelodyShift: 0 },
  { Name: 'BassesSpic', Gain: 1.43, Attack: 0, Release: 0, Pan: 0.35, Send: 0.3, MelodyShift: 0 },
  { Name: 'Timpani', Gain: 1.62, Attack: 0, Release: 0, Pan: -0.05, Send: 0.45, MelodyShift: 0 },
  { Name: 'TimpaniRoll', Gain: 0.65, Attack: 0, Release: 0.5, Pan: -0.05, Send: 0.45, MelodyShift: 0 },
  { Name: 'Cymbals', Gain: 0.97, Attack: 0, Release: 1.5, Pan: 0.1, Send: 0.5, MelodyShift: 0 },
  { Name: 'Drums', Gain: 2.95, Attack: 0, Release: 0.3, Pan: -0.1, Send: 0.4, MelodyShift: 0 },
];
