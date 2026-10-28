// The nucleus is the cell's brain box (CLAUDE.md, author 2026-10-28): an inclusion whose size gives it slots, and each
// brain module takes one. Modules: every sensor on the cell (its module in the brain), every built-in reading that is
// wired (energy, starch, oil, plastid health), and every rule box (each GO box and each part's STOP box). Cables are
// free. buildCell refuses a design whose nucleus is too small for its modules; a cell with no nucleus has no brain
// (the sandbox strips its wiring, so every part simply runs); the physics itself reads wiring on any cell.
import { PARAMS } from './params.js';

export const BUILT_INS = ['energy', 'starch', 'oil', 'health'];

// The design's nucleus parts
export const nucleiOf = (design) => (design.parts || []).filter((p) => p.type === 'inclusion' && p.material === 'nucleus');

// Slots in a nucleus of radius r µm (its cross-section, PARAMS.brain.slotArea µm² a slot)
export const slotsOf = (r) => Math.floor(Math.PI * r * r / PARAMS.brain.slotArea + 1e-9);

// The smallest radius (0.1 µm steps) with at least n slots
export function radiusFor(n) {
  let r = 0.5;
  while (slotsOf(r) < n) r = Math.round((r + 0.1) * 10) / 10;
  return r;
}

// The brain modules a design needs: { sensors, builtins: [ids], boxes, total }
export function brainUse(design) {
  const parts = design.parts || [];
  const sensors = parts.filter((p) => p.type === 'sensor' || (p.type === 'inclusion' && p.material === 'statolith')).length;
  const used = new Set();
  const note = (id) => { if (BUILT_INS.includes(id)) used.add(id); };
  // each part group (a part on the body and everything hanging from it) shares one rule: count it once
  const byId = new Map(parts.filter((p) => p.id).map((p) => [p.id, p]));
  const rootOf = (p) => { while (p.parent && p.parent !== 'body' && byId.has(p.parent)) p = byId.get(p.parent); return p; };
  const seen = new Set();
  let boxes = 0;
  for (const p of parts) {
    if (!p.joint) continue;
    const ctl = p.joint.controls || (p.joint.control ? [p.joint.control] : []);
    for (const c of ctl) { note(c.sensor); if (c.vs !== undefined) note(c.vs); }
    if (p.joint.speed && p.joint.speed.sensor !== undefined) note(p.joint.speed.sensor);
    const root = rootOf(p);
    if (!ctl.length || seen.has(root)) continue;
    seen.add(root);
    let groups = 0, stop = false, any = false;
    for (const c of ctl) {
      if (c.stop) { stop = true; continue; }
      if (!any || c.or) groups++;
      any = true;
    }
    boxes += groups + (stop ? 1 : 0);
  }
  return { sensors, builtins: [...used], boxes, total: sensors + used.size + boxes };
}

// Why the design's brain doesn't work, or '' (more than one nucleus; too many modules for its slots)
export function brainProblem(design) {
  const nuclei = nucleiOf(design);
  if (nuclei.length > 1) return 'a cell has one nucleus';
  if (!nuclei.length) return '';
  const use = brainUse(design), slots = slotsOf(nuclei[0].radius);
  return use.total > slots ? `nucleus full: ${use.total} modules, ${slots} slots. Make it bigger` : '';
}
