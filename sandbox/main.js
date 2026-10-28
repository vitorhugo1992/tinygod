// The sandbox viewer: plain shapes, trails and numbers over the same simulation the checks run.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';
import { PRESETS } from '../sim/presets.js';
import { updatePose, fire, motorAngle, toWorld as pieceToWorld } from '../sim/physics.js';
import { rewire, respeed, controlsOf, buildCell } from '../sim/build.js';
import { lightAt, daylight, clock } from '../sim/light.js';
import { energyLevel, storeLevel, plastidHealth } from '../sim/sense.js';
import { nutrientAt } from '../sim/nutrient.js';
import { brainUse, brainProblem, nucleiOf, slotsOf, BUILT_INS } from '../sim/brain.js';
import { note, nightsLeft, drawJournal, eventText, forecast } from './journal.js';
import { PART_TEMPLATES, partGroups, surfacePoint, CATEGORIES, CONTROLS, CONTENT_TIPS, PIGMENT_TIPS, flipPart, mirrorGroup } from './parts.js';

const DT = PARAMS.time.dt, TW = PARAMS.tank.w, TH = PARAMS.tank.h, M_START = PARAMS.metab.start;
const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');

const COLOR = {
  water: '#0b1322', outside: '#060a12', grid: '#132036', gridMajor: '#1f3352', label: '#4d6a86',
  trail: '#6fd3b5', protein: '#a8d8a0', glass: '#9fd8f0', oil: '#f2c94c', sap: '#5f8fd8',
  body: { protein: '#3f7d5c', glass: '#4f8fa0' }, outline: '#d8f0e0', motor: '#ff7a6b', hinge: '#ffb54a',
  extend: '#c9a0ff', stopped: '#5d6b74', coil: '#ffb54a', coilFiring: '#fff1a0', coilEmpty: '#6b5a40', kin: '#e070ff', mucus: '#f2e28a', link: '#e070ff', selected: '#ffffff',
  nucleus: 'rgba(176,150,214,.55)', envelope: '#c9b6ea', chromatin: 'rgba(92,70,140,.8)', nucleolus: '#5b467f',
  statolith: 'rgba(200,215,230,.35)', grain: '#e8eef5', gas: '#cfe9ff', crushed: '#6b7680', chem: '#c8b26a',
  plastid: '#8fc94a', plastidShade: '#c45a7c', starch: '#ece3c4', starving: '#ff5a4a', eyeDark: '#7a2a1c', eyeLit: '#ff8a3c', light: 'rgba(255,240,190,', touch: '#5fd0ff', near: 'rgba(95,208,255,',
};

let design, world, cell, playing = true, acc = 0, lagging = false;   // cell: the selected one (followed, measured)
let trail = [], samples = [], released = null;   // released: where and when latches were let go
let ghosts = [];                                  // outlines of cells as they were at Release
let cam = { x: TW / 2, y: TH / 2 };

// ----- loading and resetting -----
const addSelect = $('addWhat');
addSelect.add(new Option('copy of this design', ''));
for (const name of Object.keys(PRESETS)) addSelect.add(new Option(name, name));
const savedGroup = document.createElement('optgroup'); savedGroup.label = 'Saved designs'; addSelect.appendChild(savedGroup);
// each preset is its own species, so kin pads only hold copies of the same design
const preset = (name) => Object.assign(JSON.parse(JSON.stringify(PRESETS[name])), { species: name });

// Every design as it goes into the tank: a cell without a nucleus has no brain, so its wiring is dropped (every part
// simply runs; Undo brings it back after removing the nucleus). Designs saved earlier: a burst organ is now called a
// spring; timers (removed 2026-10-24) are dropped and every cable from them unplugged.
function withoutTimers(d) {
  for (const p of d.parts || []) if (p.label === 'Burst organ') p.label = 'Spring';   // renamed (author, 2026-10-28)
  if (!nucleiOf(d).length) for (const p of d.parts || []) if (p.joint) { delete p.joint.controls; delete p.joint.control; delete p.joint.speed; }
  tagParts(d);
  const gone = new Set((d.parts || []).filter((p) => p.type === 'sensor' && p.kind === 'timer').map((p) => p.id));
  if (!gone.size) return d;
  d.parts = d.parts.filter((p) => !gone.has(p.id));
  for (const p of d.parts) delete p.trigger;
  unplug(d, gone);
  return d;
}

function load(d) {
  design = withoutTimers(d);
  $('json').value = JSON.stringify(d, null, 2);
  reset();
  listParts();
}

// Try a changed design; if it doesn't build, keep the old one and say why. The rebuilt cell stays where the selected
// one was, facing the same way. A change that builds can be undone (record = false when undoing or redoing).
function applyDesign(d, record = true) {
  d = withoutTimers(d);
  const old = design, pose = cell ? { x: cell.q[0], y: cell.q[1], angle: cell.q[2] * 180 / Math.PI } : null;
  design = d;
  const carry = world && cell ? { world, cell, design: old } : null;
  if (!reset(pose, carry)) { const msg = $('err').textContent; design = old; reset(pose, carry); $('err').textContent = msg; $('buildErr').textContent = msg; return false; }
  if (record) remember(old);
  clearForecast();
  $('buildErr').textContent = '';
  $('json').value = JSON.stringify(d, null, 2);
  listParts();
  updatePreview();
  return true;
}

// ----- undo and redo: the designs as they were (JSON), up to UNDO_STEPS back -----
const UNDO_STEPS = 50;
const past = [], future = [];
function remember(d) {
  past.push(JSON.stringify(d));
  if (past.length > UNDO_STEPS) past.shift();
  future.length = 0;
}
// the design without its wiring: if only the wiring differs, the cells in the tank are rewired, not rebuilt
const shape = (d) => JSON.stringify(d, (k, v) => (k === 'controls' || k === 'control' ? undefined : v));
function travel(from, to) {
  if (!from.length) return;
  const d = JSON.parse(from.pop());
  to.push(JSON.stringify(design));
  editing = null; $('addPart').textContent = '＋ Add to body'; $('cancelEdit').hidden = true;
  if (shape(d) === shape(design)) {
    for (const c of world.cells) {
      if (c.design !== design) continue;
      c.design = d;
      (d.parts || []).forEach((p, k) => { if (p.joint) rewire(c, k, controlsOf(p.joint)); });
    }
    design = d;
    $('json').value = JSON.stringify(d, null, 2);
    listParts();
  } else applyDesign(d, false);
}
$('undo').onclick = () => travel(past, future);
$('redo').onclick = () => travel(future, past);
$('clearParts').onclick = () => {
  if (!(design.parts || []).length) return;
  editing = null; $('addPart').textContent = '＋ Add to body'; $('cancelEdit').hidden = true;
  applyDesign({ ...JSON.parse(JSON.stringify(design)), parts: [] });
};

// ----- the body: radius, length (0 = round), wall. Parts on it keep their angle; inclusions scale with it -----
function showBody() {
  const b = design.body;
  $('bodyRadius').value = b.radius; $('bodyLength').value = b.length || 0; $('bodyWall').value = b.wall || 'protein';
  $('bodyRadiusOut').textContent = `${b.radius} µm`;
  $('bodyLengthOut').textContent = b.length ? `${b.length} µm (rod)` : '0 (round)';
}
function reshape() {
  const d = JSON.parse(JSON.stringify(design));
  const old = d.body, body = { ...old, radius: Number($('bodyRadius').value), length: Number($('bodyLength').value), wall: $('bodyWall').value };
  const k = body.radius / old.radius;
  for (const p of d.parts || []) {
    if (p.parent && p.parent !== 'body') continue;
    const [x, y] = p.at || [0, 0];
    if (p.type === 'inclusion') { p.at = [x * k, y * k]; p.radius = Math.round(p.radius * k * 100) / 100; }
    else p.at = surfacePoint(body, Math.atan2(y, x) * 180 / Math.PI).map((v) => Math.round(v * 100) / 100);
  }
  d.body = body;
  if (!applyDesign(d)) showBody();
}
for (const id of ['bodyRadius', 'bodyLength']) {
  $(id).oninput = () => {   // show the number while dragging; rebuild when let go
    $('bodyRadiusOut').textContent = `${$('bodyRadius').value} µm`;
    $('bodyLengthOut').textContent = Number($('bodyLength').value) ? `${$('bodyLength').value} µm (rod)` : '0 (round)';
  };
  $(id).onchange = reshape;
}
$('bodyWall').onchange = reshape;

// ----- the Build panel: add parts round the body, list them, remove them -----
for (const [cat, names] of Object.entries(CATEGORIES)) {
  const group = document.createElement('optgroup');
  group.label = cat;
  for (const name of names) group.appendChild(new Option(name, name));
  $('partWhat').appendChild(group);
}
const showAngle = () => { $('partAngleOut').textContent = `${$('partAngle').value}°`; };
// moving Where moves an organelle sitting at the very centre too: it comes halfway out toward that side
$('partAngle').oninput = () => {
  if ((CONTROLS[$('partWhat').value] || {}).inside && Number($('partInside').value) === 0) { $('partInside').value = 50; showInside(); }
  showAngle();
};
showAngle();
const showTilt = () => { $('partTiltOut').textContent = `${$('partTilt').value}°`; };
$('partTilt').oninput = showTilt; showTilt();
const showSize = () => {
  const what = (CONTROLS[$('partWhat').value] || {}).size;
  $('partSizeOut').textContent = what ? what(Number($('partSize').value) / 100, design && design.body) : '';
};
$('partSize').oninput = showSize;
const showInside = () => { $('partInsideOut').textContent = `${$('partInside').value}%`; };
$('partInside').oninput = showInside; showInside();
let partCount = 0;
let editing = null;   // the id of the part being edited, or null when adding
// only the controls that mean something for the chosen part
const showControls = () => {
  const c = CONTROLS[$('partWhat').value] || {};
  $('tiltRow').style.display = c.tilt ? '' : 'none';
  $('sizeRow').style.display = c.size ? '' : 'none';
  $('insideRow').style.display = c.inside ? '' : 'none';
  $('feelsRow').style.display = c.feels ? '' : 'none';
  $('flipRow').style.display = c.flip ? '' : 'none';
  $('pullBtn').style.display = c.pull ? '' : 'none';
  $('lengthRow').style.display = c.length ? '' : 'none';
  const gas = c.strength || (c.content && $('partContent').value === 'gas');
  $('strengthRow').style.display = gas ? '' : 'none';
  $('contentRow').style.display = c.content ? '' : 'none';
  $('pigmentRow').style.display = c.pigment ? '' : 'none';
  $('contentTip').style.display = c.content || c.pigment || c.tip ? '' : 'none';
  $('contentTip').textContent = c.content ? CONTENT_TIPS[$('partContent').value] : c.pigment ? PIGMENT_TIPS[$('partPigment').value] : c.tip ? c.tip() : '';
  $('tiltLabel').textContent = c.tiltLabel || 'Tilt';   // a statolith's "tilt" is the direction it reads
  $('partTilt').min = (c.tiltRange || [-90, 90])[0]; $('partTilt').max = (c.tiltRange || [-90, 90])[1];
  showTilt(); showStrength();
  if (c.length) {   // this part's range; a new pick starts at its usual length
    const L = $('partLength'), keep = Number(L.value);
    L.min = c.length.min; L.max = c.length.max; L.step = c.length.step;
    L.value = editing ? keep : c.length.def;
  }
  if (c.sizeDefault && !editing) $('partSize').value = c.sizeDefault;
  showSize(); showLength();
};
function showLength() {
  const v = Number($('partLength').value), c = CONTROLS[$('partWhat').value] || {};
  $('partLengthOut').textContent = v === 0 && c.length && c.length.round ? '0 (round)' : `${v} µm`;
}
$('partLength').oninput = showLength;
// gas vesicles: how deep they are crushed (the same rule as sim/build.js)
function showStrength() {
  const s = Number($('partStrength').value) / 100, G = PARAMS.gas;
  $('partStrengthOut').textContent = `crushed below ${Math.round(TH * (G.shallowest + (1 - G.shallowest) * s))} µm`;
}
$('partStrength').oninput = showStrength;
$('partWhat').onchange = () => { showControls(); if (editing) updateEdited(); else updatePreview(); }; showControls();
$('flipBtn').onclick = () => { $('partFlip').checked = !$('partFlip').checked; $('partFlip').dispatchEvent(new Event('change')); };
$('pullBtn').onclick = () => { $('partPull').checked = !$('partPull').checked; $('partPull').dispatchEvent(new Event('change')); };
// Make a part from the Build controls; its first piece remembers how (build), so it can be edited later
function makePart(body, id, spot) {   // spot: { where, depth } instead of the sliders' (a nudge into free room)
  const c = CONTROLS[$('partWhat').value] || {};
  const b = { tpl: $('partWhat').value, where: spot ? spot.where : Number($('partAngle').value), tilt: Number($('partTilt').value),
    size: Number($('partSize').value) / 100, depth: spot ? spot.depth : Number($('partInside').value) / 100, feels: $('partFeels').value,
    flip: !!c.flip && $('partFlip').checked, id };
  if (c.pull && $('partPull').checked) b.pull = true;
  if (c.length) b.length = Number($('partLength').value);
  if (c.content) b.content = $('partContent').value;
  if (c.pigment) b.content = $('partPigment').value;   // a plastid's pigment goes where a vacuole's content does
  if (c.strength || b.content === 'gas') b.strength = Number($('partStrength').value) / 100;
  const parts = PART_TEMPLATES[b.tpl](body, b.where, id, b.size, b.tilt, b.depth, b.feels, b.length, b.strength, b.content, b.pull);
  if (b.flip) flipPart(parts);
  parts[0].build = b;
  return parts;
}
// The design with `fresh` added, or put in place of the part being edited (keeping its wiring); null if that is gone
function withPart(d, fresh) {
  if (!editing) { d.parts = (d.parts || []).concat(fresh); return d; }
  const g = partGroups(d.parts).find((x) => x.members[0].build && x.members[0].build.id === editing);
  if (!g) return null;
  g.members.forEach((m, i) => {
    if (m.joint && controlsOf(m.joint).length && fresh[i] && fresh[i].joint) fresh[i].joint.controls = controlsOf(m.joint);
  });
  const at = d.parts.indexOf(g.members[0]);
  d.parts = d.parts.filter((p) => !g.members.includes(p));
  d.parts.splice(at, 0, ...fresh);
  return d;
}
$('addPart').onclick = () => {
  if (editing) { stopEditing(); return; }
  if (nudge) {   // it goes where the ghost showed it fits
    $('partAngle').value = nudge.where; $('partInside').value = Math.round(nudge.depth * 100); showAngle(); showInside(); nudge = null;
  }
  const d = JSON.parse(JSON.stringify(design));
  previewOn = false;
  if (!applyDesign(withPart(d, makePart(d.body, `p${Date.now() % 100000}_${++partCount}`)))) { previewOn = true; updatePreview(); }
};
// Replace the part being edited with one made from the controls now; keep its id and its wiring
function updateEdited() {
  const d = JSON.parse(JSON.stringify(design));
  const next = withPart(d, makePart(d.body, editing));
  if (!next) { stopEditing(); return; }
  applyDesign(next);
}
function startEditing(b) {
  editing = b.id;
  if (b.content && b.tpl.startsWith('Plastid')) $('partPigment').value = b.content;
  else if (b.content) $('partContent').value = b.content;
  $('partWhat').value = b.tpl; showControls();
  $('partAngle').value = b.where; $('partTilt').value = b.tilt;
  $('partSize').value = Math.round(b.size * 100); $('partInside').value = Math.round(b.depth * 100);
  if (b.feels) $('partFeels').value = b.feels;
  $('partFlip').checked = !!b.flip;
  $('partPull').checked = !!b.pull;
  const lc = (CONTROLS[b.tpl] || {}).length;
  if (lc) $('partLength').value = b.length ?? lc.def;   // parts made before Length had the usual length
  if (b.strength !== undefined) $('partStrength').value = Math.round(b.strength * 100);
  showAngle(); showTilt(); showSize(); showInside(); showLength(); showStrength();
  $('addPart').textContent = '✓ Done editing'; $('cancelEdit').hidden = false;
  previewOn = true;
  listParts(); updatePreview();
}
function stopEditing() {
  editing = null;
  $('addPart').textContent = '＋ Add to body'; $('cancelEdit').hidden = true;
  previewOn = false;
  listParts(); updatePreview();
}
$('cancelEdit').onclick = stopEditing;
// while editing, letting go of a slider (or picking another part type) updates the part at once
for (const id of ['partAngle', 'partTilt', 'partSize', 'partInside', 'partLength', 'partStrength', 'partFeels', 'partFlip', 'partPull']) $(id).onchange = () => { if (editing) updateEdited(); else updatePreview(); };
$('partContent').onchange = () => { showControls(); previewOn = true; if (editing) updateEdited(); else updatePreview(); };
$('partPigment').onchange = $('partContent').onchange;
// while dragging, the ghost follows the slider
for (const id of ['partAngle', 'partTilt', 'partSize', 'partInside', 'partLength', 'partStrength']) $(id).addEventListener('input', () => { previewOn = true; updatePreview(); });

