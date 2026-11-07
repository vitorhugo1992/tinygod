// Where each species starts in a contest or tournament (author, 2026-11-07: "species should not always start on the floor
// but randomly on the tank, placing species on the floor that are meant for shallow water is unfair"): one spot each,
// spread along the tank (140 µm or more apart, so no two overlap; the order shuffled by the seed) at a random height
// anywhere from just off the floor to just under the surface. Same seed, same spots. floor: true gives the old start
// (everyone on the floor, seed 1 in the list's order).
import { PARAMS } from './params.js';
import { Rng } from './rng.js';

export function startSpots(seed, n, { floor = false } = {}) {
  const W = PARAMS.tank.w, H = PARAMS.tank.h, spot = [...Array(n).keys()];
  if (floor) {   // the old start, kept bit for bit
    if (seed !== 1) { let r = seed; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648); for (let i = spot.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spot[i], spot[j]] = [spot[j], spot[i]]; } }
    return spot.map((s) => ({ x: 100 + s * (1400 / Math.max(1, n - 1)), y: 60 }));
  }
  const rng = new Rng(seed * 7919 + 17);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [spot[i], spot[j]] = [spot[j], spot[i]]; }
  return spot.map((s) => ({ x: 100 + s * ((W - 200) / Math.max(1, n - 1)), y: 100 + rng.next() * (H - 200) }));
}
