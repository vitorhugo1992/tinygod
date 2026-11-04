// Growing (step 1, author 2026-11-02): the design is the newborn. Surplus energy and nitrogen (the growth meter's two
// bars) build the cell bigger, PARAMS.grow.step of its newborn volume at a time, up to PARAMS.grow.max times it. The body
// and everything on its rim grow with it (positions and lengths by its width); organelles inside keep pace up to twice its
// newborn volume (an ordinary life: every design that lives can divide) and beyond that gain only PARAMS.grow.organelles
// of its gain (author: "so it has incentive to steal plastids and energy from prey"; first at every size, but swimmers
// stalled below 2× and never divided), so a cell grown big earns less per µm³ and has more free room; the nucleus keeps the slots it was built with. A cell that
// has at least doubled may divide (divide.js): each daughter gets half its volume.
// Growing rebuilds the cell in place (the same object: its journal, lineage and links stay), carrying its pose, energy,
// stores (their energy, not their fill: a bigger store is emptier), plastid damage, chambers, motors and latches.
import { PARAMS } from './params.js';
import { buildCell } from './build.js';
import { planSubsteps, updatePose } from './physics.js';
import { initMetab } from './metab.js';
import { polyDist, insidePoly, volumeOf } from './shape.js';

const G = PARAMS.grow, S = PARAMS.steal, WG = PARAMS.gravity * 1e-6, CYTO = PARAMS.cell.cytoplasm;
const cbrt = (x) => Math.cbrt(x);

// How much an organelle's volume has grown when the cell has grown `g` times its newborn volume
export const organelleGrowth = (g) => (g <= 2 ? g : 2 + G.organelles * (g - 2));

// The design at `g` times its newborn volume
export function scaledDesign(design, g) {
  if (g === 1) return design;
  const w = cbrt(g), o = cbrt(organelleGrowth(g));   // linear: the body and rim, the organelles
  const d = JSON.parse(JSON.stringify(design));
  d.body.radius *= w;
  if (d.body.length) d.body.length *= w;
  const xy = (p, k) => { if (p.at) p.at = [p.at[0] * k, p.at[1] * k]; };
  for (const p of d.parts || []) {
    if (p.type === 'inclusion') {
      xy(p, w);
      p.radius *= o;
      if (p.length) p.length *= o;
      if (p.bend) p.bend /= o;
      if (Array.isArray(p.outline)) p.outline = p.outline.map(([x, y]) => [x * o, y * o]);
    } else if (p.type === 'segment') {
      xy(p, w);
      p.length *= w;
      p.radius *= w;
    } else xy(p, w);   // sensors, pads on the rim; rules have no place
  }
  return d;
}

// Carry a living cell's state onto a rebuilt one (`to`, a different size or a daughter), store energy kept
function carry(from, to) {
  to.q.set(from.q);
  to.design = from.design; to.size = from.size;
  to.energy = from.energy; to.resting = from.resting; to.divideOk = from.divideOk;
  const fm = from.metab, tm = to.metab;
  tm.E = Math.min(fm.E, tm.C); tm.lastMotor = fm.lastMotor; tm.lastPump = fm.lastPump; tm.starving = fm.starving;
  if (from.grow && to.grow) { to.grow.E = Math.min(from.grow.E, to.grow.Eneed); to.grow.N = Math.min(from.grow.N, to.grow.Nneed); }
  const fi = from.pieces[0].inclusions, ti = to.pieces[0].inclusions;
  for (let i = 0; i < ti.length && i < fi.length; i++) {
    const a = fi[i], b = ti[i];
    if (a.material === 'plastid') b.damage = a.damage || 0;
    if (a.material === 'chamber') { b.density = a.density; b.target = a.target; b.wpt.w = (b.density - CYTO) * b.v * WG; }
    if (a.store) { b.fill = Math.min(1, a.fill * a.v / b.v); b.wpt.w = (b.density - CYTO) * b.v * b.fill * WG; }
  }
  from.joints.forEach((j, i) => {
    const k = to.joints[i];
    if (!k) return;
    k.on = j.on; k.clock = j.clock; k.gain = j.gain; k.latched = j.latched;
    if (j.burst && k.burst) { k.burst.state = j.burst.state; k.burst.t = j.burst.t; }
  });
  from.sensors.forEach((s, i) => { if (to.sensors[i]) to.sensors[i].value = s.value; });
  from.feeders.forEach((f, i) => { if (to.feeders[i]) to.feeders[i].go = f.go; });
}

// The design at `g`, with the cell's stolen plastids added (each stored as { at: its spot in the newborn's frame, r,
// pigment, damage, fade }; they don't grow, their spots move out with the body)
// Plastids of its own a thief took (`lost`: their places in the design) are left out (a rule part with no rule
// stands in, so every other part keeps its place) until it rebuilds them
function withStolen(design, g, stolen, lost) {
  const d = scaledDesign(design, g);
  if ((!stolen || !stolen.length) && (!lost || !lost.length)) return d;
  const w = cbrt(g), out = d === design ? { ...design, parts: [...(design.parts || [])] } : d;
  for (const k of lost || []) out.parts[k] = { type: 'rule', id: `lost${k}` };
  for (const s of stolen || []) out.parts.push({ type: 'inclusion', material: 'plastid', pigment: s.pigment, radius: s.r, at: [s.at[0] * w, s.at[1] * w], stolen: s });
  return out;
}