// ----- the ghost: the part as it would be added (or the edited part as it would become), drawn see-through on the
// selected cell before anything is built; red when it would not fit. Nothing is simulated. -----
let previewOn = false;   // armed by picking a part or moving a slider; off after Add or tapping the lit part again
let preview = null;      // { cell: the body with only the new part, built and posed; bad: why it would not fit, or '' }
// The nearest spot where the organelle being placed fits: round the body from where it was asked for, then nearer
// the centre; null if none (a few dozen trial builds, only while it doesn't fit)
let nudge = null;
function findFit(id) {
  const where = Number($('partAngle').value), depth = Number($('partInside').value) / 100;
  for (let k = 0; k <= 18; k++) for (const sign of k ? [1, -1] : [1]) for (let dd = 0; dd <= 5; dd++) {   // down to the centre
    const spot = { where: ((where + sign * k * 10) % 360 + 360) % 360, depth: Math.max(0, Math.round((depth - dd * 0.2) * 100) / 100) };
    try { const d = withPart(JSON.parse(JSON.stringify(design)), makePart(design.body, id, spot)); if (d) { buildCell(d); return spot; } }
    catch (e) { /* not here */ }
  }
  return null;
}
function updatePreview() {
  preview = null;
  if (!previewOn || !design) { $('buildErr').textContent = ''; return; }
  const id = editing || 'ghost';
  let bad = '';
  try { const d = withPart(JSON.parse(JSON.stringify(design)), makePart(design.body, id)); if (d) buildCell(d); }
  catch (e) { bad = e.message; }
  nudge = bad && (CONTROLS[$('partWhat').value] || {}).inside ? findFit(id) : null;
  $('buildErr').textContent = nudge ? `no room there: nudged to ${nudge.where}°, inside ${Math.round(nudge.depth * 100)}% (Add puts it there)`
    : bad && (CONTROLS[$('partWhat').value] || {}).inside && /overlap|sticks out|overfill/.test(bad)
      ? "won't fit: no free spot big enough anywhere inside (try a smaller size)" : bad ? `won't fit: ${bad}` : '';
  if (nudge) bad = '';
  let c;
  try { c = buildCell({ body: design.body, parts: makePart(design.body, id, nudge) }); } catch (e) { return; }
  // as the part starts: springs at their rest, extenders as they start, a burst organ at the start of its stroke
  c.joints.forEach((j, i) => { c.q[3 + i] = j.type === 'extend' ? j.start : j.type === 'motor' ? motorAngle(j, 0) : 0; });
  preview = { cell: c, bad };
}
function drawPreview(X, Y, s) {
  if (!preview || !cell) return;
  const c = preview.cell;
  const drawn = cell.vis ? cell.vis.q : cell.q;   // on the body as it is drawn (calm: beat-averaged)
  c.q[0] = drawn[0]; c.q[1] = drawn[1];
  c.q[2] = drawn[2];
  // beating parts beat as the real part will be drawn: from the start of the stroke, VIS_BEATS strokes a second
  const t = performance.now() / 1000;
  c.joints.forEach((j, i) => { if (j.type === 'motor' && !j.burst) c.q[3 + i] = motorAngle(j, t * VIS_BEATS / j.rate); });
  updatePose(c);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = preview.bad ? COLOR.starving : COLOR.selected;
  ctx.globalAlpha = 0.7; ctx.setLineDash([4, 3]); ctx.lineCap = 'round';
  for (let i = 1; i < c.pieces.length; i++) {
    const p = c.pieces[i], h = p.L / 2;
    ctx.lineWidth = Math.max(2 * p.a * s, 1.5);
    ctx.beginPath();
    ctx.moveTo(X(c.cx[i] - c.cs[i] * h), Y(c.cy[i] - c.sn[i] * h)); ctx.lineTo(X(c.cx[i] + c.cs[i] * h) + 0.01, Y(c.cy[i] + c.sn[i] * h));
    ctx.stroke();
  }
  ctx.lineWidth = 1.5;
  for (const inc of c.pieces[0].inclusions) {
    const [ix, iy] = pieceToWorld(c, 0, inc.x, inc.y);
    incPath(X(ix), Y(iy), inc, s, c.phi[0] + (inc.ang || 0)); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const d of [...c.sensors, ...c.pads]) {
    const [px, py] = pieceToWorld(c, d.piece, d.x, d.y);
    ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max(1.2 * s, 3), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
// ----- colours and names (author, 2026-10-28: "the part we are attributing functions should have a color code"):
// every part a rule drives (flagella, springs) and every sensor gets its own colour, the same on its card, in the tank
// and in the nucleus; and a name you can recognise ("Oar (back-bottom)"), or one you give it. Stored on the part on the
// body: tag (a palette index) and name. -----
const PALETTE = ['#ff9f43', '#4dabf7', '#f783ac', '#ffd43b', '#b197fc', '#3bc9db', '#a9e34b', '#ff6b6b'];
const taggable = (g) => g.category === 'Sensors' || targetsOf(g).length > 0;
// give each such part a colour of its own (a copy or a mirror gets a new one; others lose theirs) and keep given names
// unique (a copy's name is dropped, so it gets its own)
function tagParts(d) {
  const groups = partGroups(d.parts || []), used = new Map(), names = new Set(), want = [];
  for (const g of groups) {
    const r = g.members[0];
    if (r.name) { if (names.has(r.name)) delete r.name; else names.add(r.name); }
    if (!taggable(g)) { delete r.tag; continue; }
    if (r.tag === undefined || used.has(r.tag)) want.push(r); else used.set(r.tag, 1);
  }
  for (const r of want) {   // the least used colour, the first of those
    let best = 0;
    for (let k = 1; k < PALETTE.length; k++) if ((used.get(k) || 0) < (used.get(best) || 0)) best = k;
    r.tag = best; used.set(best, (used.get(best) || 0) + 1);
  }
}
const colourCache = new WeakMap();
// design part index -> its colour, for every piece of a coloured part (computed once per design)
function partColours(d) {
  let m = colourCache.get(d);
  if (m) return m;
  m = new Map();
  for (const g of partGroups(d.parts || [])) {
    const t = g.members[0].tag;
    if (t !== undefined) for (const x of g.members) m.set(d.parts.indexOf(x), PALETTE[t % PALETTE.length]);
  }
  colourCache.set(d, m);
  return m;
}
const colourOf = (g) => (g.members[0].tag !== undefined ? PALETTE[g.members[0].tag % PALETTE.length] : null);
const KIND_NAME = { 'Wave tail (swims)': 'Tail', 'Flexible oar (swims)': 'Oar', 'Stiff flap (goes nowhere)': 'Flap',
  'Burst organ (escape)': 'Spring', 'Spine, protein': 'Spine', 'Spine, glass': 'Glass spine', 'Light sensor (eyespot)': 'Eyespot',
  'Statolith (which way is up)': 'Statolith', 'Touch sensor': 'Touch', 'Proximity sensor': 'Proximity', 'Nutrient sensor': 'Nutrients',
  'Nucleus (the brain)': 'Nucleus', 'Plastid (makes energy)': 'Plastid', 'Kin pad': 'Kin pad', 'Mucus pad': 'Mucus pad' };
const SIDES = ['front', 'front-top', 'top', 'back-top', 'back', 'back-bottom', 'bottom', 'front-bottom'];
// a part's name: the one given, or what it is and where ("Oar (back-bottom)"); the same twice gets a number
function partName(g, all = partGroups(design.parts || [])) {
  const own = (x) => {
    const r = x.members[0], b = r.build;
    if (r.name) return r.name;
    const kind = (b && KIND_NAME[b.tpl]) || r.label || x.name;
    const [px, py] = r.at || [0, 0];
    if (r.material === 'statolith') return `${kind} ${Math.round(r.angle || 0)}°`;   // by the way it faces (author)
    const where = r.type === 'inclusion' && Math.hypot(px, py) < 0.5 ? 'centre' : SIDES[Math.round((((x.deg % 360) + 360) % 360) / 45) % 8];
    return `${kind} (${where})`;
  };
  const name = own(g);
  const same = all.filter((x) => own(x) === name);
  return same.length > 1 ? `${name} ${same.indexOf(all.find((x) => x.members[0] === g.members[0])) + 1}` : name;
}
const BUILT_NAME = { energy: 'Energy', starch: 'Starch', oil: 'Oil', health: 'Plastid health' };
// a sensor (or built-in reading) by id: its name and colour (built-ins have none)
function sensorInfo(id) {
  if (BUILT_NAME[id]) return { name: BUILT_NAME[id], colour: null };
  const all = partGroups(design.parts || []), g = all.find((x) => x.members[0].id === id);
  return g ? { name: partName(g, all), colour: colourOf(g) } : { name: id, colour: null };
}
const dot = (colour) => (colour ? `<i class="dot" style="background:${colour}"></i>` : '');
const sensorTag = (id) => { const s = sensorInfo(id); return `${dot(s.colour)}${ICON[sensorKind(id)]} ${s.name}`; };
// what a reading means, in words: "48% of full sun", "6° down", "30% full"
function meaning(kind, v, id) {
  const pc = `${Math.round(v * 100)}%`;
  if (kind === 'light') return v <= 0.005 ? 'dark' : `${pc} of full sun`;
  if (kind === 'statolith') {
    const a = Math.round(Math.asin(Math.min(1, Math.max(-1, 2 * v - 1))) * 180 / Math.PI);
    return a === 0 ? '0°' : a > 0 ? `+${a}°` : `−${-a}°`;   // its direction: +90° straight up, −90° down (author)
  }
  if (kind === 'energy' || kind === 'starch' || kind === 'oil') return `${pc} full`;
  if (kind === 'health') return `${pc} healthy`;
  if (kind === 'touch') return v >= 0.5 ? 'touching' : 'not touching';
  if (kind === 'near') return v <= 0 ? 'nothing near' : v >= 1 ? 'touching' : `something ${Math.round((1 - v) * nearRange(id))} µm away`;
  if (kind === 'chem') return v < 0.5 ? `poor water (${pc})` : `rich water (${pc})`;
  return v.toFixed(2);
}
const nearRange = (id) => { const p = (design.parts || []).find((x) => x.id === id); return (p && p.range) || PARAMS.sensor.nearRange; };
const UNIT = { light: 'of full sun', energy: 'full', starch: 'full', oil: 'full', health: 'healthy' };
// a condition in words, without the sensor's name: "above 50% of full sun", "pointing lower than 6° down"
function condWords(c, mode = modeOf(c), lo = c.min, hi = c.max) {
  const kind = sensorKind(c.sensor), w = (v) => meaning(kind, v, c.sensor), pc = (v) => `${Math.round(v * 100)}%`;
  if (mode === 'more' || mode === 'less') return `reads ${mode} than ${sensorInfo(c.vs).name}`;
  const not = mode === 'outside' ? 'not ' : '';
  if (UNIT[kind]) {
    if (mode === 'above') return `above ${pc(lo)} ${UNIT[kind]}`;
    if (mode === 'below') return `below ${pc(hi)} ${UNIT[kind]}`;
    return `${not}between ${pc(lo)} and ${pc(hi)} ${UNIT[kind]}`;
  }
  if (kind === 'statolith') {
    if (mode === 'above') return `tilted above ${w(lo)}`;
    if (mode === 'below') return `tilted below ${w(hi)}`;
    return `${not}tilted between ${w(lo)} and ${w(hi)}`;
  }
  if (kind === 'touch') return mode === 'above' ? 'touching' : mode === 'below' ? 'not touching' : `${not}touching`;
  if (kind === 'near') {
    if (mode === 'above') return `something within ${Math.round((1 - lo) * nearRange(c.sensor))} µm`;
    if (mode === 'below') return `nothing within ${Math.round((1 - hi) * nearRange(c.sensor))} µm`;
  }
  return mode === 'above' ? `above ${w(lo)}` : mode === 'below' ? `below ${w(hi)}` : `${not}between ${w(lo)} and ${w(hi)}`;
}
// a part's rule in one sentence: "Runs when ● Eyespot (top) is above 50% of full sun, but stops if ● Statolith …"
function ruleSummary(targets) {
  const m = targets[0], verb = verbOf(m), shape = toShape(rulesOf(m)), runs = verb === 'runs';
  if (!nucleiOf(design).length) return runs ? 'Runs all the time (no nucleus to control it)' : 'Fires only by hand (no nucleus)';
  const one = (c) => `${sensorTag(c.sensor)} <b>${condWords(c)}</b>`;
  let s = shape.groups.length ? `${runs ? 'Runs' : 'Fires'} when ${shape.groups.map((g) => g.map(one).join(' and ')).join('; or when ')}`
    : runs ? 'Runs all the time' : 'Fires only by hand (⚡ Release)';
  if (shape.stops.length) s += `, but ${runs ? 'stops' : 'never fires'} if ${shape.stops.map(one).join(' or ')}`;
  const sp = runs && m.joint.speed;
  if (sp) s += `. Beats faster as ${sensorTag(sp.sensor)} reads ${sp.down ? 'less' : 'more'}`;
  return s + '.';
}

// ----- wiring: which sensors drive a part. A rule is a list of conditions (a sensor and a range of its reading, or
// outside it) in groups: AND inside a group, OR between groups. A target is what one rule drives: every motor of a tail,
// a burst organ or an ejectisome. Rewiring changes the design and the cells already in the tank
// as they are: no reset. -----
const RANGE = { health: [0, 0.7], starch: [0.2, 1], oil: [0.2, 1], light: [0.5, 1], touch: [0.5, 1], near: [0.3, 1], energy: [0.3, 1], statolith: [0.6, 1], chem: [0.5, 1] };   // a sensible start
const SCALE = {   // what the 0-1 reading means
  light: '0 = dark or facing away, 1 = facing up in full light',
  touch: '0 = nothing, 1 = touching',
  near: '0 = nothing in range, 1 = touching',
  energy: '0 = out of energy (starving), 1 = full',
  starch: '0 = its starch is used up, 1 = full',
  oil: '0 = its oil is used up, 1 = full',
  health: '0 = its plastids wrecked by too much light, 1 = unharmed',
  statolith: 'the way it faces: 0 = straight down (−90°), 0.5 = level (0°), 1 = straight up (+90°)',
  chem: '0 = poor water (near the surface), 1 = rich (deep)',
};
const ENDS = { health: ['wrecked', 'unharmed'], light: ['dark', 'bright'], touch: ['nothing', 'touching'], near: ['nothing near', 'touching'], energy: ['starving', 'full'], starch: ['used up', 'full'], oil: ['used up', 'full'],
  statolith: ['−90° (down)', '+90° (up)'], chem: ['poor water', 'rich water'] };
const ICON = { health: '🌿', starch: '🍚', oil: '🫒', light: '👁', touch: '✋', near: '📡', energy: '⚡', statolith: '⚖', chem: '🧪' };
// what a sensor id is: 'energy' (built in), or the kind of the design part with that id
function sensorKind(id) {
  if (id === 'energy' || id === 'starch' || id === 'oil' || id === 'health') return id;
  const p = (design.parts || []).find((x) => x.id === id) || {};
  return p.material === 'statolith' ? 'statolith' : p.kind || 'light';
}
// the sensors a rule can read: every sensor part (but `except`), then the energy level
function sensorList(except) {
  const list = [];
  const all = partGroups(design.parts || []);
  for (const x of all.filter((g) => g.category === 'Sensors' && g.members[0].id !== except)) {
    const id = x.members[0].id, name = partName(x, all);
    list.push({ id, name, short: name, deg: x.deg, kind: sensorKind(id), colour: colourOf(x) });
  }
  list.push({ id: 'energy', name: 'its energy level (built in)', short: 'Energy level', kind: 'energy' });
  for (const k of ['starch', 'oil']) if ((design.parts || []).some((p) => p.type === 'inclusion' && p.material === k))
    list.push({ id: k, name: `its ${k} level (how full its ${k} is)`, short: `${k[0].toUpperCase() + k.slice(1)} level`, kind: k });
  if ((design.parts || []).some((p) => p.type === 'inclusion' && p.material === 'plastid'))
    list.push({ id: 'health', name: 'its plastid health (hurt by too much light)', short: 'Plastid health', kind: 'health' });
  return list;
}
const targetsOf = (g) => g.members.filter((m) => m.joint && (m.joint.type === 'motor' || m.joint.latched));
// how a target acts: 'runs' (a motor), 'fires' (a burst organ, a latched part)
const verbOf = (m) => (m.joint.type === 'motor' && !m.joint.burst ? 'runs' : 'fires');
// A part's rule as the card shows it: GO groups (all of a group must hold: AND; any group will do: OR) and STOP
// conditions (any one stops the part, whatever the GO groups say: the override). Stored as one list: GO conditions in
// their groups (or: true starts a group), then STOP ones (stop: true).
function rulesOf(m) {
  const raw = controlsOf(m.joint);
  let any = false;
  return raw.map((c) => {
    const r = { sensor: c.sensor, min: c.when === 'light' ? 0.5 : c.min ?? 0, max: c.when === 'dark' ? 0.5 : c.max ?? 1,
      ...(c.vs !== undefined ? { vs: c.vs } : {}), not: !!c.not, or: false, stop: !!c.stop };
    if (!r.stop) { r.or = any && !!c.or; any = true; }
    return r;
  });
}
// The rule as { groups: [[condition...]...], stops: [condition...] } (copies, each with k: its place in the list), and back
function toShape(rules) {
  const groups = [], stops = [];
  rules.forEach((c, k) => {
    const x = { ...c, k };
    if (c.stop) stops.push(x); else { if (!groups.length || c.or) groups.push([]); groups[groups.length - 1].push(x); }
  });
  return { groups, stops };
}
function fromShape(shape) {
  const out = [];
  for (const g of shape.groups) g.forEach((c, i) => out.push({ ...c, or: i === 0 && out.length > 0, stop: false }));
  for (const c of shape.stops) out.push({ ...c, or: false, stop: true });
  return out;
}
function setRules(targets, next) {
  if (next.some((c) => c.vs === undefined && !(c.min <= c.max))) { $('buildErr').textContent = 'a range must run from low to high'; return false; }
  // only true marks are stored, and the first GO condition never starts a new group
  const clean = next.map((c) => ({ sensor: c.sensor, ...(c.vs !== undefined ? { vs: c.vs } : { min: c.min, max: c.max }),
    ...(c.not ? { not: true } : {}), ...(c.or && !c.stop ? { or: true } : {}), ...(c.stop ? { stop: true } : {}) }));
  if (!brainFits(targets, (j) => { if (clean.length) j.controls = clean; else delete j.controls; })) return false;
  $('buildErr').textContent = '';
  remember(design);
  for (const m of targets) {
    const k = design.parts.indexOf(m);
    delete m.joint.control;
    if (clean.length) m.joint.controls = clean.map((c) => ({ ...c })); else delete m.joint.controls;
    for (const c of world.cells) if (c.design === design) rewire(c, k, clean);
  }
  $('json').value = JSON.stringify(design, null, 2);
  listParts();
  return true;
}
// Would the nucleus still hold every module with this change to the targets' joints? If not, say so and refuse
function brainFits(targets, change) {
  const trial = JSON.parse(JSON.stringify(design));
  for (const m of targets) { const j = trial.parts[design.parts.indexOf(m)].joint; delete j.control; change(j); }
  const full = !nucleiOf(design).length ? 'this cell has no nucleus: add one (Inside the cell) to wire it' : brainProblem(trial);
  if (!full) return true;
  $('buildErr').textContent = full;
  if (patchOpen) { drawPatch(); $('patchHint').textContent = `🧬 ${full}`; }
  return false;
}
const freshRule = (id) => ({ sensor: id, min: RANGE[sensorKind(id)][0], max: RANGE[sensorKind(id)][1], not: false });

// ----- a condition: a sensor, and how its reading must be: above / below / between / outside a value, or more / less
// than another sensor's reading -----
const MODES = { above: 'above', below: 'below', between: 'between', outside: 'outside', more: 'more than…', less: 'less than…' };
function modeOf(c) {
  if (c.vs !== undefined) return c.not ? 'less' : 'more';
  if (c.not) return 'outside';
  if (c.max >= 1 && c.min > 0) return 'above';
  if (c.min <= 0 && c.max < 1) return 'below';
  return c.min <= 0 && c.max >= 1 ? 'above' : 'between';
}
const r2 = (v) => Math.round(v * 100) / 100;
function withMode(c, mode, sensors) {
  const { vs, ...base } = c, m = modeOf(c);
  const lo = m === 'below' ? r2(c.max / 2) : c.min > 0 && c.min < 1 ? c.min : 0.5, hi = c.max > 0 && c.max < 1 ? c.max : 0.5;
  if (mode === 'above') return { ...base, min: lo, max: 1, not: false };
  if (mode === 'below') return { ...base, min: 0, max: hi, not: false };
  if (mode === 'between' || mode === 'outside') {
    const a = Math.min(lo, hi), b = Math.max(lo, hi) > a ? Math.max(lo, hi) : Math.min(1, a + 0.3);
    return { ...base, min: a, max: b, not: mode === 'outside' };
  }
  const other = vs ?? (sensors.find((s) => s.id !== c.sensor) || sensors[0]).id;
  return { ...base, vs: other, not: mode === 'less', min: 0, max: 1 };
}
// a condition in a few characters, for cable labels
function condText(c) {
  const m = modeOf(c), f = (v) => r2(v).toString();
  if (m === 'more' || m === 'less') return `${m === 'more' ? '>' : '<'} ${ICON[sensorKind(c.vs)]} ${sensorInfo(c.vs).name}`;
  return m === 'above' ? `> ${f(c.min)}` : m === 'below' ? `< ${f(c.max)}` : `${m === 'outside' ? 'not ' : ''}${f(c.min)}–${f(c.max)}`;
}
// One condition line: sensor, how, value(s); `live` = "part index:condition index" (for the green / red light)
function condLine(c, sensors, live, onSet, onRemove) {
  const kind = sensorKind(c.sensor), mode = modeOf(c);
  const line = document.createElement('div');
  line.className = 'cond' + (c.stop ? ' stopcond' : '');
  line.dataset.livecond = live;
  const top = document.createElement('div'); top.className = 'condhead';
  const sel = document.createElement('select');
  for (const s of sensors) sel.add(new Option(`${ICON[s.kind]} ${s.name}`, s.id));
  sel.value = c.sensor;
  sel.onchange = () => onSet(mode === 'more' || mode === 'less' ? { ...c, sensor: sel.value } : { ...c, ...freshRule(sel.value), not: c.not && mode === 'outside' });
  const how = document.createElement('select');
  how.className = 'howsel';
  for (const [k, label] of Object.entries(MODES)) if (sensors.length > 1 || (k !== 'more' && k !== 'less')) how.add(new Option(label, k));
  how.value = mode;
  how.title = 'above / below a value, between or outside two, or more / less than another sensor';
  how.onchange = () => onSet(withMode(c, how.value, sensors));
  const del = document.createElement('button');
  del.textContent = '✕'; del.title = 'Remove this condition';
  del.onclick = onRemove;
  top.append(sel, how, del);
  line.appendChild(top);
  if (mode === 'more' || mode === 'less') {
    const vs = document.createElement('select');
    for (const s of sensors) if (s.id !== c.sensor) vs.add(new Option(`than ${ICON[s.kind]} ${s.name}`, s.id));
    vs.value = c.vs;
    vs.onchange = () => onSet({ ...c, vs: vs.value });
    const row = document.createElement('div'); row.className = 'condhead'; row.appendChild(vs);
    const now = document.createElement('div'); now.className = 'rlabel';
    now.innerHTML = `now <b data-live="${c.sensor}">–</b> vs <b data-live="${c.vs}">–</b>`;
    line.append(row, now);
  } else line.appendChild(valueBar(c, mode, kind, (lo, hi) => onSet({ ...c, min: lo, max: hi })));
  return line;
}
// The value(s) of a condition: one slider for above / below, two for between / outside; the ends of the scale named;
// the orange tick is the reading now
function valueBar(c, mode, kind, onSet) {
  const one = mode === 'above' || mode === 'below';
  const box = document.createElement('div');
  box.className = 'range';
  box.title = SCALE[kind];
  const v0 = mode === 'below' ? c.max : c.min, v1 = c.max;
  box.innerHTML = `<div class="rlabel"><b class="lohi"></b> <span class="mean"></span> · now <b data-live="${c.sensor}" data-mean="${kind}">–</b></div>
    <div class="dual"><div class="track${mode === 'outside' ? ' out' : ''}"><div class="band"></div><div class="now" data-livebar="${c.sensor}"></div></div>
      <input type="range" min="0" max="1" step="0.05" value="${v0}">${one ? '' : `<input type="range" min="0" max="1" step="0.05" value="${v1}">`}</div>
    <div class="rends"><span>${ENDS[kind][0]}</span><span>${ENDS[kind][1]}</span></div>`;
  const [a, b] = box.querySelectorAll('input');
  const band = box.querySelector('.band'), lohi = box.querySelector('.lohi'), mean = box.querySelector('.mean');
  const show = () => {
    const x = Number(a.value), y = b ? Number(b.value) : 0;
    const from = mode === 'above' ? x : mode === 'below' ? 0 : x, to = mode === 'above' ? 1 : mode === 'below' ? x : y;
    band.style.left = `${from * 100}%`; band.style.width = `${(to - from) * 100}%`;
    lohi.textContent = mode === 'above' ? `above ${x.toFixed(2)}` : mode === 'below' ? `below ${x.toFixed(2)}`
      : `${mode === 'outside' ? 'outside' : 'between'} ${x.toFixed(2)} and ${y.toFixed(2)}`;
    mean.textContent = `= ${condWords(c, mode, mode === 'below' ? 0 : x, mode === 'below' ? x : mode === 'above' ? 1 : y)}`;   // the same in words
  };
  a.oninput = () => { if (b && Number(a.value) > Number(b.value)) a.value = b.value; show(); };
  if (b) b.oninput = () => { if (Number(b.value) < Number(a.value)) b.value = a.value; show(); };
  const set = () => {
    const x = Number(a.value);
    if (mode === 'above') onSet(x, 1); else if (mode === 'below') onSet(0, x); else onSet(x, Number(b.value));
  };
  a.onchange = set; if (b) b.onchange = set;
  show();
  return box;
}

// ----- the rule card: one per part, the same in the parts list and in the wiring view -----
const HEADS = {
  runs: ['GO when', 'OR GO when', 'STOP if', 'runs always (add a condition to control it)'],
  fires: ['FIRE when', 'OR FIRE when', "DON'T FIRE if", 'fires by hand (Release), or add a condition'],
};
function ruleCard(targets) {
  const m = targets[0], verb = verbOf(m), H = HEADS[verb], k0 = design.parts.indexOf(m);
  const sensors = sensorList();
  const shape = toShape(rulesOf(m));
  const write = (s) => setRules(targets, fromShape(s));
  const copy = () => ({ groups: shape.groups.map((g) => g.map((c) => ({ ...c }))), stops: shape.stops.map((c) => ({ ...c })) });
  const card = document.createElement('div');
  card.className = 'wire rcard';
  const head = (text, cls = '') => { const h = document.createElement('div'); h.className = `rhead ${cls}`; h.textContent = text; card.appendChild(h); };
  const button = (text, title, onclick) => { const b = document.createElement('button'); b.className = 'addcond'; b.textContent = text; b.title = title; b.onclick = onclick; card.appendChild(b); };
  if (!nucleiOf(design).length) {   // no brain: nothing to wire with
    head(`${H[3].split(' (')[0]}: no nucleus. Add a 🧬 Nucleus (Inside the cell) to wire it`, 'dim');
    return card;
  }
  if (!shape.groups.length && !shape.stops.length) head(H[3], 'dim');
  shape.groups.forEach((g, gi) => {
    head(gi ? H[1] : H[0]);
    g.forEach((c, ci) => card.appendChild(condLine(c, sensors, `${k0}:${c.k}`,
      (nc) => { const s = copy(); s.groups[gi][ci] = nc; write(s); },
      () => { const s = copy(); s.groups[gi].splice(ci, 1); if (!s.groups[gi].length) s.groups.splice(gi, 1); write(s); })));
    button('＋ and…', 'Another condition in this group: all of them must hold', () => { const s = copy(); s.groups[gi].push(freshRule(sensors[0].id)); write(s); });
  });
  button(shape.groups.length ? `＋ ${H[1].toLowerCase()}…` : `＋ ${H[0].toLowerCase()}…`,
    shape.groups.length ? 'Another group: it also goes when all of this one hold' : 'A condition that makes it go',
    () => { const s = copy(); s.groups.push([freshRule(sensors[0].id)]); write(s); });
  if (shape.stops.length) {
    head(`${H[2]} (beats everything above)`, 'stop');
    shape.stops.forEach((c, ci) => card.appendChild(condLine(c, sensors, `${k0}:${c.k}`,
      (nc) => { const s = copy(); s.stops[ci] = nc; write(s); },
      () => { const s = copy(); s.stops.splice(ci, 1); write(s); })));
  }
  button(`＋ ${H[2].toLowerCase()}…`, 'An override: whenever this holds, it stops, whatever the conditions above say',
    () => { const s = copy(); s.stops.push(freshRule(sensors[0].id)); write(s); });
  if (verb === 'runs') card.appendChild(speedRow(targets, sensors));
  // copy this rule, to paste into another part and adjust (author, 2026-10-28)
  const key = partKey(m), here = ruleClip && ruleClip.key !== key && ruleClip.verb === verb;
  const tools = document.createElement('div'); tools.className = 'rtools';
  const cp = document.createElement('button');
  cp.textContent = ruleClip && ruleClip.key === key ? '✓ Rule copied' : '⧉ Copy rule';
  cp.title = 'Copy this rule (with its STOP conditions and beat speed), to paste into another part';
  cp.onclick = () => { ruleClip = { key, verb, name: partName(groupOfPart(m)), colour: colourOf(groupOfPart(m)), rules: rulesOf(m), speed: m.joint.speed ? { ...m.joint.speed } : null }; listParts(); };
  tools.appendChild(cp);
  if (here) {
    const ps = document.createElement('button');
    ps.innerHTML = `📋 Paste rule from ${dot(ruleClip.colour)}${ruleClip.name}`;
    ps.title = 'Replace this rule with a copy of the copied one; then adjust it';
    ps.onclick = () => { if (setRules(targets, ruleClip.rules.map((c) => ({ ...c }))) && verb === 'runs') setSpeed(targets, ruleClip.speed); };
    tools.appendChild(ps);
  }
  card.appendChild(tools);
  return card;
}
let ruleClip = null;   // the copied rule: { key, verb, name, colour, rules, speed }
const partKey = (m) => (m.build && m.build.id) || m.id || `#${design.parts.indexOf(m)}`;
const groupOfPart = (m) => partGroups(design.parts || []).find((g) => g.members.includes(m));
// once a frame: each condition line green while it holds (red for a STOP line that is stopping the part), for the
// selected cell if it is this design
function ruleLive() {
  const live = cell && cell.design === design ? cell : null;
  for (const el of document.querySelectorAll('[data-livecond]')) {
    const [k, i] = el.dataset.livecond.split(':').map(Number);
    let ctl = null;
    if (live) {
      const j = live.joints.find((x) => x.part === k);
      ctl = (j && j.controls ? j.controls : [])[i] || null;
    }
    const ok = !!ctl && ctl.holds !== null && ctl.holds !== ctl.not;
    el.classList.toggle('holds', ok && !ctl.stop);
    el.classList.toggle('stopping', ok && !!ctl.stop);
  }
}

// ----- beat speed: always full, or following a reading (up: stopped at the low end, full at the high end; down: the
// other way round) -----
function setSpeed(targets, speed) {
  if (!brainFits(targets, (j) => { if (speed) j.speed = { ...speed }; else delete j.speed; })) { listParts(); return; }
  remember(design);
  for (const m of targets) {
    if (speed) m.joint.speed = { ...speed }; else delete m.joint.speed;
    const k = design.parts.indexOf(m);
    for (const c of world.cells) if (c.design === design) respeed(c, k, speed);
  }
  $('json').value = JSON.stringify(design, null, 2);
  listParts();
}
function speedRow(targets, sensors) {
  const sp = targets[0].joint.speed;
  const box = document.createElement('div');
  box.className = 'cond';
  const h = document.createElement('div'); h.className = 'rhead'; h.textContent = 'BEAT SPEED';
  const top = document.createElement('div'); top.className = 'condhead';
  const sel = document.createElement('select');
  sel.add(new Option('always full', ''));
  for (const s of sensors) sel.add(new Option(`follows ${ICON[s.kind]} ${s.name}`, s.id));
  sel.value = sp ? sp.sensor : '';
  sel.title = 'Gradual control: the beat slows and quickens with a reading, instead of only switching on and off';
  sel.onchange = () => setSpeed(targets, sel.value ? { sensor: sel.value, min: 0, max: 1, ...(sp && sp.down ? { down: true } : {}) } : null);
  top.appendChild(sel);
  if (sp) {
    const dir = document.createElement('select');
    dir.add(new Option('faster as it reads more', 'up')); dir.add(new Option('faster as it reads less', 'down'));
    dir.value = sp.down ? 'down' : 'up';
    dir.onchange = () => setSpeed(targets, { ...sp, down: dir.value === 'down' });
    top.appendChild(dir);
  }
  box.append(h, top);
  if (sp) {
    const kind = sensorKind(sp.sensor);
    const bar = valueBar({ sensor: sp.sensor, min: sp.min, max: sp.max }, 'between', kind,
      (lo, hi) => (lo < hi ? setSpeed(targets, { ...sp, min: lo, max: hi }) : listParts()));
    bar.querySelector('.lohi').textContent = sp.down ? `full at ${sp.min.toFixed(2)}, stopped at ${sp.max.toFixed(2)}`
      : `stopped at ${sp.min.toFixed(2)}, full at ${sp.max.toFixed(2)}`;
    box.appendChild(bar);
  }
  return box;
}

// A living cell's reading of a sensor ('energy', 'starch', 'oil', 'health' or an id), as { value }; undefined if there is none
function liveReading(c, id) {
  if (id === 'energy') return { value: energyLevel(world, c) };
  if (id === 'starch' || id === 'oil') return { value: storeLevel(c, id) };
  if (id === 'health') return { value: plastidHealth(world, c) };
  return c.sensors.find((x) => x.id === id);
}

// The list under a part: its rule card
function wiring(g, targets) { return ruleCard(targets); }

// ----- the wiring view: the same rules as a modular synth. Sensors (live readings) on the left, parts on the right;
// between them each part's GO boxes (all cables into a box must hold: AND; any box will do: OR) and its STOP box (red:
// any cable into it stops the part). Tap a sensor, then a box (or a part: a new GO box); tap a part or a cable's label
// to open the part's rule card underneath. -----
let patchOpen = false;
let patchPick = null;   // the sensor id picked, waiting for where to patch it
let patchEdit = null;   // { t: target index } whose rule card is open underneath
let patchTargets = [];  // [{ name, members, verb, rules }] as drawn
let patchRoom = null;   // { used, slots } of the nucleus as drawn
const PATCH_HINT = 'tap a sensor, then a box (GO, or the red STOP) · tap a part or a cable to edit its rule';
$('patchBtn').onclick = () => { patchOpen = true; $('patch').hidden = false; patchPick = null; patchEdit = null; drawPatch(); };
$('patchClose').onclick = () => { patchOpen = false; $('patch').hidden = true; };
function drawPatch() {
  if (!patchOpen) return;
  const cols = $('patchCols'), tray = $('patchTray');
  cols.innerHTML = ''; tray.innerHTML = '';
  const nuc = nucleiOf(design)[0];
  if (!nuc) {
    $('patchHint').textContent = '';
    cols.innerHTML = '<div class="pval nonuc">This cell has no nucleus, so no brain: every part runs all the time. Add a 🧬 Nucleus (Inside the cell) to wire it.</div>';
    patchTargets = []; patchRoom = null; layoutWires(); showPatchEdit(); return;
  }
  // the box: the nucleus opened up, one slot a module (sensors, wired built-in readings, rule boxes); modules arrange
  // themselves for now (dragging them in by hand comes later)
  const use = brainUse(design), slots = slotsOf(nuc.radius);
  patchRoom = { used: use.total, slots };
  $('patchHint').textContent = patchPick ? `now tap a GO box, the red STOP box, or a part, to patch ${ICON[sensorKind(patchPick)]} into` : PATCH_HINT;
  const inBrain = (s) => !BUILT_INS.includes(s.id) || use.builtins.includes(s.id);
  const all = sensorList(), spare = all.filter((s) => !inBrain(s));
  if (spare.length) {   // built-in readings not wired yet: outside the box until patched in
    const lab = document.createElement('span'); lab.className = 'pval'; lab.textContent = 'available:';
    tray.appendChild(lab);
    for (const s of spare) {
      const m = document.createElement('div');
      m.className = 'pmod spare' + (patchPick === s.id ? ' picked' : ''); m.title = `${SCALE[s.kind]} (patched in, it takes a slot)`;
      m.innerHTML = `<span class="pname">${ICON[s.kind]} ${s.short}</span>`;
      m.onclick = (e) => { e.stopPropagation(); patchPick = patchPick === s.id ? null : s.id; drawPatch(); };
      tray.appendChild(m);
    }
  }
  const src = document.createElement('div'); src.className = 'pcol src';
  for (const s of all.filter(inBrain)) {
    const m = document.createElement('div');
    m.className = 'pmod srcmod' + (patchPick === s.id ? ' picked' : ''); m.dataset.src = s.id;
    m.title = SCALE[s.kind];
    if (s.colour) m.style.borderLeft = `4px solid ${s.colour}`;
    m.innerHTML = `<div class="pname">${ICON[s.kind]} ${s.short}</div>
      <div class="pval">reads <b data-live="${s.id}">–</b></div><div class="pbar"><i data-patchbar="${s.id}"></i></div>`;
    m.onclick = (e) => { e.stopPropagation(); patchPick = patchPick === s.id ? null : s.id; drawPatch(); };
    src.appendChild(m);
  }
  const free = Math.max(0, slots - use.total);
  for (let i = 0; i < Math.min(free, 6); i++) {
    const f = document.createElement('div'); f.className = 'pfree';
    f.textContent = i === 5 && free > 6 ? `+${free - 5} free slots` : 'free slot';
    src.appendChild(f);
  }
  if (!free) { const f = document.createElement('div'); f.className = 'pfree full'; f.textContent = 'full: every slot used'; src.appendChild(f); }
  const rules = document.createElement('div'); rules.className = 'prules';
  patchTargets = partGroups(design.parts || []).map((g) => ({ g, members: targetsOf(g) })).filter((t) => t.members.length)
    .map((t) => ({ name: partName(t.g), members: t.members, verb: verbOf(t.members[0]), rules: rulesOf(t.members[0]), icon: dot(colourOf(t.g)) }));
  if (!patchTargets.length) rules.innerHTML = '<div class="pval">No parts to wire yet: add a flagellum or a spring.</div>';
  patchTargets.forEach((t, ti) => {
    const H = HEADS[t.verb], shape = toShape(t.rules);
    const row = document.createElement('div'); row.className = 'prow';
    const boxes = document.createElement('div'); boxes.className = 'pboxes';
    const box = (key, text, cls, title) => {
      const b = document.createElement('div');
      b.className = `pmod box ${cls}`; b.dataset.box = `${ti}:${key}`; b.textContent = text; b.title = title;
      b.onclick = (e) => { e.stopPropagation(); patchInto(ti, key); };
      boxes.appendChild(b);
    };
    shape.groups.forEach((g, gi) => box(gi, gi ? H[1] : H[0], '', 'all cables into this box must hold (AND); any GO box will do (OR)'));
    box('new', shape.groups.length ? '＋ or' : `＋ ${H[0].toLowerCase()}`, 'add', 'tap a sensor, then here: a new GO box');
    box('stop', shape.stops.length ? H[2] : `＋ ${H[2].toLowerCase()}`, `stopbox${shape.stops.length ? '' : ' add'}`,
      'any cable into the STOP box stops the part, whatever the GO boxes say');
    const tg = document.createElement('div');
    tg.className = 'pmod tgt' + (patchEdit && patchEdit.t === ti ? ' picked' : ''); tg.dataset.tgt = ti;
    tg.innerHTML = `<span class="pstate" data-pstate="${ti}"></span><div class="pname">${t.icon} ${t.name}</div>
      <div class="pval">${!t.rules.length ? H[3].split(' (')[0] : 'tap to edit its rule'}${speedText(t.members[0])}</div>`;
    tg.onclick = (e) => { e.stopPropagation(); if (patchPick) patchInto(ti, 'new'); else { patchEdit = patchEdit && patchEdit.t === ti ? null : { t: ti }; drawPatch(); } };
    row.append(boxes, tg);
    rules.appendChild(row);
  });
  cols.append(src, rules);
  layoutWires();
  showPatchEdit();
}
// a target's speed rule, as a line
function speedText(m) {
  const sp = m.joint && m.joint.speed;
  if (!sp) return '';
  const s = sensorList().find((x) => x.id === sp.sensor);
  return `<br>speed follows ${s ? `${ICON[s.kind]} ${s.short}` : sp.sensor} (${sp.down ? 'faster as it reads less' : 'faster as it reads more'})`;
}
// patch the picked sensor into target ti: a GO box (its index), a new GO box ('new') or the STOP box ('stop')
function patchInto(ti, key) {
  const t = patchTargets[ti];
  if (!patchPick) {   // a box tapped on its own: open the rule card, say what the box is
    patchEdit = { t: ti };
    drawPatch();
    $('patchHint').textContent = key === 'stop' ? 'the STOP box: any cable into it stops the part, whatever the GO boxes say. Tap a sensor, then this box, to add one.'
      : key === 'new' ? 'tap a sensor first, then here: a new GO box (the part also goes when all of it holds: OR)'
        : 'a GO box: the part goes when ALL its cables hold (AND). Tap a sensor, then this box, to add one.';
    return;
  }
  const shape = toShape(t.rules), fresh = freshRule(patchPick);
  if (key === 'stop') shape.stops.push(fresh);
  else if (key === 'new' || key >= shape.groups.length) shape.groups.push([fresh]);
  else shape.groups[key].push(fresh);
  patchPick = null;
  patchEdit = { t: ti };
  setRules(t.members, fromShape(shape));
}
// the cables, their labels, and each box's line to its part, drawn over the laid-out modules
function layoutWires() {
  const area = $('patchArea'), svg = $('patchWires');
  for (const el of area.querySelectorAll('.pchip')) el.remove();
  svg.innerHTML = '';
  const base = area.getBoundingClientRect();
  const at = (el, side) => { const r = el.getBoundingClientRect(); return [(side ? r.right : r.left) - base.left, r.top + r.height / 2 - base.top]; };
  const path = (a, b, key, cls = '') => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx = Math.max(30, (b[0] - a[0]) / 2);
    p.setAttribute('d', `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`);
    p.dataset.key = key; if (cls) p.setAttribute('class', cls);
    svg.appendChild(p);
  };
  patchTargets.forEach((t, ti) => {
    const tg = area.querySelector(`[data-tgt="${ti}"]`), shape = toShape(t.rules);
    const cable = (c, box, stop) => {
      const s = area.querySelector(`[data-src="${c.sensor}"]`);
      if (!s) return;
      const a = at(s, true), b = at(box, false);
      path(a, b, `c${ti}:${c.k}`, stop ? 'stopc' : '');
      const other = c.vs !== undefined && area.querySelector(`[data-src="${c.vs}"]`);
      if (other) path(at(other, true), b, `v${ti}:${c.k}`, stop ? 'stopc' : '');   // the second sensor of a compare
      const chip = document.createElement('div');
      chip.className = 'pchip' + (stop ? ' stopchip' : ''); chip.dataset.chip = `${ti}:${c.k}`;
      chip.textContent = condText(c);
      chip.style.left = `${a[0] + (b[0] - a[0]) * 0.55}px`; chip.dataset.y = a[1] + (b[1] - a[1]) * 0.55;
      chip.onclick = (e) => { e.stopPropagation(); patchEdit = { t: ti }; patchPick = null; drawPatch(); };
      area.appendChild(chip);
    };
    shape.groups.forEach((g, gi) => {
      const box = area.querySelector(`[data-box="${ti}:${gi}"]`);
      path(at(box, true), at(tg, false), `b${ti}:${gi}`);
      for (const c of g) cable(c, box, false);
    });
    if (shape.stops.length) {
      const box = area.querySelector(`[data-box="${ti}:stop"]`);
      path(at(box, true), at(tg, false), `b${ti}:stop`, 'stopc');
      for (const c of shape.stops) cable(c, box, true);
    }
  });
  // labels meet where cables converge: keep them at least a label's height apart, in cable order
  // the nucleus: a box round its modules and rule boxes (the parts it drives sit outside, in the cell)
  const inner = [...area.querySelectorAll('.srcmod, .pfree, .pmod.box')].map((el) => el.getBoundingClientRect());
  if (inner.length && patchRoom) {
    const l = Math.min(...inner.map((r) => r.left)) - base.left - 8, t = Math.min(...inner.map((r) => r.top)) - base.top - 22;
    const rr = Math.max(...inner.map((r) => r.right)) - base.left + 10, b = Math.max(...inner.map((r) => r.bottom)) - base.top + 8;
    const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x: l, y: t, width: rr - l, height: b - t, rx: 10, class: 'nucbox' }).forEach(([k, v]) => box.setAttribute(k, v));
    svg.prepend(box);
    const lab = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    Object.entries({ x: l + 10, y: t + 15, class: 'nuclab' }).forEach(([k, v]) => lab.setAttribute(k, v));
    lab.textContent = `🧬 NUCLEUS · ${patchRoom.used} of ${patchRoom.slots} slots`;
    svg.appendChild(lab);
  }
  const chips = [...area.querySelectorAll('.pchip')].sort((p, q) => p.dataset.y - q.dataset.y);
  let last = -Infinity;
  for (const c of chips) { const y = Math.max(Number(c.dataset.y), last + 18); c.style.top = `${y}px`; last = y; }
  svg.setAttribute('height', area.scrollHeight);
}
// under the patch: the open part's rule card
function showPatchEdit() {
  const box = $('patchEdit');
  const t = patchEdit && patchTargets[patchEdit.t];
  if (!t) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false; box.innerHTML = '';
  const head = document.createElement('div'); head.className = 'row';
  const title = document.createElement('b'); title.textContent = `${t.icon} ${t.name}`;
  const done = document.createElement('button'); done.textContent = 'Done';
  done.onclick = () => { patchEdit = null; drawPatch(); };
  head.append(title, done);
  box.append(head, ruleCard(t.members));
}
$('patchBody').onclick = () => { if (patchPick || patchEdit) { patchPick = null; patchEdit = null; drawPatch(); } };
window.addEventListener('resize', () => { if (patchOpen) layoutWires(); });
// once a frame while open: cables, boxes and parts lit by what the selected cell (if it is this design) is doing
function patchLive() {
  if (!patchOpen) return;
  const area = $('patchArea'), live = cell && cell.design === design ? cell : null;
  for (const el of area.querySelectorAll('[data-patchbar]')) {
    const sn = live && liveReading(live, el.dataset.patchbar);
    el.style.width = sn ? `${Math.min(Math.max(sn.value, 0), 1) * 100}%` : '0';
  }
  patchTargets.forEach((t, ti) => {
    const k0 = design.parts.indexOf(t.members[0]);
    let ctls = null, state = '', on = false;
    if (live) {
      const j = live.joints.find((x) => x.part === k0);
      if (j) {
        ctls = j.controls || null;
        if (j.burst) { on = j.burst.state === 'firing'; state = j.burst.state; }
        else if (j.type === 'motor') { on = j.on && !(world.metab && live.metab.starving); state = on ? 'ON' : 'OFF'; }
        else { on = !j.latched; state = j.latched ? 'cocked' : 'released'; }
      }
    }
    const st = area.querySelector(`[data-pstate="${ti}"]`); if (st) st.textContent = state;
    const tg = area.querySelector(`[data-tgt="${ti}"]`); if (tg) tg.classList.toggle('lit', on);
    const okAt = (k) => { const ctl = ctls && ctls[k]; return !!ctl && ctl.holds !== null && ctl.holds !== ctl.not; };
    const shape = toShape(t.rules);
    const light = (k, ok) => {
      for (const key of [`c${ti}:${k}`, `v${ti}:${k}`]) { const p = area.querySelector(`path[data-key="${key}"]`); if (p) p.classList.toggle('lit', ok); }
      const ch = area.querySelector(`[data-chip="${ti}:${k}"]`); if (ch) ch.classList.toggle('lit', ok);
    };
    shape.groups.forEach((g, gi) => {
      let all = !!ctls;
      for (const c of g) { const ok = okAt(c.k); if (!ok) all = false; light(c.k, ok); }
      const b = area.querySelector(`[data-box="${ti}:${gi}"]`); if (b) b.classList.toggle('lit', all);
      const p = area.querySelector(`path[data-key="b${ti}:${gi}"]`); if (p) p.classList.toggle('lit', all);
    });
    let stopping = false;
    for (const c of shape.stops) { const ok = okAt(c.k); if (ok) stopping = true; light(c.k, ok); }
    const sb = area.querySelector(`[data-box="${ti}:stop"]`); if (sb) sb.classList.toggle('lit', stopping);
    const sp = area.querySelector(`path[data-key="b${ti}:stop"]`); if (sp) sp.classList.toggle('lit', stopping);
  });
}


