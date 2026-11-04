// The sandbox viewer: plain shapes, trails and numbers over the same simulation the checks run.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';
import { PRESETS } from '../sim/presets.js';
import { updatePose, fire, motorAngle, toWorld as pieceToWorld } from '../sim/physics.js';
import { rewire, respeed, controlsOf, buildCell, plateMax } from '../sim/build.js';
import { regrow } from '../sim/grow.js';
import { polyDist, polysOverlap, inscribed } from '../sim/shape.js';
import { rigid, isInc, bodyPoints, outOfWall, toOutline, scaleBy, moveTo, fitWall, relax } from './mould.js';
import { lightAt, daylight, clock } from '../sim/light.js';
import { energyLevel, storeLevel, plastidHealth, feedingLevel, sizeLevel, drainedLevel, neighboursLevel, padLevel, alarmLevel, poisonedLevel } from '../sim/sense.js';
import { nitrogenAt } from '../sim/nutrient.js';
import { initMetab } from '../sim/metab.js';
import { brainUse, brainProblem, nucleiOf, nucleusSlots, BUILT_INS } from '../sim/brain.js';
import { note, nightsLeft, drawJournal, eventText, forecast, census, drawCensus } from './journal.js';
import { drawWater, drawDrift, drawVignette, drawToxins, speciesTint, twilight } from './scene.js';
import { PART_TEMPLATES, partGroups, surfacePoint, insideRadius, CATEGORIES, CONTROLS, CONTENT_TIPS, PIGMENT_TIPS, flipPart, mirrorGroup } from './parts.js';

const DT = PARAMS.time.dt, TW = PARAMS.tank.w, TH = PARAMS.tank.h, M_START = PARAMS.metab.start;
const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');

const COLOR = {
  water: '#0b1322', outside: '#060a12', grid: '#132036', gridMajor: '#1f3352', label: '#4d6a86',
  trail: '#6fd3b5', toxin: '#d0508a', protein: '#a8d8a0', glass: '#9fd8f0', oil: '#f2c94c', sap: '#5f8fd8',
  body: { protein: '#3f7d5c', plates: '#4d7a52' }, plates: '#cdb98a', outline: '#d8f0e0', motor: '#ff7a6b', hinge: '#ffb54a',
  extend: '#c9a0ff', stopped: '#5d6b74', coil: '#ffb54a', coilFiring: '#fff1a0', coilEmpty: '#6b5a40', kin: '#e070ff', mucus: '#f2e28a', link: '#e070ff', selected: '#ffffff',
  nucleus: 'rgba(176,150,214,.55)', envelope: '#c9b6ea', chromatin: 'rgba(92,70,140,.8)', nucleolus: '#5b467f',
  resting: '#7d93d8',
  statolith: 'rgba(200,215,230,.35)', grain: '#e8eef5', chem: '#c8b26a',
  plastid: '#8fc94a', plastidShade: '#c45a7c', starch: '#ece3c4', starving: '#ff5a4a', eyeDark: '#7a2a1c', eyeLit: '#ff8a3c', light: 'rgba(255,240,190,', touch: '#5fd0ff', near: 'rgba(95,208,255,',
};

let design, world, cell, playing = false, acc = 0, lagging = false;   // cell: the selected one (followed, measured); starts paused (author)
let trail = [], samples = [], released = null;   // released: where and when latches were let go
let ghosts = [];                                  // outlines of cells as they were at Release
let cam = { x: TW / 2, y: TH / 2 };
// For headless page tests (CDP scripts): read the live world and the selected cell; nothing in the page uses it
window.__tg = { get world() { return world; }, get cell() { return cell; } };

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
  for (const p of d.parts || []) if (p.type === 'inclusion' && p.material === 'nucleus' && !p.joint) p.joint = { type: 'rest' };   // its REST rule
  for (const p of d.parts || []) if (p.type === 'inclusion' && p.material === 'chamber' && !p.joint) p.joint = { type: 'chamber' };   // its FLOAT / SINK rule
  for (const p of d.parts || []) if (p.type === 'pad' && !p.joint) p.joint = { type: 'hold' };   // its HOLDS while… rule (chains)
  if (!(d.parts || []).some((p) => p.type === 'rule' && p.joint && p.joint.type === 'divide')) (d.parts ||= []).push({ type: 'rule', id: 'divide', label: 'Division', joint: { type: 'divide' } });   // its DIVIDE rule
  tagParts(d);
  const gone = new Set((d.parts || []).filter((p) => p.type === 'sensor' && p.kind === 'timer').map((p) => p.id));
  if (!gone.size) return d;
  d.parts = d.parts.filter((p) => !gone.has(p.id));
  for (const p of d.parts) delete p.trigger;
  unplug(d, gone);
  return d;
}

