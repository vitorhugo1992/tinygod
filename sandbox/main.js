// The sandbox viewer: plain shapes, trails and numbers over the same simulation the checks run.
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld, worldTime } from '../sim/world.js';
import { PRESETS } from '../sim/presets.js';
import { updatePose, fire } from '../sim/physics.js';
import { rewire } from '../sim/build.js';
import { PART_TEMPLATES, partGroups, surfacePoint, CATEGORIES, CONTROLS } from './parts.js';

const DT = PARAMS.time.dt, TW = PARAMS.tank.w, TH = PARAMS.tank.h;
const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');

const COLOR = {
  water: '#0b1322', outside: '#060a12', grid: '#132036', gridMajor: '#1f3352', label: '#4d6a86',
  trail: '#6fd3b5', protein: '#a8d8a0', glass: '#9fd8f0', oil: '#f2c94c', sap: '#5f8fd8',
  body: { protein: '#3f7d5c', glass: '#4f8fa0' }, outline: '#d8f0e0', motor: '#ff7a6b', hinge: '#ffb54a',
  extend: '#c9a0ff', stopped: '#5d6b74', coil: '#ffb54a', coilFiring: '#fff1a0', coilEmpty: '#6b5a40', kin: '#e070ff', mucus: '#f2e28a', link: '#e070ff', selected: '#ffffff',
  eyeDark: '#7a2a1c', eyeLit: '#ff8a3c', light: 'rgba(255,240,190,', touch: '#5fd0ff', near: 'rgba(95,208,255,',
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
// one was, facing the same way.
function applyDesign(d) {
  const old = design, pose = cell ? { x: cell.q[0], y: cell.q[1], angle: cell.q[2] * 180 / Math.PI } : null;
  design = d;
  if (!reset(pose)) { const msg = $('err').textContent; design = old; reset(pose); $('err').textContent = msg; $('buildErr').textContent = msg; return false; }
  $('buildErr').textContent = '';
  $('json').value = JSON.stringify(d, null, 2);
  listParts();
  return true;
}

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
// only the controls that mean something for the chosen part
const showControls = () => {
  const c = CONTROLS[$('partWhat').value] || {};
  $('tiltRow').style.display = c.tilt ? '' : 'none';
  $('sizeRow').style.display = c.size ? '' : 'none';
  $('insideRow').style.display = c.inside ? '' : 'none';
  if (c.sizeDefault && !editing) $('partSize').value = c.sizeDefault;
  showSize();
};
$('partWhat').onchange = () => { showControls(); if (editing) updateEdited(); }; showControls();
let partCount = 0;
let editing = null;   // the id of the part being edited, or null when adding
// Make a part from the Build controls; its first piece remembers how (build), so it can be edited later
function makePart(body, id) {
  const b = { tpl: $('partWhat').value, where: Number($('partAngle').value), tilt: Number($('partTilt').value),
    size: Number($('partSize').value) / 100, depth: Number($('partInside').value) / 100, id };
  const parts = PART_TEMPLATES[b.tpl](body, b.where, id, b.size, b.tilt, b.depth);
  parts[0].build = b;
  return parts;
}
$('addPart').onclick = () => {
  if (editing) { stopEditing(); return; }
  const d = JSON.parse(JSON.stringify(design));
  d.parts = (d.parts || []).concat(makePart(d.body, `p${Date.now() % 100000}_${++partCount}`));
  applyDesign(d);
};
// Replace the part being edited with one made from the controls now; keep its id and its wiring
function updateEdited() {
  const d = JSON.parse(JSON.stringify(design));
  const g = partGroups(d.parts).find((x) => x.members[0].build && x.members[0].build.id === editing);
  if (!g) { stopEditing(); return; }
  const fresh = makePart(d.body, editing);
  g.members.forEach((m, i) => { if (m.joint && m.joint.control && fresh[i] && fresh[i].joint) fresh[i].joint.control = m.joint.control; });
  const at = d.parts.indexOf(g.members[0]);
  d.parts = d.parts.filter((p) => !g.members.includes(p));
  d.parts.splice(at, 0, ...fresh);
  applyDesign(d);
}
function startEditing(b) {
  editing = b.id;
  $('partWhat').value = b.tpl; showControls();
  $('partAngle').value = b.where; $('partTilt').value = b.tilt;
  $('partSize').value = Math.round(b.size * 100); $('partInside').value = Math.round(b.depth * 100);
  showAngle(); showTilt(); showSize(); showInside();
  $('addPart').textContent = '✓ Done editing'; $('cancelEdit').hidden = false;
  listParts();
}
function stopEditing() {
  editing = null;
  $('addPart').textContent = '＋ Add to body'; $('cancelEdit').hidden = true;
  listParts();
}
$('cancelEdit').onclick = stopEditing;
// while editing, letting go of a slider (or picking another part type) updates the part at once
for (const id of ['partAngle', 'partTilt', 'partSize', 'partInside']) $(id).onchange = () => { if (editing) updateEdited(); };
// Wiring for a group's motors (runs) or latched springs (released): a sensor, and the range of its reading (0-1)
// in which the part runs or fires
const RANGE = { light: [0.5, 1], touch: [0.5, 1], near: [0.3, 1] };   // a sensible start when a sensor is picked
const SCALE = {   // what the 0-1 reading means, shown beside the range
  light: '0 = dark or facing away, 1 = facing up in full light',
  touch: '0 = nothing, 1 = another species touching',
  near: '0 = nobody in range, 1 = another species touching',
};
function wiring(g, wired) {
  const box = document.createElement('div');
  box.className = 'wire';
  const motor = wired[0].joint.type === 'motor' && !wired[0].joint.burst;
  const sel = document.createElement('select');
  sel.add(new Option(motor ? 'runs always' : 'released by hand', ''));
  const sensors = partGroups(design.parts || []).filter((x) => x.category === 'Sensors');
  for (const s of sensors) sel.add(new Option(`${motor ? 'runs' : 'fires'} by ${s.name.toLowerCase()} at ${s.deg}°`, s.members[0].id));
  const c = wired[0].joint.control;
  sel.value = c ? c.sensor : '';
  box.appendChild(sel);
  // rewiring changes the design and the cells already in the tank as they are: no reset
  const write = (sensor, min, max) => {
    if (sensor && !(min <= max)) { $('buildErr').textContent = 'the range must run from low to high'; return; }
    $('buildErr').textContent = '';
    for (const m of wired) {
      const control = sensor ? { sensor, min, max } : null;
      if (control) m.joint.control = control; else delete m.joint.control;
      const k = design.parts.indexOf(m);
      for (const c of world.cells) if (c.design === design) rewire(c, k, control);
    }
    $('json').value = JSON.stringify(design, null, 2);
    listParts();
  };
  sel.onchange = () => {
    const kind = sel.value && (design.parts.find((p) => p.id === sel.value).kind || 'light');
    write(sel.value, ...(kind ? RANGE[kind] : []));
  };
  if (c) {
    const lo = c.when === 'light' ? 0.5 : c.min ?? 0, hi = c.when === 'dark' ? 0.5 : c.max ?? 1;
    const kind = design.parts.find((p) => p.id === c.sensor).kind || 'light';
    const span = document.createElement('span');
    span.innerHTML = `${motor ? 'on' : 'fires'} while it reads <input type="number" min="0" max="1" step="0.05" value="${lo}"> to <input type="number" min="0" max="1" step="0.05" value="${hi}"> · now <b data-live="${c.sensor}">–</b><br><span style="color:var(--dim)">${SCALE[kind]}</span>`;
    const [a, b] = span.querySelectorAll('input');
    a.onchange = b.onchange = () => write(c.sensor, Number(a.value), Number(b.value));
    box.appendChild(span);
  }
  return box;
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
    row.innerHTML = `<span>${g.name} at ${g.deg}°${g.more ? ` (+${g.more} pieces)` : ''}</span>
      <span>${b ? '<button class="edit">Edit</button> ' : ''}<button class="remove">Remove</button></span>`;
    if (b && b.id === editing) row.classList.add('editing');
    if (b) row.querySelector('.edit').onclick = () => (editing === b.id ? stopEditing() : startEditing(b));
    const wired = g.members.filter((m) => m.joint && (m.joint.type === 'motor' || m.joint.latched));
    if (wired.length) row.appendChild(wiring(g, wired));
    row.querySelector('.remove').onclick = () => {
      if (b && b.id === editing) { editing = null; $('addPart').textContent = '＋ Add to body'; $('cancelEdit').hidden = true; }
      const d = JSON.parse(JSON.stringify(design));
      const gone = new Set(g.members.map((m) => design.parts.indexOf(m)));
      d.parts = d.parts.filter((_, i) => !gone.has(i));
      applyDesign(d);
    };
    box.appendChild(row);
  });
  if (!box.children.length) box.textContent = 'No parts yet: just a body.';
}

