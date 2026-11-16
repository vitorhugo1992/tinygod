// Sound (author, 2026-11-15: "the game needs ambient ocean and water soundscape and foley for immersive experience"; no
// music). Everything is synthesised here with Web Audio: no sound files, so it works offline. Off until the player turns
// it on (phones only allow sound after a tap); the choice is kept (localStorage tinygod.sound).
//   the water: a muffled underwater bed whose brightness follows the light where the camera looks (open and airy near the
//     surface by day, dark and close at night and in the deep), a slow swell, a low rumble growing with depth, glints and
//     bubbles near the lit surface, stronger currents at night louder; a generated room reverb makes it sound inside water
//   foley: what the simulation does, heard when it happens on or near the screen, panned by where: a division, a death, a
//     swallow, a tube latching, a harpoon or a tether thrown, a spring jump, a toxin burst
// The simulation is never touched: listen() only reads the world after each batch of steps.

const KEY = 'tinygod.sound';
let A = null, on = false, nodes = null, view = null, playing = false, speed = 1;
const last = new Map();          // foley kind -> last time it played (s, audio clock): no machine-gun repeats
let recent = [];                  // times of recent foley: at most a few a second whatever the sim's speed

function noiseBuffer(seconds, brown) {
  const n = Math.floor(A.sampleRate * seconds), b = A.createBuffer(2, n, A.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let v = 0, p0 = 0, p1 = 0, p2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { v = (v + 0.02 * w) / 1.02; d[i] = v * 3.5; }
      else { p0 = 0.99765 * p0 + w * 0.099; p1 = 0.963 * p1 + w * 0.2965; p2 = 0.57 * p2 + w * 1.0527; d[i] = (p0 + p1 + p2 + w * 0.1848) * 0.11; }   // pink
    }
    // the loop's ends meet smoothly
    const f = Math.min(2000, n >> 4);
    for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
  }
  return b;
}
// a dark, soft room: decaying noise, low-passed by how far it has travelled
function impulse(seconds) {
  const n = Math.floor(A.sampleRate * seconds), b = A.createBuffer(2, n, A.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) { const t = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.42 * t); d[i] = lp * Math.pow(1 - t, 2.6); }
  }
  return b;
}

function build(ctx) {
  A = ctx || new (window.AudioContext || window.webkitAudioContext)();
  const master = A.createGain(); master.gain.value = 0;
  const comp = A.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  master.connect(comp).connect(A.destination);
  const verb = A.createConvolver(); verb.buffer = impulse(3.2);
  const wet = A.createGain(); wet.gain.value = 0.55; verb.connect(wet).connect(master);
  const brown = noiseBuffer(7, true), pink = noiseBuffer(5, false);
  const loop = (buf, rate) => { const s = A.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(); return s; };
  // the bed: brown noise through a low-pass that opens with the light
  const bedF = A.createBiquadFilter(); bedF.type = 'lowpass'; bedF.frequency.value = 400; bedF.Q.value = 0.6;
  const bed = A.createGain(); bed.gain.value = 0.5;
  loop(brown, 1).connect(bedF).connect(bed).connect(master);
  // a slow swell on it
  const swell = A.createOscillator(), swellG = A.createGain(); swell.frequency.value = 0.07; swellG.gain.value = 0.12;
  swell.connect(swellG).connect(bed.gain); swell.start();
  // the deep's rumble
  const rumF = A.createBiquadFilter(); rumF.type = 'lowpass'; rumF.frequency.value = 85;
  const rum = A.createGain(); rum.gain.value = 0.3;
  loop(brown, 0.5).connect(rumF).connect(rum).connect(master);
  // near the surface by day: a soft high wash (light through moving water)
  const surfF = A.createBiquadFilter(); surfF.type = 'bandpass'; surfF.frequency.value = 2600; surfF.Q.value = 0.5;
  const surf = A.createGain(); surf.gain.value = 0;
  loop(pink, 1).connect(surfF).connect(surf).connect(master);
  surf.connect(verb);
  nodes = { master, verb, bedF, bed, rum, surf, grain: noiseBuffer(3, false) };
}

