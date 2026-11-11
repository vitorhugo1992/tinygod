// Cells meeting cells, found once a step and handed to each cell as cell.ext (physics.js applies them):
// - contact: pieces of different cells push apart where their capsules overlap;
// - pads: a kin pad sticks to a kin pad of the same species, a mucus pad to any surface of another cell;
//   a stuck pad is a spring that snaps when pulled harder than its pad holds;
// - peduncles: a feeding tube's tip touching another species' body latches (paying PARAMS.feed.pierce), held like a
//   pad link (it snaps past PARAMS.feed.hold; piercing costs PARAMS.feed.pierce per µm of tube); it lets go when its rule stops, its cell dies, or the prey is drained
//   (metab.js sets link.done); metab.js drains the prey through it;
// - groups: cells joined by pads. No chain rule: chains come from pads meeting. A hidden backstop
//   (PARAMS.pads.maxChain) only blocks a new link that would make a group bigger than that.
import { PARAMS } from './params.js';
import { drainEnergy, energyOf } from './metab.js';
import { setSegmentLength } from './build.js';

const KCC = PARAMS.contact.cells;
const PAD = PARAMS.pads, FEED = PARAMS.feed;

// Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9);
// returns [s, t] along each, 0..1
function closest(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
  const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) return [0, 0];
  if (a <= 1e-12) { s = 0; t = cl(f / e); }
  else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-12) { t = 0; s = cl(-c / a); }
    else {
      const b = d1x * d2x + d1y * d2y, den = a * e - b * b;
      s = den > 1e-12 ? cl((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = cl(-c / a); }
      else if (t > 1) { t = 1; s = cl((b - c) / a); }
    }
  }
  return [s, t];
}

// A piece's axis ends in the world
function ends(cell, i) {
  const p = cell.pieces[i], h = p.L / 2, c = cell.cs[i], s = cell.sn[i];
  return [cell.cx[i] - c * h, cell.cy[i] - s * h, cell.cx[i] + c * h, cell.cy[i] + s * h];
}

// World point -> piece i's own frame
function toLocal(cell, i, x, y) {
  const dx = x - cell.cx[i], dy = y - cell.cy[i], c = cell.cs[i], s = cell.sn[i];
  return [c * dx + s * dy, -s * dx + c * dy];
}

function padWorld(cell, pad) {
  const i = pad.piece, p = cell.pieces[i], c = cell.cs[i], s = cell.sn[i];
  const x = pad.x + (p.ext ? p.offset : 0);   // on an extending part, measured from its tip
  return [cell.cx[i] + c * x - s * pad.y, cell.cy[i] + s * x + c * pad.y];
}

// Closest surface point of another cell to (x, y), within `reach`: [piece, lx, ly, dist] or null
function surfaceNear(cell, x, y, reach, only = -1) {
  let best = null;
  for (let i = 0; i < cell.pieces.length; i++) {
    if (only >= 0 && i !== only) continue;
    const [ax, ay, bx, by] = ends(cell, i);
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t, py = ay + dy * t;
    const d = Math.hypot(x - px, y - py) - cell.pieces[i].a;
    if (d <= reach && (!best || d < best[3])) {
      const k = d + cell.pieces[i].a > 1e-9 ? cell.pieces[i].a / (d + cell.pieces[i].a) : 0;
      const [lx, ly] = toLocal(cell, i, px + (x - px) * k, py + (y - py) * k);
      best = [i, lx, ly, d];
    }
  }
  return best;
}

