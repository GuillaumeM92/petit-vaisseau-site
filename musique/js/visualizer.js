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
  '#ff77a8', // thin pulse (an 8-bit console palette)
  '#29adff', // pulse
  '#ffec27', // square
  '#00e436', // triangle
  '#fff1e8', // noise
  '#6fe3c8', // pad (the aurora's colours)
  '#c9b6ff', // glass
  '#8fd3ff', // soft voice
  '#3f7fbf', // drone
  '#f2a65a', // fiddle (lantern light)
  '#ffd27a', // flute (staccato)
  '#fff0b0', // piccolo
  '#c98b4a', // bassoon
  '#c98b4a', // bassoon (staccato)
  '#f4dcb0', // frame drum and tambourine
  '#eaa6cf', // electric piano (city lights through the rain)
  '#9fb4ff', // lo-fi drums
  '#6b5a7a', // vinyl
  '#f3c969', // piano (soft layer)
];

// In the embers, the instruments the cinematic style shares with the others take warm colours too.
const EmberColors = { [I.Strings]: '#ff7a6b', [I.Cello]: '#e8603f', [I.Horn]: '#ffc46b', [I.Violin]: '#ff9a6b' };

export const themeOf = (song) => !song ? 'lights' : song.style === MusicStyle.Cinematic ? 'embers'
  : song.style === MusicStyle.Chiptune ? 'pixels' : song.style === MusicStyle.Ambient ? 'aurora'
  : song.style === MusicStyle.Fantasy ? 'lanterns' : song.style === MusicStyle.Lofi ? 'rain' : 'lights';
// In the lanterns, those it shares with the others take lantern colours.
const LanternColors = { [I.Harp]: '#e6c98a', [I.Bass]: '#b98552', [I.Flute]: '#d8f08a', [I.Oboe]: '#ffc27a' };
// On a rainy night, the piano is the desk lamp and the bass a deep blue.
const RainColors = { [I.Piano]: '#ffd6a0', [I.Bass]: '#8a7fd6' };
export const colorOf = (instrument, theme) =>
  (theme === 'embers' && EmberColors[instrument]) || (theme === 'lanterns' && LanternColors[instrument])
  || (theme === 'rain' && RainColors[instrument]) || InstrumentColors[instrument];

// A fixed pseudo-random number in [0, 1) for a note and a purpose, so the embers move the same way
// on every frame without keeping any state.
const hash = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

const PastSeconds = 7;    // how long a note stays on screen after it starts
const NowX = 0.78;        // where "now" is, as a fraction of the width

// The first note starting at or after `time` (notes are sorted by time).
const firstFrom = (notes, time) => {
  let lo = 0, hi = notes.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].time < time) lo = mid + 1; else hi = mid; }
  return lo;
};

