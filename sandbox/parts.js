// Part templates for the sandbox's Build panel: each returns design parts placed at an angle round the body,
// pointing outward (or, for inclusions, inside toward that angle). `size` (0.1-1) sets an inclusion's radius
// (share of the room inside the wall), a spine's or ejectisome's length, a proximity sensor's range. The root part
// carries a `label`.
import { slotsOf } from '../sim/brain.js';

// Where a ray from the body centre at angle `deg` leaves the body (a capsule along x): [x, y]
export function surfacePoint(body, deg) {
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const h = (body.length || 0) / 2, a = body.radius, ac = Math.abs(c), as = Math.abs(s);
  let r;
  if (as > 1e-9 && a * ac / as <= h) r = a / as;                   // through the straight side
  else r = h * ac + Math.sqrt(h * h * c * c - h * h + a * a);       // through a rounded end
  return [r * c, r * s];
}

// An inclusion inside the wall, as thick as `size` of the room, toward `deg`: `depth` 0 at the centre, 1 against the
// wall. With `len` > 0 it is a rod (that much straight part) turned `turn` degrees from the body's axis; it sits as far
// out as its reach in that direction allows.
// An inclusion's radius at `size` of the room inside the wall
export function insideRadius(body, size) {
  const room = body.radius - 0.35;                          // inside the wall (0.3 µm) with a little play
  const L = body.length || 0, a = body.radius;
  const most = Math.cbrt(0.85 * (Math.PI * a * a * L + 4 / 3 * Math.PI * a ** 3) * 3 / (4 * Math.PI));  // ≤ 85% of the body
  return Math.floor(Math.min(room, most) * size * 10) / 10;
}
function inside(body, deg, size, depth = 1, len = 0, turn = 0) {
  const room = body.radius - 0.35;
  const r = insideRadius(body, size);
  const [x, y] = surfacePoint(body, deg), d = Math.hypot(x, y);
  const reach = r + (len / 2) * Math.abs(Math.cos((turn - deg) * Math.PI / 180));   // how far it sticks out toward deg
  const k = Math.max(0, d - body.radius + room - reach) / d * depth;   // how far from the centre it can sit, × depth
  const shape = len > 0 ? { length: len, ...(turn ? { angle: turn } : {}) } : {};
  return { at: [Math.round(x * k * 100) / 100, Math.round(y * k * 100) / 100], radius: r, ...shape };
}

const chain = (id, at, deg, n, length, joint) => Array.from({ length: n }, (_, i) => ({
  type: 'segment', id: `${id}_${i}`, parent: i ? `${id}_${i - 1}` : 'body', at: i ? [length / 2, 0] : at,
  angle: i ? 0 : deg, length, radius: 0.25, material: 'protein', joint: joint(i),
}));

