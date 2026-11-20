// Sound (author, 2026-11-15: "the game needs ambient ocean and water soundscape and foley for immersive experience"; no
// music). Everything is synthesised here with Web Audio: no sound files, so it works offline. Off until the player turns
// it on (phones only allow sound after a tap); the choice is kept (localStorage tinygod.sound).
// Second pass (author, 2026-11-16: "sounds very windy with a lot of turbulence. needs to sound more underwater and
// calmer"; "every action has its own foley: a tail beating, an eyespot that detects light that triggers an action..."):
//   the water: underwater sound is low, smooth and muffled. A bed of brown noise filtered twice (nothing much above
//     ~350 Hz, a little more open near the lit surface), a slow shallow swell, a soft low drone (a fifth, 41 and 62 Hz)
//     growing with depth, a gentle muffled lapping only near the lit surface, rare soft glints and bubbles; a dark reverb.
//     No hiss: the high band read as wind.
//   foley, all through one muffling low-pass (things heard through water): a division, a death, a swallow, a tube
//     latching and sipping while it feeds, a harpoon, a tether, a spring jump, a toxin burst; every stroke of a tail or
//     oar (a soft swish, for up to three swimmers near the middle of the screen, at the stroke rhythm drawn), a tail
//     starting and stopping, a buoyancy chamber switching to float (rising bubbles) or sink (falling), resting and waking
//     (a hum falling, rising), cells joining by their pads (a tock); and what set it off: an eyespot's light rings a small
//     glassy note before the part it switched, a feeler gives a soft tick.
//   Heard only on screen or up to half a screen beyond, panned by where; rate-limited, so fast forward doesn't become
//   noise. The simulation is never touched: listen() and update() only read the world.
import { PARAMS } from '../sim/params.js';

const KEY = 'tinygod.sound', NEUTRAL = PARAMS.chamber.neutral;
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
    const f = Math.min(4000, n >> 4);   // the loop's ends meet smoothly
    for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
  }
  return b;
}
// a dark, soft room: decaying noise, ever more muffled as it travels
function impulse(seconds) {
  const n = Math.floor(A.sampleRate * seconds), b = A.createBuffer(2, n, A.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) { const t = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.25 - 0.22 * t); d[i] = lp * Math.pow(1 - t, 2.2); }
  }
  return b;
}