export class Visualizer {
  // cover: the element drawn over the lower part of the stage; the canvas only covers the band left
  // free above it (and a little of its faded top), so no pixel is drawn for nothing.
  // On phones and tablets ("lite"): a lower resolution, 30 frames a second and fewer decorative
  // particles; everywhere, nothing is drawn while the stage is off screen or the page hidden.
  constructor(canvas, player, cover) {
    this.canvas = canvas;
    this.cover = cover;
    this.ctx = canvas.getContext('2d');
    this.player = player;
    this.song = null;
    this.freq = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lite = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
    this.visible = true;
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(canvas.parentElement);
    if (cover) resize.observe(cover);
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }).observe(canvas);
    this.resize();
    let last = 0;
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (!this.visible || document.hidden) return;
      if (this.lite && now - last < 30) return;
      last = now;
      this.draw();
    };
    requestAnimationFrame(loop);
  }

  resize() {
    const stage = this.canvas.parentElement.getBoundingClientRect();
    const band = Math.max(stage.height * 0.3, stage.height - (this.cover ? this.cover.offsetHeight * 0.8 : 0));
    this.canvas.style.height = `${Math.round(band)}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, this.lite ? 1.5 : 2);
    const w = Math.max(1, Math.round(stage.width * dpr)), h = Math.max(1, Math.round(band * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
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
    const theme = themeOf(this.song);
    if (theme === 'embers') return this.drawEmbers();
    if (theme === 'pixels') return this.drawPixels();
    if (theme === 'aurora') return this.drawAurora();
    if (theme === 'lanterns') return this.drawLanterns();
    if (theme === 'rain') return this.drawRain();

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
    const free = H; // the canvas is the band above the cover
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
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(this.sprite(color), x - radius * 3, y - radius * 3, radius * 6, radius * 6);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Rain: a window at night. Drops run down the glass; behind it the notes are the city's lights, out
  // of focus (big soft discs that drift away); the desk lamp's glow in the corner breathes with the kick.
  drawRain() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, dpr = this.dpr;
    const t = this.player.currentTime, clock = performance.now() / 1000;
    const energy = this.energy();
    const free = H;
    const song = this.song;

    let kick = 0;
    if (song) for (let i = firstFrom(song.notes, t - 0.5); i < song.notes.length; i++) {
      const n = song.notes[i];
      if (n.time > t) break;
      if (n.instrument === I.LofiKit && n.midi === 36 && t - n.time < 0.3) kick = Math.max(kick, 1 - (t - n.time) / 0.3);
    }
    const lamp = ctx.createRadialGradient(W * 0.08, free * 0.95, 0, W * 0.08, free * 0.95, Math.max(W * 0.45, free));
    lamp.addColorStop(0, `rgba(255, 190, 120, ${0.1 + energy * 0.12 + kick * 0.06})`);
    lamp.addColorStop(1, 'rgba(255, 150, 90, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    // the city's lights, out of focus behind the glass
    if (song) {
      const speed = (W * NowX) / PastSeconds;
      const notes = song.notes;
      let lo = 0, hi = notes.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].time < t - PastSeconds) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < notes.length; i++) {
        const n = notes[i];
        if (n.time > t) break;
        if (n.role === NoteRole.Drums || n.role === NoteRole.Color) continue;
        const age = t - n.time;
        const fade = Math.max(0, 1 - age / PastSeconds);
        const x = W * NowX - age * speed * 0.8 + (hash(i, 31) - 0.5) * 30 * dpr;
        const y = free * (0.86 - (Math.min(Math.max(n.midi, 30), 96) - 30) / 66 * 0.76) + (hash(i, 32) - 0.5) * 20 * dpr;
        const lead = n.role === NoteRole.Melody;
        const lit = age < n.duration + 0.3;
        const r = (lead ? 28 : n.role === NoteRole.Bass ? 30 : 20) * dpr * (1 + 0.15 * Math.min(1, age));
        ctx.globalAlpha = (lit ? 0.7 : 0.3) * fade * (lead ? 1 : 0.75);
        ctx.drawImage(this.sprite(colorOf(n.instrument, 'rain')), x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // drops running down the glass: a head and a thin trail, each at its own pace
    for (let k = 0, count = this.lite ? 28 : 45; k < count; k++) {
      const sp = 0.05 + 0.12 * hash(k, 41), life = (clock * sp + hash(k, 42)) % 1;
      const x = hash(k, 43) * W + Math.sin(life * 9 + k) * 2 * dpr;
      const y = life * (free * 1.1) - free * 0.05;
      const len = (8 + 26 * hash(k, 44)) * dpr;
      ctx.globalAlpha = 0.1 + 0.12 * hash(k, 45);
      ctx.strokeStyle = '#cfd8ff';
      ctx.lineWidth = Math.max(1, (0.6 + hash(k, 46)) * dpr);
      ctx.beginPath(); ctx.moveTo(x, y - len); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#e8eeff';
      ctx.beginPath(); ctx.arc(x, y, (1.2 + hash(k, 47)) * dpr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Lanterns: a tavern's garden at night. The tune's notes are paper lanterns hanging on a string,
  // swaying as they drift away; the quick notes around them are fireflies, blinking and wandering;
  // the bass warms the hearth's glow at the bottom and the drum makes it pulse.
  drawLanterns() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, dpr = this.dpr;
    const t = this.player.currentTime, clock = performance.now() / 1000;
    const energy = this.energy();
    const free = H;
    const song = this.song;

    // the hearth: its glow follows the bass and jumps with the drum
    let beat = 0;
    if (song) for (let i = firstFrom(song.notes, t - 0.5); i < song.notes.length; i++) {
      const n = song.notes[i];
      if (n.time > t) break;
      if (n.instrument === I.Folk && n.midi <= 37 && t - n.time < 0.4) beat = Math.max(beat, 1 - (t - n.time) / 0.4);
    }
    const hearth = ctx.createRadialGradient(W * 0.5, free * 1.15, 0, W * 0.5, free * 1.15, Math.max(W * 0.5, free));
    hearth.addColorStop(0, `rgba(255, 170, 70, ${0.08 + energy * 0.2 + beat * 0.08})`);
    hearth.addColorStop(1, 'rgba(120, 60, 20, 0)');
    ctx.fillStyle = hearth;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    if (!song) { ctx.globalCompositeOperation = 'source-over'; return; }
    const speed = (W * NowX) / PastSeconds;
    const notes = song.notes;
    let lo = 0, hi = notes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].time < t - PastSeconds) lo = mid + 1; else hi = mid; }
    const fly = this.sprite('#d8f08a');
    for (let i = lo; i < notes.length; i++) {
      const n = notes[i];
      if (n.time > t) break;
      if (n.role === NoteRole.Drums || n.role === NoteRole.Pad) continue;
      const age = t - n.time;
      const fade = Math.max(0, 1 - age / PastSeconds);
      const x0 = W * NowX - age * speed;
      const y0 = free * (0.86 - (Math.min(Math.max(n.midi, 36), 100) - 36) / 64 * 0.78);
      const color = colorOf(n.instrument, 'lanterns');
      const lit = age < n.duration + 0.2;
      if (n.role === NoteRole.Melody && (n.instrument !== I.Piccolo)) {
        // a lantern: it swings on its string, glows while its note sounds, then keeps a soft light
        const swing = Math.sin(clock * 1.6 + i) * 0.08 * Math.exp(-age * 0.3);
        const len = free * 0.12;
        const x = x0 + Math.sin(swing) * len, y = y0;
        ctx.globalAlpha = 0.18 * fade;
        ctx.strokeStyle = '#f4dcb0';
        ctx.lineWidth = dpr;
        ctx.beginPath(); ctx.moveTo(x0, y0 - len); ctx.lineTo(x, y - 5 * dpr); ctx.stroke();
        const r = (lit ? 11 : 8) * dpr * (age < 0.1 ? 1.25 : 1);
        ctx.globalAlpha = (lit ? 0.95 : 0.45) * fade;
        ctx.drawImage(this.sprite(color), x - r * 3, y - r * 3, r * 6, r * 6);
        ctx.globalAlpha = (lit ? 0.9 : 0.35) * fade;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.45, r * 0.6, swing, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      // a firefly: it wanders, blinks and fades out
      const x = x0 + Math.sin(clock * 0.9 + i * 1.7) * 10 * dpr;
      const y = y0 - age * 6 * dpr + Math.cos(clock * 1.1 + i) * 6 * dpr;
      const blink = 0.5 + 0.5 * Math.sin(clock * 5 + i * 2.3);
      const r = (n.instrument === I.Harp ? 2.5 : 3.5) * dpr;
      ctx.globalAlpha = Math.min(1, (age < 0.15 ? 1 : 0.35 + 0.5 * blink) * fade * (n.role === NoteRole.Melody ? 1 : 0.7));
      ctx.drawImage(n.role === NoteRole.Melody ? this.sprite(color) : fly, x - r * 3, y - r * 3, r * 6, r * 6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Aurora: a night sky. Veils of light wave slowly across it, brighter while the pad holds its chord
  // (and with the bass), the glass notes are stars that light up and fade, the voice leaves a soft
  // trail; a few faint stars are always there.
  drawAurora() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, dpr = this.dpr;
    const t = this.player.currentTime, clock = performance.now() / 1000;
    const energy = this.energy();
    const free = H;
    const song = this.song;

    // how much the pad is sounding now (its notes overlap: attack, hold, release)
    let pad = 0;
    if (song) for (let i = firstFrom(song.notes, t - 16); i < song.notes.length; i++) {
      const n = song.notes[i];
      if (n.time > t) break;
      if (n.instrument !== I.Pad || t > n.time + n.duration + 4) continue;
      const age = t - n.time;
      pad += (age < 2.5 ? age / 2.5 : age < n.duration ? 1 : Math.exp(-(age - n.duration) / 1.5)) * n.gain;
    }
    const glow = Math.min(1, pad / 0.12);

    ctx.globalCompositeOperation = 'lighter';
    // curtains of light, bright along their waving lower edge and fading upwards, drawn small and
    // enlarged smoothly (a soft blur for free: a quarter of the size keeps the streaks visible)
    const sw = Math.max(16, Math.round(W / 4)), sh = Math.max(8, Math.round(free / 4));
    this.aurora ??= document.createElement('canvas');
    const off = this.aurora;
    if (off.width !== sw || off.height !== sh) { off.width = sw; off.height = sh; }
    const a = off.getContext('2d');
    a.clearRect(0, 0, sw, sh);
    a.globalCompositeOperation = 'lighter';
    const bands = [['111, 227, 200', 0.52, 1], ['143, 125, 255', 0.4, 1.6], ['89, 184, 255', 0.64, 0.7]];
    bands.forEach(([rgb, at, f], k) => {
      const base = sh * at, height = sh * (0.45 - 0.06 * k);
      const alpha = (0.12 + 0.35 * glow + 0.2 * energy) * (k === 1 ? 0.7 : 1);
      const g = a.createLinearGradient(0, base + sh * 0.08, 0, base - height);
      g.addColorStop(0, `rgba(${rgb}, 0)`);
      g.addColorStop(0.15, `rgba(${rgb}, ${alpha})`);
      g.addColorStop(0.5, `rgba(${rgb}, ${alpha * 0.3})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      a.fillStyle = g;
      for (let x = 0; x < sw; x++) {
        const u = x / sw;
        const edge = base + Math.sin(u * Math.PI * 2 * f + clock * 0.12 * (k + 1) + k) * sh * 0.08
          + Math.sin(u * 11 + clock * 0.3 + k * 2) * sh * 0.025;
        const h = height * (0.75 + 0.25 * Math.sin(u * 9 + clock * 0.2 + k * 3));
        a.globalAlpha = 0.55 + 0.45 * Math.sin(u * 23 + clock * 0.15 * (k + 1) + k) ** 2;
        a.fillRect(x, edge - h, 1, h + sh * 0.08);
      }
    });
    // faded out towards the bottom of the band (under the title), never cut
    a.globalCompositeOperation = 'destination-in';
    a.globalAlpha = 1;
    const fadeOut = a.createLinearGradient(0, 0, 0, sh);
    fadeOut.addColorStop(0, 'rgba(0, 0, 0, 1)');
    fadeOut.addColorStop(0.7, 'rgba(0, 0, 0, 1)');
    fadeOut.addColorStop(1, 'rgba(0, 0, 0, 0)');
    a.fillStyle = fadeOut;
    a.fillRect(0, 0, sw, sh);
    a.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, W, free);

    // the fixed faint stars
    const star = this.sprite('#e8f4ff');
    for (let k = 0, count = this.lite ? 20 : 40; k < count; k++) {
      const r = (0.8 + 1.2 * hash(k, 21)) * dpr;
      ctx.globalAlpha = 0.12 + 0.12 * Math.sin(clock * (0.5 + hash(k, 22)) + k);
      ctx.drawImage(star, hash(k, 23) * W - r * 3, hash(k, 24) * free * 0.9 - r * 3, r * 6, r * 6);
    }

    if (song) {
      const speed = (W * NowX) / PastSeconds;
      const notes = song.notes;
      const past = PastSeconds * 1.6;
      let lo = 0, hi = notes.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].time < t - past) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < notes.length; i++) {
        const n = notes[i];
        if (n.time > t) break;
        if (n.instrument === I.Pad || n.instrument === I.Drone) continue;
        const age = t - n.time;
        const x = W * NowX - age * speed * 0.6;
        const y = free * (0.88 - (Math.min(Math.max(n.midi, 55), 100) - 55) / 45 * 0.8);
        const color = colorOf(n.instrument, 'aurora');
        if (n.instrument === I.SoftVoice) {
          const len = Math.min(n.duration, age) * speed * 0.6;
          const sounding = age < n.duration + 1.5;
          ctx.globalAlpha = (sounding ? 0.5 : 0.25) * Math.max(0, 1 - age / past);
          ctx.strokeStyle = color;
          ctx.lineWidth = 3 * dpr;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
          const r = 10 * dpr;
          ctx.globalAlpha = sounding ? 0.9 : 0.3 * Math.max(0, 1 - age / past);
          ctx.drawImage(this.sprite(color), x + len - r * 3, y - r * 3, r * 6, r * 6);
          continue;
        }
        // a star: lights up with the note (brighter the louder), then fades while it twinkles
        const bright = Math.min(1, n.gain / 0.08) * Math.exp(-age / 3.5);
        const r = (3 + 5 * bright) * dpr;
        ctx.globalAlpha = Math.min(1, bright * (0.75 + 0.25 * Math.sin(clock * 6 + i)));
        ctx.drawImage(this.sprite(color), x - r * 3, y - r * 3, r * 6, r * 6);
        if (age < 0.4) {
          ctx.globalAlpha = (1 - age / 0.4) * bright;
          ctx.drawImage(star, x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Pixels: the screen of an old console. Every note is a block on a grid (its height the pitch, the
  // theme's notes two blocks tall), held notes a row of blocks; blocks flash when struck and fade in
  // four steps; the drums light the bottom row; faint scanlines over it all.
  drawPixels() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, dpr = this.dpr;
    const cell = Math.round(7 * dpr);
    const t = this.player.currentTime;
    const energy = this.energy();
    const free = H;
    const rows = Math.floor(free / cell);
    const now = Math.floor((W * NowX) / cell);

    // the grid, breathing a little with the bass
    ctx.fillStyle = `rgba(94, 240, 138, ${0.025 + energy * 0.05})`;
    for (let x = 0; x < W; x += cell) ctx.fillRect(x, 0, Math.max(1, dpr * 0.5), free);
    for (let y = 0; y < free; y += cell) ctx.fillRect(0, y, W, Math.max(1, dpr * 0.5));
    ctx.fillStyle = 'rgba(94, 240, 138, 0.18)';
    ctx.fillRect(now * cell, 0, Math.max(1, dpr), free);

    const song = this.song;
    if (song) {
      const speed = (now * cell) / PastSeconds;
      const notes = song.notes;
      let lo = 0, hi = notes.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (notes[mid].time < t - PastSeconds) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < notes.length; i++) {
        const n = notes[i];
        if (n.time > t) break;
        const age = t - n.time;
        const x = Math.round((now * cell - age * speed) / cell) * cell;
        const color = InstrumentColors[n.instrument];
        const fade = Math.ceil(Math.max(0, 1 - age / PastSeconds) * 4) / 4; // four steps, like the console's palette
        const drum = n.role === NoteRole.Drums;
        const lead = n.role === NoteRole.Melody;
        const flash = age < 0.08;
        if (drum) {
          const w = n.midi === 49 ? 6 : n.midi === 36 ? 3 : n.midi === 38 ? 2 : 1;
          ctx.globalAlpha = fade * (flash ? 1 : 0.55);
          ctx.fillStyle = flash ? '#ffffff' : color;
          ctx.fillRect(x - Math.floor(w / 2) * cell, (rows - 1) * cell, w * cell - dpr, cell - dpr);
          continue;
        }
        const row = Math.max(0, Math.min(rows - 3, Math.round((1 - (Math.min(Math.max(n.midi, 30), 96) - 30) / 66) * (rows - 4))));
        const len = Math.max(1, Math.round(Math.min(n.duration, age) * speed / cell));
        const size = lead ? 2 : 1;
        ctx.globalAlpha = fade * (lead ? 1 : 0.6);
        ctx.fillStyle = color;
        ctx.fillRect(x, row * cell, len * cell - dpr, size * cell - dpr);
        if (flash) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, row * cell, cell - dpr, size * cell - dpr);
        }
      }
      ctx.globalAlpha = 1;
    }
    // scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = 0; y < free; y += 3 * dpr) ctx.fillRect(0, y, W, dpr);
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
    const free = H;
    const fire = ctx.createRadialGradient(W * NowX, free * 1.1, 0, W * NowX, free * 1.1, Math.max(W * 0.45, free * 1.3));
    fire.addColorStop(0, `rgba(255, 112, 40, ${0.12 + energy * 0.3})`);
    fire.addColorStop(0.4, `rgba(200, 60, 20, ${0.05 + energy * 0.12})`);
    fire.addColorStop(1, 'rgba(120, 30, 10, 0)');
    ctx.fillStyle = fire;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = 'lighter';
    // Drifting ash and faint embers, always there (the same ones every frame, moving with the time).
    const warm = this.sprite('#ff8c42');
    for (let k = 0, count = this.lite ? 18 : 36; k < count; k++) {
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
        const sparks = Math.round((cymbal ? 14 : 5 + 5 * strength) * (this.lite ? 0.5 : 1));
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
