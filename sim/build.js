// A design (plain JSON a player builds) becomes a cell: rigid pieces with drag and weight, joined in a tree.
//
// Design format:
// {
//   name,
//   body:  { radius, length = 0, wall = 'protein' },      // a capsule: cylinder `length` µm long, `radius` µm
//   parts: [
//     { type: 'segment', id?, parent = 'body', at: [x, y], angle, length, radius, material },
//     { type: 'inclusion', parent = 'body', at: [x, y], radius, material, density? },
//   ]
// }
// `at` is a point in the parent's own frame (x along its axis, from its centre). A segment grows from that point
// in direction `angle` (degrees, relative to the parent's axis). An inclusion is a sphere inside the body.
import { PARAMS } from './params.js';
import { material } from './materials.js';
import { DEG, dlog } from './dmath.js';

const PI = Math.PI;
const MU = PARAMS.water.viscosity;
const G = PARAMS.gravity * 1e-6;  // pN per (kg/m³ × µm³)

// Buoyant weight in pN (positive sinks)
const weight = (rho, vol) => (rho - PARAMS.water.density) * vol * G;
const capsuleVolume = (L, a) => PI * a * a * L + (4 / 3) * PI * a * a * a;
const capsuleArea = (L, a) => 2 * PI * a * L + 4 * PI * a * a;

// Drag of a capsule about its centre, in its own frame: along the axis (xt), across it (xn), turning (xr).
// A sphere's exact Stokes drag plus resistive force theory for the straight part (a thin rod drags about twice as
// hard broadside as end-on). Exact for a sphere, an approximation for everything longer.
function capsuleDrag(L, a) {
  const s = 6 * PI * MU * a;
  let xt = s, xn = s, xr = 8 * PI * MU * a * a * a;
  if (L > 0) {
    const e = Math.max(dlog(L / a), PARAMS.drag.minLogAspect);
    const cn = 4 * PI * MU / (e + 0.5), ct = 2 * PI * MU / (e - 0.5);
    xt += ct * L; xn += cn * L; xr += cn * L * L * L / 12;
  }
  return { xt, xn, xr };
}

export function buildCell(design) {
  const pieces = [];
  const ids = new Map();
  const C = PARAMS.cell;

  // The body: cytoplasm inside a wall
  const b = design.body;
  const bL = b.length || 0, bA = b.radius;
  const vol = capsuleVolume(bL, bA);
  const wallVol = Math.min(capsuleArea(bL, bA) * C.wallThickness, vol);
  const wallMat = b.wall || 'protein';
  pieces.push({
    kind: 'body', parent: -1, ax: 0, ay: 0, mount: 0, offset: 0, joint: -1,
    L: bL, a: bA, material: wallMat, volume: vol,
    ...capsuleDrag(bL, bA),
    wpts: [{ x: 0, y: 0, w: weight(C.cytoplasm, vol - wallVol) + weight(material(wallMat).density, wallVol) }],
    inclusions: [],
  });
  ids.set('body', 0);
  let inclusionVol = 0;

  for (const part of design.parts || []) {
    const parent = ids.get(part.parent || 'body');
    if (parent === undefined) throw new Error(`unknown parent: ${part.parent}`);
    const [x, y] = part.at || [0, 0];
    if (part.type === 'segment') {
      const L = part.length, a = part.radius, mat = part.material || 'protein';
      const v = capsuleVolume(L, a);
      pieces.push({
        kind: 'segment', parent, ax: x, ay: y, mount: (part.angle || 0) * DEG, offset: L / 2, joint: -1,
        L, a, material: mat, volume: v,
        ...capsuleDrag(L, a),
        wpts: [{ x: 0, y: 0, w: weight(material(mat).density, v) }],
      });
      if (part.id) ids.set(part.id, pieces.length - 1);
    } else if (part.type === 'inclusion') {
      const host = pieces[parent];
      if (host.kind !== 'body') throw new Error('inclusions go inside the body');
      const r = part.radius, mat = material(part.material);
      const rho = part.density !== undefined ? part.density : mat.density;
      if (mat.min !== undefined && (rho < mat.min || rho > mat.max)) throw new Error(`${part.material} density out of range`);
      // inside the wall: distance from the body's axis plus own radius
      const dx = Math.max(Math.abs(x) - host.L / 2, 0);
      if (Math.sqrt(dx * dx + y * y) + r > host.a - C.wallThickness + 1e-9) throw new Error('inclusion sticks out of the body');
      const v = (4 / 3) * PI * r * r * r;
      inclusionVol += v;
      // it replaces cytoplasm, so only the difference counts
      host.wpts.push({ x, y, w: (rho - C.cytoplasm) * v * G });
      host.inclusions.push({ x, y, r, material: part.material, density: rho });
    } else {
      throw new Error(`unknown part type: ${part.type}`);
    }
  }
  if (inclusionVol > C.maxInclusionFraction * vol) throw new Error('inclusions overfill the body');

  // Unknowns: the body's slide (x, y) and turn, then one angle per joint (none until joints exist).
  // Each piece's columns: the unknowns that move it.
  for (const p of pieces) p.cols = Int32Array.from([0, 1, 2]);

  const n = 3;
  const np = pieces.length;
  return {
    design, pieces, n,
    jointPiece: new Int32Array(0),
    q: new Float64Array(n), v: new Float64Array(n),
    A: new Float64Array(n * n), f: new Float64Array(n),
    phi: new Float64Array(np), cs: new Float64Array(np), sn: new Float64Array(np),
    cx: new Float64Array(np), cy: new Float64Array(np), jx: new Float64Array(np), jy: new Float64Array(np),
  };
}

// Total buoyant weight (pN) and volume, for reports and checks
export function cellWeight(cell) {
  let w = 0;
  for (const p of cell.pieces) for (const wp of p.wpts) w += wp.w;
  return w;
}