function load(d) {
  stopArrange(true);   // a new design: whatever was being arranged is dropped
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
  if (arrange && !arrange.drag) { arrange.trial = JSON.parse(JSON.stringify(design)); arrange.cell = null; }
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
$('undo').onclick = () => (arrange ? arrangeTravel(past, future) : travel(past, future));
$('redo').onclick = () => (arrange ? arrangeTravel(future, past) : travel(future, past));
$('clearParts').onclick = () => {
  if (!(design.parts || []).length) return;
  editing = null; $('addPart').textContent = '＋ Add to body'; $('cancelEdit').hidden = true;
  applyDesign({ ...JSON.parse(JSON.stringify(design)), parts: [] });
};

// ----- the body: radius, length (0 = round), wall. Parts on it keep their angle; inclusions scale with it -----
function showBody() {
  const b = design.body;
  $('bodyRadius').value = b.radius; $('bodyLength').value = b.length || 0; $('bodyWall').value = b.wall === 'plates' ? 'plates' : 'protein';   // old glass: plain
  $('bodyRadiusOut').textContent = `${b.radius} µm`;
  $('bodyLengthOut').textContent = b.length ? `${b.length} µm (rod)` : '0 (round)';
  const plated = b.wall === 'plates';
  $('platesRow').style.display = $('platesNote').style.display = plated ? '' : 'none';
  $('bodyPlates').max = plateMax(b.radius);   // bigger cells may carry thicker plates
  if (plated) { $('bodyPlates').value = Math.min(b.plates ?? PARAMS.plates.start, plateMax(b.radius)); showPlates(); }
}
// what the plates do and cost: the piercing price, the energy per division, how much faster it sinks (the design
// built with and without them)
function showPlates() {
  const t = Number($('bodyPlates').value);
  $('bodyPlatesOut').textContent = `${t} µm`;
  let note = `pierced at ×${1 + PARAMS.plates.pierce * t} · harpoon wounds ÷${+(1 + PARAMS.plates.harpoon * t).toFixed(1)}`;
  try {
    const d = JSON.parse(JSON.stringify(design));
    const with_ = buildCell({ ...d, body: { ...d.body, wall: 'plates', plates: t } }), without = buildCell({ ...d, body: { ...d.body, wall: 'protein' } });
    const b = with_.pieces[0], extra = Math.round(100 * b.plateVol * PARAMS.plates.energy / (b.volume * PARAMS.grow.energy));
    note += ` · +${extra}% energy per division`;
    const wt = (c) => c.pieces.reduce((a, p) => a + p.wpts.reduce((x, q) => x + q.w, 0) + p.inclusions.reduce((x, i) => x + i.wpt.w, 0), 0);
    const w1 = wt(with_), w0 = wt(without);
    note += w0 > 0 ? ` · sinks ${(w1 / w0).toFixed(1)}× as fast` : ` · ${Math.round(w1 - w0)} pN heavier`;
  } catch (e) { /* the design doesn't build: the ghost and message say why */ }
  $('platesNote').textContent = note;
}
$('bodyPlates').oninput = showPlates;
$('bodyPlates').onchange = () => reshape();
function reshape() {
  const d = JSON.parse(JSON.stringify(design));
  const old = d.body, body = { ...old, radius: Number($('bodyRadius').value), length: Number($('bodyLength').value), wall: $('bodyWall').value };
  if (body.wall === 'plates') body.plates = Number($('bodyPlates').value) || PARAMS.plates.start; else delete body.plates;
  const k = body.radius / old.radius;
  for (const p of d.parts || []) {
    if ((p.parent && p.parent !== 'body') || p.type === 'rule') continue;
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
  $('partSizeOut').textContent = what ? what(Number($('partSize').value) / 100, design && design.body) + sizeShare() : '';
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
  $('contentRow').style.display = c.content ? '' : 'none';
  $('pigmentRow').style.display = c.pigment ? '' : 'none';
  $('materialRow').style.display = c.material ? '' : 'none';
  $('sticksRow').style.display = c.sticks ? '' : 'none';
  $('toxRow').style.display = c.toxkind ? '' : 'none';
  $('contentTip').style.display = c.content || c.pigment || c.tip ? '' : 'none';
  $('contentTip').textContent = c.content ? CONTENT_TIPS[$('partContent').value] : c.pigment ? PIGMENT_TIPS[$('partPigment').value] : c.tip ? c.tip() : '';
  $('tiltLabel').textContent = c.tiltLabel || 'Tilt';   // a statolith's "tilt" is the direction it reads
  $('sizeLabel').textContent = c.sizeLabel || 'Size';   // a feeler's size is how far it feels
  $('partTilt').min = (c.tiltRange || [-90, 90])[0]; $('partTilt').max = (c.tiltRange || [-90, 90])[1];
  showTilt();
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
$('partLength').oninput = () => { showLength(); showSize(); };
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
  if (c.material) b.content = $('partMaterial').value;   // a spine's material, a pad's kind: the same place
  if (c.sticks) b.content = $('partSticks').value;
  if (c.toxkind) b.content = $('partToxKind').value;   // a toxin sac's Kind: burst / leak
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
  else if (b.content && b.tpl === 'Spine') $('partMaterial').value = b.content;
  else if (b.content && b.tpl === 'Pad') $('partSticks').value = b.content;
  else if (b.tpl === 'Toxin sac') $('partToxKind').value = b.content === 'leak' ? 'leak' : 'burst';
  else if (b.content) $('partContent').value = b.content;
  $('partWhat').value = b.tpl; showControls(); showSection('add');
  $('partAngle').value = b.where; $('partTilt').value = b.tilt;
  $('partSize').value = Math.round(b.size * 100); $('partInside').value = Math.round(b.depth * 100);
  if (b.feels) $('partFeels').value = b.feels;
  $('partFlip').checked = !!b.flip;
  $('partPull').checked = !!b.pull;
  const lc = (CONTROLS[b.tpl] || {}).length;
  if (lc) $('partLength').value = b.length ?? lc.def;   // parts made before Length had the usual length
  showAngle(); showTilt(); showSize(); showInside(); showLength();
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
for (const id of ['partAngle', 'partTilt', 'partSize', 'partInside', 'partLength', 'partFeels', 'partFlip', 'partPull']) $(id).onchange = () => { if (editing) updateEdited(); else updatePreview(); };
$('partContent').onchange = () => { showControls(); previewOn = true; if (editing) updateEdited(); else updatePreview(); };
$('partPigment').onchange = $('partContent').onchange;
$('partMaterial').onchange = $('partContent').onchange;
$('partSticks').onchange = $('partContent').onchange;
$('partToxKind').onchange = $('partContent').onchange;
// while dragging, the ghost follows the slider
for (const id of ['partAngle', 'partTilt', 'partSize', 'partInside', 'partLength']) $(id).addEventListener('input', () => { previewOn = true; updatePreview(); });

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
  for (const inc of c.pieces[0].inclusions) { incPath(inc, bodyXf(c, X, Y)); ctx.stroke(); }
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
  'Burst organ (escape)': 'Spring', 'Spine, protein': 'Spine', 'Spine, glass': 'Spine', 'Light sensor (eyespot)': 'Eyespot',
  'Statolith (which way is up)': 'Statolith', 'Feeler': 'Feeler', 'Peduncle (feeds on others)': 'Peduncle', 'Touch sensor': 'Touch', 'Proximity sensor': 'Proximity', 'Nutrient sensor': 'Nutrients',
  'Buoyancy chamber': 'Chamber', 'Nucleus (the brain)': 'Nucleus', 'Plastid (makes energy)': 'Plastid', 'Kin pad': 'Kin pad', 'Mucus pad': 'Mucus pad' };
const SIDES = ['front', 'front-top', 'top', 'back-top', 'back', 'back-bottom', 'bottom', 'front-bottom'];
// a part's name: the one given, or what it is and where ("Oar (back-bottom)"); the same twice gets a number
function partName(g, all = partGroups(design.parts || [])) {
  const own = (x) => {
    const r = x.members[0], b = r.build;
    if (r.name) return r.name;
    if (r.type === 'rule') return r.label || 'Division';
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
const BUILT_NAME = { energy: 'Energy', starch: 'Starch', oil: 'Oil', health: 'Plastid health', feeding: 'Feeding', size: 'Size', drained: 'Drained', neighbours: 'Neighbours', alarm: 'Alarm', poisoned: 'Poisoned' };
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
  if (kind === 'feeding') return v >= 0.5 ? 'feeding' : 'not feeding';
  if (kind === 'drained') return v >= 0.5 ? 'being drained' : 'not being drained';
  if (kind === 'poisoned') return v <= 0.01 ? 'clean water' : `${pc(v)} poisoned`;
  if (kind === 'alarm') return v <= 0.01 ? 'calm' : `a kin attacked ~${Math.round((1 - v) * PARAMS.alarm.range)} µm away`;
  if (kind === 'neighbours') return `${Math.round(4 * v)}${v >= 1 ? '+' : ''} kin joined`;
  if (kind === 'pad') return v < 0.25 ? 'free' : v < 0.75 ? 'joined to kin' : 'stuck to a stranger';
  if (kind === 'size') return `${sizeX(v)} its newborn volume`;
  if (kind === 'touch') return v >= 0.5 ? 'touching' : 'not touching';
  if (kind === 'near') return v <= 0 ? 'nothing near' : v >= 1 ? 'touching' : `something ${Math.round((1 - v) * nearRange(id))} µm away`;
  if (kind === 'chem') return v < 0.5 ? `poor water (${pc})` : `rich water (${pc})`;
  if (kind === 'flow') return `${zoneAt(KINDS.flow, v)} water (${pc})`;
  return v.toFixed(2);
}
const nearRange = (id) => { const p = (design.parts || []).find((x) => x.id === id); return (p && p.range) || PARAMS.sensor.nearRange; };
// ----- rules as sentences (author, 2026-11-01, from design/wiring-mockup.html): each kind of reading on its own scale,
// with named zones, a verb, and its value in words. `pos` places a reading (0-1) along the drawn scale (light stretched
// at the dim end, the statolith by its angle), `unpos` back. A condition is one range on that scale, the part counting
// while the reading is inside it (or outside: `not`); a range reaching an end of the scale reads "more than" / "less
// than". -----
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const degOf = (v) => Math.asin(Math.min(1, Math.max(-1, 2 * v - 1))) * 180 / Math.PI;
const pc = (v) => `${Math.round(v * 100)}%`;
const sizeX = (v) => `${(1 + v * (PARAMS.grow.max - 1)).toFixed(1)}×`;
const LEVEL_ZONES = [[0, 0.15, 'empty'], [0.15, 0.4, 'low'], [0.4, 0.75, 'half'], [0.75, 1, 'full']];
const KINDS = {
  light: { verb: 'sees', zones: [[0, 0.05, 'dark'], [0.05, 0.25, 'dim'], [0.25, 0.6, 'bright'], [0.6, 1, 'full sun']], u: (v) => `${pc(v)} sun`,
    pos: Math.sqrt, unpos: (p) => p * p },
  statolith: { verb: 'points', more: 'above', less: 'below', zones: [[0, 0.25, 'down'], [0.25, 0.75, 'level'], [0.75, 1, 'up']],
    u: (v) => { const a = Math.round(degOf(v)); return a > 0 ? `+${a}°` : a < 0 ? `−${-a}°` : '0°'; },
    pos: (v) => (degOf(v) + 90) / 180, unpos: (p) => (1 - Math.cos(p * Math.PI)) / 2 },
  energy: { verb: 'is', zones: LEVEL_ZONES, u: pc },
  starch: { verb: 'is', zones: LEVEL_ZONES, u: pc },
  oil: { verb: 'is', zones: LEVEL_ZONES, u: pc },
  health: { verb: 'is', zones: [[0, 0.3, 'wrecked'], [0.3, 0.7, 'hurt'], [0.7, 1, 'healthy']], u: (v) => `${pc(v)} healthy` },
  touch: { verb: 'is', zones: [[0, 0.5, 'not touching'], [0.5, 1, 'touching']], u: (v) => (v >= 0.5 ? 'touching' : 'not touching') },
  size: { verb: 'is', zones: [[0, 1 / 7, 'newborn'], [1 / 7, 3 / 7, 'grown'], [3 / 7, 1, 'big']], u: (v) => sizeX(v) },
  poisoned: { verb: 'is', zones: [[0, 0.05, 'clean water'], [0.05, 0.4, 'a little poisoned'], [0.4, 1, 'badly poisoned']], u: (v) => (v <= 0.01 ? 'clean water' : `${pc(v)} poisoned`) },
  alarm: { verb: 'senses', zones: [[0, 0.05, 'calm'], [0.05, 0.5, 'an attack nearby'], [0.5, 1, 'an attack close by']], u: (v) => (v <= 0.01 ? 'calm' : `an attack ~${Math.round((1 - v) * PARAMS.alarm.range)} µm away`) },
  neighbours: { verb: 'has', zones: [[0, 0.125, 'alone'], [0.125, 0.375, 'a chain end'], [0.375, 0.625, 'in the middle'], [0.625, 1, 'a branch']], u: (v) => `${Math.round(4 * v)}${v >= 1 ? '+' : ''} kin` },
  pad: { verb: 'is', zones: [[0, 0.25, 'free'], [0.25, 0.75, 'joined to kin'], [0.75, 1, 'stuck to a stranger']], u: (v) => (v < 0.25 ? 'free' : v < 0.75 ? 'joined to kin' : 'stuck to a stranger') },
  drained: { verb: 'is', zones: [[0, 0.5, 'not being drained'], [0.5, 1, 'being drained']], u: (v) => (v >= 0.5 ? 'being drained' : 'not being drained') },
  feeding: { verb: 'is', zones: [[0, 0.5, 'not feeding'], [0.5, 1, 'feeding']], u: (v) => (v >= 0.5 ? 'feeding' : 'not feeding') },
  near: { verb: 'feels', zones: [[0, 0.05, 'nothing'], [0.05, 0.5, 'far'], [0.5, 0.95, 'close'], [0.95, 1, 'touching']],
    u: (v, id) => `${Math.round((1 - v) * nearRange(id))} µm` },
  chem: { verb: 'tastes', zones: [[0, 0.5, 'poor water'], [0.5, 1, 'rich water']], u: pc },
  flow: { verb: 'feels the water', zones: [[0, 0.1, 'still'], [0.1, 0.4, 'gently moving'], [0.4, 0.7, 'moving'], [0.7, 1, 'rough']], u: pc },
};
const kindOf = (id) => KINDS[sensorKind(id)] || KINDS.energy;
const posOf = (K, v) => (K.pos ? K.pos(v) : v);
const unposOf = (K, p) => (K.unpos ? K.unpos(p) : p);
const zoneAt = (K, v) => (K.zones.find((z) => v >= z[0] && v < z[1]) || K.zones[K.zones.length - 1])[2];
// a range in words: "more than 5% sun (dim)", "between 5 and 25% sun (dim)", "not between …"
function rangeWords(id, a, b, out) {
  const kind = sensorKind(id), K = kindOf(id), u = (v) => K.u(v, id), z = (v) => ` <span class="z">(${zoneAt(K, v)})</span>`;
  const lo = a <= 0, hi = b >= 1, more = K.more || 'more than', less = K.less || 'less than';
  const bare = (v) => u(v).replace(/ (sun|healthy)$/, '');
  if (lo && hi) return out ? 'never' : 'anything';
  if (kind === 'touch') return hi !== out ? 'touching' : 'not touching';
  if (kind === 'feeding') return hi !== out ? 'feeding' : 'not feeding';
  if (kind === 'drained') return hi !== out ? 'being drained' : 'not being drained';
  if (kind === 'near') {
    if (hi !== out && (hi || lo)) return `something within ${u(hi ? a : b)}`;
    if (lo || hi) return `nothing within ${u(lo ? b : a)}`;
    return `${out ? 'nothing' : 'something'} between ${u(b)} and ${u(a)} away`;
  }
  if (!out) return lo ? `${less} ${u(b)}${z(b - 0.005)}` : hi ? `${more} ${u(a)}${z(a)}`
    : `between ${bare(a)} and ${u(b)}${zoneAt(K, a) === zoneAt(K, b - 0.005) ? z(a) : ''}`;
  return lo ? `${more} ${u(b)}${z(b)}` : hi ? `${less} ${u(a)}${z(a - 0.005)}` : `not between ${bare(a)} and ${u(b)}`;
}
// a sensor's word: its colour dot and name; `ref` makes it tappable (opens the editor on that sensor)
const sensorWord = (id, ref) => {
  const s = sensorInfo(id), html = `${dot(s.colour)}${esc(s.name)}`;
  return ref ? `<span class="w s" data-ed="${ref}">${html}</span>` : `<b class="s">${html}</b>`;
};
const valueWord = (html, ref) => (ref ? `<span class="w v" data-ed="${ref}">${html}</span>` : `<b class="v">${html}</b>`);
// one condition in words: "● Eyespot (top) sees more than 5% sun (dim)"; several sensors: "● A or ● B sees …" (any),
// "● A and ● B sees …" (all), of different kinds each with its own value; a compare: "● A sees more than ● B".
// `ref` ("go:0"): tappable words, each opening the editor on its sensor
const GROUP_NOUN = { light: 'eyespot', statolith: 'statolith', touch: 'feeler', near: 'feeler', flow: 'feeler', chem: 'nutrient sensor' };
// the ids of every sensor of a kind on the design
const kindIds = (kind) => (design.parts || []).filter((x) => x.id && (x.type === 'sensor' || x.material === 'statolith') && sensorKind(x.id) === kind).map((x) => x.id);
function termWords(c, ref) {
  const r = (i) => (ref ? `${ref}:${i}` : null), K = kindOf(c.sensor), verb = `<span class="verb">${K.verb}</span>`;
  if (c.vs !== undefined) return `${sensorWord(c.sensor, r(0))} ${verb} ${valueWord(c.not ? 'less than' : 'more than', r(0))} ${sensorWord(c.vs, r(0))}`;
  const also = c.also || [], all = [c, ...also];
  // its own state (feeding): "it is feeding"
  if (!also.length && (sensorKind(c.sensor) === 'feeding' || sensorKind(c.sensor) === 'drained')) return `it ${verb} ${valueWord(rangeWords(c.sensor, c.min, c.max, c.not), r(0))}`;
  if (!also.length) return `${sensorWord(c.sensor, r(0))} ${verb} ${valueWord(rangeWords(c.sensor, c.min, c.max, c.not), r(0))}`;
  const jw = c.all ? 'and' : 'or', join = ref ? ` <span class="j" data-alsojoin="${ref}" title="Tap: or / and / but not when">${jw}</span> ` : ` ${jw} `;
  // every sensor of one kind on the cell: "any eyespot" / "every eyespot" (author, 2026-11-01: name the group, shorter);
  // the quantifier is tapped to switch any / every, the group word opens the editor (each sensor still listed there)
  const kind = sensorKind(c.sensor), same = also.every((e) => sensorKind(e.sensor) === kind), ofKind = kindIds(kind);
  if (same && GROUP_NOUN[kind] && ofKind.length === all.length && ofKind.every((id) => all.some((e) => e.sensor === id))) {
    const q = c.all ? 'every' : 'any', dots = all.map((e) => dot(sensorInfo(e.sensor).colour)).join('');
    const qw = ref ? `<span class="j" data-groupq="${ref}" title="Tap: any / every">${q}</span>` : q;
    const gw = ref ? `<span class="w s" data-ed="${r(0)}">${dots}${GROUP_NOUN[kind]}</span>` : `<b class="s">${dots}${GROUP_NOUN[kind]}</b>`;
    return `${qw} ${gw} ${verb} ${valueWord(rangeWords(c.sensor, c.min, c.max, c.not), r(0))}`;
  }
  if (same) return `${all.map((e, i) => sensorWord(e.sensor, r(i))).join(join)} ${verb} ${valueWord(rangeWords(c.sensor, c.min, c.max, c.not), r(0))}`;
  return `(${all.map((e, i) => `${sensorWord(e.sensor, r(i))} <span class="verb">${kindOf(e.sensor).verb}</span> ${valueWord(rangeWords(e.sensor, e.min, e.max, c.not), r(i))}`).join(join)})`;
}
// A part's rule as stored, in its reading order: GO conditions (each `or` starting a new group), then the STOP ones;
// each keeps k, its place in the stored list (the living cell's conditions are in that order)
function canon(m) {
  const sh = toShape(rulesOf(m));
  return [...sh.groups.flatMap((g, gi) => g.map((c, ci) => ({ ...c, or: gi > 0 && ci === 0, stop: false }))), ...sh.stops.map((c) => ({ ...c, or: false, stop: true }))];
}
// The rule as one sentence (ref: tappable words, with + buttons). Runs / fires: "Runs when A and B or C, unless D, at
// full speed." A buoyancy chamber: "Floats when …" and "Sinks when …" (sinking wins). The nucleus: "Rests when …".
function sentence(targets, tappable, where) {
  const m = targets[0], verb = verbOf(m), R = canon(m), go = R.filter((c) => !c.stop), st = R.filter((c) => c.stop);
  const k0 = design.parts.indexOf(m), key = partKey(m), ed = tappable && ruleEd && ruleEd.key === key && ruleEd.where === where ? ruleEd : null;
  const term = (c, list, i) => `<span class="term${ed && ed.list === list && ed.i === i ? ' editing' : ''}${c.stop ? ' st' : ''}" data-livecond="${k0}:${c.k}">${termWords(c, tappable ? `${list}:${i}` : null)}</span>`;
  const goWords = () => go.map((c, i) => {
    if (!i) return term(c, 'go', i);
    const neg = !c.or && c.not, w = c.or ? 'or' : neg ? 'but not when' : 'and';   // "A and not B": B turned inside out
    return (tappable ? ` <span class="j" data-join="${i}" title="Tap: or / and / but not when">${w}</span> ` : ` ${w} `) + term(neg ? { ...c, not: false } : c, 'go', i);
  }).join('');
  const stWords = () => st.map((c, i) => (i ? ' or ' : '') + term(c, 'stop', i)).join('');
  const add = (list, label, title) => (tappable ? ` <button class="add" data-add="${list}" title="${title}">${label}</button>` : '');
  const never = (t) => `<span class="never">${t}</span>`;
  if (!nucleiOf(design).length) return `<div class="line">${verb === 'runs' ? 'Runs all the time' : verb === 'feeds' ? 'Feeds whenever it touches another species' : verb === 'holds' ? 'Always holds' : verb === 'bursts' ? 'Never bursts' : verb === 'leaks' ? 'Leaks all the time' : verb === 'shoots' ? 'Never fires' : verb === 'engulfs' ? 'Engulfs whenever it touches a small enough cell' : verb === 'divides' ? 'Divides as soon as it has doubled' : verb === 'floats' ? 'Neutral' : verb === 'rests' ? 'Never rests' : 'Fires only by hand'}: no nucleus. Add a 🧬 Nucleus (Inside the cell) to give it a rule.</div>`;
  if (verb === 'floats') return `<div class="line">Floats ${go.length ? `when ${goWords()}` : never('never')}.${add('go', go.length ? '+ and…' : '+ when…', 'A condition that floats it')}</div>
    <div class="line">Sinks ${st.length ? `when ${stWords()}` : never('never')}.${add('stop', st.length ? '+ or…' : '+ when…', 'A condition that sinks it (sinking wins)')}</div>
    <div class="line small">Sinking wins; neither: neutral, no cost.</div>`;
  if (verb === 'divides') {   // the meter is always the first condition
    let s = `Divides once it has doubled${go.length ? ` and ${goWords()}` : ''}`;
    if (st.length) s += `, <span class="unl">unless</span> ${stWords()}`;
    return `<div class="line">${s}.${add('go', '+ and…', 'Wait to divide until this holds too (e.g. after dawn)')}${add('stop', '+ unless…', 'Never divide while this holds')}</div>`;
  }
  const V = { runs: 'Runs', fires: 'Fires', shoots: 'Fires', leaks: 'Leaks', rests: 'Rests', feeds: 'Feeds', holds: 'Holds', bursts: 'Bursts', engulfs: 'Engulfs' }[verb];
  const none = verb === 'runs' ? never('all the time') : verb === 'holds' ? never('always') : verb === 'bursts' || verb === 'shoots' ? never('never') : verb === 'leaks' ? never('all the time') : verb === 'engulfs' ? never('whenever it touches a small enough cell') : verb === 'feeds' ? never('whenever it touches another species') : verb === 'rests' ? never('never') : never('only by hand (⚡ Release)');
  let s = `${V} ${go.length ? `${verb === 'holds' ? 'while' : 'when'} ${goWords()}` : none}`;
  if (st.length) s += `, <span class="unl">unless</span> ${stWords()}`;
  if (verb === 'runs') {
    const sp = m.joint.speed;
    const sw = sp ? `faster as ${sensorWord(sp.sensor)} reads ${sp.down ? 'less' : 'more'}` : 'at full speed';
    s += `, ${tappable ? `<span class="w sp${ed && ed.list === 'speed' ? ' editing' : ''}" data-ed="speed:0:0">${sw}</span>` : sw}`;
  }
  s += '.';
  if (verb === 'rests') s += ' <span class="small">(upkeep and income at 40%, flagella stop)</span>';
  if (verb === 'engulfs') s += ` <span class="small">(swallows another species' cell touching its mouth whole, if it is at most half as wide as this one and fits in its free room; digests it over a minute)</span>`;
  if (verb === 'shoots') s += ` <span class="small">(throws the spine straight out ${PARAMS.harpoon.range} µm, blind: a cell's body in its line, kin too, is stunned ${PARAMS.harpoon.stun} s and loses ${PARAMS.harpoon.venom / 1000}k pJ + ${Math.round(100 * PARAMS.harpoon.wound)}% of its energy (less than that and it dies); it grows back in ${PARAMS.harpoon.reload} s, ${PARAMS.harpoon.cost / 1000}k pJ per µm)</span>`;
  if (verb === 'leaks') s += ` <span class="small">(toxin into the water: a cloud that drifts, spreads and fades; other species in it lose energy and plastid health; kin are immune)</span>`;
  if (verb === 'bursts') s += ` <span class="small">(dies, poisoning other species within ${PARAMS.toxin.range} µm: kin are immune)</span>`;
  if (verb === 'holds') s += ` <span class="small">(${m.kind === 'mucus' ? 'sticks to anything it touches, weakly' : 'joins a kin pad it touches, and its daughter at division: chains'}; while this fails it lets go and won't stick)</span>`;
  if (verb === 'feeds') s += ` <span class="small">(latches on another species' body it touches: ${PARAMS.feed.pierce * m.length / 1000}k pJ to pierce; lets go when this stops holding)</span>`;
  return `<div class="line">${s}${add('go', go.length ? '+ and…' : '+ when…', 'A condition it needs')}${add('stop', '+ unless…', 'Something that stops it, whatever the rest says')}</div>`;
}
// the folded card: the same sentence, plain
const ruleSummary = (targets) => sentence(targets, false);

// ----- wiring: which sensors drive a part. A rule is a list of conditions (a sensor and a range of its reading, or
// outside it) in groups: AND inside a group, OR between groups. A target is what one rule drives: every motor of a tail,
// a burst organ or an ejectisome. Rewiring changes the design and the cells already in the tank
// as they are: no reset. -----
const RANGE = { poisoned: [0.05, 1], alarm: [0.05, 1], neighbours: [0.375, 1], pad: [0.25, 1], drained: [0.5, 1], size: [3 / 7, 1], feeding: [0.5, 1], health: [0, 0.7], starch: [0.2, 1], oil: [0.2, 1], light: [0.5, 1], touch: [0.5, 1], near: [0.3, 1], flow: [0.4, 1], energy: [0.3, 1], statolith: [0.6, 1], chem: [0.5, 1] };   // a sensible start
const ICON = { poisoned: '☠', alarm: '🚨', neighbours: '🔗', pad: '🧷', drained: '🩸', size: '📏', feeding: '🍽', health: '🌿', starch: '🍚', oil: '🫒', light: '👁', touch: '✋', near: '📡', flow: '🌊', energy: '⚡', statolith: '⚖', chem: '🧪' };
// what a sensor id is: 'energy' (built in), or the kind of the design part with that id
function sensorKind(id) {
  if (id === 'energy' || id === 'starch' || id === 'oil' || id === 'health' || id === 'feeding' || id === 'size' || id === 'drained' || id === 'neighbours' || id === 'alarm' || id === 'poisoned') return id;
  const p = (design.parts || []).find((x) => x.id === id) || {};
  if (p.type === 'pad') return 'pad';
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
  // its pads (what each holds) and how many kin it is joined to (author 2026-11-02: pads that sense; Neighbours)
  const padGroups = all.filter((g) => g.category === 'Pads' && g.members[0].id);
  for (const g of padGroups) list.push({ id: g.members[0].id, name: `${partName(g, all)} (free / joined to kin / stuck to a stranger)`, short: partName(g, all), kind: 'pad', colour: colourOf(g) });
  if (padGroups.some((g) => g.members[0].kind !== 'mucus')) list.push({ id: 'neighbours', name: 'its neighbours (how many kin it is joined to)', short: 'Neighbours', kind: 'neighbours' });
  list.push({ id: 'alarm', name: 'alarm (a kin nearby is being drained: how near)', short: 'Alarm', kind: 'alarm' });
  list.push({ id: 'poisoned', name: 'poisoned (another species\' toxin in the water round it: how strong)', short: 'Poisoned', kind: 'poisoned' });
  list.push({ id: 'drained', name: 'drained (another cell\'s peduncle is latched on it)', short: 'Drained', kind: 'drained' });
  list.push({ id: 'size', name: 'its size (how grown it is: 1× newborn, 2× ready to divide)', short: 'Size', kind: 'size' });
  if ((design.parts || []).some((p) => p.joint && p.joint.type === 'feed'))
    list.push({ id: 'feeding', name: 'feeding (its peduncle latched on prey)', short: 'Feeding', kind: 'feeding' });
  return list;
}
const targetsOf = (g) => g.members.filter((m) => m.joint && (m.joint.type === 'motor' || m.joint.type === 'chamber' || m.joint.type === 'rest' || m.joint.type === 'feed' || m.joint.type === 'divide' || m.joint.type === 'hold' || m.joint.type === 'lyse' || m.joint.type === 'leak' || m.joint.type === 'engulf' || m.joint.type === 'fire' || m.joint.latched));
// how a target acts: 'runs' (a motor), 'fires' (a burst organ, a latched part)
const verbOf = (m) => (m.joint.type === 'divide' ? 'divides' : m.joint.type === 'fire' ? 'shoots' : m.joint.type === 'engulf' ? 'engulfs' : m.joint.type === 'lyse' ? 'bursts' : m.joint.type === 'leak' ? 'leaks' : m.joint.type === 'hold' ? 'holds' : m.joint.type === 'feed' ? 'feeds' : m.joint.type === 'rest' ? 'rests' : m.joint.type === 'chamber' ? 'floats' : m.joint.type === 'motor' && !m.joint.burst ? 'runs' : 'fires');
// A part's rule as the card shows it: GO groups (all of a group must hold: AND; any group will do: OR) and STOP
// conditions (any one stops the part, whatever the GO groups say: the override). Stored as one list: GO conditions in
// their groups (or: true starts a group), then STOP ones (stop: true).
function rulesOf(m) {
  const raw = controlsOf(m.joint);
  let any = false;
  return raw.map((c) => {
    const r = { sensor: c.sensor, min: c.when === 'light' ? 0.5 : c.min ?? 0, max: c.when === 'dark' ? 0.5 : c.max ?? 1,
      ...(c.vs !== undefined ? { vs: c.vs } : {}), not: !!c.not, or: false, stop: !!c.stop,
      ...(c.also && c.also.length && c.vs === undefined ? { also: c.also.map((e) => ({ sensor: e.sensor, min: e.min ?? 0, max: e.max ?? 1 })), all: !!c.all } : {}) };
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
  if (next.some((c) => c.vs === undefined && (!(c.min <= c.max) || (c.also || []).some((e) => !(e.min <= e.max))))) { $('buildErr').textContent = 'a range must run from low to high'; return false; }
  // only true marks are stored, and the first GO condition never starts a new group
  const clean = next.map((c) => ({ sensor: c.sensor, ...(c.vs !== undefined ? { vs: c.vs } : { min: c.min, max: c.max }),
    ...(c.not ? { not: true } : {}), ...(c.or && !c.stop ? { or: true } : {}), ...(c.stop ? { stop: true } : {}),
    ...(c.also && c.also.length && c.vs === undefined ? { also: c.also.map((e) => ({ sensor: e.sensor, min: e.min, max: e.max })), ...(c.all ? { all: true } : {}) } : {}) }));
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
  if (patchOpen) $('patchHint').textContent = `🧬 ${full}`;
  return false;
}
const freshRule = (id) => ({ sensor: id, min: RANGE[sensorKind(id)][0], max: RANGE[sensorKind(id)][1], not: false });

// ----- writing a rule: the card's sentence and its editor change the design (and the cells in the tank, no reset) -----
// the extra sensors of a condition kept tidy: none twice, never the first one, and those of the first one's kind on its values
function tidyAlso(c) {
  if (!c.also) return c;
  const k = sensorKind(c.sensor), seen = new Set([c.sensor]);
  const also = c.also.filter((e) => !seen.has(e.sensor) && seen.add(e.sensor)).map((e) => (sensorKind(e.sensor) === k ? { ...e, min: c.min, max: c.max } : e));
  if (!also.length) { const { also: _, all, ...rest } = c; return rest; }
  return { ...c, also };
}
// write the GO list (each `or` starting a group) and the STOP list back
function writeRule(targets, go, st) {
  return setRules(targets, [...go.map((c, i) => ({ ...c, stop: false, or: i > 0 && !!c.or })), ...st.map((c) => ({ ...c, or: false, stop: true }))]);
}
const listsOf = (m) => { const R = canon(m); return { go: R.filter((c) => !c.stop), st: R.filter((c) => c.stop) }; };
function writeTerm(targets, list, i, c) {
  const L = listsOf(targets[0]);
  (list === 'stop' ? L.st : L.go)[i] = tidyAlso(c);
  return writeRule(targets, L.go, L.st);
}

// ----- the rule card: the sentence, its editor under it while a word is open, copy / paste. The same card in the parts
// list and in the Nucleus board; the editor opens only in the one tapped. -----
let ruleEd = null;   // { key, list: 'go' | 'stop' | 'speed', i, ei (which of the condition's sensors), where: 'list' | 'board' }
function ruleCard(targets, where = 'list') {
  const m = targets[0], verb = verbOf(m), key = partKey(m);
  const card = document.createElement('div');
  card.className = 'wire rcard';
  card.innerHTML = `<div class="say">${sentence(targets, true, where)}</div>`;
  card.onclick = (e) => {
    linkFocus = key;   // its links are drawn on the cell
    const t = e.target.closest('[data-ed], [data-join], [data-add], [data-alsojoin], [data-groupq]');
    if (!t) return;
    e.stopPropagation();
    if (t.dataset.ed) {
      const [list, i, ei] = t.dataset.ed.split(':');
      const same = ruleEd && ruleEd.key === key && ruleEd.list === list && ruleEd.i === +i && ruleEd.where === where && ruleEd.ei === +ei;
      ruleEd = same ? null : { key, list, i: +i, ei: +ei, where };
      listParts();
    } else if (t.dataset.join) {   // and -> or (a new group starts here) -> and not (this condition turned inside out) -> and
      const L = listsOf(m), i = +t.dataset.join, c = L.go[i];
      L.go[i] = !c.or && !c.not ? { ...c, or: true } : c.or ? { ...c, or: false, not: !c.not } : { ...c, not: false };
      writeRule(targets, L.go, L.st);
    } else if (t.dataset.groupq) {   // "any eyespot" <-> "every eyespot"
      const [list, i] = t.dataset.groupq.split(':'), L = listsOf(m), arr = list === 'stop' ? L.st : L.go;
      arr[+i] = tidyAlso({ ...arr[+i], all: !arr[+i].all });
      writeRule(targets, L.go, L.st);
    } else if (t.dataset.alsojoin) {   // inside one condition: or -> and -> and not (the last sensor becomes its own condition, inside out)
      const [list, i] = t.dataset.alsojoin.split(':'), L = listsOf(m), arr = list === 'stop' ? L.st : L.go, c = { ...arr[+i] };
      if (!c.all) c.all = true;
      else if (list === 'stop') c.all = false;   // an unless can't hold an "and not"
      else {
        const e = c.also[c.also.length - 1], same = sensorKind(e.sensor) === sensorKind(c.sensor);
        c.also = c.also.slice(0, -1); c.all = false;
        arr.splice(+i + 1, 0, { sensor: e.sensor, min: same ? c.min : e.min, max: same ? c.max : e.max, not: !c.not, or: false });
      }
      arr[+i] = tidyAlso(c);
      writeRule(targets, L.go, L.st);
    } else if (t.dataset.add) {
      const L = listsOf(m), used = new Set([...L.go, ...L.st].map((c) => c.sensor)), sensors = sensorList();
      const pick = (sensors.find((s) => !used.has(s.id)) || sensors[0]).id;
      const list = t.dataset.add, arr = list === 'stop' ? L.st : L.go;
      arr.push(freshRule(pick));
      if (writeRule(targets, L.go, L.st)) { ruleEd = { key, list, i: arr.length - 1, ei: 0, where }; listParts(); }
    }
  };
  if (nucleiOf(design).length) card.appendChild(runMapEl(targets));
  if (ruleEd && ruleEd.key === key && ruleEd.where === where) card.appendChild(ruleEditor(targets));
  if (!nucleiOf(design).length) return card;
  // copy this rule, to paste into another part and adjust (author, 2026-10-28)
  const here = ruleClip && ruleClip.key !== key && ruleClip.verb === verb;
  const tools = document.createElement('div'); tools.className = 'rtools';
  const cp = document.createElement('button');
  cp.textContent = ruleClip && ruleClip.key === key ? '✓ Rule copied' : '⧉ Copy rule';
  cp.title = 'Copy this rule (with its unless and beat speed), to paste into another part';
  cp.onclick = () => { ruleClip = { key, verb, name: partName(groupOfPart(m)), colour: colourOf(groupOfPart(m)), rules: rulesOf(m), speed: m.joint.speed ? { ...m.joint.speed } : null }; listParts(); };
  tools.appendChild(cp);
  if (here) {
    const ps = document.createElement('button');
    ps.innerHTML = `📋 Paste rule from ${dot(ruleClip.colour)}${esc(ruleClip.name)}`;
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

// ----- the editor: which sensor (or sensors: any / all of them), inside or outside a range, or more / less than
// another sensor; the range on the sensor's own scale (drag its ends, or tap a zone's name), and the reading over the
// last day lit where it counts -----
const SVGW = 320;
const xAt = (K, v) => 12 + posOf(K, v) * 296;
const vAt = (K, px) => (px < 20 ? 0 : px > SVGW - 20 ? 1 : Math.round(unposOf(K, Math.max(0, Math.min(1, (px - 12) / 296))) * 100) / 100);
const inside = (v, a, b) => (a <= 0 || v >= a) && (b >= 1 || v <= b);
// the scale: zones (tap a name: that zone), the band where it counts, the two ends, and a needle for the reading now
// (moved every frame, data-needle). `speed`: the band runs from stopped to full
function scaleSVG(id, a, b, out, colour, speed) {
  const K = kindOf(id), X = (v) => xAt(K, v);
  let s = '';
  K.zones.forEach((z, i) => {
    const sel = !speed && !out && Math.abs(a - z[0]) < 1e-6 && Math.abs(b - z[1]) < 1e-6;
    s += `<rect x="${X(z[0])}" y="18" width="${X(z[1]) - X(z[0])}" height="18" fill="${i % 2 ? '#14223a' : '#101b2c'}"/>`;
    if (!speed) s += `<rect x="${X(z[0]) + 2}" y="43" width="${Math.max(0, X(z[1]) - X(z[0]) - 4)}" height="16" rx="8" fill="${sel ? colour : '#16243a'}" fill-opacity="${sel ? 0.25 : 1}" stroke="${sel ? colour : '#2a3d58'}"/>`;
    s += `<text x="${(X(z[0]) + X(z[1])) / 2}" y="${speed ? 50 : 55}" text-anchor="middle" fill="${sel ? '#dce7ec' : '#8398aa'}" font-size="10.5">${z[2]}</text>`;
  });
  const bands = speed ? [[a, b]] : out ? [[0, a], [b, 1]] : [[a, b]];
  if (speed) s += `<defs><linearGradient id="spg"><stop offset="0" stop-color="${colour}" stop-opacity="${speed === 'down' ? 0.9 : 0.1}"/><stop offset="1" stop-color="${colour}" stop-opacity="${speed === 'down' ? 0.1 : 0.9}"/></linearGradient></defs>`;
  for (const [l, h] of bands) if (h > l) s += `<rect x="${X(l)}" y="22" width="${X(h) - X(l)}" height="10" rx="3" fill="${speed ? 'url(#spg)' : colour}" fill-opacity="${speed ? 1 : 0.75}"/>`;
  s += `<g data-needle="${esc(id)}" style="display:none"><line x1="0" x2="0" y1="14" y2="40" stroke="#ff8a3c" stroke-width="2.5"/><text x="0" y="10" text-anchor="middle" fill="#ff8a3c" font-size="10"></text></g>`;
  for (const v of [a, b]) { const end = v <= 0 || v >= 1; s += `<circle cx="${X(v)}" cy="27" r="${end ? 6 : 8}" fill="${end ? '#16243a' : '#dce7ec'}" stroke="${colour}" stroke-width="2.5"/>`; }
  return s;
}
// the reading over a day: light at the cell's depth now (as it faces now), the stores and energy from the journal of the
// last day; null when there is none (tilt and touch don't follow the clock)
function dayTrace(id) {
  const live = cell && cell.design === design ? cell : null, kind = sensorKind(id);
  if (!live) return null;
  const hourOf = (t) => { const h = 6 + 24 * (t / PARAMS.metab.day + PARAMS.metab.dawn); return h - 24 * Math.floor(h / 24); };
  if (kind === 'light') {
    if (!world.light) return null;
    const depth = TH - live.q[1], here = lightAt(world, live.q[1]), sn = liveReading(live, id);
    const f = here > 0.01 && sn ? Math.max(PARAMS.sensor.scatter, Math.min(1, sn.value / here)) : 1;   // facing away it still sees the scattered share
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const h = i / 4, sun = world.day ? Math.sqrt(Math.max(0, Math.sin(2 * Math.PI * (h - 6) / 24))) : 1;
      pts.push([h, PARAMS.light.strength * sun * Math.exp(-PARAMS.light.attenuation * depth) * f]);
    }
    return { pts, where: `a day at this depth (${Math.round(depth)} µm)${f < 0.97 ? ', facing as now' : ''}` };
  }
  const field = { energy: 'E', starch: 'starch', oil: 'oil', health: 'health', chem: 'depth' }[kind];
  if (!field || !live.journal || live.journal.s.length < 2) return null;
  const from = worldTime(world) - PARAMS.metab.day;
  const pts = live.journal.s.filter((x) => x.t > from && x[field] !== null && x[field] !== undefined)
    .map((x) => [hourOf(x.t), kind === 'chem' ? Math.min(1, nitrogenAt(world, TH - x.depth, live.q[0])) : x[field]]);
  return pts.length > 1 ? { pts, where: 'its last day', span: (live.journal.s[live.journal.s.length - 1].t - Math.max(from, live.journal.s[0].t)) / PARAMS.metab.day } : null;
}
function traceSVG(id, test, colour) {
  const tr = dayTrace(id);
  if (!tr) return { svg: '', note: sensorKind(id) === 'statolith' ? 'The way it points does not follow the clock: tilt the cell (⟲ ⟳) to see it count or not.'
    : cell && cell.design === design ? 'No day to show for this reading yet.' : 'Select a cell of this design in the tank to see its day.' };
  const K = kindOf(id), T = (h) => 8 + h / 24 * 304, Y = (v) => 70 - posOf(K, Math.max(0, Math.min(1, v))) * 60;
  let s = `<rect x="8" y="10" width="304" height="60" fill="#0c1524" stroke="#22324a"/>`;
  for (const h of [6, 12, 18]) s += `<line x1="${T(h)}" x2="${T(h)}" y1="10" y2="70" stroke="#22324a"/><text x="${T(h)}" y="82" text-anchor="middle" fill="#5a6f84" font-size="10">${String(h).padStart(2, '0')}:00</text>`;
  let line = '', lit = '', on = 0;
  tr.pts.forEach(([h, v], i) => {
    const P = `${T(h).toFixed(1)},${Y(v).toFixed(1)}`, wrap = i && h < tr.pts[i - 1][0];
    line += `${wrap || !i ? ' M' : ' L'}${P}`;
    const ok = test(v), prev = i && !wrap && test(tr.pts[i - 1][1]);
    if (ok) { lit += `${prev ? ' L' : ' M'}${P}`; on++; }
  });
  s += `<path d="${line}" fill="none" stroke="${colour}" stroke-width="1.5" opacity=".7"/><path d="${lit}" fill="none" stroke="${colour === '#ff8a7a' ? '#ff6f6f' : '#6fe0a0'}" stroke-width="3.5" stroke-linecap="round"/>`;
  s += `<line x1="${T(clock(world))}" x2="${T(clock(world))}" y1="10" y2="70" stroke="#ff8a3c" stroke-dasharray="3 3"/>`;
  const hrs = on / tr.pts.length * 24 * (tr.span || 1);
  return { svg: s, note: `Over ${tr.where}: it would count for about ${hrs.toFixed(1)} h.` };
}
function ruleEditor(targets) {
  const m = targets[0], ed = ruleEd, box = document.createElement('div');
  box.className = 'red';
  box.onclick = (e) => e.stopPropagation();
  if (ed.list === 'speed') return speedEditor(targets, box);
  const L = listsOf(m), src = (ed.list === 'stop' ? L.st : L.go)[ed.i];
  if (!src) { ruleEd = null; return box; }
  const c = JSON.parse(JSON.stringify(src)); delete c.k;
  const sensors = sensorList(), cmp = c.vs !== undefined, also = c.also || [];
  const ei = cmp ? 0 : Math.min(ed.ei || 0, also.length), sid = ei ? also[ei - 1].sensor : c.sensor;
  const shared = ei > 0 && sensorKind(sid) === sensorKind(c.sensor);
  const rng = () => (ei === 0 || shared ? c : c.also[ei - 1]);   // whose range the scale moves
  const stop = ed.list === 'stop', colour = stop ? '#ff8a7a' : '#6fd3b5';
  const commit = () => writeTerm(targets, ed.list, ed.i, c);
  ruleEdPick = (id) => { const b = box.querySelector(`[data-pick="${CSS.escape(id)}"]`); if (b) b.click(); };
  const head = stop ? (verbOf(m) === 'floats' ? 'Sinks when' : 'Stops it') : (verbOf(m) === 'floats' ? 'Floats when' : 'It needs');
  const chip = (s, attr, on) => `<button class="sbtn${on ? ' on' : ''}" ${attr} style="--c:${s.colour || '#8197a8'}"><i></i>${esc(s.short)}</button>`;
  const inCond = [c.sensor, ...also.map((e) => e.sensor)];
  const free = sensors.filter((s) => !inCond.includes(s.id));
  let h = `<div class="edq"><span class="edh ${stop ? 'st' : ''}">${head}</span> <span data-edq>${termWords(c)}</span></div>`;
  if (!cmp && also.length) h += `<div class="lab">Sensors in this condition</div><div class="row">${inCond.map((id, i) => chip({ ...sensorInfo(id), short: sensorInfo(id).name }, `data-ei="${i}"`, i === ei)).join('')}
    <button class="sbtn" data-anyall title="Any one of them reading so is enough, or all must">${c.all ? 'ALL of them' : 'ANY of them'}</button>${ei ? '<button class="sbtn" data-unei title="Take this sensor out of the condition">✕ out</button>' : ''}</div>`;
  h += `<div class="lab">Listens to${also.length ? ' (the one picked above)' : ''} · or tap a sensor on the cell</div><div class="row">${sensors.map((s) => chip(s, `data-pick="${esc(s.id)}"`, s.id === sid)).join('')}</div>`;
  if (!cmp && free.length) h += `<div class="row"><button class="add" data-plus title="Another sensor in this condition (say both eyespots): any of them, or all of them">+ another sensor</button></div>`;
  h += `<div class="lab">Counts when the reading is</div><div class="seg"><button data-out="0" class="${!cmp && !c.not ? 'on' : ''}">inside the range</button><button data-out="1" class="${!cmp && c.not ? 'on' : ''}">outside it</button>${sensors.length > 1 ? `<button data-cmp class="${cmp ? 'on' : ''}" title="More or less than another sensor's reading (say the right eyespot more than the left)">than another sensor</button>` : ''}</div>`;
  if (cmp) {
    h += `<div class="seg"><button data-less="0" class="${!c.not ? 'on' : ''}">more than</button><button data-less="1" class="${c.not ? 'on' : ''}">less than</button></div>
      <div class="row">${sensors.filter((s) => s.id !== c.sensor).map((s) => chip(s, `data-vs="${esc(s.id)}"`, s.id === c.vs)).join('')}</div>
      <div class="note">Now: ${esc(sensorInfo(c.sensor).name)} <b data-live="${esc(c.sensor)}" data-mean="${sensorKind(c.sensor)}">–</b> · ${esc(sensorInfo(c.vs).name)} <b data-live="${esc(c.vs)}" data-mean="${sensorKind(c.vs)}">–</b></div>`;
  } else {
    h += `<div class="lab">Range · drag its ends, or tap a zone's name</div><svg class="scale" viewBox="0 0 ${SVGW} 64"></svg>
      <div class="lab">Its day · lit where it counts</div><svg class="trace" viewBox="0 0 ${SVGW} 86"></svg><div class="note" data-tnote></div>`;
  }
  h += `<div class="edfoot"><button class="del" data-del>Remove</button><button class="done" data-done>Done</button></div>`;
  box.innerHTML = h;
  const redraw = () => {
    box.querySelector('[data-edq]').innerHTML = termWords(c);
    // the card's map follows the change as it is dragged
    const mp = box.closest('.rcard') && box.closest('.rcard').querySelector('.rmap');
    if (mp) { const L2 = listsOf(m); (stop ? L2.st : L2.go)[ed.i] = c; mp.querySelector('.cap').innerHTML = drawRunMap(mp.querySelector('canvas'), m, [...L2.go, ...L2.st]); }
    if (cmp) return;
    const r = rng();
    box.querySelector('.scale').innerHTML = scaleSVG(sid, r.min, r.max, c.not, colour);
    const t = traceSVG(sid, (v) => inside(v, r.min, r.max) !== !!c.not, colour);
    box.querySelector('.trace').innerHTML = t.svg; box.querySelector('.trace').style.display = t.svg ? '' : 'none';
    box.querySelector('[data-tnote]').textContent = t.note;
  };
  redraw();
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.done !== undefined) { ruleEd = null; listParts(); return; }
    if (d.del !== undefined) {
      const L2 = listsOf(m); (stop ? L2.st : L2.go).splice(ed.i, 1);
      if (!stop && L2.go[0]) L2.go[0].or = false;
      ruleEd = null; writeRule(targets, L2.go, L2.st); return;
    }
    if (d.ei !== undefined) { ruleEd = { ...ed, ei: +d.ei }; listParts(); return; }
    if (d.anyall !== undefined) c.all = !c.all;
    else if (d.unei !== undefined) { c.also.splice(ei - 1, 1); ruleEd = { ...ed, ei: 0 }; }
    else if (d.plus !== undefined) {
      const pick = free.find((s) => s.kind === sensorKind(c.sensor)) || free[0], f = pick.kind === sensorKind(c.sensor) ? c : freshRule(pick.id);
      c.also = [...also, { sensor: pick.id, min: f.min, max: f.max }];
      ruleEd = { ...ed, ei: c.also.length };
    } else if (d.pick) {
      if (cmp) { c.sensor = d.pick; if (c.vs === d.pick) c.vs = (sensors.find((s) => s.id !== d.pick) || {}).id; }
      else if (ei === 0) { if (sensorKind(d.pick) !== sensorKind(c.sensor)) { const f = freshRule(d.pick); c.min = f.min; c.max = f.max; } c.sensor = d.pick; }
      else { const f = sensorKind(d.pick) === sensorKind(c.sensor) ? c : freshRule(d.pick); c.also[ei - 1] = { sensor: d.pick, min: f.min, max: f.max }; }
    } else if (d.out !== undefined) {
      if (cmp) { delete c.vs; const f = freshRule(c.sensor); c.min = f.min; c.max = f.max; }
      c.not = d.out === '1';
    } else if (d.cmp !== undefined) {
      if (cmp) return;
      c.vs = (sensors.find((s) => s.id !== c.sensor && s.kind === sensorKind(c.sensor)) || sensors.find((s) => s.id !== c.sensor)).id;
      delete c.also; delete c.all; c.not = false;
    } else if (d.less !== undefined) c.not = d.less === '1';
    else if (d.vs) c.vs = d.vs;
    else return;
    commit();
  });
  if (!cmp) dragScale(box.querySelector('.scale'), sid, rng, () => { redraw(); }, commit, (z) => { const r = rng(); r.min = z[0]; r.max = z[1]; c.not = false; commit(); });
  return box;
}
// dragging a scale's ends (the nearer one; they swap if crossed; past the last few px it snaps to the scale's end), or
// tapping a zone's name (onZone)
function dragScale(svg, id, rng, onMove, onDone, onZone, minGap = 0) {
  let which = null;
  const at = (e) => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * SVGW, (e.clientY - r.top) / r.height * 64]; };
  svg.addEventListener('pointerdown', (e) => {
    const K = kindOf(id), [px, py] = at(e), r = rng();
    if (py > 40 && onZone) { const z = K.zones.find((q) => px >= xAt(K, q[0]) && px <= xAt(K, q[1])); if (z) onZone(z); return; }
    which = Math.abs(px - xAt(K, r.max)) < Math.abs(px - xAt(K, r.min)) || (r.min === r.max && px > xAt(K, r.min)) ? 'max' : 'min';
    svg.setPointerCapture(e.pointerId); move(e);
  });
  const move = (e) => {
    if (!which) return;
    const r = rng(), v = vAt(kindOf(id), at(e)[0]);
    r[which] = v;
    if (r.min > r.max) { [r.min, r.max] = [r.max, r.min]; which = which === 'min' ? 'max' : 'min'; }
    if (minGap && r.max - r.min < minGap) { if (which === 'max') r.max = Math.min(1, r.min + minGap); else r.min = Math.max(0, r.max - minGap); }
    onMove();
  };
  svg.addEventListener('pointermove', move);
  const up = () => { if (which) { which = null; onDone(); } };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
}
// the beat speed: always full, or following a reading (up: stopped at the low end of its range, full at the high end;
// down: the other way round)
function speedEditor(targets, box) {
  ruleEdPick = null;
  const sp0 = targets[0].joint.speed, sp = sp0 ? { ...sp0 } : null, sensors = sensorList();
  let h = `<div class="edq"><span class="edh">Beat speed</span></div><div class="row"><button class="sbtn${sp ? '' : ' on'}" data-sp="">always full</button>${sensors.map((s) => `<button class="sbtn${sp && sp.sensor === s.id ? ' on' : ''}" data-sp="${esc(s.id)}" style="--c:${s.colour || '#8197a8'}"><i></i>follows ${esc(s.short)}</button>`).join('')}</div>`;
  if (sp) h += `<div class="seg"><button data-dir="up" class="${sp.down ? '' : 'on'}">faster as it reads more</button><button data-dir="down" class="${sp.down ? 'on' : ''}">faster as it reads less</button></div>
    <div class="lab">${sp.down ? 'Full speed at the left end, stopped at the right' : 'Stopped at the left end, full speed at the right'} · drag the ends</div><svg class="scale" viewBox="0 0 ${SVGW} 64"></svg>
    <div class="lab">Its day</div><svg class="trace" viewBox="0 0 ${SVGW} 86"></svg><div class="note" data-tnote></div>`;
  h += `<div class="edfoot"><button class="done" data-done>Done</button></div>`;
  box.innerHTML = h;
  if (sp) {
    const redraw = () => {
      box.querySelector('.scale').innerHTML = scaleSVG(sp.sensor, sp.min, sp.max, false, '#ffd84a', sp.down ? 'down' : 'up');
      const t = traceSVG(sp.sensor, (v) => (sp.down ? v < sp.max : v > sp.min), '#6fd3b5');
      box.querySelector('.trace').innerHTML = t.svg; box.querySelector('.trace').style.display = t.svg ? '' : 'none';
      box.querySelector('[data-tnote]').textContent = t.note.replace('it would count', 'it would beat');
    };
    redraw();
    dragScale(box.querySelector('.scale'), sp.sensor, () => sp, redraw, () => setSpeed(targets, sp), null, 0.05);
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.done !== undefined) { ruleEd = null; listParts(); return; }
    if (b.dataset.sp !== undefined) setSpeed(targets, b.dataset.sp ? { sensor: b.dataset.sp, min: 0, max: 1, ...(sp && sp.down ? { down: true } : {}) } : null);
    else if (b.dataset.dir) setSpeed(targets, { ...sp, down: b.dataset.dir === 'down' });
  });
  return box;
}