// Each template: (body, where, id, size, tilt, depth, feels, len). `where` is the angle round the body; the part points
// straight out from there, turned by `tilt` degrees; an inclusion sits `depth` of the way from the centre to the wall;
// `len` (µm) is a flagellum's or spring's length (default as before; the panel's range is CONTROLS[...].length).
export const PART_TEMPLATES = {
  // more 8 µm pieces when longer; pull: the wave runs from the tip toward the body, so the tail pulls the cell after it
  // (like the hairy flagella of some flagellates) instead of pushing it
  'Wave tail (swims)': (body, deg, id, size, tilt, depth, feels, len = 48, strength, content, pull = false) => {
    const parts = chain(id, surfacePoint(body, deg), deg + tilt, Math.max(2, Math.round(len / 8)), 8,
      (i) => ({ type: 'motor', rate: 30, swing: 35, phase: (pull ? 1 : -1) * i * 0.15 + 0 }));
    parts[0].label = 'Wave tail';
    return parts;
  },
  'Flexible oar (swims)': (body, deg, id, size, tilt, depth, feels, len = 40) => [   // a driven blade 3/8 of it, the springy rest
    { type: 'segment', id: `${id}_0`, label: 'Flexible oar', at: surfacePoint(body, deg), angle: deg + tilt, length: len * 3 / 8, radius: 0.25,
      joint: { type: 'motor', rate: 20, swing: 60, stroke: 0.25 } },
    { type: 'segment', id: `${id}_1`, parent: `${id}_0`, at: [len * 3 / 16, 0], length: len * 5 / 8, radius: 0.25,
      joint: { type: 'hinge', stiffness: 700 } },
  ],
  'Stiff flap (goes nowhere)': (body, deg, id, size, tilt, depth, feels, len = 40) => [
    { type: 'segment', id, label: 'Stiff flap', at: surfacePoint(body, deg), angle: deg + tilt, length: len, radius: 0.25,
      joint: { type: 'motor', rate: 20, swing: 45, stroke: 0.25 } },
  ],
  'Spine, protein': (body, deg, id, size, tilt) => [
    { type: 'segment', id, label: 'Protein spine', at: surfacePoint(body, deg), angle: deg + tilt, length: Math.round(100 * size), radius: 0.5, material: 'protein' },
  ],
  'Spine, glass': (body, deg, id, size, tilt) => [
    { type: 'segment', id, label: 'Glass spine', at: surfacePoint(body, deg), angle: deg + tilt, length: Math.round(100 * size), radius: 0.5, material: 'glass' },
  ],
  // the Spring (author, 2026-10-28: was 'Burst organ'; the template keeps its old name so saved designs edit)
  'Burst organ (escape)': (body, deg, id, size, tilt, depth, feels, len = 20) => {
    // a short coiled tail that, fired, beats extremely fast for a moment (like Mesodinium's escape), then recharges
    const parts = chain(id, surfacePoint(body, deg), deg + tilt, Math.max(2, Math.round(len / 5)), 5, (i) => ({
      type: 'motor', rate: 500, swing: 40, phase: -i * 0.2,
      burst: { duration: Math.round(20 * size) / 10, recharge: 3, group: id } }));
    for (const p of parts) p.radius = 0.3;
    parts[0].label = 'Spring';
    return parts;
  },
  // removed from the Build panel (author, 2026-10-28); kept so old designs with one still edit
  'Ejectisome, latched (Release)': (body, deg, id, size, tilt) => [
    { type: 'segment', id, label: 'Ejectisome', at: surfacePoint(body, deg), angle: deg + tilt, length: Math.round(200 * size), radius: 0.3,
      joint: { type: 'extend', stiffness: 20, latched: true } },
  ],
  // pigment: 'sun' (chlorophyll) or 'shade' (with phycobilins: works in dim light, deep; less on top, dearer to keep)
  // the brain box: its size gives it slots, one for each brain module (sim/brain.js); always round
  'Nucleus (the brain)': (body, deg, id, size, tilt, depth) =>
    [{ type: 'inclusion', id, label: 'Nucleus', ...inside(body, deg, size, depth), material: 'nucleus' }],
  'Plastid (makes energy)': (body, deg, id, size, tilt, depth, feels, len = 0, strength, pigment = 'sun') =>
    [{ type: 'inclusion', id, label: pigment === 'shade' ? 'Shade plastid' : 'Plastid', ...inside(body, deg, size, depth, len, tilt),
      material: 'plastid', ...(pigment === 'shade' ? { pigment: 'shade' } : {}) }],
  'Starch granule (quick store, heavy)': (body, deg, id, size, tilt, depth) =>
    [{ type: 'inclusion', id, label: 'Starch granule', ...inside(body, deg, size, depth), material: 'starch', fill: 0.5 }],
  'Oil droplet': (body, deg, id, size, tilt, depth) =>
    [{ type: 'inclusion', id, label: 'Oil droplet', ...inside(body, deg, size, depth), material: 'oil' }],
  'Sap vacuole (slider)': (body, deg, id, size, tilt, depth) =>
    [{ type: 'inclusion', id, label: 'Sap vacuole', ...inside(body, deg, size, depth), material: 'sap', density: 1025 }],
  // one part for every store and float: what it holds decides what it does (the lab grows by materials, not new blocks)
  'Vacuole (store or float)': (body, deg, id, size, tilt, depth, feels, len = 0, strength = 0.5, content = 'starch') => {
    const at = inside(body, deg, size, depth, len, tilt);
    const what = {
      starch: { label: 'Starch granule', material: 'starch', fill: 0.5 },
      oil: { label: 'Oil droplet', material: 'oil' },
      sap: { label: 'Sap vacuole', material: 'sap', density: 1025 },
      gas: { label: 'Gas vesicles', material: 'gas', strength },
    }[content];
    return [{ type: 'inclusion', id, ...at, ...what }];
  },
  'Gas vesicles (float, crush deep)': (body, deg, id, size, tilt, depth, feels, len, strength = 0.5) =>
    [{ type: 'inclusion', id, label: 'Gas vesicles', ...inside(body, deg, size, depth), material: 'gas', strength }],
  'Statolith (which way is up)': (body, deg, id, size, tilt, depth) =>   // `tilt` here: the direction it reads, 0 = the front
    [{ type: 'inclusion', id, label: 'Statolith', ...inside(body, deg, size, depth), material: 'statolith', angle: tilt }],
  'Nutrient sensor': (body, deg, id) => [{ type: 'sensor', id, label: 'Nutrient sensor', at: surfacePoint(body, deg), kind: 'chem' }],
  'Kin pad': (body, deg, id) => [{ type: 'pad', id, label: 'Kin pad', at: surfacePoint(body, deg), kind: 'kin' }],
  'Mucus pad': (body, deg, id) => [{ type: 'pad', id, label: 'Mucus pad', at: surfacePoint(body, deg), kind: 'mucus' }],
  'Light sensor (eyespot)': (body, deg, id, size, tilt) =>
    [{ type: 'sensor', id, label: 'Light sensor', at: surfacePoint(body, deg), angle: deg + tilt, kind: 'light',
      cone: Math.max(20, Math.round(180 * size)) }],
  'Touch sensor': (body, deg, id, size, tilt, depth, feels) =>
    [{ type: 'sensor', id, label: `Touch sensor${feels === 'anything' ? ' (anything)' : ''}`, at: surfacePoint(body, deg), kind: 'touch', feels }],
  'Proximity sensor': (body, deg, id, size, tilt, depth, feels) =>
    [{ type: 'sensor', id, label: `Proximity sensor${feels === 'anything' ? ' (anything)' : ''}`, at: surfacePoint(body, deg), kind: 'near',
      range: Math.round(200 * size), feels }],
};