// A cell of `design` at `g` times its newborn volume (with its stolen plastids, if any), not yet in the tank
export function makeCell(design, g = 1, stolen = [], lost = []) {
  const c = buildCell(withStolen(design, g, stolen, lost), { loose: true });
  c.design = design; c.size = g; c.stolen = stolen; c.lost = lost;
  for (const inc of c.pieces[0].inclusions) if (inc.stolen) inc.damage = inc.stolen.damage;
  planSubsteps(c);
  initMetab(c);
  return c;
}

// Rebuild a living cell at `g` times its newborn volume, in place; false if it can't be built
export function regrow(world, cell, g) {
  let n;
  try { n = makeCell(cell.design, g, cell.stolen || [], cell.lost || []); } catch (e) { return false; }
  const old = { ...cell }, ratio = cbrt(g / (cell.size || 1));
  carry(old, n);
  for (const inc of n.pieces[0].inclusions) if (inc.stolen) inc.damage = inc.stolen.damage;   // not by place: stolen ones come and go
  n.size = g;
  // its latches and pad links: the same pads and feeders, rebuilt; where it is held by another (a pad, a tube), the
  // spot on its body moves out with it
  const swap = new Map();
  old.pads.forEach((p, i) => { if (n.pads[i]) { swap.set(p, n.pads[i]); n.pads[i].link = p.link; } });
  old.feeders.forEach((f, i) => { if (n.feeders[i]) { swap.set(f, n.feeders[i]); n.feeders[i].link = f.link; } });
  (old.tethers || []).forEach((t, i) => { const m = n.tethers && n.tethers[i]; if (m) { swap.set(t, m); m.link = t.link; m.t = t.t; } });
  for (const l of world.links || []) {
    if (swap.has(l.padA)) l.padA = swap.get(l.padA);
    if (l.padB && swap.has(l.padB)) l.padB = swap.get(l.padB);
    if (world.cells[l.b] === cell && !l.padB && l.bx !== undefined) { l.bx *= ratio; l.by *= ratio; }
  }
  for (const k of Object.keys(n)) cell[k] = n[k];
  updatePose(cell);
  return true;
}

// Every PARAMS.grow.every steps: a living cell whose bars hold a growth step's energy and nitrogen grows by it
// (up to PARAMS.grow.max times its newborn volume: there it stops, and its surplus goes to its stores)
export function growCells(world) {
  if (world.steps % G.every) return;
  for (const c of world.cells) {
    if (c.toTake && !c.dead) take(world, c);
    if (c.toSteal && !c.dead) steal(world, c);
    if ((c.stolen || []).some((s) => s.fade < S.gone)) {   // faded away: its room freed
      const left = c.stolen.filter((s) => s.fade >= S.gone);
      c.faded = (c.faded || 0) + c.stolen.length - left.length;
      c.stolen = left; regrow(world, c, c.size || 1);
    }
    const g = c.grow;
    if (!g || c.dead || c.metab.starving) continue;
    // a plastid a thief took is rebuilt first, at growth prices for its volume
    if (c.lost && c.lost.length) {
      const k = c.lost[0], p = c.design.parts[k], v = volumeOf(p) * organelleGrowth(c.size || 1);
      const E = v * G.energy, N = v * G.nitrogen;
      if (g.E >= E && g.N >= N) {
        const keep = { E: g.E - E, N: g.N - N };
        c.lost = c.lost.slice(1); c.rebuilt = (c.rebuilt || 0) + 1;
        if (regrow(world, c, c.size || 1)) { c.grow.E = keep.E; c.grow.N = keep.N; refit(world, c); }
      }
      continue;
    }
    if ((c.size || 1) >= G.max - 1e-9) continue;
    if (g.E < g.stepE || g.N < g.stepN) continue;
    const E = g.E, N = g.N;
    if (!regrow(world, c, Math.min(G.max, (c.size || 1) + G.step))) { c.waiting = 'no room to grow'; continue; }
    c.grow.E = E - g.stepE; c.grow.N = N - g.stepN;
  }
}

