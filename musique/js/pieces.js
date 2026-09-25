// A piece = a seed (the number the game uses) + the listener's quick choices, if any. Its id
// ("482113" or "482113-s3.l8.dn") is all it takes to play it again: favourites, history and share
// links store only that.
import { compose, styleOf, defaultOverrides, Off } from '../engine/composer.js';
import { getStyle, DrumsMode, MusicStyle } from '../engine/styles.js';
import { titleOf } from '../engine/titles.js';

export const MaxSeed = 1000000;

// Choice keys, as written in ids: s style, m mode, l lead, a accompaniment, t tempo (s/f),
// d drums (y/n), r room.
const Keys = { style: 's', mode: 'm', lead: 'l', accomp: 'a', tempo: 't', drums: 'd', room: 'r' };

export function pieceId(seed, choices = {}) {
  const parts = [];
  for (const [name, key] of Object.entries(Keys)) {
    const v = choices[name];
    if (v !== undefined && v !== null && v !== '') parts.push(key + v);
  }
  return parts.length ? `${seed}-${parts.join('.')}` : String(seed);
}

export function parsePieceId(id) {
  const [seedPart, rest] = String(id).split('-');
  const seed = Number(seedPart);
  if (!Number.isInteger(seed) || seed <= 0 || seed >= MaxSeed) return null;
  const choices = {};
  if (rest) {
    for (const part of rest.split('.')) {
      const name = Object.keys(Keys).find((n) => Keys[n] === part[0]);
      if (!name) continue;
      const value = part.substring(1);
      choices[name] = name === 'tempo' || name === 'drums' ? value : Number(value);
    }
  }
  return { seed, choices };
}

// The composer's overrides for these choices.
export function overridesFor(seed, choices) {
  const o = defaultOverrides();
  if (choices.style !== undefined) o.Style = choices.style;
  if (choices.mode !== undefined) o.Mode = choices.mode;
  if (choices.lead !== undefined) { o.LeadA = choices.lead; o.LeadB = choices.lead; }
  if (choices.accomp !== undefined) o.Accomp = choices.accomp;
  if (choices.room !== undefined) o.Room = choices.room;
  if (choices.drums === 'y') o.Drums = DrumsMode.FromA;
  if (choices.drums === 'n') o.Drums = Off;
  if (choices.tempo && choices.style === MusicStyle.Cinematic) o.TempoFeel = choices.tempo;
  else if (choices.tempo) {
    const style = getStyle(choices.style ?? styleOf(seed));
    o.Tempo = choices.tempo === 's' ? style.TempoMin : style.TempoMax;
  }
  return o;
}

const cache = new Map();

// The composed piece (kept: composing takes a few milliseconds).
export function songFor(id) {
  let song = cache.get(id);
  if (!song) {
    const p = parsePieceId(id);
    if (!p) return null;
    song = compose(p.seed, overridesFor(p.seed, p.choices));
    song.pieceId = id;
    cache.set(id, song);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }
  return song;
}

export const pieceTitle = (id, lang) => titleOf(songFor(id), lang);

export function randomSeed(avoid = 0) {
  let seed;
  do seed = 1 + Math.floor(Math.random() * (MaxSeed - 1)); while (seed === avoid);
  return seed;
}
