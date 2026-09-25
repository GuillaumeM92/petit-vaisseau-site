// The six styles and five rooms, converted from the game's MusicStyles.cs (keep in sync). Styles from
// 6 on exist only on the site and have their own composer (engine/cinematic.js, chiptune.js); a seed alone still
// picks among the first six (parity with the game), the new ones are asked for by the piece's id.
export const MusicStyle = { Ballad: 0, Waltz: 1, Classical: 2, Relaxing: 3, Cozy: 4, Contemplative: 5, Cinematic: 6, Chiptune: 7 };
export const StyleNames = ['Ballad', 'Waltz', 'Classical', 'Relaxing', 'Cozy', 'Contemplative', 'Cinematic', 'Chiptune'];
export const MusicMode = { Major: 0, Minor: 1, Dorian: 2, Mixolydian: 3, Lydian: 4 };
export const ModeNames = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Lydian'];
export const MusicRoom = { Studio: 0, Salon: 1, Hall: 2, Warm: 3, Open: 4, Dry: 5 };
export const RoomNames = ['Studio', 'Salon', 'Hall', 'Warm', 'Open', 'Dry'];
export const AccompPattern = { Arpeggio: 0, SlowArpeggio: 1, Rolled: 2, Held: 3, Waltz: 4, Alberti: 5 };
export const ColorLayer = { None: 0, Sparkles: 1, HarpSweep: 2, Countermelody: 3 };
export const DrumsMode = { None: 0, FromA: 1, FromB: 2 };

import { InstrumentId as I } from './instruments.js';
const Piano = I.Piano, Harp = I.Harp, Marimba = I.Marimba, Strings = I.Strings, Violin = I.Violin, Flute = I.Flute,
  Clarinet = I.Clarinet, Oboe = I.Oboe, Horn = I.Horn, Cello = I.Cello;
const { Major, Minor, Dorian, Mixolydian, Lydian } = MusicMode;
const { Studio, Salon, Hall, Warm, Open } = MusicRoom;

export const AllStyles = [0, 1, 2, 3, 4, 5];
export const StyleWeights = [.28, .12, .14, .16, .16, .14];

const RoomDefs = [
  { RoomSize: .75, Damping: .5, Wet: 1, ToneHz: 0, Width: 1, Gain: 1 },         // studio: the mix validated by ear
  { RoomSize: .55, Damping: .65, Wet: .7, ToneHz: 9000, Width: .85, Gain: 1.07 },  // salon: small, close, warm
  { RoomSize: .9, Damping: .35, Wet: 1.4, ToneHz: 12000, Width: 1.15, Gain: .85 }, // hall: large and airy
  { RoomSize: .7, Damping: .7, Wet: .9, ToneHz: 4500, Width: .9, Gain: 1.06 },    // warm: soft, muffled treble
  { RoomSize: .6, Damping: .3, Wet: .55, ToneHz: 0, Width: 1.2, Gain: 1.06 },     // open: dry, wide and clear
  { RoomSize: .35, Damping: .6, Wet: .18, ToneHz: 0, Width: 1, Gain: 1 },          // dry: the console's (site only)
];

const Defaults = {
  BeatsPerBar: 4, Intro: ['I', 'IV'], LongIntro: ['I', 'IV', 'I', 'V'], Outro: ['IV', 'I'], LongIntroChance: 0.3,
  CelloBassChance: 0, NoBassChance: 0, PadChance: 0, Drums: [DrumsMode.None], DrumWeights: [1], SparseDrums: false, Diatonic: false,
};