// ----- mirror images. A reflection keeps the physics honest: positions and angles reflect, and every joint turns the
// other way (a motor's stroke and a spring's rest angle change sign), so a mirrored part beats or kicks the other way.
const neg = (v) => -v + 0;   // + 0 turns -0 into 0
const negJoint = (p) => {
  if (!p.joint) return;
  if (p.joint.swing) p.joint.swing = -p.joint.swing;
  if (p.joint.rest) p.joint.rest = -p.joint.rest;
};

// Flip a freshly made part about its own line: where it sits and points stay, what hangs from it and how its joints
// turn are mirrored (an oar that beat one way beats the other)
export function flipPart(parts) {
  for (const p of parts) {
    negJoint(p);
    if (p.parent && p.parent !== 'body') {
      if (p.at) p.at = [p.at[0], neg(p.at[1])];
      if (p.angle) p.angle = neg(p.angle);
    }
  }
  return parts;
}

// A mirror copy of a part group (its root on the body and everything hanging from it) across a line through the body's
// centre at `axis` degrees (90: left <-> right, 0: top <-> bottom), with fresh ids from `id`. A part made in the Build
// panel stays editable: its copy is where it would be made at the mirrored angle, tilt negated, flipped.
export function mirrorGroup(members, axis, id) {
  const copy = JSON.parse(JSON.stringify(members));
  const b = copy[0].build;
  const ids = new Map();
  copy.forEach((p, k) => {
    if (!p.id) return;
    ids.set(p.id, b && p.id.startsWith(b.id) ? id + p.id.slice(b.id.length) : `${id}_${k}`);
  });
  // exact for the two mirror lines the panel offers (no rounding noise), trigonometry for any other
  const t = 2 * axis * Math.PI / 180;
  const c = axis % 180 === 0 ? 1 : axis % 180 === 90 ? -1 : Math.cos(t), s = axis % 90 === 0 ? 0 : Math.sin(t);
  const norm = (deg) => ((deg % 360) + 540) % 360 - 180;
  for (const p of copy) {
    negJoint(p);
    if (p.id) p.id = ids.get(p.id);
    if (p.joint && p.joint.burst && p.joint.burst.group !== undefined) {
      const g = p.joint.burst.group;
      p.joint.burst.group = ids.get(g) || (b && String(g).startsWith(b.id) ? id + String(g).slice(b.id.length) : `${id}_burst`);
    }
    if (p.parent && p.parent !== 'body') {   // in its parent's own frame, which the reflection flips
      p.parent = ids.get(p.parent) || p.parent;
      if (p.at) p.at = [p.at[0], neg(p.at[1])];
      if (p.angle) p.angle = neg(p.angle);
    } else {                                 // on the body: reflect the point and the direction
      const [x, y] = p.at || [0, 0];
      p.at = [x * c + y * s + 0, x * s - y * c + 0];
      if (p.type === 'segment') p.angle = norm(2 * axis - (p.angle || 0));
      else if ((p.type === 'sensor' || p.type === 'inclusion') && p.angle !== undefined) p.angle = norm(2 * axis - p.angle);
    }
  }
  if (b) Object.assign(b, { id, where: ((2 * axis - b.where) % 360 + 360) % 360, tilt: -b.tilt + 0, flip: !b.flip });
  return copy;
}

