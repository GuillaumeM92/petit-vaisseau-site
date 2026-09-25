// Small deterministic generator (SplitMix64), bit for bit the one of the game (MusicRng.cs), so
// a piece's number gives the same piece here and in Le Tapis Vert.
const MASK = (1n << 64n) - 1n;
const GAMMA = 0x9E3779B97F4A7C15n;

export class MusicRng {
  constructor(seed) {
    this.state = (BigInt.asUintN(64, BigInt(seed)) * 0x2545F4914F6CDD1Dn + GAMMA) & MASK;
  }

  nextULong() {
    this.state = (this.state + GAMMA) & MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK;
    return z ^ (z >> 31n);
  }

  // [0, 1)
  nextDouble() {
    return Number(this.nextULong() >> 11n) * (1.0 / 9007199254740992.0);
  }

  range(min, maxExclusive) {
    return min + Math.trunc(this.nextDouble() * (maxExclusive - min));
  }

  pick(items) {
    return items[this.range(0, items.length)];
  }

  pickWeighted(items, weights) {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.nextDouble() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }

  // Standard normal (Box-Muller).
  normal() {
    const u1 = 1.0 - this.nextDouble(), u2 = this.nextDouble();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }
}
