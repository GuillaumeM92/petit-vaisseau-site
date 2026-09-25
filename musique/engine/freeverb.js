// Classic Schroeder/Moorer reverb (Jezar's public-domain "Freeverb"), as in the game: 8 damped
// combs + 4 allpasses per channel, the right channel's delays slightly longer for stereo width.
const CombTuning = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const AllpassTuning = [556, 441, 341, 225];
const StereoSpread = 23;
const FixedGain = 0.015;

export class Freeverb {
  constructor(sampleRate, roomSize, damping) {
    const scale = sampleRate / 44100;
    this.combs = []; this.combIndex = new Int32Array(16); this.combStore = new Float32Array(16);
    this.allpasses = []; this.allpassIndex = new Int32Array(8);
    for (let ch = 0; ch < 2; ch++) {
      for (let i = 0; i < 8; i++) this.combs[ch * 8 + i] = new Float32Array(Math.trunc((CombTuning[i] + ch * StereoSpread) * scale));
      for (let i = 0; i < 4; i++) this.allpasses[ch * 4 + i] = new Float32Array(Math.trunc((AllpassTuning[i] + ch * StereoSpread) * scale));
    }
    this.left = 0; this.right = 0;
    this.setRoom(roomSize, damping);
  }

  setRoom(roomSize, damping) {
    this.feedback = roomSize * 0.28 + 0.7;
    this.damp1 = damping * 0.4;
    this.damp2 = 1 - this.damp1;
  }

  clear() {
    for (const c of this.combs) c.fill(0);
    this.combStore.fill(0);
    for (const a of this.allpasses) a.fill(0);
  }

  // Leaves the result in this.left / this.right.
  process(input) {
    this.left = this.channel(0, input * FixedGain);
    this.right = this.channel(1, input * FixedGain);
  }

  channel(ch, input) {
    let sum = 0;
    for (let i = ch * 8; i < ch * 8 + 8; i++) {
      const buffer = this.combs[i];
      let idx = this.combIndex[i];
      const output = buffer[idx];
      this.combStore[i] = output * this.damp2 + this.combStore[i] * this.damp1;
      buffer[idx] = input + this.combStore[i] * this.feedback;
      if (++idx >= buffer.length) idx = 0;
      this.combIndex[i] = idx;
      sum += output;
    }
    for (let i = ch * 4; i < ch * 4 + 4; i++) {
      const buffer = this.allpasses[i];
      let idx = this.allpassIndex[i];
      const buffered = buffer[idx];
      const output = -sum + buffered;
      buffer[idx] = sum + buffered * 0.5;
      if (++idx >= buffer.length) idx = 0;
      this.allpassIndex[i] = idx;
      sum = output;
    }
    return sum;
  }
}
