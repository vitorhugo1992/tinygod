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
  try { buildCell(prepEntry(d)); } catch (e) { return explain(d, e.message); }
  return '';
}

// buildCell's error with the parts and numbers that cause it, so an AI can fix its design (round inclusions and
// straight rods by their middle lines; the game tests their outlines, so this explains, it doesn't decide)
const r2 = (v) => Math.round(v * 100) / 100;
function middle(p) {   // an inclusion's middle line, [x1, y1, x2, y2], in the body's frame
  const [x, y] = p.at || [0, 0], h = (p.material === 'statolith' ? 0 : p.length || 0) / 2, t = (p.angle || 0) * Math.PI / 180;
  return [x - h * Math.cos(t), y - h * Math.sin(t), x + h * Math.cos(t), y + h * Math.sin(t)];
}
function pointSeg(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2)) : 0;
  return Math.hypot(px - ax - ex * t, py - ay - ey * t);
}
const segSeg = (a, b) => Math.min(pointSeg(a[0], a[1], ...b), pointSeg(a[2], a[3], ...b), pointSeg(b[0], b[1], ...a), pointSeg(b[2], b[3], ...a));
function explain(d, msg) {
  const inc = d.parts.filter((p) => p.type === 'inclusion' && !p.outline && !p.bend);
  const name = (p) => `"${p.id || p.material}" (${p.material}, radius ${p.radius}${p.length ? `, length ${p.length}` : ''} at [${(p.at || [0, 0]).join(', ')}])`;
  const a = d.body.radius, L = d.body.length || 0, room = a - PARAMS.cell.wallThickness;
  if (/overlap/.test(msg)) {
    let worst = null;
    for (let i = 0; i < inc.length; i++) for (let j = i + 1; j < inc.length; j++) {
      const gap = segSeg(middle(inc[i]), middle(inc[j])), need = inc[i].radius + inc[j].radius;
      if (gap < need && (!worst || need - gap > worst.by)) worst = { p: inc[i], q: inc[j], gap, need, by: need - gap };
    }
    if (worst) return `inclusions overlap: ${name(worst.p)} and ${name(worst.q)}: their middles are ${r2(worst.gap)} µm apart, but their radii add up to ${r2(worst.need)} µm (move them at least ${r2(worst.by)} µm further apart, or make them smaller)`;
  }
  if (/sticks out/.test(msg)) {
    for (const p of inc) {
      const m = middle(p), far = Math.max(pointSeg(m[0], m[1], -L / 2, 0, L / 2, 0), pointSeg(m[2], m[3], -L / 2, 0, L / 2, 0));
      if (far + p.radius > room) return `inclusion sticks out of the body: ${name(p)} reaches ${r2(far + p.radius)} µm from the body's axis line, but the inside of the wall is at ${r2(room)} µm (body radius ${a} − 0.3)`;
    }
  }
  if (/overfill/.test(msg)) {
    const vol = Math.PI * a * a * L + 4 / 3 * Math.PI * a ** 3;
    const used = inc.reduce((s, p) => s + Math.PI * p.radius ** 2 * (p.length || 0) + 4 / 3 * Math.PI * p.radius ** 3, 0);
    return `inclusions overfill the body: they take ${Math.round(100 * used / vol)}% of its volume, at most 90%`;
  }
  return msg;
}

// What copying a chat's answer can do to it (seen from ChatGPT on a phone: "\" at every line's end, "&#x20;" for
// spaces): HTML entities, line-end backslashes, odd spaces and curly quotes, undone
export function cleanAnswer(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\\\r?\n/g, '\n').replace(/\\$/, '')
    .replace(/[  -​ 　]/g, ' ')
    .replace(/[“”„″]/g, '"').replace(/[‘’]/g, "'");
}

// An AI's answer as text -> { name, note, design } (the first {...} in it), or throws
export function readAnswer(text) {
  const s = cleanAnswer(text), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no JSON object in it');
  let got;
  try { got = JSON.parse(s.slice(a, b + 1)); } catch (e) { throw new Error('its JSON is broken (' + e.message + ')'); }
  const design = got.design || got;
  return { name: String(got.name || 'Entry').trim().slice(0, 60), note: got.note ? String(got.note) : '', design };
}
