// The sandbox viewer: plain shapes, trails and numbers over the same simulation the checks run.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';
import { PRESETS } from '../sim/presets.js';
import { updatePose, fire, motorAngle, toWorld as pieceToWorld } from '../sim/physics.js';
import { rewire, retrigger, controlsOf, buildCell } from '../sim/build.js';
import { lightAt, daylight, clock } from '../sim/light.js';
import { energyLevel } from '../sim/sense.js';
import { nutrientAt } from '../sim/nutrient.js';
import { PART_TEMPLATES, partGroups, surfacePoint, CATEGORIES, CONTROLS, CONTENT_TIPS, flipPart, mirrorGroup } from './parts.js';

const DT = PARAMS.time.dt, TW = PARAMS.tank.w, TH = PARAMS.tank.h;
const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');

const COLOR = {
  water: '#0b1322', outside: '#060a12', grid: '#132036', gridMajor: '#1f3352', label: '#4d6a86',
  trail: '#6fd3b5', protein: '#a8d8a0', glass: '#9fd8f0', oil: '#f2c94c', sap: '#5f8fd8',
  body: { protein: '#3f7d5c', glass: '#4f8fa0' }, outline: '#d8f0e0', motor: '#ff7a6b', hinge: '#ffb54a',
  extend: '#c9a0ff', stopped: '#5d6b74', coil: '#ffb54a', coilFiring: '#fff1a0', coilEmpty: '#6b5a40', kin: '#e070ff', mucus: '#f2e28a', link: '#e070ff', selected: '#ffffff',
  statolith: 'rgba(200,215,230,.35)', grain: '#e8eef5', gas: '#cfe9ff', crushed: '#6b7680', chem: '#c8b26a', timer: '120,210,255',
  plastid: '#8fc94a', starch: '#ece3c4', starving: '#ff5a4a', eyeDark: '#7a2a1c', eyeLit: '#ff8a3c', light: 'rgba(255,240,190,', touch: '#5fd0ff', near: 'rgba(95,208,255,',
};

let design, world, cell, playing = true, acc = 0, lagging = false;   // cell: the selected one (followed, measured)
let trail = [], samples = [], released = null;   // released: where and when latches were let go
let ghosts = [];                                  // outlines of cells as they were at Release
let cam = { x: TW / 2, y: TH / 2 };

// ----- loading and resetting -----
const addSelect = $('addWhat');
addSelect.add(new Option('copy of this design', ''));
for (const name of Object.keys(PRESETS)) addSelect.add(new Option(name, name));
// each preset is its own species, so kin pads only hold copies of the same design
const preset = (name) => Object.assign(JSON.parse(JSON.stringify(PRESETS[name])), { species: name });

function load(d) {
  design = d;
  $('json').value = JSON.stringify(d, null, 2);
  reset();
  listParts();
}

