// Overdamped motion: no momentum, so each step we solve "drag balances every force and torque" for the
// velocities of the unknowns (the body's slide and turn, joint angles), then step positions.
// Each piece's drag is resistive force theory about its centre. Contacts and joint springs are treated
// implicitly (their stiffness × dt joins the drag matrix), so they stay stable at any stiffness.
// Motors drive their joint's angle exactly (prescribed), and pay for the torque that takes.
// Other cells act through cell.ext (contacts and pad pulls, found once a step by interact.js): their points are
// held where they were at the start of the step, and each side takes the stiffness implicitly at twice the step,
// so two cells pushing on each other never overshoot.
import { PARAMS } from './params.js';
import { dsin, dcos } from './dmath.js';

const DT = PARAMS.time.dt;
const KC = PARAMS.contact.stiffness;
const PUMP_RATE = PARAMS.chamber.rate, CYTO = PARAMS.cell.cytoplasm;
const G = PARAMS.gravity * 1e-6;
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
      const ax = p.ax + (pieces[k].ext ? pieces[k].offset : 0);   // on an extending part, measured from its tip
      px = cx[k] + cs[k] * ax - sn[k] * p.ay;
      py = cy[k] + sn[k] * ax + cs[k] * p.ay;
      a = phi[k] + p.mount + (p.joint >= 0 && !p.ext ? q[3 + p.joint] : 0);
    }
    if (p.ext) {               // exposed length is the joint's unknown; drag grows with it
      const e = q[3 + p.joint], x = p.ext;
      p.L = e; p.offset = e / 2;
      p.xt = x.s + x.ct * e; p.xn = x.s + x.cn * e; p.xr = x.r + x.cn * e * e * e / 12;
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
    else if (cell.colTurn[c]) {
      const o = c === 2 ? 0 : cell.jointPiece[c - 3];   // turning about the body centre, or about a joint
      UX[k] = -(py - cell.jy[o]); UY[k] = px - cell.jx[o];
    } else {
      const o = cell.jointPiece[c - 3];                  // sliding out along an extending part's axis
      UX[k] = cell.cs[o]; UY[k] = cell.sn[o];
    }
  }
}

// A spring of stiffness kc pushing point (px, py) of a piece along (nx, ny) by `pen` (negative pulls), with its
// stiffness × imp taken implicitly
function contact(cell, cols, px, py, nx, ny, pen, kc = KC, imp = IMP) {
  const { A, f, n } = cell;
  fillCols(cell, cols, px, py);
  const m = cols.length;
  for (let k = 0; k < m; k++) {
    const gk = UX[k] * nx + UY[k] * ny;
    if (gk === 0) continue;
    f[cols[k]] += gk * kc * pen;
    for (let l = 0; l < m; l++) A[cols[k] * n + cols[l]] += imp * kc * gk * (UX[l] * nx + UY[l] * ny);
  }
}

