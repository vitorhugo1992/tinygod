// Tournament entries (docs/DESIGN-A-SPECIES.md): the rules an entry must keep, and a design made ready as the sandbox
// loads it. Shared by the entry page (enter/), tools/trial.mjs and the tournament.
import { PARAMS } from './params.js';
import { nucleiOf } from './brain.js';
import { buildCell } from './build.js';

// The empty rule slots the sandbox fills in (rest, chamber, hold, divide), on a copy
export function prepEntry(design) {
  const d = JSON.parse(JSON.stringify(design));
  for (const p of d.parts || []) {
    if (p.type === 'inclusion' && p.material === 'nucleus' && !p.joint) p.joint = { type: 'rest' };
    if (p.type === 'inclusion' && p.material === 'chamber' && !p.joint) p.joint = { type: 'chamber' };
    if (p.type === 'pad' && !p.joint) p.joint = { type: 'hold' };
  }
  if (!(d.parts || []).some((p) => p.type === 'rule' && p.joint && p.joint.type === 'divide')) (d.parts ||= []).push({ type: 'rule', id: 'divide', joint: { type: 'divide' } });
  return d;
}

// Why an entry is refused, or '': the editor's limits (a pasted design could break them), then buildCell's own errors
export function entryProblem(design) {
  const d = design;
  if (!d || typeof d !== 'object' || !d.body) return 'no body';
  if (!Array.isArray(d.parts)) return 'no parts list';
  const { radius, length = 0 } = d.body;
  if (!(radius >= 1 && radius <= 50)) return 'body radius must be 1-50 µm';
  if (!(length >= 0 && length <= 200)) return 'body length must be 0-200 µm';
  const ids = d.parts.filter((p) => p.id).map((p) => p.id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice) return `two parts have the id "${twice}"`;
  const nuc = nucleiOf(d);
  for (const n of nuc) if (n.radius !== PARAMS.brain.radius || n.length || n.outline || n.bend) return `the nucleus must be round, radius ${PARAMS.brain.radius}`;
  const wired = d.parts.some((p) => p.joint && (p.joint.controls || p.joint.control || p.joint.speed));
  if (wired && !nuc.length) return 'rules need a nucleus (without one the game drops every rule)';
  try { buildCell(prepEntry(d)); } catch (e) { return e.message; }
  return '';
}

// An AI's answer as text -> { name, note, design } (the first {...} in it), or throws
export function readAnswer(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object in it');
  const got = JSON.parse(s.slice(a, b + 1));
  const design = got.design || got;
  return { name: String(got.name || 'Entry').trim().slice(0, 60), note: got.note ? String(got.note) : '', design };
}
