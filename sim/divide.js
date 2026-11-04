// Division (step 1, author 2026-11-01/02): a cell grown to at least twice its newborn volume (grow.js) splits into two
// cells of its design, each half its volume (divided at 2×: two newborns; at 4×: two of 2×): the daughter appears
// beside it, turned the same way, and each keeps half of the pool, of every store's energy and of the growth meter;
// plastid damage and a chamber's state are shared. A cell with kin pads places its daughter pad to pad and they stay
// joined (chains, author 2026-11-02): where the pads sit and the body's shape decide the chain's form. It waits while the tank holds PARAMS.grow.cap cells, while it starves, or while there
// is no room beside it (a wall, another cell), or while its DIVIDE rule doesn't hold (a 'rule' part; none: at once).
import { PARAMS } from './params.js';
import { DEG } from './dmath.js';
import { updatePose } from './physics.js';
import { makeCell, regrow, refit } from './grow.js';

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

// A pad's outward direction on the body (its own frame): across a rod's straight side, or out from an end's centre
function padNormal(body, pad) {
  const h = body.L / 2;
  const x = Math.abs(pad.x) <= h ? 0 : pad.x - Math.sign(pad.x) * h, y = pad.y, n = Math.hypot(x, y) || 1;
  return [x / n, y / n];
}
// Is a posed cell clear of every other cell (pieces apart by `gap`; `skip`: cells it may overlap, its own chain when it
// slots in) and of the tank's edges?
function posedClear(world, c, gap, skip = null) {
  for (let i = 0; i < c.pieces.length; i++) {
    const [x1, y1, x2, y2] = ends(c, i), a = c.pieces[i].a + gap;
    if (Math.min(x1, x2) < a || Math.max(x1, x2) > TW - a || Math.min(y1, y2) < a || Math.max(y1, y2) > TH - a) return false;
  }
  for (const o of world.cells) {
    if (skip && skip.has(o)) continue;
    const ox = o.q[0] - c.q[0], oy = o.q[1] - c.q[1], rr = c.reach + o.reach;
    if (ox * ox + oy * oy > rr * rr) continue;
    for (let i = 0; i < c.pieces.length; i++) {
      const A = ends(c, i);
      for (let j = 0; j < o.pieces.length; j++) if (segDist(...A, ...ends(o, j)) < c.pieces[i].a + o.pieces[j].a + gap) return false;
    }
  }
  return true;
}
// The cells joined to `c` by pads, itself included
function chainOf(world, c) {
  const seen = new Set([c]), todo = [c];
  while (todo.length) {
    const x = todo.pop();
    for (const l of world.links || []) {
      if (l.feed || l.tether) continue;
      const A = world.cells[l.a], B = world.cells[l.b], o = A === x ? B : B === x ? A : null;
      if (o && !seen.has(o)) { seen.add(o); todo.push(o); }
    }
  }
  return seen;
}
// Place the daughter pad to pad with its mother: a free kin pad on the mother's body facing one on the daughter's
// (turned so they face, the least turn first: a chain keeps its cells pointing the same way), 0.5 µm apart. In the
// middle of a chain (no free pad: author, "it slots in"), the daughter goes between the mother and a neighbour: her pad
// matching the mother's takes over that neighbour's link, and contact pushes the chain apart. The pair (and the link to
// hand over), or null (no kin pads, or no room)
function chainSpot(world, p, d) {
  const mine = d.pads.filter((x) => x.kind === 'kin' && x.piece === 0);
  if (!mine.length) return null;
  // a full chain takes no more (PARAMS.pads.chainVolume; at least two cells, at most maxChain): the daughter separates
  const chain = chainOf(world, p);
  let vol = d.pieces[0].volume;
  for (const c of chain) vol += c.pieces[0].volume;
  if (chain.size > 1 && (vol > PARAMS.pads.chainVolume || chain.size >= PARAMS.pads.maxChain)) return null;
  const freeOnes = p.pads.filter((x) => x.kind === 'kin' && !x.link && x.piece === 0);
  const tryPads = (free, insert) => {
    const tp = p.q[2], cp = Math.cos(tp), sp = Math.sin(tp), pairs = [];
    for (const A of free) for (const B of mine) {
      const twin = d.pads[p.pads.indexOf(A)];   // the daughter's copy of A: it takes A's old link when she slots in
      if (insert && (twin === B || !twin)) continue;
      const [ax, ay] = padNormal(p.pieces[0], A), [bx, by] = padNormal(d.pieces[0], B);
      const nx = cp * ax - sp * ay, ny = sp * ax + cp * ay;              // A's outward direction in the tank
      let td = Math.atan2(-ny, -nx) - Math.atan2(by, bx);                 // B's must point back at it
      let turn = td - tp; turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
      pairs.push({ A, B, twin, nx, ny, td: tp + turn, turn: Math.abs(turn) });
    }
    pairs.sort((u, v) => u.turn - v.turn);
    const q0 = Float64Array.from(d.q);
    const skip = insert ? chainOf(world, p) : null;
    for (const { A, B, twin, nx, ny, td } of pairs) {
      const pax = p.cx[0] + p.cs[0] * A.x - p.sn[0] * A.y, pay = p.cy[0] + p.sn[0] * A.x + p.cs[0] * A.y;
      const c = Math.cos(td), s = Math.sin(td), gap = 0.5;
      d.q[2] = td; d.q[0] = pax + nx * gap - (c * B.x - s * B.y); d.q[1] = pay + ny * gap - (s * B.x + c * B.y);
      updatePose(d);
      if (posedClear(world, d, 0.1, skip)) return { A, B, hand: insert ? { L: A.link, twin } : null };
    }
    d.q.set(q0); updatePose(d);
    return null;
  };
  return (freeOnes.length && tryPads(freeOnes, false))
    || tryPads(p.pads.filter((x) => x.kind === 'kin' && x.piece === 0 && x.link && !x.link.feed && x.link.padB), true);
}