function build(ctx) {
  A = ctx || new (window.AudioContext || window.webkitAudioContext)();
  const master = A.createGain(); master.gain.value = 0;
  const comp = A.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
  master.connect(comp).connect(A.destination);
  const verb = A.createConvolver(); verb.buffer = impulse(3.6);
  const wet = A.createGain(); wet.gain.value = 0.6; verb.connect(wet).connect(master);
  const brown = noiseBuffer(9, true), pink = noiseBuffer(6, false);
  const loop = (buf) => { const s = A.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
  const lp = (f, q = 0.5) => { const b = A.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; b.Q.value = q; return b; };
  // the bed: brown noise, filtered twice (smooth, no hiss)
  const bedF1 = lp(200), bedF2 = lp(200), bed = A.createGain(); bed.gain.value = 0.3;
  loop(brown).connect(bedF1).connect(bedF2).connect(bed).connect(master);
  const swell = A.createOscillator(), swellG = A.createGain(); swell.frequency.value = 0.045; swellG.gain.value = 0.05;
  swell.connect(swellG).connect(bed.gain); swell.start();
  // the deep: a soft low drone, a fifth, breathing slowly
  const drone = A.createGain(); drone.gain.value = 0.05;
  // (the upper partials are for small speakers: a phone plays nothing below ~150 Hz, and the deep would fall silent)
  for (const [f, g] of [[41.2, 1], [61.7, 0.6], [82.4, 0.3], [123.5, 0.22], [164.8, 0.14], [247, 0.06]]) { const o = A.createOscillator(), og = A.createGain(); o.frequency.value = f; og.gain.value = g; o.connect(og).connect(drone); o.start(); }
  const breath = A.createOscillator(), breathG = A.createGain(); breath.frequency.value = 0.11; breathG.gain.value = 0.015;
  breath.connect(breathG).connect(drone.gain); breath.start();
  drone.connect(lp(300)).connect(master);
  // near the lit surface: a gentle muffled lapping
  const lap = A.createGain(); lap.gain.value = 0;
  loop(pink).connect(lp(520, 0.7)).connect(lap).connect(master);
  const lapL = A.createOscillator(), lapLG = A.createGain(); lapL.frequency.value = 0.31; lapLG.gain.value = 0;
  lapL.connect(lapLG).connect(lap.gain); lapL.start();
  // foley goes through water: one muffling low-pass, then dry and into the reverb
  const fol = lp(2200, 0.6); fol.connect(master);
  const folWet = A.createGain(); folWet.gain.value = 1; fol.connect(folWet).connect(verb);
  nodes = { master, verb, fol, bedF1, bedF2, bed, drone, lap, lapLG, grain: noiseBuffer(3, false) };
}

// one voice: a source through an envelope, panned, into the foley bus (wet: extra reverb)
function voice(src, { gain = 0.2, attack = 0.005, decay = 0.3, pan = 0, wet = 0.3, at = A.currentTime, filter = null }) {
  const g = A.createGain(), p = A.createStereoPanner ? A.createStereoPanner() : null;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(Math.max(gain, 0.0002), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  let head = src;
  if (filter) { head.connect(filter); head = filter; }
  head.connect(g);
  let out = g;
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); out = p; }
  out.connect(nodes.fol);
  if (wet > 0) { const w = A.createGain(); w.gain.value = wet; out.connect(w).connect(nodes.verb); }
  if (src.start) { src.start(at, src.offset || 0); src.stop(at + attack + decay + 0.05); }
}
const osc = (type, f0, f1, t, at) => {
  const o = A.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, at); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + t);
  return o;
};
// a stretch of the shared noise, from a random point
const noise = (at, seconds) => { const s = A.createBufferSource(); s.buffer = nodes.grain; s.offset = Math.random() * Math.max(0, 3 - seconds); return s; };
const filt = (type, f, q = 1, f1 = null, t = 0, at = 0) => {
  const b = A.createBiquadFilter(); b.type = type; b.frequency.setValueAtTime(f, at || A.currentTime); b.Q.value = q;
  if (f1) b.frequency.exponentialRampToValueAtTime(f1, (at || A.currentTime) + t);
  return b;
};
const bubble = (t, f, o, g = 0.03, up = 1.8) => voice(osc('sine', f, f * up, 0.06, t), { ...o, gain: g * (o.k ?? 1), attack: 0.004, decay: 0.09, at: t, wet: 0.5 });

