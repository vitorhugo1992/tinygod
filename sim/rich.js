// The rich night record (2026-11-19, the Ocean redone, step 2): enough of every cell, every RICH steps, for the page to
// draw last night exactly as the Lab draws a live tank, on a device too slow to run the Ocean live. A cell is rebuilt
// from its design and size (grow.js makeCell) and posed from the record (physics.js updatePose), so what is drawn is
// the cell's own shape, parts and organelles, not a sketch. Read-only, like record.js: a recorded night plays out
// exactly as an unrecorded one.
//   richRecord(names) -> R · richStep(R, world) after each step (before world.gone is emptied) · richDone(R) -> JSON-able
//   replay(R) -> { at(steps) -> a world-like object { steps, day, light, metab, grow, flow, seed, cells, links, nitro,
//     shade, toxins } } (the cells posed and in their recorded state; links between them; the fields as recorded)
// A frame's cell: [uid, species index, size ×1e4, x ×100, y ×100, angle ×1e4, flags, joints, motor clocks, organelles,
//   extras | 0]  · flags: 1 dead, 2 resting, 4 stunned, 8 starving, 16 fixing, 32 motors on (one bit a motor in `on`)
//   joints: every unknown past the turn that isn't a motor's, ×1e4 · motor clocks: each motor's clock ×1e4 (its beat's
//   phase: the angle comes from it) · organelles: a store's fill, a chamber's density, a plastid's damage, ×1e3, in the
//   order of its inclusions · extras (only when there is any): { on: motors running (bits), h: harpoons growing back
//   (seconds), b: springs not charged ([state, t]), m: a meal being digested, st / lo: stolen and lost plastids }
// A frame's link: [uid A, kind (0 pad, 1 partner pad, 2 tube, 3 tether), A's pad / tube / tether index, uid B, B's
//   piece, bx ×100, by ×100, B's pad index or -1, tether length ×10, drilling left ×1e3 of all (tubes)]
// Fields every FIELD steps: nitrogen, shade and each toxin cloud, packed to bytes against their largest value.
import { PARAMS } from './params.js';
import { makeCell } from './grow.js';
import { updatePose, motorAngle } from './physics.js';
import { setSegmentLength } from './build.js';

const DT = PARAMS.time.dt;
export const RICH = Math.round(1 / DT), FIELD = Math.round(30 / DT);

const rnd = (v, k) => Math.round(v * k);

export function richRecord(names) { return { seed: null, every: RICH, fieldEvery: FIELD, names: names.slice(), designs: {}, frames: [], fields: [] }; }

function cellRow(c, names) {
  const joints = [], clocks = [], orgs = [];
  let on = 0, motor = 0;
  c.joints.forEach((j, i) => {
    if (j.type === 'motor') { clocks.push(rnd(j.clock || 0, 1e4)); if (j.on) on |= 1 << motor; motor++; }
    if (3 + i < c.q.length) joints.push(rnd(c.q[3 + i], 1e4));   // every joint as it is (a motor drives its joint toward its clock's angle; a stopped one stays where it was left)
  });
  for (const inc of c.pieces[0].inclusions) {
    if (inc.store) orgs.push(rnd(inc.fill || 0, 1e3));
    else if (inc.pumpable) orgs.push(rnd(inc.density, 1e3));
    else if (inc.material === 'plastid') orgs.push(rnd(inc.damage || 0, 1e3));
  }
  const m = c.metab || {};
  const flags = (c.dead ? 1 : 0) | (c.resting ? 2 : 0) | (c.stunT > 0 ? 4 : 0) | (m.starving ? 8 : 0) | (m.fixing ? 16 : 0);
  const x = {};
  if (on) x.on = on;
  const h = (c.harpoons || []).map((hp) => Math.round((hp.t || 0) * 10) / 10);
  if (h.some((v) => v > 0)) x.h = h;
  const b = c.joints.filter((j) => j.burst).map((j) => (j.burst.state === 'charged' ? 0 : [j.burst.state, Math.round(j.burst.t * 1000) / 1000]));
  if (b.some((v) => v)) x.b = b;
  if (c.meal) x.m = { prey: c.meal.prey, n: c.meal.n, t: Math.round(c.meal.t * 100) / 100, r: Math.round(c.meal.r * 100) / 100, look: c.meal.look };
  if (c.stolen && c.stolen.length) x.st = c.stolen.map((s) => ({ ...s }));
  if (c.lost && c.lost.length) x.lo = c.lost.slice();
  return [c.uid, names.indexOf(c.species), rnd(c.size || 1, 1e4), rnd(c.q[0], 100), rnd(c.q[1], 100), rnd(c.q[2], 1e4), flags,
    joints, clocks, orgs, Object.keys(x).length ? x : 0];
}