// one voice: a source through an envelope, panned, part dry and part into the reverb
function voice(src, { gain = 0.2, attack = 0.005, decay = 0.3, pan = 0, wet = 0.4, at = A.currentTime, filter = null }) {
  const g = A.createGain(), p = A.createStereoPanner ? A.createStereoPanner() : null;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  let head = src;
  if (filter) { head.connect(filter); head = filter; }
  head.connect(g);
  let out = g;
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); out = p; }
  out.connect(nodes.master);
  if (wet > 0) { const w = A.createGain(); w.gain.value = wet; out.connect(w).connect(nodes.verb); }
  if (src.start) { src.start(at, src.offset || 0); src.stop(at + attack + decay + 0.05); }
}
const osc = (type, f0, f1, t, at) => {
  const o = A.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + t);
  return o;
};
// a stretch of the shared noise, from a random point (seconds: how long it must last)
const noise = (at, seconds) => { const s = A.createBufferSource(); s.buffer = nodes.grain; s.offset = Math.random() * Math.max(0, 3 - seconds); return s; };
const filt = (type, f, q = 1, f1 = null, t = 0, at = 0) => {
  const b = A.createBiquadFilter(); b.type = type; b.frequency.setValueAtTime(f, at || A.currentTime); b.Q.value = q;
  if (f1) b.frequency.exponentialRampToValueAtTime(f1, (at || A.currentTime) + t);
  return b;
};

// the sounds of things happening (each a few hundred milliseconds, soft and rounded: this is water)
const FOLEY = {
  divide(o) {   // two cells: a pair of rising bloops
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 260, 470, 0.12, t), { ...o, gain: 0.22 * o.k, decay: 0.28, at: t });
    voice(osc('sine', 330, 600, 0.12, t + 0.11), { ...o, gain: 0.18 * o.k, decay: 0.3, at: t + 0.11 });
  },
  die(o) {   // a cell goes still: a low falling sigh
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 150, 55, 0.7, t), { ...o, gain: 0.26 * o.k, attack: 0.04, decay: 0.8, wet: 0.6, at: t });
    voice(noise(t, 0.9), { ...o, gain: 0.08 * o.k, attack: 0.05, decay: 0.7, at: t, filter: filt('lowpass', 500, 0.7, 120, 0.7, t) });
  },
  gulp(o) {   // swallowed whole
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 240, 80, 0.3, t), { ...o, gain: 0.3 * o.k, attack: 0.02, decay: 0.35, at: t });
    voice(noise(t, 0.4), { ...o, gain: 0.16 * o.k, attack: 0.01, decay: 0.28, at: t, filter: filt('bandpass', 900, 3, 250, 0.25, t) });
  },
  latch(o) {   // a feeding tube pierces: a wet click
    const t = o.t ?? A.currentTime;
    voice(noise(t, 0.12), { ...o, gain: 0.22 * o.k, attack: 0.002, decay: 0.09, wet: 0.25, at: t, filter: filt('bandpass', 1400, 7, 700, 0.08, t) });
    voice(osc('sine', 520, 260, 0.08, t), { ...o, gain: 0.12 * o.k, decay: 0.12, at: t });
  },
  harpoon(o) {   // thrown: a snap and a short whoosh; a hit lands with a thud
    const t = o.t ?? A.currentTime;
    voice(noise(t, 0.05), { ...o, gain: 0.2 * o.k, attack: 0.001, decay: 0.03, wet: 0.2, at: t, filter: filt('highpass', 2500, 0.7) });
    voice(noise(t, 0.25), { ...o, gain: 0.12 * o.k, attack: 0.01, decay: 0.16, at: t, filter: filt('bandpass', 3200, 2, 700, 0.15, t) });
    if (o.hit) voice(osc('sine', 120, 60, 0.15, t + 0.12), { ...o, gain: 0.3 * o.k, attack: 0.005, decay: 0.22, at: t + 0.12 });
  },
  tether(o) {   // a line thrown: a twang
    const t = o.t ?? A.currentTime, f = o.hit ? 196 : 247;
    voice(osc('triangle', f * 1.02, f, 0.4, t), { ...o, gain: 0.16 * o.k, attack: 0.003, decay: 0.6, at: t, filter: filt('lowpass', 2200, 1, 500, 0.5, t) });
  },
  spring(o) {   // a jump: a quick boing
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 180, 720, 0.18, t), { ...o, gain: 0.16 * o.k, attack: 0.005, decay: 0.24, at: t });
  },
  burst(o) {   // a toxin sac bursts: a pop and a fizz
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 300, 90, 0.08, t), { ...o, gain: 0.28 * o.k, attack: 0.002, decay: 0.12, at: t });
    voice(noise(t, 1.1), { ...o, gain: 0.1 * o.k, attack: 0.03, decay: 0.95, wet: 0.5, at: t, filter: filt('highpass', 3000, 0.7) });
  },
};
const GAP = { divide: 0.25, die: 0.5, gulp: 0.3, latch: 0.15, harpoon: 0.12, tether: 0.2, spring: 0.15, burst: 0.3 };

