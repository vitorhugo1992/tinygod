// An organelle's shape is its outline (soft blobs, CLAUDE.md 2026-10-29): a closed polygon (counter-clockwise) in the
// body's frame. Room, overlap and inside-the-wall are tested on it; its weight and the light it gets are taken at its
// centroid. Its volume: a round one's, a rod's or a band's exact capsule (so designs from before the outlines weigh and
// hold what they did); any other outline, the rod with its area and thickness (blobVolume).
//
// A design inclusion gets its outline from:
//   outline: [[x, y], ...]   its own points, around `at`, in its own frame (x along `angle`), or else
//   radius, length, angle, bend: the round / rod / band shapes from before, built as the offset of their middle line
//     (straight, or an arc of PARAMS.shape.arcPieces pieces) by `radius`, with caps of PARAMS.shape.points / 2 corners.
import { PARAMS } from './params.js';
import { DEG, dcos, dsin } from './dmath.js';

const N = PARAMS.shape.points, STEP = 2 * Math.PI / N, INSCRIBED = dcos(Math.PI / N);

// Its middle line's points: two ends if straight; along an arc if bent (k: curvature, toward the left of its
// direction), `n` pieces, midpoint at (x, y), tangent (ux, uy) there
export function arcPoints(x, y, ux, uy, L, k, n = 8) {
  if (!k) return [[x - ux * L / 2, y - uy * L / 2], [x + ux * L / 2, y + uy * L / 2]];
  const nx = -uy, ny = ux, out = [];
  for (let i = 0; i <= n; i++) {
    const s = -L / 2 + L * i / n, a = k * s, along = dsin(a) / k, side = (1 - dcos(a)) / k;
    out.push([x + ux * along + nx * side, y + uy * along + ny * side]);
  }
  return out;
}

// The outline round a middle line `mid` (at least two points; both the same: round), `a` thick each side: a cap of N/2
// corners at each end, mitred corners along the sides. Its edges all sit `a`·cos(π/N) from the middle line.
export function offsetOutline(mid, a, ux = 1, uy = 0) {
  const m = mid.length - 1, e = a * INSCRIBED, out = [];
  const dir = (i) => {   // piece i's direction (a round one: the given one)
    const dx = mid[i + 1][0] - mid[i][0], dy = mid[i + 1][1] - mid[i][1], l = Math.sqrt(dx * dx + dy * dy);
    return l > 1e-12 ? [dx / l, dy / l] : [ux, uy];
  };
  const cap = ([px, py], [vx, vy]) => {   // round the end at p, facing v: from its right side, through v, to its left
    for (let j = 0; j < N / 2; j++) {
      const t = -Math.PI / 2 + (j + 0.5) * STEP, c = dcos(t), s = dsin(t);
      out.push([px + a * (vx * c - vy * s), py + a * (vy * c + vx * s)]);
    }
  };
  const side = (i, sgn) => {   // a mitred corner at middle point i, on the left (sgn 1) or the right (-1)
    const [ax, ay] = dir(i - 1), [bx, by] = dir(i);
    let nx = -ay - by, ny = ax + bx;
    const l = Math.sqrt(nx * nx + ny * ny); nx /= l; ny /= l;
    const d = e / (nx * -by + ny * bx);   // the bisector's length to the edges' offset lines
    out.push([mid[i][0] + sgn * nx * d, mid[i][1] + sgn * ny * d]);
  };
  const last = dir(m - 1), first = dir(0);
  cap(mid[m], last);
  for (let i = m - 1; i >= 1; i--) side(i, 1);
  cap(mid[0], [-first[0], -first[1]]);
  for (let i = 1; i <= m - 1; i++) side(i, -1);
  return out;
}

// A design inclusion's outline in the body's frame, and its middle line (for drawing)
export function outlineOf(part) {
  const [x, y] = part.at || [0, 0];
  const rigid = part.material === 'statolith';   // stays round: its angle is the way it reads
  const ang = rigid ? 0 : (part.angle || 0) * DEG, ux = dcos(ang), uy = dsin(ang);
  if (!rigid && Array.isArray(part.outline) && part.outline.length >= 3) {
    return { outline: part.outline.map(([px, py]) => [x + ux * px - uy * py, y + uy * px + ux * py]), mid: [[x, y]] };
  }
  const L = rigid ? 0 : Math.max(part.length || 0, 0), k = rigid ? 0 : part.bend || 0;
  const mid = arcPoints(x, y, ux, uy, L, k, PARAMS.shape.arcPieces);
  return { outline: offsetOutline(mid, part.radius, ux, uy), mid };
}

// Area and centroid of an outline
export function measure(P) {
  const n = P.length;
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n], cr = x0 * y1 - x1 * y0;
    A += cr; cx += (x0 + x1) * cr; cy += (y0 + y1) * cr;
  }
  return { area: Math.abs(A / 2), cx: cx / (3 * A), cy: cy / (3 * A) };
}