// the sounds of things happening (each a few hundred milliseconds, soft and rounded: this is water)
const FOLEY = {
  divide(o) {   // two cells: a pair of rising bloops
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 240, 420, 0.14, t), { ...o, gain: 0.2 * o.k, attack: 0.01, decay: 0.32, at: t });
    voice(osc('sine', 300, 520, 0.14, t + 0.13), { ...o, gain: 0.16 * o.k, attack: 0.01, decay: 0.34, at: t + 0.13 });
  },
  die(o) {   // a cell goes still: a low falling sigh
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 140, 55, 0.8, t), { ...o, gain: 0.22 * o.k, attack: 0.06, decay: 0.9, wet: 0.6, at: t });
    voice(noise(t, 0.9), { ...o, gain: 0.06 * o.k, attack: 0.08, decay: 0.7, at: t, filter: filt('lowpass', 350, 0.7, 90, 0.7, t) });
  },
  gulp(o) {   // swallowed whole
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 220, 75, 0.3, t), { ...o, gain: 0.28 * o.k, attack: 0.02, decay: 0.38, at: t });
    voice(noise(t, 0.4), { ...o, gain: 0.12 * o.k, attack: 0.02, decay: 0.28, at: t, filter: filt('bandpass', 600, 3, 180, 0.25, t) });
  },
  latch(o) {   // a feeding tube pierces: a soft wet click
    const t = o.t ?? A.currentTime;
    voice(noise(t, 0.12), { ...o, gain: 0.16 * o.k, attack: 0.003, decay: 0.1, wet: 0.2, at: t, filter: filt('bandpass', 800, 5, 400, 0.08, t) });
    voice(osc('sine', 420, 220, 0.09, t), { ...o, gain: 0.1 * o.k, decay: 0.14, at: t });
  },
  sip(o) {   // a tube drinking
    const t = o.t ?? A.currentTime;
    voice(noise(t, 0.2), { ...o, gain: 0.07 * o.k, attack: 0.03, decay: 0.14, wet: 0.15, at: t, filter: filt('bandpass', 520, 4, 300, 0.15, t) });
  },
  harpoon(o) {   // thrown: a muffled thup and a short whoosh; a hit lands with a thud
    const t = o.t ?? A.currentTime;
    voice(noise(t, 0.06), { ...o, gain: 0.14 * o.k, attack: 0.002, decay: 0.05, wet: 0.15, at: t, filter: filt('bandpass', 1200, 1.5) });
    voice(noise(t, 0.3), { ...o, gain: 0.08 * o.k, attack: 0.02, decay: 0.2, at: t, filter: filt('bandpass', 900, 2, 300, 0.18, t) });
    if (o.hit) voice(osc('sine', 110, 55, 0.18, t + 0.12), { ...o, gain: 0.26 * o.k, attack: 0.006, decay: 0.26, at: t + 0.12 });
  },
  tether(o) {   // a line thrown: a soft twang
    const t = o.t ?? A.currentTime, f = o.hit ? 165 : 196;
    voice(osc('triangle', f * 1.02, f, 0.4, t), { ...o, gain: 0.12 * o.k, attack: 0.004, decay: 0.7, at: t, filter: filt('lowpass', 1200, 1, 300, 0.6, t) });
  },
  spring(o) {   // a jump: a quick boing
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 160, 560, 0.18, t), { ...o, gain: 0.13 * o.k, attack: 0.006, decay: 0.26, at: t });
  },
  burst(o) {   // a toxin sac bursts: a pop, then a cloud of tiny bubbles
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 260, 80, 0.09, t), { ...o, gain: 0.24 * o.k, attack: 0.003, decay: 0.14, at: t });
    for (let i = 0; i < 9; i++) bubble(t + 0.08 + i * 0.06 + Math.random() * 0.04, 500 + Math.random() * 500, o, 0.025, 1.6);
  },
  swish(o) {   // one stroke of a tail or an oar
    const t = o.t ?? A.currentTime, f = o.f || 420;
    voice(noise(t, 0.2), { ...o, gain: 0.05 * o.k, attack: 0.035, decay: 0.13, wet: 0.15, at: t, filter: filt('bandpass', f, 1.4, f * 0.7, 0.15, t) });
  },
  tailOn(o) {   // a tail starts beating: a short whirr up
    const t = o.t ?? A.currentTime;
    voice(noise(t, 0.35), { ...o, gain: 0.07 * o.k, attack: 0.08, decay: 0.22, wet: 0.2, at: t, filter: filt('bandpass', 220, 1.5, 520, 0.28, t) });
  },
  tailOff(o) {   // it stops: a settle
    const t = o.t ?? A.currentTime;
    voice(noise(t, 0.3), { ...o, gain: 0.05 * o.k, attack: 0.01, decay: 0.22, wet: 0.2, at: t, filter: filt('bandpass', 480, 1.5, 200, 0.2, t) });
  },
  float(o) {   // a chamber pumps itself light: rising bubbles
    const t = o.t ?? A.currentTime;
    for (let i = 0; i < 5; i++) bubble(t + i * 0.09, 300 + i * 70 + Math.random() * 30, o, 0.03, 1.7);
    voice(osc('sine', 110, 170, 0.5, t), { ...o, gain: 0.06 * o.k, attack: 0.1, decay: 0.45, at: t });
  },
  sink(o) {   // a chamber made heavy: a low falling gurgle
    const t = o.t ?? A.currentTime;
    for (let i = 0; i < 3; i++) bubble(t + i * 0.12, 420 - i * 80, o, 0.025, 0.7);
    voice(osc('sine', 170, 95, 0.5, t), { ...o, gain: 0.07 * o.k, attack: 0.05, decay: 0.5, at: t });
  },
  rest(o) {   // it rests: a hum falling
    const t = o.t ?? A.currentTime;
    voice(osc('triangle', 220, 110, 0.9, t), { ...o, gain: 0.06 * o.k, attack: 0.15, decay: 0.9, wet: 0.6, at: t, filter: filt('lowpass', 600) });
  },
  wake(o) {   // it wakes: a hum rising
    const t = o.t ?? A.currentTime;
    voice(osc('triangle', 110, 220, 0.7, t), { ...o, gain: 0.06 * o.k, attack: 0.15, decay: 0.75, wet: 0.6, at: t, filter: filt('lowpass', 600) });
  },
  join(o) {   // two cells joined by their pads: a soft tock
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 330, 290, 0.05, t), { ...o, gain: 0.12 * o.k, attack: 0.002, decay: 0.14, wet: 0.3, at: t });
  },
  eye(o) {   // an eyespot's light switched something: a small glassy note
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 1318, 1318, 0, t), { ...o, gain: 0.03 * o.k, attack: 0.004, decay: 0.55, wet: 0.9, at: t });
    voice(osc('sine', 1976, 1976, 0, t), { ...o, gain: 0.015 * o.k, attack: 0.004, decay: 0.4, wet: 0.9, at: t });
  },
  feel(o) {   // a feeler felt something and switched a part: a soft tick
    const t = o.t ?? A.currentTime;
    voice(osc('sine', 760, 640, 0.02, t), { ...o, gain: 0.06 * o.k, attack: 0.001, decay: 0.05, wet: 0.2, at: t });
  },
};
const GAP = { divide: 0.25, die: 0.5, gulp: 0.3, latch: 0.15, sip: 0.25, harpoon: 0.12, tether: 0.2, spring: 0.15, burst: 0.3,
  tailOn: 0.25, tailOff: 0.25, float: 0.5, sink: 0.5, rest: 0.6, wake: 0.6, join: 0.25, eye: 0.15, feel: 0.12 };

