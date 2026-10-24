// Nutrients in the tank: a fixed layer until step 1's ecology. Poor at the surface, rich deep, a nutricline between
// (as in a stratified sea: the sun is above, the nutrients below), 0-1.
import { PARAMS } from './params.js';
import { dexp } from './dmath.js';

const N = PARAMS.nutrient, TH = PARAMS.tank.h;

// Nutrients at height y (µm above the floor), 0-1
export function nutrientAt(y) {
  const d = (TH - y) / TH;
  return 1 / (1 + dexp(-(d - N.cline) / N.width));
}