// Try a changed design; if it doesn't build, keep the old one and say why. The rebuilt cell stays where the selected
// one was, facing the same way. A change that builds can be undone (record = false when undoing or redoing).
function applyDesign(d, record = true) {
  const old = design, pose = cell ? { x: cell.q[0], y: cell.q[1], angle: cell.q[2] * 180 / Math.PI } : null;
  design = d;
  if (!reset(pose)) { const msg = $('err').textContent; design = old; reset(pose); $('err').textContent = msg; $('buildErr').textContent = msg; return false; }
  if (record) remember(old);
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
$('partAngle').oninput = showAngle; showAngle();
const showTilt = () => { $('partTiltOut').textContent = `${$('partTilt').value}°`; };
$('partTilt').oninput = showTilt; showTilt();
const showSize = () => {
  const what = (CONTROLS[$('partWhat').value] || {}).size;
  $('partSizeOut').textContent = what ? what(Number($('partSize').value) / 100) : '';
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
  $('lengthRow').style.display = c.length ? '' : 'none';
  const gas = c.strength || (c.content && $('partContent').value === 'gas');
  $('strengthRow').style.display = gas ? '' : 'none';
  $('contentRow').style.display = c.content ? '' : 'none';
  $('contentTip').style.display = c.content ? '' : 'none';
  $('contentTip').textContent = c.content ? CONTENT_TIPS[$('partContent').value] : '';
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
function showLength() { $('partLengthOut').textContent = `${$('partLength').value} µm`; }
$('partLength').oninput = showLength;
// gas vesicles: how deep they are crushed (the same rule as sim/build.js)
function showStrength() {
  const s = Number($('partStrength').value) / 100, G = PARAMS.gas;
  $('partStrengthOut').textContent = `crushed below ${Math.round(TH * (G.shallowest + (1 - G.shallowest) * s))} µm`;
}
$('partStrength').oninput = showStrength;
$('partWhat').onchange = () => { showControls(); if (editing) updateEdited(); else updatePreview(); }; showControls();
$('flipBtn').onclick = () => { $('partFlip').checked = !$('partFlip').checked; $('partFlip').dispatchEvent(new Event('change')); };
// Make a part from the Build controls; its first piece remembers how (build), so it can be edited later
function makePart(body, id) {
  const c = CONTROLS[$('partWhat').value] || {};
  const b = { tpl: $('partWhat').value, where: Number($('partAngle').value), tilt: Number($('partTilt').value),
    size: Number($('partSize').value) / 100, depth: Number($('partInside').value) / 100, feels: $('partFeels').value,
    flip: !!c.flip && $('partFlip').checked, id };
  if (c.length) b.length = Number($('partLength').value);
  if (c.content) b.content = $('partContent').value;
  if (c.strength || b.content === 'gas') b.strength = Number($('partStrength').value) / 100;
  const parts = PART_TEMPLATES[b.tpl](body, b.where, id, b.size, b.tilt, b.depth, b.feels, b.length, b.strength, b.content);
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
    if (m.trigger && fresh[i] && fresh[i].kind === 'timer') fresh[i].trigger = m.trigger;   // a timer keeps its trigger
  });
  const at = d.parts.indexOf(g.members[0]);
  d.parts = d.parts.filter((p) => !g.members.includes(p));
  d.parts.splice(at, 0, ...fresh);
  return d;
}
$('addPart').onclick = () => {
  if (editing) { stopEditing(); return; }
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
  if (b.content) $('partContent').value = b.content;
  $('partWhat').value = b.tpl; showControls();
  $('partAngle').value = b.where; $('partTilt').value = b.tilt;
  $('partSize').value = Math.round(b.size * 100); $('partInside').value = Math.round(b.depth * 100);
  if (b.feels) $('partFeels').value = b.feels;
  $('partFlip').checked = !!b.flip;
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
for (const id of ['partAngle', 'partTilt', 'partSize', 'partInside', 'partLength', 'partStrength', 'partFeels', 'partFlip']) $(id).onchange = () => { if (editing) updateEdited(); else updatePreview(); };
$('partContent').onchange = () => { showControls(); previewOn = true; if (editing) updateEdited(); else updatePreview(); };
// while dragging, the ghost follows the slider
for (const id of ['partAngle', 'partTilt', 'partSize', 'partInside', 'partLength', 'partStrength']) $(id).addEventListener('input', () => { previewOn = true; updatePreview(); });

// ----- the ghost: the part as it would be added (or the edited part as it would become), drawn see-through on the
// selected cell before anything is built; red when it would not fit. Nothing is simulated. -----
let previewOn = false;   // armed by picking a part or moving a slider; off after Add or tapping the lit part again
let preview = null;      // { cell: the body with only the new part, built and posed; bad: why it would not fit, or '' }
function updatePreview() {
  preview = null;
  if (!previewOn || !design) { $('buildErr').textContent = ''; return; }
  const id = editing || 'ghost';
  let bad = '';
  try { const d = withPart(JSON.parse(JSON.stringify(design)), makePart(design.body, id)); if (d) buildCell(d); }
  catch (e) { bad = e.message; }
  $('buildErr').textContent = bad ? `won't fit: ${bad}` : '';
  let c;
  try { c = buildCell({ body: design.body, parts: makePart(design.body, id) }); } catch (e) { return; }
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
    ctx.beginPath(); ctx.arc(X(ix), Y(iy), Math.max(inc.r * s, 2), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const d of [...c.sensors, ...c.pads]) {
    const [px, py] = pieceToWorld(c, d.piece, d.x, d.y);
    ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max(1.2 * s, 3), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
// ----- wiring: which sensors drive a part. A rule is a list of conditions (a sensor and a range of its reading, or
// outside it) in groups: AND inside a group, OR between groups. A target is what one rule drives: every motor of a tail,
// a burst organ, an ejectisome, or a timer (its trigger). Rewiring changes the design and the cells already in the tank
// as they are: no reset. -----
const RANGE = { light: [0.5, 1], touch: [0.5, 1], near: [0.3, 1], energy: [0.3, 1], statolith: [0.6, 1], chem: [0.5, 1], timer: [0, 0.5] };   // a sensible start
const SCALE = {   // what the 0-1 reading means
  light: '0 = dark or facing away, 1 = facing up in full light',
  touch: '0 = nothing, 1 = touching',
  near: '0 = nothing in range, 1 = touching',
  energy: '0 = out of energy (starving), 1 = full',
  statolith: '0 = its direction points down, 0.5 = level, 1 = up',
  chem: '0 = poor water (near the surface), 1 = rich (deep)',
  timer: '0 = it just started, 1 = its time is up (or it never started)',
};
const ENDS = { light: ['dark', 'bright'], touch: ['nothing', 'touching'], near: ['nothing near', 'touching'], energy: ['starving', 'full'],
  statolith: ['points down', 'points up'], chem: ['poor water', 'rich water'], timer: ['just started', 'time up'] };
const ICON = { light: '👁', touch: '✋', near: '📡', energy: '⚡', statolith: '⚖', chem: '🧪', timer: '⏱' };
// what a sensor id is: 'energy' (built in), or the kind of the design part with that id
function sensorKind(id) {
  if (id === 'energy') return 'energy';
  const p = (design.parts || []).find((x) => x.id === id) || {};
  return p.material === 'statolith' ? 'statolith' : p.kind || 'light';
}
// the sensors a rule can read: every sensor part (but `except`), then the energy level
function sensorList(except) {
  const list = [];
  for (const x of partGroups(design.parts || []).filter((g) => g.category === 'Sensors' && g.members[0].id !== except)) {
    const id = x.members[0].id;
    list.push({ id, name: `${x.name.toLowerCase()} at ${x.deg}°`, short: x.name, deg: x.deg, kind: sensorKind(id) });
  }
  list.push({ id: 'energy', name: 'its energy level (built in)', short: 'Energy level', kind: 'energy' });
  return list;
}
const isTimer = (m) => m.type === 'sensor' && m.kind === 'timer';
const targetsOf = (g) => g.members.filter((m) => isTimer(m) || (m.joint && (m.joint.type === 'motor' || m.joint.latched)));
// how a target acts: 'runs' (a motor), 'fires' (a burst organ, a latched part), 'starts' (a timer)
const verbOf = (m) => (isTimer(m) ? 'starts' : m.joint.type === 'motor' && !m.joint.burst ? 'runs' : 'fires');
function rulesOf(m) {
  const raw = isTimer(m) ? (m.trigger || []) : controlsOf(m.joint);
  return raw.map((c, i) => ({ sensor: c.sensor, min: c.when === 'light' ? 0.5 : c.min ?? 0, max: c.when === 'dark' ? 0.5 : c.max ?? 1,
    ...(c.vs !== undefined ? { vs: c.vs } : {}), not: !!c.not, or: i > 0 && !!c.or }));
}
function setRules(targets, next) {
  if (next.some((c) => c.vs === undefined && !(c.min <= c.max))) { $('buildErr').textContent = 'a range must run from low to high'; return; }
  $('buildErr').textContent = '';
  remember(design);
  // only true marks are stored, and the first condition never starts a new group
  const clean = next.map((c, i) => ({ sensor: c.sensor, ...(c.vs !== undefined ? { vs: c.vs } : { min: c.min, max: c.max }),
    ...(c.not ? { not: true } : {}), ...(i > 0 && c.or ? { or: true } : {}) }));
  for (const m of targets) {
    const k = design.parts.indexOf(m);
    if (isTimer(m)) {
      if (clean.length) m.trigger = clean.map((c) => ({ ...c })); else delete m.trigger;
      for (const c of world.cells) if (c.design === design) retrigger(c, k, clean);
    } else {
      delete m.joint.control;
      if (clean.length) m.joint.controls = clean.map((c) => ({ ...c })); else delete m.joint.controls;
      for (const c of world.cells) if (c.design === design) rewire(c, k, clean);
    }
  }
  $('json').value = JSON.stringify(design, null, 2);
  listParts();
}
const freshRule = (id, or = false) => ({ sensor: id, min: RANGE[sensorKind(id)][0], max: RANGE[sensorKind(id)][1], not: false, or });
// without condition idx: the next condition takes over the start of a group this one began
function withoutRule(list, idx) {
  const next = list.map((x) => ({ ...x }));
  if (next[idx].or && next[idx + 1] && !next[idx + 1].or) next[idx + 1].or = true;
  return next.filter((_, i) => i !== idx);
}
const NONE = { runs: 'runs always', fires: 'fires by hand (Release)', starts: 'never starts: give it a trigger' };
const ADD = { runs: '＋ wire it to a sensor', fires: '＋ fire it by a sensor', starts: '＋ start it by a sensor' };
const WHILE = { runs: 'on while', fires: 'fires while', starts: 'starts when' };

// A living cell's reading of a sensor ('energy' or an id), as { value }; undefined if there is none
function liveReading(c, id) {
  return id === 'energy' ? { value: energyLevel(world, c) } : c.sensors.find((x) => x.id === id);
}
// A condition's two ways: a range of one reading, or a compare (one reading more than another's)
const MODE = { range: 'in range', vs: 'more than…' };
// the line under a compare condition: both readings now
function compareLine(c, sensors) {
  const name = (id) => { const x = sensors.find((s) => s.id === id); return x ? `${ICON[x.kind]} ${x.name}` : id; };
  const line = document.createElement('div');
  line.className = 'rlabel';
  line.innerHTML = `holds while ${name(c.sensor)} ${c.not ? 'is not' : 'is'} more than ${name(c.vs)} · now <b data-live="${c.sensor}">–</b> vs <b data-live="${c.vs}">–</b>`;
  return line;
}

// The compact list under a part: its rule as sentences, one condition each
function wiring(g, targets) {
  const box = document.createElement('div');
  box.className = 'wire';
  const verb = verbOf(targets[0]);
  const sensors = sensorList(isTimer(targets[0]) ? targets[0].id : undefined);
  const list = rulesOf(targets[0]);
  const write = (next) => setRules(targets, next);
  const copy = () => list.map((x) => ({ ...x }));
  const groups = list.length ? 1 + list.filter((c) => c.or).length : 0;
  const head = document.createElement('div');
  head.textContent = !list.length ? NONE[verb] : groups > 1 ? `${verb} when all of one group hold:`
    : list.length > 1 ? `${verb} when all of these hold:` : `${verb} when:`;
  box.appendChild(head);
  list.forEach((c, idx) => {
    if (c.or) {
      const line = document.createElement('div');
      line.className = 'orline'; line.textContent = '— or —';
      box.appendChild(line);
    }
    const cond = document.createElement('div');
    cond.className = 'cond';
    const top = document.createElement('div');
    top.className = 'condhead';
    const sel = document.createElement('select');
    for (const s of sensors) sel.add(new Option(`${ICON[s.kind]} ${s.name}`, s.id));
    sel.value = c.sensor;
    sel.onchange = () => {
      const next = copy();
      next[idx] = c.vs !== undefined && sel.value !== c.vs ? { ...c, sensor: sel.value } : { ...freshRule(sel.value, c.or), not: c.not };
      write(next);
    };
    const not = document.createElement('button');
    not.className = 'notbtn'; not.textContent = c.not ? 'is not' : 'is';
    not.title = c.not ? 'Holds while the reading is OUTSIDE the range (tap: inside)' : 'Holds while the reading is inside the range (tap: outside)';
    not.onclick = () => { const next = copy(); next[idx].not = !c.not; write(next); };
    const del = document.createElement('button');
    del.textContent = '✕'; del.title = 'Remove this condition';
    del.onclick = () => write(withoutRule(list, idx));
    const mode = document.createElement('button');
    mode.className = 'notbtn'; mode.textContent = c.vs !== undefined ? MODE.vs : MODE.range;
    mode.title = 'In range: the reading is inside a range. More than: it reads more than another sensor (tap to switch)';
    mode.onclick = () => {
      const next = copy();
      if (c.vs !== undefined) next[idx] = { ...freshRule(c.sensor, c.or), not: c.not };
      else next[idx] = { sensor: c.sensor, vs: (sensors.find((s) => s.id !== c.sensor) || sensors[0]).id, not: c.not, or: c.or };
      write(next);
    };
    top.append(sel, not, mode, del);
    cond.appendChild(top);
    if (c.vs !== undefined) {   // the sensor it is compared with
      const vs = document.createElement('select');
      for (const s of sensors) if (s.id !== c.sensor) vs.add(new Option(`than ${ICON[s.kind]} ${s.name}`, s.id));
      vs.value = c.vs;
      vs.onchange = () => { const next = copy(); next[idx].vs = vs.value; write(next); };
      const row2 = document.createElement('div'); row2.className = 'condhead'; row2.appendChild(vs);
      cond.append(row2, compareLine(c, sensors));
    } else cond.appendChild(rangeBar(c, verb, sensorKind(c.sensor), (lo, hi) => {
      const next = copy(); next[idx].min = lo; next[idx].max = hi; write(next);
    }));
    box.appendChild(cond);
  });
  const first = sensors[0].id;
  const add = document.createElement('button');
  add.className = 'addcond';
  add.textContent = list.length ? '＋ and also…' : ADD[verb];
  add.title = list.length ? 'Another condition in the last group: all of them must hold' : '';
  add.onclick = () => write([...list, freshRule(first)]);
  box.appendChild(add);
  if (list.length) {
    const or = document.createElement('button');
    or.className = 'addcond';
    or.textContent = '＋ or instead…';
    or.title = `A new group: it ${verb} when either group holds`;
    or.onclick = () => write([...list, freshRule(first, true)]);
    box.appendChild(or);
  }
  return box;
}

// ----- the patch view: wiring as a modular synth. Sensors (with their live reading) sit on the left, parts on the right;
// between them, each part's rule as boxes: a box is a group of conditions that must all hold (AND), and a part with
// several boxes goes when any one does (OR). A cable from a sensor into a box is one condition; its chip shows the
// range, and tapping it edits it. Patching is tap, tap: a sensor, then a box (another condition in that group) or a part
// (a new group). The same rules as the list in the panel, drawn differently. -----
let patchOpen = false;
let patchPick = null;   // the sensor id picked, waiting for where to patch it
let patchEdit = null;   // { t: target index, k: condition index } being edited
let patchTargets = [];  // [{ name, members, verb, rules }] as drawn
const PATCH_HINT = 'tap a sensor, then a box or a part · tap a cable’s label to edit it';
$('patchBtn').onclick = () => { patchOpen = true; $('patch').hidden = false; patchPick = null; patchEdit = null; drawPatch(); };
$('patchClose').onclick = () => { patchOpen = false; $('patch').hidden = true; };
// split a rule into its groups, keeping each condition's index in the rule
function groupsOf(rules) {
  const gs = [];
  rules.forEach((c, k) => { if (!gs.length || c.or) gs.push([]); gs[gs.length - 1].push(k); });
  return gs;
}
const rangeText = (c) => `${c.not ? 'not ' : ''}${c.min.toFixed(2).replace(/0$/, '')}–${c.max.toFixed(2).replace(/0$/, '')}`;
function drawPatch() {
  if (!patchOpen) return;
  const cols = $('patchCols');
  cols.innerHTML = '';
  $('patchHint').textContent = patchPick ? `now tap a box or a part to patch ${ICON[sensorKind(patchPick)]} into` : PATCH_HINT;
  // sources
  const src = document.createElement('div'); src.className = 'pcol src';
  for (const s of sensorList()) {
    const jack = document.createElement('div');
    jack.className = 'srcmod pjack' + (patchPick === s.id ? ' picked' : ''); jack.dataset.src = s.id;
    jack.title = SCALE[s.kind];
    jack.innerHTML = `<div class="pname">${ICON[s.kind]} ${s.short}${s.deg !== undefined ? ` <span class="pval">${s.deg}°</span>` : ''}</div><div class="pval">reads <b data-live="${s.id}">–</b></div>
      <div class="pbar"><i data-patchbar="${s.id}"></i></div>`;
    jack.onclick = (e) => { e.stopPropagation(); patchPick = patchPick === s.id ? null : s.id; patchEdit = null; drawPatch(); };
    const m = document.createElement('div');
    m.className = 'pmod';
    m.appendChild(jack);
    src.appendChild(m);
  }
  // targets, each with its boxes
  const rules = document.createElement('div'); rules.className = 'prules';
  patchTargets = partGroups(design.parts || []).map((g) => ({ g, members: targetsOf(g) })).filter((t) => t.members.length)
    .map((t) => ({ name: `${t.g.name} at ${t.g.deg}°`, members: t.members, verb: verbOf(t.members[0]), rules: rulesOf(t.members[0]),
      icon: isTimer(t.members[0]) ? ICON.timer : '' }));
  if (!patchTargets.length) rules.innerHTML = '<div class="pval">No parts to wire yet: add a flagellum, a burst organ, an ejectisome or a timer.</div>';
  patchTargets.forEach((t, ti) => {
    const row = document.createElement('div'); row.className = 'prow';
    const boxes = document.createElement('div'); boxes.className = 'pboxes';
    const gs = groupsOf(t.rules);
    gs.forEach((ks, gi) => {
      const b = document.createElement('div');
      b.className = 'pmod box'; b.dataset.box = `${ti}:${gi}`;
      b.textContent = ks.length > 1 ? 'all of' : 'when';
      b.onclick = (e) => { e.stopPropagation(); patchInto(ti, gi); };
      boxes.appendChild(b);
    });
    const add = document.createElement('div');
    add.className = 'pmod box add'; add.dataset.box = `${ti}:new`;
    add.textContent = gs.length ? '＋ or' : '＋ when';
    add.title = gs.length ? 'A new group: the part also goes when this holds' : 'Tap a sensor, then here';
    add.onclick = (e) => { e.stopPropagation(); patchInto(ti, gs.length); };
    boxes.appendChild(add);
    const tg = document.createElement('div');
    tg.className = 'pmod tgt'; tg.dataset.tgt = ti;
    tg.innerHTML = `<span class="pstate" data-pstate="${ti}"></span><div class="pname">${t.icon} ${t.name}</div>
      <div class="pval">${!t.rules.length ? NONE[t.verb] : `${t.verb}${gs.length > 1 ? ' when any box holds' : ''}`}</div>`;
    tg.onclick = (e) => { e.stopPropagation(); patchInto(ti, gs.length); };
    row.append(boxes, tg);
    rules.appendChild(row);
  });
  cols.append(src, rules);
  layoutWires();
  showPatchEdit();
}
// patch the picked sensor into target ti's group gi (gi past the last: a new group)
function patchInto(ti, gi) {
  const t = patchTargets[ti];
  if (!patchPick) { $('patchHint').textContent = 'first tap a sensor on the left'; return; }
  if (isTimer(t.members[0]) && patchPick === t.members[0].id) { $('patchHint').textContent = 'a timer can’t start itself'; return; }
  const gs = groupsOf(t.rules), next = t.rules.map((c) => ({ ...c }));
  const fresh = freshRule(patchPick, gs.length > 0 && gi >= gs.length);
  let at = next.length;
  if (gi < gs.length) at = gs[gi][gs[gi].length - 1] + 1;   // at the end of that group
  next.splice(at, 0, fresh);
  patchPick = null;
  patchEdit = { t: ti, k: at };
  setRules(t.members, next);
}
// the cables, their chips, and each box's line to its part, drawn over the laid-out modules
function layoutWires() {
  const area = $('patchArea'), svg = $('patchWires');
  for (const el of area.querySelectorAll('.pchip')) el.remove();
  svg.innerHTML = '';
  const base = area.getBoundingClientRect();
  const at = (el, side) => { const r = el.getBoundingClientRect(); return [(side ? r.right : r.left) - base.left, r.top + r.height / 2 - base.top]; };
  const path = (a, b, key) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx = Math.max(30, (b[0] - a[0]) / 2);
    p.setAttribute('d', `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`);
    p.dataset.key = key;
    svg.appendChild(p);
  };
  patchTargets.forEach((t, ti) => {
    const tg = area.querySelector(`[data-tgt="${ti}"]`);
    groupsOf(t.rules).forEach((ks, gi) => {
      const box = area.querySelector(`[data-box="${ti}:${gi}"]`);
      path(at(box, true), at(tg, false), `b${ti}:${gi}`);
      ks.forEach((k) => {
        const c = t.rules[k], s = area.querySelector(`[data-src="${c.sensor}"]`);
        if (!s) return;
        const a = at(s, true), b = at(box, false);
        path(a, b, `c${ti}:${k}`);
        const other = c.vs !== undefined && area.querySelector(`[data-src="${c.vs}"]`);
        if (other) path(at(other, true), b, `v${ti}:${k}`);   // the second sensor of a compare
        const chip = document.createElement('div');
        chip.className = 'pchip' + (patchEdit && patchEdit.t === ti && patchEdit.k === k ? ' on' : '');
        chip.dataset.chip = `${ti}:${k}`;
        const vsName = c.vs !== undefined && (sensorList().find((x) => x.id === c.vs) || {}).short;
        const vsDeg = c.vs !== undefined && (sensorList().find((x) => x.id === c.vs) || {}).deg;
        chip.textContent = c.vs !== undefined ? `${c.not ? 'not ' : ''}> ${ICON[sensorKind(c.vs)]}${vsDeg !== undefined ? ` ${vsDeg}°` : ''}` : rangeText(c);
        chip.title = c.vs !== undefined ? `${t.name}: ${WHILE[t.verb]} it reads ${c.not ? 'no ' : ''}more than ${vsName}`
          : `${t.name}: ${WHILE[t.verb]} it reads ${c.not ? 'outside ' : ''}${c.min}–${c.max}`;
        chip.style.left = `${a[0] + (b[0] - a[0]) * 0.55}px`; chip.dataset.y = a[1] + (b[1] - a[1]) * 0.55;
        chip.onclick = (e) => { e.stopPropagation(); patchEdit = { t: ti, k }; patchPick = null; drawPatch(); };
        area.appendChild(chip);
      });
    });
  });
  // labels meet where cables converge: keep them at least a label's height apart, in cable order
  const chips = [...area.querySelectorAll('.pchip')].sort((p, q) => p.dataset.y - q.dataset.y);
  let last = -Infinity;
  for (const c of chips) { const y = Math.max(Number(c.dataset.y), last + 18); c.style.top = `${y}px`; last = y; }
  svg.setAttribute('height', area.scrollHeight);
}
// the editor under the patch: one condition's range, is / is not, remove
function showPatchEdit() {
  const box = $('patchEdit');
  const t = patchEdit && patchTargets[patchEdit.t], c = t && t.rules[patchEdit.k];
  if (!c) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false; box.innerHTML = '';
  const kind = sensorKind(c.sensor), src = sensorList().find((s) => s.id === c.sensor);
  const head = document.createElement('div');
  head.innerHTML = `<b>${ICON[kind]} ${src ? src.name : c.sensor}</b> → <b>${t.icon} ${t.name}</b>`;
  const write = (change) => { const next = t.rules.map((x) => ({ ...x })); Object.assign(next[patchEdit.k], change); setRules(t.members, next); };
  const row = document.createElement('div'); row.className = 'row';
  const not = document.createElement('button');
  not.className = 'notbtn'; not.textContent = c.not ? 'is not' : 'is';
  not.title = 'Holds while the reading is inside the range (is) or outside it (is not)';
  not.onclick = () => write({ not: !c.not });
  const del = document.createElement('button');
  del.textContent = '✕ unplug';
  del.onclick = () => { const k = patchEdit.k; patchEdit = null; setRules(t.members, withoutRule(t.rules, k)); };
  const done = document.createElement('button');
  done.textContent = 'Done';
  done.onclick = () => { patchEdit = null; drawPatch(); };
  const sensors = sensorList(isTimer(t.members[0]) ? t.members[0].id : undefined);
  const mode = document.createElement('button');
  mode.className = 'notbtn'; mode.textContent = c.vs !== undefined ? MODE.vs : MODE.range;
  mode.title = 'In range: the reading is inside a range. More than: it reads more than another sensor (tap to switch)';
  mode.onclick = () => {
    if (c.vs !== undefined) write({ vs: undefined, ...freshRule(c.sensor) , or: c.or, not: c.not });
    else write({ vs: (sensors.find((s) => s.id !== c.sensor) || sensors[0]).id });
  };
  row.append(not, mode, del, done);
  if (c.vs !== undefined) {
    const vs = document.createElement('select');
    for (const s of sensors) if (s.id !== c.sensor) vs.add(new Option(`than ${ICON[s.kind]} ${s.name}`, s.id));
    vs.value = c.vs;
    vs.onchange = () => write({ vs: vs.value });
    box.append(head, vs, compareLine(c, sensors), row);
  } else box.append(head, rangeBar(c, t.verb, kind, (lo, hi) => write({ min: lo, max: hi })), row);
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
      if (isTimer(t.members[0])) {
        const s = live.sensors.find((x) => x.part === k0);
        if (s) { ctls = s.trigger; on = s.start !== null && s.value < 1; state = s.start === null ? 'waiting' : s.value < 1 ? 'counting' : 'time up'; }
      } else {
        const j = live.joints.find((x) => x.part === k0);
        if (j) {
          ctls = j.controls || null;
          if (j.burst) { on = j.burst.state === 'firing'; state = j.burst.state; }
          else if (j.type === 'motor') { on = j.on && !(world.metab && live.metab.starving); state = on ? 'ON' : 'OFF'; }
          else { on = !j.latched; state = j.latched ? 'cocked' : 'released'; }
        }
      }
    }
    const st = area.querySelector(`[data-pstate="${ti}"]`);
    if (st) st.textContent = state;
    const tg = area.querySelector(`[data-tgt="${ti}"]`);
    if (tg) tg.classList.toggle('lit', on);
    groupsOf(t.rules).forEach((ks, gi) => {
      let all = !!ctls;
      for (const k of ks) {
        const ctl = ctls && ctls[k], ok = !!ctl && ctl.holds !== null && ctl.holds !== ctl.not;
        if (!ok) all = false;
        const p = area.querySelector(`path[data-key="c${ti}:${k}"]`); if (p) p.classList.toggle('lit', ok);
        const v = area.querySelector(`path[data-key="v${ti}:${k}"]`); if (v) v.classList.toggle('lit', ok);
        const ch = area.querySelector(`[data-chip="${ti}:${k}"]`); if (ch) ch.classList.toggle('lit', ok);
      }
      const b = area.querySelector(`[data-box="${ti}:${gi}"]`); if (b) b.classList.toggle('lit', all);
      const p = area.querySelector(`path[data-key="b${ti}:${gi}"]`); if (p) p.classList.toggle('lit', all);
    });
  });
}

