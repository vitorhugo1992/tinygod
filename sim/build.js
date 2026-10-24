// A design (plain JSON a player builds) becomes a cell: rigid pieces with drag and weight, joined in a tree.
//
// Design format:
// {
//   name,
//   body:  { radius, length = 0, wall = 'protein' },      // a capsule: cylinder `length` µm long, `radius` µm
//   parts: [
//     { type: 'segment', id?, parent = 'body', at: [x, y], angle, length, radius, material, joint? },
//     { type: 'inclusion', parent = 'body', at: [x, y], radius, material, density?, fill? },
//     { type: 'pad', parent = 'body', at: [x, y], radius = 1, kind = 'kin' | 'mucus' },
//     { type: 'sensor', id, parent = 'body', at: [x, y], angle, kind = 'light' | 'touch' | 'near', range?, cone?,
//       feels = 'strangers' | 'anything' },
//   ]
// }
// `at` is a point in the parent's own frame (x along its axis, from its centre). A segment grows from that point
// in direction `angle` (degrees, relative to the parent's axis). An inclusion is a sphere inside the body; a sap
// inclusion can be pumped toward a target density (inclusion.target), at a cost. Oil and starch inclusions are energy
// stores: `radius` is how big they can get, `fill` (0-1, default 1) how full they are; with metabolism on they fill
// and empty (metab.js) and their weight follows. A plastid inclusion makes energy from light. On an extending segment, children's
// `at` is measured from its tip. A pad is a sticky patch (see interact.js): kin pads hold kin pads of the same
// species, mucus pads hold any surface. Inclusions may not overlap: the room inside a cell is limited.
// Sensors read 0..1 (sense.js): a light sensor (an eyespot) faces `angle` (degrees, relative to its parent's axis;
// default: straight out from where it sits) and sees within a cone `cone` degrees wide (default 180): it reads the
// light there × how squarely it faces up, scaled to its cone (a narrow eyespot is precise, a wide one vague); a touch sensor
// reads 1 while another species touches its spot; a proximity sensor reads how close another species is within
// `range` µm (1 touching, 0 at the range); a nutrient sensor (kind 'chem') reads the nutrients where it is (0 poor,
// 1 rich). A timer (kind 'timer', placed inside) counts from the moment its `trigger` (a list of conditions, like a
// joint's controls) last came true: it reads 0 then, rising to 1 after `span` s (default one sandbox day), and 1
// before it ever started. A statolith is an inclusion (material 'statolith') that is also a sensor: it reads 1
// while its direction `angle` (degrees from the body's axis, default 0: the front) points straight up, 0 down.
// Gas vesicles are an inclusion (material 'gas') with a `strength` (0-1, default 0.5): stronger ones lift less but
// survive deeper (PARAMS.gas); below their depth they are crushed for good.
// Any joint can be wired to sensors: controls: [{ sensor: id, min = 0, max = 1 }, ...] (sensor 'energy': the cell's own
// energy level, built into every cell: 0 empty, 1 full; one control: { ... } is the same as a list of one). A
// condition holds while the reading is between min and max (with not: true, while it is outside them). Conditions
// are ANDed; or: true starts another group, and the part goes when every condition of any one group holds: a motor
// runs while they do; a latched hinge or extender is released the first time they do.
// ({ when: 'light' } means min 0.5, { when: 'dark' } max 0.5.)
// A segment's joint, at `at`:
//   { type: 'fixed' }                                    (default) rigid
//   { type: 'hinge', stiffness = 0, rest = 0, latched = false }  springy (pN·µm/rad; rest angle in degrees, starts
//       at 0). Latched, it is held at its angle until released (a trigger: a cocked spring waits).
//   { type: 'motor', rate, swing, stroke = 0.5, phase = 0, on = true, burst? }
//       beats `rate` times a second, `swing` degrees each side; the forward stroke takes `stroke` of the cycle
//       and the recovery the rest. Off, it holds its angle.
//       burst: { duration, recharge } makes it a burst organ: it waits charged, and when fired (by hand, or by its
//       control) beats for `duration` s, then stops and needs `recharge` s before it can fire again. Motors of one
//       organ that share a `group` fire together.
//   { type: 'extend', stiffness, rest = length, start = 0, latched = false }
//       the segment slides out of the parent along its own axis (a ribbon unrolling, a stalk pushing out): its
//       exposed length is the unknown, from 0 to `length`, pushed toward `rest` by a spring (pN/µm). Latched,
//       it waits at `start` until released.
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