// ----- the map of when it runs (author's mock-up, 2026-11-01): time of day across, depth down, coloured where the rule
// would make the part act. A guess from the rule alone: light sensors read the light at that hour and depth (facing as
// they face now), energy and stores as they were at that hour over the last day (or as now), anything else as now. -----
const MAP_W = 192, MAP_H = 64;
// what each reading would be at hour h, depth dz (µm): a function (id) => value
function mapReader(live) {
  const L = PARAMS.light, facing = {}, byHour = {};
  if (live) {
    // each eyespot as squarely as it has faced the light lately (the journal's running mean); none yet: facing up
    const face = (live.journal && live.journal.face) || {};
    for (const s of live.sensors) if (s.kind === 'light') facing[s.id] = face[s.id] !== undefined ? Math.max(PARAMS.sensor.scatter, face[s.id]) : 1;
    const j = live.journal, from = worldTime(world) - PARAMS.metab.day;
    if (j) for (const x of j.s) if (x.t > from) {
      const h = Math.floor(clockOf(x.t)) % 24;
      for (const [id, f] of [['energy', 'E'], ['starch', 'starch'], ['oil', 'oil'], ['health', 'health']]) if (x[f] !== null && x[f] !== undefined) {
        const b = byHour[id] || (byHour[id] = Array.from({ length: 24 }, () => [0, 0]));
        b[h][0] += x[f]; b[h][1]++;
      }
    }
  }
  return (h, dz) => (id) => {
    const kind = sensorKind(id);
    if (kind === 'light') {
      if (!world.light) return 0;
      const sun = world.day ? Math.sqrt(Math.max(0, Math.sin(2 * Math.PI * (h - 6) / 24))) : 1;
      return L.strength * sun * Math.exp(-L.attenuation * dz) * (facing[id] ?? 1);
    }
    if (kind === 'chem') return Math.min(1, nitrogenAt(world, TH - dz, cell ? cell.q[0] : undefined));
    const b = byHour[id] && byHour[id][Math.floor(h) % 24];
    if (b && b[1]) return b[0] / b[1];
    const r = live && liveReading(live, id);
    return r ? r.value : 0.5;
  };
}
const clockOf = (t) => { const h = 6 + 24 * (t / PARAMS.metab.day + PARAMS.metab.dawn); return h - 24 * Math.floor(h / 24); };
// one condition, without hysteresis
function condHolds(c, read) {
  const one = (id, a, b) => { const v = read(id); return (a <= 0 || v >= a) && (b >= 1 || v <= b); };
  if (c.vs !== undefined) return (read(c.sensor) - read(c.vs) > PARAMS.sensor.compareMargin) !== !!c.not;
  let ok = one(c.sensor, c.min, c.max);
  for (const e of c.also || []) { const k = one(e.sensor, e.min, e.max); ok = c.all ? ok && k : ok || k; }
  return ok !== !!c.not;
}
// a rule (canon order: GO conditions, each `or` starting a group, then STOP ones): { go, stop }
function ruleAt(R, read) {
  let any = false, all = false, group = true, stop = false;
  for (const c of R) {
    const ok = condHolds(c, read);
    if (c.stop) { if (ok) stop = true; continue; }
    if (c.or && any) { all = all || group; group = true; }
    any = true;
    if (!ok) group = false;
  }
  return { any, go: any && (all || group), stop };
}
// draw the map of rule R for part m on canvas cv; returns the caption. The water is drawn as it is (dark nights, a bright
// noon fading with depth: the day's shape shows by itself); where the part acts is its colour laid over it in stripes,
// with a bright edge where it changes (author, 2026-11-03: the flat blocks read as abstract)
const MAP_LEGEND = { runs: ['runs', 'still'], fires: ['fires', 'waits'], rests: ['rests', 'awake'], feeds: ['would feed', "doesn't"],
  holds: ['holds', 'lets go'], bursts: ['would burst', 'waits'], leaks: ['leaks', 'holds back'], shoots: ['would fire', 'waits'], engulfs: ['would engulf', "doesn't"], divides: ['would divide', 'waits'] };
const MAP_Q = { runs: 'When does it run?', fires: 'When does it fire?', rests: 'When does it rest?', feeds: 'When would it feed?',
  holds: 'When does it hold?', bursts: 'When would it burst?', leaks: 'When does it leak?', shoots: 'When would it fire?', engulfs: 'When would it engulf?', divides: 'When would it divide?',
  floats: 'When does it float, when does it sink?' };
