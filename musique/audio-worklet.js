// The music box's audio thread: the mixer plays the pieces the page sends (see js/player.js).
// Also used in an OfflineAudioContext to render a piece for download: the piece and its banks
// then come in processorOptions, so nothing is missed before rendering starts.
import { MusicMixer } from './engine/mixer.js';

class MusicBoxProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.mixer = new MusicMixer(sampleRate, opts.volume ?? 1);
    this.mixer.onSongStart = (song) => this.port.postMessage({ type: 'started', seed: song.seed, id: song.pieceId, time: currentTime });
    this.lastReport = 0;
    if (opts.banks) for (const [id, bank] of opts.banks) this.mixer.setBank(id, bank);
    if (opts.song) this.mixer.replace(opts.song, 0, 0.02);
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    const m = this.mixer;
    switch (msg.type) {
      case 'bank': m.setBank(msg.id, msg.bank); break;
      case 'play': m.replace(msg.song, msg.start || 0, msg.fade ?? 0.4); m.clearQueue(); break;
      case 'queue': m.queued = msg.song; break;
      case 'volume': m.targetVolume = msg.value; break;
    }
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const left = out[0], right = out[1] || out[0];
    this.mixer.render(left, right, left.length);
    // Where we are, about 20 times a second (progress bar, visualizer, lit instruments).
    if (currentTime - this.lastReport >= 0.05) {
      this.lastReport = currentTime;
      const song = this.mixer.song;
      this.port.postMessage({
        type: 'position', id: song ? song.pieceId : null, time: this.mixer.currentTime, ctxTime: currentTime,
        needsNext: this.mixer.needsNextPiece,
      });
    }
    return true;
  }
}

registerProcessor('music-box', MusicBoxProcessor);
