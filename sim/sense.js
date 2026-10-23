// What a cell's sensors read, and what their wiring does, once a step before it moves.
// Light comes from straight above. A light sensor (an eyespot: a photoreceptor with a pigment shield behind it)
// sees it only from the side it faces: its reading is the light × how squarely it faces up, 0 when it faces sideways
// or down. In the 2 mm sandbox light doesn't fade with depth (PARAMS.light.attenuation 0): it gives direction only.
import { PARAMS } from './params.js';
import { dsin, dexp } from './dmath.js';

const L = PARAMS.light, S = PARAMS.sensor;
const TH = PARAMS.tank.h;

export function sense(world, cell) {
  if (!cell.sensors.length) return;
  for (const s of cell.sensors) {
    if (!world.light) { s.value = 0; continue; }
    const i = s.piece, c = cell.cs[i], n = cell.sn[i];
    const y = cell.cy[i] + n * s.x + c * s.y;
    const up = dsin(cell.phi[i] + s.facing);           // how squarely it faces the light above
    s.value = up > 0 ? up * L.strength * (L.attenuation ? dexp(-L.attenuation * (TH - y)) : 1) : 0;
    // lit or dark, with a little hysteresis so a reading at the edge doesn't flicker
    if (s.lit === undefined) s.lit = s.value > S.threshold;
    else if (s.lit && s.value < S.threshold - S.hysteresis) s.lit = false;
    else if (!s.lit && s.value > S.threshold + S.hysteresis) s.lit = true;
  }
  for (const j of cell.joints) {
    if (!j.control) continue;
    const holds = cell.sensors[j.control.sensor].lit === (j.control.when === 'light');
    if (j.type === 'motor') j.on = holds;
    else if (j.latched && holds) j.latched = false;   // a trigger: released once, the first time it holds
  }
}
