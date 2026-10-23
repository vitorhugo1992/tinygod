// Part templates for the sandbox's Build panel: each returns design parts placed at an angle round the body,
// pointing outward (or, for inclusions, inside toward that angle). `size` (0.1-1) sets an inclusion's radius
// (share of the room inside the wall), a spine's or ejectisome's length. The root part carries a `label`.

// Where a ray from the body centre at angle `deg` leaves the body (a capsule along x): [x, y]
export function surfacePoint(body, deg) {
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const h = (body.length || 0) / 2, a = body.radius, ac = Math.abs(c), as = Math.abs(s);
  let r;
  if (as > 1e-9 && a * ac / as <= h) r = a / as;                   // through the straight side
  else r = h * ac + Math.sqrt(h * h * c * c - h * h + a * a);       // through a rounded end
  return [r * c, r * s];
}

// A sphere inside the wall, as big as `size` of the room, pushed toward `deg` as far as it fits
function inside(body, deg, size) {
  const room = body.radius - 0.35;                          // inside the wall (0.3 µm) with a little play
  const L = body.length || 0, a = body.radius;
  const most = Math.cbrt(0.85 * (Math.PI * a * a * L + 4 / 3 * Math.PI * a ** 3) * 3 / (4 * Math.PI));  // ≤ 85% of the body
  const r = Math.floor(Math.min(room, most) * size * 10) / 10;
  const [x, y] = surfacePoint(body, deg), d = Math.hypot(x, y);
  const k = Math.max(0, d - body.radius + room - r) / d;   // how far from the centre it can sit
  return { at: [Math.round(x * k * 100) / 100, Math.round(y * k * 100) / 100], radius: r };
}

const chain = (id, at, deg, n, length, joint) => Array.from({ length: n }, (_, i) => ({
  type: 'segment', id: `${id}_${i}`, parent: i ? `${id}_${i - 1}` : 'body', at: i ? [length / 2, 0] : at,
  angle: i ? 0 : deg, length, radius: 0.25, material: 'protein', joint: joint(i),
}));

export const PART_TEMPLATES = {
  'Wave tail (swims)': (body, deg, id) => {
    const parts = chain(id, surfacePoint(body, deg), deg, 6, 8, (i) => ({ type: 'motor', rate: 30, swing: 35, phase: -i * 0.15 }));
    parts[0].label = 'Wave tail';
    return parts;
  },
  'Flexible oar (swims)': (body, deg, id) => [
    { type: 'segment', id: `${id}_0`, label: 'Flexible oar', at: surfacePoint(body, deg), angle: deg, length: 15, radius: 0.25,
      joint: { type: 'motor', rate: 20, swing: 60, stroke: 0.25 } },
    { type: 'segment', id: `${id}_1`, parent: `${id}_0`, at: [7.5, 0], length: 25, radius: 0.25,
      joint: { type: 'hinge', stiffness: 700 } },
  ],
  'Stiff flap (goes nowhere)': (body, deg, id) => [
    { type: 'segment', id, label: 'Stiff flap', at: surfacePoint(body, deg), angle: deg, length: 40, radius: 0.25,
      joint: { type: 'motor', rate: 20, swing: 45, stroke: 0.25 } },
  ],
  'Spine, protein': (body, deg, id, size) => [
    { type: 'segment', id, label: 'Protein spine', at: surfacePoint(body, deg), angle: deg, length: Math.round(100 * size), radius: 0.5, material: 'protein' },
  ],
  'Spine, glass': (body, deg, id, size) => [
    { type: 'segment', id, label: 'Glass spine', at: surfacePoint(body, deg), angle: deg, length: Math.round(100 * size), radius: 0.5, material: 'glass' },
  ],
  'Spring, latched (Release)': (body, deg, id) => [
    { type: 'segment', id, label: 'Latched spring', at: surfacePoint(body, deg), angle: deg, length: 30, radius: 0.4,
      joint: { type: 'hinge', stiffness: 2000, rest: 150, latched: true } },
  ],
  'Ejectisome, latched (Release)': (body, deg, id, size) => [
    { type: 'segment', id, label: 'Ejectisome', at: surfacePoint(body, deg), angle: deg, length: Math.round(200 * size), radius: 0.3,
      joint: { type: 'extend', stiffness: 20, latched: true } },
  ],
  'Oil droplet': (body, deg, id, size) => [{ type: 'inclusion', id, label: 'Oil droplet', ...inside(body, deg, size), material: 'oil' }],
  'Sap vacuole (slider)': (body, deg, id, size) =>
    [{ type: 'inclusion', id, label: 'Sap vacuole', ...inside(body, deg, size), material: 'sap', density: 1025 }],
  'Kin pad': (body, deg, id) => [{ type: 'pad', id, label: 'Kin pad', at: surfacePoint(body, deg), kind: 'kin' }],
  'Mucus pad': (body, deg, id) => [{ type: 'pad', id, label: 'Mucus pad', at: surfacePoint(body, deg), kind: 'mucus' }],
};

// How the Build panel sorts parts
export const CATEGORIES = {
  'Flagella': ['Wave tail (swims)', 'Flexible oar (swims)', 'Stiff flap (goes nowhere)'],
  'Spines & appendages': ['Spine, protein', 'Spine, glass'],
  'Springs & ejectors': ['Spring, latched (Release)', 'Ejectisome, latched (Release)'],
  'Vacuoles & droplets': ['Oil droplet', 'Sap vacuole (slider)'],
  'Pads': ['Kin pad', 'Mucus pad'],
};

// The category of a part already on the body, from what it is
export function categoryOf(p) {
  if (p.type === 'inclusion') return 'Vacuoles & droplets';
  if (p.type === 'pad') return 'Pads';
  const j = p.joint && p.joint.type;
  if (j === 'motor') return 'Flagella';
  if (j === 'hinge' || j === 'extend') return 'Springs & ejectors';
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
      : p.type === 'inclusion' ? `${p.material} inclusion` : `${p.kind || 'kin'} pad`);
    groups.push({ name, members, category: categoryOf(p), more: members.length - 1, deg: Math.round(Math.atan2(y, x) * 180 / Math.PI + 360) % 360 });
  }
  return groups;
}
