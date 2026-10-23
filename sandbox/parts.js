// Part templates for the sandbox's Build panel: each returns design parts placed at an angle round the body,
// pointing outward (or, for inclusions, inside toward that angle). The root part carries a `label` for the list.

// Where a ray from the body centre at angle `deg` leaves the body (a capsule along x): [x, y]
export function surfacePoint(body, deg) {
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const h = (body.length || 0) / 2, a = body.radius, ac = Math.abs(c), as = Math.abs(s);
  let r;
  if (as > 1e-9 && a * ac / as <= h) r = a / as;                   // through the straight side
  else r = h * ac + Math.sqrt(h * h * c * c - h * h + a * a);       // through a rounded end
  return [r * c, r * s];
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
  'Spine, protein': (body, deg, id) => [
    { type: 'segment', id, label: 'Protein spine', at: surfacePoint(body, deg), angle: deg, length: 40, radius: 0.5, material: 'protein' },
  ],
  'Spine, glass': (body, deg, id) => [
    { type: 'segment', id, label: 'Glass spine', at: surfacePoint(body, deg), angle: deg, length: 40, radius: 0.5, material: 'glass' },
  ],
  'Spring, latched (Release)': (body, deg, id) => [
    { type: 'segment', id, label: 'Latched spring', at: surfacePoint(body, deg), angle: deg, length: 30, radius: 0.4,
      joint: { type: 'hinge', stiffness: 2000, rest: 150, latched: true } },
  ],
  'Ejectisome, latched (Release)': (body, deg, id) => [
    { type: 'segment', id, label: 'Ejectisome', at: surfacePoint(body, deg), angle: deg, length: 30, radius: 0.3,
      joint: { type: 'extend', stiffness: 20, latched: true } },
  ],
  'Oil droplet': (body, deg, id) => {
    const [x, y] = surfacePoint(body, deg), r = body.radius * 0.35, k = (Math.hypot(x, y) - body.radius * 0.4 - 0.5) / Math.hypot(x, y);
    return [{ type: 'inclusion', id, label: 'Oil droplet', at: [x * k, y * k], radius: r, material: 'oil' }];
  },
  'Sap vacuole (slider)': (body, deg, id) => {
    const [x, y] = surfacePoint(body, deg), r = body.radius * 0.6, k = (Math.hypot(x, y) - r - 0.5) / Math.hypot(x, y);
    return [{ type: 'inclusion', id, label: 'Sap vacuole', at: [x * k, y * k], radius: r, material: 'sap', density: 1025 }];
  },
  'Kin pad': (body, deg, id) => [{ type: 'pad', id, label: 'Kin pad', at: surfacePoint(body, deg), kind: 'kin' }],
  'Mucus pad': (body, deg, id) => [{ type: 'pad', id, label: 'Mucus pad', at: surfacePoint(body, deg), kind: 'mucus' }],
};

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
    groups.push({ name, members, more: members.length - 1, deg: Math.round(Math.atan2(y, x) * 180 / Math.PI + 360) % 360 });
  }
  return groups;
}