// One condition's range: a bar with two handles, its ends named; the part goes while the reading is inside the lit
// stretch (or outside it); the orange tick is the reading now
function rangeBar(c, verb, kind, onSet) {
  {
    const lo = c.min, hi = c.max;
    const span = document.createElement('div');
    span.className = 'range';
    span.title = SCALE[kind];
    span.innerHTML = `<div class="rlabel">${WHILE[verb]} it reads ${c.not ? 'outside ' : ''}<b class="lohi"></b> · now <b data-live="${c.sensor}">–</b></div>
      <div class="dual"><div class="track${c.not ? ' out' : ''}"><div class="band"></div>${kind === 'light' ? '<div class="most"></div>' : ''}<div class="now" data-livebar="${c.sensor}"></div></div>
        <input type="range" min="0" max="1" step="0.05" value="${lo}"><input type="range" min="0" max="1" step="0.05" value="${hi}"></div>
      <div class="rends"><span>${ENDS[kind][0]}</span><span>${ENDS[kind][1]}</span></div>
      ${kind === 'light' ? `<div class="rscale"><span data-livemax="${c.sensor}"></span></div>` : ''}`;
    const [a, b] = span.querySelectorAll('input');
    const band = span.querySelector('.band'), lohi = span.querySelector('.lohi');
    const show = () => {
      const x = Number(a.value), y = Number(b.value);
      band.style.left = `${x * 100}%`; band.style.width = `${(y - x) * 100}%`;
      lohi.textContent = `${x.toFixed(2)} to ${y.toFixed(2)}`;
    };
    a.oninput = () => { if (Number(a.value) > Number(b.value)) a.value = b.value; show(); };
    b.oninput = () => { if (Number(b.value) < Number(a.value)) b.value = a.value; show(); };
    a.onchange = b.onchange = () => onSet(Number(a.value), Number(b.value));
    show();
    return span;
  }
}

