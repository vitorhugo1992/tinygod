// Light from above: the day's sun, fading with depth. With world.day off it is always noon (the checks use that).
import { PARAMS } from './params.js';
import { dsin, dexp, TAU } from './dmath.js';
import { worldTime } from './world.js';

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

// Light at height y (µm above the floor), 0-1
export function lightAt(world, y) {
  if (!world.light) return 0;
  return L.strength * daylight(world) * dexp(-L.attenuation * (TH - y));
}
