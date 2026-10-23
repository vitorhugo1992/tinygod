// Overdamped motion: no momentum, so each step we solve "drag balances every force and torque" for the
// velocities of the unknowns (the body's slide and turn, joint angles), then step positions.
// Each piece's drag is resistive force theory about its centre. Contacts and joint springs are treated
// implicitly (their stiffness × dt joins the drag matrix), so they stay stable at any stiffness.
// Motors drive their joint's angle exactly (prescribed), and pay for the torque that takes.
import { PARAMS } from './params.js';
import { dsin, dcos } from './dmath.js';

const DT = PARAMS.time.dt;
const KC = PARAMS.contact.stiffness;
const TW = PARAMS.tank.w, TH = PARAMS.tank.h;

// Step length used for the implicit spring and contact terms (the current sub-step)
let IMP = DT;

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
    for (let l = 0; l < m; l++) A[cols[k] * n + cols[l]] += IMP * KC * gk * (UX[l] * nx + UY[l] * ny);
  }
}

function walls(cell, cols, ex, ey, a) {
  if (ey - a < 0) contact(cell, cols, ex, ey - a, 0, 1, a - ey);
  if (ey + a > TH) contact(cell, cols, ex, ey + a, 0, -1, ey + a - TH);
  if (ex - a < 0) contact(cell, cols, ex - a, ey, 1, 0, a - ex);
  if (ex + a > TW) contact(cell, cols, ex + a, ey, -1, 0, ex + a - TW);
}

// A motor's angle at time t: forward stroke from -swing to +swing in `stroke` of the cycle, recovery in the rest,
// both eased (cosine) so the joint starts and stops smoothly
export function motorAngle(j, t) {
  let u = j.rate * t + j.phase;
  u -= Math.floor(u);
  const w = u < j.stroke ? -dcos(Math.PI * u / j.stroke) : dcos(Math.PI * (u - j.stroke) / (1 - j.stroke));
  return j.swing * w;
}

function assemble(cell, gravity) {
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
    if (gravity) for (const wp of p.wpts) {
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

// Velocities of every unknown at the cell's current pose; motors go from their angle in `from` to their angle
// at tEnd in time h.
// Returns the motors' power (only positive work costs).
function velocities(cell, from, tEnd, h, gravity) {
  updatePose(cell);
  assemble(cell, gravity);
  const { q, v, n, A, f, A0, f0, joints } = cell;

  // springy joints pull toward their rest angle
  for (let j = 0; j < joints.length; j++) {
    const jt = joints[j];
    if (jt.type !== 'hinge' || jt.stiffness === 0) continue;
    const p = 3 + j;
    f[p] -= jt.stiffness * (q[p] - jt.rest);
    A[p * n + p] += IMP * jt.stiffness;
  }

  // motors and latches: the joint's rate is known; move it to the right-hand side (keeps the system symmetric)
  A0.set(A); f0.set(f);
  for (let j = 0; j < joints.length; j++) {
    const jt = joints[j];
    if (jt.type !== 'motor' && !jt.latched) continue;
    const p = 3 + j;
    const r = jt.type === 'motor' && jt.on ? (motorAngle(jt, tEnd) - from[p]) / h : 0;
    for (let i = 0; i < n; i++) {
      if (i === p) continue;
      f[i] -= A[i * n + p] * r;
      A[i * n + p] = 0; A[p * n + i] = 0;
    }
    A[p * n + p] = 1; f[p] = r;
  }

  solve(A, f, n, v);

  // what the motors paid: torque they had to supply × their rate (only positive work costs)
  let power = 0;
  for (let j = 0; j < joints.length; j++) {
    if (joints[j].type !== 'motor') continue;
    const p = 3 + j;
    let tau = -f0[p];
    for (let l = 0; l < n; l++) tau += A0[p * n + l] * v[l];
    const pw = tau * v[p];
    if (pw > 0) power += pw;
  }
  return power;
}

// Stiff springs relax fast; their sub-step must be a small share of that time or the error grows with
// stiffness × step (measured: a stiff spring's hop came out 14% too long at 1 ms). Fixed once per design, from
// its build pose, so it stays deterministic.
export function planSubsteps(cell) {
  updatePose(cell);
  IMP = DT;
  assemble(cell, false);
  // relaxation time: the joint's drag with everything else free to move (1 / (A⁻¹)pp), over its stiffness
  const { n } = cell, A = new Float64Array(n * n), b = new Float64Array(n), x = new Float64Array(n);
  let fastest = Infinity;
  cell.joints.forEach((jt, j) => {
    if (jt.type !== 'hinge' || jt.stiffness === 0) return;
    const p = 3 + j;
    A.set(cell.A); b.fill(0); b[p] = 1;
    solve(A, b, n, x);
    fastest = Math.min(fastest, 1 / x[p] / jt.stiffness);
  });
  cell.sub = Math.min(Math.max(Math.ceil(PARAMS.time.subPerRelax * DT / fastest), 1), PARAMS.time.maxSub);
}

// Step one cell from time t to t + dt in cell.sub sub-steps, each by the midpoint method: velocities at the start
// take it halfway, the velocities there take the whole sub-step. Its error falls with dt² (simple Euler's falls
// with dt and leaked a steady drift into strokes that should go nowhere).
export function stepCell(cell, t, gravity = true) {
  const { q, v, n } = cell;
  const q0 = cell.q0 || (cell.q0 = new Float64Array(n));
  const sub = cell.sub || 1, h = DT / sub;
  IMP = h;
  let energy = 0;
  for (let k = 0; k < sub; k++) {
    const ts = t + k * h;
    q0.set(q);
    velocities(cell, q0, ts + h / 2, h / 2, gravity);
    for (let i = 0; i < n; i++) q[i] = q0[i] + h / 2 * v[i];
    // from the midpoint, motors aim for their angle at the end of the sub-step, measured from its start
    const power = velocities(cell, q0, ts + h, h, gravity);
    for (let i = 0; i < n; i++) q[i] = q0[i] + h * v[i];
    energy += power * h;
  }
  cell.power = energy / DT;
  cell.energy.motor += energy;
}