// Unplug every cable from the sensors in `ids` (being removed): from the remaining parts' rules and speed settings, so
// the design still builds
function unplug(d, ids) {
  const keep = (c) => !ids.has(c.sensor) && !ids.has(c.vs);
  const tidy = (list) => list.filter(keep).map((c, i) => (i === 0 && c.or ? (({ or, ...rest }) => rest)(c) : c));
  for (const p of d.parts) {
    if (p.joint) {
      const cs = tidy(controlsOf(p.joint));
      delete p.joint.control;
      if (cs.length) p.joint.controls = cs; else delete p.joint.controls;
      if (p.joint.speed && ids.has(p.joint.speed.sensor)) delete p.joint.speed;
    }
  }
}

const openCards = new Set();   // the parts whose rule cards are open (by partKey); the rest fold to a sentence
let glow = null;               // { parts: design part indices, until } lit up in the tank a moment
function listParts() {
  showBody();
  // one nucleus a cell: its button hides while the cell has one
  const nucChip = document.querySelector('#chips button[data-v="Nucleus (the brain)"]');
  if (nucChip) nucChip.style.display = nucleiOf(design).length && !editing ? 'none' : '';
  const box = $('partList');
  box.innerHTML = '';
  const groups = partGroups(design.parts || []);
  for (const cat of Object.keys(CATEGORIES)) groups.filter((g) => g.category === cat).forEach((g, i) => {
    if (i === 0) { const head = document.createElement('div'); head.className = 'cat'; head.textContent = cat; box.appendChild(head); }
    const row = document.createElement('div');
    row.className = 'part';
    const b = g.members[0].build, colour = colourOf(g), key = partKey(g.members[0]), targets = targetsOf(g);
    row.dataset.key = key;
    if (colour) row.style.setProperty('--tag', colour);
    if (colour) row.classList.add('tagged');
    const open = openCards.has(key);
    row.innerHTML = `<span class="pnm">${targets.length ? `<b class="fold">${open ? '▾' : '▸'}</b>` : ''}${dot(colour)}<span class="nm">${partName(g)}</span>
        <button class="ren" title="Rename this part (e.g. left leg)">✎</button></span>
      <span>${b ? '<button class="edit">Edit</button> ' : ''}<button class="mirror" data-axis="90" title="Add a mirror copy on the other side: left ↔ right">⇆</button>
        <button class="mirror" data-axis="0" title="Add a mirror copy on the other side: top ↔ bottom">⇅</button>
        <button class="remove">Remove</button></span>`;
    // tapping the name folds or opens the card, and lights the part up in the tank
    row.querySelector('.pnm').onclick = (e) => {
      if (e.target.classList.contains('ren')) return;
      if (targets.length) { if (open) openCards.delete(key); else openCards.add(key); }
      glow = { parts: new Set(g.members.map((x) => design.parts.indexOf(x))), until: performance.now() + 1500 };
      if (targets.length) listParts();
    };
    row.querySelector('.ren').onclick = () => {
      const name = (prompt('Name this part (e.g. left leg, dawn eye); empty: back to its usual name', g.members[0].name || '') ?? null);
      if (name === null) return;
      remember(design);
      if (name.trim()) g.members[0].name = name.trim().slice(0, 30); else delete g.members[0].name;
      $('json').value = JSON.stringify(design, null, 2);
      listParts();
    };
    if (b && b.id === editing) row.classList.add('editing');
    if (b) row.querySelector('.edit').onclick = () => (editing === b.id ? stopEditing() : startEditing(b));
    for (const m of row.querySelectorAll('.mirror')) m.onclick = () => {
      const d = JSON.parse(JSON.stringify(design));
      const k = design.parts.indexOf(g.members[g.members.length - 1]);
      d.parts.splice(k + 1, 0, ...mirrorGroup(g.members, Number(m.dataset.axis), `p${Date.now() % 100000}_${++partCount}`));
      applyDesign(d);
    };
    if (targets.length) {   // the rule in a sentence; the card itself only while open
      const sum = document.createElement('div'); sum.className = 'psum'; sum.innerHTML = ruleSummary(targets);
      sum.onclick = () => row.querySelector('.pnm').click();
      row.appendChild(sum);
      if (open) row.appendChild(wiring(g, targets));
    }
    row.querySelector('.remove').onclick = () => {
      if (b && b.id === editing) { editing = null; previewOn = false; $('addPart').textContent = '＋ Add to body'; $('cancelEdit').hidden = true; }
      const d = JSON.parse(JSON.stringify(design));
      const gone = new Set(g.members.map((m) => design.parts.indexOf(m)));
      d.parts = d.parts.filter((_, i) => !gone.has(i));
      unplug(d, new Set(g.members.map((m) => m.id).filter(Boolean)));
      applyDesign(d);
    };
    box.appendChild(row);
  });
  if (!box.children.length) box.textContent = 'No parts yet: just a body.';
  drawPatch();   // the patch view follows every change (when open)
}

