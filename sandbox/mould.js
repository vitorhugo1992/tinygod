// Moulding organelles by hand (soft blobs, stage 2; CLAUDE.md 2026-10-29). Pure geometry on design parts, no DOM.
// An organelle the tools reshape keeps its own outline (part.outline: points round `at`, in its own frame, x along
// `angle`; sim/shape.js); one never touched stays round / a rod / a band. Points are in µm, body frame unless "own".
//   dragSpot: a spot of its edge follows the finger, its neighbours less the further along the edge they are
//   scaleBy:  bigger or smaller (a pinch), the same shape
//   moveTo:   somewhere else; pressed into the wall, the points that touch it flatten along it and the rest bulge (its
//             volume kept)
//   relax:    Squish to fit: overlapping ones are pushed apart, then dent each other where they still touch (each one's
//             volume kept); ones out of the wall ease back in or flatten against it
import { PARAMS } from '../sim/params.js';
import { outlineOf, measure, blobVolume, volumeOf, polysOverlap, nearestOn, insidePoly } from '../sim/shape.js';

export const rigid = (p) => p.material === 'statolith';   // its shape is its function: it stays round
export const isInc = (p) => p.type === 'inclusion';
const round2 = (v) => Math.round(v * 100) / 100;
const rot = (p) => { const a = (p.angle || 0) * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };

// Its outline in the body's frame, and in its own
export const bodyPoints = (p) => outlineOf(p).outline;
export function ownPoints(p) {
  if (p.outline) return p.outline.map((q) => [...q]);
  const [c, s] = rot(p), [x, y] = p.at;
  return bodyPoints(p).map(([bx, by]) => [(bx - x) * c + (by - y) * s, -(bx - x) * s + (by - y) * c]);
}
// Store body-frame points Q as its own outline (evened out along its edge when `even`)
export function setBody(p, Q, even = false) {
  const [c, s] = rot(p), [x, y] = p.at;
  let own = Q.map(([bx, by]) => [(bx - x) * c + (by - y) * s, -(bx - x) * s + (by - y) * c]);
  if (even) own = resample(own);
  p.outline = own.map(([u, v]) => [round2(u), round2(v)]);
  delete p.length; delete p.bend;
  p.radius = round2(blobVolume(p.outline).thick);
}
// An organelle about to be reshaped: from round / rod / band to its own outline (evenly spaced points)
export function toOutline(p) {
  if (rigid(p) || p.outline) return;
  setBody(p, bodyPoints(p), true);
}