// The widest circle inside an outline: its radius (a coarse search, then each of the best spots climbed uphill)
export function inscribed(P) {
  const [x0, y0, x1, y1] = box(P), G = 16, hx = (x1 - x0) / G, hy = (y1 - y0) / G;
  const depth = (x, y) => -polyDist(P, x, y);
  const spots = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = x0 + (i + 0.5) * hx, y = y0 + (j + 0.5) * hy, d = depth(x, y);
    if (d > 0) spots.push([d, x, y]);
  }
  spots.sort((a, b) => b[0] - a[0]);
  let best = spots.length ? spots[0][0] : 0;
  for (const [d0, sx, sy] of spots.slice(0, 4)) {
    let d = d0, x = sx, y = sy, step = Math.max(hx, hy);
    while (step > 1e-6 * (x1 - x0 + y1 - y0)) {
      let moved = false;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]]) {
        const e = depth(x + ax * step, y + ay * step);
        if (e > d) { d = e; x += ax * step; y += ay * step; moved = true; break; }
      }
      if (!moved) step /= 2;
    }
    if (d > best) best = d;
  }
  return best;
}

// The volume of an outline (µm³): the rod as thick as its widest inside circle with the same area. (An organelle is
// taken to be as deep, front to back, as it is thick, so a bump that adds area adds volume.) Its corners sit on the
// curve, so the polygon's own thickness and area are those of a round one with N corners; put back to the curve.
const CORNERS = N * dsin(Math.PI / N) / dcos(Math.PI / N);   // a round one's area is CORNERS × (its inside radius)²
const cache = new Map();
export function blobVolume(P) {
  const key = P.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ');
  let out = cache.get(key);
  if (out) return out;
  const w = inscribed(P), { area } = measure(P);
  const l = w > 0 ? Math.max((area - CORNERS * w * w) / (2 * w), 0) : 0, r = w / INSCRIBED;
  out = { thick: r, length: l, volume: Math.PI * r * r * l + 4 / 3 * Math.PI * r * r * r };
  if (cache.size > 500) cache.clear();
  cache.set(key, out);
  return out;
}

// A design inclusion's shape: { outline, mid, volume, thick, cx, cy } (round, rods and bands: their exact capsule)
export function shapeOf(part) {
  const { outline, mid } = outlineOf(part), m = measure(outline);
  const own = part.material !== 'statolith' && Array.isArray(part.outline) && part.outline.length >= 3;
  if (own) {   // its volume from its own points (in its own frame, so moving or turning it changes nothing)
    const b = blobVolume(part.outline);
    return { outline, mid, volume: b.volume, thick: b.thick, cx: m.cx, cy: m.cy };
  }
  const r = part.radius, L = part.material === 'statolith' ? 0 : Math.max(part.length || 0, 0);
  return { outline, mid, volume: Math.PI * r * r * L + 4 / 3 * Math.PI * r * r * r, thick: r, cx: m.cx, cy: m.cy };
}
export const volumeOf = (part) => shapeOf(part).volume;

// Is (x, y) inside the polygon?
export function insidePoly(P, x, y) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Distance from (x, y) to the polygon's edge: negative inside
export function polyDist(P, x, y) {
  let best = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], ex = P[i][0] - ax, ey = P[i][1] - ay, l2 = ex * ex + ey * ey;
    let t = l2 > 0 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - ax - ex * t, dy = y - ay - ey * t, d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return insidePoly(P, x, y) ? -Math.sqrt(best) : Math.sqrt(best);
}
const box = (P) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
// Do two outlines overlap? (edges crossing, or one inside the other; only touching is not overlapping)
export function polysOverlap(P, Q) {
  const [a0, b0, a1, b1] = P.box || (P.box = box(P)), [c0, d0, c1, d1] = Q.box || (Q.box = box(Q));
  if (a1 <= c0 || c1 <= a0 || b1 <= d0 || d1 <= b0) return false;
  const side = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i];
    if (Math.max(ax, bx) <= c0 || Math.min(ax, bx) >= c1 || Math.max(ay, by) <= d0 || Math.min(ay, by) >= d1) continue;
    for (let k = 0, l = Q.length - 1; k < Q.length; l = k++) {
      const [cx, cy] = Q[l], [dx, dy] = Q[k];
      const s1 = side(cx, cy, dx, dy, ax, ay), s2 = side(cx, cy, dx, dy, bx, by);
      if (!((s1 > 1e-12 && s2 < -1e-12) || (s1 < -1e-12 && s2 > 1e-12))) continue;
      const s3 = side(ax, ay, bx, by, cx, cy), s4 = side(ax, ay, bx, by, dx, dy);
      if ((s3 > 1e-12 && s4 < -1e-12) || (s3 < -1e-12 && s4 > 1e-12)) return true;
    }
  }
  // no edges cross: overlapping only if one lies inside the other (well inside, not just touching), or they coincide
  const within = (X, Y) => {
    for (const [x, y] of X) if (insidePoly(Y, x, y) && polyDist(Y, x, y) < -1e-9) return true;
    let mx = 0, my = 0;
    for (const [x, y] of X) { mx += x; my += y; }
    mx /= X.length; my /= X.length;
    return insidePoly(X, mx, my) && polyDist(Y, mx, my) < -1e-9;
  };
  return within(P, Q) || within(Q, P);
}