function play(kind, x, y, extra = {}) {
  if (!on || !A || !view || !playing) return;
  // heard on screen, fading out to half a screen beyond its edge
  const hw = view.W / 2 / view.s, hh = view.H / 2 / view.s, dx = (x - view.x) / hw, dy = (y - view.y) / hh;
  const far = Math.max(Math.abs(dx), Math.abs(dy)), k = far <= 1 ? 1 : far >= 1.5 ? 0 : 1 - (far - 1) / 0.5;
  if (k <= 0) return;
  const now = A.currentTime;
  if (now - (last.get(kind) || -9) < GAP[kind]) return;
  recent = recent.filter((t) => now - t < 1);
  if (recent.length >= 6) return;
  last.set(kind, now); recent.push(now);
  FOLEY[kind]({ k: k / (speed > 5 ? 1.6 : 1), pan: dx * 0.8, ...extra });
}

// ----- what happened in the world since we last looked (read only) -----
let seenWorld = null, seen = new Set(), links = new Set();
const marks = new WeakMap();
export function listen(world) {
  if (world !== seenWorld) {   // a new tank (reset, a mission): what is there now is not news
    seenWorld = world; seen = new Set(world.cells.map((c) => c.uid)); links = new Set(world.links || []);
    for (const c of world.cells) marks.set(c, snapshot(c));
    return;
  }
  for (const c of world.cells) {
    if (!seen.has(c.uid)) { seen.add(c.uid); if (c.mother !== undefined) play('divide', c.q[0], c.q[1]); }
    const was = marks.get(c) || snapshot(c), now = snapshot(c);
    if (c.dead && !was.dead) {
      if (c.burst || /burst itself/.test(c.diedWhy || '')) play('burst', c.q[0], c.q[1]);
      else if (!c.eatenBy && !/harpoon/.test(c.diedWhy || '')) play('die', c.q[0], c.q[1]);
    }
    if (c.lastSwallow && c.lastSwallow !== was.sw) play('gulp', c.q[0], c.q[1]);
    if (c.lastShot && c.lastShot !== was.shot) play(c.lastShot.tether ? 'tether' : 'harpoon', c.lastShot.x0, c.lastShot.y0, { hit: !!c.lastShot.hit });
    if (now.fire > was.fire) play('spring', c.q[0], c.q[1]);
    marks.set(c, now);
  }
  for (const l of world.links || []) if (l.feed && !links.has(l)) {
    links.add(l);
    const B = world.cells[l.b]; if (B) play('latch', B.q[0], B.q[1]);
  }
  if (links.size > 500) links = new Set(world.links || []);
}
function snapshot(c) {
  let fire = 0;
  for (const j of c.joints) if (j.burst && j.burst.state === 'firing') fire++;
  return { dead: !!c.dead, sw: c.lastSwallow, shot: c.lastShot, fire };
}