const room = (s) => `${Math.round(100 * s)}% of room`;

// An inclusion can be a rod: Length its straight part (0: round), Turn its angle from the body's axis (0: along it)
const ROD = { length: { min: 0, max: 80, step: 2, def: 0, round: true }, tilt: true, tiltLabel: 'Turn' };

// Which Build controls mean something for each part, and what Size means for it
export const CONTROLS = {
  'Nucleus (the brain)': { size: (s, body) => (body ? `${slotsOf(insideRadius(body, s))} slots for brain modules` : ''), inside: true, sizeDefault: 35 },
  'Vacuole (store or float)': { size: (s) => `${Math.round(100 * s)}% thick`, inside: true, content: true, sizeDefault: 30, ...ROD },
  'Gas vesicles (float, crush deep)': { size: room, inside: true, strength: true, sizeDefault: 30 },
  'Statolith (which way is up)': { size: room, inside: true, tilt: true, tiltLabel: 'Faces', tiltRange: [-180, 180], sizeDefault: 20 },
  'Nutrient sensor': {},
  'Wave tail (swims)': { tilt: true, flip: true, pull: true, length: { min: 16, max: 96, step: 8, def: 48 } },
  'Flexible oar (swims)': { tilt: true, flip: true, length: { min: 10, max: 100, step: 5, def: 40 } },
  'Stiff flap (goes nowhere)': { tilt: true, flip: true, length: { min: 10, max: 100, step: 5, def: 40 } },
  'Spine, protein': { tilt: true, size: (s) => `${Math.round(100 * s)} µm long` }, 'Spine, glass': { tilt: true, size: (s) => `${Math.round(100 * s)} µm long` },
  'Ejectisome, latched (Release)': { tilt: true, size: (s) => `${Math.round(200 * s)} µm long` },
  'Burst organ (escape)': { tilt: true, flip: true, length: { min: 10, max: 40, step: 5, def: 20 }, size: (s) => `${(Math.round(20 * s) / 10).toFixed(1)} s burst`, sizeDefault: 40 },
  'Oil droplet': { size: (s) => `${Math.round(100 * s)}% of room`, inside: true }, 'Sap vacuole (slider)': { size: (s) => `${Math.round(100 * s)}% of room`, inside: true },
  'Kin pad': {}, 'Mucus pad': {},
  'Plastid (makes energy)': { size: (s) => `${Math.round(100 * s)}% thick`, inside: true, pigment: true, ...ROD },
  'Starch granule (quick store, heavy)': { size: (s) => `${Math.round(100 * s)}% of room`, inside: true },
  'Light sensor (eyespot)': { tilt: true, size: (s) => `${Math.max(20, Math.round(180 * s))}° cone`, sizeDefault: 100 }, 'Touch sensor': { feels: true },
  'Proximity sensor': { size: (s) => `${Math.round(200 * s)} µm range`, feels: true },
};