function linkRow(l, w) {
  const A = w.cells[l.a], B = w.cells[l.b];
  if (!A || !B) return null;
  const kind = l.tether ? 3 : l.feed ? 2 : l.partner ? 1 : 0;
  const list = kind === 3 ? A.tethers : kind === 2 ? A.feeders : A.pads;
  return [A.uid, kind, list ? list.indexOf(l.padA) : -1, B.uid, l.pieceB ?? -1, rnd(l.bx || 0, 100), rnd(l.by || 0, 100),
    l.padB ? B.pads.indexOf(l.padB) : -1, rnd(l.len || 0, 10), l.drillAll ? rnd((l.drill || 0) / l.drillAll, 1e3) : 0];
}

// a field packed to bytes: { n, max, b } (base64 of n bytes, each value / max × 255)
function pack(arr) {
  let max = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  const u8 = new Uint8Array(arr.length);
  if (max > 0) for (let i = 0; i < arr.length; i++) u8[i] = Math.round(255 * Math.max(0, arr[i]) / max);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { n: arr.length, max, b: btoa(s) };
}
function unpack(p) {
  const bin = atob(p.b), out = new Float64Array(p.n);
  for (let i = 0; i < p.n; i++) out[i] = bin.charCodeAt(i) / 255 * p.max;
  return out;
}

export function richStep(R, w) {
  if (R.seed === null) R.seed = w.seed;
  if (w.steps % R.every === 0) {
    for (const c of w.cells) if (!R.designs[c.species]) R.designs[c.species] = c.design;
    for (const c of w.cells) if (!R.names.includes(c.species)) R.names.push(c.species);
    const links = [];
    for (const l of w.links || []) { const r = linkRow(l, w); if (r) links.push(r); }
    R.frames.push({ s: w.steps, c: w.cells.filter((c) => !c.eatenBy).map((c) => cellRow(c, R.names)), l: links });
  }
  if (w.steps % R.fieldEvery === 0) {
    const f = { s: w.steps };
    if (w.nitro) f.n = pack(w.nitro.c);
    if (w.shade) f.sh = pack(w.shade.above);
    if (w.toxins && w.toxins.size) { f.tx = {}; for (const [sp, a] of w.toxins) f.tx[sp] = pack(a); }
    R.fields.push(f);
  }
}

export const richDone = (R) => ({ seed: R.seed, every: R.every, fieldEvery: R.fieldEvery, names: R.names, designs: R.designs, frames: R.frames, fields: R.fields });

// ---- the page's side: a recorded night, posed at any moment ----

const angDiff = (a, b) => { let d = b - a; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); return d; };