function parseJoint(j, pieceIndex) {
  if (!j || j.type === 'fixed') return null;
  if (j.type === 'hinge') {
    return { type: 'hinge', piece: pieceIndex, stiffness: j.stiffness || 0, rest: (j.rest || 0) * DEG,
      latched: !!j.latched };
  }
  if (j.type === 'extend') {
    return { type: 'extend', piece: pieceIndex, stiffness: j.stiffness || 0, rest: j.rest, start: j.start || 0,
      latched: !!j.latched };
  }
  if (j.type === 'motor') {
    const stroke = j.stroke === undefined ? 0.5 : j.stroke;
    if (!(stroke > 0 && stroke < 1)) throw new Error('motor stroke must be between 0 and 1');
    // clock: how long it has beaten; it stops while the motor is off, so the beat resumes where it froze
    return { type: 'motor', piece: pieceIndex, rate: j.rate, swing: (j.swing || 0) * DEG, stroke,
      phase: j.phase || 0, on: j.on !== false && !j.burst, clock: 0,
      burst: j.burst ? { duration: j.burst.duration, recharge: j.burst.recharge, group: j.burst.group, state: 'charged', t: 0 } : null };
  }
  throw new Error(`unknown joint type: ${j.type}`);
}

// A joint's wiring as the design writes it -> as the cell uses it (the sensor by index, the range)
function resolveControl(sensors, c) {
  const s = c.sensor === 'energy' ? -1 : sensors.findIndex((x) => x.id === c.sensor);   // -1: the built-in energy level
  if (s < 0 && c.sensor !== 'energy') throw new Error(`no sensor called ${c.sensor}`);
  let min = c.min ?? 0, max = c.max ?? 1;
  if (c.when === 'light') min = PARAMS.sensor.threshold;
  else if (c.when === 'dark') max = PARAMS.sensor.threshold;
  else if (c.when !== undefined) throw new Error('control.when must be light or dark');
  if (!(min <= max)) throw new Error('control: min must not be above max');
  return { sensor: s, min, max, not: !!c.not, or: !!c.or, holds: null };
}

// A design joint's wiring as a list (`controls`, or the older single `control`)
export const controlsOf = (j) => (j.controls ? j.controls : j.control ? [j.control] : []);

// Rewire a living cell's joints that came from design part `partIndex` (an empty list: unwire), without rebuilding it
export function rewire(cell, partIndex, controls) {
  for (const j of cell.joints) {
    if (j.part !== partIndex) continue;
    if (controls.length) j.controls = controls.map((c) => resolveControl(cell.sensors, c));
    else { delete j.controls; if (j.type === 'motor' && !j.burst) j.on = true; }
  }
}

// Set the trigger of a living cell's timer that came from design part `partIndex`, without rebuilding it
export function retrigger(cell, partIndex, trigger) {
  for (const s of cell.sensors) {
    if (s.part !== partIndex || s.kind !== 'timer') continue;
    s.trigger = trigger.filter((c) => c.sensor !== s.id).map((c) => resolveControl(cell.sensors, c));
  }
}