const MAP_FLOAT = [205, 238, 255], MAP_SINK = [45, 91, 209];
const hexRGB = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
// the water at hour h, depth dz: black at night and deep down, bright teal near the surface at noon
function mapWater(h, dz) {
  const sun = !world.light ? 0 : world.day ? Math.max(0, Math.sin(2 * Math.PI * (h - 6) / 24)) : 1;
  const t = Math.pow(Math.min(1, sun * Math.exp(-PARAMS.light.attenuation * dz)), 0.45);
  return [8 + t * 62, 13 + t * 137, 26 + t * 144];
}
const mapCol = (m) => { const g = groupOfPart(m); return (g && colourOf(g)) || '#6fd3b5'; };
function drawRunMap(cv, m, R) {
  const verb = verbOf(m), live = cell && cell.design === design ? cell : null, reader = mapReader(live);
  const ctx2 = cv.getContext('2d'), img = ctx2.createImageData(MAP_W, MAP_H), ON = hexRGB(mapCol(m));
  const state = new Uint8Array(MAP_W * MAP_H);   // 0 off, 1 on (or floats), 2 sinks
  let on = 0, fl = 0, sk = 0;
  for (let x = 0; x < MAP_W; x++) {
    const h = (x + 0.5) / MAP_W * 24;
    for (let y = 0; y < MAP_H; y++) {
      const dz = (y + 0.5) / MAP_H * TH, r = ruleAt(R, reader(h, dz));
      let k = 0;
      if (verb === 'floats') { if (r.stop) { k = 2; sk++; } else if (r.go) { k = 1; fl++; } }
      else if (verb === 'rests') { if (r.go && !r.stop) { k = 1; on++; } }
      else if ((r.any ? r.go : true) && !r.stop) { k = 1; on++; }
      state[y * MAP_W + x] = k;
      let v = mapWater(h, dz);
      if (k) {
        const c = k === 2 ? MAP_SINK : verb === 'floats' ? MAP_FLOAT : ON, al = (x + y) % 6 < 3 ? 0.78 : 0.5;
        v = v.map((w, i) => w * (1 - al) + c[i] * al);
      }
      const i = (y * MAP_W + x) * 4;
      img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = 255;
    }
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {   // the edge
    const k = state[y * MAP_W + x];
    if ((x && state[y * MAP_W + x - 1] !== k) || (y && state[(y - 1) * MAP_W + x] !== k)) { const i = (y * MAP_W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 235; }
  }
  ctx2.putImageData(img, 0, 0);
  const n = MAP_W * MAP_H, pc2 = (v) => `<b>${Math.round(v / n * 100)}%</b>`;
  const what = verb === 'floats' ? `Floats ${pc2(fl)} of the day and depths, sinks ${pc2(sk)}; neutral elsewhere`
    : `${MAP_LEGEND[verb][0][0].toUpperCase() + MAP_LEGEND[verb][0].slice(1)} ${pc2(on)} of the day and depths`;
  return `${what}${live ? '' : " (select a cell of this design for its eyespots' facing and its day)"}.`;
}
// a legend swatch: a state's colour in stripes, or the water for "off"
function mapSwatch(c) {
  if (!c) return `background:linear-gradient(90deg, rgb(${mapWater(12, 300)}), rgb(${mapWater(0, 0)}))`;
  return `background:repeating-linear-gradient(135deg, rgb(${c}) 0 3px, rgba(${c},.55) 3px 6px)`;
}
// the map under a card's sentence: a question, hours across, surface and floor, a canvas, a legend, a dot for the
// selected cell now (moved every frame). A rule with no condition gets a line, not a map (it would be one block).
function runMapEl(targets, R) {
  const m = targets[0], k0 = design.parts.indexOf(m), verb = verbOf(m);
  if (!(R || canon(m)).length) {
    const box = document.createElement('div'); box.className = 'rmapnone';
    const what = verb === 'floats' ? 'it stays neutral' : verb === 'rests' ? 'it never rests' : verb === 'bursts' ? 'it never bursts' : verb === 'shoots' ? 'it never fires'
      : verb === 'fires' ? 'it fires only by hand' : `it ${MAP_LEGEND[verb][0]} at every hour and depth`;
    box.innerHTML = `◷ No map: ${what}. Add a <b>${verb === 'divides' ? '+ and…' : '+ when…'}</b> or <b>+ unless…</b> to see one.`;
    return box;
  }
  const box = document.createElement('div'); box.className = 'rmap';
  const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => `<span style="left:${h / 24 * 100}%${h === 0 ? ';transform:none' : h === 24 ? ';transform:translateX(-100%)' : ''}">${String(h).padStart(2, '0')}h</span>`).join('');
  const col = hexRGB(mapCol(m)), keys = verb === 'floats' ? [['floats', MAP_FLOAT], ['sinks', MAP_SINK], ['neutral', null]] : [[MAP_LEGEND[verb][0], col], [MAP_LEGEND[verb][1], null]];
  box.innerHTML = `<div class="mq">${MAP_Q[verb]} <span>· one day, surface to floor</span></div>
    <div class="mgrid"><div class="mxl">${hours}</div><div class="myl"><span style="top:0">surface</span><span style="bottom:0">floor</span></div>
    <div class="mbox"><canvas width="${MAP_W}" height="${MAP_H}"></canvas><i class="mdot" data-mapdot="${k0}"></i></div>
    <div class="mxd"><span style="left:25%">dawn</span><span style="left:50%">noon</span><span style="left:75%">dusk</span></div></div>
    <div class="mleg">${keys.map(([t, c]) => `<span><i style="${mapSwatch(c)}"></i>${t}</span>`).join('')}<span><i class="now"></i>your cell now</span></div><div class="cap"></div>`;
  box.redraw = () => { box.querySelector('.cap').innerHTML = drawRunMap(box.querySelector('canvas'), m, R || canon(m)); };
  box.redraw();
  return box;
}


// ----- the rule's links on the cell (author's mock-up, 2026-11-01): the card last tapped (or opened) has its sensors
// joined to the part it drives by dashed lines in each sensor's colour on the selected cell (red for an "unless") -----
let linkFocus = null;   // partKey of the card whose links are drawn
function drawRuleLinks(X, Y, s) {
  if (!linkFocus || !cell || cell.design !== design || arrange) return;
  const g = partGroups(design.parts || []).find((x) => partKey(x.members[0]) === linkFocus);
  const targets = g && targetsOf(g);
  if (!targets || !targets.length) return;
  const c = cell.drawn || cell, m = targets[0], k0 = design.parts.indexOf(m);
  const bodyAt = (x, y) => [c.cx[0] + c.cs[0] * x - c.sn[0] * y, c.cy[0] + c.sn[0] * x + c.cs[0] * y];
  // where the part is: its first piece's root, or the organelle's middle
  let to = null;
  const i = c.pieces.findIndex((p) => p.part === k0 && p.kind !== 'body');
  if (i > 0) { const p = c.pieces[i], h = p.L / 2; to = [c.cx[i] - c.cs[i] * h, c.cy[i] - c.sn[i] * h]; }
  const inc = c.pieces[0].inclusions.find((x) => x.part === k0);
  if (!to && inc) to = bodyAt(inc.x, inc.y);
  if (!to) return;
  const sensorAt = (id) => {
    const sn = c.sensors.find((x) => x.id === id);
    if (!sn) return null;
    const j = sn.piece;
    return [c.cx[j] + c.cs[j] * sn.x - c.sn[j] * sn.y, c.cy[j] + c.sn[j] * sn.x + c.cs[j] * sn.y];
  };
  const seen = new Set();
  ctx.save();
  ctx.lineWidth = 1.8; ctx.setLineDash([5, 4]);
  for (const cond of canon(m)) for (const id of [cond.sensor, cond.vs, ...(cond.also || []).map((e) => e.sensor)]) {
    if (id === undefined || seen.has(`${id}${cond.stop}`)) continue;
    seen.add(`${id}${cond.stop}`);
    const from = sensorAt(id);
    if (!from) continue;   // a built-in reading (energy, stores, plastid health): inside, no spot
    const col = cond.stop ? '#ff6f6f' : sensorInfo(id).colour || '#fff3b0';
    ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(X(from[0]), Y(from[1])); ctx.lineTo(X(to[0]), Y(to[1])); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(from[0]), Y(from[1]), 3, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.setLineDash([]); ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(X(to[0]), Y(to[1]), 5, 0, 2 * Math.PI); ctx.stroke();
  ctx.restore();
}
// while a condition is open in the editor, tapping a sensor on the cell puts it in the condition (set by the editor)
let ruleEdPick = null;

// ----- live: each condition green while it holds (red for an "unless" that is stopping the part), the state pills, the
// editors' needles; for the selected cell if it is this design -----
// a living cell's conditions for design part k (a motor's, a chamber's, the nucleus's REST rule), and what it is doing
function liveRule(live, k) {
  const j = live.joints.find((x) => x.part === k);
  if (j) {
    let state, on;
    if (j.burst) { on = j.burst.state === 'firing'; state = j.burst.state === 'firing' ? 'FIRING' : 'READY'; }
    else if (j.type === 'motor') { on = j.on && !(world.metab && live.metab.starving); state = on ? 'RUNNING' : world.metab && live.metab.starving ? 'NO ENERGY' : 'STOPPED'; }
    else { on = !j.latched; state = j.latched ? 'COCKED' : 'RELEASED'; }
    return { ctls: j.controls || null, state, cls: on ? 'on' : '' };
  }
  if (live.divideRule && live.divideRule.part === k) {   // the DIVIDE rule: how full the meter is, or what it waits for
    const g = live.grow, size = live.size || 1, full = size >= 2 - 1e-9;
    return { ctls: live.divideRule.controls, state: !world.grow || !g ? '' : full ? (live.waiting ? `${size.toFixed(1)}× WAITING` : 'DIVIDING') : `${size.toFixed(1)}× GROWING`, cls: full && !live.waiting ? 'on' : '' };
  }
  const fd = live.feeders && live.feeders.find((x) => x.part === k);
  const pd = live.pads && live.pads.find((x) => x.part === k);   // a pad: joined, free, or letting go (its rule fails)
  if (pd) return { ctls: pd.controls || null, state: pd.link ? 'JOINED' : pd.go ? 'FREE' : 'LETS GO', cls: pd.link ? 'on' : '' };
  if (fd) return { ctls: fd.controls || null, state: fd.link ? 'FEEDING' : fd.go && live.cantPierce ? 'TOO DEAR' : fd.go ? 'READY' : 'OFF', cls: fd.link ? 'on' : '' };
  const hp = live.harpoons && live.harpoons.find((x) => x.part === k);   // a harpoon: loaded, reloading, or off
  if (hp) return { ctls: hp.controls || null, state: hp.t > 0 ? `REGROWING ${Math.ceil(hp.t)} s` : hp.controls ? 'LOADED' : 'OFF', cls: hp.t > PARAMS.harpoon.reload - 1 ? 'on' : '' };
  const mo = live.mouths && live.mouths.find((x) => x.part === k);   // a mouth: digesting, ready, or off
  if (mo) return { ctls: mo.controls || null, state: live.meal ? 'DIGESTING' : mo.go ? 'READY' : 'OFF', cls: live.meal ? 'on' : '' };
  const tx = live.pieces[0].inclusions.find((x) => x.part === k && x.toxin);   // a toxin sac: armed, or burst
  if (tx && tx.leak) return { ctls: tx.controls || null, state: tx.go && live.leaking > 0 ? 'LEAKING' : 'IDLE', cls: tx.go && live.leaking > 0 ? 'on' : '' };
  if (tx) return { ctls: tx.controls || null, state: live.dead && live.burst ? 'BURST' : tx.controls ? 'ARMED' : 'SAFE', cls: live.burst ? 'on' : '' };
  const ch = live.pieces[0].inclusions.find((x) => x.part === k && x.material === 'chamber');
  if (ch) {
    const st = ch.target === PARAMS.chamber.light ? 'float' : ch.target === PARAMS.chamber.heavy ? 'sink' : '';
    return { ctls: ch.controls || null, state: st ? st.toUpperCase() : 'NEUTRAL', cls: st };
  }
  if (design.parts[k] && design.parts[k].material === 'nucleus') return { ctls: live.rest.controls, state: live.resting ? 'RESTING' : 'AWAKE', cls: live.resting ? 'rest' : '' };
  return null;
}
function ruleLive() {
  const live = cell && cell.design === design ? cell : null;
  for (const el of document.querySelectorAll('[data-livecond]')) {
    const [k, i] = el.dataset.livecond.split(':').map(Number);
    const r = live && liveRule(live, k), ctl = r && r.ctls ? r.ctls[i] : null;
    const ok = !!ctl && (ctl.ok !== undefined ? ctl.ok : ctl.holds !== null && ctl.holds !== ctl.not);
    el.classList.toggle('holds', ok && !ctl.stop);
    el.classList.toggle('stopping', ok && !!ctl.stop);
  }
  for (const el of document.querySelectorAll('[data-pill]')) {
    const r = live && liveRule(live, Number(el.dataset.pill));
    el.textContent = r ? r.state : '';
    el.className = `pill ${r ? r.cls : ''}`;
  }
  for (const d of document.querySelectorAll('[data-mapdot]')) {   // the selected cell on the maps: its hour and depth
    d.style.display = live ? '' : 'none';
    if (live) { d.style.left = `${clock(world) / 24 * 100}%`; d.style.top = `${Math.max(0, Math.min(1, (TH - live.q[1]) / TH)) * 100}%`; }
  }
  for (const g of document.querySelectorAll('[data-needle]')) {
    const sn = live && liveReading(live, g.dataset.needle);
    g.style.display = sn ? '' : 'none';
    if (!sn) continue;
    const K = kindOf(g.dataset.needle), x = xAt(K, Math.max(0, Math.min(1, sn.value)));
    g.setAttribute('transform', `translate(${x.toFixed(1)},0)`);
    const tx = g.querySelector('text');
    tx.textContent = `now ${K.u(sn.value, g.dataset.needle)}`;
    tx.setAttribute('text-anchor', x < 50 ? 'start' : x > SVGW - 50 ? 'end' : 'middle');
    tx.setAttribute('x', x < 50 ? -4 : x > SVGW - 50 ? 4 : 0);
  }
}

// ----- beat speed -----
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

// A living cell's reading of a sensor ('energy', 'starch', 'oil', 'health' or an id), as { value }; undefined if there is none
function liveReading(c, id) {
  if (id === 'energy') return { value: energyLevel(world, c) };
  if (id === 'starch' || id === 'oil') return { value: storeLevel(c, id) };
  if (id === 'health') return { value: plastidHealth(world, c) };
  if (id === 'feeding') return { value: feedingLevel(c) };
  if (id === 'size') return { value: sizeLevel(c) };
  if (id === 'drained') return { value: drainedLevel(world, c) };
  if (id === 'neighbours') return { value: neighboursLevel(c) };
  if (id === 'alarm') return { value: alarmLevel(c) };
  if (id === 'poisoned') return { value: poisonedLevel(c) };
  { const k = c.pads.findIndex((p) => c.design.parts[p.part] && c.design.parts[p.part].id === id); if (k >= 0) return { value: padLevel(world, c, c.pads[k]) }; }
  return c.sensors.find((x) => x.id === id);
}

// The list under a part: its rule card
function wiring(g, targets) { return ruleCard(targets, 'list'); }

// ----- the Nucleus board (author, 2026-11-01, replacing the cable view): the nucleus's slots, then every part's rule
// card with what it is doing now. Docked in the Nucleus window on a computer, over the panel on a phone. -----
let patchOpen = false;
let desk = false;   // a wide screen: three windows, the patch view docked in the Nucleus one (the layout block near the end)
$('patchBtn').onclick = () => { patchOpen = true; $('patch').hidden = false; drawPatch(); };
$('patchClose').onclick = () => { patchOpen = false; $('patch').hidden = true; if (ruleEd && ruleEd.where === 'board') ruleEd = null; };
function drawPatch() {
  if (!patchOpen) return;
  const area = $('board');
  area.innerHTML = '';
  $('patchHint').textContent = 'tap a coloured word to change it · + and / + unless to add';
  const nuc = nucleiOf(design)[0];
  if (!nuc) { area.innerHTML = '<p class="bnote">This cell has no nucleus, so no brain: every part runs all the time. Add a 🧬 Nucleus (Inside the cell) to give its parts rules.</p>'; return; }
  const use = brainUse(design), slots = nucleusSlots(nuc);
  const head = document.createElement('div'); head.className = 'bslots';
  head.title = 'Each sensor, each wired built-in reading (energy, stores, plastid health) and each rule group takes a slot';
  head.innerHTML = `<b>Slots</b><span class="slots${use.total >= slots ? ' full' : ''}">${Array.from({ length: slots }, (_, i) => `<i class="${i < use.total ? 'used' : ''}"></i>`).join('')}</span>
    <span>${use.total} of ${slots} slots</span><span class="bnote">${use.sensors} sensor${use.sensors === 1 ? '' : 's'} · ${use.builtins.length} built-in · ${use.boxes} rule group${use.boxes === 1 ? '' : 's'}</span>`;
  area.appendChild(head);
  const all = partGroups(design.parts || []);
  const groups = all.filter((g) => targetsOf(g).length);
  if (!groups.length) { const p = document.createElement('p'); p.className = 'bnote'; p.textContent = 'No parts to give rules yet: add a flagellum, a spring or a buoyancy chamber.'; area.appendChild(p); return; }
  for (const g of groups) {
    const targets = targetsOf(g), colour = colourOf(g) || '#9fb3c8', k0 = design.parts.indexOf(targets[0]);
    const card = document.createElement('div'); card.className = 'bcard'; card.style.setProperty('--c', colour);
    card.innerHTML = `<div class="bhead"><i></i><b>${esc(partName(g, all))}</b><span class="pill" data-pill="${k0}"></span></div>`;
    card.querySelector('.bhead').onclick = () => { glow = { parts: new Set(g.members.map((x) => design.parts.indexOf(x))), until: performance.now() + 1500 }; };
    card.appendChild(ruleCard(targets, 'board'));
    area.appendChild(card);
  }
}

// Unplug every cable from the sensors in `ids` (being removed): from the remaining parts' rules and speed settings, so
// the design still builds
function unplug(d, ids) {
  const thin = (c) => {
    if (!c.also) return c;
    const rest = c.also.filter((e) => !ids.has(e.sensor));
    if (ids.has(c.sensor) && rest.length) { const [h, ...t] = rest; c = { ...c, sensor: h.sensor, min: h.min ?? c.min, max: h.max ?? c.max, also: t }; }
    else c = { ...c, also: rest };
    if (!c.also.length) { const { also, all, ...r } = c; return r; }
    return c;
  };
  const keep = (c) => !ids.has(c.sensor) && !ids.has(c.vs);
  const tidy = (list) => list.map(thin).filter(keep).map((c, i) => (i === 0 && c.or ? (({ or, ...rest }) => rest)(c) : c));
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
    if (g.members[0].material === 'nucleus') for (const m of row.querySelectorAll('.mirror')) m.remove();   // one nucleus a cell
    if (g.members[0].type === 'rule') for (const m of row.querySelectorAll('.mirror, .remove')) m.style.display = 'none';   // a rule every cell has
    // tapping the name folds or opens the card, and lights the part up in the tank
    row.querySelector('.pnm').onclick = (e) => {
      if (e.target.classList.contains('ren')) return;
      if (targets.length) { if (open) openCards.delete(key); else { openCards.add(key); linkFocus = key; } }
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
    if (targets.length && !open) {   // the rule in a sentence; tapped, it opens as the card
      const sum = document.createElement('div'); sum.className = 'psum'; sum.innerHTML = ruleSummary(targets);
      sum.onclick = () => row.querySelector('.pnm').click();
      row.appendChild(sum);
    }
    if (targets.length && open) row.appendChild(wiring(g, targets));
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
  showBudget();
}

// A new tank with the design. Rebuilding after an edit (carry: the old world, its selected cell and design) keeps the
// time of day, the other cells as they are, and rebuilds this design's other copies where they were; the edited cell
// keeps its share of energy. Reset (no carry) starts again at dawn.
function reset(pose, carry) {
  $('err').textContent = '';
  const s = (pose && pose.x !== undefined ? pose : null) || design.start || {};
  const w = makeWorld(1, { gravity: $('gravity').checked, light: $('light').checked, day: $('day').checked, flow: $('flow').checked, metab: true, grow: true });
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
          if (o && i.material === 'chamber') { i.density = o.density; i.wpt.w = (i.density - PARAMS.cell.cytoplasm) * i.v * PARAMS.gravity * 1e-6; }   // as full or empty
          if (!o || !i.store) continue;
          i.fill = o.fill;
          i.wpt.w = (i.density - PARAMS.cell.cytoplasm) * i.v * i.fill * PARAMS.gravity * 1e-6;
        }
      };
      const keepGrow = (from, to) => {
        if (!from.grow || !to.grow) return;
        to.grow.E = Math.min(1, from.grow.E / from.grow.Eneed) * to.grow.Eneed;
        to.grow.N = Math.min(1, from.grow.N / from.grow.Nneed) * to.grow.Nneed;
        for (const k of ['uid', 'gen', 'mother', 'born']) if (from[k] !== undefined) to[k] = from[k];   // the same cell, its lineage
      };
      if (carry.world.nitro) w.nitro = carry.world.nitro;   // the water keeps what cells used
      w.births = carry.world.births; w.deaths = carry.world.deaths; w.nextUid = carry.world.nextUid;
      w.census = carry.world.census;   // the population graph goes on
      next.stolen = carry.cell.stolen || []; next.lost = carry.cell.lost || [];   // its stolen plastids stay; those a thief took stay missing
      if (carry.cell.size > 1 || next.stolen.length || next.lost.length) regrow(w, next, carry.cell.size);   // as grown as it was
      keep(carry.cell, next); keepGrow(carry.cell, next);
      next.metab.E = share(carry.cell) * next.metab.C;
      next.journal = carry.cell.journal;   // the day graph goes on
      for (const c of carry.world.cells) {
        if (c === carry.cell) continue;
        if (c.design === carry.design && c.dead) continue;   // the dead stay dead (not rebuilt)
        if (c.design === carry.design) {
          const k = addCell(w, design, c.q[0], c.q[1], c.q[2] * 180 / Math.PI);
          k.stolen = c.stolen || []; k.lost = c.lost || [];
          if (c.size > 1 || k.stolen.length || k.lost.length) regrow(w, k, c.size);
          k.metab.E = share(c) * k.metab.C; k.journal = c.journal; keep(c, k); keepGrow(c, k);
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

// Follow and measure one cell
function select(c) {
  cell = c; trail = []; samples = [];
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
// another cell beside the selected one: a copy (kin), a preset or a saved design (its own species); it is selected
function addToTank(d) {
  if (!d) return;
  try {
    const c = addCell(world, withoutTimers(d), cell.q[0], cell.q[1], (d.start || {}).angle ?? 0);
    c.q[0] = Math.min(Math.max(cell.q[0] + cell.reach + c.reach + 2, c.reach), TW - c.reach);
    updatePose(c);
    $('buildErr').textContent = `a ${c.species} joined the tank (${world.cells.length} cells)`;
  } catch (e) { $('buildErr').textContent = e.message; }
}
$('add').onclick = () => {
  const v = addSelect.value;
  addToTank(v.startsWith('saved:') ? savedDesign(v.slice(6)) : v ? preset(v) : design);
};
// remove the selected cell from the tank (author, 2026-11-03: "where is the delete button"; also in the top bar on a computer,
// in ⋯ More on a phone); the last cell stays
const removeSelected = () => {
  if (world.cells.length < 2) { $('buildErr').textContent = 'the last cell stays: load another design instead'; return; }
  const gone = cell, old = world.cells, keep = old.filter((x) => x !== gone);
  const at = new Map(keep.map((c, i) => [c, i]));   // links name cells by their place in the list: renumber them
  world.links = (world.links || []).filter((l) => {
    const a = at.get(old[l.a]), b = at.get(old[l.b]);
    if (a === undefined || b === undefined) { l.padA.link = null; if (l.padB) l.padB.link = null; return false; }
    l.a = a; l.b = b; return true;
  });
  world.cells = keep;
  const next = keep.find((c) => c.design === gone.design) || keep.find((c) => c.design === design) || keep[0];
  select(next);
  if (next.design !== design) { design = next.design; $('json').value = JSON.stringify(design, null, 2); listParts(); }   // none of its kind left: edit the next one's
  $('buildErr').textContent = `removed a ${gone.species} (${keep.length} cell${keep.length === 1 ? '' : 's'} left)`;
};
$('removeCell').onclick = removeSelected;
$('removeCellBar').onclick = removeSelected;

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
    census(world);
    if (world.steps % 10 === 0) {              // every 10 ms: samples for beat-averaged speed and power
      samples.push({ t: worldTime(world), x: cell.q[0], y: cell.q[1], e: cell.energy.motor + cell.energy.pump });
      if (samples.length > 400) samples.shift();
    }
    if (world.steps % 100 === 0) {             // every 0.1 s: a trail dot
      trail.push([cell.q[0], cell.q[1]]);
      if (trail.length > 4000) trail.shift();
    }
  }
  for (const c of [...world.cells, ...(world.gone || [])]) if (c.dead && !c.deathTold) { c.deathTold = true; if (c === cell || c.design === design) toldDeath(c); }
  if (world.born) world.born.length = 0;
  if (world.gone) world.gone.length = 0;
  if (!world.cells.includes(cell) && world.cells.length) {   // the followed cell is gone: follow its kin, else anyone
    select(world.cells.find((c) => c.design === cell.design && !c.dead) || world.cells.find((c) => !c.dead) || world.cells[0]);
  }
  for (const c of world.cells) updatePose(c);
}

// A death is never silent (author, 2026-11-03: "when it sinks to the bottom it disappears??"): a message over the tank
// when the followed cell or one of this design's cells dies, and when the design has no living cell left. Tap to close.
let toastT = null;
function toldDeath(c) {
  const left = world.cells.filter((x) => x.design === c.design && !x.dead).length;
  const hm = clock(world), at = `${String(Math.floor(hm)).padStart(2, '0')}:${String(Math.floor(60 * (hm % 1))).padStart(2, '0')}`;
  const why = c.eatenBy ? `eaten whole by a ${c.eatenBy}` : c.burst ? 'burst itself (its toxin sac)' : c.diedWhy || 'starved';
  const starved = /starved|drained/.test(why) ? ` (${Math.round(PARAMS.grow.die)} s without energy)` : '';
  let text = `✝ <b>${c === cell ? 'Your cell' : `A ${esc(c.species)}`} died</b>: ${esc(why)} at ${at}, ${Math.round(TH - c.q[1])} µm deep${starved}.`;
  text += left ? ` ${left} of its kind still alive.` : ` <b>None of its kind is left.</b>`;
  if (!c.eatenBy) text += ' Its body sinks and lies on the floor a while.';
  $('toast').innerHTML = text; $('toast').hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { $('toast').hidden = true; }, 12000);
}
$('toast').onclick = () => { $('toast').hidden = true; };

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
let budgetAt = 0, mapsAt = 0;
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
  if (world) {
    if (canvas.clientWidth > 0) draw();   // a folded tank window draws nothing
    if (!$('stats').hidden) stats(); liveReadings(); ruleLive(); syncButtons();
    $('stats').style.top = desk ? '8px' : `${$('bar').offsetHeight + 14}px`;
    if (desk) topClock();
    if (now - budgetAt > 1000) { budgetAt = now; showBudget(); }   // the depth it is judged at follows the cell
    if (now - mapsAt > 4000) {   // the rule maps follow the cell's day (not one being edited: it shows the change)
      mapsAt = now;
      for (const el of document.querySelectorAll('.rmap')) if (el.redraw && !el.closest('.rcard').querySelector('.red')) el.redraw();
    }
  }
  requestAnimationFrame(frame);
}

// ----- the energy budget while building (author, 2026-11-01: "still have trouble surviving the night"): what a day at a
// depth earns against what the cell costs, and how much of a night its stores carry. An estimate from the design alone
// (no swimming: beating costs extra), so it can be shown before anything runs. -----
const NIGHT = PARAMS.metab.day / 2;   // s of darkness in a day
const bodyVolume = (b) => 4 / 3 * Math.PI * b.radius ** 3 + Math.PI * b.radius ** 2 * (b.length || 0);
let budgetKey = '', budgetCell = null;
// the design built once (upkeep, inclusions' volumes), kept while the design is the same
function budgetBuild(d) {
  const key = JSON.stringify(d);
  if (key !== budgetKey) {
    budgetKey = key;
    try { budgetCell = buildCell(d); initMetab(budgetCell); } catch (e) { budgetCell = null; }
  }
  return budgetCell;
}
// a day at `depth` µm: { earn, cost, stores, night } in pJ (earn: its plastids' day, less repairing bright-light damage)
function dayBudget(d, depth) {
  const c = budgetBuild(d);
  if (!c) return null;
  const M = PARAMS.metab, Lp = PARAMS.light, steps = 96, dt = M.day / steps;
  let earn = 0;
  for (const inc of c.pieces[0].inclusions) {
    if (inc.material !== 'plastid') continue;
    const shade = inc.pigment === 'shade';
    for (let i = 0; i < steps; i++) {
      const sun = Math.sqrt(Math.max(0, Math.sin(2 * Math.PI * (i + 0.5) / steps)));
      const L = Lp.strength * sun * Math.exp(-Lp.attenuation * depth);
      // bright light: the damage where hurting and mending balance, its lost output and the cost of mending it
      const over = L - (shade ? M.shade.safe : M.photo.safe), k = over > 0 ? M.photo.damage * (shade ? M.shade.damage : 1) * over : 0;
      const dmg = k / (k + M.photo.repair);
      const out = shade ? M.shade.max * L / (L + M.shade.half) : M.plastidMax * L / (L + M.plastidHalf);
      earn += inc.v * ((1 - dmg) * out - M.photo.repair * dmg * M.photo.cost) * dt;
    }
  }
  let stores = 0.5 * c.metab.C;   // the pool's middle, then every store full
  for (const inc of c.pieces[0].inclusions) if (inc.store) stores += inc.v * M[inc.store].energy;
  // what its stores can give a second when the pool runs low (starch quick, oil slow), and what its flagella cost beating
  let supply = 0, beat = 0;
  for (const inc of c.pieces[0].inclusions) if (inc.store) supply += inc.v * M[inc.store].energy * M[inc.store].burn;
  for (const L of c.metab.beatL.values()) beat += M.beat * L;
  // the deepest it earns its upkeep at noon: below it, a resting cell can't earn its way awake
  const noon = (dz) => {
    let e = 0;
    const L = Lp.strength * Math.exp(-Lp.attenuation * dz);
    for (const inc of c.pieces[0].inclusions) if (inc.material === 'plastid') {
      const shade = inc.pigment === 'shade', over = L - (shade ? M.shade.safe : M.photo.safe);
      const k = over > 0 ? M.photo.damage * (shade ? M.shade.damage : 1) * over : 0, dmg = k / (k + M.photo.repair);
      e += inc.v * ((1 - dmg) * (shade ? M.shade.max * L / (L + M.shade.half) : M.plastidMax * L / (L + M.plastidHalf)) - M.photo.repair * dmg * M.photo.cost);
    }
    return e;
  };
  let deepest = -1;
  for (let dz = 0; dz <= TH; dz += 10) if (noon(dz) >= c.metab.upkeep) deepest = dz;
  return { earn, cost: c.metab.upkeep * M.day, night: c.metab.upkeep * NIGHT, stores, upkeep: c.metab.upkeep, supply, beat, deepest };
}
// the depth to judge at: the selected cell's (of this design), else 400 µm
const budgetDepth = () => (cell && cell.design === design ? Math.max(0, Math.round(TH - cell.q[1])) : 400);
function showBudget() {
  const el = $('budgetLine');
  if (!design || !el) return;
  const depth = budgetDepth(), b = dayBudget(design, depth);
  if (!b) { el.innerHTML = ''; return; }
  const ratio = b.earn / b.cost, ratioRest = b.earn / (b.cost - b.night * (1 - PARAMS.metab.rest)), night = b.stores / b.night, rest = b.stores / (b.night * PARAMS.metab.rest);
  const tone = (v) => (v >= 1.2 ? 'good' : v >= 1 ? 'meh' : 'bad');
  const pct = (v) => (v >= 10 ? '1000%+' : `${Math.round(v * 100)}%`);
  el.innerHTML = b.earn <= 0
    ? `⚖ <b class="bad">no plastid: it earns nothing</b> · its stores last <b class="${tone(night)}">${pct(night)}</b> of a night`
    : `⚖ At ${depth} µm a day earns <b class="${tone(ratio)}">${ratio.toFixed(1)}×</b> its upkeep (<b class="${tone(ratioRest)}">${ratioRest.toFixed(1)}×</b> resting at night) · stores carry <b class="${tone(night)}">${pct(night)}</b> of a night (<b class="${tone(rest)}">${pct(rest)}</b> resting)`;
  // warnings (author, 2026-11-01): stores too slow to feed it, and the depth below which a resting cell can't wake
  const k = (v) => (v >= 10000 ? `${(v / 1000).toFixed(0)} k` : `${Math.round(v)}`);
  const warn = [];
  const rests = (design.parts || []).some((x) => x.material === 'nucleus' && x.joint && controlsOf(x.joint).length);
  const still = rests ? b.upkeep * PARAMS.metab.rest : b.upkeep;   // what a night costs a second, resting if it has a rest rule
  // each warning short, its explanation in its tooltip
  if (b.supply > 0 && b.supply < still) warn.push([`stores too slow to feed it at night${rests ? ', even resting' : ''} (${k(b.supply)} of ${k(still)} pJ/s)`,
    `At night its stores can give only ${k(b.supply)} pJ/s, less than it spends ${rests ? 'even resting' : 'sitting still'} (${k(still)}): it starves with store left. A bigger store, or starch (2× quicker), helps.`]);
  else if (b.supply > 0 && b.beat > 0 && b.supply < b.upkeep + b.beat) warn.push([`stores too slow for swimming at night (${k(b.supply)} of ${k(b.upkeep + b.beat)} pJ/s)`,
    `Swimming at night it spends ${k(b.upkeep + b.beat)} pJ/s, more than its stores can give (${k(b.supply)}): it would starve with store left${rests ? `; resting it spends ${k(still)}` : ''}. A bigger store, or starch (2× quicker), helps.`]);
  if (rests && b.earn > 0 && b.deepest < TH - 50) warn.push(b.deepest < 0 ? ['resting, it may never wake: it earns less than its upkeep even at the surface', 'Even at the surface at noon its plastids earn less than its upkeep.']
    : [`resting below ~${b.deepest} µm, it can't wake`, `Below ~${b.deepest} µm its plastids earn less than its upkeep even at noon (they work while it rests, at 40%, as does upkeep): resting there, its energy can't rise to wake it.`]);
  if (warn.length) el.innerHTML += warn.map(([w, why]) => `<span class="warn" title="${esc(why)}">⚠ ${w}</span>`).join('');
  el.title = `An estimate from the design, swimming not counted (beating costs extra). Upkeep ${Math.round(b.upkeep)} pJ/s: a day costs ${Math.round(b.cost / 1000)} k, a night ${Math.round(b.night / 1000)} k; `
    + `its plastids earn ${Math.round(b.earn / 1000)} k a day at ${depth} µm; full stores and half its pool hold ${Math.round(b.stores / 1000)} k, and can give ${Math.round(b.supply)} pJ/s; beating, its flagella cost ${Math.round(b.beat)} pJ/s; it earns its upkeep at noon down to ${b.deepest < 0 ? 'nowhere' : `${b.deepest} µm`}. Resting: upkeep at ${Math.round(PARAMS.metab.rest * 100)}%.`;
}
// the part being placed or edited, as a share of the cell, and what that means: "11% of the cell", "~60% of a night"
function sizeShare() {
  const name = $('partWhat').value, c = CONTROLS[name] || {};
  if (!c.inside || !design || !/Plastid|Energy store|Vacuole|Buoyancy|Starch|Oil/.test(name)) return '';
  const r = insideRadius(design.body, Number($('partSize').value) / 100), len = c.length ? Number($('partLength').value) : 0;
  const v = 4 / 3 * Math.PI * r ** 3 + Math.PI * r * r * len, share = v / bodyVolume(design.body);
  let s = ` · ${(share * 100).toFixed(share < 0.1 ? 1 : 0)}% of the cell`;
  const content = name.startsWith('Plastid') ? null : name.startsWith('Starch') ? 'starch' : name.startsWith('Oil') ? 'oil' : c.content ? $('partContent').value : null;
  const b = dayBudget(design, budgetDepth());
  if (b && (content === 'starch' || content === 'oil')) s += ` · ~${Math.round(v * PARAMS.metab[content].energy / b.night * 100)}% of a night`;
  return s;
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
  const NAME = { light: 'eyespot', touch: 'touch', near: 'proximity', flow: 'water', hunger: 'hunger', statolith: 'statolith', chem: 'nutrients' };
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
  if (cell.dead) { lines.push(`DEAD      ${cell.diedWhy || ''}: sinking, its nitrogen goes back to the water`); return; }
  if (world.grow && cell.starveT > 0) lines.push(`STARVING  dies in ${Math.max(0, PARAMS.grow.die - cell.starveT).toFixed(0)} s unless it finds energy`);
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
  const stolen = cell.pieces[0].inclusions.filter((x) => x.stolen);
  if (stolen.length) {
    let v = 0;
    for (const x of stolen) v += m.byPart.get(x.part) || 0;
    lines.push(`          stolen plastids upkeep ${show(v)}`);
  }
  if (m.motors > 0) lines.push(`          flagella beating ${show(m.motors)}`);
  if (m.pumps > 0) lines.push(`          pumping ${show(m.pumps)}`);
  if (cell.resting) lines.push('resting   upkeep and income at 40%, flagella stopped');
  if (m.leak > 0) lines.push(`leaking   toxin: −${m.leak.toFixed(0)} pJ/s`);
  if (cell.poison) lines.push(`POISONED  in a ${cell.poison.by}'s toxin: −${cell.poison.loss.toFixed(0)} pJ/s, plastids damaged`);
  if (cell.stunT > 0) lines.push(`STUNNED   ${cell.stunT.toFixed(1)} s more (a ${cell.harpooned ? cell.harpooned.by : '?'}'s harpoon)`);
  for (const h of cell.harpoons || []) lines.push(`harpoon   ${h.t > 0 ? `thrown, growing back: ${Math.ceil(h.t)} s` : h.controls ? 'loaded' : 'no rule: never fires'}`);
  for (const f of cell.feeders || []) if (f.link) lines.push(`feeding   on a ${world.cells[f.link.b] ? world.cells[f.link.b].species : '?'}: +${m.feeding.toFixed(0)} pJ/s kept (half of what it sucks)`);
  const by = world.links.filter((l) => l.feed && world.cells[l.b] === cell);
  if (by.length) lines.push(`DRAINED   by ${by.map((l) => `a ${world.cells[l.a].species}`).join(', ')}: its pool and nitrogen are being sucked out`);
  if (m.chamber > 0.5) lines.push(`          holding the buoyancy chamber ${show(m.chamber)}`);
  if (m.repair > 0.5) lines.push(`          repairing plastids (too much light) ${show(m.repair)}`);
  const net = m.income - m.upkeep * (cell.resting ? PARAMS.metab.rest : 1) - m.motors - m.pumps - m.chamber - m.repair;
  lines.push(`net       ${net >= 0 ? "+" : ""}${net.toFixed(0)} pJ/s: ${net >= 0 ? "gaining energy" : "losing energy"}`);
  for (const inc of cell.pieces[0].inclusions) if (inc.store) lines.push(`store     ${inc.store} ${(100 * inc.fill).toFixed(0)}% full`);
  if (world.grow) {
    const g = cell.grow, n = nitrogenAt(world, cell.q[1], cell.q[0]);
    const stolen = cell.pieces[0].inclusions.filter((x) => x.stolen);
    {   // its chain: kin joined by pads
      const seen = new Set([cell]), todo = [cell];
      while (todo.length) { const x = todo.pop(); for (const l of world.links || []) { if (l.feed || !l.padB) continue; const A = world.cells[l.a], B = world.cells[l.b], o = A === x ? B : B === x ? A : null; if (o && !seen.has(o)) { seen.add(o); todo.push(o); } } }
      if (seen.size > 1) lines.push(`chain     ${seen.size} cells joined: they even out energy and nitrogen; its drag ${Math.round(100 * (1 - (cell.shield || 1)))}% less`);
    }
    if (cell.lost && cell.lost.length) lines.push(`robbed    ${cell.lost.length} of its plastids taken by a thief: it rebuilds them from its growth meter before growing`);
    if (stolen.length) lines.push(`stolen    ${stolen.length} plastid${stolen.length > 1 ? 's' : ''} at ${stolen.map((x) => `${Math.round(100 * x.stolen.fade)}%`).join(', ')} of their output (fading by half a day; light damage is never mended)`);
    lines.push(`size      ${(cell.size || 1).toFixed(1)}× its newborn volume${(cell.size || 1) >= PARAMS.grow.max - 1e-9 ? ' (its largest: no more growing)' : ''}${cell.waiting ? ` (waits: ${cell.waiting})` : ''}`);
    lines.push(`growth    banked: energy ${(100 * g.E / g.Eneed).toFixed(0)}% · nitrogen ${(100 * g.N / g.Nneed).toFixed(0)}% of a doubling (it grows a tenth at a time)`);
    lines.push(`lineage   generation ${cell.gen || 0} · ${world.cells.length} of ${PARAMS.grow.cap} cells in the tank · ${world.births || 0} births · ${world.deaths || 0} deaths`);
    lines.push(`nitrogen  water here ${(100 * n).toFixed(0)}% of the deep's${g.N >= g.Nneed ? ' (its bar is full)' : ` · +${(100 * g.uptake / g.Nneed * PARAMS.metab.day).toFixed(0)}% of a doubling a day`}`);
  }
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
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);   // the tank's own size changes too (the phone's rail steps aside while arranging)

function draw() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const view = $('viewMode').value;
  if (view === 'follow') { const q = cell.vis ? cell.vis.q : cell.q; cam = { x: q[0], y: q[1] }; }   // the body as drawn
  if (arrange) { const [px, py] = arrange.pan; cam = { x: cell.cx[0] + cell.cs[0] * px - cell.sn[0] * py, y: cell.cy[0] + cell.sn[0] * px + cell.cs[0] * py }; }   // arranging: where the X / Y sliders look
  else if (view === 'fit') fit(W, H);
  const s = Number($('zoom').value);                       // pixels per µm
  // on a computer the patch view covers the lower half of the tank: keep a followed cell in the upper part
  if (view === 'follow' && patchOpen && !desk && innerWidth > 760) cam = { x: cam.x, y: cam.y - H * 0.25 / s };
  // the day graph covers the bottom of the tank: keep a followed cell in the middle of what is left above it
  if (view === 'follow' && graphOn) cam = { x: cam.x, y: cam.y - ((H < 500 ? 84 : 110) + 8) / 2 / s };
  const X = (x) => W / 2 + (x - cam.x) * s, Y = (y) => H / 2 - (y - cam.y) * s;

  ctx.fillStyle = COLOR.outside; ctx.fillRect(0, 0, W, H);
  const x0 = cam.x - W / 2 / s, x1 = cam.x + W / 2 / s, y0 = cam.y - H / 2 / s, y1 = cam.y + H / 2 / s;
  const v = { W, H, X, Y, s, x0, x1, y0, y1 }, now = performance.now() / 1000;
  drawWater(ctx, world, v, now);   // the living water (sandbox/scene.js): colour, light, the surface and the floor
  {   // nitrogen: a faint tan haze, rich deep, thinner where cells have used it up; a strip per column, so the patches show
    const NC = PARAMS.nutrient.columns, cw = TW / NC;
    for (let j = 0; j < NC; j++) {
      if (X((j + 1) * cw) < 0 || X(j * cw) > W) continue;
      const g = ctx.createLinearGradient(0, Y(TH), 0, Y(0)), xm = (j + 0.5) * cw;
      for (let k = 0; k <= 40; k++) g.addColorStop(k / 40, `rgba(200,178,106,${Math.min(0.1, 0.05 * nitrogenAt(world, TH * (1 - k / 40), xm)).toFixed(3)})`);
      ctx.fillStyle = g; ctx.fillRect(X(j * cw), Y(TH), cw * s + 1, TH * s);
    }
  }
  drawToxins(ctx, world, v);   // toxin clouds: a haze in each toxic species' tint
  drawDrift(ctx, world, v, worldTime(world), now);   // marine snow and specks, carried by the water
  if (trailOn) {   // the path the selected cell has taken (hidden unless ⋰ Trail is on; author)
    ctx.fillStyle = COLOR.trail;
    for (const [tx, ty] of trail) ctx.fillRect(X(tx) - 1, Y(ty) - 1, 2, 2);
  }

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
  for (const c of world.cells) {
    c.drawn = calmPose(c, lastReal, spd) || c;   // drawn: for taps
    if (c.dead) ctx.globalAlpha = 0.45;   // dead: faded and grey, sinking
    drawCell(arrange && arrange.cell && c === cell ? arrange.cell : c.drawn, X, Y, s, c);
    ctx.globalAlpha = 1;
  }
  if (arrange && arrange.trial) {   // the selected organelle outlined; red: overlapping or outside the wall
    const c = arrange.cell || cell, toW = ([x, y]) => [c.cx[0] + c.cs[0] * x - c.sn[0] * y, c.cy[0] + c.sn[0] * x + c.cs[0] * y];
    arrange.trial.parts.forEach((p, k) => {
      const red = arrange.problems && arrange.problems.over.has(k), sel = k === arrange.sel;
      const inc = c.pieces[0].inclusions.find((x) => x.part === k);
      if (!isInc(p) || !inc || (!red && !sel)) return;
      outlinePath(grow(inc.outline.map(bodyXf(c, X, Y)), 2));
      ctx.strokeStyle = sel ? '#5fd0ff' : COLOR.starving; ctx.lineWidth = sel ? 2.5 : 1.5;
      if (red && !sel) ctx.setLineDash([5, 4]);
      ctx.stroke(); ctx.setLineDash([]);
    });
    if (arrange.sel !== null && arrange.trial.parts[arrange.sel]) {   // the selected one's name, just above it
      const p = arrange.trial.parts[arrange.sel], g = partGroups(arrange.trial.parts).find((x) => x.members[0] === p);
      const [wx, wy] = toW(p.at), name = g ? partName(g, partGroups(arrange.trial.parts)) : p.label || p.material;
      ctx.font = '600 13px system-ui'; ctx.textAlign = 'center';
      const inc = c.pieces[0].inclusions.find((x) => x.part === arrange.sel), top = inc ? Math.min(...inc.outline.map(bodyXf(c, X, Y)).map((q) => q[1])) : Y(wy) - p.radius * s;
      const tx = X(wx), ty = top - 12, w = ctx.measureText(name).width + 12;
      ctx.fillStyle = 'rgba(6,10,18,.8)'; ctx.fillRect(tx - w / 2, ty - 13, w, 18);
      ctx.fillStyle = '#ffffff'; ctx.fillText(name, tx, ty); ctx.textAlign = 'left';
    }
  }
  drawPreview(X, Y, s);
  drawLinks(X, Y, s);
  drawRuleLinks(X, Y, s);
  drawForces(X, Y, s);
  if (!arrange) drawVignette(ctx, W, H);
  let bottom = H;   // the day graph sits along the bottom; the scale and the clock above it
  graphBox = null;
  if (graphOn) {
    const gh = H < 500 ? 84 : 110;
    graphBox = { x: 8, y: H - gh - 6, w: W - 60, h: gh };
    if (graphPop && !forecastJ) drawCensus(ctx, world.census, 8, H - gh - 6, W - 60, gh);
    else drawJournal(ctx, forecastJ || cell.journal, 8, H - gh - 6, W - 60, gh, forecastJ ? 'forecast: the next day' : 'the last day ⇄');
    bottom = H - gh - 8;
  }
  drawScale(W, bottom, s);
  if (!arrange) { drawMinimap(W, H); drawHud(W, bottom); }   // arranging: only the cell
}

