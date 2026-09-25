// The visualizer: every note of the piece becomes a soft light, its height the pitch, its colour
// the instrument, drifting left as the music moves on; the low end of the spectrum breathes in
// the background. Drawn from the composed notes themselves, so it is exactly in time.
// Each universe has its theme: Classique these lights, Cinématique embers
// (notes rise and cool down like sparks over a fire, the drums throw out bursts).
import { NoteRole } from '../engine/composer.js';
import { Instruments, InstrumentId as I } from '../engine/instruments.js';
import { MusicStyle } from '../engine/styles.js';

export const InstrumentColors = [
  '#f3c969', // piano
  '#6f8cff', // bass
  '#5fd4c4', // harp
  '#f59e5b', // marimba
  '#d6f4ff', // glockenspiel
  '#ff8fab', // violin
  '#b69cff', // strings
  '#c77dff', // cello
  '#9ef0b0', // flute
  '#7cc8ff', // clarinet
  '#ffb86b', // oboe
  '#e9967a', // horn
  '#efe7d6', // bass drum
  '#efe7d6', // taps
  '#ffd27a', // trumpet
  '#ffb057', // trombone
  '#e98a3c', // tuba
  '#ffc46b', // horns
  '#ff9a6b', // violins (spiccato)
  '#ff8a5c', // violas
  '#f0704a', // cellos
  '#d85a3a', // double basses
  '#fff1d6', // timpani
  '#fff1d6', // timpani rolls
  '#fff7e8', // cymbals
  '#ffe0c0', // drums
];

// In the embers, the instruments the cinematic style shares with the others take warm colours too.
const EmberColors = { [I.Strings]: '#ff7a6b', [I.Cello]: '#e8603f', [I.Horn]: '#ffc46b', [I.Violin]: '#ff9a6b' };

export const themeOf = (song) => song && song.style === MusicStyle.Cinematic ? 'embers' : 'lights';
export const colorOf = (instrument, theme) =>
  (theme === 'embers' && EmberColors[instrument]) || InstrumentColors[instrument];

// A fixed pseudo-random number in [0, 1) for a note and a purpose, so the embers move the same way
// on every frame without keeping any state.
const hash = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

const PastSeconds = 7;    // how long a note stays on screen after it starts
const NowX = 0.78;        // where "now" is, as a fraction of the width

export class Visualizer {
  // cover: the element drawn over the lower part of the canvas (the notes stay above it).
  constructor(canvas, player, cover) {
    this.canvas = canvas;
    this.cover = cover;
    this.ctx = canvas.getContext('2d');
    this.player = player;
    this.song = null;
    this.freq = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
  }

  setSong(song) { this.song = song; }