function listParts() {
  showBody();
  const box = $('partList');
  box.innerHTML = '';
  const groups = partGroups(design.parts || []);
  for (const cat of Object.keys(CATEGORIES)) groups.filter((g) => g.category === cat).forEach((g, i) => {
    if (i === 0) { const head = document.createElement('div'); head.className = 'cat'; head.textContent = cat; box.appendChild(head); }
    const row = document.createElement('div');
    row.className = 'part';
    const b = g.members[0].build;
    row.innerHTML = `<span>${g.name} at ${g.deg}°${b && b.flip ? ' (flipped)' : ''}${g.more ? ` (+${g.more} pieces)` : ''}</span>
      <span>${b ? '<button class="edit">Edit</button> ' : ''}<button class="mirror" data-axis="90" title="Add a mirror copy on the other side: left ↔ right">⇆</button>
        <button class="mirror" data-axis="0" title="Add a mirror copy on the other side: top ↔ bottom">⇅</button>
        <button class="remove">Remove</button></span>`;
    if (b && b.id === editing) row.classList.add('editing');
    if (b) row.querySelector('.edit').onclick = () => (editing === b.id ? stopEditing() : startEditing(b));
    for (const m of row.querySelectorAll('.mirror')) m.onclick = () => {
      const d = JSON.parse(JSON.stringify(design));
      const k = design.parts.indexOf(g.members[g.members.length - 1]);
      d.parts.splice(k + 1, 0, ...mirrorGroup(g.members, Number(m.dataset.axis), `p${Date.now() % 100000}_${++partCount}`));
      applyDesign(d);
    };
    const targets = targetsOf(g);
    if (targets.length) row.appendChild(wiring(g, targets));
    row.querySelector('.remove').onclick = () => {
      if (b && b.id === editing) { editing = null; previewOn = false; $('addPart').textContent = '＋ Add to body'; $('cancelEdit').hidden = true; }
      const d = JSON.parse(JSON.stringify(design));
      const gone = new Set(g.members.map((m) => design.parts.indexOf(m)));
      d.parts = d.parts.filter((_, i) => !gone.has(i));
      applyDesign(d);
    };
    box.appendChild(row);
  });
  if (!box.children.length) box.textContent = 'No parts yet: just a body.';
  drawPatch();   // the patch view follows every change (when open)
}