// A new tank with the design. Rebuilding after an edit (carry: the old world, its selected cell and design) keeps the
// time of day, the other cells as they are, and rebuilds this design's other copies where they were; the edited cell
// keeps its share of energy. Reset (no carry) starts again at dawn.
function reset(pose, carry) {
  $('err').textContent = '';
  const s = (pose && pose.x !== undefined ? pose : null) || design.start || {};
  const w = makeWorld(1, { gravity: $('gravity').checked, light: $('light').checked, day: $('day').checked, metab: true });
  try {
    const next = addCell(w, design, s.x ?? TW / 2, s.y ?? TH * 0.6, s.angle ?? 0);
    if (carry) {
      w.steps = carry.world.steps;
      const share = (c) => (c.metab ? c.metab.E / c.metab.C : M_START);
      // stores and floats that are still there (the same design part) keep how full or worn they were
      const keep = (from, to) => {
        for (const i of to.pieces[0].inclusions) {
          const o = from.pieces[0].inclusions.find((x) => x.part === i.part && x.material === i.material);
          if (o && i.material === 'plastid') i.damage = o.damage || 0;   // a plastid keeps its damage
          if (!o || !(i.store || i.crush)) continue;
          i.fill = o.fill; if (i.crush) { i.crushed = o.crushed; if (o.crushed) i.density = o.density; }
          i.wpt.w = (i.density - PARAMS.cell.cytoplasm) * i.v * i.fill * PARAMS.gravity * 1e-6;
        }
      };
      keep(carry.cell, next);
      next.metab.E = share(carry.cell) * next.metab.C;
      next.journal = carry.cell.journal;   // the day graph goes on
      for (const c of carry.world.cells) {
        if (c === carry.cell) continue;
        if (c.design === carry.design) {
          const k = addCell(w, design, c.q[0], c.q[1], c.q[2] * 180 / Math.PI);
          k.metab.E = share(c) * k.metab.C; k.journal = c.journal; keep(c, k);
        } else { for (const p of c.pads) p.link = null; w.cells.push(c); }
      }
    }
    cell = next;
  } catch (e) {
    $('err').textContent = e.message;
    return false;
  }
  world = w; acc = 0; released = null; ghosts = [];
  select(cell);
  cam = { x: cell.q[0], y: cell.q[1] };
  return true;
}