  // A soft round light of this colour, drawn once and reused (much cheaper than a gradient per note).
  sprite(color) {
    this.sprites ??= new Map();
    let c = this.sprites.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, hexA(color, 1));
      r.addColorStop(0.25, hexA(color, 0.55));
      r.addColorStop(1, hexA(color, 0));
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
      this.sprites.set(color, c);
    }
    return c;
  }

  energy() {
    const analyser = this.player.analyser;
    let energy = 0;
    if (analyser && this.player.playing) {
      this.freq ??= new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(this.freq);
      for (let i = 2; i < 40; i++) energy += this.freq[i];
      energy /= 38 * 255;
    }
    return energy;
  }

  draw() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, dpr = this.dpr;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (themeOf(this.song) === 'embers') return this.drawEmbers();

    // Breathing glow from the low end of the spectrum.
    const energy = this.energy();
    const glow = ctx.createRadialGradient(W * NowX, H * 0.3, 0, W * NowX, H * 0.3, W * 0.7);
    glow.addColorStop(0, `rgba(243, 201, 105, ${0.05 + energy * 0.14})`);
    glow.addColorStop(1, 'rgba(243, 201, 105, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // The "now" line.
    ctx.fillStyle = 'rgba(255, 244, 220, 0.08)';
    ctx.fillRect(W * NowX, 0, Math.max(1, dpr), H);

    const song = this.song;
    if (!song) return;
    // The free band above the cover (with a little overlap into its faded top).
    const free = Math.max(H * 0.3, H - (this.cover ? this.cover.offsetHeight * dpr * 0.8 : 0));
    const t = this.player.currentTime;
    const speed = (W * NowX) / PastSeconds;
    const notes = song.notes;

    // First note still on screen (notes are sorted by time).
    let lo = 0, hi = notes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].time < t - PastSeconds) lo = mid + 1; else hi = mid; }

    ctx.globalCompositeOperation = 'lighter';
    for (let i = lo; i < notes.length; i++) {
      const n = notes[i];
      if (n.time > t) break;
      const age = t - n.time;
      const x = W * NowX - age * speed;
      const drum = n.role === NoteRole.Drums;
      const y = drum ? free * 0.93 : free * (0.86 - (Math.min(Math.max(n.midi, 34), 100) - 34) / 66 * 0.74);
      const sounding = age < n.duration + Instruments[n.instrument].Release;
      const fade = Math.max(0, 1 - age / PastSeconds);
      const lead = n.role === NoteRole.Melody;
      const base = (lead ? 12 : n.role === NoteRole.Color ? 8 : drum ? 16 : 7) * dpr;
      const pulse = sounding ? 1 + 0.6 * Math.exp(-age * 5) : 1;
      const radius = base * pulse;
      const alpha = (sounding ? 0.95 : 0.45) * fade * (lead ? 1 : 0.75);
      const color = InstrumentColors[n.instrument];

      // A trail for held notes.
      if (!drum && n.duration > 0.3) {
        const len = Math.min(n.duration, age) * speed;
        ctx.strokeStyle = hexA(color, alpha * 0.35);
        ctx.lineWidth = Math.max(1, radius * 0.5);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
      g.addColorStop(0, hexA(color, alpha));
      g.addColorStop(0.35, hexA(color, alpha * 0.45));
      g.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Embers: each note is a spark that rises and cools (white-hot, then its colour, then out) while
  // the music flows left; held notes glow like a bar of hot metal; the timpani and drums throw out a
  // burst of sparks from the bottom, the cymbals a shimmer above; a fire breathes below with the bass.
  drawEmbers() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, dpr = this.dpr;
    const energy = this.energy();
    const t = this.player.currentTime;

    // the fire glows at the bottom of the band left free above the cover
    const free = Math.max(H * 0.3, H - (this.cover ? this.cover.offsetHeight * dpr * 0.8 : 0));
    const fire = ctx.createRadialGradient(W * NowX, free * 1.1, 0, W * NowX, free * 1.1, Math.max(W * 0.45, free * 1.3));
    fire.addColorStop(0, `rgba(255, 112, 40, ${0.12 + energy * 0.3})`);
    fire.addColorStop(0.4, `rgba(200, 60, 20, ${0.05 + energy * 0.12})`);
    fire.addColorStop(1, 'rgba(120, 30, 10, 0)');
    ctx.fillStyle = fire;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    // Drifting ash and faint embers, always there (the same ones every frame, moving with the time).
    const warm = this.sprite('#ff8c42');
    for (let k = 0; k < 36; k++) {
      const speed = 0.012 + 0.02 * hash(k, 1);
      const life = (t * speed + hash(k, 2)) % 1;
      const x = (hash(k, 3) + 0.04 * Math.sin(t * 0.4 + k)) * W;
      const y = free * (1.05 - life * 1.1);
      const r = (1.5 + 2.5 * hash(k, 4)) * dpr * (1 - life * 0.6);
      ctx.globalAlpha = 0.25 * Math.sin(Math.PI * life) * (0.6 + 0.4 * Math.sin(t * 3 + k * 1.7));
      ctx.drawImage(warm, x - r * 3, y - r * 3, r * 6, r * 6);
    }

    const song = this.song;
    if (!song) { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; return; }
    const speed = (W * NowX) / PastSeconds;
    const notes = song.notes;
    let lo = 0, hi = notes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].time < t - PastSeconds) lo = mid + 1; else hi = mid; }

    const white = this.sprite('#fff4e0');
    for (let i = lo; i < notes.length; i++) {
      const n = notes[i];
      if (n.time > t) break;
      const age = t - n.time;
      const xNow = W * NowX - age * speed;
      const color = colorOf(n.instrument, 'embers');
      const glow = this.sprite(color);
      const fade = Math.max(0, 1 - age / PastSeconds);
      const drum = n.role === NoteRole.Drums;

      if (drum) {
        // a burst: a flash, then sparks thrown up and falling back, cooling
        const cymbal = n.instrument === I.Cymbals;
        const roll = n.instrument === I.TimpaniRoll || (n.instrument === I.Drums && n.midi === 42);
        const y0 = cymbal ? free * 0.18 : free * 0.95;
        const strength = Math.min(1.4, n.gain / 0.06);
        if (roll) {
          // a roll: a low glow growing with the roll
          const grow = Math.min(1, age / Math.max(0.1, n.duration)) * (age < n.duration ? 1 : Math.exp(-(age - n.duration) * 2));
          const r = 60 * dpr * (0.6 + grow);
          ctx.globalAlpha = 0.18 * grow;
          ctx.drawImage(glow, xNow - r, y0 - r * 0.6, r * 2, r * 1.2);
          continue;
        }
        const flash = Math.exp(-age * (cymbal ? 1.2 : 4));
        const fr = (cymbal ? 90 : 46) * dpr * (0.7 + 0.3 * strength);
        ctx.globalAlpha = Math.min(1, 0.55 * flash * strength);
        ctx.drawImage(glow, xNow - fr, y0 - fr, fr * 2, fr * 2);
        const sparks = cymbal ? 14 : Math.round(5 + 5 * strength);
        const life = cymbal ? 2.6 : 1.8;
        if (age > life) continue;
        for (let k = 0; k < sparks; k++) {
          const a = cymbal ? Math.PI * 2 * hash(i, k) : -Math.PI * (0.15 + 0.7 * hash(i, k));
          const v = (cymbal ? 40 : 90 + 110 * hash(i, k + 50)) * dpr * (0.6 + 0.4 * strength);
          const x = xNow + Math.cos(a) * v * age;
          const y = y0 + Math.sin(a) * v * age + (cymbal ? 0 : 60 * dpr * age * age);
          const cool = age / life;
          const r = (3 - 1.8 * cool) * dpr;
          ctx.globalAlpha = (1 - cool) * 0.9;
          ctx.drawImage(cool < 0.25 ? white : glow, x - r * 3, y - r * 3, r * 6, r * 6);
        }
        continue;
      }

      const lead = n.role === NoteRole.Melody;
      const pitch = Math.min(Math.max(n.midi, 28), 96);
      const y0 = free * (0.9 - (pitch - 28) / 68 * 0.78);
      const sounding = age < n.duration + Instruments[n.instrument].Release;
      // held notes: a glowing bar that cools once the note ends
      if (n.duration > 0.45) {
        const len = Math.min(n.duration, age) * speed;
        const heat = sounding ? 1 : Math.exp(-(age - n.duration) * 1.5);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        ctx.strokeStyle = hexA(color, (lead ? 0.5 : 0.22) * heat * fade);
        ctx.lineWidth = (lead ? 4 : 2) * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(xNow, y0);
        ctx.lineTo(xNow + len, y0);
        ctx.stroke();
      }
      // the spark: rises, sways, cools from white to its colour, shrinks and goes out
      const rise = (lead ? 14 : 22 + 26 * hash(i, 7)) * dpr;
      const x = xNow + Math.sin(age * (1 + hash(i, 8)) + hash(i, 9) * 6) * 5 * dpr;
      const y = y0 - rise * age;
      const heat = Math.exp(-age * (lead ? 0.9 : 1.8));
      const base = (lead ? 12 : n.role === NoteRole.Accompaniment ? 4.4 : 7) * dpr;
      const r = base * (0.45 + 0.55 * heat) * (sounding && age < 0.12 ? 1.5 : 1);
      const flicker = 0.8 + 0.2 * Math.sin(t * 13 + i);
      ctx.globalAlpha = Math.min(1, (lead ? 1 : 0.7) * fade * (0.35 + 0.65 * heat) * flicker);
      ctx.drawImage(glow, x - r * 3, y - r * 3, r * 6, r * 6);
      if (heat > 0.35) {
        ctx.globalAlpha *= (heat - 0.35) * 1.5;
        ctx.drawImage(white, x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
