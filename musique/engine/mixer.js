// Plays composed pieces note by note and mixes them (voices, the piece's room: reverb, width and
// tone, then a soft limiter): a port of the game's MusicMixer.cs. Pure JS, so the same code runs
// in the AudioWorklet (listening) and in an OfflineAudioContext (downloads).
import { Instruments, InstrumentCount } from './instruments.js';
import { StoredScale } from './notebank.js';
import { getRoom } from './styles.js';
import { Freeverb } from './freeverb.js';

const MasterGain = 2.33;
const NoteScale = 1 / StoredScale;
const ReverbWet = 1.49;
const GapBetweenPieces = 2.5; // seconds after a piece's last bar before the next one
const MaxVoices = 96;
const SlurFade = 0.035;      // seconds, crossfade between tied notes
// A voice's reverb send times the room's reverb level, at most (the studio room's).
const MaxReverb = 0.5;

export class MusicMixer {
  constructor(rate, volume) {
    this.banks = new Array(InstrumentCount).fill(null);
    this.instrumentVolume = new Float32Array(InstrumentCount).fill(1);
    this.volume = this.targetVolume = volume;
    this.song = null; this.nextNote = 0; this.songPosition = 0;
    this.queued = null; this.skipTo = null; this.skipStart = 0; this.skipFadeSeconds = 0.6;
    this.fadingOut = false; this.fade = 1;
    this.wet = 1; this.width = 1; this.tone = 0; this.roomGain = 1;
    this.toneL1 = 0; this.toneL2 = 0; this.toneR1 = 0; this.toneR2 = 0;
    this.onSongStart = null; // (song) => void
    this.setRate(rate);
  }

  setRate(rate) {
    this.rate = rate;
    this.reverb = new Freeverb(rate, 0.75, 0.5);
    const n = MaxVoices;
    this.v = {
      active: new Uint8Array(n), attacking: new Uint8Array(n), data: new Array(n).fill(null),
      position: new Float64Array(n), step: new Float64Array(n), loopStart: new Int32Array(n), loopEnd: new Int32Array(n),
      gainL: new Float32Array(n), gainR: new Float32Array(n), send: new Float32Array(n), envelope: new Float32Array(n),
      attackStep: new Float32Array(n), releaseFactor: new Float32Array(n), held: new Float64Array(n), age: new Float64Array(n),
      instrument: new Int32Array(n),
    };
    if (this.song) this.applyRoom(this.song.room);
  }

  get needsNextPiece() { return this.queued === null; }
  get currentTime() { return this.songPosition / this.rate; }
  hasBank(id) { return this.banks[id] !== null; }
  setBank(id, bank) { this.banks[id] = bank; }

  // Plays right away if nothing is playing, otherwise after the current piece.
  queue(song) {
    if (!this.song) this.startSong(song, 0);
    else this.queued = song;
  }

  clearQueue() { this.queued = null; }

  // Fades the current piece out and starts this one (from `startSeconds`).
  replace(song, startSeconds = 0, fadeSeconds = 0.6) {
    if (!this.song) { this.startSong(song, startSeconds); return; }
    this.skipStart = startSeconds;
    this.skipFadeSeconds = Math.max(0.02, fadeSeconds);
    this.skipTo = song;
  }

  startSong(song, startSeconds) {
    this.song = song;
    this.applyRoom(song.room);
    this.nextNote = 0;
    while (this.nextNote < song.notes.length && song.notes[this.nextNote].time < startSeconds) this.nextNote++;
    this.songPosition = Math.trunc(startSeconds * this.rate);
    if (this.onSongStart) this.onSongStart(song);
  }

  applyRoom(room) {
    const def = getRoom(room);
    this.reverb.setRoom(def.RoomSize, def.Damping);
    this.wet = def.Wet;
    this.width = def.Width;
    this.roomGain = def.Gain;
    this.tone = def.ToneHz > 0 ? Math.exp(-2 * Math.PI * def.ToneHz / this.rate) : 0;
  }

