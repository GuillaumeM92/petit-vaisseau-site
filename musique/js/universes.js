// The universes: the first choice on the page. Each has its music (the styles its pieces are
// composed in), its theme (colours and visualizer) and the settings that make sense for it. The ones
// still to come are shown greyed out ("coming soon"). A piece's universe follows from its style, so
// every existing id and share link keeps working.
import { MusicStyle } from '../engine/styles.js';
import { Leads, Accomps } from '../engine/composer.js';
import { CinematicLeads } from '../engine/cinematic.js';
import { ChiptuneLeads } from '../engine/chiptune.js';
import { AmbientLeads } from '../engine/ambient.js';

// Settings shown for a universe: its soloists, how many moods (major, minor, dorian…), whether the
// accompaniment, the room and the drums can be chosen.
export const Universes = [
  // The game's six styles: a seed alone picks among them (same pieces as in Le Tapis Vert).
  { id: 'classique', theme: 'lights', styles: [0, 1, 2, 3, 4, 5], leads: Leads, accomps: Accomps, moods: 5, room: true },
  { id: 'cinematique', theme: 'embers', styles: [MusicStyle.Cinematic], leads: CinematicLeads, moods: 2, room: true },
  { id: 'chiptune', theme: 'pixels', styles: [MusicStyle.Chiptune], leads: ChiptuneLeads, moods: 3, room: false },
  { id: 'ambiance', theme: 'aurora', styles: [MusicStyle.Ambient], leads: AmbientLeads, moods: 5, room: false, drums: false },
  { id: 'fantaisie', soon: true },
  { id: 'lofi', soon: true },
  { id: 'synthwave', soon: true },
];

export const universe = (id) => Universes.find((u) => u.id === id && !u.soon) || Universes[0];
export const universeOfSong = (song) => Universes.find((u) => !u.soon && u.styles.includes(song.style)) || Universes[0];