// Groups of cells joined by pads (union-find over the links, a peduncle's latch not counted); sets cell.group and
// returns sizes by group (and their volumes in groups.vol)
function groups(world) {
  const parent = world.cells.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (const l of world.links) { if (l.feed || l.tether) continue; const a = find(l.a), b = find(l.b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
  const size = new Map(), vol = new Map();
  // the volume cap counts kin chains only (kin pad to kin pad): mucus stuck to a stranger, even a giant, doesn't fill it
  // (author 2026-11-05: mucus pads couldn't stick to giants)
  const kin = world.cells.map((_, i) => i);
  const findK = (i) => { while (kin[i] !== i) i = kin[i] = kin[kin[i]]; return i; };
  for (const l of world.links) { if (l.feed || l.tether || !l.padB) continue; const a = findK(l.a), b = findK(l.b); if (a !== b) kin[Math.max(a, b)] = Math.min(a, b); }
  world.cells.forEach((c, i) => { c.group = find(i); c.kinGroup = findK(i); size.set(c.group, (size.get(c.group) || 0) + 1); vol.set(c.kinGroup, (vol.get(c.kinGroup) || 0) + c.pieces[0].volume); });
  size.vol = vol;
  return size;
}

// How big a cell is to a mouth (author 2026-11-05: spines count, the classic defence against grazers): half its
// narrowest width, the way it would best fit through a gape, counting its body and the tips of its rigid outside parts
// (spines, harpoons, tethers, feeding tubes). A rod goes in end-first (its body length never counted), so spines along
// its axis don't help, nor does one spine alone; spines pointing several ways do. Flagella fold; a thrown harpoon is gone
export function mouthSize(c) {
  const body = c.pieces[0], a = body.a, h = (body.L || 0) / 2, tips = [];
  for (const p of c.pieces) {
    if (p.parent !== 0 || p.kind !== 'segment' || p.L <= 0) continue;
    const j = p.joint >= 0 ? c.joints[p.joint] : null;
    if (j && j.type !== 'fire' && j.type !== 'tether' && j.type !== 'feed') continue;
    tips.push([p.ax + Math.cos(p.mount) * p.L, p.ay + Math.sin(p.mount) * p.L]);
  }
  if (!tips.length) return a;
  let least = Infinity;
  for (let k = 0; k < 90; k++) {   // every 2°: the width across that direction
    const u = k * Math.PI / 90, nx = Math.cos(u), ny = Math.sin(u), e = Math.abs(h * nx);
    let lo = -e - a, hi = e + a;
    for (const [x, y] of tips) { const d = x * nx + y * ny; if (d < lo) lo = d; if (d > hi) hi = d; }
    if (hi - lo < least) least = hi - lo;
  }
  return Math.max(a, least / 2);
}

// The cells joined to `c` by pads (a peduncle's latch not counted), itself included
function chainOf(world, c) {
  const seen = new Set([c]), todo = [c];
  while (todo.length) {
    const x = todo.pop();
    for (const l of world.links) {
      if (l.feed || !l.padB) continue;
      const A = world.cells[l.a], B = world.cells[l.b], o = A === x ? B : B === x ? A : null;
      if (o && !seen.has(o)) { seen.add(o); todo.push(o); }
    }
  }
  return seen;
}

export function interact(world) {
  const cells = world.cells;
  world.links ||= [];
  for (const c of cells) c.ext = [];
  cells.forEach((c, i) => { c.index = i; });

  // contact between pieces of different cells
  for (let a = 0; a < cells.length; a++) {
    const A = cells[a];
    for (let b = a + 1; b < cells.length; b++) {
      const B = cells[b];
      const dx = A.q[0] - B.q[0], dy = A.q[1] - B.q[1], r = A.reach + B.reach;
      if (dx * dx + dy * dy > r * r) continue;
      for (let i = 0; i < A.pieces.length; i++) {
        const [a1x, a1y, a2x, a2y] = ends(A, i);
        for (let j = 0; j < B.pieces.length; j++) {
          const [b1x, b1y, b2x, b2y] = ends(B, j);
          const [s, t] = closest(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y);
          const px = a1x + (a2x - a1x) * s, py = a1y + (a2y - a1y) * s;
          const qx = b1x + (b2x - b1x) * t, qy = b1y + (b2y - b1y) * t;
          const rr = A.pieces[i].a + B.pieces[j].a;
          let nx = px - qx, ny = py - qy;
          const d = Math.hypot(nx, ny);
          if (d >= rr) continue;
          if (d > 1e-9) { nx /= d; ny /= d; } else { nx = 0; ny = 1; }
          // each side is pushed until it clears the other's surface, from where the other is now
          const [ax, ay] = toLocal(A, i, px, py), [bx, by] = toLocal(B, j, qx, qy);
          A.ext.push({ type: 'push', piece: i, x: ax, y: ay, nx, ny, tx: qx + nx * rr, ty: qy + ny * rr, k: KCC });
          B.ext.push({ type: 'push', piece: j, x: bx, y: by, nx: -nx, ny: -ny, tx: px - nx * rr, ty: py - ny * rr, k: KCC });
        }
      }
    }
  }

  // existing links: snap if pulled too hard, else pull both ends together
  const kept = [];
  for (const l of world.links) {
    const A = cells[l.a], B = cells[l.b];
    const [ax, ay] = padWorld(A, l.padA);
    const [bx, by] = l.padB ? padWorld(B, l.padB) : (() => {
      const i = l.pieceB, c = B.cs[i], s = B.sn[i];
      return [B.cx[i] + c * l.bx - s * l.by, B.cy[i] + s * l.bx + c * l.by];
    })();
    if (l.tether) {   // a tether's line: a rope, slack until tight, then a spring; reeled in or out by its rules
      const T = PARAMS.tether, t = l.padA, d = Math.hypot(ax - bx, ay - by);
      if (t.reelIn) l.len = Math.max(0, l.len - T.reel * PARAMS.time.dt); else if (t.reelOut) l.len = Math.min(T.max, l.len + T.reel * PARAMS.time.dt);
      const pull = d > l.len ? T.stiffness * (d - l.len) : 0;
      l.load += (pull - l.load) * Math.min(1, PARAMS.time.dt / T.loadTime);
      const why = A.dead ? 'died' : B.dead ? 'its catch died' : t.letGo ? 'let go' : l.load > l.holds ? 'snapped' : null;
      if (why) { t.link = null; t.t = T.reload; A.lastTie = { what: B.species, why, step: world.steps }; continue; }
      kept.push(l);
      if (pull > 0) {   // each end pulled toward the point the line's length away from the other
        const ux = (ax - bx) / d, uy = (ay - by) / d, [lax, lay] = toLocal(A, t.piece, ax, ay), [lbx, lby] = toLocal(B, l.pieceB, bx, by);
        A.ext.push({ type: 'pull', piece: t.piece, x: lax, y: lay, tx: bx + ux * l.len, ty: by + uy * l.len, k: T.stiffness });
        B.ext.push({ type: 'pull', piece: l.pieceB, x: lbx, y: lby, tx: ax - ux * l.len, ty: ay - uy * l.len, k: T.stiffness });
      }
      continue;
    }
    const force = PAD.stiffness * Math.hypot(ax - bx, ay - by);
    // a peduncle's link breaks under a sustained pull (averaged over PARAMS.feed.loadTime), not the jerk of each
    // stroke of its own tail (a swimmer's body bounces ~10 µm a stroke); a spring jump's long pull still snaps it
    if (l.feed) l.load = (l.load || 0) + (force - (l.load || 0)) * Math.min(1, PARAMS.time.dt / FEED.loadTime);
    const letGo = l.feed ? (!l.padA.go || l.done || A.dead)   // a peduncle lets go
      : (l.padA.go === false || (l.padB && l.padB.go === false) || A.dead || B.dead);   // a pad's rule lets go; the dead let go
    const graced = l.grace && world.steps < l.grace;   // a chain making room for a new cell: no snapping yet
    if (((l.feed ? l.load : force) > l.holds && !graced) || letGo) {
      l.padA.link = null; if (l.padB) l.padB.link = null;
      if (l.feed) A.lastMeal = { prey: B.species, why: letGo ? (l.done ? 'drained' : A.dead ? 'died' : 'rule') : 'torn', took: l.took || 0, step: world.steps, drillLost: l.drill > 0 ? l.drillAll - l.drill : 0 };
      continue;
    }
    kept.push(l);
    const [lax, lay] = toLocal(A, l.padA.piece, ax, ay);
    A.ext.push({ type: 'pull', piece: l.padA.piece, x: lax, y: lay, tx: bx, ty: by, k: PAD.stiffness });
    const pb = l.padB ? l.padB.piece : l.pieceB;
    const [lbx, lby] = toLocal(B, pb, bx, by);
    B.ext.push({ type: 'pull', piece: pb, x: lbx, y: lby, tx: ax, ty: ay, k: PAD.stiffness });
  }
  world.links = kept;
  // shielding: each body's drag by how many kin it is joined to (PARAMS.pads.shield)
  const joins = new Map();
  for (const l of kept) if (!l.feed && l.padB) for (const c of [cells[l.a], cells[l.b]]) joins.set(c, (joins.get(c) || 0) + 1);
  for (const c of cells) { c.neighbours = joins.get(c) || 0; c.shield = PAD.shield[Math.min(c.neighbours, PAD.shield.length - 1)]; }

  // free peduncles whose rule holds latch onto another species' body their tip touches
  for (const A of cells) {
    if (A.dead) continue;
    for (const f of A.feeders) {
      if (f.link || !f.go) continue;
      A.cantPierce = null;
      const [x, y] = padWorld(A, f);
      for (const B of cells) {
        if (B === A || B.species === A.species || B.emptied) continue;
        const dx = A.q[0] - B.q[0], dy = A.q[1] - B.q[1], r = A.reach + B.reach;
        if (dx * dx + dy * dy > r * r) continue;
        const hit = surfaceNear(B, x, y, f.r, 0);   // the body only: spines and flagella keep it off
        if (!hit) continue;
        // the tube's own price at once (a predator that can't pay doesn't latch, and says so); what plates add is
        // drilled afterwards as a flow (PARAMS.feed.drill, metab.js), draining nothing until it is through
        const extra = f.cost * PARAMS.plates.pierce * (B.pieces[0].plates || 0), price = f.cost + extra;
        if (world.metab && A.metab.E < f.cost) { A.cantPierce = { prey: B.species, price: f.cost }; continue; }
        const link = { a: A.index, b: B.index, padA: f, pieceB: 0, bx: hit[1], by: hit[2], holds: FEED.hold, feed: true, took: 0, tookN: 0, since: world.steps, price,
          drill: world.metab ? extra : 0, drillAll: extra };
        f.link = link; world.links.push(link);
        if (world.metab) A.metab.E -= f.cost;
        break;
      }
    }
  }

  // harpoons (PARAMS.harpoon): a grown one whose rule holds throws its spine straight out, blind; the first piece of any
  // cell in its line takes it: a body (kin too) is stunned and wounded, a spine or flagellum catches it
  const HP = PARAMS.harpoon;
  for (const A of cells) {
    for (const h of A.harpoons || []) {
      if (A.dead || !h.go || h.t > 0 || (world.metab && A.metab.E < h.cost)) continue;
      if (world.metab) A.metab.E -= h.cost;
      const [x0, y0] = padWorld(A, h), ux = A.cs[h.piece], uy = A.sn[h.piece];
      h.t = HP.reload; setSegmentLength(A.pieces[h.piece], 0);   // thrown: it grows back (sense.js)
      let best = null;
      for (const B of cells) {
        if (B === A) continue;
        const dx = B.q[0] - x0, dy = B.q[1] - y0, r = HP.range + B.reach;
        if (dx * dx + dy * dy > r * r) continue;
        for (let k = 0; k < B.pieces.length; k++) {
          const [ax, ay, bx, by] = ends(B, k), a = B.pieces[k].a;
          for (let s = 0; s <= HP.range && (!best || s < best.s); s += 0.5) {   // walk along the dart's line
            const px = x0 + ux * s, py = y0 + uy * s, ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
            let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const qx = ax + ex * t - px, qy = ay + ey * t - py;
            if (qx * qx + qy * qy <= a * a) { best = { s, B, k }; break; }
          }
        }
      }
      const B = best && best.B, hit = B && best.k === 0 && !B.dead ? B : null, len = best ? best.s : HP.range;
      h.shot = { step: world.steps, x0, y0, x1: x0 + ux * len, y1: y0 + uy * len, hit: hit ? hit.species : null,
        caught: !B || hit ? null : B.dead ? 'a dead cell' : 'a spine or flagellum', kin: !!hit && hit.species === A.species };
      A.lastShot = h.shot;
      if (hit) { const has = world.metab ? energyOf(hit) : 0, hurt = (HP.venom + HP.wound * has) / (1 + PARAMS.plates.harpoon * (hit.pieces[0].plates || 0)), lost = world.metab ? drainEnergy(hit, hurt) : 0;
        if (world.metab && hurt >= has) { hit.dead = true; hit.diedAt = world.steps; hit.diedWhy = `killed by a ${A.species}'s harpoon`; } hit.stunT = HP.stun; hit.harpooned = { by: A.species, lost, step: world.steps }; }
    }
  }

  // tethers (PARAMS.tether): a free one whose rule holds throws its dart straight out, blind, as a harpoon does; the
  // first piece of any living cell in its line (a body, spine or flagellum; kin too) is tied to it on a line as long as
  // the throw; a miss winds back
  const TP = PARAMS.tether;
  for (const A of cells) {
    for (const t of A.tethers || []) {
      if (A.dead || !t.go || t.link || t.t > 0 || (world.metab && A.metab.E < t.cost)) continue;
      if (world.metab) A.metab.E -= t.cost;
      const [x0, y0] = padWorld(A, t), ux = A.cs[t.piece], uy = A.sn[t.piece];
      let best = null;
      for (const B of cells) {
        if (B === A || B.dead) continue;
        const dx = B.q[0] - x0, dy = B.q[1] - y0, r = TP.range + B.reach;
        if (dx * dx + dy * dy > r * r) continue;
        for (let k = 0; k < B.pieces.length; k++) {
          const [ax, ay, bx, by] = ends(B, k), a = B.pieces[k].a;
          for (let s = 0; s <= TP.range && (!best || s < best.s); s += 0.5) {
            const px = x0 + ux * s, py = y0 + uy * s, ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
            let u = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
            u = u < 0 ? 0 : u > 1 ? 1 : u;
            const qx = ax + ex * u - px, qy = ay + ey * u - py;
            if (qx * qx + qy * qy <= a * a) { best = { s, B, k, px, py }; break; }
          }
        }
      }
      const len = best ? best.s : TP.range;
      t.shot = { step: world.steps, x0, y0, x1: x0 + ux * len, y1: y0 + uy * len, hit: best ? best.B.species : null, kin: !!best && best.B.species === A.species, tether: true };
      A.lastShot = t.shot;
      if (!best) { t.t = TP.reload; continue; }
      const [bx, by] = toLocal(best.B, best.k, best.px, best.py);
      const link = { tether: true, a: A.index, b: best.B.index, padA: t, pieceB: best.k, bx, by, holds: TP.hold, len: Math.max(len, 0.5), load: 0, since: world.steps };
      t.link = link; world.links.push(link);
      A.lastTie = { what: best.B.species, why: 'tied', step: world.steps, kin: best.B.species === A.species };
      best.B.tiedBy = { species: A.species, step: world.steps };
    }
  }

  // the alarm: kin near a cell being drained read how near (PARAMS.alarm), fading once the attack stops
  const fade = 1 - PARAMS.time.dt / PARAMS.alarm.fade;
  for (const c of cells) c.alarm = (c.alarm || 0) * fade;
  for (const l of world.links) {
    if (!l.feed) continue;
    const V = cells[l.b];
    if (!V || V.dead) continue;
    for (const c of cells) {
      if (c === V || c.dead || c.species !== V.species) continue;
      const d = Math.hypot(c.q[0] - V.q[0], c.q[1] - V.q[1]) - c.pieces[0].a - V.pieces[0].a - (c.pieces[0].L + V.pieces[0].L) / 2;
      const a = 1 - Math.max(d, 0) / PARAMS.alarm.range;
      if (a > c.alarm) c.alarm = a;
    }
  }

  // mouths: swallow another species' cell touching one whole, if it fits the gape (metab.js digests it; death.js removes it)
  const E = PARAMS.engulf;
  for (const A of cells) {
    if (A.dead || A.meal || !A.mouths || !A.mouths.length) continue;
    // room for the meal (author: "won't the predator need a lot of space to swallow"): its free cytoplasm
    const free = A.pieces[0].volume - A.pieces[0].inclusions.reduce((t, x) => t + x.v, 0);
    for (const mo of A.mouths) {
      if (!mo.go || A.meal) continue;
      const [mx, my] = padWorld(A, mo);
      for (const B of cells) {
        if (B === A || B.eatenBy || B.species === A.species || B.pieces[0].a > E.gape * A.pieces[0].a || B.pieces[0].volume > free) continue;
        const dx = A.q[0] - B.q[0], dy = A.q[1] - B.q[1], r = A.reach + B.reach + E.reach;   // (a mouth is no piece: it adds no reach)
        if (dx * dx + dy * dy > r * r || !surfaceNear(B, mx, my, E.reach, 0) || mouthSize(B) > E.gape * A.pieces[0].a) continue;
        // a chain counts as one (author, 2026-11-02): to swallow a joined cell the mouth takes its whole chain, which must
        // fit across the predator (its extent at most the predator's width), in its free room, and every cell the gape
        const chain = chainOf(world, B);
        let vol = 0, ext = 0;
        for (const c of chain) {
          vol += c.pieces[0].volume;
          for (const o of chain) ext = Math.max(ext, Math.hypot(c.q[0] - o.q[0], c.q[1] - o.q[1]) + c.pieces[0].a + o.pieces[0].a + (c.pieces[0].L + o.pieces[0].L) / 2);
        }
        if (chain.size > 1 && (vol > free || ext > 2 * A.pieces[0].a || [...chain].some((c) => mouthSize(c) > E.gape * A.pieces[0].a))) continue;
        let energy = 0, N = 0;
        for (const c of chain) {
          energy += c.metab ? c.metab.E : 0;
          for (const s of c.pieces[0].inclusions) if (s.store) energy += s.fill * s.v * PARAMS.metab[s.store].energy;
          N += c.grow ? c.grow.Nbody + c.grow.N : 0;
          c.eatenBy = A.species; c.dead = true; c.diedAt = world.steps; c.diedWhy = `eaten whole by a ${A.species}`;
          (world.eatenOf ||= {})[c.species] = (world.eatenOf[c.species] || 0) + 1;   // (the missions' judge counts them)
        }
        A.meal = { prey: B.species, n: chain.size, energy, N, t: 0, r: Math.cbrt(3 * vol / (4 * Math.PI)) };
        A.lastSwallow = { prey: B.species, n: chain.size, step: world.steps };
        break;
      }
    }
  }

  // free kin pads gently pull free kin pads of their species within PARAMS.pads.attract (kin find each other)
  for (let a = 0; a < cells.length; a++) {
    const A = cells[a];
    if (A.dead) continue;
    for (let b = a + 1; b < cells.length; b++) {
      const B = cells[b];
      if (B.dead || B.species !== A.species) continue;
      const dx = A.q[0] - B.q[0], dy = A.q[1] - B.q[1], r = A.reach + B.reach + PAD.attract;
      if (dx * dx + dy * dy > r * r) continue;
      for (const pa of A.pads) {
        if (pa.link || pa.kind !== 'kin' || pa.go === false) continue;
        const [ax, ay] = padWorld(A, pa);
        for (const pb of B.pads) {
          if (pb.link || pb.kind !== 'kin' || pb.go === false) continue;
          const [bx, by] = padWorld(B, pb), d = Math.hypot(ax - bx, ay - by);
          if (d > PAD.attract || d < 1e-6) continue;
          const k = PAD.pull / d;   // a pull of PAD.pull pN toward the other pad
          const [lax, lay] = toLocal(A, pa.piece, ax, ay), [lbx, lby] = toLocal(B, pb.piece, bx, by);
          A.ext.push({ type: 'pull', piece: pa.piece, x: lax, y: lay, tx: bx, ty: by, k });
          B.ext.push({ type: 'pull', piece: pb.piece, x: lbx, y: lby, tx: ax, ty: ay, k });
        }
      }
    }
  }

  // free pads that touch something stick
  let size = groups(world);
  for (const A of cells) {
    for (const pad of A.pads) {
      if (pad.link || pad.go === false) continue;
      const [x, y] = padWorld(A, pad);
      for (const B of cells) {
        if (B === A || pad.link) continue;
        const dx = A.q[0] - B.q[0], dy = A.q[1] - B.q[1], r = A.reach + B.reach;
        if (dx * dx + dy * dy > r * r) continue;
        const joined = A.group === B.group;
        if (!joined && (size.get(A.group) + size.get(B.group) > PAD.maxChain
          || pad.kind === 'kin' && A.kinGroup !== B.kinGroup
             && size.vol.get(A.kinGroup) + size.vol.get(B.kinGroup) > PAD.chainVolume)) continue;   // a full chain takes no more
        let link = null;
        if (pad.kind === 'kin') {
          if (B.species !== A.species) continue;
          for (const other of B.pads) {
            if (other.link || other.kind !== 'kin' || other.go === false) continue;
            const [ox, oy] = padWorld(B, other);
            if (Math.hypot(x - ox, y - oy) <= pad.r + other.r) {
              link = { a: A.index, b: B.index, padA: pad, padB: other, holds: PAD.kinBreak };
              other.link = link;
              break;
            }
          }
        } else {
          const hit = surfaceNear(B, x, y, pad.r);
          if (hit) link = { a: A.index, b: B.index, padA: pad, pieceB: hit[0], bx: hit[1], by: hit[2], holds: PAD.mucusBreak };
        }
        if (link) { pad.link = link; world.links.push(link); size = groups(world); }
      }
    }
  }
}
