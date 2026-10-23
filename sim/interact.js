// Cells meeting cells, found once a step and handed to each cell as cell.ext (physics.js applies them):
// - contact: pieces of different cells push apart where their capsules overlap;
// - pads: a kin pad sticks to a kin pad of the same species, a mucus pad to any surface of another cell;
//   a stuck pad is a spring that snaps when pulled harder than its pad holds;
// - groups: cells joined by pads. No chain rule: chains come from pads meeting. A hidden backstop
//   (PARAMS.pads.maxChain) only blocks a new link that would make a group bigger than that.
import { PARAMS } from './params.js';

const KCC = PARAMS.contact.cells;
const PAD = PARAMS.pads;

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
function surfaceNear(cell, x, y, reach) {
  let best = null;
  for (let i = 0; i < cell.pieces.length; i++) {
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

// Groups of cells joined by pads (union-find over the links); sets cell.group and returns sizes by group
function groups(world) {
  const parent = world.cells.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (const l of world.links) { const a = find(l.a), b = find(l.b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
  const size = new Map();
  world.cells.forEach((c, i) => { c.group = find(i); size.set(c.group, (size.get(c.group) || 0) + 1); });
  return size;
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
    const force = PAD.stiffness * Math.hypot(ax - bx, ay - by);
    if (force > l.holds) { l.padA.link = null; if (l.padB) l.padB.link = null; continue; }
    kept.push(l);
    const [lax, lay] = toLocal(A, l.padA.piece, ax, ay);
    A.ext.push({ type: 'pull', piece: l.padA.piece, x: lax, y: lay, tx: bx, ty: by, k: PAD.stiffness });
    const pb = l.padB ? l.padB.piece : l.pieceB;
    const [lbx, lby] = toLocal(B, pb, bx, by);
    B.ext.push({ type: 'pull', piece: pb, x: lbx, y: lby, tx: ax, ty: ay, k: PAD.stiffness });
  }
  world.links = kept;

  // free pads that touch something stick
  let size = groups(world);
  for (const A of cells) {
    for (const pad of A.pads) {
      if (pad.link) continue;
      const [x, y] = padWorld(A, pad);
      for (const B of cells) {
        if (B === A || pad.link) continue;
        const dx = A.q[0] - B.q[0], dy = A.q[1] - B.q[1], r = A.reach + B.reach;
        if (dx * dx + dy * dy > r * r) continue;
        const joined = A.group === B.group;
        if (!joined && size.get(A.group) + size.get(B.group) > PAD.maxChain) continue;
        let link = null;
        if (pad.kind === 'kin') {
          if (B.species !== A.species) continue;
          for (const other of B.pads) {
            if (other.link || other.kind !== 'kin') continue;
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
