// mulberry32 with its state in the open (s), so a saved world resumes the same stream (from MONAD)
export class Rng {
  constructor(seed) { this.s = seed >>> 0; }
  next() {
    const a = this.s = (this.s + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo, hi) { return lo + (hi - lo) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  chance(p) { return this.next() < p; }
}

// Stateless hash for visuals, so drawing never draws from the simulation stream.
export function hash32(n) {
  n = Math.imul((n >>> 0) ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
export const hash01 = (n) => hash32(n) / 4294967296;