const Defs = [
    // Ballad: the reference validated by ear.
    {
        TempoMin: 70, TempoMax: 82,
        ProgressionsA: [
            [ "I", "V", "vi", "IV", "I", "V", "IV", "IV" ], [ "I", "vi", "IV", "V", "I", "vi", "IV", "V" ],
            [ "I", "IV", "vi", "V", "I", "IV", "V", "V" ], [ "vi", "IV", "I", "V", "vi", "IV", "I", "V" ],
            [ "I", "iii", "IV", "I", "IV", "I", "ii", "V" ], [ "I", "V", "vi", "iii", "IV", "I", "IV", "V" ],
        ],
        ProgressionsB: [
            [ "vi", "IV", "I", "V", "vi", "IV", "Vsus", "V" ], [ "IV", "V", "iii", "vi", "IV", "V", "I", "I" ],
            [ "ii", "V", "I", "vi", "ii", "IV", "Vsus", "V" ], [ "IV", "I", "V", "vi", "IV", "I", "V", "V" ],
            [ "vi", "V", "IV", "V", "vi", "V", "IV", "Vsus" ],
        ],
        Accomps: [ Piano, Harp, Marimba, Strings ], AccompWeights: [ .45, .3, .1, .15 ],
        Patterns: [ AccompPattern.Arpeggio, AccompPattern.SlowArpeggio, AccompPattern.Rolled ], PatternWeights: [ .55, .25, .2 ],
        Leads: [ Piano, Flute, Violin, Clarinet, Oboe, Harp, Marimba, Horn ], LeadWeights: [ .26, .16, .14, .11, .09, .08, .06, .1 ],
        CelloBassChance: .25, PadChance: .45,
        Colors: [ ColorLayer.None, ColorLayer.Sparkles, ColorLayer.HarpSweep, ColorLayer.Countermelody ], ColorWeights: [ .35, .25, .2, .2 ],
        Drums: [ DrumsMode.None, DrumsMode.FromA, DrumsMode.FromB ], DrumWeights: [ .15, .5, .35 ],
        Modes: [ Major, Minor, Dorian, Mixolydian, Lydian ], ModeWeights: [ .45, .22, .12, .11, .1 ],
        RhythmCells: [ [ 2, 2 ], [ 4 ], [ 3, 1 ], [ 2, 1, 1 ], [ 6, 2 ], [ 1, 1, 2 ] ],
        RhythmCellWeights: [ .25, .2, .15, .12, .14, .14 ],
        Rooms: [ Studio, Salon, Hall, Warm, Open ], RoomWeights: [ .3, .2, .2, .15, .15 ],
        Forms: [ "IABAO", "IAABAO", "IABABO" ], FormWeights: [ .5, .25, .25 ],
    },
    // Waltz: three beats, bass on one, chords on two and three.
    {
        BeatsPerBar: 3, TempoMin: 132, TempoMax: 150,
        Intro: [ "I", "I", "IV", "V" ], LongIntro: [ "I", "I", "IV", "V" ], Outro: [ "IV", "V", "I", "I" ],
        ProgressionsA: [
            [ "I", "I", "IV", "I", "V", "V", "I", "I" ], [ "I", "vi", "IV", "V", "I", "vi", "ii", "V" ],
            [ "I", "IV", "I", "V", "I", "IV", "V", "I" ], [ "I", "iii", "IV", "V", "I", "iii", "IV", "V" ],
        ],
        ProgressionsB: [
            [ "vi", "vi", "IV", "I", "ii", "ii", "V", "V" ], [ "IV", "IV", "I", "I", "ii", "V", "I", "I" ],
            [ "vi", "IV", "I", "V", "IV", "I", "Vsus", "V" ],
        ],
        Accomps: [ Piano, Harp, Marimba ], AccompWeights: [ .5, .35, .15 ],
        Patterns: [ AccompPattern.Waltz, AccompPattern.Arpeggio ], PatternWeights: [ .75, .25 ],
        Leads: [ Violin, Flute, Clarinet, Piano, Oboe, Marimba, Horn, Harp ], LeadWeights: [ .22, .18, .15, .15, .1, .08, .07, .05 ],
        CelloBassChance: .1, PadChance: .3,
        Colors: [ ColorLayer.None, ColorLayer.Sparkles, ColorLayer.HarpSweep ], ColorWeights: [ .5, .3, .2 ],
        Drums: [ DrumsMode.None, DrumsMode.FromA, DrumsMode.FromB ], DrumWeights: [ .45, .3, .25 ],
        Modes: [ Major, Minor, Lydian ], ModeWeights: [ .55, .35, .1 ],
        RhythmCells: [ [ 2, 2, 2 ], [ 4, 2 ], [ 6 ], [ 2, 4 ], [ 3, 1, 2 ] ],
        RhythmCellWeights: [ .3, .25, .15, .15, .15 ],
        Rooms: [ Studio, Salon, Hall, Warm ], RoomWeights: [ .3, .3, .25, .15 ],
        Forms: [ "IAABBAO", "IAABABAO" ], FormWeights: [ .5, .5 ],
    },
    // Classical: Alberti bass, diatonic melody, cadences.
    {
        TempoMin: 84, TempoMax: 100,
        ProgressionsA: [
            [ "I", "IV", "V", "I", "I", "ii", "V", "I" ], [ "I", "vi", "ii", "V", "I", "vi", "IV", "V" ],
            [ "I", "V", "vi", "iii", "IV", "I", "IV", "V" ], [ "I", "I", "IV", "IV", "V", "V", "I", "I" ],
        ],
        ProgressionsB: [
            [ "vi", "ii", "V", "I", "IV", "ii", "Vsus", "V" ], [ "V", "I", "IV", "I", "ii", "V", "I", "V" ],
            [ "vi", "iii", "IV", "I", "ii", "V", "I", "I" ],
        ],
        Accomps: [ Piano, Harp ], AccompWeights: [ .6, .4 ],
        Patterns: [ AccompPattern.Alberti, AccompPattern.Arpeggio, AccompPattern.Rolled ], PatternWeights: [ .6, .25, .15 ],
        Leads: [ Violin, Flute, Oboe, Clarinet, Piano, Horn, Cello ], LeadWeights: [ .22, .2, .15, .13, .15, .1, .05 ],
        CelloBassChance: .5, PadChance: .35,
        Colors: [ ColorLayer.None, ColorLayer.Countermelody, ColorLayer.HarpSweep, ColorLayer.Sparkles ], ColorWeights: [ .45, .3, .15, .1 ],
        Drums: [ DrumsMode.None, DrumsMode.FromB ], DrumWeights: [ .65, .35 ], SparseDrums: true,
        Diatonic: true,
        Modes: [ Major, Minor ], ModeWeights: [ .65, .35 ],
        RhythmCells: [ [ 1, 1 ], [ 2 ], [ 3, 1 ], [ 1, 1, 2 ], [ 4 ], [ 2, 1, 1 ] ],
        RhythmCellWeights: [ .2, .25, .15, .15, .1, .15 ],
        Rooms: [ Studio, Salon, Hall ], RoomWeights: [ .3, .3, .4 ],
        Forms: [ "IAABBAO", "IABABAO" ], FormWeights: [ .5, .5 ],
    },
    // Relaxing: slow, airy, long notes.
    {
        TempoMin: 60, TempoMax: 70, LongIntroChance: .5, Outro: [ "IV", "IV", "I", "I" ],
        ProgressionsA: [
            [ "I", "IV", "I", "IV", "vi", "IV", "I", "V" ], [ "I", "iii", "vi", "IV", "I", "iii", "IV", "IV" ],
            [ "IV", "I", "IV", "I", "vi", "V", "IV", "IV" ],
        ],
        ProgressionsB: [
            [ "vi", "IV", "I", "V", "vi", "IV", "IV", "I" ], [ "IV", "vi", "I", "V", "IV", "vi", "Vsus", "V" ],
        ],
        Accomps: [ Harp, Piano, Strings ], AccompWeights: [ .4, .35, .25 ],
        Patterns: [ AccompPattern.SlowArpeggio, AccompPattern.Rolled, AccompPattern.Arpeggio ], PatternWeights: [ .5, .3, .2 ],
        Leads: [ Flute, Piano, Clarinet, Harp, Violin, Horn, Oboe ], LeadWeights: [ .25, .2, .15, .12, .1, .1, .08 ],
        CelloBassChance: .5, NoBassChance: .2, PadChance: .6,
        Colors: [ ColorLayer.None, ColorLayer.Sparkles, ColorLayer.HarpSweep ], ColorWeights: [ .4, .3, .3 ],
        Drums: [ DrumsMode.None, DrumsMode.FromB ], DrumWeights: [ .5, .5 ], SparseDrums: true,
        Modes: [ Major, Lydian, Dorian, Mixolydian ], ModeWeights: [ .5, .25, .15, .1 ],
        RhythmCells: [ [ 4 ], [ 6, 2 ], [ 8 ], [ 2, 6 ], [ 4, 4 ] ],
        RhythmCellWeights: [ .3, .2, .2, .15, .15 ],
        Rooms: [ Studio, Hall, Warm, Open ], RoomWeights: [ .25, .35, .2, .2 ],
        Forms: [ "IABAO", "IABBAO" ], FormWeights: [ .6, .4 ],
    },
    // Cozy: a little livelier, warm woodwinds and marimba.
    {
        TempoMin: 84, TempoMax: 96,
        ProgressionsA: [
            [ "I", "vi", "IV", "V", "I", "vi", "IV", "V" ], [ "I", "V", "vi", "IV", "I", "V", "IV", "V" ],
            [ "I", "IV", "vi", "V", "I", "IV", "V", "I" ],
        ],
        ProgressionsB: [
            [ "IV", "V", "iii", "vi", "IV", "V", "I", "I" ], [ "vi", "IV", "I", "V", "vi", "IV", "Vsus", "V" ],
        ],
        Accomps: [ Piano, Marimba, Harp ], AccompWeights: [ .45, .25, .3 ],
        Patterns: [ AccompPattern.Arpeggio, AccompPattern.Rolled, AccompPattern.SlowArpeggio ], PatternWeights: [ .4, .35, .25 ],
        Leads: [ Clarinet, Flute, Marimba, Piano, Oboe, Violin, Horn ], LeadWeights: [ .2, .18, .15, .15, .12, .1, .1 ],
        CelloBassChance: .15, PadChance: .25,
        Colors: [ ColorLayer.None, ColorLayer.Sparkles, ColorLayer.HarpSweep, ColorLayer.Countermelody ], ColorWeights: [ .35, .35, .15, .15 ],
        Drums: [ DrumsMode.None, DrumsMode.FromA, DrumsMode.FromB ], DrumWeights: [ .15, .5, .35 ],
        Modes: [ Major, Mixolydian, Dorian, Minor ], ModeWeights: [ .55, .2, .15, .1 ],
        RhythmCells: [ [ 2 ], [ 1, 1, 2 ], [ 3, 1 ], [ 4 ], [ 2, 1, 1 ] ],
        RhythmCellWeights: [ .3, .2, .2, .15, .15 ],
        Rooms: [ Studio, Salon, Warm, Open ], RoomWeights: [ .25, .35, .25, .15 ],
        Forms: [ "IABAO", "IAABAO", "IABABAO" ], FormWeights: [ .4, .3, .3 ],
    },
    // Contemplative: slow, on the relative minor side, sparse.
    {
        TempoMin: 56, TempoMax: 66, LongIntroChance: .5,
        Intro: [ "vi", "IV" ], LongIntro: [ "vi", "IV", "vi", "V" ], Outro: [ "IV", "IV", "vi", "vi" ],
        ProgressionsA: [
            [ "vi", "IV", "I", "V", "vi", "IV", "I", "V" ], [ "vi", "iii", "IV", "I", "vi", "iii", "IV", "V" ],
            [ "vi", "V", "IV", "V", "vi", "V", "IV", "IV" ],
        ],
        ProgressionsB: [
            [ "IV", "I", "V", "vi", "IV", "I", "Vsus", "V" ], [ "ii", "vi", "IV", "I", "ii", "vi", "V", "V" ],
        ],
        Accomps: [ Piano, Harp, Strings ], AccompWeights: [ .5, .3, .2 ],
        Patterns: [ AccompPattern.Rolled, AccompPattern.SlowArpeggio, AccompPattern.Arpeggio ], PatternWeights: [ .4, .45, .15 ],
        Leads: [ Piano, Violin, Cello, Oboe, Horn, Flute ], LeadWeights: [ .3, .2, .15, .12, .12, .11 ],
        CelloBassChance: .6, NoBassChance: .15, PadChance: .55,
        Colors: [ ColorLayer.None, ColorLayer.Countermelody, ColorLayer.Sparkles, ColorLayer.HarpSweep ], ColorWeights: [ .5, .2, .15, .15 ],
        Drums: [ DrumsMode.None, DrumsMode.FromB ], DrumWeights: [ .55, .45 ], SparseDrums: true,
        Modes: [ Major, Lydian ], ModeWeights: [ .6, .4 ],   // on vi, lydian's II major gives a dorian minor
        RhythmCells: [ [ 4 ], [ 6, 2 ], [ 8 ], [ 2, 2, 4 ], [ 3, 1, 4 ] ],
        RhythmCellWeights: [ .3, .2, .2, .15, .15 ],
        Rooms: [ Studio, Hall, Warm ], RoomWeights: [ .3, .45, .25 ],
        Forms: [ "IABAO", "IAABO" ], FormWeights: [ .6, .4 ],
    },
    // Cinematic: composed by engine/cinematic.js; only its tempo range is read from here.
    { TempoMin: 80, TempoMax: 124 },
    // Chiptune: composed by engine/chiptune.js; only its tempo range is read from here.
    { TempoMin: 116, TempoMax: 156 },
].map(d => ({ ...Defaults, ...d }));

export const getStyle = (style) => Defs[style];
export const getRoom = (room) => RoomDefs[room];