// A free spot for a round plastid of radius r inside the cell's body (its own frame), clear of the outlines `taken` and
// of the circles `extra` ([x, y, r]): full size nearest the middle if it can; else squeezed (soft: author 2026-11-02)
// into the roomiest gap, down to PARAMS.steal.squeeze of its radius. Returns [x, y, radius there] or null
function spotFor(body, r, taken, extra = []) {
  const h = body.L / 2, least = S.squeeze * r, room = body.a - PARAMS.cell.wallThickness;
  if (room - least <= 0) return null;
  const spots = [], reach = room - least;
  for (let x = -h - reach; x <= h + reach + 1e-9; x += S.grid) for (let y = -reach; y <= reach + 1e-9; y += S.grid) {
    const dx = Math.max(Math.abs(x) - h, 0), d = Math.sqrt(dx * dx + y * y);
    if (d <= reach) spots.push([x, y, x * x + y * y, room - d]);
  }
  spots.sort((p, q) => p[2] - q[2]);
  let best = null;
  for (const [x, y, , wall] of spots) {
    const c = clearance(x, y, wall, taken, extra);
    if (c >= r) return [x, y, r];
    if (c >= least && (!best || c > best[2])) best = [x, y, c];
  }
  return best;
}
// how big a circle fits at (x, y): the wall's distance, the outlines', the circles'
function clearance(x, y, wall, taken, extra) {
  let c = wall;
  for (const o of taken) { if (insidePoly(o, x, y)) return 0; c = Math.min(c, polyDist(o, x, y)); }
  for (const [ex, ey, er] of extra) c = Math.min(c, Math.hypot(ex - x, ey - y) - er);
  return c;
}
const radiusOf = (v) => cbrt(3 * v / (4 * Math.PI));
const trueVolume = (inc) => (inc.stolen && inc.stolen.v) || inc.v;   // a squeezed one keeps its volume

// A prey it killed gave up its plastids (metab.js: cell.toSteal): keep those that fit, biggest first
function steal(world, cell) {
  const { prey, plastids } = cell.toSteal;
  cell.toSteal = null;
  const body = cell.pieces[0], w = cbrt(cell.size || 1), got = [], placed = [];
  const taken = body.inclusions.map((i) => i.outline);
  for (const p of plastids.sort((x, y) => y.v - x.v)) {
    const at = spotFor(body, radiusOf(p.v), taken, placed);
    if (!at) continue;
    placed.push(at);
    got.push({ at: [at[0] / w, at[1] / w], r: at[2], v: p.v, pigment: p.pigment, damage: p.damage, fade: p.fade });
  }
  cell.lastSteal = { prey, got: got.length, lost: plastids.length - got.length, step: world.steps };
  if (!got.length) return;
  cell.stolen = [...(cell.stolen || []), ...got];
  regrow(world, cell, cell.size || 1);
}

// After a division (a smaller body): each stolen plastid stays where it is if it still fits, else moves to a free spot,
// else is digested
export function refit(world, cell) {
  if (!cell.stolen || !cell.stolen.length) return;
  const body = cell.pieces[0], w = cbrt(cell.size || 1), room = body.a - PARAMS.cell.wallThickness;
  const taken = body.inclusions.filter((i) => !i.stolen).map((i) => i.outline), kept = [], keep = [];
  let changed = false;
  for (const s of cell.stolen) {
    const inc = body.inclusions.find((i) => i.stolen === s);
    const wall = inc ? room - Math.hypot(Math.max(Math.abs(inc.x) - body.L / 2, 0), inc.y) : 0;
    if (inc && clearance(inc.x, inc.y, wall, taken, kept) >= s.r - 1e-9) { kept.push([inc.x, inc.y, s.r]); keep.push(s); continue; }
    changed = true;
    const at = spotFor(body, radiusOf(s.v || 4 / 3 * Math.PI * s.r ** 3), taken, kept);
    if (at) { s.at = [at[0] / w, at[1] / w]; s.r = at[2]; kept.push(at); keep.push(s); } else cell.digested = (cell.digested || 0) + 1;
  }
  if (!changed) return;
  cell.stolen = keep;
  regrow(world, cell, cell.size || 1);
}

// A living prey's biggest plastid that fits in the thief moves through the tube (metab.js: cell.toTake); the prey lives
// on without it (its own: rebuilt later; one it had stolen: gone)
function take(world, cell) {
  const prey = cell.toTake;
  cell.toTake = null;
  if (!world.cells.includes(prey) || prey.dead) return;
  const body = cell.pieces[0], w = cbrt(cell.size || 1), taken = body.inclusions.map((i) => i.outline);
  for (const inc of prey.pieces[0].inclusions.filter((i) => i.material === 'plastid').sort((a, b) => b.v - a.v)) {
    const v = trueVolume(inc), at = spotFor(body, radiusOf(v), taken);
    if (!at) continue;
    const fade = inc.stolen ? inc.stolen.fade : 1;
    if (inc.stolen) prey.stolen = prey.stolen.filter((s) => s !== inc.stolen);
    else prey.lost = [...(prey.lost || []), inc.part];
    regrow(world, prey, prey.size || 1);
    cell.stolen = [...(cell.stolen || []), { at: [at[0] / w, at[1] / w], r: at[2], v, pigment: inc.pigment, damage: inc.damage || 0, fade }];
    regrow(world, cell, cell.size || 1);
    cell.lastTake = { prey: prey.species, step: world.steps };
    prey.lastRobbed = { by: cell.species, step: world.steps };
    return;
  }
}