export function replay(R, world = {}) {
  const built = new Map();   // uid -> { key, cell }
  const fieldsAt = new Map();
  function cellFor(row) {
    const [uid, sp, size, , , , , , , , x] = row;
    const name = R.names[sp], g = size / 1e4, st = (x && x.st) || [], lo = (x && x.lo) || [];
    const key = `${name}|${size}|${JSON.stringify(st)}|${lo.join(',')}`;
    const had = built.get(uid);
    if (had && had.key === key) return had.cell;
    const c = makeCell(R.designs[name], g, st, lo);
    c.species = name; c.uid = uid;
    built.set(uid, { key, cell: c });
    return c;
  }
  // a frame's cell posed: between frames A and B (u from 0 to 1), the place, turn and joints eased; motors by their clocks
  function pose(c, a, b, u, steps) {
    const q = c.q, lerp = (x, y) => x + (y - x) * u;
    q[0] = (b ? lerp(a[3], b[3]) : a[3]) / 100;
    q[1] = (b ? lerp(a[4], b[4]) : a[4]) / 100;
    q[2] = (a[5] + (b ? angDiff(a[5] / 1e4, b[5] / 1e4) * 1e4 * u : 0)) / 1e4;
    const ex = a[10] || {}, on = ex.on || 0;
    let ji = 0, mi = 0;
    c.joints.forEach((j, i) => {
      if (3 + i >= q.length) return;
      const v0 = a[7][ji] / 1e4, v1 = b && b[7][ji] !== undefined ? b[7][ji] / 1e4 : v0;
      ji++;
      if (j.type === 'motor') {
        const k0 = a[8][mi] / 1e4, k1 = b ? b[8][mi] / 1e4 : null, running = on & (1 << mi);
        mi++;
        j.on = !!running;
        if (running) {   // beating: the recorded angle, plus how far its clock's stroke has moved since (exact at a frame)
          j.clock = k1 !== null && k1 >= k0 ? lerp(k0, k1) : k0 + (steps - a.s) * DT * (j.gain || 1);
          const a0 = motorAngle(j, k0);
          q[3 + i] = v0 + motorAngle(j, j.clock) - a0;
          return;
        }
        j.clock = k0;
      }
      q[3 + i] = lerp(v0, v1);
    });
    // the cell's states (from the nearer frame: they change slowly or switch)
    const n = u < 0.5 || !b ? a : b, f = n[6], nx = n[10] || {};
    c.dead = !!(f & 1); c.resting = !!(f & 2); c.stunT = f & 4 ? 1 : 0;
    c.metab = c.metab || {}; c.metab.starving = !!(f & 8); c.metab.fixing = f & 16 ? 1 : 0;
    let oi = 0;
    for (const inc of c.pieces[0].inclusions) {
      if (inc.store) inc.fill = n[9][oi++] / 1e3;
      else if (inc.pumpable) inc.density = n[9][oi++] / 1e3;
      else if (inc.material === 'plastid') inc.damage = n[9][oi++] / 1e3;
    }
    (c.harpoons || []).forEach((h, k) => {
      h.t = nx.h ? nx.h[k] : 0;
      setSegmentLength(c.pieces[h.piece], h.full * (1 - h.t / PARAMS.harpoon.reload));
    });
    let bi = 0;
    for (const j of c.joints) if (j.burst) { const s = nx.b && nx.b[bi]; j.burst.state = s ? s[0] : 'charged'; j.burst.t = s ? s[1] : 0; bi++; }
    c.meal = nx.m ? { ...nx.m } : null;
    for (const p of c.pads || []) p.link = null;
    for (const fd of c.feeders || []) fd.link = null;
    for (const t of c.tethers || []) t.link = null;
    updatePose(c);
  }
  function field(steps) {
    let f = null;
    for (const x of R.fields) { if (x.s <= steps) f = x; else break; }
    if (!f) f = R.fields[0];
    if (!f) return {};
    if (!fieldsAt.has(f.s)) {
      const out = {};
      if (f.n) out.nitro = { c: unpack(f.n) };
      if (f.sh) out.shade = { above: unpack(f.sh) };
      if (f.tx) { out.toxins = new Map(); for (const [sp, p] of Object.entries(f.tx)) out.toxins.set(sp, unpack(p)); }
      fieldsAt.clear(); fieldsAt.set(f.s, out);
    }
    return fieldsAt.get(f.s);
  }
  function at(steps) {
    const F = R.frames;
    if (!F.length) return null;
    let lo = 0, hi = F.length - 1;
    if (steps <= F[0].s) hi = 0;
    else if (steps >= F[hi].s) lo = hi;
    else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m].s <= steps) lo = m; else hi = m; } }
    const A = F[lo], B = F[hi], u = B.s > A.s ? (steps - A.s) / (B.s - A.s) : 0;
    const rowsB = new Map(B.c.map((r) => [r[0], r]));
    const cells = [], byUid = new Map();
    // a cell in both frames is eased between them; one in A only (it died, was eaten) shows until halfway; a newborn
    // in B only, from halfway
    const rows = A.c.filter((r) => rowsB.has(r[0]) || u < 0.5).map((r) => [r, rowsB.get(r[0])]);
    if (u >= 0.5) for (const r of B.c) if (!A.c.some((x) => x[0] === r[0])) rows.push([r, null]);
    for (const [ra, rb] of rows) {
      ra.s = A.s;
      const c = cellFor(rb && u >= 0.5 && rb[2] !== ra[2] ? rb : ra);
      pose(c, ra, rb && rb[2] === ra[2] ? rb : null, rb && rb[2] === ra[2] ? u : 0, steps);
      c.index = cells.length; cells.push(c); byUid.set(c.uid, c);
    }
    const links = [];
    for (const r of (u < 0.5 ? A : B).l) {
      const a = byUid.get(r[0]), b = byUid.get(r[3]);
      if (!a || !b) continue;
      const list = r[1] === 3 ? a.tethers : r[1] === 2 ? a.feeders : a.pads, padA = list && list[r[2]];
      if (!padA) continue;
      const l = { a: a.index, b: b.index, padA, pieceB: r[4], bx: r[5] / 100, by: r[6] / 100, tether: r[1] === 3, feed: r[1] === 2, partner: r[1] === 1, len: r[8] / 10, drillAll: r[9] ? 1 : 0, drill: r[9] / 1e3 };
      if (r[7] >= 0) l.padB = b.pads[r[7]];
      padA.link = l; if (l.padB) l.padB.link = l;
      links.push(l);
    }
    for (const id of [...built.keys()]) if (!byUid.has(id)) built.delete(id);   // gone: built afresh if it comes back
    return { seed: R.seed, ...world, steps, day: true, light: true, metab: true, grow: true, flow: true, gravity: true, cells, links, ...field(steps) };
  }
  return { at, from: R.frames.length ? R.frames[0].s : 0, to: R.frames.length ? R.frames[R.frames.length - 1].s : 0 };
}