function reset(pose) {
  $('err').textContent = '';
  const s = (pose && pose.x !== undefined ? pose : null) || design.start || {};
  const w = makeWorld(1, { gravity: $('gravity').checked, light: $('light').checked, day: $('day').checked, metab: true });
  try {
    cell = addCell(w, design, s.x ?? TW / 2, s.y ?? TH * 0.6, s.angle ?? 0);
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
  const d = addSelect.value ? preset(addSelect.value) : design;
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
    for (const c of world.cells) remember1(c);
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
  if (world) { draw(); if (!$('stats').hidden) stats(); liveReadings(); patchLive(); syncButtons(); $('stats').style.top = `${$('bar').offsetHeight + 14}px`; }
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
  const NAME = { light: 'eyespot', touch: 'touch', near: 'proximity', hunger: 'hunger', statolith: 'statolith', chem: 'nutrients', timer: 'timer' };
  cell.sensors.forEach((sn, i) => lines.push(`${NAME[sn.kind].padEnd(9)} ${sn.value.toFixed(2)}`));
  const bursts = cell.joints.filter((j) => j.burst);
  if (bursts.length) {
    const b = bursts[0].burst;
    lines.push(`burst     ${b.state === 'charged' ? 'charged' : b.state === 'firing' ? 'FIRING' : `recharging, ${(b.recharge - b.t).toFixed(1)} s left`}`);
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
  lines.push(`spent on  body upkeep ${show(m.bodyUpkeep)}`);
  for (const g of partGroups(cell.design.parts || [])) {
    let v = 0;
    for (const mm of g.members) v += m.byPart.get(cell.design.parts.indexOf(mm)) || 0;
    if (v > 0) lines.push(`          ${g.name} upkeep ${show(v)}`);
  }
  if (m.motors > 0) lines.push(`          motors running ${show(m.motors)}`);
  if (m.pumps > 0) lines.push(`          pumping ${show(m.pumps)}`);
  if (m.gasBuild > 0) lines.push(`          rebuilding gas vesicles ${show(m.gasBuild)}`);
  const net = m.income - m.upkeep - m.motors - m.pumps - m.gasBuild;
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
    el.textContent = sn ? sn.value.toFixed(2) : '–';
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
  for (const c of world.cells) drawCell(calmPose(c, lastReal, spd) || c, X, Y, s, c);
  drawPreview(X, Y, s);
  drawLinks(X, Y, s);
  drawScale(W, H, s);
  drawMinimap(W, H);
  drawHud(W, H);
}

// Always on the tank (phones too): the time, the energy pool, the stores
function drawHud(W, H) {
  const m = cell.metab, h = clock(world), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const sunny = world.day ? daylight(world) > 0 : true;
  let text = `${sunny ? '☀' : '☾'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  if (world.metab) {
    text += `   ⚡ ${(100 * m.E / m.C).toFixed(0)}%`;
    for (const inc of cell.pieces[0].inclusions) if (inc.store) text += `   ${inc.store} ${(100 * inc.fill).toFixed(0)}%`;
  }
  ctx.font = '12px system-ui';
  const tw = ctx.measureText(text).width + (m.starving ? 90 : 0);
  ctx.fillStyle = 'rgba(8,14,26,.8)'; ctx.fillRect(10, H - 62, tw + 14, 22);
  ctx.fillStyle = COLOR.outline; ctx.fillText(text, 17, H - 46);
  if (world.metab && m.starving) { ctx.fillStyle = COLOR.starving; ctx.fillText('STARVING', 17 + tw - 82, H - 46); }
}

// A store (starch, oil): its outline, and liquid filling it from the bottom as far as it is full
function drawLevel(ix, iy, inc, X, Y, s) {
  const R = Math.max(inc.r * s, 1.5), cx = X(ix), cy = Y(iy);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8,14,26,.35)'; ctx.fill();
  ctx.clip();
  const h = 2 * R * inc.fill;   // the level, from the lowest point up (screen y grows downward)
  ctx.fillStyle = COLOR[inc.material];
  ctx.fillRect(cx - R, cy + R - h, 2 * R, h);
  ctx.restore();
  ctx.strokeStyle = COLOR[inc.material]; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
}
// A sap vacuole's colour: pale while lighter than seawater, deep blue while heavier
function sapColor(inc) {
  const t = Math.min(Math.max((inc.density - inc.min) / (inc.max - inc.min), 0), 1);
  const mix = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${mix(170, 40)},${mix(215, 80)},${mix(255, 170)})`;
}
// Gas vesicles: a cluster of small bubbles, fewer as they wear out; crushed, flat grey dashes
function drawGas(ix, iy, inc, X, Y, s) {
  const n = inc.crushed ? 7 : Math.ceil(7 * inc.fill), b = inc.r * 0.32;
  ctx.strokeStyle = 'rgba(207,233,255,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(X(ix), Y(iy), Math.max(inc.r * s, 1.5), 0, Math.PI * 2); ctx.stroke();
  for (let k = 0; k < n; k++) {
    const a = k * 2.4, d = k ? inc.r * 0.62 * Math.sqrt(k / n) : 0;   // a sunflower spiral: evenly packed
    const bx = ix + Math.cos(a) * d, by = iy + Math.sin(a) * d;
    if (inc.crushed) {
      ctx.strokeStyle = COLOR.crushed; ctx.lineWidth = Math.max(0.3 * s, 1);
      ctx.beginPath(); ctx.moveTo(X(bx - b), Y(by)); ctx.lineTo(X(bx + b), Y(by)); ctx.stroke();
    } else {
      ctx.fillStyle = COLOR.gas; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(X(bx), Y(by), Math.max(b * s, 1), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}

function drawCell(c, X, Y, s, real = c) {   // c: posed for drawing; real: the cell itself
  ctx.lineCap = 'round';
  // segments first, body over them, then inclusions and joints
  const order = c.pieces.map((p, i) => i).sort((a, b) => (c.pieces[a].kind === 'body') - (c.pieces[b].kind === 'body'));
  for (const i of order) {
    const p = c.pieces[i], h = p.L / 2;
    const ax = c.cx[i] - c.cs[i] * h, ay = c.cy[i] - c.sn[i] * h, bx = c.cx[i] + c.cs[i] * h, by = c.cy[i] + c.sn[i] * h;
    const fill = p.kind === 'body' ? COLOR.body[p.material] : COLOR[p.material];
    const w = Math.max(2 * p.a * s, 1.5);
    if (p.kind === 'body') {   // outline (red while starving)
      ctx.strokeStyle = world.metab && c.metab.starving ? COLOR.starving : COLOR.outline; ctx.lineWidth = w + 2;
      ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx) + 0.01, Y(by)); ctx.stroke();
    }
    const jt = p.joint >= 0 ? c.joints[p.joint] : null;
    if (jt && jt.burst) {   // a burst organ: a coil, bright while firing, dull while recharging
      const st = jt.burst.state;
      ctx.strokeStyle = st === 'firing' ? COLOR.coilFiring : st === 'charged' ? COLOR.coil : COLOR.coilEmpty;
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
    ctx.strokeStyle = jt && jt.type === 'motor' && !jt.on ? COLOR.stopped : fill; ctx.lineWidth = w;   // a stopped flagellum is grey
    ctx.beginPath(); ctx.moveTo(X(ax), Y(ay)); ctx.lineTo(X(bx) + 0.01, Y(by)); ctx.stroke();
    if (p.kind === 'body') for (const inc of p.inclusions) {
      const ix = c.cx[i] + c.cs[i] * inc.x - c.sn[i] * inc.y, iy = c.cy[i] + c.sn[i] * inc.x + c.cs[i] * inc.y;
      const r = inc.r;
      if (inc.store) { drawLevel(ix, iy, inc, X, Y, s); continue; }   // a container, filled as far as it is full
      if (inc.material === 'gas') { drawGas(ix, iy, inc, X, Y, s); continue; }
      ctx.fillStyle = inc.pumpable ? sapColor(inc) : COLOR[inc.material];
      if (r > 0.02) { ctx.beginPath(); ctx.arc(X(ix), Y(iy), Math.max(r * s, 1), 0, Math.PI * 2); ctx.fill(); }
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
    if (sn.kind === 'statolith') continue;   // drawn with the inclusions
    if (sn.kind === 'timer') {   // a granule that glows when it starts and fades as its time runs out
      const glow = 1 - sn.value, r = Math.max(1.3 * s, 3);
      if (glow > 0.01) {
        const g = ctx.createRadialGradient(X(px), Y(py), 0, X(px), Y(py), r * 3);
        g.addColorStop(0, `rgba(${COLOR.timer},${(0.7 * glow).toFixed(3)})`); g.addColorStop(1, `rgba(${COLOR.timer},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(px), Y(py), r * 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `rgba(${COLOR.timer},${(0.35 + 0.65 * glow).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(X(px), Y(py), r, 0, Math.PI * 2); ctx.fill();
      continue;
    }
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
function lift(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (touches.size > 0) return;
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
segmented('speedSeg', 'speed'); segmented('viewSeg', 'viewMode'); segmented('wallSeg', 'bodyWall'); segmented('feelsSeg', 'partFeels'); segmented('contentSeg', 'partContent');
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
  'Spine, protein': 'Spine', 'Spine, glass': 'Glass spine', 'Burst organ (escape)': 'Burst organ',
  'Ejectisome, latched (Release)': 'Ejectisome', 'Oil droplet': 'Oil droplet',
  'Sap vacuole (slider)': 'Sap vacuole', 'Kin pad': 'Kin pad', 'Mucus pad': 'Mucus pad',
  'Plastid (makes energy)': 'Plastid', 'Starch granule (quick store, heavy)': 'Starch',
  'Light sensor (eyespot)': 'Eyespot', 'Touch sensor': 'Touch', 'Proximity sensor': 'Proximity',
  'Gas vesicles (float, crush deep)': 'Gas vesicles', 'Statolith (which way is up)': 'Statolith', 'Timer (clock)': 'Timer',
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
  for (const [boxId, selId] of [['speedSeg', 'speed'], ['viewSeg', 'viewMode'], ['wallSeg', 'bodyWall'], ['chips', 'partWhat'], ['feelsSeg', 'partFeels'], ['contentSeg', 'partContent']]) {
    const v = $(selId).value;
    for (const b of $(boxId).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
  }
  $('gravityBtn').classList.toggle('on', $('gravity').checked);
  $('lightBtn').classList.toggle('on', $('light').checked);
  $('dayBtn').classList.toggle('on', $('day').checked);
  $('calmBtn').classList.toggle('on', calmBeats);
  $('infoBtn').classList.toggle('on', !$('stats').hidden);
  $('flipBtn').classList.toggle('on', $('partFlip').checked);
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
load(preset(asked && PRESETS[asked] ? asked : "Vesperella (Claude's species)"));   // the sandbox opens with Claude's species
requestAnimationFrame(frame);
