// Nitrogen in the tank (step 1): poor at the surface, rich deep, a nutricline between (as in a stratified sea: the sun is
// above, the nutrients below), 0-1 (1: the deep water's usual richness). With world.grow it is a field of layers and
// columns that cells use up where they feed and that is mixed back slowly toward its usual profile (the rich deep water
// resupplying it); a dead cell gives its nitrogen back where it is. Without world.grow it is the fixed profile.
// Patches (balance, author 2026-11-03: every AI built a drifter that sat at one depth; nothing was worth moving sideways
// for): the profile's richness varies across the tank, two rich patches wandering slowly over days (upwelling plumes,
// remineralised snow), so finding the food pays: swimmers, feelers and nutrient sensors have something to look for.
import { PARAMS } from './params.js';
import { dexp, dsin, TAU } from './dmath.js';
import { hash01 } from './rng.js';
import { worldTime } from './world.js';

const N = PARAMS.nutrient, P = N.patches, TH = PARAMS.tank.h, TW = PARAMS.tank.w;
const LH = TH / N.layers, CW = TW / N.columns, NL = N.layers, NC = N.columns;

// The usual profile at height y (µm above the floor), 0-1, the tank's mean across
export function nutrientAt(y) {
  const d = (TH - y) / TH;
  return N.surface + (1 - N.surface) / (1 + dexp(-(d - N.cline) / N.width));
}

// How rich the water is across the tank at x, now: base + the patches (mean ~1 across the tank)
const PATCH_MEAN = P.count * P.width * Math.sqrt(TAU) / TW;   // a Gaussian's mean over the tank's width, each
export function patchAt(world, x) {
  if (!P.count) return 1;
  const t = worldTime(world), seed = (world.seed | 0) * 7919;
  let g = 0;
  for (let i = 0; i < P.count; i++) {
    const ph = TAU * hash01(seed + 11 * i + 5), period = P.wander * (1 + 0.6 * i);   // each its own pace and start
    const cx = TW / 2 + P.reach * TW / 2 * dsin(TAU * t / period + ph);
    const u = (x - cx) / P.width;
    g += dexp(-u * u / 2);
  }
  return P.base + (1 - P.base) * g / PATCH_MEAN;
}

const mid = (k) => (k + 0.5) * LH, colMid = (j) => (j + 0.5) * CW;
const layerOf = (y) => Math.max(0, Math.min(NL - 1, Math.floor(y / LH)));
const colOf = (x) => Math.max(0, Math.min(NC - 1, Math.floor(x / CW)));

// The field: c[k * NC + j], layer k (from the floor), column j (from the left)
function setRef(world) {
  const f = world.nitro;
  for (let j = 0; j < NC; j++) { const p = patchAt(world, colMid(j)); for (let k = 0; k < NL; k++) f.ref[k * NC + j] = f.prof[k] * p; }
}
export function initNitrogen(world) {
  const c = new Float64Array(NL * NC), ref = new Float64Array(NL * NC), prof = new Float64Array(NL);
  for (let k = 0; k < NL; k++) prof[k] = nutrientAt(mid(k));
  world.nitro = { c, ref, prof, held: N.water * LH / NC };   // held: nitrogen one square holds at richness 1
  setRef(world);
  c.set(ref);
}

// The nitrogen at height y and across at x (default: the middle), 0-1+ (between squares' middles, in proportion)
export function nitrogenAt(world, y, x = TW / 2) {
  if (!world.nitro) return nutrientAt(y);
  const c = world.nitro.c;
  let fy = y / LH - 0.5, fx = x / CW - 0.5;
  fy = fy < 0 ? 0 : fy > NL - 1 ? NL - 1 : fy; fx = fx < 0 ? 0 : fx > NC - 1 ? NC - 1 : fx;
  const k = Math.min(Math.floor(fy), NL - 2), j = Math.min(Math.floor(fx), NC - 2), ty = fy - k, tx = fx - j;
  const a = c[k * NC + j], b = c[k * NC + j + 1], d = c[(k + 1) * NC + j], e = c[(k + 1) * NC + j + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
}

// Take (amount > 0) or give back (amount < 0) nitrogen at (x, y); returns what was really taken
export function takeNitrogen(world, y, amount, x = TW / 2) {
  const f = world.nitro, i = layerOf(y) * NC + colOf(x);
  const dc = Math.min(amount / f.held, f.c[i]);
  f.c[i] -= dc;
  return dc * f.held;
}

// Mixing, every `N.every` steps: each square eases back toward the usual profile there (resupply; the patches move it)
// and evens out with its neighbours a little, up and down and across
const tmp = { a: null };
export function mixNitrogen(world) {
  if (world.steps % N.every) return;
  const f = world.nitro, c = f.c, dt = N.every * PARAMS.time.dt;
  setRef(world);
  // moving water mixes faster (night convection brings the rich deep water up and spreads it across)
  const fs = world.flowNow, stir = fs ? 1 + PARAMS.flow.mix * fs.speed / PARAMS.flow.night : 1;
  const back = dt / N.resupply, fade = dt / N.fade, up = dt * N.spread * stir, across = dt * N.spreadX * stir;
  const o = tmp.a && tmp.a.length === c.length ? tmp.a : (tmp.a = new Float64Array(c.length));
  o.set(c);
  for (let k = 0; k < NL; k++) for (let j = 0; j < NC; j++) {
    const i = k * NC + j, here = o[i];
    const below = k > 0 ? o[i - NC] : here, above = k < NL - 1 ? o[i + NC] : here;
    const left = j > 0 ? o[i - 1] : here, right = j < NC - 1 ? o[i + 1] : here;
    c[i] = here + (f.ref[i] - here) * (here > f.ref[i] ? fade : back) + (below - here + above - here) * up + (left - here + right - here) * across;
  }
}
