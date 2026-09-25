// Plays pieces in the browser: an AudioWorklet runs the game's mixer (audio-worklet.js), the
// recorded notes are fetched the first time a piece needs an instrument, and a piece can be
// rendered to an MP3 or WAV file, faster than real time and entirely on this device.
import { Instruments, InstrumentCount } from '../engine/instruments.js';
import { newBank, addNoteFile, finishBank, parseWav } from '../engine/notebank.js';
import { songFor } from './pieces.js';

const BaseVolume = 0.9; // the game plays at 0.17 under its sound effects; here the music is alone

export class Player {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.banks = new Array(InstrumentCount).fill(null);   // loaded banks
    this.bankLoads = new Array(InstrumentCount).fill(null); // pending loads (promises)
    this.sentToNode = new Array(InstrumentCount).fill(false);
    this.manifest = null;
    this.volume = 0.8;
    this.current = null;   // id of the piece playing
    this.position = { id: null, time: 0, ctxTime: 0 };
    this.playing = false;
    this.onStarted = null;   // (id) => void, when a piece starts (also the queued one)
    this.onNeedsNext = null; // () => void, when the mixer has nothing queued after the current piece
    this.analyser = null;
  }

  // Needs a user gesture (browsers only start audio after a click).
  async start() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    await this.ctx.audioWorklet.addModule(new URL('../audio-worklet.js', import.meta.url));
    this.node = new AudioWorkletNode(this.ctx, 'music-box', {
      numberOfInputs: 0, outputChannelCount: [2], processorOptions: { volume: this.gain() },
    });
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.85;
    this.node.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.node.port.onmessage = (e) => this.onMessage(e.data);
  }

  gain() { return BaseVolume * this.volume * this.volume; }

  setVolume(v) {
    this.volume = v;
    this.node?.port.postMessage({ type: 'volume', value: this.gain() });
  }

  onMessage(msg) {
    if (msg.type === 'position') {
      this.position = msg;
      if (msg.id !== this.current && msg.id) {
        this.current = msg.id;
        this.onStarted?.(msg.id);
      }
      if (msg.needsNext && !this.askedNext) {
        this.askedNext = true;
        this.onNeedsNext?.();
      }
    }
  }

  // Seconds into the piece being played, smoothed between the audio thread's reports.
  get currentTime() {
    if (!this.ctx || !this.position.id) return 0;
    const ahead = this.playing ? this.ctx.currentTime - this.position.ctxTime : 0;
    return this.position.time + Math.max(0, Math.min(ahead, 0.2)) - (this.ctx.outputLatency || 0);
  }

  async loadManifest() {
    this.manifest ??= await (await fetch(new URL('../notes/manifest.json', import.meta.url))).json();
    return this.manifest;
  }

  // The bank of one instrument, fetched and prepared once.
  loadBank(id) {
    this.bankLoads[id] ??= (async () => {
      const manifest = await this.loadManifest();
      const name = Instruments[id].Name;
      const bank = newBank();
      await Promise.all(manifest[name].map(async (file) => {
        const buffer = await (await fetch(new URL(`../notes/${name}/${file}`, import.meta.url))).arrayBuffer();
        const { data, rate } = file.endsWith('.wav') ? parseWav(buffer) : await decodeFlac(buffer);
        addNoteFile(bank, file, data, rate);
      }));
      finishBank(bank);
      this.banks[id] = bank;
      return bank;
    })();
    return this.bankLoads[id];
  }

  async ensureBanks(song) {
    const needed = [];
    for (let i = 0; i < InstrumentCount; i++) if (song.uses[i]) needed.push(i);
    await Promise.all(needed.map((i) => this.loadBank(i)));
    for (const i of needed) {
      if (this.sentToNode[i] || !this.node) continue;
      this.node.port.postMessage({ type: 'bank', id: i, bank: this.banks[i] });
      this.sentToNode[i] = true;
    }
  }

  // Plays this piece now, from `start` seconds (short fade from the one playing).
  async play(id, fade = 0.4, start = 0) {
    await this.start();
    const song = songFor(id);
    await this.ensureBanks(song);
    this.node.port.postMessage({ type: 'play', song: plain(song), fade, start });
    this.askedNext = false;
    await this.resume();
  }

  // The piece to play after the current one.
  async queue(id) {
    const song = songFor(id);
    await this.ensureBanks(song);
    this.node.port.postMessage({ type: 'queue', song: plain(song) });
    this.askedNext = false;
  }

  async pause() {
    if (!this.ctx) return;
    await this.ctx.suspend();
    this.playing = false;
  }

  async resume() {
    if (!this.ctx) return;
    await this.ctx.resume();
    this.playing = true;
  }

  // The whole piece as a file, rendered on this device: 'mp3' (light, 192 kb/s) or 'wav' (16-bit).
  async renderFile(id, format, onProgress) {
    const buffer = await this.renderBuffer(id);
    onProgress?.(0.5);
    if (format === 'wav') return encodeWav(buffer);
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./mp3-worker.js', import.meta.url));
      worker.onmessage = (e) => {
        if (e.data.progress !== undefined) onProgress?.(0.5 + e.data.progress / 2);
        if (e.data.blob) { resolve(e.data.blob); worker.terminate(); }
      };
      worker.onerror = (e) => { reject(e); worker.terminate(); };
      const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
      worker.postMessage({ left, right, rate: buffer.sampleRate, kbps: 192 });
    });
  }

  async renderBuffer(id) {
    const song = songFor(id);
    const needed = [];
    for (let i = 0; i < InstrumentCount; i++) if (song.uses[i]) needed.push(i);
    await Promise.all(needed.map((i) => this.loadBank(i)));
    const rate = 44100;
    const seconds = song.length + 3; // the last notes ring past the last bar
    const offline = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
    await offline.audioWorklet.addModule(new URL('../audio-worklet.js', import.meta.url));
    const node = new AudioWorkletNode(offline, 'music-box', {
      numberOfInputs: 0, outputChannelCount: [2],
      processorOptions: { volume: 1, song: plain(song), banks: needed.map((i) => [i, this.banks[i]]) },
    });
    node.connect(offline.destination);
    return offline.startRendering();
  }
}

