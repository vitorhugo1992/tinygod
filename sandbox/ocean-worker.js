// The live Ocean (2026-11-19, the Ocean redone, step 1): last night's saved world (ocean/world.json.gz, sim/save.js)
// loaded off the page's thread and run on, so the page shows the Ocean as it is now. The nightly run stays the record:
// this is a window on tonight before it is official (same start, same code; a browser's Math.* may drift from Node's).
// In:  { type: 'start', url, speed (sim seconds per real second, default 1), fps (frames a second, default 8) }
//      { type: 'speed', speed } · { type: 'pause' } · { type: 'resume' }
//      { type: 'steps', n, every, text }   (test: run exactly n steps flat out, then report the state's fingerprint;
//        every: also every that many steps; text: the saved state itself)
// Out: { type: 'ready', cells, steps } once loaded
//      { type: 'frame', world, smooth, steps, ratio, cost } fps times a second: the whole world (structured clone:
//        what the Lab's drawing reads), smooth = [uid, x, y, turn, …] each cell averaged since the last frame, ratio = sim seconds run per real second over the last few seconds, cost = ms of
//        computing per sim second
//      { type: 'fingerprint', steps, hash, hashes, ms, text } after 'steps' · { type: 'error', message }
import { PARAMS } from '../sim/params.js';
import { stepWorld } from '../sim/world.js';
import { loadState, saveState } from '../sim/save.js';

const DT = PARAMS.time.dt, TW = PARAMS.tank.w;
let world = null, speed = 1, fps = 8, paused = false, timer = 0;
let realT = 0, simDue = 0, lastFrame = 0;
const hist = [];   // [real ms, steps, busy ms] samples for the ratio and cost
// each cell's place and turn averaged over the steps since the last frame (a swimmer's body bounces ~10 µm with every
// stroke, 20 times a second: a frame caught anywhere in that would make the drawing jitter); uid -> [n, Σx, Σy, Σturn, turn0]
const avg = new Map();
function average() {
  for (const c of world.cells) {
    let a = avg.get(c.uid);
    if (!a) { a = [0, 0, 0, 0, c.q[2], c.q[0]]; avg.set(c.uid, a); }
    let d = c.q[2] - a[4]; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
    let dx = c.q[0] - a[5]; if (dx > TW / 2) dx -= TW; else if (dx < -TW / 2) dx += TW;   // round the Ocean's seam: the short way
    a[0]++; a[1] += a[5] + dx; a[2] += c.q[1]; a[3] += d;
  }
}

async function load(url) {
  const got = await fetch(url, { cache: 'no-cache' });
  if (!got.ok) throw new Error(`the Ocean could not be loaded (${got.status})`);
  const buf = new Uint8Array(await got.arrayBuffer());
  const text = buf[0] === 0x1f && buf[1] === 0x8b   // still gzipped (a server may have unpacked it already)
    ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(buf);
  const w = loadState(text).world;
  if (w.cap) PARAMS.grow.cap = w.cap;   // as tools/ocean.mjs does (the world's own cap wins; this is for anything reading the global)
  return w;
}

// FNV-1a over the saved text: the same hash tools/ocean-live-check.mjs prints for the same steps in Node
export function fingerprint(w) {
  const s = saveState({ world: w });
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function tick() {
  timer = 0;
  if (!world || paused) return;
  const now = performance.now(), dtReal = Math.min(now - realT, 250);   // a hidden tab's long gap doesn't pile up work
  realT = now;
  simDue = Math.min(simDue + dtReal / 1000 * speed / DT, 2 / DT);   // steps owed; never more than 2 sim s behind
  const until = now + 30;   // work in slices, so messages get through
  let n = 0;
  while (simDue >= 1 && performance.now() < until) { stepWorld(world); average(); simDue--; n++; }
  const busy = performance.now() - now;
  hist.push([now, n, busy]);
  while (hist.length > 2 && now - hist[0][0] > 4000) hist.shift();
  if (now - lastFrame >= 1000 / fps) { lastFrame = now; postFrame(); }
  timer = setTimeout(tick, n ? 0 : 4);
}

function postFrame() {
  const span = (hist[hist.length - 1][0] - hist[0][0]) / 1000 || 1;
  let steps = 0, busy = 0;
  for (const [, n, b] of hist) { steps += n; busy += b; }
  const simS = steps * DT;
  const smooth = [];
  for (const [uid, a] of avg) if (a[0]) { let x = a[1] / a[0]; if (x < 0) x += TW; else if (x >= TW) x -= TW; smooth.push(uid, x, a[2] / a[0], a[4] + a[3] / a[0]); }
  avg.clear();
  postMessage({ type: 'frame', world, smooth, steps: world.steps, ratio: simS / span, cost: simS ? busy / simS : 0 });
  if (world.gone) world.gone.length = 0;   // the cells removed since the last frame went with it (sound, toasts: step 3)
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'start') {
      world = await load(m.url);
      speed = m.speed ?? 1; fps = m.fps ?? 8;
      postMessage({ type: 'ready', cells: world.cells.length, steps: world.steps });
      if (m.run === false) return;
      realT = performance.now(); simDue = 0; hist.length = 0; hist.push([realT, 0, 0]);
      tick();
    } else if (m.type === 'speed') speed = m.speed;
    else if (m.type === 'pause') { paused = true; if (timer) clearTimeout(timer); timer = 0; }
    else if (m.type === 'resume') { if (paused) { paused = false; realT = performance.now(); if (!timer) tick(); } }
    else if (m.type === 'steps') {
      paused = true;
      const t0 = performance.now();
      const every = m.every || m.n, hashes = [];
      for (let k = 1; k <= m.n; k++) { stepWorld(world); if (world.gone) world.gone.length = 0; if (k % every === 0) hashes.push([world.steps, fingerprint(world)]); }
      postMessage({ type: 'fingerprint', steps: world.steps, hash: fingerprint(world), hashes, ms: performance.now() - t0, text: m.text ? saveState({ world }) : undefined });
    }
  } catch (err) { postMessage({ type: 'error', message: err.message }); }
};
