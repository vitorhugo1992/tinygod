// Light from above: the day's sun, fading with depth. With world.day off it is always noon (the checks use that).
import { PARAMS } from './params.js';
import { dsin, dexp, TAU } from './dmath.js';
import { worldTime } from './world.js';
import { shadeAt } from './shade.js';

const L = PARAMS.light, M = PARAMS.metab, TH = PARAMS.tank.h;

// The day's light at the surface, 0-1: a sharp-shouldered sun (sqrt of a sine), dark half the day
export function daylight(world) {
  if (!world.day) return 1;
  const s = dsin(TAU * (worldTime(world) / M.day + M.dawn));
  return s > 0 ? Math.sqrt(s) : 0;
}

// Time of day as hours (0-24), sunrise at 6
export function clock(world) {
  let h = 6 + 24 * (worldTime(world) / M.day + M.dawn);
  h -= 24 * Math.floor(h / 24);
  return h;
}

// How much of the surface's light reaches `dz` µm down, 0-1 (the bottom murkBand µm darker)
export function depthLight(dz) {
  const murky = dz - (TH - L.murkBand);
  return dexp(-L.attenuation * dz - (murky > 0 ? L.murk * murky : 0));
}

// Light at height y (µm above the floor), 0-1; given x, less the shade of the plastids above it (sim/shade.js), and
// `cell` (the one asking) isn't shaded by its own
export function lightAt(world, y, x, cell) {
  if (!world.light) return 0;
  const clear = L.strength * daylight(world) * depthLight(TH - y);
  return x === undefined || !world.shade ? clear : clear * shadeAt(world, x, y, cell);
}