// What each plastid pigment does (a tip under the Pigment choice)
export const PIGMENT_TIPS = {
  sun: 'Sun: chlorophyll. Strong in bright water near the surface, weak in dim light',
  shade: 'Shade: with phycobilins, which catch the green light that reaches deep. Works in dim light, gives less on top, and costs 2.5× the upkeep',
};

// What each vacuole content does (a tip under the Content choice)
export const CONTENT_TIPS = {
  starch: 'Quick energy store: fills and burns fast, but heavy (a full cell sinks)',
  oil: 'Slow energy store: holds more energy, and light (a full cell floats a little)',
  sap: 'Adjustable buoyancy: pump it lighter or heavier (slider under the parts); costs energy, works slowly',
  gas: 'Strong float, always on: wears out and is rebuilt from energy; crushed for good below its depth',
};

// How the Build panel sorts parts (parts made with older templates, such as 'Oil droplet', still edit)
export const CATEGORIES = {
  'Flagella': ['Wave tail (swims)', 'Flexible oar (swims)', 'Stiff flap (goes nowhere)'],
  'Spines & appendages': ['Spine, protein', 'Spine, glass'],
  'Escapes': ['Burst organ (escape)'],   // the spring (template name kept so old designs edit); the ejectisome was removed
  'Inside the cell': ['Nucleus (the brain)', 'Plastid (makes energy)', 'Vacuole (store or float)'],
  'Pads': ['Kin pad', 'Mucus pad'],
  'Sensors': ['Light sensor (eyespot)', 'Statolith (which way is up)', 'Touch sensor', 'Proximity sensor',
    'Nutrient sensor'],
};

// The category of a part already on the body, from what it is
export function categoryOf(p) {
  if (p.type === 'inclusion') return p.material === 'statolith' ? 'Sensors' : 'Inside the cell';
  if (p.type === 'pad') return 'Pads';
  if (p.type === 'sensor') return 'Sensors';
  const j = p.joint && p.joint.type;
  if (j === 'motor') return p.joint.burst ? 'Escapes' : 'Flagella';
  if (j === 'hinge' || j === 'extend') return 'Escapes';
  return 'Spines & appendages';
}

// The design's parts grouped by root (a part on the body with everything hanging from it)
export function partGroups(parts) {
  const groups = [];
  for (const p of parts) {
    if (p.parent && p.parent !== 'body') continue;
    const ids = new Set(p.id ? [p.id] : []);
    const members = [p];
    let grew = true;
    while (grew) {
      grew = false;
      for (const q of parts) if (!members.includes(q) && q.parent && ids.has(q.parent)) { members.push(q); if (q.id) ids.add(q.id); grew = true; }
    }
    const [x, y] = p.at || [0, 0];
    const name = p.label || (p.type === 'segment' ? `${p.material || 'protein'} segment${p.joint ? ` (${p.joint.type})` : ''}`
      : p.type === 'inclusion' ? `${p.material} inclusion` : p.type === 'sensor' ? `${p.kind || 'light'} sensor` : `${p.kind || 'kin'} pad`);
    groups.push({ name, members, category: categoryOf(p), more: members.length - 1, deg: Math.round(Math.atan2(y, x) * 180 / Math.PI + 360) % 360 });
  }
  return groups;
}