// Follow and measure one cell; its sap vacuoles get sliders
function select(c) {
  cell = c; trail = []; samples = [];
  const box = $('sap');
  box.innerHTML = '';
  c.pieces[0].inclusions.forEach((inc, i) => {
    if (!inc.pumpable) return;
    const row = document.createElement('label');
    row.innerHTML = `Sap vacuole ${i + 1} target <input type="range" min="${inc.min}" max="${inc.max}" step="1" value="${inc.target}" style="width:110px"> <span></span>`;
    const input = row.querySelector('input'), out = row.querySelector('span');
    const show = () => { out.textContent = `${inc.target} (now ${inc.density.toFixed(1)})`; };
    input.oninput = () => { inc.target = Number(input.value); show(); };
    inc.show = show; show();
    box.appendChild(row);
  });
}

$('apply').onclick = () => {
  let d;
  try { d = JSON.parse($('json').value); } catch (e) { $('err').textContent = 'JSON: ' + e.message; return; }
  applyDesign(d);
};
$('reset').onclick = () => reset();
$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? '⏸' : '▶'; };
$('step').onclick = () => { playing = false; $('play').textContent = '▶'; advance(10); };
$('release').onclick = () => {
  let any = false;
  for (const c of world.cells) {
    for (const j of c.joints) if (j.latched) { j.latched = false; any = true; }
    if (fire(c)) any = true;   // burst organs that are charged
  }
  if (!any) return;
  released = { x: cell.q[0], y: cell.q[1], t: worldTime(world) };
  ghosts = world.cells.map(outline);
};
$('add').onclick = () => {   // another cell beside the selected one: a copy (kin), or any preset (its own species)
  const v = addSelect.value;
  const d = v.startsWith('saved:') ? savedDesign(v.slice(6)) : v ? preset(v) : design;
  if (!d) return;
  try {
    const c = addCell(world, d, cell.q[0], cell.q[1], (d.start || {}).angle ?? 0);
    c.q[0] = Math.min(Math.max(cell.q[0] + cell.reach + c.reach + 2, c.reach), TW - c.reach);
    updatePose(c);
  } catch (e) { $('err').textContent = e.message; }
};

// The capsules of a cell, as they are now
function outline(c) {
  return c.pieces.map((p, i) => {
    const h = p.L / 2;
    return [c.cx[i] - c.cs[i] * h, c.cy[i] - c.sn[i] * h, c.cx[i] + c.cs[i] * h, c.cy[i] + c.sn[i] * h, p.a];
  });
}

function rotate(c, deg) {
  c.q[2] += deg * Math.PI / 180;
  updatePose(c);
}
$('gravity').onchange = () => { if (world) world.gravity = $('gravity').checked; };
$('light').onchange = () => { if (world) world.light = $('light').checked; };

// ----- simulation -----
function advance(steps) {
  for (let i = 0; i < steps; i++) {
    stepWorld(world);
    for (const c of world.cells) { remember1(c); note(world, c); }
    if (world.steps % 10 === 0) {              // every 10 ms: samples for beat-averaged speed and power
      samples.push({ t: worldTime(world), x: cell.q[0], y: cell.q[1], e: cell.energy.motor + cell.energy.pump });
      if (samples.length > 400) samples.shift();
    }
    if (world.steps % 100 === 0) {             // every 0.1 s: a trail dot
      trail.push([cell.q[0], cell.q[1]]);
      if (trail.length > 4000) trail.shift();
    }
  }
  for (const c of world.cells) updatePose(c);
}

// ----- calm drawing: beats drawn slowly, the body's beat-wobble smoothed; the physics is untouched -----
// A real tail beats 20-500 times a second: on screen, a blur. Each motor gets a drawn phase that advances at most
// VIS_BEATS strokes per real second; the body's pose (and passive hinges) follow the physics through a short
// smoothing. When the true beat is already that slow on screen (slow motion), the drawing is the physics exactly.
const VIS_BEATS = 2.5, VIS_TAU = 0.25;   // strokes per real second; smoothing time (real seconds)
let calmBeats = true, lastReal = 0;
// The body bounces forward and back with every stroke (no coasting at this scale), 20+ times a second: drawn as it is,
// frames catch it anywhere in the bounce and it jitters. Calm drawing puts it where it is on average over the last
// beat of its slowest running motor (half a beat behind), so it glides at its net speed, as it looks in slow motion.
const TRACK = 1000;   // steps kept (1 s: one beat of anything beating at least once a second)
function remember1(c) {
  const t = c.track || (c.track = { x: new Float64Array(TRACK), y: new Float64Array(TRACK), n: 0, i: 0 });
  t.i = (t.i + 1) % TRACK; t.x[t.i] = c.q[0]; t.y[t.i] = c.q[1]; t.n = Math.min(t.n + 1, TRACK);
}
function beatAverage(c) {
  const t = c.track;
  if (!t || !t.n || t.x[t.i] !== c.q[0] || t.y[t.i] !== c.q[1]) {   // moved by hand (tweezers, reset): start afresh
    c.track = null; remember1(c); return [c.q[0], c.q[1]];
  }
  let rate = Infinity;
  for (const j of c.joints) if (j.type === 'motor' && j.on && (!j.burst || j.burst.state === 'firing')) rate = Math.min(rate, j.rate);
  const w = Math.min(t.n, rate === Infinity ? 1 : Math.max(1, Math.round(1 / (rate * DT))));
  let sx = 0, sy = 0;
  for (let k = 0; k < w; k++) { const m = (t.i - k + TRACK) % TRACK; sx += t.x[m]; sy += t.y[m]; }
  return [sx / w, sy / w];
}
function calmPose(c, realDt, speed) {
  const v = c.vis || (c.vis = { q: Float64Array.from(c.q), phase: c.joints.map((j) => (j.clock || 0) * (j.rate || 0)) });
  let fast = false;
  c.joints.forEach((j, i) => {
    if (j.type !== 'motor') return;
    const f = Math.min(1, VIS_BEATS / (j.rate * Math.max(speed, 1e-9)));   // how much slower to draw it
    if (f < 1) fast = true;
    if (j.on) v.phase[i] += j.rate * f * speed * realDt;
  });
  if (!calmBeats || !fast) {   // the true pose
    v.q.set(c.q);
    c.joints.forEach((j, i) => { if (j.type === 'motor') v.phase[i] = j.clock * j.rate; });
    return null;
  }
  const k = 1 - Math.exp(-realDt / VIS_TAU);
  // position averaged over the last beat (it follows the swimming cell half a beat behind); the turn and passive
  // hinges smoothed, since they wobble with every beat
  [v.q[0], v.q[1]] = beatAverage(c);
  for (let i = 2; i < c.n; i++) {
    let d = c.q[i] - v.q[i];
    if (i === 2) d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));   // the turn: the short way round
    v.q[i] += Math.abs(d) > 2 ? d : d * k;                            // a big jump (Q/E, a snap) at once
  }
  c.joints.forEach((j, i) => { if (j.type === 'motor') v.q[3 + i] = motorAngle(j, v.phase[i] / j.rate); });
  // a copy of the cell posed for drawing: it shares everything but the pose
  const d = Object.assign({}, c, {
    q: v.q, phi: new Float64Array(c.phi), cs: new Float64Array(c.cs), sn: new Float64Array(c.sn),
    cx: new Float64Array(c.cx), cy: new Float64Array(c.cy), jx: new Float64Array(c.jx), jy: new Float64Array(c.jy),
  });
  updatePose(d);
  updatePose(c);   // extenders keep their length on the shared piece objects: put the true one back
  return d;
}

let last = performance.now();
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.1);
  last = now;
  lastReal = elapsed;
  if (playing && world) {
    acc += elapsed * Number($('speed').value);
    const want = Math.floor(acc / DT);
    const t0 = performance.now();
    let done = 0;
    while (done < want && performance.now() - t0 < 14) { advance(Math.min(50, want - done)); done = Math.min(done + 50, want); }
    acc -= want * DT;
    lagging = done < want;                     // the computer can't keep up with this speed
  }
  if (world) { draw(); if (!$('stats').hidden) stats(); liveReadings(); patchLive(); ruleLive(); syncButtons(); $('stats').style.top = `${$('bar').offsetHeight + 14}px`; }
  requestAnimationFrame(frame);
}

// ----- numbers -----
function stats() {
  const t = worldTime(world);
  const now = samples[samples.length - 1];
  let then = null;
  for (let i = samples.length - 1; i >= 0; i--) if (now && now.t - samples[i].t >= 1 - 1e-9) { then = samples[i]; break; }
  const len = 2 * cell.pieces[0].a + cell.pieces[0].L;
  const lines = [
    `time      ${t.toFixed(2)} s${lagging ? '  (running as fast as it can)' : ''}`,
    `depth     ${(TH - cell.q[1]).toFixed(1)} µm  (height ${cell.q[1].toFixed(1)})`,
    `angle     ${(cell.q[2] * 180 / Math.PI).toFixed(1)}°`,
  ];
  if (then) {
    const dt = now.t - then.t;
    const vx = (now.x - then.x) / dt, vy = (now.y - then.y) / dt, sp = Math.hypot(vx, vy);
    lines.push(
      `speed     ${sp.toFixed(2)} µm/s  = ${(sp / len).toFixed(2)} body lengths/s`,
      `  up/down ${vy >= 0 ? '+' : ''}${vy.toFixed(2)} µm/s  (${(vy * 0.0864).toFixed(2)} m/day)`,
      `  sideways ${vx.toFixed(2)} µm/s`,
      `power     ${((now.e - then.e) / dt / 1000).toFixed(1)} fW (motors and pumps)`,
    );
  } else lines.push('speed     (measuring over 1 s...)');
  if (released) lines.push(`released  ${Math.hypot(cell.q[0] - released.x, cell.q[1] - released.y).toFixed(2)} µm from the cross, ${((worldTime(world) - released.t) * 1000).toFixed(0)} ms ago`);
  lines.push(`spent     ${(cell.energy.motor / 1000).toFixed(1)} fJ motors, ${(cell.energy.pump / 1000).toFixed(1)} fJ pumping`);
  if (world.cells.length > 1) {
    const together = world.cells.filter((c) => c.group === cell.group).length;
    lines.push(`cells     ${world.cells.length}, pad links ${world.links.length}, this one's group ${together}`);
  }
  lines.push(`light here ${lightAt(world, cell.q[1]).toFixed(2)} (1 = full sun at the surface)`);
  budget(lines);
  const ev = (cell.journal ? cell.journal.ev : []).slice(-6);
  if (ev.length) { lines.push('what happened (latest last):'); for (const e of ev) lines.push(`  ${e.serious ? '⚠' : '·'} ${eventText(e)}`); }
  const NAME = { light: 'eyespot', touch: 'touch', near: 'proximity', hunger: 'hunger', statolith: 'statolith', chem: 'nutrients' };
  cell.sensors.forEach((sn, i) => lines.push(`${NAME[sn.kind].padEnd(9)} ${sn.value.toFixed(2)}`));
  const bursts = cell.joints.filter((j) => j.burst);
  if (bursts.length) {
    const b = bursts[0].burst;
    lines.push(`spring    ${b.state === 'charged' ? 'charged' : b.state === 'firing' ? 'FIRING' : `recharging, ${(b.recharge - b.t).toFixed(1)} s left`}`);
  }
  const motors = cell.joints.filter((j) => j.type === 'motor' && !j.burst);
  if (motors.length && cell.metab.starving) lines.push('motors    stopped: STARVING');
  if (motors.length) lines.push(`motors    ${motors.filter((j) => j.on).length} of ${motors.length} running`);
  for (const inc of cell.pieces[0].inclusions) if (inc.show) inc.show();
  $('stats').textContent = lines.join('\n');
}

