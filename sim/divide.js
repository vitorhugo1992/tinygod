// Division (step 1, author 2026-11-01/02): when a cell's growth meter is full (both bars), it splits into two cells of
// exactly its design, the same size: the daughter appears touching it, turned the same way, and each keeps half of
// the pool and half of every store (a store's fill halves); plastid damage and a chamber's state are shared; both
// meters start again from zero. It waits while the tank holds PARAMS.grow.cap cells, while it starves, or while there
// is no room beside it (a wall, another cell). Nothing else decides: no chain rule, no growth rule.
import { PARAMS } from './params.js';
import { DEG } from './dmath.js';
import { addCell } from './world.js';
import { updatePose } from './physics.js';

const G = PARAMS.grow, TW = PARAMS.tank.w, TH = PARAMS.tank.h, WG = PARAMS.gravity * 1e-6, CYTO = PARAMS.cell.cytoplasm;

// A piece's axis ends in the world, shifted by (dx, dy)
const ends = (c, i, dx = 0, dy = 0) => {
  const h = c.pieces[i].L / 2;
  return [c.cx[i] - c.cs[i] * h + dx, c.cy[i] - c.sn[i] * h + dy, c.cx[i] + c.cs[i] * h + dx, c.cy[i] + c.sn[i] * h + dy];
};
// Distance between two segments (enough for room: the nearer of the four end-to-segment distances, or 0 if they cross)
function segPoint(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
function segDist(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
  const d1 = cross(a1x, a1y, a2x, a2y, b1x, b1y), d2 = cross(a1x, a1y, a2x, a2y, b2x, b2y);
  const d3 = cross(b1x, b1y, b2x, b2y, a1x, a1y), d4 = cross(b1x, b1y, b2x, b2y, a2x, a2y);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(segPoint(a1x, a1y, b1x, b1y, b2x, b2y), segPoint(a2x, a2y, b1x, b1y, b2x, b2y),
    segPoint(b1x, b1y, a1x, a1y, a2x, a2y), segPoint(b2x, b2y, a1x, a1y, a2x, a2y));
}

// Is there room for a copy of `cell` shifted by (dx, dy)? Every piece clear of every cell's pieces (the parent's too) and
// of the tank's walls, floor and surface
function roomFor(world, cell, dx, dy) {
  const gap = 0.5;
  for (let i = 0; i < cell.pieces.length; i++) {
    const [x1, y1, x2, y2] = ends(cell, i, dx, dy), a = cell.pieces[i].a + gap;
    if (Math.min(x1, x2) < a || Math.max(x1, x2) > TW - a || Math.min(y1, y2) < a || Math.max(y1, y2) > TH - a) return false;
  }
  for (const other of world.cells) {
    const ox = other.q[0] - cell.q[0] - dx, oy = other.q[1] - cell.q[1] - dy, r = cell.reach + other.reach;
    if (ox * ox + oy * oy > r * r) continue;
    for (let i = 0; i < cell.pieces.length; i++) {
      const A = ends(cell, i, dx, dy);
      for (let j = 0; j < other.pieces.length; j++) {
        if (segDist(...A, ...ends(other, j)) < cell.pieces[i].a + other.pieces[j].a + gap) return false;
      }
    }
  }
  return true;
}

// Where the daughter goes: the nearest spot touching or near the parent, beside it first (across its axis), then
// ahead or behind; null if none within a cell's reach
function spotFor(world, cell) {
  const body = cell.pieces[0], c = cell.cs[0], s = cell.sn[0];
  const dirs = [[-s, c, 2 * body.a], [s, -c, 2 * body.a], [c, s, body.L + 2 * body.a], [-c, -s, body.L + 2 * body.a]];
  for (let extra = 0.5; extra <= 2 * cell.reach; extra += 2) {
    for (const [ux, uy, touch] of dirs) {
      const d = touch + extra;
      if (roomFor(world, cell, ux * d, uy * d)) return [ux * d, uy * d];
    }
  }
  return null;
}

// Is this cell ready, and allowed, to divide now?
export function ready(world, cell) {
  const g = cell.grow;
  if (!g || g.E < g.Eneed || g.N < g.Nneed || cell.dead || cell.metab.starving) return false;
  return true;
}

// Once every `G.every` steps: each ready cell divides if the tank has room for one more and there is a spot beside it
export function divideCells(world) {
  if (world.steps % G.every) return;
  const n = world.cells.length;
  for (let k = 0; k < n; k++) {
    const p = world.cells[k];
    p.waiting = null;
    if (!ready(world, p)) continue;
    if (world.cells.length >= G.cap) { p.waiting = 'tank full'; continue; }
    const spot = spotFor(world, p);
    if (!spot) { p.waiting = 'no room beside it'; continue; }
    const d = addCell(world, p.design, p.q[0] + spot[0], p.q[1] + spot[1], p.q[2] / DEG);
    // the same shape now: every joint as the parent's
    for (let j = 3; j < p.q.length; j++) d.q[j] = p.q[j];
    updatePose(d);
    // half the pool, half of each store; plastid damage and chambers as the parent's
    p.metab.E /= 2; d.metab.E = p.metab.E;
    const pi = p.pieces[0].inclusions, di = d.pieces[0].inclusions;
    for (let i = 0; i < pi.length; i++) {
      const a = pi[i], b = di[i];
      if (a.store) { a.fill /= 2; b.fill = a.fill; for (const x of [a, b]) x.wpt.w = (x.density - CYTO) * x.v * x.fill * WG; }
      if (a.material === 'plastid') b.damage = a.damage;
      if (a.material === 'chamber') { b.density = a.density; b.target = a.target; b.wpt.w = a.wpt.w; }
    }
    p.grow.E = p.grow.N = 0;
    p.gen = (p.gen || 0) + 1; d.gen = p.gen;
    d.mother = p.uid; d.born = world.steps;
    world.births = (world.births || 0) + 1;
    (world.born ||= []).push(d);   // for the viewer (journals, lineage); it empties the list
  }
}
