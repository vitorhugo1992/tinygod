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

const G = PARAMS.grow, WG = PARAMS.gravity * 1e-6, CYTO = PARAMS.cell.cytoplasm;
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

// A cell of `design` at `g` times its newborn volume, not yet in the tank
export function makeCell(design, g = 1) {
  const c = buildCell(scaledDesign(design, g), { loose: true });
  c.design = design; c.size = g;
  planSubsteps(c);
  initMetab(c);
  return c;
}

// Rebuild a living cell at `g` times its newborn volume, in place; false if it can't be built
export function regrow(world, cell, g) {
  let n;
  try { n = makeCell(cell.design, g); } catch (e) { return false; }
  const old = { ...cell }, ratio = cbrt(g / (cell.size || 1));
  carry(old, n);
  n.size = g;
  // its latches and pad links: the same pads and feeders, rebuilt; where it is held by another (a pad, a tube), the
  // spot on its body moves out with it
  const swap = new Map();
  old.pads.forEach((p, i) => { if (n.pads[i]) { swap.set(p, n.pads[i]); n.pads[i].link = p.link; } });
  old.feeders.forEach((f, i) => { if (n.feeders[i]) { swap.set(f, n.feeders[i]); n.feeders[i].link = f.link; } });
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
    const g = c.grow;
    if (!g || c.dead || c.metab.starving || (c.size || 1) >= G.max - 1e-9) continue;
    if (g.E < g.stepE || g.N < g.stepN) continue;
    const E = g.E, N = g.N;
    if (!regrow(world, c, Math.min(G.max, (c.size || 1) + G.step))) { c.waiting = 'no room to grow'; continue; }
    c.grow.E = E - g.stepE; c.grow.N = N - g.stepN;
  }
}