// The energy budget of the selected cell: income, then where it goes, as shares of the income
function budget(lines) {
  const m = cell.metab;
  if (!world.metab) return;
  const base = m.income > 0 ? m.income : null;
  const show = (v) => base ? `${(100 * v / base).toFixed(v / base < 0.01 ? 2 : 0)}%` : `${v.toFixed(0)} pJ/s`;
  lines.push(`energy    pool ${(100 * m.E / m.C).toFixed(0)}%${m.starving ? '  STARVING' : ''}`);
  lines.push(`income    ${m.income.toFixed(0)} pJ/s from plastids${base ? '' : ' (none: dark or no plastid)'}`);
  const health = plastidHealth(world, cell);
  if (health < 0.995) lines.push(`plastids  ${(100 * health).toFixed(0)}% healthy (bright light damages them)`);
  lines.push(`spent on  body upkeep ${show(m.bodyUpkeep)}`);
  for (const g of partGroups(cell.design.parts || [])) {
    let v = 0;
    for (const mm of g.members) v += m.byPart.get(cell.design.parts.indexOf(mm)) || 0;
    if (v > 0) lines.push(`          ${g.name} upkeep ${show(v)}`);
  }
  if (m.motors > 0) lines.push(`          flagella beating ${show(m.motors)}`);
  if (m.pumps > 0) lines.push(`          pumping ${show(m.pumps)}`);
  if (m.gasBuild > 0) lines.push(`          rebuilding gas vesicles ${show(m.gasBuild)}`);
  if (m.repair > 0.5) lines.push(`          repairing plastids (too much light) ${show(m.repair)}`);
  const net = m.income - m.upkeep - m.motors - m.pumps - m.gasBuild - m.repair;
  lines.push(`net       ${net >= 0 ? "+" : ""}${net.toFixed(0)} pJ/s: ${net >= 0 ? "gaining energy" : "losing energy"}`);
  for (const inc of cell.pieces[0].inclusions) if (inc.store) lines.push(`store     ${inc.store} ${(100 * inc.fill).toFixed(0)}% full`);
}

// Live sensor readings beside the wiring, for the selected cell if it is this design (always, numbers shown or not).
// For a light sensor, also the most it could read at this depth (facing straight up), as a faint mark on the bar.
function liveReadings() {
  // the built-in energy level reads like a sensor
  const find = (id) => cell.design === design && liveReading(cell, id);
  for (const el of document.querySelectorAll('[data-live]')) {
    const sn = find(el.dataset.live);
    el.textContent = sn ? (el.dataset.mean ? `${sn.value.toFixed(2)} (${meaning(el.dataset.mean, sn.value, el.dataset.live)})` : sn.value.toFixed(2)) : '–';
  }
  for (const el of document.querySelectorAll('[data-livebar]')) {
    const sn = find(el.dataset.livebar);
    el.style.display = sn ? '' : 'none';
    if (sn) el.style.left = `${Math.min(Math.max(sn.value, 0), 1) * 100}%`;
  }
  for (const el of document.querySelectorAll('[data-livemax]')) {
    const sn = find(el.dataset.livemax);
    if (!sn) { el.textContent = ''; continue; }
    const i = sn.piece, y = cell.cy[i] + cell.sn[i] * sn.x + cell.cs[i] * sn.y;
    const most = lightAt(world, y);
    el.textContent = ` · facing straight up here it would read ${most.toFixed(2)}`;
    const mark = el.closest('.range').querySelector('.most');
    if (mark) mark.style.left = `${most * 100}%`;
  }
}

// ----- drawing -----
function resize() {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

function draw() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const view = $('viewMode').value;
  if (view === 'follow') { const q = cell.vis ? cell.vis.q : cell.q; cam = { x: q[0], y: q[1] }; }   // the body as drawn
  else if (view === 'fit') fit(W, H);
  const s = Number($('zoom').value);                       // pixels per µm
  // on a computer the patch view covers the lower half of the tank: keep a followed cell in the upper part
  if (view === 'follow' && patchOpen && innerWidth > 760) cam = { x: cam.x, y: cam.y - H * 0.25 / s };
  // the day graph covers the bottom of the tank: keep a followed cell in the middle of what is left above it
  if (view === 'follow' && graphOn) cam = { x: cam.x, y: cam.y - ((H < 500 ? 84 : 110) + 8) / 2 / s };
  const X = (x) => W / 2 + (x - cam.x) * s, Y = (y) => H / 2 - (y - cam.y) * s;

  ctx.fillStyle = COLOR.outside; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COLOR.water; ctx.fillRect(X(0), Y(TH), TW * s, TH * s);

  // grid (fine every 10 µm, bold every 100 µm) so movement shows while following
  const x0 = cam.x - W / 2 / s, x1 = cam.x + W / 2 / s, y0 = cam.y - H / 2 / s, y1 = cam.y + H / 2 / s;
  for (const [step, color] of [[10, COLOR.grid], [100, COLOR.gridMajor]]) {
    if (step * s < 6) continue;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    for (let gx = Math.ceil(Math.max(x0, 0) / step) * step; gx <= Math.min(x1, TW); gx += step) { ctx.moveTo(X(gx), Y(Math.max(y0, 0))); ctx.lineTo(X(gx), Y(Math.min(y1, TH))); }
    for (let gy = Math.ceil(Math.max(y0, 0) / step) * step; gy <= Math.min(y1, TH); gy += step) { ctx.moveTo(X(Math.max(x0, 0)), Y(gy)); ctx.lineTo(X(Math.min(x1, TW)), Y(gy)); }
    ctx.stroke();
  }
  ctx.fillStyle = COLOR.label; ctx.font = '11px system-ui';
  for (let gy = Math.ceil(Math.max(y0, 0) / 100) * 100; gy <= Math.min(y1, TH); gy += 100) ctx.fillText(`${TH - gy} µm deep`, X(Math.max(x0, 0)) + 4, Y(gy) - 3);

  const sun = world.light ? daylight(world) : 0;
  if (sun > 0) {   // light from above, fading with depth over the tank, as bright as the sun is now
    const top = Y(TH), g = ctx.createLinearGradient(0, top, 0, Y(0));
    for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, COLOR.light + (0.16 * sun * Math.exp(-PARAMS.light.attenuation * TH * k / 4)).toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(X(0), top, TW * s, TH * s);
    if (top > 0) { ctx.fillStyle = COLOR.light + (0.8 * sun).toFixed(2) + ')'; ctx.fillRect(X(0), top - 2, TW * s, 3); }
  }
  if (sun < 1) { ctx.fillStyle = `rgba(2,4,10,${(0.45 * (1 - sun)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }   // night
  {   // the nutrients: a faint tan haze below the nutricline
    const g = ctx.createLinearGradient(0, Y(TH), 0, Y(0));
    for (let k = 0; k <= 8; k++) g.addColorStop(k / 8, `rgba(200,178,106,${(0.07 * nutrientAt(TH * (1 - k / 8))).toFixed(3)})`);
    ctx.fillStyle = g; ctx.fillRect(X(0), Y(TH), TW * s, TH * s);
  }
  // trail
  ctx.fillStyle = COLOR.trail;
  for (const [tx, ty] of trail) ctx.fillRect(X(tx) - 1, Y(ty) - 1, 2, 2);

  if (released) {   // a cross where the latches were let go
    ctx.strokeStyle = COLOR.motor; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(X(released.x) - 6, Y(released.y)); ctx.lineTo(X(released.x) + 6, Y(released.y));
    ctx.moveTo(X(released.x), Y(released.y) - 6); ctx.lineTo(X(released.x), Y(released.y) + 6); ctx.stroke();
  }
  // where the cells were at Release, faint
  ctx.strokeStyle = 'rgba(216,240,224,.35)'; ctx.lineCap = 'round';
  for (const g of ghosts) for (const [ax, ay, bx, by, a] of g) {
    ctx.lineWidth = Math.max(2 * a * s, 1);
    ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx) + 0.01, Y(by)); ctx.stroke();
  }
  const spd = playing ? Number($('speed').value) : 0;
  for (const c of world.cells) { c.drawn = calmPose(c, lastReal, spd) || c; drawCell(c.drawn, X, Y, s, c); }   // drawn: for taps
  drawPreview(X, Y, s);
  drawLinks(X, Y, s);
  drawForces(X, Y, s);
  let bottom = H;   // the day graph sits along the bottom; the scale and the clock above it
  if (graphOn) {
    const gh = H < 500 ? 84 : 110;
    drawJournal(ctx, forecastJ || cell.journal, 8, H - gh - 6, W - 60, gh, forecastJ ? 'forecast: the next day' : 'the last day');
    bottom = H - gh - 8;
  }
  drawScale(W, bottom, s);
  drawMinimap(W, H);
  drawHud(W, bottom);
}

// ----- saved designs: kept in this browser (they survive a reload; another phone or computer has its own) -----
const SAVE_KEY = 'tinygod.saved';
function savedList() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch (e) { return []; } }
function writeSaved(list) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
// a saved design as its own species (copies of it are kin; other designs are strangers)
function savedDesign(name) {
  const s = savedList().find((x) => x.name === name);
  return s ? Object.assign(JSON.parse(JSON.stringify(s.design)), { species: name }) : null;
}
function showSaved() {
  const list = savedList(), sel = $('savedWhat');
  sel.innerHTML = '';
  sel.add(new Option(list.length ? `saved designs (${list.length})…` : 'no saved designs yet', ''));
  for (const s of list) sel.add(new Option(s.name, s.name));
  savedGroup.innerHTML = '';
  for (const s of list) savedGroup.appendChild(new Option(s.name, `saved:${s.name}`));
  $('deleteSaved').disabled = !sel.value;
}
$('saveDesign').onclick = () => {
  const list = savedList();
  const name = (prompt('Name this design', design.species && !PRESETS[design.species] ? design.species : `Design ${list.length + 1}`) || '').trim();
  if (!name) return;
  const d = JSON.parse(JSON.stringify(design)); delete d.species;
  const rest = list.filter((x) => x.name !== name);
  if (!writeSaved([...rest, { name, design: d, saved: Date.now() }])) { $('buildErr').textContent = 'this browser would not save it'; return; }
  design.species = name;
  showSaved(); $('savedWhat').value = name; $('deleteSaved').disabled = false;
};
$('savedWhat').onchange = () => {
  $('deleteSaved').disabled = !$('savedWhat').value;
  const d = $('savedWhat').value && savedDesign($('savedWhat').value);
  if (d) applyDesign(d);   // in place of the selected cell: the tank and the time of day go on
};
$('deleteSaved').onclick = () => {
  const name = $('savedWhat').value;
  if (!name || !confirm(`Delete the saved design "${name}"?`)) return;
  writeSaved(savedList().filter((x) => x.name !== name)); showSaved();
};
showSaved();
// From Claude: the designs Claude left in designs/ go into the saved designs (same name: replaced)
// (at home from the sandbox server; elsewhere, as on the website, from designs/index.json published with the sandbox)
async function claudesDesigns() {
  for (const url of ['/designs', '../designs/index.json']) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) { /* try the next */ }
  }
  throw new Error('unreachable');
}
$('getDesigns').onclick = async () => {
  try {
    const got = await claudesDesigns();
    if (!got.length) { $('buildErr').textContent = 'nothing from Claude yet'; return; }
    const names = new Set(got.map((g) => g.name));
    writeSaved([...savedList().filter((x) => !names.has(x.name)), ...got.map((g) => ({ name: g.name, design: g.design, saved: Date.now() }))]);
    showSaved();
    $('buildErr').textContent = `from Claude: ${got.map((g) => g.name).join(', ')}: pick it in the saved designs`;
  } catch (e) { $('buildErr').textContent = 'no connection: Claude\'s designs need the internet (or home Wi-Fi)'; }
};
// Send to Claude: the computer serving the sandbox keeps it as designs/<name>.json, where Claude can read it
$('sendDesign').onclick = async () => {
  const name = (prompt('Name it for Claude', design.species && !PRESETS[design.species] ? design.species : 'my species') || '').trim();
  if (!name) return;
  const d = JSON.parse(JSON.stringify(design)); delete d.species;
  try {
    const r = await fetch(`/design?name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(d) });
    if (!r.ok && r.status !== 400 && r.status !== 413) throw new Error('no server');   // the website: nothing to send to
    $('buildErr').textContent = r.ok ? `sent: Claude can read ${(await r.json()).file}` : `not sent: ${await r.text()}`;
  } catch (e) {   // away from home: copy it, to paste to Claude in the chat
    $('buildErr').textContent = await copyText(JSON.stringify({ name, design: d }))
      ? 'away from home: copied instead. Paste it to Claude in the chat' : 'not sent: the computer is not reachable';
  }
};

// Copy / Paste: carry a design between devices or browsers (each keeps its own saved designs), e.g. by messaging it
// to yourself. The text is { name, design } (a bare design pastes too).
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* not allowed here (plain http) */ }
  const t = document.createElement('textarea');
  t.value = text; document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { /* no copying at all */ }
  t.remove();
  return ok;
}
$('copyDesign').onclick = async () => {
  const d = JSON.parse(JSON.stringify(design)), name = d.species || 'my species'; delete d.species;
  $('buildErr').textContent = await copyText(JSON.stringify({ name, design: d }))
    ? 'copied: paste it on another device with 📋 Paste' : 'could not copy here: use Advanced (design as JSON)';
};
$('pasteDesign').onclick = async () => {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (e) { /* not allowed here: ask */ }
  if (!text || !text.includes('{')) text = prompt('Paste the design here') || '';
  if (!text.trim()) return;
  try {
    const got = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const d = got.design || got, name = (got.name || `Pasted ${savedList().length + 1}`).trim();
    if (!d.body) throw new Error('not a design');
    const list = savedList().filter((x) => x.name !== name);
    writeSaved([...list, { name, design: d, saved: Date.now() }]);
    showSaved();
    load(Object.assign(JSON.parse(JSON.stringify(d)), { species: name }));
    $('buildErr').textContent = `pasted "${name}": it is in your saved designs`;
  } catch (e) { $('buildErr').textContent = 'that is not a design (copy it with 📋 Copy)'; }
};

// ----- the day graph and Test a day -----
let graphOn = true, forecastJ = null, stopForecast = null;
$('graphBtn').onclick = () => { graphOn = !graphOn; };
$('testDay').onclick = () => {
  if (stopForecast) { stopForecast(); stopForecast = null; }
  if (forecastJ) { forecastJ = null; $('testDay').textContent = '⏩ Test a day'; return; }
  graphOn = true;
  const from = { steps: world.steps, x: cell.q[0], y: cell.q[1], angle: cell.q[2] * 180 / Math.PI,
    share: cell.metab ? cell.metab.E / cell.metab.C : undefined,
    damage: cell.pieces[0].inclusions.filter((i) => i.material === 'plastid').map((i) => i.damage || 0) };
  const settings = { gravity: world.gravity, light: world.light, day: world.day, metab: world.metab };
  stopForecast = forecast(cell.design, from, settings, (p) => { $('testDay').textContent = `⏩ ${Math.round(100 * p)}%`; },
    (j) => { stopForecast = null; forecastJ = j; $('testDay').textContent = '✕ Close forecast'; });
};
const clearForecast = () => { if (stopForecast) stopForecast(); stopForecast = null; forecastJ = null; $('testDay').textContent = '⏩ Test a day'; };

