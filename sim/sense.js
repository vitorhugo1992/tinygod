// What a cell's sensors read, and what their wiring does, once a step before it moves. Readings run 0..1.
// - light: light comes from straight above and fades with depth (PARAMS.light). An eyespot (a photoreceptor with a
//   pigment shield behind it) sees it best from the side it faces: reading = light there × (a scattered share, PARAMS.sensor.
//   scatter, + the rest × how squarely it faces up), so facing down in bright water it still reads some light.
// - touch: 1 while something it feels is within PARAMS.sensor.touchRange of its spot.
// - near: how close the nearest thing it feels is, 1 touching, 0 at the sensor's range.
//   Touch and proximity feel cells of another species ('strangers', the default) or anything: any other cell, the
//   tank's walls, floor and surface ('anything').
// - chem: the nutrients where it is (nutrient.js: poor at the surface, rich deep).
// - statolith: a loose grain in a chamber rolls to the lower wall; it reads how far the chamber's direction points up
//   (1 straight up, 0 down, 0.5 sideways or with gravity off).
// Every cell also has its energy level built in (no part): how full its energy pool is, 0 empty, 1 full (1 with
// metabolism off). Wiring to sensor 'energy' reads it; 'starch' and 'oil' read how full those stores are; 'health'
// how healthy its plastids are (1 unharmed, 0 wrecked by too much light; 1 without plastids or metabolism).
// A part can be wired to several sensors (its conditions). A condition holds while its reading is inside its [min, max]
// (marked `not`: outside it). Conditions are ANDed in groups, and one marked `or` starts a new group: the part goes when
// every condition of any one group holds. A wired motor runs while that is so; a latched spring or burst organ fires
// the first time it is. A compare condition holds while one reading is more than another (by a small margin). Each
// condition changes state only a little inside or outside its range (hysteresis), so it
// doesn't flicker.
import { PARAMS } from './params.js';
import { dcos, dsin } from './dmath.js';
import { fire } from './physics.js';
import { lightAt } from './light.js';
import { nutrientAt } from './nutrient.js';

const S = PARAMS.sensor;
const TW = PARAMS.tank.w, TH = PARAMS.tank.h;

