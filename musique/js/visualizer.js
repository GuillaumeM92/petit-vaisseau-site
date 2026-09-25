// The visualizer: every note of the piece becomes a soft light, its height the pitch, its colour
// the instrument, drifting left as the music moves on; the low end of the spectrum breathes in
// the background. Drawn from the composed notes themselves, so it is exactly in time.
import { NoteRole } from '../engine/composer.js';
import { Instruments } from '../engine/instruments.js';

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
];

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

  draw() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height, dpr = this.dpr;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    // Breathing glow from the low end of the spectrum.
    const analyser = this.player.analyser;
    let energy = 0;
    if (analyser && this.player.playing) {
      this.freq ??= new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(this.freq);
      for (let i = 2; i < 40; i++) energy += this.freq[i];
      energy /= 38 * 255;
    }
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
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}
