// Overdamped motion: no momentum, so each step we solve "drag balances every force and torque" for the
// velocities of the unknowns (the body's slide and turn, joint angles), then step positions.
// Each piece's drag is resistive force theory about its centre. Contacts are stiff springs treated implicitly
// (their stiffness × dt joins the drag matrix), so they stay stable at any stiffness.
import { PARAMS } from './params.js';
import { dsin, dcos } from './dmath.js';

const DT = PARAMS.time.dt;
const KC = PARAMS.contact.stiffness;
const TW = PARAMS.tank.w, TH = PARAMS.tank.h;

// Scratch: velocity of one point per unit rate of each of a piece's columns
const MAXC = 64;
const UX = new Float64Array(MAXC), UY = new Float64Array(MAXC);

export function updatePose(cell) {
  const { pieces, q, phi, cs, sn, cx, cy, jx, jy } = cell;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    let a, px, py;
    if (p.parent < 0) { a = q[2]; px = q[0]; py = q[1]; }
    else {
      const k = p.parent;
      px = cx[k] + cs[k] * p.ax - sn[k] * p.ay;
      py = cy[k] + sn[k] * p.ax + cs[k] * p.ay;
      a = phi[k] + p.mount + (p.joint >= 0 ? q[3 + p.joint] : 0);
    }
    const c = dcos(a), s = dsin(a);
    phi[i] = a; cs[i] = c; sn[i] = s; jx[i] = px; jy[i] = py;
    cx[i] = px + c * p.offset; cy[i] = py + s * p.offset;
  }
}

// World position of a point given in piece i's own frame
export function toWorld(cell, i, x, y) {
  const c = cell.cs[i], s = cell.sn[i];
  return [cell.cx[i] + c * x - s * y, cell.cy[i] + s * x + c * y];
}

function fillCols(cell, cols, px, py) {
  for (let k = 0; k < cols.length; k++) {
    const c = cols[k];
    if (c === 0) { UX[k] = 1; UY[k] = 0; }
    else if (c === 1) { UX[k] = 0; UY[k] = 1; }
    else {
      const o = c === 2 ? 0 : cell.jointPiece[c - 3];   // turning about the body centre, or about a joint
      UX[k] = -(py - cell.jy[o]); UY[k] = px - cell.jx[o];
    }
  }
}

// A stiff contact pushing point (px, py) of a piece along (nx, ny) by depth pen
function contact(cell, cols, px, py, nx, ny, pen) {
  const { A, f, n } = cell;
  fillCols(cell, cols, px, py);
  const m = cols.length;
  for (let k = 0; k < m; k++) {
    const gk = UX[k] * nx + UY[k] * ny;
    if (gk === 0) continue;
    f[cols[k]] += gk * KC * pen;
    for (let l = 0; l < m; l++) A[cols[k] * n + cols[l]] += DT * KC * gk * (UX[l] * nx + UY[l] * ny);
  }
}

function walls(cell, cols, ex, ey, a) {
  if (ey - a < 0) contact(cell, cols, ex, ey - a, 0, 1, a - ey);
  if (ey + a > TH) contact(cell, cols, ex, ey + a, 0, -1, ey + a - TH);
  if (ex - a < 0) contact(cell, cols, ex - a, ey, 1, 0, a - ex);
  if (ex + a > TW) contact(cell, cols, ex + a, ey, -1, 0, ex + a - TW);
}

function assemble(cell) {
  const { pieces, A, f, n, cs, sn, cx, cy } = cell;
  A.fill(0); f.fill(0);
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i], cols = p.cols, m = cols.length;
    const c = cs[i], s = sn[i];

    // drag about the centre
    const rxx = p.xt * c * c + p.xn * s * s, rxy = (p.xt - p.xn) * c * s, ryy = p.xt * s * s + p.xn * c * c;
    fillCols(cell, cols, cx[i], cy[i]);
    for (let k = 0; k < m; k++) {
      const ax = rxx * UX[k] + rxy * UY[k], ay = rxy * UX[k] + ryy * UY[k];
      const turnk = cols[k] >= 2;
      const row = cols[k] * n;
      for (let l = 0; l < m; l++) {
        A[row + cols[l]] += UX[l] * ax + UY[l] * ay + (turnk && cols[l] >= 2 ? p.xr : 0);
      }
    }

    // weight minus buoyancy, at each weight point (light and heavy points apart make a turning couple)
    for (const wp of p.wpts) {
      const wx = cx[i] + c * wp.x - s * wp.y, wy = cy[i] + s * wp.x + c * wp.y;
      fillCols(cell, cols, wx, wy);
      for (let k = 0; k < m; k++) f[cols[k]] -= UY[k] * wp.w;
    }

    // walls and floor: the capsule's deepest point against a flat wall is one of its two ends
    const h = p.L / 2;
    walls(cell, cols, cx[i] + c * h, cy[i] + s * h, p.a);
    if (h > 0) walls(cell, cols, cx[i] - c * h, cy[i] - s * h, p.a);
  }
}

// Symmetric positive definite: plain Gaussian elimination, + - * / only
function solve(A, b, n, x) {
  for (let k = 0; k < n; k++) {
    const piv = A[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const r = A[i * n + k] / piv;
      if (r === 0) continue;
      for (let j = k; j < n; j++) A[i * n + j] -= r * A[k * n + j];
      b[i] -= r * b[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
    x[i] = s / A[i * n + i];
  }
}

export function stepCell(cell) {
  updatePose(cell);
  assemble(cell);
  solve(cell.A, cell.f, cell.n, cell.v);
  const { q, v, n } = cell;
  for (let i = 0; i < n; i++) q[i] += DT * v[i];
}
