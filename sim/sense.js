// What a cell's sensors read, and what their wiring does, once a step before it moves. Readings run 0..1.
// - light: light comes from straight above and fades with depth (PARAMS.light). An eyespot (a photoreceptor with a
//   pigment shield behind it) sees it only from the side it faces: reading = light there × how squarely it faces up.
// - touch: 1 while a cell of another species is within PARAMS.sensor.touchRange of its spot.
// - near: how close the nearest cell of another species is, 1 touching, 0 at the sensor's range.
// Every cell also has its energy level built in (no part): how full its energy pool is, 0 empty, 1 full (1 with
// metabolism off). Wiring to sensor 'energy' reads it.
// A wired motor runs while its sensor's reading is inside [min, max]; a latched spring is released the first time
// it is. The state changes only a little inside or outside the range (hysteresis), so it doesn't flicker.
import { PARAMS } from './params.js';
import { dcos } from './dmath.js';
import { fire } from './physics.js';
import { lightAt } from './light.js';

const S = PARAMS.sensor;

// Distance from (x, y) to the nearest surface of a cell of another species, or Infinity
function nearestStranger(world, cell, x, y, reach) {
  let best = Infinity;
  for (const o of world.cells) {
    if (o === cell || o.species === cell.species) continue;
    const dx = o.q[0] - x, dy = o.q[1] - y;
    if (dx * dx + dy * dy > (o.reach + reach) * (o.reach + reach)) continue;
    for (let i = 0; i < o.pieces.length; i++) {
      const p = o.pieces[i], h = p.L / 2, c = o.cs[i], s = o.sn[i];
      const ax = o.cx[i] - c * h, ay = o.cy[i] - s * h;
      const ex = 2 * c * h, ey = 2 * s * h, l2 = ex * ex + ey * ey;
      let t = l2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - ex * t, y - ay - ey * t) - p.a;
      if (d < best) best = d;
    }
  }
  return best;
}

export function energyLevel(world, cell) { return world.metab ? cell.metab.E / cell.metab.C : 1; }

export function sense(world, cell) {
  for (const s of cell.sensors) {
    const i = s.piece, c = cell.cs[i], n = cell.sn[i];
    const x = cell.cx[i] + c * s.x - n * s.y, y = cell.cy[i] + n * s.x + c * s.y;
    if (s.kind === 'hunger') { s.value = energyLevel(world, cell); continue; }   // old designs: same as the built-in
    if (s.kind === 'light') {
      if (!world.light) { s.value = 0; continue; }
      // how far it faces from straight up, against half its cone: full facing up, nothing at the cone's edge
      let off = cell.phi[i] + s.facing - Math.PI / 2;
      off -= 2 * Math.PI * Math.floor(off / (2 * Math.PI) + 0.5);
      if (off < 0) off = -off;
      const half = s.cone / 2;
      s.value = off < half ? dcos(off / half * Math.PI / 2) * lightAt(world, y) : 0;
    } else {
      const d = nearestStranger(world, cell, x, y, s.range);
      s.value = s.kind === 'touch' ? (d <= s.range ? 1 : 0) : (d >= s.range ? 0 : d <= 0 ? 1 : 1 - d / s.range);
    }
  }
  for (const j of cell.joints) {
    const ctl = j.control;
    if (!ctl) continue;
    const v = ctl.sensor < 0 ? energyLevel(world, cell) : cell.sensors[ctl.sensor].value;
    if (ctl.holds === null) ctl.holds = v >= ctl.min && v <= ctl.max;
    else if (ctl.holds) { if (v < ctl.min - S.hysteresis || v > ctl.max + S.hysteresis) ctl.holds = false; }
    else if (v > ctl.min + S.hysteresis && v < ctl.max - S.hysteresis) ctl.holds = true;
    // at the ends of the scale there is nothing beyond, so 0 and 1 count as inside a range that reaches them
    else if ((ctl.min <= 0 && v <= 0) || (ctl.max >= 1 && v >= 1)) ctl.holds = true;
    if (j.burst) { if (ctl.holds) fire(cell, j.burst.group); }   // a burst organ fires when its sensor says so
    else if (j.type === 'motor') j.on = ctl.holds;
    else if (j.latched && ctl.holds) j.latched = false;   // a trigger: released once, the first time it holds
  }
}