// how loud something at (x, y) is from where the camera looks: 1 on screen, fading to 0 half a screen beyond; and its pan
function near(x, y) {
  const hw = view.W / 2 / view.s, hh = view.H / 2 / view.s, dx = (x - view.x) / hw, dy = (y - view.y) / hh;
  const far = Math.max(Math.abs(dx), Math.abs(dy));
  return { k: far <= 1 ? 1 : far >= 1.5 ? 0 : 1 - (far - 1) / 0.5, pan: dx * 0.8 };
}
function play(kind, x, y, extra = {}) {
  if (!on || !A || !view || !playing) return;
  const { k, pan } = near(x, y);
  if (k <= 0) return;
  const now = A.currentTime;
  if (now - (last.get(kind) || -9) < GAP[kind]) return;
  recent = recent.filter((t) => now - t < 1);
  if (recent.length >= 6) return;
  last.set(kind, now); recent.push(now);
  const o = { k: k / (speed > 5 ? 1.6 : 1), pan, ...extra };
  // what set it off first (an eyespot's light, a feeler's touch), then the part a moment later
  if (extra.cue && now - (last.get(extra.cue) || -9) >= GAP[extra.cue]) { last.set(extra.cue, now); FOLEY[extra.cue]({ ...o, t: now }); o.t = now + 0.07; }
  FOLEY[kind](o);
}

// the kind of sensor a rule leans on: 'eye' (an eyespot), 'feel' (a feeler: touch, near, moving water) or null
function cueOf(c, controls) {
  if (!controls) return null;
  let cue = null;
  for (const ctl of controls) for (const i of [ctl.sensor, ctl.vs, ...(ctl.also || []).map((e) => e.sensor)]) {
    const s = i >= 0 ? c.sensors[i] : null;
    if (!s) continue;
    if (s.kind === 'light') return 'eye';
    if (s.kind === 'touch' || s.kind === 'near' || s.kind === 'flow') cue = 'feel';
  }
  return cue;
}