// ----- saved designs: kept in this browser (they survive a reload; another phone or computer has its own) -----
const SAVE_KEY = 'tinygod.saved';
function savedList() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch (e) { return []; } }
function writeSaved(list) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
// Vesperella (Claude's first species) was retired (author, 2026-11-01: "delete vesperella"): drop it from saved designs
{ const list = savedList(), keep = list.filter((x) => !/^Vesperella/.test(x.name || '')); if (keep.length !== list.length) writeSaved(keep); }
// a saved design as its own species (copies of it are kin; other designs are strangers)
function savedDesign(name) {
  const s = savedList().find((x) => x.name === name);
  return s ? Object.assign(JSON.parse(JSON.stringify(s.design)), { species: name }) : null;
}
// the saved designs as a list (author, 2026-11-03: the menu was confusing): each with ＋ Tank (a cell of it beside the
// selected one, as its own species), ✎ Edit (it replaces the selected cell's design, to change it) and 🗑 (delete)
function showSaved() {
  const list = savedList(), box = $('savedList');
  savedGroup.innerHTML = '';
  for (const s of list) savedGroup.appendChild(new Option(s.name, `saved:${s.name}`));
  box.innerHTML = list.length ? '' : '<div class="none">No saved designs yet: 💾 Save keeps this one; 📥 From Claude brings Claude\'s.</div>';
  for (const s of list) {
    const row = document.createElement('div'); row.className = 'sv';
    row.innerHTML = `<b title="${esc(s.name)}">${esc(s.name)}</b><button data-a="tank" title="Put a cell of this design in the tank, beside the selected cell">＋ Tank</button><button data-a="edit" title="Edit this design: it takes the place of the selected cell's design">✎ Edit</button><button data-a="del" title="Delete this saved design">🗑</button>`;
    row.querySelector('[data-a=tank]').onclick = () => addToTank(savedDesign(s.name));
    row.querySelector('[data-a=edit]').onclick = () => { const d = savedDesign(s.name); if (d && applyDesign(d)) $('buildErr').textContent = `editing "${s.name}"`; };
    row.querySelector('[data-a=del]').onclick = () => {
      if (!confirm(`Delete the saved design "${s.name}"?`)) return;
      writeSaved(savedList().filter((x) => x.name !== s.name)); showSaved();
    };
    box.appendChild(row);
  }
}
$('saveDesign').onclick = () => {
  const list = savedList();
  const name = (prompt('Name this design', design.species && !PRESETS[design.species] ? design.species : `Design ${list.length + 1}`) || '').trim();
  if (!name) return;
  const d = JSON.parse(JSON.stringify(design)); delete d.species;
  const rest = list.filter((x) => x.name !== name);
  if (!writeSaved([...rest, { name, design: d, saved: Date.now() }])) { $('buildErr').textContent = 'this browser would not save it'; return; }
  design.species = name;
  showSaved(); $('buildErr').textContent = `saved "${name}"`;
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
// A design packed short (author, 2026-11-03: "send to you without having to paste the enormous text"): numbers to two
// decimals, deflated, base64url, "TG1." in front. tools/inbox.mjs unpacks it; 📋 Paste takes it too.
async function packDesign(obj) {
  const json = JSON.stringify(obj, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));
  const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  let bin = ''; for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return 'TG1.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackDesign(code) {
  const b = atob(code.slice(4).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(b, (c) => c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
}
const ISSUES = 'https://github.com/vitorhugo1992/tinygod/issues/new';
// Send to Claude: at home, the computer serving the sandbox keeps it as designs/<name>.json; on the website, a GitHub
// issue on the game's repository opens filled in with the design's code, and one tap on "Create" sends it (Claude reads
// it with tools/inbox.mjs). Issues there are public, like the repository.
$('sendDesign').onclick = async () => {
  const name = (prompt('Name it for Claude', design.species && !PRESETS[design.species] ? design.species : 'my species') || '').trim();
  if (!name) return;
  const d = JSON.parse(JSON.stringify(design)); delete d.species;
  const web = location.protocol === 'https:';
  const tab = web ? window.open('', '_blank') : null;   // opened now, while the tap still counts (a phone blocks it later)
  if (!web) {
    try {
      const r = await fetch(`/design?name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(d) });
      if (!r.ok && r.status !== 400 && r.status !== 413) throw new Error('no server');
      $('buildErr').textContent = r.ok ? `sent: Claude can read ${(await r.json()).file}` : `not sent: ${await r.text()}`;
      return;
    } catch (e) { /* no server here: fall through to GitHub */ }
  }
  let code;
  try { code = await packDesign({ name, design: d }); } catch (e) { if (tab) tab.close(); $('buildErr').textContent = 'this browser cannot pack a design: use 📋 Copy and paste it to Claude'; return; }
  const title = `Design: ${name}`, intro = 'A TinyGod design, sent from the sandbox. Tap **Create** (or Submit new issue) to send it to Claude.\n\n';
  let url = `${ISSUES}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(intro + code)}`, copied = false;
  if (url.length > 7500) {   // too long for a link: the issue opens empty and the code waits in the clipboard
    copied = await copyText(code);
    url = `${ISSUES}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(intro + '(paste the code here)')}`;
  }
  if (tab) tab.location = url; else location.href = url;
  $('buildErr').textContent = copied ? 'a GitHub page opened: paste the code (it is copied) where it says, then tap Create'
    : 'a GitHub page opened with the design: tap Create to send it to Claude';
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
  if (!text || (!text.includes('{') && !text.includes('TG1.'))) text = prompt('Paste the design here') || '';
  if (!text.trim()) return;
  const packed = text.match(/TG1\.[A-Za-z0-9_-]+/);
  if (packed) { try { text = JSON.stringify(await unpackDesign(packed[0])); } catch (e) { $('buildErr').textContent = 'that code is broken: copy it again'; return; } }
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
let graphOn = false,   // the day graph starts tucked away (author); 📈 Graph shows it
    graphPop = false,   // tapping the strip switches it between the selected cell's last day and the population
    graphBox = null,    // where the strip was drawn (for the tap)
    forecastJ = null, stopForecast = null;
$('graphBtn').onclick = () => { graphOn = !graphOn; };
$('testDay').onclick = () => {
  if (stopForecast) { stopForecast(); stopForecast = null; }
  if (forecastJ) { forecastJ = null; $('testDay').textContent = '⏩ Test a day'; return; }
  graphOn = true;
  const from = { steps: world.steps, x: cell.q[0], y: cell.q[1], angle: cell.q[2] * 180 / Math.PI,
    share: cell.metab ? cell.metab.E / cell.metab.C : undefined,
    damage: cell.pieces[0].inclusions.filter((i) => i.material === 'plastid' && !i.stolen).map((i) => i.damage || 0),
    stolen: (cell.stolen || []).map((x) => ({ ...x })), lost: [...(cell.lost || [])],
    grow: cell.grow && { E: cell.grow.E / cell.grow.Eneed, N: cell.grow.N / cell.grow.Nneed }, size: cell.size || 1,
    nitro: world.nitro && Float64Array.from(world.nitro.c) };
  const settings = { gravity: world.gravity, light: world.light, day: world.day, flow: world.flow, metab: world.metab, grow: world.grow };
  stopForecast = forecast(cell.design, from, settings, (p) => { $('testDay').textContent = `⏩ ${Math.round(100 * p)}%`; },
    (j) => { stopForecast = null; forecastJ = j; $('testDay').textContent = '✕ Close forecast'; });
};
const clearForecast = () => { if (stopForecast) stopForecast(); stopForecast = null; forecastJ = null; $('testDay').textContent = '⏩ Test a day'; };

// ----- force arrows: weight minus buoyancy (red down: it sinks; blue up: it floats), the way it moves (green), and which
// way gravity turns it about its centre (orange arc; the turn it actually makes is the dashed one) -----
let forcesOn = false;
$('forcesBtn').onclick = () => { forcesOn = !forcesOn; };
let trailOn = false;
$('trailBtn').onclick = () => { trailOn = !trailOn; };
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
  if (world.grow && world.births) text += `  👥 ${world.cells.length}${world.cells.length >= PARAMS.grow.cap ? ' full' : ''}`;   // the population
  if (world.metab) {
    const n = nightsLeft(cell);
    text += `   ⚡ ${(100 * m.E / m.C).toFixed(0)}%${n !== null ? ` · ${n < 10 ? n.toFixed(1) : '10+'} nights` : ''}`;
    for (const inc of cell.pieces[0].inclusions) if (inc.store) text += `   ${inc.store} ${(100 * inc.fill).toFixed(0)}%`;
    if (world.grow) {
      const g = cell.grow; text += `   🌱 ${(cell.size || 1).toFixed(1)}× ⚡${(100 * g.E / g.Eneed).toFixed(0)}% N ${(100 * g.N / g.Nneed).toFixed(0)}%`;
    }
  }
  ctx.font = '12px system-ui';
  const tw = ctx.measureText(text).width + (m.starving ? 90 : 0);
  ctx.fillStyle = 'rgba(8,14,26,.8)'; ctx.fillRect(10, H - 62, tw + 14, 22);
  ctx.fillStyle = COLOR.outline; ctx.fillText(text, 17, H - 46);
  if (world.metab && m.starving) { ctx.fillStyle = COLOR.starving; ctx.fillText('STARVING', 17 + tw - 82, H - 46); }
}

// An organelle's outline (screen points P) as the current path: a smooth curve through the middles of its edges
function outlinePath(P) {
  const n = P.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const m0 = mid(P[n - 1], P[0]); ctx.moveTo(m0[0], m0[1]);
  for (let k = 0; k < n; k++) { const m = mid(P[k], P[(k + 1) % n]); ctx.quadraticCurveTo(P[k][0], P[k][1], m[0], m[1]); }
  ctx.closePath();
}
// screen points pushed `d` px outward (for a contour drawn just outside an organelle)
function grow(P, d) {
  const n = P.length;
  let A = 0;
  for (let k = 0; k < n; k++) A += P[k][0] * P[(k + 1) % n][1] - P[(k + 1) % n][0] * P[k][1];
  const out = A > 0 ? 1 : -1;   // which side of each edge is outside
  return P.map((p, k) => {
    const a = P[(k + n - 1) % n], b = P[(k + 1) % n];
    const nx = b[1] - a[1], ny = a[0] - b[0], l = Math.hypot(nx, ny) || 1;
    return [p[0] + out * nx / l * d, p[1] + out * ny / l * d];
  });
}
// body frame -> screen for cell c's body
const bodyXf = (c, X, Y) => ([x, y]) => [X(c.cx[0] + c.cs[0] * x - c.sn[0] * y), Y(c.cy[0] + c.sn[0] * x + c.cs[0] * y)];
// An inclusion's outline as the current path (xf: body frame -> screen)
function incPath(inc, xf) { outlinePath(inc.outline.map(xf)); }
// A store (starch, oil): a glossy container, its liquid filling it from the bottom as far as it is full
const LIQUID = { starch: ['#fbf4de', '#d8c79c'], oil: ['#ffe9a0', '#d9a024'] };
function drawLevel(inc, xf, s = 1, dim = 1) {
  const P = inc.outline.map(xf);
  const top = Math.min(...P.map((p) => p[1])), bot = Math.max(...P.map((p) => p[1]));
  const lx = Math.min(...P.map((p) => p[0])), rx = Math.max(...P.map((p) => p[0]));
  const [c0, c1] = LIQUID[inc.material] || [COLOR[inc.material], COLOR[inc.material]];
  ctx.save();
  outlinePath(P);
  ctx.fillStyle = 'rgba(8,14,26,.28)'; ctx.fill();
  ctx.clip();
  const h = (bot - top) * inc.fill;   // the level, from the lowest point up (screen y grows downward)
  const g = ctx.createLinearGradient(0, bot - h, 0, bot); g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.globalAlpha = 0.95 * dim; ctx.fillStyle = g; ctx.fillRect(lx, bot - h, rx - lx, h); ctx.globalAlpha = 1;
  if (inc.fill > 0.02 && inc.fill < 0.98) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, bot - h); ctx.lineTo(rx, bot - h); ctx.stroke(); }
  const r = (rx - lx) / 2, gx = lx + r * 0.65, gy = top + (bot - top) * 0.3, gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.5);
  gg.addColorStop(0, `rgba(255,255,245,${(0.55 * dim).toFixed(2)})`); gg.addColorStop(1, 'rgba(255,255,245,0)'); ctx.fillStyle = gg; ctx.fillRect(lx, top, rx - lx, bot - top);
  ctx.restore();
  ctx.strokeStyle = c1; ctx.globalAlpha = 0.8; ctx.lineWidth = Math.max(0.4 * s, 1);
  outlinePath(P); ctx.stroke(); ctx.globalAlpha = 1;
}
// A buoyancy chamber's colour: pale while light, clear blue-grey at neutral, deep blue while heavy
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
function drawNucleus(inc, xf, s, rot) {
  const r = Math.max(inc.r * s, 2);
  {
    const [gx, gy] = xf([inc.x, inc.y]), ng = ctx.createRadialGradient(gx - r * 0.3, gy - r * 0.3, r * 0.1, gx, gy, r * 1.05);
    ng.addColorStop(0, 'rgba(214,200,255,.9)'); ng.addColorStop(1, 'rgba(104,84,170,.85)');
    incPath(inc, xf); ctx.fillStyle = ng; ctx.fill();
    ctx.strokeStyle = 'rgba(235,225,255,.6)'; ctx.lineWidth = Math.max(1, 0.3 * s); ctx.stroke();
  }
  // specks spread round its widest inside spot, each as far out as the outline allows that way (a round one: its centre)
  const P = inc.outline.map(xf), core = inc.core || (inc.core = inscribed(inc.outline, true)), [cx, cy] = xf([core[1], core[2]]);
  const at = (t, a, d) => {
    const dx = Math.cos(a - rot), dy = Math.sin(a - rot);
    let reach = Infinity;   // the ray from the core to the outline
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const ex = P[i][0] - P[j][0], ey = P[i][1] - P[j][1], den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = P[j][0] - cx, wy = P[j][1] - cy, u = (wx * ey - wy * ex) / den, v = (wx * dy - wy * dx) / den;
      if (u > 0 && v >= 0 && v <= 1 && u < reach) reach = u;
    }
    if (!isFinite(reach)) reach = r;
    return [cx + dx * d * reach, cy + dy * d * reach];
  };
  ctx.fillStyle = COLOR.chromatin;
  for (const [t, a, d] of [[-0.6, 0.6, 0.6], [0.5, 2.1, 0.66], [0, 3.4, 0.45], [0.7, 4.6, 0.7], [-0.3, 5.5, 0.35], [0.2, 1.3, 0.25]]) {
    const [x, y] = at(t, a, d); ctx.beginPath(); ctx.arc(x, y, Math.max(r * 0.07, 0.8), 0, Math.PI * 2); ctx.fill();
  }
  const [nx, ny] = at(0.3, -0.7, 0.3);
  ctx.fillStyle = COLOR.nucleolus; ctx.beginPath(); ctx.arc(nx, ny, r * 0.26, 0, Math.PI * 2); ctx.fill();
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
const CELL_T0 = performance.now();
// ----- a cell as under a living microscope (author, 2026-11-03; design/microscope-mockup.html): a see-through body in its
// species' tint, a membrane that never quite holds still, streaming cytoplasm, organelles with depth, flagella as smooth
// tapering whips in their rule colour. What the old drawing showed is all still here: store levels, a chamber's float
// or sink, bleached and stolen plastids, the outline red while starving, blue resting, yellow stunned, grey dead. -----
// a capsule's outline (body frame, µm) as points, wobbling `wob` µm
function capsulePts(r, L, wob, t, seed) {
  const h = L / 2, per = 2 * L + 2 * Math.PI * r, n = Math.max(36, Math.min(96, Math.round(per / 1.6))), pts = [];
  for (let i = 0; i < n; i++) {
    let s = i / n * per, x, y, nx, ny;
    if (s < L) { x = -h + s; y = r; nx = 0; ny = 1; }
    else if ((s -= L) < Math.PI * r) { const a = Math.PI / 2 - s / r; nx = Math.cos(a); ny = Math.sin(a); x = h + r * nx; y = r * ny; }
    else if ((s -= Math.PI * r) < L) { x = h - s; y = -r; nx = 0; ny = -1; }
    else { s -= L; const a = -Math.PI / 2 - s / r; nx = Math.cos(a); ny = Math.sin(a); x = -h + r * nx; y = r * ny; }
    const u = i / n * 6.283, w = wob * (0.6 * Math.sin(3 * u + t * 1.3 + seed) + 0.4 * Math.sin(7 * u - t * 2.1 + seed * 2));
    pts.push([x + nx * w, y + ny * w]);
  }
  return pts;
}
const rgbOf = (c) => (c[0] === '#' ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : c.match(/\d+/g).slice(0, 3).map(Number));
const rgbaOf = (c, a) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };
const lighter = (c, f) => { const [r, g, b] = rgbOf(c); return `rgb(${Math.round(r + (255 - r) * f)},${Math.round(g + (255 - g) * f)},${Math.round(b + (255 - b) * f)})`; };
// a cell's outside parts as chains of pieces, root first (cached per design)
const chainCache = new WeakMap();
function chainsOf(c) {
  let ch = chainCache.get(c.design);
  if (ch) return ch;
  ch = [];
  const kids = c.pieces.map(() => []);
  c.pieces.forEach((p, i) => { if (p.parent >= 0) kids[p.parent].push(i); });
  for (const r of kids[0]) { const run = [r]; let k = r; while (kids[k].length) { k = kids[k][0]; run.push(k); } ch.push(run); }
  chainCache.set(c.design, ch);
  return ch;
}
// a soft glossy spot (upper left: the light comes from above)
function gloss(x, y, r, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,240,${a})`); g.addColorStop(1, 'rgba(255,255,240,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
// a smooth tapered stroke through screen points, w0 at the start to w1 at the end
function taper(P, w0, w1, style) {
  if (P.length < 2) return;
  const pts = [];   // Catmull-Rom, 4 steps a piece
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 4; k++) {
      const t = k / 4, t2 = t * t, t3 = t2 * t;
      pts.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  pts.push(P[P.length - 1]);
  ctx.strokeStyle = style; ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    ctx.lineWidth = w0 + (w1 - w0) * i / pts.length;
    ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0] + 0.01, pts[i][1]); ctx.stroke();
  }
}
function drawCell(c, X, Y, s, real = c) {   // c: posed for drawing; real: the cell itself
  ctx.lineCap = 'round';
  const t = (performance.now() - CELL_T0) / 1000, b = c.pieces[0], xf = bodyXf(c, X, Y), now = performance.now();
  const lit = world.light ? Math.max(Math.min(1, Math.sqrt(lightAt(world, c.cy[0])) * 1.25), 0.3 * twilight(world)) : 0.6;
  const tint = real.dead ? '#8a8f98' : speciesTint(real.species), small = b.a * s < 7;
  const glowing = (part) => real === cell && glow && glow.until > now && glow.parts.has(part);
  const seed = ((real.uid || 1) * 7.31) % 100;
  const rim = real.dead ? '#8a8f98' : real.stunT > 0 ? '#ffe066' : world.metab && c.metab.starving ? COLOR.starving : real.resting ? COLOR.resting : null;

  // the outside parts, behind the body: flagella, oars, springs, spines, tubes, harpoons
  for (const run of chainsOf(c)) {
    const r0 = c.pieces[run[0]], jt = r0.joint >= 0 ? c.joints[r0.joint] : null, tag = partColours(c.design).get(r0.part);
    const P = [[X(c.jx[run[0]]), Y(c.jy[run[0]])]];
    for (const i of run) { const p = c.pieces[i], h = p.L / 2; P.push([X(c.cx[i] + c.cs[i] * h), Y(c.cy[i] + c.sn[i] * h)]); }
    const w = Math.max(2 * r0.a * s, 1.4), harpoon = (c.harpoons || []).some((hp) => hp.piece === run[0]), feeder = (c.feeders || []).some((f) => f.piece === run[0]);
    if (glowing(r0.part)) taper(P, w + 8, w + 6, (tag || '#ffffff') + '55');
    if (jt && jt.burst) {   // a spring: a coil, bright while firing, dull while recharging
      const st = jt.burst.state, col = tag ? tag + (st === 'firing' ? '' : st === 'charged' ? 'dd' : '55') : st === 'firing' ? COLOR.coilFiring : st === 'charged' ? COLOR.coil : COLOR.coilEmpty;
      const [ax, ay] = P[0], [bx, by] = P[P.length - 1], len = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / len, ny = (bx - ax) / len, amp = Math.max(1.4 * s, 2);
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5 * s, 1.2); ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const f = k / 40, side = Math.sin(f * Math.PI * 7) * amp * (1 - 0.3 * f); const x = ax + (bx - ax) * f + nx * side, y = ay + (by - ay) * f + ny * side; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke(); continue;
    }
    if (harpoon || (!jt && !feeder)) {   // a spine (or a harpoon): glassy, tapering to a point
      if (r0.L < 0.5 && harpoon) continue;   // thrown: nothing there yet
      taper(P, w * 1.2, Math.max(w * 0.2, 0.6), tag ? rgbaOf(tag, 0.9) : `rgba(215,238,255,${0.6 + 0.3 * lit})`);
      if (w > 1.6) taper(P, w * 0.35, 0.3, 'rgba(255,255,255,.45)');
      if (harpoon) {   // a barb at the tip
        const [ex, ey] = P[P.length - 1], [px, py] = P[P.length - 2], a = Math.atan2(ey - py, ex - px), r = Math.max(1.5 * s, 4);
        ctx.fillStyle = tag || '#ffb0c8'; ctx.beginPath(); ctx.moveTo(ex + Math.cos(a) * r * 0.6, ey + Math.sin(a) * r * 0.6);
        ctx.lineTo(ex + Math.cos(a + 2.6) * r, ey + Math.sin(a + 2.6) * r); ctx.lineTo(ex + Math.cos(a - 2.6) * r, ey + Math.sin(a - 2.6) * r); ctx.closePath(); ctx.fill();
      }
      continue;
    }
    if (feeder) {   // the peduncle: a pink tube
      taper(P, w * 1.1, w * 0.8, tag ? rgbaOf(tag, 0.85) : 'rgba(255,150,170,.85)');
      taper(P, w * 0.4, w * 0.3, 'rgba(120,30,50,.6)');
      continue;
    }
    // a flagellum or an oar: a whip in its rule colour, pale when it has none; faded while stopped
    const stopped = stoppedAt(c, run[0]), base = tag || '#dcefe8';
    taper(P, w * 1.15, Math.max(w * 0.35, 0.7), rgbaOf(base, stopped ? 0.35 : 0.9));
    if (!stopped && w > 1.6) taper(P, w * 0.35, 0.3, 'rgba(255,255,255,.35)');
  }

  // the body: see-through in its species' tint, lit from above, its membrane wobbling a little
  const bp = capsulePts(b.a, b.L, small ? 0 : 0.3, t * (c.joints.some((j) => j.on) ? 1.6 : 1), seed).map(xf);
  const [ccx, ccy] = [X(c.cx[0]), Y(c.cy[0])], R = (b.a + b.L / 2) * s;
  if (!small) {   // a soft halo in the water
    const hg = ctx.createRadialGradient(ccx, ccy, b.a * s * 0.6, ccx, ccy, R + 6 * s);
    hg.addColorStop(0, rgbaOf(tint, 0)); hg.addColorStop(0.75, rgbaOf(tint, 0.05 + 0.05 * lit)); hg.addColorStop(1, rgbaOf(tint, 0));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(ccx, ccy, R + 6 * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  outlinePath(bp);
  const bg = ctx.createRadialGradient(ccx, ccy - b.a * s * 0.35, b.a * s * 0.15, ccx, ccy, R);
  bg.addColorStop(0, rgbaOf(lighter(tint, 0.35), 0.12 + 0.08 * lit)); bg.addColorStop(0.7, rgbaOf(tint, 0.16 + 0.08 * lit)); bg.addColorStop(1, rgbaOf(tint, 0.32 + 0.12 * lit));
  ctx.fillStyle = bg; ctx.fill();
  ctx.clip();
  if (!small) {   // cytoplasm streaming: fine granules circling slowly
    const gr = real.grains || (real.grains = Array.from({ length: 26 }, () => ({ p: Math.random() * 6.283, q: 0.25 + 0.7 * Math.random(), w: 0.3 + 0.5 * Math.random() })));
    ctx.fillStyle = `rgba(230,240,225,${(0.16 + 0.14 * lit).toFixed(2)})`;
    for (const q of gr) {
      const a = q.p + t * 0.25 * q.w, [x, y] = xf([Math.cos(a) * (b.L / 2 + b.a * 0.8) * q.q, Math.sin(a) * b.a * 0.78 * q.q]);
      ctx.beginPath(); ctx.arc(x, y, Math.max((0.28 + 0.25 * q.w) * s, 0.6), 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const inc of b.inclusions) drawOrganelle(c, inc, xf, s, lit, small);
  if (real.meal) {   // a swallowed cell, shrinking and fading as it is digested
    const left = 1 - real.meal.t / PARAMS.engulf.time, rr = real.meal.r * Math.sqrt(Math.max(left, 0));
    ctx.globalAlpha = 0.25 + 0.55 * left; ctx.fillStyle = '#8a6a3c'; ctx.strokeStyle = '#d8c39a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ccx, ccy, Math.max(rr * s, 1), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  {   // light from above: a sheen on the upper side, shade below
    const sh = ctx.createLinearGradient(0, ccy - R, 0, ccy + R);
    sh.addColorStop(0, `rgba(255,255,240,${(0.10 + 0.14 * lit).toFixed(2)})`); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,10,25,.22)');
    ctx.fillStyle = sh; ctx.fillRect(ccx - R - 4, ccy - R - 4, 2 * R + 8, 2 * R + 8);
  }
  ctx.restore();
  // the membrane: a soft glow inside and a thin bright rim (in the state's colour while starving, resting, stunned, dead)
  outlinePath(bp);
  ctx.strokeStyle = rgbaOf(rim || tint, rim ? 0.35 : 0.18 + 0.1 * lit); ctx.lineWidth = Math.max(2.2 * s, rim ? 4 : 2); ctx.stroke();
  ctx.strokeStyle = rim || rgbaOf(lighter(tint, 0.45), 0.65 + 0.3 * lit); ctx.lineWidth = Math.max(0.55 * s, rim ? 2 : 1.2); ctx.stroke();
  if (b.plates) {   // armour: a tan band just inside the outline, its plates' seams dark
    const band = Math.max(b.plates * s, 1.5), inner = capsulePts(Math.max(b.a - b.plates / 2, 0.5), b.L, 0, 0, 0).map(xf);
    outlinePath(inner); ctx.strokeStyle = real.dead ? '#8a8f98' : 'rgba(205,185,138,.8)'; ctx.lineWidth = band; ctx.stroke();
    ctx.lineCap = 'butt'; ctx.setLineDash([1.2, Math.max(5, 2 * Math.PI * b.a * s / 14) - 1.2]); ctx.strokeStyle = 'rgba(60,48,28,.85)'; ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'round';
  }

  // sensors on the rim: eyespots (a red-orange pigment spot, glowing when lit), feelers (fine hairs), nutrient pores
  for (const sn of c.sensors) {
    const i = sn.piece, px = c.cx[i] + c.cs[i] * sn.x - c.sn[i] * sn.y, py = c.cy[i] + c.sn[i] * sn.x + c.cs[i] * sn.y;
    const stag = partColours(c.design).get(sn.part), lt = glowing(sn.part);
    if ((stag && real === cell && !small) || lt) {   // a ring in its rule colour (on the selected cell: where its rules are edited)
      ctx.strokeStyle = stag ? rgbaOf(stag, 0.85) : '#ffffff'; ctx.lineWidth = lt ? 4 : 1.5;
      ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max((sn.kind === 'statolith' ? sn.r : 1.2) * s, 3) + (lt ? 5 : 2.5), 0, Math.PI * 2); ctx.stroke();
    }
    if (sn.kind === 'statolith') continue;   // drawn with the organelles
    const dir = c.phi[i] + (sn.facing || 0);
    if (sn.kind === 'chem') {   // a tan pore, filled as far as the water is rich
      const r = Math.max(1.1 * s, 2.5);
      ctx.strokeStyle = 'rgba(200,178,106,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(X(px), Y(py), r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(200,178,106,.9)'; ctx.beginPath(); ctx.arc(X(px), Y(py), r * Math.sqrt(sn.value), 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (sn.kind !== 'light') {   // a feeler: fine hairs, bright while it feels something; its range, faint, on the selected cell
      const out = Math.atan2(py - c.cy[0], px - c.cx[0]), on = sn.value > (sn.kind === 'flow' ? 0.1 : 0);
      ctx.strokeStyle = on ? '#9fe8ff' : 'rgba(150,215,245,.6)'; ctx.lineWidth = on ? 1.4 : 1;
      for (let j = -1; j <= 1; j++) {
        const a = out + j * 0.35 + 0.08 * Math.sin(t * 3 + j + seed), L = Math.max(3.5 * s, small ? 2.5 : 6);
        ctx.beginPath(); ctx.moveTo(X(px), Y(py)); ctx.lineTo(X(px) + Math.cos(a) * L, Y(py) - Math.sin(a) * L); ctx.stroke();
      }
      if ((sn.kind === 'near' || sn.kind === 'flow') && real === cell) {
        ctx.strokeStyle = COLOR.near + (0.12 + 0.4 * sn.value) + ')'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(X(px), Y(py), sn.range * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      continue;
    }
    if (lt) {   // the eyespot's view, while its card is lit
      const r = 12;
      ctx.fillStyle = COLOR.light + '.12)';
      ctx.beginPath(); ctx.moveTo(X(px), Y(py));
      for (let k = 0; k <= 12; k++) { const a = dir - sn.cone / 2 + sn.cone * k / 12; ctx.lineTo(X(px + Math.cos(a) * r), Y(py + Math.sin(a) * r)); }
      ctx.closePath(); ctx.fill();
    }
    const on = sn.value > 0.5, ex = X(px - Math.cos(dir) * 0.6), ey = Y(py - Math.sin(dir) * 0.6), r = Math.max(1.5 * s, small ? 1.4 : 3);
    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * (on ? 1.8 : 1.2));
    eg.addColorStop(0, on ? 'rgba(255,170,90,1)' : 'rgba(190,70,40,.95)'); eg.addColorStop(0.5, on ? 'rgba(255,110,50,.85)' : 'rgba(140,40,25,.8)'); eg.addColorStop(1, 'rgba(200,60,30,0)');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, r * (on ? 1.8 : 1.2), 0, Math.PI * 2); ctx.fill();
  }
  for (const mo of c.mouths || []) {   // a mouth: a dark gap in the wall with a pale lip
    const [px, py] = padWorld(c, mo), a = Math.atan2(py - c.cy[0], px - c.cx[0]), r = Math.max(2.4 * s, small ? 2 : 4);
    ctx.fillStyle = 'rgba(30,8,16,.85)'; ctx.beginPath(); ctx.ellipse(X(px), Y(py), r, r * 0.5, -a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,205,.85)'; ctx.lineWidth = Math.max(0.5 * s, 1.2); ctx.beginPath(); ctx.ellipse(X(px), Y(py), r * 1.12, r * 0.62, -a + Math.PI / 2, 0, Math.PI * 2); ctx.stroke();
  }
  for (const pad of c.pads) {   // a pad: a glowing sticky knob (kin violet, mucus pale gold)
    const [px, py] = padWorld(c, pad), r = Math.max(pad.r * s * 1.4, small ? 2 : 3.5), col = COLOR[pad.kind];
    const pg = ctx.createRadialGradient(X(px), Y(py), 0, X(px), Y(py), r);
    pg.addColorStop(0, rgbaOf(lighter(col, 0.4), pad.link ? 1 : 0.8)); pg.addColorStop(1, rgbaOf(col, 0));
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(X(px), Y(py), r, 0, Math.PI * 2); ctx.fill();
  }
  if (real === cell && c.design === design && !arrange) {      // where the Build panel would put the next part
    const [mx, my] = surfacePoint(design.body, Number($('partAngle').value));
    const [wx, wy] = [c.cx[0] + c.cs[0] * mx - c.sn[0] * my, c.cy[0] + c.sn[0] * mx + c.cs[0] * my];
    ctx.fillStyle = COLOR.selected; ctx.strokeStyle = COLOR.selected; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X(wx), Y(wy), 3, 0, Math.PI * 2); ctx.fill();
    const dir = c.phi[0] + (Number($('partAngle').value) + Number($('partTilt').value)) * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(X(wx), Y(wy)); ctx.lineTo(X(wx + Math.cos(dir) * 8), Y(wy + Math.sin(dir) * 8)); ctx.stroke();
  }
  if (real === cell && world.cells.length > 1) {   // a ring round the selected cell
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.arc(X(c.q[0]), Y(c.q[1]), R + 6, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}
// one organelle (body frame outline -> screen through xf)
function drawOrganelle(c, inc, xf, s, lit, small) {
  if (inc.r <= 0.02) return;
  const dim = 0.6 + 0.4 * lit, [ix, iy] = xf([inc.x, inc.y]), r = inc.r * s;
  if (inc.store) { drawLevel(inc, xf, s, dim); return; }   // a container, filled as far as it is full
  if (inc.material === 'nucleus') { drawNucleus(inc, xf, s, c.phi[0] + (inc.ang || 0)); return; }
  if (inc.material === 'plastid') {   // green (or pink-red), bleaching as light damages it; fine thylakoid bands; glossy
    const col = plastidColor(inc);
    if (inc.stolen) ctx.globalAlpha = 0.25 + 0.75 * inc.stolen.fade;   // a stolen plastid pales as it fades
    ctx.save(); incPath(inc, xf);
    const g = ctx.createLinearGradient(ix, iy - r, ix, iy + r);
    g.addColorStop(0, lighter(col, 0.3)); g.addColorStop(1, rgbaOf(col.replace(/\d+/g, (v) => Math.round(v * 0.45)), 1));
    ctx.fillStyle = g; ctx.fill();
    if (!small) {
      ctx.clip();
      const a = c.phi[0] + (inc.ang || 0), ux = Math.cos(a), uy = -Math.sin(a), nx = -uy, ny = ux, span = (inc.r + (inc.h || 0) + 1) * s;
      ctx.strokeStyle = 'rgba(20,60,20,.22)'; ctx.lineWidth = Math.max(0.06 * r, 0.6);
      for (let o = -0.7; o <= 0.71; o += 0.35) { const ox = ix + nx * o * r, oy = iy + ny * o * r; ctx.beginPath(); ctx.moveTo(ox - ux * span, oy - uy * span); ctx.lineTo(ox + ux * span, oy + uy * span); ctx.stroke(); }
      gloss(ix - r * 0.35, iy - r * 0.4, r * 0.7, 0.3 * dim);
    }
    ctx.restore();
    if (inc.stolen) { ctx.globalAlpha = 1; ctx.setLineDash([2, 2]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; incPath(inc, xf); ctx.stroke(); ctx.setLineDash([]); }
    else { incPath(inc, xf); ctx.strokeStyle = rgbaOf(lighter(col, 0.5), 0.35); ctx.lineWidth = 1; ctx.stroke(); }
    return;
  }
  if (inc.pumpable) {   // a buoyancy chamber: a clear bubble, pale while light, deep blue while heavy
    const col = sapColor(inc), heavy = Math.min(Math.max((inc.density - PARAMS.chamber.neutral) / (inc.max - PARAMS.chamber.neutral), 0), 1);
    incPath(inc, xf);
    const g = ctx.createRadialGradient(ix, iy, r * 0.2, ix, iy, r);
    g.addColorStop(0, rgbaOf(col, 0.06 + 0.5 * heavy)); g.addColorStop(0.85, rgbaOf(col, 0.16 + 0.45 * heavy)); g.addColorStop(1, rgbaOf(col, 0.4 + 0.4 * heavy));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = rgbaOf(lighter(col, 0.4), 0.6 * dim); ctx.lineWidth = Math.max(0.4 * s, 1); ctx.stroke();
    if (!small) { ctx.strokeStyle = `rgba(255,255,255,${0.5 * dim})`; ctx.lineWidth = Math.max(0.6 * s, 1); ctx.beginPath(); ctx.arc(ix, iy, r * 0.75, Math.PI + 0.5, Math.PI + 1.3); ctx.stroke(); }
    return;
  }
  if (inc.material === 'statolith') {   // a chamber with a dense grain lying on its lower wall
    incPath(inc, xf); ctx.fillStyle = 'rgba(190,210,230,.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(200,215,230,.5)'; ctx.lineWidth = 1; ctx.stroke();
    const g = 0.4 * inc.r, drop = world.gravity ? inc.r - g : 0, [gx, gy0] = xf([inc.x, inc.y]), gy = gy0 + drop * s;   // down on screen
    ctx.fillStyle = '#5a4838'; ctx.beginPath(); ctx.arc(gx, gy, Math.max(g * s, 1.5), 0, Math.PI * 2); ctx.fill();
    gloss(gx - g * s * 0.3, gy - g * s * 0.3, Math.max(g * s * 0.5, 1), 0.7);
    return;
  }
  if (inc.toxin) {   // a toxin sac: a glowing magenta vesicle
    incPath(inc, xf);
    const g = ctx.createRadialGradient(ix - r * 0.3, iy - r * 0.3, r * 0.1, ix, iy, r);
    g.addColorStop(0, 'rgba(255,150,210,.95)'); g.addColorStop(1, 'rgba(160,40,110,.9)');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(255,170,220,.8)'; ctx.lineWidth = 1; ctx.stroke();
    return;
  }
  incPath(inc, xf); ctx.fillStyle = COLOR[inc.material] || '#888'; ctx.fill();
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
    if (l.feed) { ctx.save(); ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = Math.max(1.2 * s, 2.5); }
    ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx) + 0.01, Y(by)); ctx.stroke();
    if (l.feed) { ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(X(bx), Y(by), Math.max(1.5 * s, 3), 0, 2 * Math.PI); ctx.fill(); ctx.restore(); }
  }
  // harpoon darts: a bright line from the spine's tip for a moment after each shot, a star where it struck
  for (const c of world.cells) for (const h of c.harpoons || []) {
    const sh = h.shot, age = sh ? (world.steps - sh.step) * PARAMS.time.dt : Infinity;
    if (age > 0.6) continue;
    ctx.save(); ctx.globalAlpha = 1 - age / 0.6; ctx.strokeStyle = '#ffe066'; ctx.lineWidth = Math.max(0.8 * s, 2);
    ctx.beginPath(); ctx.moveTo(X(sh.x0), Y(sh.y0)); ctx.lineTo(X(sh.x1) + 0.01, Y(sh.y1)); ctx.stroke();
    if (sh.hit) { ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(X(sh.x1), Y(sh.y1), Math.max(2 * s, 4), 0, 2 * Math.PI); ctx.fill(); }
    ctx.restore();
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
  // the whole tank at its true shape (1.6 × 2 mm), small in the top-right corner: 56 px wide at most
  const k = Math.min((H - 40) / TH, 0.15 * W / TW, 56 / TW);
  const mw = TW * k, mh = TH * k, mx = W - mw - 12;
  let my = 12;   // below the numbers box when that reaches across to it
  const st = $('stats'), cr = canvas.getBoundingClientRect();
  if (!st.hidden) { const r = st.getBoundingClientRect(); if (r.right - cr.left > mx - 6) my = Math.max(my, r.bottom - cr.top + 8); }
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
  if (arrange) { arrangeWheel(e); return; }
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
  if (arrange) { arrangeDown(e); return; }
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {           // a second finger: stop dragging, start pinching
    if (drag && drag.cell) $('viewMode').value = drag.view;
    drag = null;
    pinch = pinchState();
    $('viewMode').value = 'free';
    return;
  }
  if (touches.size > 2) return;
  const r = canvas.getBoundingClientRect(), gx = e.clientX - r.left, gy = e.clientY - r.top;
  if (graphBox && touches.size === 1 && gx >= graphBox.x && gx <= graphBox.x + graphBox.w && gy >= graphBox.y && gy <= graphBox.y + graphBox.h) {
    graphPop = !graphPop; touches.delete(e.pointerId); tap = null; drag = null; return;   // the strip: switch day graph / population
  }
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
  if (arrange) { arrangeMove(e); return; }
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
// ----- arrange: the cell held still and large, everything inside it soft (author, 2026-10-28; soft blobs 2026-10-29). Tap an
// organelle to select it; drag it to move it (pressed into the wall it flattens there and bulges elsewhere, its volume
// kept; the statolith is rigid); one finger elsewhere pans the view; pinch
// anywhere to make it bigger or smaller. Drag the cell's wall to make the cell bigger or smaller. The others stay put;
// overlaps are allowed while arranging (drawn red); ✓ Done warns until they are sorted out (Squish to fit packs them,
// denting each other, each keeping its volume). The shaping itself: mould.js. -----
let arrange = null;   // { prev, trial, cell, sel, drag, base, bad, problems }
const wallCentre = (body, x) => { const h = (body.length || 0) / 2; return [Math.max(-h, Math.min(h, x)), 0]; };
// keep the Edit sliders' memory (build) in step with where and how an organelle now is
function syncBuild(p, body) {
  const b = p.build;
  if (!b) return;
  const [x, y] = p.at;
  b.where = (Math.round(Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  const far = PART_TEMPLATES[b.tpl] ? PART_TEMPLATES[b.tpl](body, b.where, 'x', b.size, b.tilt, 1, b.feels, b.length, b.strength, b.content)[0] : null;
  const fd = far ? Math.hypot(far.at[0], far.at[1]) : 0;
  b.depth = fd > 0 ? Math.min(1, Math.round(Math.hypot(x, y) / fd * 100) / 100) : 0;
  if (!rigid(p)) { b.length = p.length || 0; b.tilt = p.angle || 0; }
  const full = insideRadius(body, 1);   // the Size slider: a share of the room
  if (full > 0 && p.material !== 'nucleus') b.size = Math.min(1, Math.round((p.radius + 0.05) / full * 100) / 100);
}
// what is wrong with the trial: overlapping organelles (indices) and the builder's own complaint, if any
function problemsOf(d) {
  const over = new Set(), inc = d.parts.map((p, i) => [p, i]).filter(([p]) => isInc(p));
  const pts = inc.map(([p]) => bodyPoints(p));
  for (let a = 0; a < inc.length; a++) for (let b = a + 1; b < inc.length; b++) if (polysOverlap(pts[a], pts[b])) { over.add(inc[a][1]); over.add(inc[b][1]); }
  for (const [p, i] of inc) if (outOfWall(p, d.body) > 1e-3) over.add(i);
  let msg = '';
  try { buildCell(d); } catch (e) { msg = e.message; }
  return { over, msg };
}
// the cell as it would be with the trial design (overlaps allowed), posed like the real one
function arrangeCell(d) {
  const c = buildCell(d, { loose: true });
  c.q.set(cell.q.subarray(0, c.n));
  updatePose(c);
  c.metab = cell.metab;
  c.pieces[0].inclusions.forEach((inc, i) => {
    const o = cell.pieces[0].inclusions[i];
    if (o && o.material === inc.material) { inc.fill = o.fill; inc.damage = o.damage; inc.density = o.density; }
  });
  return c;
}
function setTrial(d) {
  d.parts.forEach((x) => { if (isInc(x)) syncBuild(x, d.body); });
  try { arrange.cell = arrangeCell(d); arrange.trial = d; } catch (e) { $('buildErr').textContent = e.message; return; }
  arrange.problems = problemsOf(d);
  $('buildErr').textContent = arrange.problems.over.size ? 'red: overlapping or outside the wall (allowed while arranging)' : '';
}
// screen point -> the body's frame (x along its axis)
function bodyPoint(e) {
  const [wx, wy] = toWorld(e), c = cell, dx = wx - c.cx[0], dy = wy - c.cy[0];
  return [c.cs[0] * dx + c.sn[0] * dy, -c.sn[0] * dx + c.cs[0] * dy];
}
// what is under the finger. One selected: on it (or a fingertip from it) the finger moves it; anywhere else it pans the
// view. Nothing selected: a part on the rim or the cell's wall is dragged; anywhere else the finger pans the view, and a
// tap (no slide) on an organelle selects it (author, 2026-10-29: edge reshaping was dropped, it caught the grab).
function arrangeHit(e) {
  const P = bodyPoint(e), s = Number($('zoom').value), d = arrange.trial, tol = 16 / s;   // about a fingertip
  const sel = arrange.sel !== null ? d.parts[arrange.sel] : null;
  if (sel) {
    if (polyDist(bodyPoints(sel), P[0], P[1]) < tol) return { k: arrange.sel, kind: 'inc', off: [sel.at[0] - P[0], sel.at[1] - P[1]] };
    return { kind: 'pan' };
  }
  let inc = null, incD = tol, rim = null, rimD = tol;
  d.parts.forEach((p, k) => {
    if (isInc(p)) { const g = polyDist(bodyPoints(p), P[0], P[1]); if (g < incD) { incD = g; inc = k; } }
    else if ((!p.parent || p.parent === 'body') && p.at) { const g = Math.hypot(p.at[0] - P[0], p.at[1] - P[1]) - 2; if (g < rimD) { rimD = g; rim = k; } }
  });
  if (incD < 0) return { kind: 'pan', tapK: inc };   // inside an organelle
  if (rim !== null && rimD < incD) return { k: rim, kind: 'rim' };
  const [cx, cy] = wallCentre(d.body, P[0]), r = Math.hypot(P[0] - cx, P[1] - cy);
  if (inc === null && Math.abs(r - d.body.radius) < tol) return { kind: 'wall', r0: r };
  return { kind: 'pan', tapK: inc };
}
// a rim part rebuilt where `where` says, keeping its rule, colour and name
function placeRim(d, k, where) {
  const p = d.parts[k], g = partGroups(d.parts).find((x) => x.members[0] === p), b = p.build;
  if (!g || !b) return;
  const fresh = PART_TEMPLATES[b.tpl](d.body, where, b.id, b.size, b.tilt, b.depth, b.feels, b.length, b.strength, b.content, b.pull);
  if (b.flip) flipPart(fresh);
  fresh[0].build = { ...b, where };
  g.members.forEach((m, i) => { if (fresh[i] && m.joint && fresh[i].joint) for (const key of ['controls', 'speed']) if (m.joint[key]) fresh[i].joint[key] = m.joint[key]; });
  for (const key of ['tag', 'name']) if (p[key] !== undefined) fresh[0][key] = p[key];
  d.parts.splice(k, g.members.length, ...fresh);
}
// follow the finger (from the shapes at the start of the gesture)
function arrangeTo(e) {
  const a = arrange, P = bodyPoint(e), d = JSON.parse(JSON.stringify(a.base)), g = a.drag;
  if (g.kind === 'rim') { placeRim(d, g.k, (Math.round(Math.atan2(P[1], P[0]) * 180 / Math.PI) + 360) % 360); setTrial(d); return; }
  if (g.kind === 'wall') {   // the cell bigger or smaller; organelles keep their size (flattened on the wall if they no longer fit)
    const [cx, cy] = wallCentre(d.body, P[0]);
    d.body.radius = Math.round(Math.max(3, Math.min(50, a.base.body.radius + Math.hypot(P[0] - cx, P[1] - cy) - g.r0)) * 2) / 2;
    d.parts.forEach((p, k) => { if (!isInc(p) && (!p.parent || p.parent === 'body') && p.build) placeRim(d, k, p.build.where); });
    fitWall(d);
    setTrial(d); return;
  }
  const p = d.parts[g.k], B = a.base.parts[g.k];
  if (a.pinchF) {   // bigger or smaller, the same shape
    if (rigid(p)) p.radius = Math.round(B.radius * a.pinchF * 100) / 100;
    else { toOutline(B); p.at = B.at; scaleBy(p, B.outline, a.pinchF, d.body); }
    setTrial(d); return;
  }
  // moved: where its middle would be; pressed into the wall it flattens there and bulges elsewhere (its volume kept)
  if (!moveTo(p, B, [P[0] + g.off[0], P[1] + g.off[1]], d.body)) return;   // the statolith can't go into the wall
  // the others stay locked where they are (red where they overlap); only Squish to fit packs them
  setTrial(d);
}
// the Zoom slider (closer than the arrange view starts) and the selected organelle's Turn
function showTurn() {
  const a = arrange, p = a && a.sel !== null ? a.trial.parts[a.sel] : null;
  $('arrTurn').disabled = !p; $('arrDeselect').disabled = !p; $('arrRemove').disabled = !p;
  if (p) $('arrTurn').value = Math.round(((p.angle || 0) + 540) % 360 - 180);
  $('arrTurnOut').textContent = p ? `${$('arrTurn').value}°` : 'select one';
}
$('arrZoom').oninput = () => { if (!arrange) return; $('zoom').value = Math.min(40, arrange.zoom0 * Number($('arrZoom').value)); };
// the view's centre in the body's frame: X / Y sliders (a share of the cell's size each way); selecting centres on it
const panSpan = () => (design.body.radius + (design.body.length || 0) / 2) * 1.2;
function lookAt([x, y]) {
  if (!arrange) return;
  arrange.pan = [x, y];
  $('arrPanX').value = Math.round(x / panSpan() * 100); $('arrPanY').value = Math.round(y / panSpan() * 100);
}
$('arrPanX').oninput = $('arrPanY').oninput = () => { if (arrange) arrange.pan = [Number($('arrPanX').value) / 100 * panSpan(), Number($('arrPanY').value) / 100 * panSpan()]; };
$('arrTurn').oninput = () => {
  const a = arrange;
  if (!a || a.sel === null) return;
  const d = JSON.parse(JSON.stringify(a.trial));
  d.parts[a.sel].angle = Number($('arrTurn').value);
  setTrial(d); $('arrTurnOut').textContent = `${$('arrTurn').value}°`;
};
$('arrTurn').onchange = () => { if (arrange) commitIfFits(); };
$('arrDeselect').onclick = () => { if (arrange) { arrange.sel = null; showTurn(); } };
// the selected organelle removed (its cables unplugged; one Undo step once the rest fits)
$('arrRemove').onclick = () => {
  const a = arrange;
  if (!a || a.sel === null) return;
  const d = JSON.parse(JSON.stringify(a.trial)), p = d.parts[a.sel];
  d.parts.splice(a.sel, 1);
  if (p.id) unplug(d, new Set([p.id]));
  a.sel = null; showTurn();
  setTrial(d); commitIfFits();
};
function arrangeTravel(from, to) {
  const a = arrange;
  if (from === past && JSON.stringify(a.trial) !== JSON.stringify(design)) { setTrial(JSON.parse(JSON.stringify(design))); $('squishBtn').hidden = true; return; }
  travel(from, to);
  const sel = a.sel;
  setTrial(JSON.parse(JSON.stringify(design)));
  a.sel = sel !== null && a.trial.parts[sel] && isInc(a.trial.parts[sel]) ? sel : null; showTurn(); $('squishBtn').hidden = true;
}
$('arrUndo').onclick = () => { if (arrange) arrangeTravel(past, future); };
$('arrRedo').onclick = () => { if (arrange) arrangeTravel(future, past); };
function startArrange() {
  if (arrange || !cell || cell.design !== design) return;
  const W = canvas.clientWidth, H = canvas.clientHeight, b = design.body;
  arrange = { prev: { view: $('viewMode').value, zoom: $('zoom').value }, trial: JSON.parse(JSON.stringify(design)), cell: null, sel: null, drag: null, base: null, pinchF: null, problems: { over: new Set(), msg: '' } };
  playing = false; $('play').textContent = '▶'; document.body.classList.add('arranging'); $('barMore').classList.remove('open');
  $('viewMode').value = 'follow';
  $('zoom').value = arrange.zoom0 = Math.min(20, 0.45 * Math.min(W, H * 0.55) / (b.radius + (b.length || 0) / 2));
  $('arrZoom').value = 1; $('arrangeTools').hidden = false; $('arrangeView').hidden = false; arrange.pan = [0, 0]; lookAt([0, 0]); showTurn();
  $('arrangeBtn').textContent = '✓ Done arranging';
  $('squishBtn').hidden = true;
  $('buildErr').textContent = 'slide to look around · tap an organelle to select it, then drag it · pinch to resize it · drag the wall to resize the cell';
}
function stopArrange(force) {
  if (!arrange) return;
  const pr = problemsOf(arrange.trial);
  if (!force && (pr.over.size || pr.msg)) {   // not yet: say what is wrong, and offer to squish
    arrange.problems = pr;
    $('buildErr').textContent = `⚠ not done: ${pr.over.size ? `${pr.over.size} organelles overlap or stick out (red)` : pr.msg}. Move them, or Squish to fit`;
    $('squishBtn').hidden = false;
    return;
  }
  if (!force && JSON.stringify(arrange.trial) !== JSON.stringify(design)) applyDesign(JSON.parse(JSON.stringify(arrange.trial)));
  $('viewMode').value = arrange.prev.view; $('zoom').value = arrange.prev.zoom;
  arrange = null; document.body.classList.remove('arranging');
  $('arrangeTools').hidden = true; $('arrangeView').hidden = true;
  $('arrangeBtn').textContent = '✋ Arrange inside the cell';
  $('squishBtn').hidden = true;
  if (!force) $('buildErr').textContent = '';
}
$('arrangeBtn').onclick = () => (arrange ? stopArrange() : startArrange());
// Squish to fit: soft packing until nothing overlaps (or it can't do better)
$('squishBtn').onclick = $('arrFit').onclick = () => {
  if (!arrange) return;
  const d = JSON.parse(JSON.stringify(arrange.trial));
  relax(d, -1, 150);
  setTrial(d);
  if (!arrange.problems.over.size && !arrange.problems.msg) { $('squishBtn').hidden = true; $('buildErr').textContent = 'fits: tap ✓ Done'; }
};
// fingers while arranging (the tank's own drag, pan and pinch-zoom are off)
function arrangeDown(e) {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const a = arrange;
  if (touches.size === 1) {
    const hit = arrangeHit(e);
    a.base = JSON.parse(JSON.stringify(a.trial));
    a.drag = { ...hit, id: e.pointerId, x: e.clientX, y: e.clientY, pan0: [...a.pan] };
  } else if (touches.size === 2 && a.sel === null) {   // nothing selected: two fingers zoom, as usual
    const [p, q] = [...touches.values()];
    a.drag = null; a.zoomPinch = { d0: Math.hypot(p.x - q.x, p.y - q.y), z0: Number($('arrZoom').value) };
  } else if (touches.size === 2 && a.sel !== null) {   // a second finger anywhere: pinch the selected one's size
    const [p, q] = [...touches.values()];
    a.base = JSON.parse(JSON.stringify(a.trial));
    a.pinch0 = Math.hypot(p.x - q.x, p.y - q.y);
    a.drag = { kind: 'inc', k: a.sel, off: [0, 0], id: -2 };
    a.pinchF = 1;
  }
}
function arrangeMove(e) {
  const a = arrange;
  if (a.zoomPinch && touches.size === 2) {
    const [p, q] = [...touches.values()];
    $('arrZoom').value = Math.max(1, Math.min(4, a.zoomPinch.z0 * Math.hypot(p.x - q.x, p.y - q.y) / Math.max(a.zoomPinch.d0, 1)));
    $('arrZoom').oninput();
    return;
  }
  if (!a.drag) return;
  if (a.pinchF && touches.size === 2) {
    const [p, q] = [...touches.values()];
    a.pinchF = Math.max(0.3, Math.min(3, Math.hypot(p.x - q.x, p.y - q.y) / Math.max(a.pinch0, 1)));
    const B = a.base.parts[a.drag.k], [wx, wy] = [cell.cx[0] + cell.cs[0] * B.at[0] - cell.sn[0] * B.at[1], cell.cy[0] + cell.sn[0] * B.at[0] + cell.cs[0] * B.at[1]];
    const r = canvas.getBoundingClientRect(), s = Number($('zoom').value);
    arrangeTo({ clientX: r.left + r.width / 2 + (wx - cam.x) * s, clientY: r.top + r.height / 2 - (wy - cam.y) * s });
    return;
  }
  if (e.pointerId !== a.drag.id) return;
  if (a.drag.kind === 'pan') {   // the view follows the finger (as a slide of the X / Y sliders)
    const g = a.drag, s = Number($('zoom').value), wx = -(e.clientX - g.x) / s, wy = (e.clientY - g.y) / s, m = panSpan();
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) g.moved = true;
    const bx = cell.cs[0] * wx + cell.sn[0] * wy, by = -cell.sn[0] * wx + cell.cs[0] * wy;
    lookAt([Math.max(-m, Math.min(m, g.pan0[0] + bx)), Math.max(-m, Math.min(m, g.pan0[1] + by))]);
    return;
  }
  arrangeTo(e);
}
function arrangeUp(e) {
  touches.delete(e.pointerId);
  const a = arrange;
  if (touches.size > 0) return;
  const g = a.drag;   // a tap on an organelle (no slide, one finger): select it and look at it
  if (g && g.kind === 'pan' && !g.moved && g.tapK !== undefined && g.tapK !== null && a.sel === null) {
    a.sel = g.tapK; lookAt(a.trial.parts[g.tapK].at); showTurn();
  }
  a.drag = null; a.pinchF = null; a.zoomPinch = null;
  commitIfFits();
}
// what fits becomes the design at once (one Undo step); what doesn't waits, red, until it fits or ✓ Done
function commitIfFits() {
  const a = arrange;
  const pr = problemsOf(a.trial);
  if (!pr.over.size && !pr.msg && JSON.stringify(a.trial) !== JSON.stringify(design)) {
    const keep = JSON.parse(JSON.stringify(a.trial)), sel = a.sel;
    applyDesign(keep);
    a.trial = JSON.parse(JSON.stringify(design)); a.sel = sel; a.cell = null;
  }
}
// the mouse wheel resizes the selected organelle (as a pinch would)
function arrangeWheel(e) {
  const a = arrange;
  if (a.sel === null) { $('arrZoom').value = Math.max(1, Math.min(4, Number($('arrZoom').value) * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); $('arrZoom').oninput(); return; }
  a.base = JSON.parse(JSON.stringify(a.trial));
  a.drag = { kind: 'inc', k: a.sel, off: [0, 0], id: -1 };
  a.pinchF = e.deltaY < 0 ? 1.08 : 1 / 1.08;
  const B = a.base.parts[a.sel], [wx, wy] = [cell.cx[0] + cell.cs[0] * B.at[0] - cell.sn[0] * B.at[1], cell.cy[0] + cell.sn[0] * B.at[0] + cell.cs[0] * B.at[1]];
  const r = canvas.getBoundingClientRect(), s = Number($('zoom').value);
  arrangeTo({ clientX: r.left + r.width / 2 + (wx - cam.x) * s, clientY: r.top + r.height / 2 - (wy - cam.y) * s });
  arrangeUp({ pointerId: -1 });
}

// a tap (no drag) on the selected cell's nucleus opens the wiring view: the nucleus opened up
let tap = null;
function tappedNucleus(t, e) {
  if (!t || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) return false;
  const c = t.cell.drawn || t.cell;
  const dx = t.wx - c.cx[0], dy = t.wy - c.cy[0], bx = c.cs[0] * dx + c.sn[0] * dy, by = -c.sn[0] * dx + c.cs[0] * dy;   // in the body's frame
  return c.pieces[0].inclusions.some((inc) => inc.material === 'nucleus' && polyDist(inc.outline, bx, by) < t.r);
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
  if (ruleEdPick && ruleEd && g.category === 'Sensors') { ruleEdPick(g.members[0].id); return; }   // editing a condition: this sensor
  if (targetsOf(g).length) { openCards.add(key); linkFocus = key; }
  glow = { parts: new Set(g.members.map((x) => design.parts.indexOf(x))), until: performance.now() + 1500 };
  showSection('parts');
  listParts();
  const row = document.querySelector(`#partList .part[data-key="${CSS.escape(key)}"]`);
  if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1200); }
}
function lift(e) {
  if (arrange) { arrangeUp(e); return; }
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
segmented('speedSeg', 'speed'); segmented('viewSeg', 'viewMode'); segmented('wallSeg', 'bodyWall'); segmented('feelsSeg', 'partFeels'); segmented('contentSeg', 'partContent'); segmented('pigmentSeg', 'partPigment'); segmented('materialSeg', 'partMaterial'); segmented('sticksSeg', 'partSticks'); segmented('toxSeg', 'partToxKind');
const toggle = (btnId, boxId) => { $(btnId).onclick = () => { $(boxId).checked = !$(boxId).checked; $(boxId).dispatchEvent(new Event('change')); }; };
$('calmBtn').onclick = () => { calmBeats = !calmBeats; };
toggle('gravityBtn', 'gravity'); toggle('lightBtn', 'light'); toggle('dayBtn', 'day'); toggle('flowBtn', 'flow');
$('day').onchange = () => { if (world) world.day = $('day').checked; };
$('flow').onchange = () => { if (world) world.flow = $('flow').checked; };
$('stats').hidden = true;   // the numbers start hidden everywhere (author, 2026-11-01): ⓘ shows them
$('infoBtn').onclick = () => { $('stats').hidden = !$('stats').hidden; };
// a phone: the speed is one button that steps through them, and the rarer tools wait behind ⋯ More
$('speedBtn').onclick = () => { const sel = $('speed'); sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length; sel.dispatchEvent(new Event('change')); };
$('moreBtn').onclick = () => $('barMore').classList.toggle('open');
window.addEventListener('pointerdown', (e) => { if (!e.target.closest('#barMore, #moreBtn')) $('barMore').classList.remove('open'); });
$('rotL').onclick = () => rotate(cell, 15);
$('rotR').onclick = () => rotate(cell, -15);
const zoomBy = (k) => { $('zoom').value = Math.min(20, Math.max(0.3, Number($('zoom').value) * k)); if ($('viewMode').value === 'fit') $('viewMode').value = 'free'; };
$('zoomIn').onclick = () => zoomBy(1.4);
$('zoomOut').onclick = () => zoomBy(1 / 1.4);

// The panel's sections: on a phone one at a time, picked from the tabs down its left edge (a computer shows them all).
// The game opens the one it sends you to: tapping a part in the tank opens Parts, picking or editing a part opens Add.
const SECTION_KEY = 'tinygod.section';
function showSection(name) {
  if (!['body', 'add', 'parts', 'tank'].includes(name)) name = 'add';
  for (const el of document.querySelectorAll('.sec')) el.classList.toggle('show', el.dataset.sec === name);
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.sec === name);
  try { localStorage.setItem(SECTION_KEY, name); } catch (e) { /* private mode: not remembered */ }
}
for (const b of $('tabs').querySelectorAll('button')) b.onclick = () => showSection(b.dataset.sec);
showSection((() => { try { return localStorage.getItem(SECTION_KEY); } catch (e) { return null; } })() || 'add');

// A small picture of each part (as in design/desk-mockup.html), in the colour it is drawn in the tank: circles C x y r,
// ellipses E x y rx ry, paths otherwise; a trailing * fills it faintly
const PART_ICONS = {
  'Wave tail (swims)': ['#ff8a6c', 'C5 12 3*|M8 12 C12 5 15 19 19 12 S26 5 31 12'],
  'Flexible oar (swims)': ['#ff8a6c', 'C5 18 3*|M8 17 L17 11 Q24 6 31 8'],
  'Spine': ['#a8d8a0', 'C5 20 3*|M8 18 L31 4'],
  'Burst organ (escape)': ['#ffb54a', 'C5 12 3*|M8 12 q3 -7 5 0 t5 0 t5 0 t5 0 t4 0'],
  'Nucleus (the brain)': ['#c9b6ea', 'C17 12 8*|C15 11 2.2*|C20 15 1|C13 15 1'],
  'Plastid (makes energy)': ['#8fc94a', 'E17 12 12 6*|M8 12 L26 12'],
  'Energy store': ['#ece3c4', 'C17 12 7|M11 14.5 Q17 13 23 14.5 L23 16 Q17 21 11 16 Z*'],
  'Buoyancy chamber': ['#7cb0ff', 'C17 12 8*|M13 8 l2 0|M19 9 l1 0|M15 14 l1 0'],
  'Toxin sac': ['#d0508a', 'C17 12 8*|M13 9 l8 6|M21 9 l-8 6'],
  'Mouth (engulfs)': ['#e8b3c8', 'M6 12 Q17 0 28 12 Q17 24 6 12|C17 12 3*'],
  'Pad': ['#e070ff', 'M5 18 Q17 4 29 18|M8 20 L26 20'],
  'Peduncle (feeds on others)': ['#ff6b8a', 'C5 12 3*|M8 12 L27 12|M27 8 L31 12 L27 16'],
  'Light sensor (eyespot)': ['#ff8a3c', 'C17 12 5*|M7 6 L11 9|M17 2 L17 5|M27 6 L23 9'],
  'Statolith (which way is up)': ['#e8eef5', 'C17 12 8|C17 17.5 2.6*'],
  'Feeler': ['#5fd0ff', 'C5 20 3*|M8 18 Q14 5 30 6|M27 3 l3 3 -3 3'],
  'Nutrient sensor': ['#d9b46a', 'C17 15 9|C14 17 1.6*|C20 13 1.6*|C19 19 1.2*'],
};
function partIcon(name) {
  const [col, spec] = PART_ICONS[name] || ['#8197a8', 'C17 12 7'];
  const el = spec.split('|').map((q) => {
    const fill = q.endsWith('*'), d = fill ? q.slice(0, -1) : q, f = fill ? ` fill="${col}" fill-opacity=".25"` : ' fill="none"';
    const n = d.slice(1).split(' ').map(Number);
    if (d[0] === 'C') return `<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}"${f}/>`;
    if (d[0] === 'E') return `<ellipse cx="${n[0]}" cy="${n[1]}" rx="${n[2]}" ry="${n[3]}"${f}/>`;
    return `<path d="${d}"${f}/>`;
  }).join('');
  return `<svg viewBox="0 0 34 24" stroke="${col}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${el}</svg>`;
}
// Part buttons by category (short names, small pictures); tapping one picks it
const SHORT = {
  'Wave tail (swims)': 'Wave tail', 'Flexible oar (swims)': 'Flexible oar', 'Stiff flap (goes nowhere)': 'Stiff flap',
  'Spine, protein': 'Spine', 'Spine, glass': 'Spine', 'Burst organ (escape)': 'Spring',
  'Ejectisome, latched (Release)': 'Ejectisome', 'Oil droplet': 'Oil droplet',
  'Sap vacuole (slider)': 'Sap vacuole', 'Kin pad': 'Kin pad', 'Mucus pad': 'Mucus pad',
  'Feeler': 'Feeler', 'Spine': 'Spine', 'Pad': 'Pad', 'Peduncle (feeds on others)': 'Peduncle',
  'Nucleus (the brain)': 'Nucleus', 'Plastid (makes energy)': 'Plastid', 'Starch granule (quick store, heavy)': 'Starch',
  'Light sensor (eyespot)': 'Eyespot', 'Touch sensor': 'Touch', 'Proximity sensor': 'Proximity',
  'Energy store': 'Energy store', 'Buoyancy chamber': 'Buoyancy chamber', 'Statolith (which way is up)': 'Statolith',
  'Nutrient sensor': 'Nutrients', 'Vacuole (store or float)': 'Vacuole', 'Toxin sac': 'Toxin sac', 'Mouth (engulfs)': 'Mouth',
};
// shown in four rows: the small categories outside the body share one
const SHOWN = {};
for (const [cat, names] of Object.entries(CATEGORIES)) {
  const row = ['Spines & appendages', 'Escapes', 'Pads', 'Hunting'].includes(cat) ? 'On the outside' : cat;
  if (names.length) (SHOWN[row] = SHOWN[row] || []).push(...names);
}
for (const [cat, names] of Object.entries(SHOWN)) {
  const head = document.createElement('div'); head.className = 'cat'; head.textContent = cat;
  const chips = document.createElement('div'); chips.className = 'chips';
  for (const name of names) {
    const b = document.createElement('button');
    b.className = 'pbtn'; b.title = name; b.dataset.v = name;
    b.innerHTML = `${partIcon(name)}<span>${SHORT[name] || name}</span>`;
    b.onclick = () => {   // picking a part shows its ghost; tapping the lit one again hides it
      if (!editing && previewOn && $('partWhat').value === name) { previewOn = false; updatePreview(); return; }
      previewOn = true; showSection('add');
      $('partWhat').value = name; $('partWhat').dispatchEvent(new Event('change'));
    };
    chips.appendChild(b);
  }
  $('chips').append(head, chips);
}

// Light up the buttons that match the current state (cheap; once a frame)
function syncButtons() {
  for (const [boxId, selId] of [['speedSeg', 'speed'], ['viewSeg', 'viewMode'], ['wallSeg', 'bodyWall'], ['chips', 'partWhat'], ['feelsSeg', 'partFeels'], ['contentSeg', 'partContent'], ['pigmentSeg', 'partPigment'], ['materialSeg', 'partMaterial'], ['sticksSeg', 'partSticks'], ['toxSeg', 'partToxKind']]) {
    const v = $(selId).value;
    for (const b of $(boxId).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
  }
  $('gravityBtn').classList.toggle('on', $('gravity').checked);
  $('lightBtn').classList.toggle('on', $('light').checked);
  $('dayBtn').classList.toggle('on', $('day').checked);
  $('flowBtn').classList.toggle('on', $('flow').checked);
  $('calmBtn').classList.toggle('on', calmBeats);
  $('graphBtn').classList.toggle('on', graphOn);
  $('forcesBtn').classList.toggle('on', forcesOn);
  $('trailBtn').classList.toggle('on', trailOn);
  $('infoBtn').classList.toggle('on', !$('stats').hidden);
  $('speedBtn').textContent = $('speed').selectedOptions[0].text;
  $('moreBtn').classList.toggle('on', $('barMore').classList.contains('open'));
  $('flipBtn').classList.toggle('on', $('partFlip').checked);
  $('pullBtn').classList.toggle('on', $('partPull').checked);
  $('undo').disabled = !past.length; $('redo').disabled = !future.length;
  $('arrUndo').disabled = !past.length && !(arrange && arrange.problems && arrange.problems.over.size); $('arrRedo').disabled = !future.length;
  $('arrFit').disabled = !(arrange && arrange.problems && (arrange.problems.over.size || arrange.problems.msg));
  $('clearParts').disabled = !(design.parts || []).length;
}

// ----- a wide screen (over 1100 px): three windows, Tank · Cell · Nucleus (design/desk-mockup.html) -----
// The toolbar moves into the header, the patch view is docked in the Nucleus window and stays open. The tank and the
// cell have a width each (px), the nucleus takes the rest; a handle shares the room of its two neighbours; dragged well
// past its smallest width a window folds to a strip (its – button too); double-click a handle: the usual sizes.
const WIDE = window.matchMedia('(min-width: 1101px)');
const WINS = [$('winTank'), $('winCell'), $('winNuc')], WIN_MIN = [220, 300, 540], WIN_USUAL = [420, 380], STRIP = 40, HANDLE = 14;
const WIN_KEY = 'tinygod.windows';
let winWidths = [...WIN_USUAL];
const isMin = (i) => WINS[i].classList.contains('min');
function setMin(i, m) {
  WINS[i].classList.toggle('min', m); WINS[i].querySelector('.mini').textContent = m ? '+' : '–';
}
try {
  const w = JSON.parse(localStorage.getItem(WIN_KEY) || 'null');
  if (w && Array.isArray(w.widths) && w.widths.length === 2) winWidths = w.widths;
  if (w && Array.isArray(w.min)) w.min.forEach((m, i) => setMin(i, !!m));
} catch (e) { /* no saved sizes */ }
function layoutCols() {
  if (!desk) return;
  const room = $('cols').clientWidth - 2 * HANDLE;
  const keep = isMin(2) ? STRIP : WIN_MIN[2];   // never more than the screen: the nucleus keeps its smallest width
  let a = isMin(0) ? STRIP : Math.max(WIN_MIN[0], winWidths[0]), b = isMin(1) ? STRIP : Math.max(WIN_MIN[1], winWidths[1]);
  const over = a + b + keep - room;
  if (over > 0) { if (!isMin(0)) a = Math.max(WIN_MIN[0], a - over); const left = a + b + keep - room; if (left > 0 && !isMin(1)) b = Math.max(WIN_MIN[1], b - left); }
  // the nucleus folded: the cell window takes what is left over (or the tank, if the cell is folded too)
  let first = `${a}px`, mid = `${b}px`;
  if (isMin(2) && !isMin(1)) mid = 'minmax(0, 1fr)'; else if (isMin(2) && !isMin(0)) first = 'minmax(0, 1fr)';
  $('cols').style.gridTemplateColumns = `${first} ${HANDLE}px ${mid} ${HANDLE}px ${isMin(2) ? `${STRIP}px` : 'minmax(0, 1fr)'}`;
  try { localStorage.setItem(WIN_KEY, JSON.stringify({ widths: winWidths, min: WINS.map((_, i) => isMin(i)) })); } catch (e) { /* not remembered */ }
  // the patch view: docked and open while the Nucleus window is
  const open = !isMin(2);
  if (open !== patchOpen) { patchOpen = open; $('patch').hidden = !open; if (open) drawPatch(); }
}
function placeLayout() {
  const was = desk;
  desk = WIDE.matches;
  if (desk) $('topBar').appendChild($('bar')); else $('view').insertBefore($('bar'), $('stats'));
  if (was && !desk) { patchOpen = false; $('patch').hidden = true; $('cols').style.gridTemplateColumns = ''; }   // an overlay again
  layoutCols();
}
document.querySelectorAll('.split').forEach((h) => {
  const i = Number(h.dataset.i);   // between window i and i + 1
  h.addEventListener('pointerdown', (e) => {
    e.preventDefault(); window.getSelection()?.removeAllRanges();
    h.setPointerCapture(e.pointerId); h.classList.add('drag'); document.body.classList.add('resizing');
    const x0 = e.clientX, wl = isMin(i) ? 0 : WINS[i].getBoundingClientRect().width, wr = isMin(i + 1) ? 0 : WINS[i + 1].getBoundingClientRect().width;
    const move = (ev) => {
      const dx = ev.clientX - x0, L = wl + dx, R = wr - dx;
      // fold one dragged well below its smallest width; open one dragged back out
      if (L < WIN_MIN[i] - 90) setMin(i, true); else { setMin(i, false); if (i < 2) winWidths[i] = Math.max(WIN_MIN[i], L); }
      if (R < WIN_MIN[i + 1] - 90) setMin(i + 1, true); else { setMin(i + 1, false); if (i + 1 < 2) winWidths[i + 1] = Math.max(WIN_MIN[i + 1], R); }
      layoutCols();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); h.classList.remove('drag'); document.body.classList.remove('resizing'); };
    window.addEventListener('pointermove', move);   // on the window: the pointer may leave the narrow handle
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
  h.addEventListener('dblclick', () => { winWidths = [...WIN_USUAL]; [0, 1, 2].forEach((k) => setMin(k, false)); layoutCols(); });
});
WINS.forEach((win, i) => {
  const toggle = () => { setMin(i, !isMin(i)); layoutCols(); };
  win.querySelector('.mini').onclick = (e) => { e.stopPropagation(); toggle(); };
  win.querySelector('.winhead').addEventListener('click', () => { if (isMin(i)) toggle(); });
});
// opening the nucleus (its button, or tapping it in the tank) opens a folded Nucleus window
{
  const open = $('patchBtn').onclick;
  $('patchBtn').onclick = () => { if (!desk) { open(); return; } if (isMin(2)) { setMin(2, false); layoutCols(); } };
}
WIDE.addEventListener('change', placeLayout);
window.addEventListener('resize', layoutCols);
// the header's clock: the time, the selected cell's energy and depth
let topText = '';
function topClock() {
  const h = clock(world), hh = Math.floor(h), mm = Math.floor((h - hh) * 60), sunny = world.day ? daylight(world) > 0 : true;
  const t = `${sunny ? '☀' : '☾'} <b>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</b>`
    + (world.metab ? ` &nbsp; ⚡ <b>${(100 * cell.metab.E / cell.metab.C).toFixed(0)}%</b>` : '')
    + ` &nbsp; depth <b>${Math.round(TH - (cell.vis ? cell.vis.q : cell.q)[1])} µm</b>`;
  if (t !== topText) $('topClock').innerHTML = topText = t;
}
// the help line along the bottom: what the thing under the pointer does (its tooltip, in full)
document.addEventListener('pointerover', (e) => {
  if (!desk) return;
  const el = e.target.closest('[title]');
  if (!el || !el.title) return;
  let name = (el.classList.contains('split') ? 'Resize' : el.textContent || '').trim().replace(/\s+/g, ' ');
  if (name.length > 32) name = name.slice(0, 30) + '…';
  $('help').querySelector('b').textContent = name || 'Help';
  $('help').querySelector('span').textContent = el.title;
});

// The phone address, when the server shares the sandbox on the Wi-Fi (shown on the computer, not on the phone)
fetch('/lan').then((r) => r.json()).then((urls) => {
  if (!urls.length || urls.some((u) => u.startsWith(location.origin))) return;
  $('phone').innerHTML = `📱 On a phone: <a href="${urls[0]}">${urls[0].replace('http://', '')}</a>`;
  $('phone').hidden = false;
}).catch(() => {});

resize();
const asked = new URLSearchParams(location.search).get('preset');   // ?preset=Wave%20tail opens that design
load(preset(asked && PRESETS[asked] ? asked : 'Round cell'));   // an empty cell to build on (Claude's species is in the Add-cell menu)
placeLayout();   // after the first design: the docked patch view draws it
requestAnimationFrame(frame);
// ?design=TG1.… (the AI tournament's entry page, enter/): opens that design and keeps it in the saved designs
const linked = new URLSearchParams(location.search).get('design');
if (linked && linked.startsWith('TG1.')) unpackDesign(linked).then((got) => {
  const d = got.design || got, name = String(got.name || 'Linked design').trim().slice(0, 60);
  if (!d.body) throw new Error('not a design');
  writeSaved([...savedList().filter((x) => x.name !== name), { name, design: d, saved: Date.now() }]);
  showSaved();
  load(Object.assign(JSON.parse(JSON.stringify(d)), { species: name }));
  $('buildErr').textContent = `opened "${name}": it is in your saved designs (▶ to start)`;
}).catch(() => { $('buildErr').textContent = 'the design in this link is broken'; });

// Offline on the website: a service worker keeps a copy of the sandbox (not on the home server's plain http)
if (location.protocol === 'https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// On the website there is no computer to send to: the button sends the design through a GitHub issue instead
if (location.protocol === 'https:') $('sendDesign').title = 'Send this design to Claude: a GitHub page opens with it filled in; tap Create';