export function buildCell(design) {
  const pieces = [];
  const joints = [];
  const pads = [];
  const sensors = [];
  const controls = [];   // [joint, control] pairs, resolved once every sensor is known
  const triggers = [];   // [timer, trigger] pairs, the same
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
      const joint = parseJoint(part.joint, pieces.length);
      if (joint) joints.push(joint);
      if (joint) joint.part = design.parts.indexOf(part);   // which design part it came from (for live rewiring)
      if (joint && controlsOf(part.joint).length) controls.push([joint, controlsOf(part.joint)]);
      const piece = {
        kind: 'segment', parent, ax: x, ay: y, mount: (part.angle || 0) * DEG, offset: L / 2,
        joint: joint ? joints.length - 1 : -1,
        L, a, material: mat, volume: v,
        ...capsuleDrag(L, a),
        wpts: [{ x: 0, y: 0, w: weight(material(mat).density, v) }],
      };
      if (joint && joint.type === 'extend') {
        // its exposed length changes: keep the drag per unit length (from the full length) and rebuild from it
        if (joint.rest === undefined) joint.rest = L;
        joint.start = Math.min(Math.max(joint.start, 0), L);
        const e = Math.max(dlog(L / a), PARAMS.drag.minLogAspect);
        piece.ext = { max: L, s: 6 * PI * MU * a, r: 8 * PI * MU * a * a * a,
          cn: 4 * PI * MU / (e + 0.5), ct: 2 * PI * MU / (e - 0.5) };
      }
      piece.part = design.parts.indexOf(part);
      pieces.push(piece);
      if (part.id) ids.set(part.id, pieces.length - 1);
    } else if (part.type === 'inclusion') {
      const host = pieces[parent];
      if (host.kind !== 'body') throw new Error('inclusions go inside the body');
      const r = part.radius, mat = material(part.material);
      const fill = mat.store ? Math.min(Math.max(part.fill ?? 1, 0), 1) : 1;
      const strength = Math.min(Math.max(part.strength ?? 0.5, 0), 1);
      const rho = part.density !== undefined ? part.density
        : mat.gas ? PARAMS.gas.weak + (PARAMS.gas.strong - PARAMS.gas.weak) * strength : mat.density;
      if (mat.min !== undefined && (rho < mat.min || rho > mat.max)) throw new Error(`${part.material} density out of range`);
      // inside the wall: distance from the body's axis plus own radius
      const dx = Math.max(Math.abs(x) - host.L / 2, 0);
      if (Math.sqrt(dx * dx + y * y) + r > host.a - C.wallThickness + 1e-9) throw new Error('inclusion sticks out of the body');
      for (const o of host.inclusions) {
        if (Math.hypot(o.x - x, o.y - y) < o.r + r - 1e-9) throw new Error('inclusions overlap: there is no room for both there');
      }
      const v = (4 / 3) * PI * r * r * r;
      inclusionVol += v;
      // it replaces cytoplasm, so only the difference counts
      const wpt = { x, y, w: (rho - C.cytoplasm) * v * fill * G };
      host.wpts.push(wpt);
      // v: its full volume (the room it takes); a store holds v × fill of its stuff, the rest is cytoplasm
      host.inclusions.push({ x, y, r, v, wpt, material: part.material, density: rho, target: rho,
        pumpable: mat.min !== undefined, min: mat.min, max: mat.max, store: mat.store, fill,
        part: design.parts.indexOf(part) });
      if (mat.gas) {   // crushed below this depth (µm from the surface)
        const S = PARAMS.gas;
        Object.assign(host.inclusions[host.inclusions.length - 1],
          { crush: PARAMS.tank.h * (S.shallowest + (1 - S.shallowest) * strength), crushed: false });
      }
      if (part.material === 'statolith') sensors.push({ id: part.id, piece: parent, x, y, kind: 'statolith',
        facing: (part.angle || 0) * DEG, r, value: 0.5, part: design.parts.indexOf(part) });
    } else if (part.type === 'sensor') {
      const kind = part.kind || 'light';
      if (!['light', 'touch', 'near', 'hunger', 'chem', 'timer'].includes(kind)) throw new Error(`unknown sensor kind: ${kind}`);
      const facing = part.angle !== undefined ? part.angle * DEG : Math.atan2(y, x);
      const range = part.range || (kind === 'near' ? PARAMS.sensor.nearRange : PARAMS.sensor.touchRange);
      const cone = Math.min(Math.max(part.cone || 180, 10), 180) * DEG;
      const s = { id: part.id, piece: parent, x, y, facing, kind, range, cone, feels: part.feels || 'strangers', value: 0,
        part: design.parts.indexOf(part) };
      if (kind === 'timer') {
        Object.assign(s, { span: part.span || PARAMS.sensor.timerSpan, start: null, was: false, value: 1, trigger: [] });
        if ((part.trigger || []).length) triggers.push([s, part.trigger]);
      }
      sensors.push(s);
    } else if (part.type === 'pad') {
      const kind = part.kind || 'kin';
      if (kind !== 'kin' && kind !== 'mucus') throw new Error(`unknown pad kind: ${kind}`);
      pads.push({ piece: parent, x, y, r: part.radius || 1, kind, link: null });
    } else {
      throw new Error(`unknown part type: ${part.type}`);
    }
  }
  if (inclusionVol > C.maxInclusionFraction * vol) throw new Error('inclusions overfill the body');

  // Unknowns: the body's slide (x, y) and turn, then one angle per joint.
  // Each piece's columns: the unknowns that move it (its parent's, plus its own joint). Parents come first.
  for (const p of pieces) {
    const base = p.parent < 0 ? [0, 1, 2] : Array.from(pieces[p.parent].cols);
    if (p.joint >= 0) base.push(3 + p.joint);
    p.cols = Int32Array.from(base);
  }

  for (const [joint, cs] of controls) joint.controls = cs.map((c) => resolveControl(sensors, c));
  for (const [s, cs] of triggers) s.trigger = cs.filter((c) => c.sensor !== s.id).map((c) => resolveControl(sensors, c));

  // how far the cell can reach from its body centre, for finding neighbours
  const reachOf = [];
  pieces.forEach((p, i) => {
    const len = p.ext ? p.ext.max : p.L;
    reachOf[i] = p.parent < 0 ? len / 2 + p.a : reachOf[p.parent] + Math.hypot(p.ax, p.ay) + len + p.a;
  });
  const reach = Math.max(...reachOf) + Math.max(0, ...pads.map((pd) => pd.r));

  // which unknowns turn things (the body's turn and hinges/motors) and which slide them (x, y, extenders)
  const n = 3 + joints.length;
  const colTurn = new Uint8Array(n);
  colTurn[2] = 1;
  joints.forEach((j, i) => { colTurn[3 + i] = j.type === 'extend' ? 0 : 1; });

  const np = pieces.length;
  return {
    design, pieces, joints, pads, sensors, n, colTurn, reach,
    species: design.species || design.name || 'A',
    ext: [],                 // this step's contacts and pad pulls from other cells (interact.js)
    jointPiece: Int32Array.from(joints.map((j) => j.piece)),
    q: new Float64Array(n), v: new Float64Array(n),
    A: new Float64Array(n * n), f: new Float64Array(n),
    A0: new Float64Array(n * n), f0: new Float64Array(n),
    energy: { motor: 0, pump: 0 },   // aJ (pN·µm) spent by motors and by pumping vacuoles
    power: 0,                // aJ/s (fW) at the last step
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