// ----- what happened in the world since we last looked (read only) -----
// Cells are known by uid and their moments by value (a step), not by object: the Ocean's live view gets a fresh copy of
// its world every frame. key: what says "the same tank" (default the world object; the Ocean passes its own).
let seenKey = null, seen = new Set(), links = new Set();
let marks = new Map();
const linkKey = (w, l) => `${w.cells[l.a] && w.cells[l.a].uid}>${w.cells[l.b] && w.cells[l.b].uid}`;
const stepOf = (x) => (x ? x.step ?? x : null);
export function listen(world, key = world) {
  if (!on) { seenKey = null; return; }   // off: no work; turned on, what is there is not news
  if (key !== seenKey) {   // a new tank (reset, a mission): what is there now is not news
    seenKey = key; seen = new Set(world.cells.map((c) => c.uid)); links = new Set((world.links || []).filter((l) => l.feed).map((l) => linkKey(world, l)));
    marks = new Map();
    for (const c of world.cells) marks.set(c.uid, snapshot(c));
    return;
  }
  for (const c of world.cells) {
    if (!seen.has(c.uid)) { seen.add(c.uid); if (c.mother !== undefined) play('divide', c.q[0], c.q[1]); }
    const was = marks.get(c.uid) || snapshot(c), now = snapshot(c), x = c.q[0], y = c.q[1];
    marks.set(c.uid, now);
    if (c.dead) {
      if (!was.dead) {
        if (c.burst || /burst itself/.test(c.diedWhy || '')) play('burst', x, y);
        else if (!c.eatenBy && !/harpoon/.test(c.diedWhy || '')) play('die', x, y);
      }
      continue;
    }
    if (c.lastSwallow && stepOf(c.lastSwallow) !== was.sw) play('gulp', x, y);
    if (c.lastShot && stepOf(c.lastShot) !== was.shot) play(c.lastShot.tether ? 'tether' : 'harpoon', c.lastShot.x0, c.lastShot.y0, { hit: !!c.lastShot.hit, cue: cueOf(c, c.lastShot.tether ? null : (c.harpoons || []).find((h) => h.shot === c.lastShot)?.controls) });
    if (now.fire > was.fire) play('spring', x, y, { cue: cueOf(c, c.joints.find((j) => j.burst && j.burst.state === 'firing')?.controls) });
    if (now.resting !== was.resting) play(now.resting ? 'rest' : 'wake', x, y, { cue: cueOf(c, c.rest && c.rest.controls) });
    else if (!(c.metab && c.metab.starving) && !c.stunT) {   // a tail switched by its rule (not by resting, starving or a stun)
      now.motors.forEach((m, i) => { if (was.motors[i] !== undefined && m !== was.motors[i]) play(m ? 'tailOn' : 'tailOff', x, y, { cue: cueOf(c, c.joints[now.motorIx[i]].controls) }); });
    }
    now.chambers.forEach((s, i) => {
      if (was.chambers[i] === undefined || s === was.chambers[i] || s === 0) return;
      play(s < 0 ? 'float' : 'sink', x, y, { cue: cueOf(c, now.chamberInc[i].controls) });
    });
    if (now.nb > was.nb) play('join', x, y);
  }
  const nowLinks = new Set();
  for (const l of world.links || []) {
    if (!l.feed) continue;
    const k = linkKey(world, l);
    nowLinks.add(k);
    if (links.has(k)) continue;
    const B = world.cells[l.b]; if (B) play('latch', B.q[0], B.q[1], { cue: cueOf(world.cells[l.a], l.padA && l.padA.controls) });
  }
  links = nowLinks;   // a tube that lets go and latches again sounds again
  if (marks.size > world.cells.length + 200) { const keep = new Set(world.cells.map((c) => c.uid)); for (const k of [...marks.keys()]) if (!keep.has(k)) marks.delete(k); }
}
function snapshot(c) {
  let fire = 0;
  const motors = [], motorIx = [];
  c.joints.forEach((j, i) => { if (j.burst) { if (j.burst.state === 'firing') fire++; } else if (j.type === 'motor') { motors.push(!!j.on); motorIx.push(i); } });
  const chamberInc = c.pieces[0].inclusions.filter((i) => i.material === 'chamber');
  const chambers = chamberInc.map((i) => (i.target < NEUTRAL - 1 ? -1 : i.target > NEUTRAL + 1 ? 1 : 0));
  return { dead: !!c.dead, sw: stepOf(c.lastSwallow), shot: stepOf(c.lastShot), fire, motors, motorIx, chambers, chamberInc, resting: !!c.resting, nb: c.neighbours || 0 };
}