// Points evened out along the edge: as many as its edge needs (48 to 120), the same shape
export function resample(P) {
  const n = P.length, cum = [0];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const per = cum[n], thick = Math.max(blobVolume(P).thick, 0.3);
  const m = Math.max(PARAMS.shape.points, Math.min(120, Math.round(per / (0.6 * thick))));
  const out = [];
  for (let k = 0, i = 0; k < m; k++) {
    const t = per * k / m;
    while (cum[i + 1] < t) i++;
    const a = P[i], b = P[(i + 1) % n], f = (t - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
// Does the outline cross itself?
export function selfCrosses(P) {
  const n = P.length, side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;   // neighbours share a corner
    const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n];
    if (side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0) return true;
  }
  return false;
}

// The wall: how far in from it an organelle may reach, and the room's centre line for a point
export const roomOf = (body) => body.radius - PARAMS.cell.wallThickness - 0.05;
const wallCentre = (body, x) => { const h = (body.length || 0) / 2; return [Math.max(-h, Math.min(h, x)), 0]; };
// how far the outline sticks out of the wall (≤ 0: inside)
export function outOfWall(p, body) {
  let worst = -Infinity;
  for (const [x, y] of bodyPoints(p)) { const [cx, cy] = wallCentre(body, x); worst = Math.max(worst, Math.hypot(x - cx, y - cy) - roomOf(body)); }
  return worst;
}
// points past the wall put on it (a hair inside); marks the ones it moved in `pinned`
function clampToWall(Q, body, pinned) {
  const room = roomOf(body) - 0.02;
  Q.forEach((q, i) => {
    const [cx, cy] = wallCentre(body, q[0]), dx = q[0] - cx, dy = q[1] - cy, d = Math.hypot(dx, dy);
    if (d > room) { q[0] = cx + dx / d * room; q[1] = cy + dy / d * room; pinned[i] = true; }
  });
}
// Back to volume V: the points free to move (not pinned against the wall or a neighbour) swell or shrink from its
// centroid; whatever swells into the wall flattens on it too
function keepVolume(p, Q, V, body, pinned) {
  for (let it = 0; it < 12; it++) {
    setBody(p, Q);
    const v = volumeOf(p);
    if (Math.abs(v / V - 1) < 0.003) return;
    const { cx, cy } = measure(Q), f = Math.max(0.8, Math.min(1.25, (V / v) ** 0.4));
    let any = false;
    Q.forEach((q, i) => { if (!pinned[i]) { q[0] = cx + (q[0] - cx) * f; q[1] = cy + (q[1] - cy) * f; any = true; } });
    if (!any) return;
    clampToWall(Q, body, pinned);
  }
  setBody(p, Q);
}

// A spot of its edge (point i of its base outline B, own frame) follows the finger to body point F; neighbours follow
// less, the further along the edge (half its size away: about a third as far). Past the wall the edge flattens on it.
// Returns false (and leaves p alone) if the edge would cross itself.
export function dragSpot(p, B, i, F, body) {
  const [c, s] = rot(p), [x, y] = p.at, n = B.length;
  const bx = x + B[i][0] * c - B[i][1] * s, by = y + B[i][0] * s + B[i][1] * c;
  const dx = F[0] - bx, dy = F[1] - by, du = dx * c + dy * s, dv = -dx * s + dy * c;   // into its own frame
  const cum = [0];
  for (let k = 0; k < n; k++) cum.push(cum[k] + Math.hypot(B[(k + 1) % n][0] - B[k][0], B[(k + 1) % n][1] - B[k][1]));
  const per = cum[n], sigma = 0.5 * Math.sqrt(measure(B).area / Math.PI);
  const own = B.map(([u, v], k) => {
    let along = Math.abs(cum[k] - cum[i]); along = Math.min(along, per - along);
    const w = Math.exp(-((along / sigma) ** 2));
    return [u + du * w, v + dv * w];
  });
  if (selfCrosses(own)) return false;
  const Q = own.map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
  clampToWall(Q, body, []);
  if (selfCrosses(Q)) return false;
  setBody(p, Q);
  if (blobVolume(p.outline).thick < 0.4) return false;
  return true;
}
// Bigger or smaller (×f from its base outline B), the same shape; past the wall it flattens on it
export function scaleBy(p, B, f, body) {
  const { cx, cy } = measure(B), [c, s] = rot(p), [x, y] = p.at;
  const Q = B.map(([u, v]) => { const a = cx + (u - cx) * f, b = cy + (v - cy) * f; return [x + a * c - b * s, y + a * s + b * c]; });
  clampToWall(Q, body, []);
  setBody(p, Q);
}
// Moved so its `at` is `want` (from its base part B, as it was when the finger came down). Pressed into the wall, the
// points that touch it flatten along it and the rest bulge (volume kept); it can't be pushed in past ~half its thickness.
export function moveTo(p, B, want, body) {
  p.at = [round2(want[0]), round2(want[1])];
  if (rigid(p)) return outOfWall(p, body) <= 0;
  if (B.outline) p.outline = B.outline.map((q) => [...q]); else { delete p.outline; for (const k of ['radius', 'length', 'bend']) if (B[k] !== undefined) p[k] = B[k]; else delete p[k]; }
  if (outOfWall(p, body) <= 0) return true;
  // how far in it may go: its middle at least ~half its thickness from the wall
  const thick = p.outline ? blobVolume(p.outline).thick : p.radius, [cx, cy] = wallCentre(body, want[0]);
  const d = Math.hypot(want[0] - cx, want[1] - cy), lim = roomOf(body) - 0.5 * thick;
  if (d > lim) p.at = [round2(cx + (want[0] - cx) / d * lim), round2(cy + (want[1] - cy) / d * lim)];
  const V = volumeOf(B), Q = bodyPoints(p), pinned = [];
  clampToWall(Q, body, pinned);
  keepVolume(p, Q, V, body, pinned);
  return true;
}
// Everything sticking out of a (smaller) wall flattens against it, its volume kept
export function fitWall(d) {
  for (const p of d.parts) if (isInc(p) && !rigid(p) && outOfWall(p, d.body) > 0) {
    const V = volumeOf(p), Q = bodyPoints(p), pinned = [];
    clampToWall(Q, d.body, pinned);
    keepVolume(p, Q, V, d.body, pinned);
  }
}

// Soft packing (Squish to fit): overlapping organelles are pushed apart a little each pass; after a few passes the
// points of one inside another are pushed onto the other's edge (they dent each other where they touch), and each
// swells elsewhere to keep its volume. One out of the wall is eased back in, then flattened against it. `fixed` (the
// one in hand) and the rigid statolith keep their shape and place. Whatever still overlaps is left (drawn red).
export function relax(d, fixed = -1, iters = 60, budget = 1000) {   // budget: ms at most (a tap shouldn't hang)
  const t0 = performance.now();
  const idx = d.parts.map((p, i) => i).filter((i) => isInc(d.parts[i]));
  const V = new Map(idx.map((i) => [i, volumeOf(d.parts[i])]));
  const still = (i) => i === fixed || rigid(d.parts[i]);
  for (let it = 0; it < iters; it++) {
    let busy = false;
    const pts = new Map(idx.map((i) => [i, bodyPoints(d.parts[i])]));
    const pinned = new Map(idx.map((i) => [i, []])), touched = new Set();
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
      const i = idx[a], j = idx[b], P = pts.get(i), Q = pts.get(j);
      if (!polysOverlap(P, Q)) continue;
      const pm = still(i) ? 0 : 1, qm = still(j) ? 0 : 1;
      if (!pm && !qm) continue;
      busy = true;
      // which way apart (right on top of each other: some way), and how far they are in each other
      const cp = measure(P), cq = measure(Q);
      let nx = cq.cx - cp.cx, ny = cq.cy - cp.cy;
      if (Math.hypot(nx, ny) < 1e-3) { const t = 2.4 * (a + 2 * b); nx = Math.cos(t); ny = Math.sin(t); }
      const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
      let pMax = -Infinity, qMin = Infinity;
      for (const [x, y] of P) pMax = Math.max(pMax, x * nx + y * ny);
      for (const [x, y] of Q) qMin = Math.min(qMin, x * nx + y * ny);
      let depth = 0;   // how deep their corners are in each other; none (one right inside the other): their overlap that way
      for (const [x, y] of P) if (insidePoly(Q, x, y)) depth = Math.max(depth, -nearestOn(Q, x, y)[2]);
      for (const [x, y] of Q) if (insidePoly(P, x, y)) depth = Math.max(depth, -nearestOn(P, x, y)[2]);
      if (depth < 0.05) depth = Math.max(pMax - qMin, 0);
      if (it < 6 || depth > 1.5) {   // apart, shared by those that can move
        const step = 0.5 * (depth + 0.03) / (pm + qm);
        if (pm) { const p = d.parts[i]; p.at = [p.at[0] - nx * step, p.at[1] - ny * step]; }
        if (qm) { const q = d.parts[j]; q.at = [q.at[0] + nx * step, q.at[1] + ny * step]; }
        continue;
      }
      // dent: each one's points inside the other go onto the other's edge (half way each, if both can give)
      const dent = (X, Y, pin, share) => X.forEach((q, k) => {
        if (!insidePoly(Y, q[0], q[1])) return;
        const [ex, ey] = nearestOn(Y, q[0], q[1]);
        q[0] += (ex - q[0]) * share; q[1] += (ey - q[1]) * share; pin[k] = true;
      });
      // and where the other's corners poke into it between its own corners, that edge of it is pushed out of the way
      const poke = (X, Y, pin, share) => Y.forEach(([yx, yy]) => {
        if (!insidePoly(X, yx, yy)) return;
        const [ex, ey, , k] = nearestOn(X, yx, yy), mx = (yx - ex) * share, my = (yy - ey) * share;
        for (const c of [k, (k + X.length - 1) % X.length]) { X[c][0] += mx; X[c][1] += my; pin[c] = true; }
      });
      const P2 = P.map((q) => [...q]), Q2 = Q.map((q) => [...q]);
      if (pm) poke(P2, Q, pinned.get(i), qm ? 0.6 : 1.1);
      if (qm) poke(Q2, P, pinned.get(j), pm ? 0.6 : 1.1);
      if (pm) { dent(P2, Q, pinned.get(i), qm ? 0.6 : 1.05); pts.set(i, P2); touched.add(i); }
      if (qm) { dent(Q2, P, pinned.get(j), pm ? 0.6 : 1.05); pts.set(j, Q2); touched.add(j); }
    }
    for (const i of idx) {
      const p = d.parts[i];
      if (still(i)) continue;
      if (touched.has(i)) { toOutline(p); setBody(p, pts.get(i)); }
      if (outOfWall(p, d.body) <= 1e-3 && !touched.has(i)) continue;
      busy = true;
      const out = outOfWall(p, d.body);
      if (out > 1e-3 && it < 4) {   // eased back in
        const [cx, cy] = wallCentre(d.body, p.at[0]), dx = p.at[0] - cx, dy = p.at[1] - cy, n = Math.hypot(dx, dy) || 1;
        p.at = [p.at[0] - dx / n * (out + 0.03), p.at[1] - dy / n * (out + 0.03)];
        continue;
      }
      toOutline(p);
      const Q = bodyPoints(p), pin = pinned.get(i);
      clampToWall(Q, d.body, pin);
      keepVolume(p, Q, V.get(i), d.body, pin);
    }
    if (!busy || performance.now() - t0 > budget) break;
  }
  for (const i of idx) {   // its points evened out again, unless that makes it overlap or stick out
    const p = d.parts[i];
    if (!p.outline || still(i)) continue;
    const keep = JSON.stringify(p);
    setBody(p, bodyPoints(p), true);
    const P = bodyPoints(p);
    if (outOfWall(p, d.body) > 0 || idx.some((j) => j !== i && polysOverlap(P, bodyPoints(d.parts[j])))) Object.assign(p, JSON.parse(keep));
  }
}
