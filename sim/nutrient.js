// Nitrogen in the tank (step 1): poor at the surface, rich deep, a nutricline between (as in a stratified sea: the sun is
// above, the nutrients below), 0-1 (1: the deep water's richness). With world.grow it is a field of horizontal layers
// that cells use up where they feed and that is mixed back toward the usual profile slowly (the rich deep water
// resupplying it); a dead cell gives its nitrogen back where it is. Without world.grow it is the fixed profile.
import { PARAMS } from './params.js';
import { dexp } from './dmath.js';

const N = PARAMS.nutrient, TH = PARAMS.tank.h, LH = TH / N.layers;

// The usual profile at height y (µm above the floor), 0-1
export function nutrientAt(y) {
  const d = (TH - y) / TH;
  return N.surface + (1 - N.surface) / (1 + dexp(-(d - N.cline) / N.width));
}

// Layer k's middle height
const mid = (k) => (k + 0.5) * LH;
const layerOf = (y) => Math.max(0, Math.min(N.layers - 1, Math.floor(y / LH)));

export function initNitrogen(world) {
  const c = new Float64Array(N.layers), ref = new Float64Array(N.layers);
  for (let k = 0; k < N.layers; k++) c[k] = ref[k] = nutrientAt(mid(k));
  world.nitro = { c, ref, held: N.water * LH };   // held: nitrogen a layer holds at richness 1
}

// The nitrogen at height y, 0-1 (between layers' middles, in proportion)
export function nitrogenAt(world, y) {
  if (!world.nitro) return nutrientAt(y);
  const c = world.nitro.c, f = y / LH - 0.5;
  if (f <= 0) return c[0];
  if (f >= N.layers - 1) return c[N.layers - 1];
  const k = Math.floor(f), t = f - k;
  return c[k] * (1 - t) + c[k + 1] * t;
}

// Take (amount > 0) or give back (amount < 0) nitrogen at height y; returns what was really taken
export function takeNitrogen(world, y, amount) {
  const f = world.nitro, k = layerOf(y);
  const dc = Math.min(amount / f.held, f.c[k]);
  f.c[k] -= dc;
  return dc * f.held;
}

// Mixing, every `N.every` steps: each layer eases back toward the usual profile (resupply) and evens out with its
// neighbours a little
export function mixNitrogen(world) {
  if (world.steps % N.every) return;
  const f = world.nitro, c = f.c, dt = N.every * PARAMS.time.dt;
  // moving water mixes the layers faster (night convection brings the rich deep water up)
  const fs = world.flowNow, stir = fs ? 1 + PARAMS.flow.mix * fs.speed / PARAMS.flow.night : 1;
  const back = dt / N.resupply, side = dt * N.spread * stir;
  let prev = c[0];
  for (let k = 0; k < N.layers; k++) {
    const here = c[k], next = k + 1 < N.layers ? c[k + 1] : here;
    c[k] = here + (f.ref[k] - here) * back + (prev - here + next - here) * side;
    prev = here;
  }
}