// ----- force arrows: weight minus buoyancy (red down: it sinks; blue up: it floats), the way it moves (green), and which
// way gravity turns it about its centre (orange arc; the turn it actually makes is the dashed one) -----
let forcesOn = false;
$('forcesBtn').onclick = () => { forcesOn = !forcesOn; };
function arrow(x0, y0, x1, y1, color, label) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4));
  ctx.lineTo(x1 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  if (label) { ctx.font = '11px system-ui'; ctx.fillText(label, x1 + 6, y1 + 4); }
}
function turnArc(cx, cy, r, sign, color, dashed, label) {
  const a0 = -Math.PI / 2 - 0.9, a1 = -Math.PI / 2 + 0.9;   // over the top; on screen, y grows downward
  const ccw = sign > 0;                                        // counterclockwise as seen
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dashed ? [4, 3] : []);
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke(); ctx.setLineDash([]);
  const end = ccw ? a0 : a1, ex = cx + r * Math.cos(end), ey = cy + r * Math.sin(end);
  const dir = end + (ccw ? -Math.PI / 2 : Math.PI / 2);        // tangent, the way it turns
  ctx.beginPath(); ctx.moveTo(ex + 7 * Math.cos(dir), ey + 7 * Math.sin(dir));
  ctx.lineTo(ex + 6 * Math.cos(dir + 2.3), ey + 6 * Math.sin(dir + 2.3)); ctx.lineTo(ex + 6 * Math.cos(dir - 2.3), ey + 6 * Math.sin(dir - 2.3));
  ctx.closePath(); ctx.fill();
  if (label) { ctx.font = '11px system-ui'; ctx.fillText(label, cx + r + 6, cy - r * 0.6); }
}
function drawForces(X, Y, s) {
  if (!forcesOn || !cell) return;
  const c = cell, q = c.vis && calmBeats ? c.vis.q : c.q, cx = X(q[0]), cy = Y(q[1]);
  let W = 0, tau = 0;
  if (world.gravity) for (let i = 0; i < c.pieces.length; i++) for (const p of c.pieces[i].wpts) {
    const [wx] = pieceToWorld(c, i, p.x, p.y);
    W += p.w; tau -= (wx - c.q[0]) * p.w;   // weight pulls down: about the centre it turns by -dx × w
  }
  ctx.save();
  if (Math.abs(W) > 1e-4) {
    const len = Math.min(70, 14 + 30 * Math.sqrt(Math.abs(W)));
    arrow(cx, cy, cx, cy + (W > 0 ? len : -len), W > 0 ? '#ff6a5a' : '#6ab8ff', `${W > 0 ? 'sinks' : 'floats'} ${Math.abs(W).toFixed(2)} pN`);
  }
  const vx = c.v[0], vy = c.v[1], sp = Math.hypot(vx, vy);
  if (sp > 0.2) {
    const len = Math.min(90, 10 + 3 * sp);
    arrow(cx, cy, cx + len * vx / sp, cy - len * vy / sp, '#7fe08a', `${sp.toFixed(1)} µm/s`);
  }
  const r = Math.max(26, c.pieces[0].a * s + 14);
  if (Math.abs(tau) > 1e-3) turnArc(cx, cy, r, tau, '#ffb54a', false, 'gravity turns it');
  if (Math.abs(c.v[2]) > 0.02) turnArc(cx, cy, r + 9, c.v[2], 'rgba(255,181,74,.6)', true, '');
  ctx.restore();
}

// Always on the tank (phones too): the time, the energy pool, the stores
function drawHud(W, H) {
  const m = cell.metab, h = clock(world), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const sunny = world.day ? daylight(world) > 0 : true;
  let text = `${sunny ? '☀' : '☾'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  if (world.metab) {
    const n = nightsLeft(cell);
    text += `   ⚡ ${(100 * m.E / m.C).toFixed(0)}%${n !== null ? ` · ${n < 10 ? n.toFixed(1) : '10+'} nights` : ''}`;
    for (const inc of cell.pieces[0].inclusions) if (inc.store) text += `   ${inc.store} ${(100 * inc.fill).toFixed(0)}%`;
  }
  ctx.font = '12px system-ui';
  const tw = ctx.measureText(text).width + (m.starving ? 90 : 0);
  ctx.fillStyle = 'rgba(8,14,26,.8)'; ctx.fillRect(10, H - 62, tw + 14, 22);
  ctx.fillStyle = COLOR.outline; ctx.fillText(text, 17, H - 46);
  if (world.metab && m.starving) { ctx.fillStyle = COLOR.starving; ctx.fillText('STARVING', 17 + tw - 82, H - 46); }
}

// A store (starch, oil): its outline, and liquid filling it from the bottom as far as it is full
// An inclusion's outline as the current path, at screen (cx, cy): a circle, or a rod lying at world angle a
function incPath(cx, cy, inc, s, a) {
  const R = Math.max(inc.r * s, 1.5), h = (inc.h || 0) * s;
  ctx.beginPath();
  if (h <= 0) { ctx.arc(cx, cy, R, 0, Math.PI * 2); return; }
  const t = -a;   // on screen y grows downward, so angles turn the other way
  const ex = Math.cos(t) * h, ey = Math.sin(t) * h;
  ctx.arc(cx + ex, cy + ey, R, t - Math.PI / 2, t + Math.PI / 2);
  ctx.arc(cx - ex, cy - ey, R, t + Math.PI / 2, t + 3 * Math.PI / 2);
  ctx.closePath();
}
function drawLevel(ix, iy, inc, X, Y, s, a = 0) {
  const R = Math.max(inc.r * s, 1.5), cx = X(ix), cy = Y(iy);
  const ext = R + Math.abs(Math.sin(a)) * (inc.h || 0) * s;   // how far it reaches up and down on screen
  ctx.save();
  incPath(cx, cy, inc, s, a);
  ctx.fillStyle = 'rgba(8,14,26,.35)'; ctx.fill();
  ctx.clip();
  const h = 2 * ext * inc.fill;   // the level, from the lowest point up (screen y grows downward)
  ctx.fillStyle = COLOR[inc.material];
  ctx.fillRect(cx - R - (inc.h || 0) * s, cy + ext - h, 2 * (R + (inc.h || 0) * s), h);
  ctx.restore();
  ctx.strokeStyle = COLOR[inc.material]; ctx.lineWidth = 1.5;
  incPath(cx, cy, inc, s, a); ctx.stroke();
}
// A sap vacuole's colour: pale while lighter than seawater, deep blue while heavier
function sapColor(inc) {
  const t = Math.min(Math.max((inc.density - inc.min) / (inc.max - inc.min), 0), 1);
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${mix(170, 40)},${mix(215, 80)},${mix(255, 170)})`;
}
// A plastid's colour: green (sun) or pink-red (shade), bleaching toward pale yellow as bright light damages it
function plastidColor(inc) {
  const t = Math.min(Math.max(inc.damage || 0, 0), 1);
  const [r, g, b] = inc.pigment === 'shade' ? [196, 90, 124] : [143, 201, 74];
  const mix = (a, z) => Math.round(a + (z - a) * t);
  return `rgb(${mix(r, 236)},${mix(g, 228)},${mix(b, 170)})`;
}
// The nucleus: a pale violet sphere in its envelope, specks of chromatin and a dark nucleolus (they turn with the cell)
function drawNucleus(ix, iy, inc, X, Y, s, rot) {
  const r = Math.max(inc.r * s, 2), cx = X(ix), cy = Y(iy);
  ctx.fillStyle = COLOR.nucleus; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = COLOR.envelope; ctx.lineWidth = Math.max(1, 0.25 * s); ctx.stroke();
  ctx.fillStyle = COLOR.chromatin;
  for (const [a, d] of [[0.6, 0.6], [2.1, 0.66], [3.4, 0.45], [4.6, 0.7], [5.5, 0.35], [1.3, 0.25]]) {
    ctx.beginPath(); ctx.arc(cx + Math.cos(a - rot) * d * r, cy + Math.sin(a - rot) * d * r, Math.max(r * 0.07, 0.8), 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = COLOR.nucleolus;
  ctx.beginPath(); ctx.arc(cx + Math.cos(-0.7 - rot) * 0.3 * r, cy + Math.sin(-0.7 - rot) * 0.3 * r, r * 0.26, 0, Math.PI * 2); ctx.fill();
}
// Gas vesicles: a cluster of small bubbles, fewer as they wear out; crushed, flat grey dashes
function drawGas(ix, iy, inc, X, Y, s, rot = 0) {
  const per = 7, hh = inc.h || 0, groups = 1 + Math.round(2 * hh / Math.max(inc.r, 0.1));   // a cluster per stretch of rod
  const all = per * groups, n = inc.crushed ? all : Math.ceil(all * inc.fill), b = inc.r * 0.32;
  ctx.strokeStyle = 'rgba(207,233,255,.35)'; ctx.lineWidth = 1;
  incPath(X(ix), Y(iy), inc, s, rot); ctx.stroke();
  const ux = Math.cos(rot), uy = Math.sin(rot);
  for (let k = 0; k < n; k++) {
    const g = k % groups, m = Math.floor(k / groups);   // which cluster along the rod, and which bubble in it
    const along = groups > 1 ? -hh + 2 * hh * g / (groups - 1) : 0;
    const a = m * 2.4, d = m ? inc.r * 0.62 * Math.sqrt(m / per) : 0;   // a sunflower spiral: evenly packed
    const bx = ix + ux * along + Math.cos(a) * d, by = iy + uy * along + Math.sin(a) * d;
    if (inc.crushed) {
      ctx.strokeStyle = COLOR.crushed; ctx.lineWidth = Math.max(0.3 * s, 1);
      ctx.beginPath(); ctx.moveTo(X(bx - b), Y(by)); ctx.lineTo(X(bx + b), Y(by)); ctx.stroke();
    } else {
      ctx.fillStyle = COLOR.gas; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(X(bx), Y(by), Math.max(b * s, 1), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}

// is piece i moved by a motor that is stopped? (its own, or the one up its chain of hinges)
function stoppedAt(c, i) {
  for (let k = i; k > 0; k = c.pieces[k].parent) {
    const j = c.joints[c.pieces[k].joint];
    if (!j) continue;
    if (j.type === 'motor') return !j.on && !j.burst;
    if (j.type !== 'hinge') return false;
  }
  return false;
}
function drawCell(c, X, Y, s, real = c) {   // c: posed for drawing; real: the cell itself
  ctx.lineCap = 'round';
  // segments first, body over them, then inclusions and joints
  const order = c.pieces.map((p, i) => i).sort((a, b) => (c.pieces[a].kind === 'body') - (c.pieces[b].kind === 'body'));
  for (const i of order) {
    const p = c.pieces[i], h = p.L / 2;
    const ax = c.cx[i] - c.cs[i] * h, ay = c.cy[i] - c.sn[i] * h, bx = c.cx[i] + c.cs[i] * h, by = c.cy[i] + c.sn[i] * h;
    const tag = partColours(c.design).get(p.part);   // a part with its own colour (flagella, springs)
    const fill = p.kind === 'body' ? COLOR.body[p.material] : tag || COLOR[p.material];
    const w = Math.max(2 * p.a * s, 1.5);
    if (p.kind === 'body') {   // outline (red while starving)
      ctx.strokeStyle = world.metab && c.metab.starving ? COLOR.starving : COLOR.outline; ctx.lineWidth = w + 2;
      ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx) + 0.01, Y(by)); ctx.stroke();
    }
    const jt = p.joint >= 0 ? c.joints[p.joint] : null;
    if (real === cell && glow && glow.until > performance.now() && glow.parts.has(p.part) && p.kind !== 'body') {   // lit: its card was tapped
      ctx.strokeStyle = (tag || '#ffffff') + '66'; ctx.lineWidth = w + 8;
      ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx) + 0.01, Y(by)); ctx.stroke();
    }
    if (jt && jt.burst) {   // a burst organ: a coil, bright while firing, dull while recharging
      const st = jt.burst.state;
      ctx.strokeStyle = tag ? tag + (st === 'firing' ? '' : st === 'charged' ? 'cc' : '55') : st === 'firing' ? COLOR.coilFiring : st === 'charged' ? COLOR.coil : COLOR.coilEmpty;
      ctx.lineWidth = Math.max(0.5 * s, 1);
      const turns = 3, amp = 1.2, nx = -(by - ay) / (p.L || 1), ny = (bx - ax) / (p.L || 1);
      ctx.beginPath(); ctx.moveTo(X(ax), Y(ay));
      for (let k = 1; k <= turns * 2; k++) {
        const t = k / (turns * 2), side = k === turns * 2 ? 0 : (k % 2 ? amp : -amp);
        ctx.lineTo(X(ax + (bx - ax) * t + nx * side), Y(ay + (by - ay) * t + ny * side));
      }
      ctx.stroke();
      continue;
    }
    // a stopped flagellum is grey, or faded in its colour: every piece its motor moves
    ctx.strokeStyle = stoppedAt(c, i) ? (tag ? tag + '66' : COLOR.stopped) : fill; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx) + 0.01, Y(by)); ctx.stroke();
    if (p.kind === 'body') for (const inc of p.inclusions) {
      const ix = c.cx[i] + c.cs[i] * inc.x - c.sn[i] * inc.y, iy = c.cy[i] + c.sn[i] * inc.x + c.cs[i] * inc.y;
      const r = inc.r, a = c.phi[i] + (inc.ang || 0);
      if (inc.store) { drawLevel(ix, iy, inc, X, Y, s, a); continue; }   // a container, filled as far as it is full
      if (inc.material === 'gas') { drawGas(ix, iy, inc, X, Y, s, a); continue; }
      if (inc.material === 'nucleus') { drawNucleus(ix, iy, inc, X, Y, s, a); continue; }
      ctx.fillStyle = inc.pumpable ? sapColor(inc) : inc.material === 'plastid' ? plastidColor(inc) : COLOR[inc.material];
      if (r > 0.02) { incPath(X(ix), Y(iy), inc, s, a); ctx.fill(); }
      if (inc.material === 'statolith') {   // the grain lies on the chamber's lower wall (in the middle with gravity off)
        const g = 0.4 * inc.r, drop = world.gravity ? inc.r - g : 0;
        ctx.fillStyle = COLOR.grain;
        ctx.beginPath(); ctx.arc(X(ix), Y(iy - drop), Math.max(g * s, 1.5), 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  for (let i = 0; i < c.pieces.length; i++) {
    const p = c.pieces[i];
    if (p.joint < 0) continue;
    ctx.fillStyle = COLOR[c.joints[p.joint].type] || COLOR.motor;
    ctx.beginPath(); ctx.arc(X(c.jx[i]), Y(c.jy[i]), Math.max(0.8 * s, 2), 0, Math.PI * 2); ctx.fill();
  }
  for (const sn of c.sensors) {
    const i = sn.piece, px = c.cx[i] + c.cs[i] * sn.x - c.sn[i] * sn.y, py = c.cy[i] + c.sn[i] * sn.x + c.cs[i] * sn.y;
    const stag = partColours(c.design).get(sn.part);
    if (stag || (real === cell && glow && glow.until > performance.now() && glow.parts.has(sn.part))) {   // a ring in its colour
      const lit = real === cell && glow && glow.until > performance.now() && glow.parts.has(sn.part);
      ctx.strokeStyle = stag || '#ffffff'; ctx.lineWidth = lit ? 4 : 2;
      ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max((sn.kind === 'statolith' ? sn.r : 1.2) * s, 3) + (lit ? 5 : 2.5), 0, Math.PI * 2); ctx.stroke();
    }
    if (sn.kind === 'statolith') continue;   // drawn with the inclusions
    if (sn.kind === 'chem') {   // a tan dot, filled as far as the water is rich
      const r = Math.max(1.2 * s, 3);
      ctx.strokeStyle = COLOR.chem; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(px), Y(py), r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = COLOR.chem; ctx.beginPath(); ctx.arc(X(px), Y(py), r * Math.sqrt(sn.value), 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (sn.kind !== 'light') {   // touch and proximity: a blue dot, filled while it feels someone; the range, faint
      ctx.strokeStyle = COLOR.touch; ctx.fillStyle = COLOR.touch; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max(1.2 * s, 3), 0, Math.PI * 2);
      if (sn.value > 0) ctx.fill(); else ctx.stroke();
      if (sn.kind === 'near' && real === cell) {
        ctx.strokeStyle = COLOR.near + (0.15 + 0.5 * sn.value) + ')'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(X(px), Y(py), sn.range * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      continue;
    }
    if (real === cell) {   // the eyespot's cone, faint
      const dir = c.phi[i] + sn.facing, r = 14;
      ctx.fillStyle = COLOR.light + '.12)';
      ctx.beginPath(); ctx.moveTo(X(px), Y(py));
      for (let k = 0; k <= 12; k++) { const a = dir - sn.cone / 2 + sn.cone * k / 12; ctx.lineTo(X(px + Math.cos(a) * r), Y(py + Math.sin(a) * r)); }
      ctx.closePath(); ctx.fill();
    }
    // eyespots: dark red, bright orange when lit, a tick the way they face
    const dir = c.phi[i] + sn.facing;
    const lit = sn.value > 0.5, on = COLOR.eyeLit, off = COLOR.eyeDark;
    ctx.strokeStyle = lit ? on : off; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(px), Y(py)); ctx.lineTo(X(px + Math.cos(dir) * 4), Y(py + Math.sin(dir) * 4)); ctx.stroke();
    ctx.fillStyle = lit ? on : off;
    ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max(1.2 * s, 3), 0, Math.PI * 2); ctx.fill();
  }
  for (const pad of c.pads) {
    const [px, py] = padWorld(c, pad);
    ctx.strokeStyle = COLOR[pad.kind]; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max(pad.r * s, 2.5), 0, Math.PI * 2); ctx.stroke();
  }
  if (real === cell && c.design === design) {      // where the Build panel would put the next part
    const [mx, my] = surfacePoint(design.body, Number($('partAngle').value));
    const [wx, wy] = [c.cx[0] + c.cs[0] * mx - c.sn[0] * my, c.cy[0] + c.sn[0] * mx + c.cs[0] * my];
    ctx.fillStyle = COLOR.selected; ctx.strokeStyle = COLOR.selected; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X(wx), Y(wy), 3, 0, Math.PI * 2); ctx.fill();
    const dir = c.phi[0] + (Number($('partAngle').value) + Number($('partTilt').value)) * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(X(wx), Y(wy)); ctx.lineTo(X(wx + Math.cos(dir) * 8), Y(wy + Math.sin(dir) * 8)); ctx.stroke();
  }
  if (real === cell && world.cells.length > 1) {   // a ring round the selected cell
    ctx.strokeStyle = COLOR.selected; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(X(c.q[0]), Y(c.q[1]), (c.pieces[0].a + c.pieces[0].L / 2) * s + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function padWorld(c, pad) {
  const i = pad.piece, p = c.pieces[i], x = pad.x + (p.ext ? p.offset : 0);
  return [c.cx[i] + c.cs[i] * x - c.sn[i] * pad.y, c.cy[i] + c.sn[i] * x + c.cs[i] * pad.y];
}

function drawLinks(X, Y, s) {
  ctx.strokeStyle = COLOR.link; ctx.lineWidth = Math.max(0.6 * s, 1.5);
  for (const l of world.links) {
    const A = world.cells[l.a], B = world.cells[l.b];
    const [ax, ay] = padWorld(A, l.padA);
    let bx, by;
    if (l.padB) [bx, by] = padWorld(B, l.padB);
    else { const i = l.pieceB; bx = B.cx[i] + B.cs[i] * l.bx - B.sn[i] * l.by; by = B.cy[i] + B.sn[i] * l.bx + B.cs[i] * l.by; }
    ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx) + 0.01, Y(by)); ctx.stroke();
  }
}

// Zoom and centre so every cell is in view
function fit(W, H) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of world.cells) {
    x0 = Math.min(x0, c.q[0] - c.reach); x1 = Math.max(x1, c.q[0] + c.reach);
    y0 = Math.min(y0, c.q[1] - c.reach); y1 = Math.max(y1, c.q[1] + c.reach);
  }
  cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const z = Math.min((W - 80) / (x1 - x0 + 20), (H - 60) / (y1 - y0 + 20));
  $('zoom').value = Math.min(20, Math.max(0.3, z));
}

