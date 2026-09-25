// The universes: the first choice on the page. Each has its music (the styles its pieces are
// composed in), its theme (colours and visualizer) and the settings that make sense for it. The ones
// still to come are shown greyed out ("coming soon"). A piece's universe follows from its style, so
// every existing id and share link keeps working.
import { MusicStyle } from '../engine/styles.js';

export const Universes = [
  // The game's six styles: a seed alone picks among them (same pieces as in Le Tapis Vert).
  { id: 'classique', theme: 'lights', styles: [0, 1, 2, 3, 4, 5] },
  { id: 'cinematique', theme: 'embers', styles: [MusicStyle.Cinematic] },
  { id: 'chiptune', soon: true },
  { id: 'ambiance', soon: true },
  { id: 'fantaisie', soon: true },
  { id: 'lofi', soon: true },
  { id: 'synthwave', soon: true },
];

export const universe = (id) => Universes.find((u) => u.id === id && !u.soon) || Universes[0];
export const universeOfSong = (song) => Universes.find((u) => !u.soon && u.styles.includes(song.style)) || Universes[0];