  startVoice(note) {
    const bank = this.banks[note.instrument];
    if (!bank) return;
    const k = bank.nearest[note.midi];
    if (k < 0) return;
    const info = Instruments[note.instrument];
    const V = this.v;

    // A free slot, or else the quietest voice.
    let slot = 0, quietest = Number.MAX_VALUE;
    for (let i = 0; i < MaxVoices; i++) {
      if (!V.active[i]) { slot = i; break; }
      const level = V.attacking[i] ? 1 : V.envelope[i];
      if (level < quietest) { quietest = level; slot = i; }
    }

    let position = 0, attacking = 0, envelope = 1, attackStep = 0;
    if (info.Attack > 0) { attacking = 1; envelope = 0; attackStep = 1 / (info.Attack * this.rate); }
    if (note.slur) {
      // Tied note: from the full tone, faded in quickly, while the note it follows on the same
      // instrument (still held) fades out over the same few milliseconds.
      position = bank.sustainStart[k];
      attacking = 1; envelope = 0; attackStep = 1 / (SlurFade * this.rate);
      const fadeOut = Math.exp(-1 / (SlurFade * this.rate));
      for (let i = 0; i < MaxVoices; i++) {
        if (!V.active[i] || V.instrument[i] !== note.instrument || V.age[i] > V.held[i]) continue;
        V.held[i] = V.age[i];
        V.releaseFactor[i] = fadeOut;
      }
    }
    const gain = note.gain * info.Gain * NoteScale / 32768;
    V.active[slot] = 1;
    V.instrument[slot] = note.instrument;
    V.data[slot] = bank.samples[k];
    V.position[slot] = position;
    V.step[slot] = Math.pow(2, (note.midi - k) / 12) * bank.rates[k] / this.rate;
    V.loopStart[slot] = bank.loopStart[k];
    V.loopEnd[slot] = bank.loopEnd[k];
    V.held[slot] = Math.trunc(note.duration * this.rate);
    V.age[slot] = 0;
    V.releaseFactor[slot] = info.Release > 0 ? Math.exp(-1 / (info.Release * this.rate)) : 1;
    V.attacking[slot] = attacking;
    V.envelope[slot] = envelope;
    V.attackStep[slot] = attackStep;
    V.send[slot] = Math.min(note.send, MaxReverb / this.wet);
    V.gainL[slot] = gain * Math.sqrt(0.5 - note.pan / 2);
    V.gainR[slot] = gain * Math.sqrt(0.5 + note.pan / 2);
  }

  // Fills `frames` samples of each channel (planar) from `offset`.
  render(outL, outR, frames, offset = 0) {
    const V = this.v, rate = this.rate, reverb = this.reverb;
    const target = this.targetVolume;
    const volumeStep = (target - this.volume) / frames;
    const fadeInStep = 1 / (0.05 * rate);
    for (let f = 0; f < frames; f++) {
      if (!this.fadingOut && this.skipTo) this.fadingOut = true;
      if (this.fadingOut) {
        this.fade -= 1 / (this.skipFadeSeconds * rate);
        if (this.fade <= 0) {
          this.fade = 0;
          this.fadingOut = false;
          const next = this.skipTo;
          this.skipTo = null;
          if (next) {
            V.active.fill(0);
            reverb.clear();
            this.startSong(next, this.skipStart);
          }
        }
      } else if (this.fade < 1) this.fade = Math.min(1, this.fade + fadeInStep);

      const song = this.song;
      if (song) {
        const notes = song.notes;
        while (this.nextNote < notes.length && notes[this.nextNote].time * rate <= this.songPosition)
          this.startVoice(notes[this.nextNote++]);
        this.songPosition++;
        if (this.songPosition > (song.length + GapBetweenPieces) * rate) {
          const next = this.queued;
          this.queued = null;
          if (next) this.startSong(next, 0);
        }
      }

      let left = 0, right = 0, send = 0;
      for (let i = 0; i < MaxVoices; i++) {
        if (!V.active[i]) continue;
        const data = V.data[i];
        if (V.loopEnd[i] > 0 && V.position[i] >= V.loopEnd[i]) V.position[i] -= V.loopEnd[i] - V.loopStart[i];
        const index = V.position[i] | 0;
        if (index + 1 >= data.length) { V.active[i] = 0; continue; }
        const frac = V.position[i] - index;
        const s = (data[index] + (data[index + 1] - data[index]) * frac) * V.envelope[i] * this.instrumentVolume[V.instrument[i]];
        left += s * V.gainL[i];
        right += s * V.gainR[i];
        send += s * (V.gainL[i] + V.gainR[i]) * 0.7071 * V.send[i];
        V.position[i] += V.step[i];
        if (++V.age[i] <= V.held[i]) {
          if (V.attacking[i]) {
            V.envelope[i] += V.attackStep[i];
            if (V.envelope[i] >= 1) { V.envelope[i] = 1; V.attacking[i] = 0; }
          }
        } else {
          V.attacking[i] = 0;
          V.envelope[i] *= V.releaseFactor[i];
          if (V.envelope[i] < 0.0005) V.active[i] = 0;
        }
      }

      reverb.process(send);
      left = (left + reverb.left * ReverbWet * this.wet) * MasterGain * this.roomGain;
      right = (right + reverb.right * ReverbWet * this.wet) * MasterGain * this.roomGain;
      if (this.width !== 1) {
        const mid = 0.5 * (left + right), side = 0.5 * (left - right) * this.width;
        left = mid + side;
        right = mid - side;
      }
      if (this.tone > 0) {
        const t = this.tone;
        this.toneL1 = left + (this.toneL1 - left) * t; this.toneL2 = this.toneL1 + (this.toneL2 - this.toneL1) * t;
        this.toneR1 = right + (this.toneR1 - right) * t; this.toneR2 = this.toneR1 + (this.toneR2 - this.toneR1) * t;
        left = this.toneL2;
        right = this.toneR2;
      } else {
        this.toneL1 = this.toneL2 = left;
        this.toneR1 = this.toneR2 = right;
      }
      this.volume += volumeStep;
      const gain = this.volume * this.fade / 1.1;
      outL[offset + f] = Math.tanh(1.1 * left) * gain;
      outR[offset + f] = Math.tanh(1.1 * right) * gain;
    }
    this.volume = target;
  }
}