// ----- every frame: the water where the camera looks, the strokes of swimmers near the middle, tubes drinking -----
// v: { x, y, s, W, H } the view; env: { depth 0 surface .. 1 floor, light 0-1 at the surface (day), flow 0-1, playing, speed, world }
const strokeAt = new Map(), sipAt = new Map();   // by cell uid and by tube (its two cells): the Ocean's cells are fresh copies each frame
export function update(v, env) {
  view = v; playing = env.playing; speed = env.speed;
  if (!on || !A || !nodes) return;
  const t = A.currentTime, sh = 1 - env.depth, lit = env.light;
  const open = sh * sh * (0.25 + 0.75 * lit);   // how open the water sounds near the lit surface
  for (const f of [nodes.bedF1, nodes.bedF2]) f.frequency.setTargetAtTime(110 + 240 * open, t, 1.5);
  nodes.bed.gain.setTargetAtTime((0.28 + 0.1 * env.flow) * (env.playing ? 1 : 0.75), t, 1.5);
  nodes.drone.gain.setTargetAtTime(0.03 + 0.08 * env.depth, t, 2);
  const lap = 0.1 * Math.pow(sh, 4) * lit;
  nodes.lap.gain.setTargetAtTime(lap, t, 1.5); nodes.lapLG.gain.setTargetAtTime(lap * 0.6, t, 1.5);
  if (!env.playing) return;
  const dt = Math.min(0.1, t - (nodes.lastT || t)); nodes.lastT = t;
  // rare soft glints near the lit surface
  if (Math.random() < dt * 0.9 * Math.pow(sh, 3) * lit) {
    const f = 900 + Math.random() * 1000;
    voice(osc('sine', f, f, 0, t), { gain: 0.012 + 0.012 * Math.random(), attack: 0.01, decay: 0.7, pan: Math.random() * 1.6 - 0.8, wet: 1, at: t });
  }
  // now and then a trickle of bubbles
  if (Math.random() < dt * (0.04 + 0.15 * sh)) {
    const n = 1 + Math.floor(Math.random() * 4), pan = Math.random() * 1.4 - 0.7;
    for (let i = 0; i < n; i++) bubble(t + i * (0.07 + Math.random() * 0.1), 280 + Math.random() * 300, { pan }, 0.018 + 0.015 * Math.random());
  }
  const w = env.world;
  if (!w) return;
  // strokes: up to three beating cells nearest the middle of the screen, at the rhythm drawn (calm drawing: at most
  // 2.5 strokes a real second), quieter when small on screen
  const swimmers = [];
  for (const c of w.cells) {
    if (c.dead) continue;
    let rate = 0;
    for (const j of c.joints) if (j.type === 'motor' && j.on && !j.burst) rate = Math.max(rate, j.rate * (j.gain ?? 1));
    if (!rate) continue;
    const { k, pan } = near(c.q[0], c.q[1]);
    if (k < 1) continue;
    swimmers.push({ c, rate, pan, d: Math.hypot(c.q[0] - view.x, c.q[1] - view.y) });
  }
  swimmers.sort((a, b) => a.d - b.d);
  for (const { c, rate, pan } of swimmers.slice(0, 3)) {
    const per = 1 / Math.min(rate * speed, 2.5), due = strokeAt.get(c.uid);
    if (due !== undefined && t < due) continue;
    strokeAt.set(c.uid, (due !== undefined && t - due < per ? due : t) + per);
    const size = Math.max(0.35, Math.min(1, c.pieces[0].a * view.s / 30)), f = 340 + ((c.uid || 1) * 37) % 160;
    FOLEY.swish({ k: size, pan, f, t: t + Math.random() * 0.02 });
  }
  // tubes drinking: a sip now and then
  for (const l of w.links || []) {
    if (!l.feed) continue;
    const B = w.cells[l.b];
    if (!B || near(B.q[0], B.q[1]).k < 1) continue;
    const lk = linkKey(w, l), due = sipAt.get(lk);
    if (due === undefined) { sipAt.set(lk, t + 0.8); continue; }
    if (t < due) continue;
    sipAt.set(lk, t + 1.2 + Math.random() * 0.8);
    play('sip', B.q[0], B.q[1]);
  }
}