function drawScale(W, H, s) {
  const opts = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const len = opts.find((v) => v * s >= 60) || 500;
  ctx.strokeStyle = COLOR.outline; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(16, H - 18); ctx.lineTo(16 + len * s, H - 18); ctx.stroke();
  ctx.fillStyle = COLOR.outline; ctx.font = '11px system-ui'; ctx.fillText(`${len} µm`, 16, H - 24);
}

function drawMinimap(W, H) {
  const mh = H - 40, mw = 28, mx = W - mw - 12, my = 20;   // depth to scale, width squeezed
  ctx.fillStyle = 'rgba(6,10,18,.8)'; ctx.fillRect(mx - 1, my - 1, mw + 2, mh + 2);
  ctx.strokeStyle = COLOR.gridMajor; ctx.strokeRect(mx, my, mw, mh);
  ctx.fillStyle = COLOR.trail;
  for (const [tx, ty] of trail) ctx.fillRect(mx + tx / TW * mw, my + (1 - ty / TH) * mh, 1, 1);
  for (const c of world.cells) {
    ctx.fillStyle = c === cell ? COLOR.outline : COLOR.label;
    ctx.beginPath(); ctx.arc(mx + c.q[0] / TW * mw, my + (1 - c.q[1] / TH) * mh, c === cell ? 3 : 2, 0, Math.PI * 2); ctx.fill();
  }
}

// Wheel zooms, or turns the cell you are holding; dragging a cell moves it (tweezers) and selects it; dragging
// water looks around. Q / E turn the selected cell (Shift: finer).
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (drag && drag.cell) { rotate(drag.cell, e.deltaY < 0 ? 10 : -10); return; }
  $('viewMode').value = 'free';
  const z = $('zoom');
  z.value = Math.min(20, Math.max(0.3, Number(z.value) * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
}, { passive: false });
let drag = null;
function toWorld(e) {
  const r = canvas.getBoundingClientRect(), s = Number($('zoom').value);
  return [cam.x + (e.clientX - r.left - r.width / 2) / s, cam.y - (e.clientY - r.top - r.height / 2) / s];
}
// Two fingers on the tank pinch-zoom around the point between them (and pan with it)
const touches = new Map();
let pinch = null;
function pinchState() {
  const [a, b] = [...touches.values()];
  const r = canvas.getBoundingClientRect();
  const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, s = Number($('zoom').value);
  return { d: Math.hypot(a.x - b.x, a.y - b.y), mx, my, wx: cam.x + (mx - r.width / 2) / s, wy: cam.y - (my - r.height / 2) / s, s, w: r.width, h: r.height };
}
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {           // a second finger: stop dragging, start pinching
    if (drag && drag.cell) $('viewMode').value = drag.view;
    drag = null;
    pinch = pinchState();
    $('viewMode').value = 'free';
    return;
  }
  if (touches.size > 2) return;
  const [wx, wy] = toWorld(e);
  const s = Number($('zoom').value);
  const hit = world.cells.find((c) => Math.hypot(c.q[0] - wx, c.q[1] - wy) < c.pieces[0].a + c.pieces[0].L / 2 + 6 / s);
  tap = hit || cell ? { x: e.clientX, y: e.clientY, cell: hit || cell, wx, wy, r: 4 / s } : null;   // a part can stick out far
  if (hit) {
    if (hit !== cell) select(hit);
    drag = { cell: hit, dx: hit.q[0] - wx, dy: hit.q[1] - wy, view: $('viewMode').value };
    $('viewMode').value = 'free';   // a camera following the dragged cell would run away from the mouse
  } else {
    drag = { x: e.clientX, y: e.clientY, cam: { ...cam } };
    $('viewMode').value = 'free';
  }
});
window.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size === 2) {
    const now = pinchState();
    const s = Math.min(20, Math.max(0.3, pinch.s * now.d / pinch.d));
    $('zoom').value = s;
    // keep the world point that was under the fingers under them
    cam = { x: pinch.wx - (now.mx - now.w / 2) / s, y: pinch.wy + (now.my - now.h / 2) / s };
    return;
  }
  if (!drag) return;
  if (drag.cell) {
    const [wx, wy] = toWorld(e);
    drag.cell.q[0] = wx + drag.dx; drag.cell.q[1] = wy + drag.dy;
    updatePose(drag.cell);
    return;
  }
  const s = Number($('zoom').value);
  cam = { x: drag.cam.x - (e.clientX - drag.x) / s, y: drag.cam.y + (e.clientY - drag.y) / s };
});
// a tap (no drag) on the selected cell's nucleus opens the wiring view: the nucleus opened up
let tap = null;
function tappedNucleus(t, e) {
  if (!t || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) return false;
  const c = t.cell.drawn || t.cell;
  return c.pieces[0].inclusions.some((inc) => inc.material === 'nucleus' &&
    Math.hypot(c.cx[0] + c.cs[0] * inc.x - c.sn[0] * inc.y - t.wx, c.cy[0] + c.sn[0] * inc.x + c.cs[0] * inc.y - t.wy) < inc.r + t.r);
}
// a tap on one of the selected cell's parts (a flagellum, a spring, a sensor): its card opens, lit, in view
function showPartAt(t, e) {
  if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8 || cell.design !== design) return;
  const c = cell.drawn || cell;   // where it is drawn (calm: beat-averaged), which is where the finger went
  let best = null, bestD = t.r * 3;
  c.pieces.forEach((p, i) => {
    if (p.kind === 'body') return;
    const h = p.L / 2, ax = c.cx[i] - c.cs[i] * h, ay = c.cy[i] - c.sn[i] * h, ex = 2 * c.cs[i] * h, ey = 2 * c.sn[i] * h, l2 = ex * ex + ey * ey;
    let u = l2 > 0 ? ((t.wx - ax) * ex + (t.wy - ay) * ey) / l2 : 0; u = Math.max(0, Math.min(1, u));
    const d = Math.hypot(t.wx - ax - ex * u, t.wy - ay - ey * u) - p.a;
    if (d < bestD) { bestD = d; best = p.part; }
  });
  for (const sn of c.sensors) {
    const i = sn.piece, px = c.cx[i] + c.cs[i] * sn.x - c.sn[i] * sn.y, py = c.cy[i] + c.sn[i] * sn.x + c.cs[i] * sn.y;
    const d = Math.hypot(t.wx - px, t.wy - py) - (sn.r || 1.5);
    if (d < bestD) { bestD = d; best = sn.part; }
  }
  if (best === null || best === undefined) return;
  const g = partGroups(design.parts || []).find((x) => x.members.includes(design.parts[best]));
  if (!g) return;
  const key = partKey(g.members[0]);
  if (targetsOf(g).length) openCards.add(key);
  glow = { parts: new Set(g.members.map((x) => design.parts.indexOf(x))), until: performance.now() + 1500 };
  listParts();
  const row = document.querySelector(`#partList .part[data-key="${CSS.escape(key)}"]`);
  if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1200); }
}
function lift(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (touches.size > 0) return;
  if (tap && tap.cell === cell && tappedNucleus(tap, e)) $('patchBtn').onclick();
  else if (tap && tap.cell === cell) showPartAt(tap, e);
  tap = null;
  if (drag && drag.cell) $('viewMode').value = drag.view;
  drag = null;
}
window.addEventListener('pointerup', lift);
window.addEventListener('pointercancel', lift);
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'q') rotate(cell, e.shiftKey ? 2 : 15);
  if (k === 'e') rotate(cell, e.shiftKey ? -2 : -15);
});

// ----- buttons that stand for the hidden selects and checkboxes, so everything is one tap away -----
// A row of buttons for a select: tapping one sets the select; the lit button follows it (the code also changes it)
function segmented(boxId, selectId) {
  const box = $(boxId), sel = $(selectId);
  for (const o of sel.options) {
    const b = document.createElement('button');
    b.textContent = o.text; b.dataset.v = o.value;
    b.onclick = () => { sel.value = o.value; sel.dispatchEvent(new Event('change')); };
    box.appendChild(b);
  }
}
segmented('speedSeg', 'speed'); segmented('viewSeg', 'viewMode'); segmented('wallSeg', 'bodyWall'); segmented('feelsSeg', 'partFeels'); segmented('contentSeg', 'partContent'); segmented('pigmentSeg', 'partPigment');
const toggle = (btnId, boxId) => { $(btnId).onclick = () => { $(boxId).checked = !$(boxId).checked; $(boxId).dispatchEvent(new Event('change')); }; };
$('calmBtn').onclick = () => { calmBeats = !calmBeats; };
toggle('gravityBtn', 'gravity'); toggle('lightBtn', 'light'); toggle('dayBtn', 'day');
$('day').onchange = () => { if (world) world.day = $('day').checked; };
if (window.matchMedia('(max-width: 760px)').matches) $('stats').hidden = true;   // phones: the tank first
$('infoBtn').onclick = () => { $('stats').hidden = !$('stats').hidden; };
$('rotL').onclick = () => rotate(cell, 15);
$('rotR').onclick = () => rotate(cell, -15);
const zoomBy = (k) => { $('zoom').value = Math.min(20, Math.max(0.3, Number($('zoom').value) * k)); if ($('viewMode').value === 'fit') $('viewMode').value = 'free'; };
$('zoomIn').onclick = () => zoomBy(1.4);
$('zoomOut').onclick = () => zoomBy(1 / 1.4);

// Part buttons by category (short names); tapping one picks it
const SHORT = {
  'Wave tail (swims)': 'Wave tail', 'Flexible oar (swims)': 'Flexible oar', 'Stiff flap (goes nowhere)': 'Stiff flap',
  'Spine, protein': 'Spine', 'Spine, glass': 'Glass spine', 'Burst organ (escape)': 'Spring',
  'Ejectisome, latched (Release)': 'Ejectisome', 'Oil droplet': 'Oil droplet',
  'Sap vacuole (slider)': 'Sap vacuole', 'Kin pad': 'Kin pad', 'Mucus pad': 'Mucus pad',
  'Nucleus (the brain)': 'Nucleus', 'Plastid (makes energy)': 'Plastid', 'Starch granule (quick store, heavy)': 'Starch',
  'Light sensor (eyespot)': 'Eyespot', 'Touch sensor': 'Touch', 'Proximity sensor': 'Proximity',
  'Gas vesicles (float, crush deep)': 'Gas vesicles', 'Statolith (which way is up)': 'Statolith',
  'Nutrient sensor': 'Nutrients', 'Vacuole (store or float)': 'Vacuole',
};
for (const [cat, names] of Object.entries(CATEGORIES)) {
  const head = document.createElement('div'); head.className = 'cat'; head.textContent = cat;
  const chips = document.createElement('div'); chips.className = 'chips';
  for (const name of names) {
    const b = document.createElement('button');
    b.textContent = SHORT[name] || name; b.title = name; b.dataset.v = name;
    b.onclick = () => {   // picking a part shows its ghost; tapping the lit one again hides it
      if (!editing && previewOn && $('partWhat').value === name) { previewOn = false; updatePreview(); return; }
      previewOn = true;
      $('partWhat').value = name; $('partWhat').dispatchEvent(new Event('change'));
    };
    chips.appendChild(b);
  }
  $('chips').append(head, chips);
}

// Light up the buttons that match the current state (cheap; once a frame)
function syncButtons() {
  for (const [boxId, selId] of [['speedSeg', 'speed'], ['viewSeg', 'viewMode'], ['wallSeg', 'bodyWall'], ['chips', 'partWhat'], ['feelsSeg', 'partFeels'], ['contentSeg', 'partContent'], ['pigmentSeg', 'partPigment']]) {
    const v = $(selId).value;
    for (const b of $(boxId).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
  }
  $('gravityBtn').classList.toggle('on', $('gravity').checked);
  $('lightBtn').classList.toggle('on', $('light').checked);
  $('dayBtn').classList.toggle('on', $('day').checked);
  $('calmBtn').classList.toggle('on', calmBeats);
  $('graphBtn').classList.toggle('on', graphOn);
  $('forcesBtn').classList.toggle('on', forcesOn);
  $('infoBtn').classList.toggle('on', !$('stats').hidden);
  $('flipBtn').classList.toggle('on', $('partFlip').checked);
  $('pullBtn').classList.toggle('on', $('partPull').checked);
  $('undo').disabled = !past.length; $('redo').disabled = !future.length;
  $('clearParts').disabled = !(design.parts || []).length;
}

// The phone address, when the server shares the sandbox on the Wi-Fi (shown on the computer, not on the phone)
fetch('/lan').then((r) => r.json()).then((urls) => {
  if (!urls.length || urls.some((u) => u.startsWith(location.origin))) return;
  $('phone').innerHTML = `📱 On a phone: <a href="${urls[0]}">${urls[0].replace('http://', '')}</a>`;
  $('phone').hidden = false;
}).catch(() => {});

resize();
const asked = new URLSearchParams(location.search).get('preset');   // ?preset=Wave%20tail opens that design
load(preset(asked && PRESETS[asked] ? asked : 'Round cell'));   // an empty cell to build on (Claude's species is in the Add-cell menu)
requestAnimationFrame(frame);

// Offline on the website: a service worker keeps a copy of the sandbox (not on the home server's plain http)
if (location.protocol === 'https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// On the website there is no computer to send to: the button copies the design for the chat instead, and says so
if (location.protocol === 'https:') {
  $('sendDesign').textContent = '📤 Copy for Claude';
  $('sendDesign').title = 'Copies this design: paste it to Claude in the chat (sending works only from the home computer\'s address)';
}