// Is this cell ready, and allowed, to divide now?
export function ready(world, cell) {
  const g = cell.grow;
  if (!g || (cell.size || 1) < 2 - 1e-9 || cell.dead || cell.metab.starving) return false;
  if (cell.divideOk === false) { cell.waiting = 'its DIVIDE rule says not yet'; return false; }
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
    // the spot was found for the cell as big as it is; it shrinks to half, then its daughter appears there
    const half = p.size / 2, E = p.metab.E, stores = p.pieces[0].inclusions.filter((x) => !x.stolen).map((x) => (x.store ? x.fill * x.v : 0));
    // stolen plastids are shared out, one each in turn (the mother keeps the first)
    const theirs = (p.stolen || []).filter((s, i) => i % 2 === 1);
    p.stolen = (p.stolen || []).filter((s, i) => i % 2 === 0);
    if (!regrow(world, p, half)) { p.waiting = 'no room to divide'; continue; }
    // half the pool, half of each store's energy, half the meter; the daughter carries the same
    p.metab.E = Math.min(E / 2, p.metab.C);
    p.pieces[0].inclusions.forEach((x, i) => { if (x.store) { x.fill = Math.min(1, stores[i] / 2 / x.v); x.wpt.w = (x.density - CYTO) * x.v * x.fill * WG; } });
    p.grow.E /= 2; p.grow.N /= 2;
    const d = makeCell(p.design, half, theirs, [...(p.lost || [])]);   // plastids a thief took: missing in both, both rebuild
    d.q.set(p.q); d.q[0] = p.q[0] + spot[0]; d.q[1] = p.q[1] + spot[1];
    d.metab.E = p.metab.E; d.grow.E = p.grow.E; d.grow.N = p.grow.N;
    const pi = p.pieces[0].inclusions, di = d.pieces[0].inclusions;
    for (let i = 0; i < pi.length; i++) {
      const a = pi[i], b = di[i];
      if (!b) continue;
      if (a.store) { b.fill = a.fill; b.wpt.w = a.wpt.w; }
      if (a.material === 'plastid' && !a.stolen && !b.stolen) b.damage = a.damage;   // stolen ones keep their own
      if (a.material === 'chamber') { b.density = a.density; b.target = a.target; b.wpt.w = a.wpt.w; }
    }
    updatePose(d);
    refit(world, p); refit(world, d);   // in the smaller body: those that no longer fit move, or are digested
    const joined = PARAMS.pads && chainSpot(world, p, d);   // kin pads: pad to pad, and joined
    d.uid = world.nextUid = (world.nextUid || 0) + 1;
    world.cells.push(d);
    if (joined) {
      if (joined.hand) {   // slotting in: the old neighbour's link moves from the mother's pad to the daughter's twin pad
        const { L, twin } = joined.hand, di = world.cells.length - 1;
        if (L.padA === joined.A) { L.padA = twin; L.a = di; } else { L.padB = twin; L.b = di; }
        twin.link = L; joined.A.link = null;
      }
      const link = { a: world.cells.indexOf(p), b: world.cells.length - 1, padA: joined.A, padB: joined.B, holds: PARAMS.pads.kinBreak };
      joined.A.link = link; joined.B.link = link; (world.links ||= []).push(link);
      // making room (slotting in pushes the chain apart): its links hold for a moment whatever the pull
      if (joined.hand) for (const l of world.links) if (!l.feed && chainOf(world, p).has(world.cells[l.a])) l.grace = world.steps + PARAMS.pads.grace / PARAMS.time.dt;
      d.chainedAt = world.steps;
    }
    p.gen = (p.gen || 0) + 1; d.gen = p.gen;
    d.mother = p.uid; d.born = world.steps;
    world.births = (world.births || 0) + 1;
    (world.born ||= []).push(d);   // for the viewer (journals, lineage); it empties the list
  }
}