// A demo rendered off-line (to listen outside the game, and to check it): `seconds` long, a descent from the lit
// surface by day to the dark deep at night, a swimmer's strokes, then each sound of things happening in turn.
export async function renderDemo(seconds = 60) {
  const keep = { A, nodes };
  build(new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100));
  const n = nodes, end = seconds;
  n.master.gain.setValueAtTime(0.8, 0);
  const path = (param, pts) => { param.setValueAtTime(pts[0][1], 0); for (const [t, v] of pts.slice(1)) param.linearRampToValueAtTime(v, t); };
  const env = (depth, lit) => { const sh = 1 - depth, open = sh * sh * (0.25 + 0.75 * lit); return { f: 110 + 240 * open, drone: 0.03 + 0.08 * depth, lap: 0.1 * sh ** 4 * lit }; };
  const stops = [[0, env(0.02, 1)], [end * 0.3, env(0.05, 1)], [end * 0.55, env(0.45, 0.5)], [end * 0.8, env(0.85, 0.05)], [end, env(0.9, 0)]];
  for (const f of [n.bedF1, n.bedF2]) path(f.frequency, stops.map(([t, e]) => [t, e.f]));
  path(n.drone.gain, stops.map(([t, e]) => [t, e.drone]));
  path(n.lap.gain, stops.map(([t, e]) => [t, e.lap]));
  path(n.lapLG.gain, stops.map(([t, e]) => [t, e.lap * 0.6]));
  for (let t = 0.5; t < end * 0.45; t += 0.8 + Math.random() * 1.2) { const f = 900 + Math.random() * 1000; voice(osc('sine', f, f, 0, t), { gain: 0.02, attack: 0.01, decay: 0.7, pan: Math.random() * 1.6 - 0.8, wet: 1, at: t }); }
  for (const t0 of [2, 9, 16, 31]) for (let i = 0; i < 3; i++) bubble(t0 + i * 0.12, 280 + Math.random() * 300, { pan: -0.3 }, 0.025);
  // a swimmer passing: its tail starts (its eyespot set it off), strokes for a few seconds, stops
  FOLEY.eye({ k: 1, pan: -0.5, t: 3 }); FOLEY.tailOn({ k: 1, pan: -0.5, t: 3.07 });
  for (let i = 0; i < 12; i++) FOLEY.swish({ k: 0.9, pan: -0.5 + i * 0.08, f: 400, t: 3.4 + i * 0.4 });
  FOLEY.tailOff({ k: 1, pan: 0.45, t: 8.4 });
  const order = [['eye', 'float'], ['sink'], ['rest'], ['eye', 'wake'], ['join'], ['latch'], ['sip'], ['sip'], ['divide'], ['feel', 'harpoon'], ['gulp'], ['spring'], ['tether'], ['burst'], ['die']];
  order.forEach((ks, i) => { const t = 10.5 + i * (end - 14) / order.length; ks.forEach((k, j) => FOLEY[k]({ k: 1, pan: i % 2 ? 0.35 : -0.35, t: t + j * 0.07, hit: true })); });
  const buf = await A.startRendering();
  A = keep.A; nodes = keep.nodes;
  return buf;
}

// the page hidden (another tab, the phone locked): the water stops; back: it goes on
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!A || !on || !A.suspend) return;
  if (document.hidden) A.suspend(); else A.resume();
});

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