// Contacts and pad pulls from other cells (interact.js)
function outside(cell) {
  const { pieces, cs, sn, cx, cy } = cell;
  for (const e of cell.ext) {
    const i = e.piece, c = cs[i], s = sn[i];
    const px = cx[i] + c * e.x - s * e.y, py = cy[i] + s * e.x + c * e.y;
    const cols = pieces[i].cols;
    if (e.type === 'push') {                 // pushed out along n until it clears (tx, ty)
      const pen = e.nx * (e.tx - px) + e.ny * (e.ty - py);
      if (pen > 0) contact(cell, cols, px, py, e.nx, e.ny, pen, e.k, 2 * IMP);
    } else {                                 // pulled toward (tx, ty) by a zero-length spring
      contact(cell, cols, px, py, 1, 0, e.tx - px, e.k, 2 * IMP);
      contact(cell, cols, px, py, 0, 1, e.ty - py, e.k, 2 * IMP);
    }
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
      const turnk = cell.colTurn[cols[k]];
      const row = cols[k] * n;
      for (let l = 0; l < m; l++) {
        A[row + cols[l]] += UX[l] * ax + UY[l] * ay + (turnk && cell.colTurn[cols[l]] ? p.xr : 0);
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
  if (cell.ext.length) outside(cell);
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

// Velocities of every unknown at the cell's current pose; running motors go from their angle in `from` to their
// angle `ahead` seconds further on their clock, in time h.
// Returns the motors' power (only positive work costs).
function velocities(cell, from, ahead, h, gravity) {
  updatePose(cell);
  assemble(cell, gravity);
  const { q, v, n, A, f, A0, f0, joints } = cell;

  // springy joints pull toward their rest angle (hinges) or rest length (extenders)
  for (let j = 0; j < joints.length; j++) {
    const jt = joints[j];
    if (jt.type === 'motor' || jt.stiffness === 0) continue;
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
    const r = jt.type === 'motor' && jt.on ? (motorAngle(jt, jt.clock + ahead * jt.gain) - from[p]) / h : 0;
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
  // extenders measured half out, where their drag is typical
  const saved = Float64Array.from(cell.q);
  cell.joints.forEach((jt, j) => { if (jt.type === 'extend') cell.q[3 + j] = cell.pieces[jt.piece].ext.max / 2; });
  const ext = cell.ext; cell.ext = [];
  updatePose(cell);
  IMP = DT;
  assemble(cell, false);
  cell.ext = ext;
  // relaxation time: the joint's drag with everything else free to move (1 / (A⁻¹)pp), over its stiffness
  const { n } = cell, A = new Float64Array(n * n), b = new Float64Array(n), x = new Float64Array(n);
  let fastest = Infinity;
  cell.joints.forEach((jt, j) => {
    if (jt.type === 'motor' || jt.stiffness === 0) return;
    const p = 3 + j;
    A.set(cell.A); b.fill(0); b[p] = 1;
    solve(A, b, n, x);
    fastest = Math.min(fastest, 1 / x[p] / jt.stiffness);
  });
  cell.sub = Math.min(Math.max(Math.ceil(PARAMS.time.subPerRelax * DT / fastest), 1), PARAMS.time.maxSub);
  cell.q.set(saved);
  updatePose(cell);
}

// Burst organs: charged -> firing (beating) for its duration -> recharging -> charged
export function fire(cell, group) {
  let any = false;
  for (const jt of cell.joints) {
    if (!jt.burst || jt.burst.state !== 'charged' || (group !== undefined && jt.burst.group !== group)) continue;
    jt.burst.state = 'firing'; jt.burst.t = 0; jt.on = true; any = true;
  }
  return any;
}
function burst(cell) {
  for (const jt of cell.joints) {
    const b = jt.burst;
    if (!b || b.state === 'charged') continue;
    b.t += DT;
    if (b.state === 'firing' && b.t >= b.duration) { b.state = 'recharging'; b.t = 0; jt.on = false; }
    else if (b.state === 'recharging' && b.t >= b.recharge) { b.state = 'charged'; b.t = 0; }
  }
}

// Buoyancy chambers pump toward their target density at a limited rate (holding it away from seawater's costs energy:
// metab.js)
function pump(cell) {
  for (const inc of cell.pieces[0].inclusions) {
    if (!inc.pumpable || inc.target === inc.density) continue;
    const d = inc.target - inc.density, step = PUMP_RATE * DT;
    const change = d > step ? step : d < -step ? -step : d;
    inc.density += change;
    inc.wpt.w = (inc.density - CYTO) * inc.v * G;
  }
}

// Step one cell from time t to t + dt in cell.sub sub-steps, each by the midpoint method: velocities at the start
// take it halfway, the velocities there take the whole sub-step. Its error falls with dt² (simple Euler's falls
// with dt and leaked a steady drift into strokes that should go nowhere).
export function stepCell(cell, t, gravity = true) {
  const { q, v, n } = cell;
  const q0 = cell.q0 || (cell.q0 = new Float64Array(n));
  burst(cell);
  // sub-steps: the design's (stiff springs), more while a fast motor runs
  let sub = cell.sub || 1;
  for (const jt of cell.joints) if (jt.type === 'motor' && jt.on) sub = Math.max(sub, Math.ceil(jt.rate * PARAMS.time.stepsPerBeat * DT));
  if (sub > PARAMS.time.maxSub) sub = PARAMS.time.maxSub;
  const h = DT / sub;
  pump(cell);
  IMP = h;
  let energy = 0;
  for (let k = 0; k < sub; k++) {
    q0.set(q);
    velocities(cell, q0, h / 2, h / 2, gravity);
    for (let i = 0; i < n; i++) q[i] = q0[i] + h / 2 * v[i];
    // from the midpoint, motors aim for their angle at the end of the sub-step, measured from its start
    const power = velocities(cell, q0, h, h, gravity);
    for (let i = 0; i < n; i++) q[i] = q0[i] + h * v[i];
    energy += power * h;
    for (const jt of cell.joints) if (jt.type === 'motor' && jt.on) jt.clock += h * jt.gain;
  }
  cell.power = energy / DT;
  cell.energy.motor += energy;
  // extenders can't go back into the cell past nothing, nor out past their length
  for (let j = 0; j < cell.joints.length; j++) {
    if (cell.joints[j].type !== 'extend') continue;
    const p = 3 + j, max = cell.pieces[cell.joints[j].piece].ext.max;
    if (q[p] < 0) q[p] = 0; else if (q[p] > max) q[p] = max;
  }
}