// ----- every frame: the water where the camera looks -----
// v: { x, y, s, W, H } the view; env: { depth 0 surface .. 1 floor, light 0-1 at the surface (day), flow 0-1, playing, speed }
export function update(v, env) {
  view = v; playing = env.playing; speed = env.speed;
  if (!on || !A || !nodes) return;
  const t = A.currentTime, sh = 1 - env.depth, lit = env.light;
  const open = sh * sh * (0.3 + 0.7 * lit);   // how open and bright the water sounds
  nodes.bedF.frequency.setTargetAtTime(160 + 1100 * open, t, 0.8);
  nodes.bed.gain.setTargetAtTime((0.42 + 0.25 * env.flow) * (env.playing ? 1 : 0.7), t, 0.8);
  nodes.rum.gain.setTargetAtTime(0.18 + 0.55 * env.depth, t, 1.2);
  nodes.surf.gain.setTargetAtTime(0.22 * Math.pow(sh, 4) * lit, t, 0.8);
  if (!env.playing) return;
  // glints: light flickering through the surface by day, tiny high chimes
  const dt = Math.min(0.1, t - (nodes.lastT || t)); nodes.lastT = t;
  if (Math.random() < dt * 2.5 * Math.pow(sh, 3) * lit) {
    const f = 1700 + Math.random() * 2400;
    voice(osc('sine', f, f * 1.01, 0.1, t), { gain: 0.025 + 0.02 * Math.random(), attack: 0.004, decay: 0.35, pan: Math.random() * 1.6 - 0.8, wet: 0.9, at: t });
  }
  // bubbles, now and then, in trickles, more near the surface
  if (Math.random() < dt * (0.08 + 0.35 * sh)) {
    const n = 1 + Math.floor(Math.random() * 5), pan = Math.random() * 1.4 - 0.7;
    for (let i = 0; i < n; i++) {
      const at = t + i * (0.05 + Math.random() * 0.09), f = 380 + Math.random() * 500;
      voice(osc('sine', f, f * 2.2, 0.05, at), { gain: 0.03 + 0.03 * Math.random(), attack: 0.003, decay: 0.07, pan, wet: 0.5, at });
    }
  }
}

// A demo rendered off-line (for listening outside the game, and to check it): `seconds` long, a descent from the lit
// surface by day to the dark deep at night, each sound of things happening in turn. Returns an AudioBuffer.
export async function renderDemo(seconds = 40) {
  const keep = { A, nodes };
  build(new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100));
  const n = nodes, end = seconds;
  n.master.gain.setValueAtTime(0.8, 0);
  const path = (param, pts) => { param.setValueAtTime(pts[0][1], 0); for (const [t, v] of pts.slice(1)) param.linearRampToValueAtTime(v, t); };
  // the water: surface at noon -> mid-water in the afternoon -> the deep at night
  const at = (f) => f * end;
  const env = (depth, lit) => { const sh = 1 - depth, open = sh * sh * (0.3 + 0.7 * lit); return { f: 160 + 1100 * open, rum: 0.18 + 0.55 * depth, surf: 0.22 * sh ** 4 * lit }; };
  const stops = [[0, env(0.02, 1)], [at(0.3), env(0.05, 1)], [at(0.55), env(0.45, 0.5)], [at(0.8), env(0.85, 0.05)], [end, env(0.9, 0)]];
  path(n.bedF.frequency, stops.map(([t, e]) => [t, e.f]));
  path(n.rum.gain, stops.map(([t, e]) => [t, e.rum]));
  path(n.surf.gain, stops.map(([t, e]) => [t, e.surf]));
  // glints and bubbles near the top
  for (let t = 0.3; t < at(0.5); t += 0.25 + Math.random() * 0.5) { const f = 1700 + Math.random() * 2400; voice(osc('sine', f, f * 1.01, 0.1, t), { gain: 0.035, attack: 0.004, decay: 0.35, pan: Math.random() * 1.6 - 0.8, wet: 0.9, at: t }); }
  for (const t0 of [1.5, 6, 11, 17, 26]) for (let i = 0; i < 4; i++) { const t = t0 + i * 0.08, f = 380 + Math.random() * 500; voice(osc('sine', f, f * 2.2, 0.05, t), { gain: 0.045, attack: 0.003, decay: 0.07, pan: -0.3, wet: 0.5, at: t }); }
  // the things that happen, in turn
  const order = ['divide', 'latch', 'harpoon', 'gulp', 'spring', 'tether', 'burst', 'die'];
  order.forEach((k, i) => FOLEY[k]({ k: 1, pan: (i % 2 ? 0.4 : -0.4), t: 3 + i * (end - 8) / order.length, hit: true }));
  const buf = await A.startRendering();
  A = keep.A; nodes = keep.nodes;
  return buf;
}

export function soundOn() { return on; }
// turn it on or off (must come from a tap: phones start sound only then)
export function setSound(want) {
  on = want;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode: not kept */ }
  if (on && !A) build();
  if (!A) return;
  if (on && A.state === 'suspended') A.resume();
  nodes.master.gain.setTargetAtTime(on ? 0.8 : 0, A.currentTime, 0.4);
}
// was it on last time? (it starts only at the next tap anywhere, as browsers require)
export function wanted() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