// A FLAC note back to the 16-bit samples it was made from, at its own sample rate (decoding in a
// context at that rate means no resampling, so the loop points stay exact).
async function decodeFlac(buffer) {
  const b = new Uint8Array(buffer, 0, 21);
  const rate = (b[18] << 12) | (b[19] << 4) | (b[20] >> 4); // STREAMINFO's 20-bit sample rate
  const audio = await new OfflineAudioContext(1, 1, rate).decodeAudioData(buffer);
  const floats = audio.getChannelData(0);
  const data = new Int16Array(floats.length);
  for (let i = 0; i < floats.length; i++) data[i] = Math.max(-32768, Math.min(32767, Math.round(floats[i] * 32768)));
  return { data, rate: audio.sampleRate };
}

// What the audio thread needs of a piece (structured clone drops nothing, but keep it small).
function plain(song) {
  return { seed: song.seed, pieceId: song.pieceId, room: song.room, length: song.length, notes: song.notes };
}

function encodeWav(buffer) {
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const frames = L.length, bytes = frames * 4;
  const out = new DataView(new ArrayBuffer(44 + bytes));
  const text = (pos, s) => { for (let i = 0; i < s.length; i++) out.setUint8(pos + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); out.setUint32(4, 36 + bytes, true); text(8, 'WAVEfmt '); out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
  text(36, 'data'); out.setUint32(40, bytes, true);
  let pos = 44;
  for (let i = 0; i < frames; i++) {
    out.setInt16(pos, Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), true);
    out.setInt16(pos + 2, Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), true);
    pos += 4;
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