function reset(pose) {
  $('err').textContent = '';
  const s = (pose && pose.x !== undefined ? pose : null) || design.start || {};
  const w = makeWorld(1, { gravity: $('gravity').checked, light: $('light').checked });
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

let last = performance.now();
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (playing && world) {
    acc += elapsed * Number($('speed').value);
    const want = Math.floor(acc / DT);
    const t0 = performance.now();
    let done = 0;
    while (done < want && performance.now() - t0 < 14) { advance(Math.min(50, want - done)); done = Math.min(done + 50, want); }
    acc -= want * DT;
    lagging = done < want;                     // the computer can't keep up with this speed
  }
  if (world) { draw(); if (!$('stats').hidden) stats(); syncButtons(); $('stats').style.top = `${$('bar').offsetHeight + 14}px`; }
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
  lines.push(`light here ${(world.light ? Math.exp(-PARAMS.light.attenuation * (TH - cell.q[1])) : 0).toFixed(2)} of the surface's`);
  const NAME = { light: 'eyespot', touch: 'touch', near: 'proximity' };
  cell.sensors.forEach((sn, i) => lines.push(`${NAME[sn.kind].padEnd(9)} ${sn.value.toFixed(2)}`));
  const bursts = cell.joints.filter((j) => j.burst);
  if (bursts.length) {
    const b = bursts[0].burst;
    lines.push(`burst     ${b.state === 'charged' ? 'charged' : b.state === 'firing' ? 'FIRING' : `recharging, ${(b.recharge - b.t).toFixed(1)} s left`}`);
  }
  const motors = cell.joints.filter((j) => j.type === 'motor' && !j.burst);
  if (motors.length) lines.push(`motors    ${motors.filter((j) => j.on).length} of ${motors.length} running`);
  for (const inc of cell.pieces[0].inclusions) if (inc.show) inc.show();
  // live readings beside the wiring (for the selected cell, if it is this design)
  for (const el of document.querySelectorAll('[data-live]')) {
    const sn = cell.design === design && cell.sensors.find((x) => x.id === el.dataset.live);
    el.textContent = sn ? sn.value.toFixed(2) : '–';
  }
  $('stats').textContent = lines.join('\n');
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
  if (view === 'follow') cam = { x: cell.q[0], y: cell.q[1] };
  else if (view === 'fit') fit(W, H);
  const s = Number($('zoom').value);                       // pixels per µm
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

  if (world.light) {   // light from above, fading with depth over the tank, and a sign in the corner
    const top = Y(TH), g = ctx.createLinearGradient(0, top, 0, Y(0));
    for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, COLOR.light + (0.16 * Math.exp(-PARAMS.light.attenuation * TH * k / 4)).toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(X(0), top, TW * s, TH * s);
    if (top > 0) { ctx.fillStyle = COLOR.light + '.8)'; ctx.fillRect(X(0), top - 2, TW * s, 3); }
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
  for (const c of world.cells) drawCell(c, X, Y, s);
  drawLinks(X, Y, s);
  drawScale(W, H, s);
  drawMinimap(W, H);
}

function drawCell(c, X, Y, s) {
  ctx.lineCap = 'round';
  // segments first, body over them, then inclusions and joints
  const order = c.pieces.map((p, i) => i).sort((a, b) => (c.pieces[a].kind === 'body') - (c.pieces[b].kind === 'body'));
  for (const i of order) {
    const p = c.pieces[i], h = p.L / 2;
    const ax = c.cx[i] - c.cs[i] * h, ay = c.cy[i] - c.sn[i] * h, bx = c.cx[i] + c.cs[i] * h, by = c.cy[i] + c.sn[i] * h;
    const fill = p.kind === 'body' ? COLOR.body[p.material] : COLOR[p.material];
    const w = Math.max(2 * p.a * s, 1.5);
    if (p.kind === 'body') {   // outline
      ctx.strokeStyle = COLOR.outline; ctx.lineWidth = w + 2;
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
      ctx.fillStyle = COLOR[inc.material];
      ctx.beginPath(); ctx.arc(X(ix), Y(iy), Math.max(inc.r * s, 1.5), 0, Math.PI * 2); ctx.fill();
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
    if (sn.kind !== 'light') {   // touch and proximity: a blue dot, filled while it feels someone; the range, faint
      ctx.strokeStyle = COLOR.touch; ctx.fillStyle = COLOR.touch; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max(1.2 * s, 3), 0, Math.PI * 2);
      if (sn.value > 0) ctx.fill(); else ctx.stroke();
      if (sn.kind === 'near' && c === cell) {
        ctx.strokeStyle = COLOR.near + (0.15 + 0.5 * sn.value) + ')'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(X(px), Y(py), sn.range * s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      continue;
    }
    if (c === cell) {   // the eyespot's cone, faint
      const dir = c.phi[i] + sn.facing, r = 14;
      ctx.fillStyle = COLOR.light + '.12)';
      ctx.beginPath(); ctx.moveTo(X(px), Y(py));
      for (let k = 0; k <= 12; k++) { const a = dir - sn.cone / 2 + sn.cone * k / 12; ctx.lineTo(X(px + Math.cos(a) * r), Y(py + Math.sin(a) * r)); }
      ctx.closePath(); ctx.fill();
    }
    // eyespots: dark red, bright orange when lit, a tick the way they face
    const dir = c.phi[i] + sn.facing;
    const lit = sn.value > 0.5;
    ctx.strokeStyle = lit ? COLOR.eyeLit : COLOR.eyeDark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(px), Y(py)); ctx.lineTo(X(px + Math.cos(dir) * 4), Y(py + Math.sin(dir) * 4)); ctx.stroke();
    ctx.fillStyle = lit ? COLOR.eyeLit : COLOR.eyeDark;
    ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max(1.2 * s, 3), 0, Math.PI * 2); ctx.fill();
  }
  for (const pad of c.pads) {
    const [px, py] = padWorld(c, pad);
    ctx.strokeStyle = COLOR[pad.kind]; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X(px), Y(py), Math.max(pad.r * s, 2.5), 0, Math.PI * 2); ctx.stroke();
  }
  if (c === cell && c.design === design) {      // where the Build panel would put the next part
    const [mx, my] = surfacePoint(design.body, Number($('partAngle').value));
    const [wx, wy] = [c.cx[0] + c.cs[0] * mx - c.sn[0] * my, c.cy[0] + c.sn[0] * mx + c.cs[0] * my];
    ctx.fillStyle = COLOR.selected; ctx.strokeStyle = COLOR.selected; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(X(wx), Y(wy), 3, 0, Math.PI * 2); ctx.fill();
    const dir = c.phi[0] + (Number($('partAngle').value) + Number($('partTilt').value)) * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(X(wx), Y(wy)); ctx.lineTo(X(wx + Math.cos(dir) * 8), Y(wy + Math.sin(dir) * 8)); ctx.stroke();
  }
  if (c === cell && world.cells.length > 1) {   // a ring round the selected cell
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
segmented('speedSeg', 'speed'); segmented('viewSeg', 'viewMode'); segmented('wallSeg', 'bodyWall');
const toggle = (btnId, boxId) => { $(btnId).onclick = () => { $(boxId).checked = !$(boxId).checked; $(boxId).dispatchEvent(new Event('change')); }; };
toggle('gravityBtn', 'gravity'); toggle('lightBtn', 'light');
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
  'Spring, latched (Release)': 'Spring', 'Ejectisome, latched (Release)': 'Ejectisome', 'Oil droplet': 'Oil droplet',
  'Sap vacuole (slider)': 'Sap vacuole', 'Kin pad': 'Kin pad', 'Mucus pad': 'Mucus pad',
  'Light sensor (eyespot)': 'Eyespot', 'Touch sensor (another species)': 'Touch', 'Proximity sensor (another species)': 'Proximity',
};
for (const [cat, names] of Object.entries(CATEGORIES)) {
  const head = document.createElement('div'); head.className = 'cat'; head.textContent = cat;
  const chips = document.createElement('div'); chips.className = 'chips';
  for (const name of names) {
    const b = document.createElement('button');
    b.textContent = SHORT[name] || name; b.title = name; b.dataset.v = name;
    b.onclick = () => { $('partWhat').value = name; $('partWhat').dispatchEvent(new Event('change')); };
    chips.appendChild(b);
  }
  $('chips').append(head, chips);
}

// Light up the buttons that match the current state (cheap; once a frame)
function syncButtons() {
  for (const [boxId, selId] of [['speedSeg', 'speed'], ['viewSeg', 'viewMode'], ['wallSeg', 'bodyWall'], ['chips', 'partWhat']]) {
    const v = $(selId).value;
    for (const b of $(boxId).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
  }
  $('gravityBtn').classList.toggle('on', $('gravity').checked);
  $('lightBtn').classList.toggle('on', $('light').checked);
  $('infoBtn').classList.toggle('on', !$('stats').hidden);
}

resize();
const asked = new URLSearchParams(location.search).get('preset');   // ?preset=Wave%20tail opens that design
load(preset(asked && PRESETS[asked] ? asked : 'Round cell'));
requestAnimationFrame(frame);
