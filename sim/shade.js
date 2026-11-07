// Self-shading (author, 2026-11-07: "plastids only"; strength Claude's recommendation): the pigment in plastids catches
// light, so a crowd of cells darkens the water below it. Once a second every plastid in the tank is laid on a grid of
// PARAMS.shading.cell µm squares (its volume spread across the columns its outline covers, in the square of its centre);
// light at a spot is the clear water's light × e^(−k × the plastid above it in its column, per µm of width), half of its
// own square counted. A cell is never shaded by its own plastids (they are already counted in what it earns), so a cell
// alone gets exactly the clear water's light. Columns are blended between their middles, so the shadow is soft sideways.
import { PARAMS } from './params.js';
import { dexp } from './dmath.js';

const S = PARAMS.shading, TW = PARAMS.tank.w, TH = PARAMS.tank.h, D = S.cell;
export const NX = Math.ceil(TW / D), NY = Math.ceil(TH / D);

// Each plastid's place on the grid: { j (its square's row), i0 (first column), w (its optical depth per column) }
function layPlastid(cell, inc) {
  const c = cell.cs[0], s = cell.sn[0], X = cell.cx[0], Y = cell.cy[0];
  let lo = Infinity, hi = -Infinity;
  for (const [px, py] of inc.outline) { const wx = X + c * px - s * py; if (wx < lo) lo = wx; if (wx > hi) hi = wx; }
  const y = Y + s * inc.x + c * inc.y;
  let j = Math.floor(y / D); j = j < 0 ? 0 : j >= NY ? NY - 1 : j;
  if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
  const per = S.k * inc.v * (inc.stolen && inc.stolen.v ? inc.stolen.v / inc.v : 1) / (hi - lo);   // optical depth per µm of width, over its width
  let i0 = Math.floor(lo / D), i1 = Math.floor(hi / D);
  i0 = i0 < 0 ? 0 : i0 >= NX ? NX - 1 : i0; i1 = i1 < 0 ? 0 : i1 >= NX ? NX - 1 : i1;
  const w = new Float64Array(i1 - i0 + 1);
  for (let i = i0; i <= i1; i++) {   // the share of its width in this column, as optical depth over the column's width
    const a = Math.max(lo, i * D), b = Math.min(hi, (i + 1) * D);
    if (b > a) w[i - i0] = per * (b - a) / D;
  }
  return { j, i0, w };
}

// Every S.every steps: lay every plastid on the grid, then sum each column from the top down (above[j][i]: the optical
// depth above the middle of square (i, j), half of the square itself)
export function stepShade(world) {
  if (world.steps % S.every && world.shade) return;
  const sq = new Float64Array(NX * NY);
  for (const cell of world.cells) {
    const lay = [];
    for (const inc of cell.pieces[0].inclusions) if (inc.material === 'plastid') {
      const p = layPlastid(cell, inc);
      lay.push(p);
      for (let k = 0; k < p.w.length; k++) sq[p.j * NX + p.i0 + k] += p.w[k];
    }
    cell.shadeLay = lay;
  }
  const above = world.shade ? world.shade.above : new Float64Array(NX * NY);
  for (let i = 0; i < NX; i++) {
    let sum = 0;
    for (let j = NY - 1; j >= 0; j--) { const q = sq[j * NX + i]; above[j * NX + i] = sum + q / 2; sum += q; }
  }
  world.shade = { above, sq };
}

// Its own plastids' optical depth above row j in column i (to take back out: a cell doesn't shade itself)
function ownAbove(cell, i, j) {
  let od = 0;
  for (const p of cell.shadeLay || []) {
    if (p.j < j || i < p.i0 || i >= p.i0 + p.w.length) continue;
    od += p.j > j ? p.w[i - p.i0] : p.w[i - p.i0] / 2;
  }
  return od;
}

// The share of the clear water's light reaching (x, y), 0-1; `cell` (optional) is the one asking (its own plastids don't count)
export function shadeAt(world, x, y, cell) {
  const sh = world.shade;
  if (!sh) return 1;
  let j = Math.floor(y / D); j = j < 0 ? 0 : j >= NY ? NY - 1 : j;
  let gx = x / D - 0.5; gx = gx < 0 ? 0 : gx > NX - 1 ? NX - 1 : gx;
  const i = Math.floor(gx), i1 = i < NX - 1 ? i + 1 : i, a = gx - i;
  let od = sh.above[j * NX + i] * (1 - a) + sh.above[j * NX + i1] * a;
  if (cell && cell.shadeLay && cell.shadeLay.length) od -= ownAbove(cell, i, j) * (1 - a) + ownAbove(cell, i1, j) * a;
  return od > 1e-9 ? dexp(-od) : 1;
}