// Distance from (x, y) to the nearest surface it feels (other cells' pieces; with `anything`, also kin and the
// tank's walls, floor and surface), or Infinity
function nearest(world, cell, x, y, reach, anything) {
  let best = anything ? Math.min(x, TW - x, y, TH - y) : Infinity;
  for (const o of world.cells) {
    if (o === cell || (!anything && o.species === cell.species)) continue;
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
// How full the cell's stores of one kind are, 0-1 (0 without any)
export function storeLevel(cell, kind) {
  let v = 0, full = 0;
  for (const i of cell.pieces[0].inclusions) if (i.store === kind) { v += i.fill * i.v; full += i.v; }
  return full > 0 ? v / full : 0;
}
// How healthy its plastids are, 0-1 (by volume; 1 without plastids or metabolism)
export function plastidHealth(world, cell) {
  let v = 0, ok = 0;
  if (world.metab) for (const i of cell.pieces[0].inclusions) if (i.material === 'plastid') { v += i.v; ok += (1 - i.damage) * i.v; }
  return v > 0 ? ok / v : 1;
}
// A reading by index: a sensor part, or one built in (-1 energy, -2 starch, -3 oil, -4 plastid health)
const reading = (world, cell, k) => (k >= 0 ? cell.sensors[k].value : k === -1 ? energyLevel(world, cell)
  : k === -4 ? plastidHealth(world, cell) : storeLevel(cell, k === -2 ? 'starch' : 'oil'));

// One condition: is the reading inside its range? (with a little hysteresis)
function holds(ctl, v) {
  if (ctl.holds === null) ctl.holds = v >= ctl.min && v <= ctl.max;
  else if (ctl.holds) {
    // it lets go a little outside its range; at the very ends of the scale (0, 1) there is no "a little outside", so a
    // reading there lets go of a range that does not reach it (a range from 0.03 held on in total darkness)
    if (v < ctl.min - S.hysteresis || v > ctl.max + S.hysteresis || (ctl.min > 0 && v <= 0) || (ctl.max < 1 && v >= 1)) ctl.holds = false;
  }
  else if (v > ctl.min + S.hysteresis && v < ctl.max - S.hysteresis) ctl.holds = true;
  // at the ends of the scale there is nothing beyond, so 0 and 1 count as inside a range that reaches them
  else if ((ctl.min <= 0 && v <= 0) || (ctl.max >= 1 && v >= 1)) ctl.holds = true;
  return ctl.holds;
}

// Does a list of conditions hold now (AND inside a group, OR between groups)? Every condition is updated, so each
// keeps its own hysteresis state.
// A rule: GO conditions in groups (AND inside a group, OR between groups; none: always), and STOP conditions, any one of
// which stops the part whatever the GO groups say (the override).
function holdsAll(world, cell, controls) {
  let all = false, group = true, any = false, stop = false;   // all: an earlier group held; group: this one so far
  for (const ctl of controls) {
    const read = (k) => reading(world, cell, k);
    const v = ctl.vs === undefined ? read(ctl.sensor) : read(ctl.sensor) - read(ctl.vs);
    const ok = holds(ctl, v) !== ctl.not;   // every condition is updated, so each keeps its hysteresis
    if (ctl.stop) { if (ok) stop = true; continue; }
    if (ctl.or && any) { all = all || group; group = true; }
    any = true;
    if (!ok) group = false;
  }
  return (any ? all || group : true) && !stop;
}

export function sense(world, cell) {
  for (const s of cell.sensors) {
    const i = s.piece, c = cell.cs[i], n = cell.sn[i];
    const x = cell.cx[i] + c * s.x - n * s.y, y = cell.cy[i] + n * s.x + c * s.y;
    if (s.kind === 'hunger') { s.value = energyLevel(world, cell); continue; }   // old designs: same as the built-in
    if (s.kind === 'chem') { s.value = nutrientAt(y); continue; }
    if (s.kind === 'statolith') {   // the grain lies on the lower wall: how far its direction points up (no weight: 0.5)
      s.value = world.gravity ? (1 + dsin(cell.phi[i] + s.facing)) / 2 : 0.5;
      continue;
    }
    if (s.kind === 'light') {
      if (!world.light) { s.value = 0; continue; }
      // how far it faces from straight up, against half its cone: full facing up, nothing at the cone's edge
      let off = cell.phi[i] + s.facing - Math.PI / 2;
      off -= 2 * Math.PI * Math.floor(off / (2 * Math.PI) + 0.5);
      if (off < 0) off = -off;
      const half = s.cone / 2;
      // underwater light is also scattered, and some comes through the shield: facing away it still sees a share
      const facing = off < half ? dcos(off / half * Math.PI / 2) : 0;
      s.value = (S.scatter + (1 - S.scatter) * facing) * lightAt(world, y);
    } else {
      const d = nearest(world, cell, x, y, s.range, s.feels === 'anything');
      s.value = s.kind === 'touch' ? (d <= s.range ? 1 : 0) : (d >= s.range ? 0 : d <= 0 ? 1 : 1 - d / s.range);
    }
  }
  for (const j of cell.joints) {
    if (j.speed && !j.burst) {   // its beat follows a reading
      const v = reading(world, cell, j.speed.sensor);
      let g = (v - j.speed.min) / (j.speed.max - j.speed.min);
      g = g < 0 ? 0 : g > 1 ? 1 : g;
      j.gain = j.speed.down ? 1 - g : g;   // down: full speed at the low end, stopped at the high end
    }
    if (!j.controls) continue;
    const all = holdsAll(world, cell, j.controls);
    if (j.burst) { if (all) fire(cell, j.burst.group); }   // a burst organ fires when its sensors say so
    else if (j.type === 'motor') j.on = all;
    else if (j.latched && all) j.latched = false;   // a trigger: released once, the first time they all hold
  }
}
