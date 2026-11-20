// 🌊 THE OCEAN, the game's second half (2026-11-19/20; the Ocean redone, step 3, from the mock-up the author approved:
// "looks good", without background shapes or a copepod, zooming out a little past the tank). Not a tab of the Lab: its
// own full screen, opening first once you follow a species there (until releases exist you pick one on its board), with
// a big button back to the Lab (which waits, frozen, as you left it).
// What it shows: the Ocean NOW, live (ocean-live.js runs last night's saved world on in a worker), every cell drawn by
// the Lab's own drawing (main.js oceanArt: exact, other players' species too) and heard through the Lab's sound
// (sound.js); on a device too slow for that, last night's recording (sim/rich.js, the cells rebuilt exactly). Scenery is
// drawing only, never in the simulation: the water by depth and hour (scene.js), the sky above the surface (stars and a
// moon at night), the night's weather from its number (clear, overcast, rain: the same for everyone), a seabed with a
// microbial mat, forams and radiolarians and the dead fading where they lay; at night blue sparks where cells bump and
// faint wakes behind swimmers; a ripple at a division, a dark cloud at a death. Your cells: a gold rim and halo.
// The HUD: the night and clock (no depths: author), weather, sound, a LIVE / "Last night" pill (tap: switch), a minimap
// (tap: look there), toasts for your moments, your badge (portrait, cells, growth, kills, nights, rank, last night in
// one line; tap: your next cell), 🧪 The Lab · 📖 Its story (its nights; the board) · 🔭 Whole / 🎯 Follow.
import { startLive } from './ocean-live.js';
import { replay } from '../sim/rich.js';
import { updatePose, motorAngle } from '../sim/physics.js';
import { PARAMS } from '../sim/params.js';
import { fullness } from '../sim/metab.js';
import { daylight, clock, lightAt } from '../sim/light.js';
import { drawWater, drawDrift, drawVignette, drawToxins, drawShade, bedZone, speciesTint, twilight, waterColor, hexRGB, rgba, mix } from './scene.js';
import { listen as soundListen, update as soundUpdate } from './sound.js';

const TW = PARAMS.tank.w, TH = PARAMS.tank.h, DT = PARAMS.time.dt, DAY = PARAMS.metab.day;
const VIS_BEATS = 2.5;            // beating parts drawn at most this many strokes a real second (as the Lab's calm drawing)
// ?ocean=<folder> reads a scratch Ocean under ocean/ (tests: tools/ocean.mjs --dir=ocean/<folder>)
const TEST = (new URLSearchParams(location.search).get('ocean') || '').replace(/[^\w-]/g, '');
// on the website the Ocean is read from its data branch (ocean-data: rewritten each night by GitHub, .github/workflows)
const DATA = 'https://raw.githubusercontent.com/vitorhugo1992/tinygod/ocean-data/ocean/';
const KEY = 'tinygod.ocean', BASE = TEST ? `../ocean/${TEST}/` : /github\.io$/.test(location.hostname) ? DATA : '../ocean/';
const GOLD = '#f2c14e';
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th');
const hash01 = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
const angDiff = (a, b) => { let d = b - a; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); return d; };
// the night's weather, from its number: the same for everyone (drawing only)
const WEATHER = { sun: '☀ Clear', cloud: '☁ Overcast', rain: '🌧 Rain' };
let forceWx = null;   // tests only (window.__ocean.wx)
const weatherOf = (n) => { if (forceWx) return forceWx; const r = hash01(n * 7919 + 13); return r < 0.5 ? 'sun' : r < 0.8 ? 'cloud' : 'rain'; };

async function fetchJSON(path) {
  const got = await fetch(BASE + path, { cache: 'no-cache' });
  if (!got.ok) throw new Error(`${path} is not there (${got.status})`);
  const buf = new Uint8Array(await got.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unpack the Ocean (too old)');
    return JSON.parse(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }
  return JSON.parse(new TextDecoder().decode(buf));   // a server that unpacked it already
}

const CSS = `
#oceanView { position: fixed; inset: 0; z-index: 900; background: #02070d; color: #dcefe8; font: 14px/1.45 system-ui, -apple-system, sans-serif; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; }
#oceanView[hidden] { display: none; }
#oceanView canvas.sea { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; }
#oceanView canvas.sea:active { cursor: grabbing; }
#oceanView button { font: 600 13px/1 system-ui, sans-serif; color: #dcefe8; background: rgba(4,18,30,.82); border: 1px solid #2a4a60; border-radius: 13px; cursor: pointer; }
#oceanView button:focus-visible { outline: 2px solid #5fd4ff; outline-offset: 2px; }
#oceanView .otop { position: absolute; left: max(12px, env(safe-area-inset-left, 0px)); right: max(12px, env(safe-area-inset-right, 0px)); top: max(12px, env(safe-area-inset-top, 0px)); display: flex; align-items: flex-start; gap: 8px; pointer-events: none; }
#oceanView .otop > * { pointer-events: auto; }
#oceanView .ttl { pointer-events: none; text-shadow: 0 1px 8px rgba(0,0,0,.7); display: grid; gap: 3px; }
#oceanView .ttl b { font: 700 19px/1 system-ui, sans-serif; letter-spacing: .01em; }
#oceanView .ttl span { font: 500 12px/1.2 ui-monospace, Menlo, Consolas, monospace; color: #9fc0ce; }
#oceanView .ttl .wx { font-family: system-ui, sans-serif; }
#oceanView .snd { width: 36px; height: 36px; border-radius: 50%; font-size: 15px; margin-top: 2px; }
#oceanView .oright { margin-left: auto; display: grid; gap: 8px; justify-items: end; }
#oceanView .pill { font: 600 10.5px/1 system-ui, sans-serif; letter-spacing: .09em; text-transform: uppercase; padding: 7px 10px 7px 9px; border-radius: 999px; display: flex; align-items: center; gap: 6px; color: #bfe9ff; }
#oceanView .pill i { width: 7px; height: 7px; border-radius: 50%; background: #5fd4ff; box-shadow: 0 0 8px #5fd4ff; animation: opulse 1.6s infinite; }
#oceanView .pill.rec { color: #ffb15c; } #oceanView .pill.rec i { background: #ffb15c; box-shadow: 0 0 8px #ffb15c; animation: none; }
#oceanView .pill.wait i { background: #8eb0bf; box-shadow: none; }
@keyframes opulse { 50% { opacity: .35; } }
#oceanView canvas.mini { width: 54px; height: 68px; border-radius: 8px; border: 1px solid #2a4a60; background: rgba(2,16,27,.8); cursor: pointer; }
#oceanView .toasts { position: absolute; left: 50%; top: calc(max(12px, env(safe-area-inset-top, 0px)) + 96px); transform: translateX(-50%); display: grid; gap: 6px; width: min(360px, calc(100% - 32px)); pointer-events: none; }
#oceanView .toast { background: rgba(4,18,30,.9); border: 1px solid #2a4a60; border-left: 3px solid ${GOLD}; padding: 8px 12px; border-radius: 10px; font: 500 13px/1.35 system-ui, sans-serif; animation: otin .35s ease both; }
#oceanView .toast.bad { border-left-color: #ff7a8a; } #oceanView .toast.out { animation: otout .5s ease both; }
@keyframes otin { from { opacity: 0; transform: translateY(-8px); } }
@keyframes otout { to { opacity: 0; transform: translateY(-6px); } }
#oceanView .obot { position: absolute; left: max(10px, env(safe-area-inset-left, 0px)); right: max(10px, env(safe-area-inset-right, 0px)); bottom: max(12px, env(safe-area-inset-bottom, 0px)); display: grid; gap: 8px; max-width: 520px; margin: 0 auto; }
#oceanView .pick { display: flex; gap: 10px; align-items: center; background: linear-gradient(180deg, rgba(10,30,46,.95), rgba(5,19,31,.95)); border: 1px solid #5f8fa8; border-radius: 16px; padding: 9px 11px; }
#oceanView .pick[hidden] { display: none; }
#oceanView .pick canvas { width: 54px; height: 54px; flex: none; border-radius: 12px; background: #031019; border: 1px solid #3c6278; }
#oceanView .pick .t { min-width: 0; flex: 1; }
#oceanView .pick b { font: 700 14px/1.2 system-ui, sans-serif; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#oceanView .pick .who { font: 500 11px/1.3 system-ui, sans-serif; color: #8eb0bf; }
#oceanView .pick .st { font: 500 12px/1.4 system-ui, sans-serif; color: #d6e6ee; font-variant-numeric: tabular-nums; margin-top: 2px; }
#oceanView .pick .x { flex: none; align-self: flex-start; padding: 2px 8px; }
#oceanView .badge { display: flex; gap: 10px; align-items: center; background: linear-gradient(180deg, rgba(7,26,41,.92), rgba(4,17,28,.92)); border: 1px solid #2a4a60; border-radius: 16px; padding: 9px 11px; cursor: pointer; }
#oceanView .badge canvas { width: 46px; height: 46px; flex: none; border-radius: 12px; background: #031019; border: 1px solid rgba(242,193,78,.35); }
#oceanView .badge .t { min-width: 0; flex: 1; }
#oceanView .badge b { font: 700 15px/1.15 system-ui, sans-serif; color: ${GOLD}; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#oceanView .badge .st { font: 500 11.5px/1.4 system-ui, sans-serif; color: #8eb0bf; font-variant-numeric: tabular-nums; }
#oceanView .badge .ln { font-size: 12px; line-height: 1.35; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
#oceanView .badge .rk { flex: none; text-align: center; font: 700 22px/1 system-ui, sans-serif; }
#oceanView .badge .rk small { display: block; font: 500 9.5px/1.2 system-ui, sans-serif; color: #8eb0bf; letter-spacing: .08em; text-transform: uppercase; margin-top: 3px; }
#oceanView .row { display: flex; gap: 8px; }
#oceanView .row button { flex: 1; padding: 11px 8px; display: flex; gap: 6px; align-items: center; justify-content: center; }
#oceanView .row .lab { flex: 1.35; font-size: 14px; background: linear-gradient(180deg, #164a3e, #0e3329); border-color: #2f7a63; }
#oceanView .sheet { position: absolute; left: 0; right: 0; bottom: 0; height: min(74%, 640px); max-width: 560px; margin: 0 auto; background: linear-gradient(180deg, rgba(8,27,43,.97), rgba(5,15,25,.98)); border: 1px solid #2a4a60; border-bottom: 0; border-radius: 22px 22px 0 0; transform: translateY(102%); transition: transform .4s cubic-bezier(.2,.8,.2,1); display: flex; flex-direction: column; touch-action: pan-y; }
#oceanView .sheet.on { transform: none; }
#oceanView .sheet .grab { width: 40px; height: 4px; border-radius: 4px; background: #3a5a70; margin: 9px auto 4px; flex: none; }
#oceanView .sheet header { padding: 4px 16px 8px; display: flex; align-items: center; gap: 8px; flex: none; }
#oceanView .sheet h2 { font: 700 18px/1.15 system-ui, sans-serif; text-transform: none; letter-spacing: 0; color: #dcefe8; padding: 0; border: 0; margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#oceanView .sheet header button { margin-left: auto; padding: 7px 12px; border-radius: 999px; }
#oceanView .tabs { display: flex; gap: 6px; padding: 0 16px 8px; flex: none; }
#oceanView .tabs button { padding: 7px 12px; border-radius: 999px; }
#oceanView .tabs button.on { background: #12405a; border-color: #5fd4ff; }
#oceanView .scroll { overflow-y: auto; padding: 0 16px 24px; flex: 1; min-height: 0; }
#oceanView .nightrow { display: grid; grid-template-columns: 46px 1fr; gap: 10px; padding: 10px 4px; border-top: 1px solid rgba(22,48,66,.7); cursor: pointer; border-radius: 8px; }
#oceanView .nightrow:hover { background: #0d2333; }
#oceanView .nightrow .n { font: 500 11px/1.3 ui-monospace, Menlo, monospace; color: #8eb0bf; }
#oceanView .nightrow .n b { display: block; font: 700 18px/1 system-ui, sans-serif; color: #dcefe8; }
#oceanView .nightrow p { margin: 0; font-size: 13px; }
#oceanView .lostH { margin: 14px 4px 4px; font: 800 12px/1 system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #ff6b7a; }
#oceanView .lost { padding: 8px 10px; margin: 4px 0; border-radius: 10px; background: linear-gradient(90deg, rgba(120,16,30,.55), rgba(60,10,18,.3)); border: 1px solid #8a2a36; color: #ffc4cb; font-size: 13px; }
#oceanView .lost b { color: #ff8a96; } #oceanView .lost span { display: block; font-size: 11.5px; color: #d99aa3; margin-top: 2px; }
#oceanView .extinct { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; pointer-events: none; background: radial-gradient(70% 50% at 50% 45%, rgba(90,0,12,.55), rgba(10,0,4,.75)); animation: tgxin 5.5s ease forwards; }
#oceanView .extinct div { text-align: center; color: #ff4d5e; font: 900 clamp(28px, 9vw, 52px)/1.05 system-ui, sans-serif; letter-spacing: .04em; text-shadow: 0 0 24px rgba(255,40,60,.75), 0 0 3px #000; animation: tgxpulse 1.6s ease-in-out 3; }
#oceanView .extinct small { display: block; margin-top: 10px; font: 600 13px/1.4 system-ui, sans-serif; color: #ffb3bb; letter-spacing: .02em; text-shadow: none; }
@keyframes tgxin { 0% { opacity: 0; } 10% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes tgxpulse { 50% { transform: scale(1.06); text-shadow: 0 0 44px rgba(255,40,60,1), 0 0 3px #000; } }
#oceanView .nightrow .n .rk { display: block; margin-top: 4px; color: ${GOLD}; font-weight: 700; }
#oceanView .ms[data-t] { cursor: pointer; }
#oceanView .ms { display: inline-flex; align-items: center; gap: 4px; font: 600 10.5px/1 system-ui, sans-serif; padding: 4px 7px; border-radius: 999px; margin: 5px 4px 0 0; background: #14324a; color: #bfe3f5; }
#oceanView .ms.gold { background: #3a2f12; color: ${GOLD}; } #oceanView .ms.red { background: #3a1820; color: #ff9aa8; }
#oceanView .brow { display: grid; grid-template-columns: 24px 40px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 7px 8px; border-radius: 12px; border: 1px solid transparent; cursor: pointer; margin-top: 4px; background: rgba(255,255,255,.03); }
#oceanView .brow.mine { border-color: ${GOLD}; background: linear-gradient(90deg, rgba(242,193,78,.13), rgba(255,255,255,.03) 60%); }
#oceanView .brow .pos { font: 700 16px/1 system-ui, sans-serif; text-align: center; color: #8eb0bf; }
#oceanView .brow canvas { width: 40px; height: 40px; border-radius: 9px; background: #031019; }
#oceanView .brow .nm { min-width: 0; display: grid; gap: 3px; } #oceanView .brow .nm b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#oceanView .brow .nm span { font-size: 11px; color: #8eb0bf; }
#oceanView .brow .gb { height: 5px; border-radius: 3px; background: rgba(142,176,191,.18); overflow: hidden; } #oceanView .brow .gb i { display: block; height: 100%; border-radius: 3px; }
#oceanView .brow .sc { text-align: right; font: 700 15px/1 system-ui, sans-serif; font-variant-numeric: tabular-nums; } #oceanView .brow .sc small { display: block; font-size: 10px; color: #8eb0bf; font-weight: 500; margin-top: 2px; }
#oceanView .note { font-size: 12px; color: #8eb0bf; margin: 12px 4px 0; }
#oceanView .msg { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 24px; color: #9fc0ce; pointer-events: none; }
#oceanView .msg div { max-width: 34ch; } #oceanView .msg b { display: block; font-size: 18px; color: #dcefe8; margin-bottom: 6px; }
@media (prefers-reduced-motion: reduce) { #oceanView .sheet, #oceanView .toast { transition: none; animation: none; } #oceanView .pill i { animation: none; } }`;

const HTML = `<canvas class="sea" aria-label="The Ocean: drag to look around, pinch or scroll to zoom, double-tap to zoom in"></canvas>
  <div class="msg" hidden><div></div></div>
  <div class="otop">
    <div class="ttl"><b class="nt">The Ocean</b><span class="ck"></span><span class="wx"></span></div>
    <button class="snd" type="button" title="Sound: the water where you look and what happens in it">🔇</button>
    <div class="oright"><button class="pill wait" type="button" title="Live: the Ocean running on now. Tap to watch last night's recording instead"><i></i><span>Loading</span></button>
      <canvas class="mini" width="108" height="136" title="The whole Ocean: tap to look there"></canvas></div>
  </div>
  <div class="toasts" aria-live="polite"></div>
  <div class="obot">
    <div class="pick" hidden><canvas width="108" height="108"></canvas><div class="t"><b></b><div class="who"></div><div class="st"></div></div><button class="x" type="button" title="Close">✕</button></div>
    <div class="badge" title="Follow your next cell"><canvas width="92" height="92"></canvas>
      <div class="t"><b></b><div class="st"></div><div class="ln"></div></div><div class="rk"></div></div>
    <div class="row"><button class="lab" type="button" title="Back to the Lab: build, test, missions, matches">🧪 The Lab</button>
      <button class="story" type="button">📖 Its story</button><button class="cam" type="button">🔭 Whole</button></div>
  </div>
  <div class="sheet" aria-label="Its story and the board"><div class="grab"></div>
    <header><h2></h2><button class="close" type="button">Close</button></header>
    <div class="tabs"><button type="button" data-tab="story" class="on">Its nights</button><button type="button" data-tab="board">The board</button></div>
    <div class="scroll"></div></div>`;

export function initOcean(art) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div');
  el.id = 'oceanView'; el.hidden = true; el.innerHTML = HTML;
  document.body.appendChild(el);
  const q = (s) => el.querySelector(s);
  const cv = q('canvas.sea'), g = cv.getContext('2d'), mini = q('canvas.mini');
  let saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } })();
  const remember = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* private mode */ } };

  // ---- the state ----
  let open = false, raf = 0, W = 1, H = 1, dpr = 1, lastT = 0;
  let board = null, story = null, nights = {}, follow = saved.follow || null;
  let mode = 'loading';            // 'loading' | 'live' | 'rec' | 'none'
  let live = null, slow = false;   // slow: this device can't keep the live Ocean going at half speed
  let F = { cur: null, prev: null, dt: 125 };   // the live frames: the last two from the worker
  let rec = null;                  // { n, R, rp, steps, w }: a night's recording being played
  const richOf = {};               // night -> its rich record (or null when there is none)
  const designs = new Map();       // species -> one design object (the Lab's drawing caches by design)
  const vis = new Map();           // uid -> { clocks (motors drawn calm), gapes, meal, mealSeen, mealT0, trail }
  let shown = null;                // the world-like object last drawn (cells posed for drawing)
  let soundKey = {};
  const cam = { x: TW / 2, y: TH / 2, s: 1, tx: TW / 2, ty: TH / 2, ts: 1, follow: 0 };
  let fx = [], corpses = [], known = null, primed = false, recEv = 0, touching = new Set();
  const minS = () => 0.85 * Math.min(W / TW, H / (TH + 160));
  const maxS = 14;

  // ---- data: the board, the nights' records, the nights' rich recordings ----
  // yours: the species released under your GitHub name (release.js asks it once); a release not yet arrived waits
  const PLAYER = (() => { try { return (localStorage.getItem('tinygod.player') || '').toLowerCase(); } catch (e) { return ''; } })();
  let waiting = (() => { try { return JSON.parse(localStorage.getItem('tinygod.release') || 'null'); } catch (e) { return null; } })();
  function whoIsMine() {
    if (!board || !PLAYER) return;
    const own = (r) => !r.house && String(r.player).toLowerCase() === PLAYER;
    const mine = board.rows.find(own) || (board.lost || []).filter(own).pop();   // living, else the last one lost
    if (waiting && board.rows.some((r) => r.name === waiting.name || (r.name.startsWith(waiting.name) && String(r.player).toLowerCase() === PLAYER))) {
      waiting = null; try { localStorage.removeItem('tinygod.release'); } catch (e) { /* fine */ }
    }
    if (mine && !waiting) { follow = mine.name; saved.follow = follow; remember(); }
  }
  async function loadBoard() {
    board = await fetchJSON('board.json');
    whoIsMine();
    if (!follow || !(rowOf(follow) || lostOf(follow))) follow = board.rows.length ? board.rows[0].name : null;
  }
  const rowOf = (sp) => board && board.rows.find((r) => r.name === sp);
  const lostOf = (sp) => board && (board.lost || []).find((r) => r.name === sp);
  // the life stories (tools/ocean-story.mjs): a line and milestones a night for every species
  async function loadStory() { try { story = await fetchJSON('story.json'); } catch (e) { story = null; } }
  const storyOf = (sp, n) => (story && story.species[sp] ? story.species[sp].find((r) => r.night === n) : null);
  // last night's milestones for the species you follow, once each morning (the reason to come back)
  function extinctBanner(name) {
    const b = document.createElement('div'); b.className = 'extinct';
    b.innerHTML = `<div>${esc(name)} extinct<small>wiped out three times: it is gone from the Ocean for good</small></div>`;
    el.appendChild(b); setTimeout(() => b.remove(), 5600);
  }
  function morning() {
    if (!board || !story || !follow || saved.seen === board.night) return;
    const r = storyOf(follow, board.night);
    saved.seen = board.night; remember();
    if (!r) return;
    if (r.ms.some((m) => m.k === 'extinct')) { setTimeout(() => extinctBanner(follow), 900); return; }
    const ms = r.ms.filter((m) => m.tone).slice(0, 3);
    ms.forEach((m, i) => setTimeout(() => toast(`Last night: ${m.tone === 'gold' ? '★' : '✕'} ${m.text}`, m.tone === 'red'), 1200 + i * 1600));
  }
  // a milestone replayed: the night's recording from a little before its moment, the camera on the cell if known
  async function replayMoment(n, t, uid) {
    if (!(await playNight(n))) return;
    rec.steps = rec.rp.from + Math.max(0, t - 0.01) * (rec.rp.to - rec.rp.from); primed = false;
    recEv = (rec.steps - rec.rp.from) * DT / DAY;   // the moments before it are not toasted again
    if (uid) { cam.follow = uid; cam.ts = clamp(Math.min(W, H) / 260, minS(), maxS); camButton(); }
  }
  async function loadNight(n) {
    if (n in nights) return nights[n];
    try {
      const r = await fetchJSON(`nights/${n}.json.gz`), f = r.from || 0;
      r.events.forEach((x) => { x.day = Math.max(0, (x.day ?? 0) - f); });
      nights[n] = r;
    } catch (e) { nights[n] = null; }
    return nights[n];
  }
  async function loadRich(n) {
    if (n in richOf) return richOf[n];
    try { richOf[n] = await fetchJSON(`nights/${n}.rich.json.gz`); } catch (e) { richOf[n] = null; }
    return richOf[n];
  }

  // ---- words: a night in one line for the followed species ----
  function nightLine(N, sp, short) {
    if (!N || !sp) return '';
    const ev = N.events, born = ev.filter((e) => e.kind === 'born' && e.species === sp).length;
    const kills = ev.filter((e) => e.kind === 'died' && e.by === sp && e.species !== sp);
    const lost = ev.filter((e) => e.kind === 'died' && e.species === sp);
    const was = (N.life && N.life[0] && N.life[0].s[sp] && N.life[0].s[sp].n) || 0;
    const end = N.life && N.life.length ? (N.life[N.life.length - 1].s[sp] || { n: 0 }).n : was;
    const arrived = ev.some((e) => e.kind === 'arrived' && e.species === sp);
    const bits = [];
    if (arrived) bits.push(`arrived as ${was} cells`);
    bits.push(end > was ? `grew from ${was} cells to ${end}` : end === was ? `held its ${was} cells` : end ? `fell from ${was} cells to ${end}` : 'all its cells died');
    if (kills.length) bits.push(kills.map((k) => `${/^drained/.test(k.why) ? 'drained' : /^eaten|swallow/.test(k.why) ? 'swallowed' : 'killed'} a ${k.species}`).join(', '));
    if (lost.length) bits.push(`lost ${lost.length} (${[...new Set(lost.map((d) => d.why))].join(', ')})`);
    if (!born && !kills.length && !lost.length && end && !short) bits.push('a quiet night');
    const s = bits.join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }
  function milestones(N, sp) {
    if (!N || !sp) return [];
    const out = [], ev = N.events;
    if (ev.some((e) => e.kind === 'arrived' && e.species === sp)) out.push([ev.find((e) => e.kind === 'arrived' && e.species === sp).returned ? 'Back in the Ocean' : 'Arrived', '']);
    const born = ev.filter((e) => e.kind === 'born' && e.species === sp).length;
    if (born) out.push([`${born} division${born > 1 ? 's' : ''}`, 'gold']);
    const kills = ev.filter((e) => e.kind === 'died' && e.by === sp && e.species !== sp).length;
    if (kills) out.push([`${kills} kill${kills > 1 ? 's' : ''}`, 'gold']);
    const lost = ev.filter((e) => e.kind === 'died' && e.species === sp).length;
    if (lost) out.push([`${lost} lost`, 'red']);
    return out;
  }

  // ---- the live Ocean ----
  function startLiveOcean() {
    if (live) return;
    live = startLive({
      url: BASE + 'world.json.gz',
      onState(s, info) {
        if (s === 'live') { if (mode === 'loading') setMode('live'); else if (slow) { slow = false; if (mode === 'live') setMode('live'); } }   // a new speed judges afresh
        else if (s === 'slow') { slow = true; fallBack(`too slow here (${info.why || 'under half speed'})`); }
        else if (s === 'error') fallBack(info.message || 'the live Ocean could not start', true);
      },
      onFrame(w, info, smooth) {
        for (const c of w.cells) {   // one design object per species (the drawing's caches go by it)
          const d = designs.get(c.species);
          if (d) c.design = d; else designs.set(c.species, c.design);
          const m = vis.get(c.uid);   // a meal keeps being the same meal (its swallowing is drawn over real time)
          if (m && m.meal && c.meal && m.meal.look && c.meal.look && m.meal.look.uid === c.meal.look.uid) { m.meal.t = c.meal.t; c.meal = m.meal; }
          else if (m) m.meal = c.meal;
        }
        const sm = new Map();
        for (let i = 0; i + 3 < (smooth || []).length; i += 4) sm.set(smooth[i], [smooth[i + 1], smooth[i + 2], smooth[i + 3]]);
        const now = performance.now();
        F.prev = F.cur; F.cur = { w, at: now, sm };
        F.dt = F.prev ? clamp(now - F.prev.at, 60, 400) : 125;
        if (mode === 'loading' || mode === 'none') { setMode('live'); message(null); }   // (a late start: it came after all)
        if (mode === 'live') { observe(w); soundListen(w, soundKey); }
      },
    });
  }
  async function fallBack(why, fatal) {
    if (mode === 'rec') return;
    const n = board && board.night;
    const R = n ? await loadRich(n) : null;
    if (R) { playNight(n); toast(`Playing last night's recording: the live Ocean is ${why}.`); }
    else if (fatal || !F.cur) { setMode('none'); message('The Ocean can\'t be shown here', why); }
    else setMode('live');   // too slow, and no recording to fall back on: it stays live, slowly
  }
  function setMode(m) {
    mode = m; primed = false; known = null; fx = []; soundKey = {};
    for (const v of vis.values()) v.trail = [];
    const pill = q('.pill'), label = pill.querySelector('span');
    pill.classList.toggle('rec', m === 'rec'); pill.classList.toggle('wait', m === 'loading' || m === 'none');
    label.textContent = m === 'rec' ? (rec && board && rec.n === board.night ? 'Last night' : `Night ${rec ? rec.n : ''}`) : m === 'live' ? (slow ? 'Live · slow' : 'Live') : m === 'none' ? 'Offline' : 'Loading';
    pill.title = m === 'rec' ? 'A recording of the night. Tap to go back to the live Ocean' : 'Live: the Ocean running on now (tonight\'s run makes it official). Tap to watch last night\'s recording instead';
    if (m === 'live' && live) live.resume();
    if (m === 'rec' && live) live.pause();
    hud(true);
  }
  async function playNight(n) {
    const R = await loadRich(n);
    if (!R) { toast(`Night ${n} has no recording.`, true); return false; }
    const rp = replay(R);
    rec = { n, R, rp, steps: rp.from, w: null }; recEv = 0; corpses = [];
    await loadNight(n);
    message(null);
    setMode('rec');
    return true;
  }

  // ---- what happened since the last look: divisions, deaths, kills by yours; the dead left on the seabed ----
  function observe(w) {
    const now = new Map();
    for (const c of w.cells) now.set(c.uid, c);
    if (!primed) { known = new Map(); for (const c of w.cells) known.set(c.uid, mark(c)); primed = true; touching = new Set(); return; }
    for (const c of w.cells) {
      const k = known.get(c.uid), mine = c.species === follow;
      if (!k) {   // new since the last look: a daughter
        fx.push({ k: 'ripple', x: c.q[0], y: c.q[1], t: 0, gold: mine, tint: speciesTint(c.species) });
        if (mine && mode === 'live') toast(`Your ${c.species} divided: ${count(w, c.species)} cells now.`);
      } else if (c.dead && !k.dead) {
        fx.push({ k: 'cloud', x: c.q[0], y: c.q[1], t: 0 });
        if (mode === 'live') {
          const why = c.diedWhy || 'died';
          if (mine) toast(`One of your ${c.species} died: ${why}.`, true);
          else if (follow && why.includes(follow)) toast(`★ Your ${follow} ${/^drained/.test(why) ? 'drained' : /^eaten|swallow/.test(why) ? 'swallowed' : 'killed'} a ${c.species}!`);
        }
      }
      known.set(c.uid, mark(c));
    }
    for (const [uid, k] of known) if (!now.has(uid)) {   // gone: lying on the floor, it leaves a fading trace there
      if (k.y < 60) corpses.push({ x: k.x, a: k.a, r: k.r, L: k.L, tint: speciesTint(k.species), t: 0 });
      known.delete(uid);
    }
    if (corpses.length > 40) corpses.splice(0, corpses.length - 40);
    // night: a blue spark where two cells bump into each other (bioluminescence, drawing only): only as they first
    // touch, and not cells joined by a pad, a tube or a line (a chain would glow all night)
    const night = daylight(w) < 0.05, near = new Set();
    if (w.cells.length < 400) {
      const joined = new Set((w.links || []).map((l) => `${Math.min(l.a, l.b)}:${Math.max(l.a, l.b)}`));
      for (let i = 0; i < w.cells.length; i++) for (let j = i + 1; j < w.cells.length; j++) {
        const A = w.cells[i], B = w.cells[j];
        if (A.dead || B.dead || joined.has(`${i}:${j}`)) continue;
        if (Math.hypot(A.q[0] - B.q[0], A.q[1] - B.q[1]) > A.pieces[0].a + B.pieces[0].a + (A.pieces[0].L + B.pieces[0].L) / 2 + 3) continue;
        const key = A.uid < B.uid ? `${A.uid}:${B.uid}` : `${B.uid}:${A.uid}`;
        near.add(key);
        if (night && !touching.has(key)) fx.push({ k: 'spark', x: (A.q[0] + B.q[0]) / 2, y: (A.q[1] + B.q[1]) / 2, t: 0 });
      }
    }
    touching = near;
  }
  const mark = (c) => ({ dead: !!c.dead, species: c.species, x: c.q[0], y: c.q[1], a: c.q[2], r: c.pieces[0].a, L: c.pieces[0].L });
  const count = (w, sp) => w.cells.filter((c) => c.species === sp && !c.dead).length;
  // a recording's moments for the followed species, as the replay passes them (from the night's record)
  function recMoments(day) {
    const N = rec && nights[rec.n];
    if (!N || !follow) return;
    const xs = storyOf(follow, rec.n), span = (N.to - N.from) || 1;   // its extinction, when the replay reaches it
    if (xs) for (const m of xs.ms) if (m.k === 'extinct' && m.t * span > recEv && m.t * span <= day) extinctBanner(follow);
    for (const e of N.events) {
      if (e.day <= recEv || e.day > day) continue;
      const sp = follow;
      if (e.kind === 'born' && e.species === sp) toast(`Your ${sp} divided: ${e.cells} cells.`);
      else if (e.kind === 'died' && e.species === sp) toast(`One of your ${sp} died: ${e.why}.`, true);
      else if (e.kind === 'died' && e.by === sp) toast(`★ Your ${sp} ${/^drained/.test(e.why) ? 'drained' : 'killed'} a ${e.species}!`);
      else if (e.kind === 'latched' && e.species === sp) toast(`Your ${sp} hooked a ${e.prey}.`);
      else if (e.kind === 'swallowed' && e.species === sp) toast(`Your ${sp} swallowed a ${e.prey}!`);
    }
    recEv = day;
  }

  // ---- posing: the cells as drawn this frame (eased between the worker's frames; beating parts drawn calm) ----
  function visOf(uid) { let v = vis.get(uid); if (!v) { v = { clocks: [], gapes: [], trail: [] }; vis.set(uid, v); } return v; }
  function calmMotors(c, d, v, dt) {
    c.joints.forEach((j, i) => {
      if (j.type !== 'motor' || 3 + i >= d.q.length) return;
      if (v.clocks[i] === undefined) v.clocks[i] = j.clock || 0;
      if (j.on) v.clocks[i] += dt * Math.min(1, VIS_BEATS / Math.max(j.rate || 1, 1e-6));
      d.q[3 + i] = motorAngle(j, v.clocks[i]);
    });
  }
  function posedLive(now, dt) {
    const C = F.cur, P = F.prev, u = P ? clamp((now - C.at) / F.dt, 0, 1) : 1;
    const prevCells = P ? new Map(P.w.cells.map((c) => [c.uid, c])) : null;
    const cells = [];
    for (const c of C.w.cells) {
      const v = visOf(c.uid), b = C.sm.get(c.uid) || [c.q[0], c.q[1], c.q[2]], a = (P && P.sm.get(c.uid)) || b;
      const q = Float64Array.from(c.q);
      q[0] = a[0] + (b[0] - a[0]) * u; q[1] = a[1] + (b[1] - a[1]) * u; q[2] = a[2] + angDiff(a[2], b[2]) * u;
      const pc = prevCells && prevCells.get(c.uid);
      if (pc && pc.q.length === q.length) for (let i = 3; i < q.length; i++) q[i] = pc.q[i] + (c.q[i] - pc.q[i]) * u;
      const d = Object.assign({}, c, { q, phi: new Float64Array(c.phi), cs: new Float64Array(c.cs), sn: new Float64Array(c.sn),
        cx: new Float64Array(c.cx), cy: new Float64Array(c.cy), jx: new Float64Array(c.jx), jy: new Float64Array(c.jy) });
      calmMotors(c, d, v, dt);
      d.gapes = v.gapes; d.mealSeen = v.mealSeen; d.mealT0 = v.mealT0;
      updatePose(d);
      cells.push(d);
    }
    const links = C.w.links || [];
    return Object.assign({}, C.w, { cells, links });
  }
  function posedRec(dt) {
    const rp = rec.rp;
    rec.steps += dt / DT;
    if (rec.steps > rp.to) { rec.steps = rp.from; primed = false; recEv = 0; corpses = []; }
    const w = rp.at(rec.steps);
    if (!w) return null;
    for (const c of w.cells) {
      const v = visOf(c.uid);
      calmMotors(c, c, v, dt);
      c.gapes = v.gapes;
      if (c.meal && v.meal && v.meal.look && c.meal.look && v.meal.look.uid === c.meal.look.uid) { v.meal.t = c.meal.t; c.meal = v.meal; } else v.meal = c.meal;
      c.mealSeen = v.mealSeen; c.mealT0 = v.mealT0;
      updatePose(c);
    }
    rec.w = w;
    return w;
  }
  const keepVis = (w) => { for (const c of w.cells) { const v = vis.get(c.uid); if (v) { v.mealSeen = c.mealSeen; v.mealT0 = c.mealT0; } } };

  // ---- the camera: drag pans, two fingers pinch, the wheel zooms, a double-tap zooms in (or back out) ----
  let hudH = 160;   // px the bottom HUD covers (measured on resize)
  function clampCam() {
    cam.ts = clamp(cam.ts, minS(), maxS);
    const hw = W / 2 / cam.ts, hh = H / 2 / cam.ts, below = 70 + (hudH + 140) / cam.ts;   // the seabed can come up above the HUD, its sediment showing   // the seabed can come up above the HUD
    cam.tx = 2 * hw >= TW + 160 ? TW / 2 : clamp(cam.tx, hw - 80, TW - hw + 80);
    cam.ty = 2 * hh >= TH + 130 + below ? (TH + 130 - below) / 2 : clamp(cam.ty, hh - below, TH + 130 - hh);
  }
  const mineOf = (w) => (w ? w.cells.filter((c) => c.species === follow && !c.dead) : []);
  function followNext(close) {
    const ys = mineOf(shown);
    if (!ys.length) { toast(follow ? `No ${follow} alive in the Ocean now.` : 'Pick a species on the board.', true); return; }
    const i = ys.findIndex((c) => c.uid === cam.follow);
    cam.follow = ys[(i + 1) % ys.length].uid;
    if (close || cam.ts < Math.min(W, H) / 400) cam.ts = clamp(Math.min(W, H) / 260, minS(), maxS);
    camButton();
  }
  const camButton = () => { q('.cam').textContent = cam.follow ? '🔭 Whole' : '🎯 Follow'; };
  // the whole Ocean: the tank fitted between the top of the screen and the HUD
  function whole() {
    cam.follow = 0; cam.ts = clamp(Math.min((W - 24) / TW, (H - hudH - 90) / (TH + 40)), minS(), maxS);
    cam.tx = TW / 2; cam.ty = TH / 2 - (hudH - 70) / 2 / cam.ts; clampCam(); camButton();
  }
  function zoomAt(px, py, f) {
    const wx = cam.x + (px - W / 2) / cam.s, wy = cam.y - (py - H / 2) / cam.s;
    cam.ts = clamp(cam.ts * f, minS(), maxS);
    if (!cam.follow) { cam.tx = wx - (px - W / 2) / cam.ts; cam.ty = wy + (py - H / 2) / cam.ts; cam.x = cam.tx; cam.y = cam.ty; }
    cam.s = cam.ts;   // at once: a zoom that eases in reads as "it didn't work"
    clampCam();
  }
  const pts = new Map();
  let pinch = null, moved = 0, lastTap = 0;
  cv.addEventListener('pointerdown', (e) => {
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (pts.size === 2) { const [a, b] = [...pts.values()], r = cv.getBoundingClientRect(); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: cam.ts, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top }; }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()], f = pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.d / cam.ts;
      zoomAt(pinch.mx, pinch.my, f); moved += 10; return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 6 && cam.follow) { cam.follow = 0; camButton(); }
    if (moved > 6) { cam.tx -= dx / cam.s; cam.ty += dy / cam.s; cam.x = cam.tx; cam.y = cam.ty; clampCam(); }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (e.type === 'pointerup' && moved < 6 && pts.size === 0) {
      const now = performance.now(), r = cv.getBoundingClientRect();
      const hitUid = cellAt(e.clientX - r.left, e.clientY - r.top);
      if (hitUid) { pickCell(hitUid); lastTap = 0; return; }
      if (pick) { pickCell(0); }
      if (now - lastTap < 320) { zoomAt(e.clientX - r.left, e.clientY - r.top, cam.ts > Math.min(W, H) / 160 ? 1 / 3 : 2.2); lastTap = 0; } else lastTap = now;
    }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-clamp(e.deltaY, -200, 200) * 0.0018)); }, { passive: false });
  mini.addEventListener('click', (e) => {
    const r = mini.getBoundingClientRect();
    cam.follow = 0; cam.tx = (e.clientX - r.left) / r.width * TW; cam.ty = TH * (1 - (e.clientY - r.top) / r.height);
    if (cam.ts < W / 600) cam.ts = clamp(W / 400, minS(), maxS);
    clampCam(); cam.x = cam.tx; cam.y = cam.ty; camButton();
  });

  // ---- a tapped cell: the camera follows it and a card says what it is and how it is doing (any species: what is
  // public on the board and in the water; never its design or rules) ----
  let pick = 0, pickKey = '';
  function cellAt(px, py) {
    if (!shown) return 0;
    let best = 0, bd = Infinity;
    for (const c of shown.cells) {
      if (c.dead) continue;
      const dx = W / 2 + (c.q[0] - cam.x) * cam.s - px, dy = H / 2 - (c.q[1] - cam.y) * cam.s - py, d = Math.hypot(dx, dy);
      const reach = Math.max(24, (c.pieces[0].a + c.pieces[0].L / 2) * cam.s + 8);
      if (d < reach && d < bd) { bd = d; best = c.uid; }
    }
    return best;
  }
  function pickCell(uid) {
    pick = uid; pickKey = '';
    q('.pick').hidden = !uid;
    if (uid) { cam.follow = uid; if (cam.ts < Math.min(W, H) / 400) cam.ts = clamp(Math.min(W, H) / 260, minS(), maxS); camButton(); }
    setTimeout(() => { hudH = (q('.obot').offsetHeight || 140) + 16; }, 0);
    pickCard();
  }
  function pickCard() {
    if (!pick || !shown) return;
    const c = shown.cells.find((x) => x.uid === pick);
    if (!c) { q('.pick .st').textContent = 'Gone from the water.'; return; }
    const r = rowOf(c.species), mine = c.species === follow;
    const states = [];
    if (c.dead) states.push('dead');
    else {
      if (c.metab && c.metab.starving) states.push('starving');
      if (c.resting) states.push('resting');
      if (c.stunT > 0) states.push('stunned');
      if ((c.feeders || []).some((f) => f.link)) states.push('feeding through its tube');
      const i = shown.cells.indexOf(c);
      if ((shown.links || []).some((l) => l.feed && l.b === i)) states.push('being drained');
      if (c.meal) states.push('digesting a meal');
      if (c.neighbours) states.push(`joined to ${c.neighbours}`);
      if (c.metab && c.metab.fixing) states.push('fixing nitrogen');
      if (!states.length) states.push(c.joints && c.joints.some((j) => j.type === 'motor' && j.on && !j.burst) ? 'swimming' : 'drifting');
    }
    let energy = '';
    if (c.metab && c.metab.C) energy = ` · energy ${Math.round(100 * Math.min(1, fullness(c)))}%`;
    const key = `${pick}|${states.join()}|${energy}|${(c.size || 1).toFixed(1)}|${r && r.rank}`;
    if (key === pickKey) return;
    pickKey = key;
    q('.pick b').textContent = c.species;
    q('.pick b').style.color = mine ? GOLD : speciesTint(c.species);
    q('.pick .who').textContent = `${mine ? 'yours · ' : ''}${r ? (r.house ? 'house species' : r.player) + ` · ${ord(r.rank)} of ${board.rows.length} · ${count(shown, c.species)} cells · growth ${r.score.toFixed(2)}×` : ''}`;
    q('.pick .st').textContent = `${states.join(', ').replace(/^./, (ch) => ch.toUpperCase())} · ${(c.size || 1).toFixed(1)}× its newborn size${energy}${c.gen ? ` · generation ${c.gen + 1}` : ''}`;
    portrait(q('.pick canvas'), c.species, mine, c.uid);
  }
  // the ring round a tapped cell
  function drawPick(w, v) {
    if (!pick) return;
    const c = w.cells.find((x) => x.uid === pick); if (!c) return;
    const R = (c.pieces[0].a + c.pieces[0].L / 2) * v.s + 10, x = v.X(c.q[0]), y = v.Y(c.q[1]);
    g.save(); g.strokeStyle = 'rgba(230,244,250,.8)'; g.lineWidth = 1.5; g.setLineDash([5, 5]); g.lineDashOffset = -performance.now() / 60;
    g.beginPath(); g.arc(x, y, R, 0, 7); g.stroke(); g.restore();
  }
  q('.pick .x').onclick = () => pickCell(0);
  // ---- the HUD ----
  function toast(text, bad) {
    const box = q('.toasts'), t = document.createElement('div');
    t.className = `toast${bad ? ' bad' : ''}`; t.textContent = text;
    box.prepend(t);
    while (box.children.length > 2) box.lastChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, 4200);
  }
  function message(title, text) {
    const m = q('.msg');
    m.hidden = !title;
    if (title) m.firstElementChild.innerHTML = `<b>${esc(title)}</b>${esc(text || '')}`;
  }
  const nightNo = () => (mode === 'rec' && rec ? rec.n : board ? board.night + 1 : 1);
  let hudAt = 0, badgeKey = '';
  function hud(force) {
    const now = performance.now();
    if (!force && now - hudAt < 400) return;
    hudAt = now;
    const w = shown;
    q('.nt').textContent = `Night ${nightNo()}`;
    pickCard();
    if (w) { const h = clock(w); q('.ck').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor(60 * (h % 1))).padStart(2, '0')}`; }
    q('.wx').textContent = WEATHER[weatherOf(nightNo())];
    q('.snd').textContent = art.soundOn() ? '🔊' : '🔇';
    drawMini();
    const r = rowOf(follow), n = w ? count(w, follow) : r ? r.cells : 0;
    const N = board && nights[board.night];
    const key = `${follow}|${n}|${r && r.rank}|${!!N}|${w ? w.cells.find((c) => c.species === follow) ? 1 : 0 : 0}`;
    if (key === badgeKey && !force) return;
    badgeKey = key;
    q('.badge b').textContent = follow || 'No species yet';
    const L = lostOf(follow);
    if (L && !waiting) {   // extinct: gone for good
      q('.badge .st').innerHTML = `<span style="color:#ff6b7a;font-weight:700">Extinct</span> on night ${L.night} · wiped out ${L.times.length} times`;
      q('.badge .ln').textContent = 'Release a new version from the Lab: it can go out at once.';
      q('.badge .rk').innerHTML = '';
      portrait(q('.badge canvas'), follow, true);
      return;
    }
    if (waiting) {   // your release, not here yet
      q('.badge b').textContent = waiting.name;
      q('.badge .st').textContent = `Waiting at the surface: arrives at night ${board ? board.night + 1 : 'next'}`;
      q('.badge .ln').textContent = follow ? `Meanwhile you are watching ${follow}.` : '';
      q('.badge .rk').innerHTML = '';
      return;
    }
    q('.badge .st').textContent = r ? `${n} cell${n === 1 ? '' : 's'} · growth ${r.score.toFixed(2)}× · ${r.kills} kill${r.kills === 1 ? '' : 's'} · ${r.nightsAlive} night${r.nightsAlive === 1 ? '' : 's'}` : 'Pick one to follow on the board (📖)';
    const SL = board && follow && storyOf(follow, board.night);
    q('.badge .ln').textContent = SL ? `Last night: ${SL.line.replace(/^./, (ch) => ch.toLowerCase())}` : N && follow ? `Last night: ${nightLine(N, follow, true).replace(/^./, (ch) => ch.toLowerCase())}` : '';
    q('.badge .rk').innerHTML = r ? `${ord(r.rank)}<small>of ${board.rows.length}</small>` : '';
    portrait(q('.badge canvas'), follow, true);
  }
  // a species drawn small: one of its living cells, posed level, by the Lab's own drawing
  function portrait(c2, sp, own, uid) {
    const pg = c2.getContext('2d'), Wp = c2.width, Hp = c2.height;
    pg.setTransform(1, 0, 0, 1, 0, 0);
    const bg = pg.createRadialGradient(Wp / 2, Hp / 2, 2, Wp / 2, Hp / 2, Wp * 0.7);
    bg.addColorStop(0, '#0e3346'); bg.addColorStop(1, '#03101a'); pg.fillStyle = bg; pg.fillRect(0, 0, Wp, Hp);
    const src = shown && shown.cells.find((c) => (uid ? c.uid === uid : c.species === sp && !c.dead));
    if (!src) { pg.fillStyle = rgba(hexRGB(speciesTint(sp || 'x')), 0.6); pg.beginPath(); pg.arc(Wp / 2, Hp / 2, Wp * 0.18, 0, 7); pg.fill(); return; }
    const y0 = TH * 0.6, d = Object.assign({}, src, { q: Float64Array.from(src.q), phi: new Float64Array(src.phi), cs: new Float64Array(src.cs), sn: new Float64Array(src.sn),
      cx: new Float64Array(src.cx), cy: new Float64Array(src.cy), jx: new Float64Array(src.jx), jy: new Float64Array(src.jy), meal: null });
    d.q[0] = 0; d.q[1] = y0; d.q[2] = 0.35;
    updatePose(d);
    let x0 = Infinity, x1 = -Infinity, ya = Infinity, yb = -Infinity;
    d.pieces.forEach((p, i) => { const h = p.L / 2 + p.a; x0 = Math.min(x0, d.cx[i] - h); x1 = Math.max(x1, d.cx[i] + h); ya = Math.min(ya, d.cy[i] - h); yb = Math.max(yb, d.cy[i] + h); });
    const s = Math.min(Wp * 0.86 / (x1 - x0 || 1), Hp * 0.86 / (yb - ya || 1)), mx = (x0 + x1) / 2, my = (ya + yb) / 2;
    const X = (x) => Wp / 2 + (x - mx) * s, Y = (y) => Hp / 2 - (y - my) * s;
    if (own) { const hg = pg.createRadialGradient(Wp / 2, Hp / 2, 0, Wp / 2, Hp / 2, Wp * 0.5); hg.addColorStop(0, 'rgba(242,193,78,.18)'); hg.addColorStop(1, 'rgba(242,193,78,0)'); pg.fillStyle = hg; pg.fillRect(0, 0, Wp, Hp); }
    art.portrait(pg, Object.assign({}, shown, { cells: [d], links: [] }), d, X, Y, s);
  }
  function drawMini() {
    const mg = mini.getContext('2d'), w = mini.width, h = mini.height;
    const gr = mg.createLinearGradient(0, 0, 0, h);
    if (shown) { gr.addColorStop(0, rgba(waterColor(shown, 0), 1)); gr.addColorStop(1, rgba(waterColor(shown, 1), 1)); } else { gr.addColorStop(0, '#0d3a4c'); gr.addColorStop(1, '#03101a'); }
    mg.fillStyle = gr; mg.fillRect(0, 0, w, h);
    if (shown) for (const c of shown.cells) {
      if (c.dead) continue;
      const me = c.species === follow;
      mg.fillStyle = me ? GOLD : rgba(hexRGB(speciesTint(c.species)), 0.75);
      const z = me ? 4 : 3;
      mg.fillRect(c.q[0] / TW * w - z / 2, (1 - c.q[1] / TH) * h - z / 2, z, z);
    }
    const vw = W / cam.s / TW * w, vh = H / cam.s / TH * h;
    mg.strokeStyle = 'rgba(255,255,255,.85)'; mg.lineWidth = 2;
    mg.strokeRect(cam.x / TW * w - vw / 2, (1 - cam.y / TH) * h - vh / 2, vw, vh);
  }

  // ---- the story sheet: its nights, the board ----
  let tab = 'story';
  async function showSheet(which = tab) {
    tab = which;
    q('.sheet').classList.add('on');
    q('.sheet h2').textContent = which === 'board' ? 'The board' : follow ? `${follow}'s life` : 'The Ocean';
    el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === which));
    const box = q('.scroll');
    if (!board) { box.innerHTML = '<p class="note">The Ocean isn\'t loaded yet.</p>'; return; }
    if (which === 'board') {
      const top = Math.max(...board.rows.map((r) => r.score), 0.01);
      box.innerHTML = board.rows.map((r) => `<div class="brow ${r.name === follow ? 'mine' : ''}" data-sp="${esc(r.name)}" title="Follow ${esc(r.name)}"><div class="pos">${r.rank}</div><canvas width="80" height="80"></canvas>
        <div class="nm"><b>${esc(r.name)}</b><span>${r.house ? 'house species' : esc(r.player)} · ${r.cells} cells${r.kills ? ` · ${r.kills} kill${r.kills > 1 ? 's' : ''}` : ''} · ${r.status === 'living' ? `${r.nightsAlive} night${r.nightsAlive > 1 ? 's' : ''} here` : `wiped out, back on night ${r.returns}`}${r.wipeouts ? ` · wiped out ${r.wipeouts} of 3` : ''}</span>
        <div class="gb"><i style="width:${(100 * Math.max(0, r.score) / top).toFixed(0)}%;background:${r.name === follow ? GOLD : speciesTint(r.name)}"></i></div></div>
        <div class="sc">${r.score.toFixed(2)}×<small>growth</small></div></div>`).join('') +
        ((board.lost || []).length ? `<h3 class="lostH">Extinct</h3>` + board.lost.map((l) => `<div class="lost"><b>${esc(l.name)}</b> extinct <span>night ${l.night} · ${esc(l.player)} · wiped out ${l.times.length} times (${esc(l.times.map((x) => x.why).join('; '))})${l.kills ? ` · ${l.kills} kills` : ''}</span></div>`).join('') : '') +
        `<p class="note">Ranked by growth since arrival: living biomass ÷ what its 3 cells arrived with, over the last 7 nights. Tap a species to follow it${saved.follow ? '' : ' (then the game opens here)'}. Releasing your own comes next.</p>`;
      box.querySelectorAll('.brow').forEach((row) => {
        portrait(row.querySelector('canvas'), row.dataset.sp, row.dataset.sp === follow);
        row.onclick = () => { follow = row.dataset.sp; saved.follow = follow; remember(); cam.follow = 0; badgeKey = ''; primed = false; hud(true); hideSheet(); followNext(true); };
      });
      return;
    }
    const tonight = `<div class="nightrow" data-live="1" title="Back to the live Ocean"><div class="n">night<b>${board.night + 1}</b></div><p>Tonight, running now${slow ? ' (slowly, on this device)' : ''}: the nightly run makes it official.</p></div>`;
    if (story && follow) {   // the story file: every night it was here, newest first, each milestone a tap to its moment
      const mine = (story.species[follow] || []).slice().reverse();
      box.innerHTML = tonight + mine.map((r) => `<div class="nightrow" data-n="${r.night}" title="Replay night ${r.night}"><div class="n">night<b>${r.night}</b>${r.rank ? `<span class="rk">${ord(r.rank)}</span>` : ''}</div><p>${esc(r.line)}<br>${r.ms.map((m) => `<span class="ms ${m.tone}" data-t="${m.t}" data-uid="${m.uid || ''}" title="Replay this moment">${m.tone === 'gold' ? '★' : m.tone === 'red' ? '✕' : '•'} ${esc(m.text)}</span>`).join('')}</p></div>`).join('')
        + `<p class="note">${mine.length ? 'A line a night. Tap a night to replay it, a milestone to see its moment.' : `${esc(follow)} has no nights here yet.`} Naming your lines and pinned moments come with releases.</p>`;
      box.querySelectorAll('.ms[data-t]').forEach((c) => (c.onclick = async (e) => {
        e.stopPropagation();
        const n = Number(c.closest('.nightrow').dataset.n);
        await replayMoment(n, Number(c.dataset.t), Number(c.dataset.uid) || 0); hideSheet(); toast(`Night ${n}: ${c.textContent.trim()}`);
      }));
      box.querySelectorAll('.nightrow').forEach((r) => (r.onclick = async () => {
        if (r.dataset.live) { hideSheet(); if (mode !== 'live') { setMode('live'); message(null); } return; }
        if (await playNight(Number(r.dataset.n))) { hideSheet(); toast(`Replaying night ${r.dataset.n}.`); }
      }));
      return;
    }
    const rows = [];
    for (let n = board.night; n >= Math.max(1, board.night - 13); n--) rows.push(n);
    box.innerHTML = `<div class="nightrow" data-live="1" title="Back to the live Ocean"><div class="n">night<b>${board.night + 1}</b></div><p>Tonight, running now${slow ? ' (slowly, on this device)' : ''}: the nightly run makes it official.</p></div>` +
      rows.map((n) => `<div class="nightrow" data-n="${n}" title="Replay night ${n}"><div class="n">night<b>${n}</b></div><p>…</p></div>`).join('');
    for (const n of rows) {
      const N = await loadNight(n), p = box.querySelector(`.nightrow[data-n="${n}"] p`);
      if (!p) continue;
      p.innerHTML = N ? `${esc(nightLine(N, follow) || 'Not here that night.')}<br>${milestones(N, follow).map(([m, c]) => `<span class="ms ${c}">${c === 'gold' ? '★' : c === 'red' ? '✕' : '•'} ${esc(m)}</span>`).join('')}` : 'No record of this night.';
    }
    box.querySelectorAll('.nightrow').forEach((r) => (r.onclick = async () => {
      if (r.dataset.live) { hideSheet(); if (mode !== 'live') { setMode('live'); message(null); } return; }
      if (await playNight(Number(r.dataset.n))) { hideSheet(); toast(`Replaying night ${r.dataset.n}.`); }
    }));
    box.insertAdjacentHTML('beforeend', '<p class="note">A line a night. Milestones, naming your lines and pinned moments come with releases. Tap a night to replay it.</p>');
  }
  const hideSheet = () => q('.sheet').classList.remove('on');
  el.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => showSheet(b.dataset.tab)));
  q('.sheet .close').onclick = hideSheet;
  q('.story').onclick = () => showSheet('story');
  q('.cam').onclick = () => { if (cam.follow) whole(); else followNext(true); };
  q('.badge').onclick = () => followNext(true);
  q('.lab').onclick = () => closeOcean();
  q('.snd').onclick = () => { art.setSound(!art.soundOn()); soundKey = {}; hud(true); };
  q('.pill').onclick = async () => {
    if (mode === 'rec') { setMode('live'); message(null); toast('Back to the live Ocean.'); return; }
    if (!board) return;
    if (await playNight(board.night)) toast(`Playing last night (night ${board.night}). Tap the pill to come back live.`);
  };
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { if (q('.sheet').classList.contains('on')) hideSheet(); else closeOcean(); } });
  document.addEventListener('visibilitychange', () => { if (!open || !live) return; if (document.hidden) live.pause(); else if (mode === 'live') live.resume(); });

  // ---- drawing: the scenery round the water, the seabed's life, effects, your cells' halo ----
  const BED = Array.from({ length: 150 }, (_, i) => ({ k: ['foram', 'radio', 'centric', 'shell', 'foram', 'burrow', 'spicule', 'pebble', 'centric', 'shell'][Math.floor(hash01(i + 8901) * 10)], x: hash01(i + 9001) * TW, y: -1 - hash01(i + 9101) * 9, r: 3 + hash01(i + 9201) * 8, a: hash01(i + 9301) * 6.28 }));
  const MAT = Array.from({ length: 700 }, (_, i) => ({ x: hash01(i + 9401) * TW, h: 3 + hash01(i + 9501) * 13, c: hash01(i + 9601) })).filter((m) => hash01(m.x * 7 + 3) < bedZone(m.x).mat);
  // films of coloured bacteria on the sediment's top here and there (purple, orange-pink, white sulphur)
  const FILMS = Array.from({ length: 14 }, (_, i) => ({ x: hash01(i + 9951) * TW, w: 20 + 60 * hash01(i + 9952), col: [[150, 70, 150], [210, 120, 90], [225, 225, 210]][Math.floor(hash01(i + 9953) * 3)] }));
  const STARS = Array.from({ length: 80 }, (_, i) => ({ x: hash01(i + 9701), y: hash01(i + 9801), r: 0.4 + hash01(i + 9901) * 1.1 }));
  let rings = [];
  function drawAround(w, v, t) {
    const { X, Y, s } = v, top = Y(TH), left = X(0), right = X(TW), sun = daylight(w), tw = twilight(w), wx = weatherOf(nightNo());
    // past the tank's sides the water goes on, darker
    const og = g.createLinearGradient(0, top, 0, Y(0));
    for (let k = 0; k <= 4; k++) og.addColorStop(k / 4, rgba(mix(waterColor(w, k / 4), [0, 4, 10], 0.55), 1));
    g.fillStyle = og; g.fillRect(0, top, W, Y(0) - top);
    if (Y(0) < H) { g.fillStyle = '#17140f'; g.fillRect(0, Y(0), Math.max(0, left), H - Y(0)); g.fillRect(right, Y(0), W - right, H - Y(0)); }
  }
  function drawSky(w, v, t) {
    const top = v.Y(TH), tw = twilight(w), wx = weatherOf(nightNo());
    // the sky, seen up through the surface
    if (top > 0) {
      const day = tw, sky = wx === 'sun' ? mix([8, 14, 30], [120, 185, 210], day) : mix([8, 12, 22], [96, 114, 124], day);
      const sg = g.createLinearGradient(0, 0, 0, top);
      sg.addColorStop(0, rgba(mix(sky, [0, 0, 0], 0.35), 1)); sg.addColorStop(1, rgba(sky, 1));
      g.fillStyle = sg; g.fillRect(0, 0, W, top);
      if (day < 0.4) {   // stars and a moon
        const a = (0.4 - day) / 0.4 * (wx === 'sun' ? 1 : 0.35);
        g.fillStyle = '#dfe9ff';
        for (const st of STARS) { const y = st.y * top; if (y > top - 4) continue; g.globalAlpha = a * (0.35 + 0.55 * Math.sin(t * 1.7 + st.x * 40) ** 2); g.beginPath(); g.arc(st.x * W, y, st.r, 0, 7); g.fill(); }
        g.globalAlpha = a; g.fillStyle = '#f4f1dc'; g.beginPath(); g.arc(W * 0.72, Math.min(top * 0.45, top - 18), 11, 0, 7); g.fill(); g.globalAlpha = 1;
      }
      drawClouds(top, day, wx, t);
    }
  }
  // clouds of every night their own (author, 2026-11-20: "could be a little better and more variated"): each a heap of
  // puffs on a flat base, lit from above, in two layers drifting at their own speeds; a clear night a few small fair-weather
  // ones, overcast a grey deck, rain dark and low; pink and gold at dawn and dusk, dim shapes against the night sky
  let cloudSet = null, cloudN = -1;
  function cloudsOf(n, wx) {
    const h = (k) => hash01(n * 131 + k);
    const many = wx === 'sun' ? 2 + Math.floor(h(1) * 4) : wx === 'cloud' ? 8 + Math.floor(h(2) * 6) : 12 + Math.floor(h(3) * 6);
    return Array.from({ length: many }, (_, i) => {
      const r = (k) => h(i * 17 + k + 5), far = r(1) < 0.5, size = (far ? 0.6 : 1) * (wx === 'sun' ? 40 + 50 * r(2) : 70 + 110 * r(2));
      const np = 4 + Math.floor(r(3) * 6);
      const puffs = Array.from({ length: np }, (_, k) => {
        const u = (k + 0.5) / np - 0.5, hump = 1 - 4 * u * u;
        return { dx: u * size * (1.6 + r(k + 30)), r: size * (0.18 + 0.22 * hump * (0.6 + 0.6 * r(k + 40))), up: hump * size * (0.1 + 0.25 * r(k + 50)) };
      });
      return { x: r(4), y: far ? 0.15 + 0.3 * r(5) : 0.35 + 0.4 * r(5), speed: (far ? 1.5 : 4) * (0.6 + 0.8 * r(6)), far, puffs, size, grey: r(8) };
    });
  }
  function drawClouds(top, day, wx, t) {
    const n = nightNo();
    if (cloudN !== n) { cloudN = n; cloudSet = cloudsOf(n, wx); }
    const dusk = Math.max(0, 1 - Math.abs(day - 0.35) / 0.3);   // dawn and dusk colours
    const base = wx === 'sun' ? [240, 244, 248] : wx === 'cloud' ? [196, 204, 212] : [128, 136, 146];
    const night = [26, 32, 44];
    for (const layer of [true, false]) for (const c of cloudSet) {
      if (c.far !== layer) continue;
      const span = W + 4 * c.size, cx = ((c.x * span + t * c.speed) % span) - c.size * 2, cy = top * c.y;
      if (cy - c.size > top) continue;
      let lit = mix(night, base.map((q) => q * (0.9 + 0.1 * c.grey)), Math.min(1, day * 1.5));
      lit = mix(lit, [250, 170, 140], dusk * 0.45);
      const shade = lit.map((q) => q * (wx === 'rain' ? 0.62 : 0.74)), a = (c.far ? 0.55 : 0.85) * (0.35 + 0.65 * Math.min(1, day * 2));
      // soft puffs: the shaded underside first, then the lit tops, each fading at its edge
      const puff = (x, y, r, col, al) => { const pg = g.createRadialGradient(x, y, r * 0.2, x, y, r); pg.addColorStop(0, rgba(col, al)); pg.addColorStop(0.65, rgba(col, al * 0.85)); pg.addColorStop(1, rgba(col, 0)); g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
      for (let k = -2; k <= 2; k++) puff(cx + k * c.size * 0.4, cy, c.size * 0.32, shade, a * 0.8);
      for (const p of c.puffs) puff(cx + p.dx, cy - p.up, p.r * 1.1, shade, a);
      for (const p of c.puffs) puff(cx + p.dx - p.r * 0.15, cy - p.up - p.r * 0.25, p.r * 0.85, lit, a);
    }
    if (wx === 'rain' && day > 0.05) {   // rain falling from the deck: faint streaks
      g.strokeStyle = `rgba(170,185,200,${0.18 * day})`; g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 60; i++) { const x = (hash01(i + 333) * W + t * 30) % W, y = ((hash01(i + 444) + t * 0.9) % 1) * top; g.moveTo(x, y); g.lineTo(x - 3, y + 12); }
      g.stroke();
    }
  }
  function drawWeather(w, v, t) {
    const { X, Y, s } = v, top = Y(TH), sun = daylight(w), wx = weatherOf(nightNo());
    if (wx !== 'sun' && sun > 0.02) {   // overcast and rain: the lit water greyer and dimmer near the top
      const y0 = Math.max(top, 0), y1 = Math.min(Y(TH - 900), H);
      if (y1 > y0) {
        const vg = g.createLinearGradient(0, top, 0, Y(TH - 900));
        vg.addColorStop(0, `rgba(48,58,66,${0.38 * sun})`); vg.addColorStop(1, 'rgba(48,58,66,0)');
        g.fillStyle = vg; g.fillRect(Math.max(X(0), 0), y0, Math.min(X(TW), W) - Math.max(X(0), 0), y1 - y0);
      }
    }
    if (top < -40 || top > H + 10) return;
    if (wx === 'sun' && sun > 0.1) {   // the sun's disc through the surface on a clear day
      const hr = clock(w), gx = X(TW * (0.2 + 0.6 * clamp((hr - 6) / 12, 0, 1))), gr = Math.max(40, 90 * s);
      const sg = g.createRadialGradient(gx, top + 4, 2, gx, top + 4, gr);
      sg.addColorStop(0, `rgba(255,250,225,${0.7 * sun})`); sg.addColorStop(1, 'rgba(255,250,225,0)');
      g.fillStyle = sg; g.fillRect(gx - gr, top - gr, 2 * gr, 2 * gr);
    }
    if (wx === 'rain') {   // drops ringing the surface from below
      if (Math.random() < 0.6) rings.push({ x: cam.x + (Math.random() - 0.5) * W / s, t: 0 });
      g.lineWidth = 1;
      for (const r of rings) { r.t += 0.016; const rr = 3 + r.t * 26; g.strokeStyle = `rgba(220,235,245,${0.55 * (1 - r.t)})`; g.beginPath(); g.ellipse(X(r.x), top + 3, rr, rr * 0.28, 0, 0, 7); g.stroke(); }
      rings = rings.filter((r) => r.t < 1);
    }
  }
  function drawBedLife(w, v, t) {
    const { X, Y, s, W: Wv, H: Hv } = v;
    if (Y(-12) < 0 || Y(30) > Hv) return;
    const bright = 0.35 + 0.65 * twilight(w);
    g.lineCap = 'round'; g.lineWidth = Math.max(0.8, 0.6 * s);
    for (const m of MAT) {   // the microbial mat: fine olive filaments swaying
      const x = X(m.x); if (x < -10 || x > Wv + 10) continue;
      g.strokeStyle = rgba(mix([84, 104, 58], [118, 88, 50], m.c).map((c) => c * bright), 0.55);
      const sway = Math.sin(t * 0.8 + m.x) * 2.2 * s;
      g.beginPath(); g.moveTo(x, Y(-0.5)); g.quadraticCurveTo(x + sway * 0.5, Y(m.h * 0.5), x + sway, Y(m.h)); g.stroke();
    }
    for (const f of FILMS) {   // bacterial films: thin coloured bands along the top
      const x0 = X(f.x - f.w / 2), x1 = X(f.x + f.w / 2); if (x1 < 0 || x0 > Wv) continue;
      const fg = g.createLinearGradient(x0, 0, x1, 0), c = f.col.map((q) => q * bright);
      fg.addColorStop(0, rgba(c, 0)); fg.addColorStop(0.2, rgba(c, 0.45)); fg.addColorStop(0.8, rgba(c, 0.45)); fg.addColorStop(1, rgba(c, 0));
      g.fillStyle = fg; g.fillRect(x0, Y(-0.6), x1 - x0, Math.max(1.5, 1.6 * s));
    }
    for (const b of BED) {   // forams (chambered spirals), radiolarians (spiky glass), grains
      const x = X(b.x), y = Y(b.y), r = b.r * s; if (x < -2 * r || x > Wv + 2 * r || r < 1) continue;
      g.save(); g.translate(x, y); g.rotate(b.a);
      const C = (c, a) => rgba(c.map((q) => q * bright), a);
      if (b.k === 'pebble') { const pc = mix(bedZone(b.x).col, [160, 150, 140], 0.4); g.fillStyle = C(pc, 0.95); g.beginPath(); g.ellipse(0, 0, r * 1.1, r * 0.7, 0, 0, 7); g.fill(); g.fillStyle = C([255, 245, 225], 0.2); g.beginPath(); g.ellipse(-r * 0.25, -r * 0.25, r * 0.55, r * 0.25, 0, 0, 7); g.fill(); }
      else if (b.k === 'centric') {   // a round diatom valve: a glassy disc with rays
        g.strokeStyle = C([230, 236, 222], 0.6); g.fillStyle = C([210, 220, 205], 0.18); g.lineWidth = Math.max(0.5, r * 0.06);
        g.beginPath(); g.ellipse(0, 0, r, r * 0.45, 0, 0, 7); g.fill(); g.stroke();
        if (r > 5) { g.globalAlpha = 0.5; g.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28; g.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.09); g.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.41); } g.stroke(); g.globalAlpha = 1; }
      } else if (b.k === 'shell') {   // a broken shell: a pale curved fragment with a growth line
        g.fillStyle = C([226, 214, 190], 0.75); g.strokeStyle = C([160, 146, 120], 0.6); g.lineWidth = Math.max(0.5, r * 0.06);
        g.beginPath(); g.arc(0, r * 0.5, r, Math.PI * 1.15, Math.PI * 1.85); g.arc(0, r * 0.5, r * 0.6, Math.PI * 1.8, Math.PI * 1.2, true); g.closePath(); g.fill(); g.stroke();
        if (r > 4) { g.beginPath(); g.arc(0, r * 0.5, r * 0.8, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); }
      } else if (b.k === 'burrow') {   // a worm's burrow: a little mound with a dark mouth
        g.rotate(-b.a); g.fillStyle = C(mix(bedZone(b.x).col, [70, 60, 46], 0.3), 0.95);
        g.beginPath(); g.ellipse(0, r * 0.2, r * 1.4, r * 0.7, 0, Math.PI, 0); g.fill();
        g.fillStyle = 'rgba(8,6,4,.85)'; g.beginPath(); g.ellipse(0, -r * 0.3, r * 0.32, r * 0.18, 0, 0, 7); g.fill();
      } else if (b.k === 'spicule') {   // a sponge's glass needle
        g.strokeStyle = C([236, 240, 236], 0.55); g.lineWidth = Math.max(0.6, r * 0.08);
        g.beginPath(); g.moveTo(-r * 1.8, 0); g.lineTo(r * 1.8, 0); g.stroke();
      } else if (b.k === 'grain') { g.fillStyle = rgba([107, 96, 74].map((c) => c * bright), 0.8); g.beginPath(); g.ellipse(0, 0, r * 0.6, r * 0.42, 0, 0, 7); g.fill(); }
      else if (b.k === 'foram') {
        g.strokeStyle = rgba([216, 204, 176].map((c) => c * bright), 0.8); g.fillStyle = rgba([220, 205, 170].map((c) => c * bright), 0.3); g.lineWidth = Math.max(0.7, r * 0.07);
        for (let k = 0; k < 6; k++) { const a = k * 0.9, rr = r * (0.3 + k * 0.12); g.beginPath(); g.arc(Math.cos(a) * rr * 0.6, Math.sin(a) * rr * 0.6, rr * 0.5, 0, 7); g.fill(); g.stroke(); }
      } else {
        g.strokeStyle = rgba([235, 240, 240].map((c) => c * bright), 0.6); g.lineWidth = Math.max(0.5, r * 0.05);
        g.beginPath(); g.arc(0, 0, r * 0.7, 0, 7); g.stroke();
        for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); g.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3); g.stroke(); }
      }
      g.restore();
    }
    for (const c of corpses) {   // the dead, fading where they lay, in their species' tint
      const a = 0.45 * (1 - c.t); if (a <= 0) continue;
      g.save(); g.translate(X(c.x), Y(-0.5)); g.rotate(-c.a * 0.15); g.globalAlpha = a;
      g.fillStyle = rgba(mix(hexRGB(c.tint), [90, 80, 60], 0.6), 1);
      const hl = c.L / 2 * s, rr = Math.max(1, c.r * s * 0.8);
      g.beginPath(); g.moveTo(-hl, -rr); g.lineTo(hl, -rr); g.arc(hl, 0, rr, -Math.PI / 2, Math.PI / 2); g.lineTo(-hl, rr); g.arc(-hl, 0, rr, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.fill();
      g.restore();
    }
  }
  function drawHalos(w, v) {
    const { X, Y, s } = v;
    for (const c of w.cells) {
      if (c.species !== follow || c.dead) continue;
      const R = (c.pieces[0].a + c.pieces[0].L / 2 + 18) * s, x = X(c.q[0]), y = Y(c.q[1]);
      if (x < -R || x > W + R || y < -R || y > H + R) continue;
      const hg = g.createRadialGradient(x, y, c.pieces[0].a * s * 0.8, x, y, R);
      hg.addColorStop(0, `rgba(242,193,78,${c.uid === cam.follow ? 0.24 : 0.16})`); hg.addColorStop(1, 'rgba(242,193,78,0)');
      g.fillStyle = hg; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
    }
  }
  function drawFx(w, v, dt) {
    const { X, Y, s } = v, night = daylight(w) < 0.05;
    for (const f of fx) f.t += dt;
    fx = fx.filter((f) => f.t < (f.k === 'spark' ? 1.4 : 3));
    for (const c of corpses) c.t += dt / 300;
    corpses = corpses.filter((c) => c.t < 1);
    g.save();
    for (const f of fx) {
      const x = X(f.x), y = Y(f.y);
      if (f.k === 'spark') {
        g.globalCompositeOperation = 'lighter';
        const a = Math.sin(Math.PI * f.t / 1.4), r = 4 + 5 * Math.min(s, 3);
        const sg = g.createRadialGradient(x, y, 0, x, y, r); sg.addColorStop(0, `rgba(120,220,255,${0.8 * a})`); sg.addColorStop(1, 'rgba(60,160,255,0)');
        g.fillStyle = sg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      } else if (f.k === 'ripple') {
        g.globalCompositeOperation = 'source-over';
        const col = f.gold ? [242, 193, 78] : hexRGB(f.tint);
        for (let k = 0; k < 3; k++) { const u = f.t / 3 - k * 0.12; if (u < 0) continue; g.strokeStyle = rgba(col, (f.gold ? 0.65 : 0.35) * (1 - u)); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, (10 + 60 * u) * s, 0, 7); g.stroke(); }
      } else if (f.k === 'cloud') {
        g.globalCompositeOperation = 'source-over';
        const u = f.t / 3, r = (14 + 45 * u) * s, cg = g.createRadialGradient(x, y, 0, x, y, r);
        cg.addColorStop(0, `rgba(25,12,20,${0.55 * (1 - u)})`); cg.addColorStop(1, 'rgba(25,12,20,0)');
        g.fillStyle = cg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    }
    g.restore();
    // wakes behind swimmers at night: faint glowing threads (their places sampled a few times a second)
    if (night) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = 1.2; g.strokeStyle = 'rgba(90,190,255,.2)';
      for (const c of w.cells) {
        const vv = vis.get(c.uid); if (!vv) continue;
        const swim = c.joints.some((j) => j.type === 'motor' && j.on && !j.burst);
        const tr = vv.trail, last = tr[tr.length - 1];
        if (swim && !c.dead && (!last || Math.hypot(last[0] - c.q[0], last[1] - c.q[1]) > 2.5)) { tr.push([c.q[0], c.q[1]]); if (tr.length > 36) tr.shift(); }
        else if (!swim && tr.length && Math.random() < 0.2) tr.shift();
        if (tr.length > 3) { g.beginPath(); tr.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); }
      }
      g.restore();
    }
  }

  // ---- the frame ----
  function resize() {
    const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    hudH = (q('.obot').offsetHeight || 140) + 16;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  new ResizeObserver(() => { if (open) { resize(); clampCam(); } }).observe(cv);
  let firstLook = true, lookT = 0;
  function frame(now) {
    raf = 0;
    if (!open) return;
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
    lastT = now;
    shown = mode === 'rec' && rec ? posedRec(dt) : F.cur ? posedLive(now, dt) : null;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#02070d'; g.fillRect(0, 0, W, H);
    if (shown) {
      if (mode === 'rec') { lookT += dt; if (lookT > 0.125 || !primed) { lookT = 0; observe(shown); } recMoments((rec.steps - rec.rp.from) * DT / DAY); }
      if (firstLook) { firstLook = false; followNext(true); const c = shown.cells.find((x) => x.uid === cam.follow); if (c) { cam.x = cam.tx = c.q[0]; cam.y = cam.ty = c.q[1]; } else whole(); }
      // the camera: on the followed cell (it sits a little above the middle: the HUD covers the bottom)
      const fc = cam.follow && shown.cells.find((c) => c.uid === cam.follow);
      if (cam.follow && (!fc || fc.dead)) { const ys = mineOf(shown); cam.follow = ys.length ? ys[0].uid : 0; camButton(); }
      if (fc) { cam.tx = fc.q[0]; cam.ty = fc.q[1] - (hudH / 2 - 30) / cam.ts; clampCam(); }
      const k = Math.min(1, dt * (cam.follow ? 4 : 12));
      cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.s += (cam.ts - cam.s) * Math.min(1, dt * 12);
      const s = cam.s, X = (x) => W / 2 + (x - cam.x) * s, Y = (y) => H / 2 - (y - cam.y) * s;
      const v = { W, H, X, Y, s, x0: cam.x - W / 2 / s, x1: cam.x + W / 2 / s, y0: cam.y - H / 2 / s, y1: cam.y + H / 2 / s }, t = now / 1000;
      drawAround(shown, v, t);
      drawWater(g, shown, v, t);
      drawSky(shown, v, t);
      drawBedLife(shown, v, t);
      if (shown.shade) drawShade(g, shown, v);
      if (shown.toxins) drawToxins(g, shown, v);
      drawDrift(g, shown, v, (shown.steps || 0) * DT, t);
      drawWeather(shown, v, t);
      drawHalos(shown, v);
      art.cells(g, shown, v, (c) => c.species === follow);
      keepVis(shown);
      drawFx(shown, v, dt);
      drawPick(shown, v);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawVignette(g, W, H);
      if (mode === 'rec') { g.fillStyle = 'rgba(255,177,92,.05)'; g.fillRect(0, 0, W, H); }   // the recording: a faint amber cast
      // the sound: the water where the camera looks, and what happens in it
      const depth = clamp(1 - cam.y / TH, 0, 1);
      soundUpdate({ x: cam.x, y: cam.y, s, W, H }, { depth, light: daylight(shown), flow: shown.flow ? 1 - daylight(shown) : 0, playing: true, speed: 1, world: shown });
      if (mode === 'rec') soundListen(shown, soundKey);
    }
    hud();
    raf = requestAnimationFrame(frame);
  }

  // ---- opening and closing ----
  async function openOcean() {
    if (open) return;
    open = true; el.hidden = false; art.open(true);
    resize(); lastT = 0;
    if (!board) {
      message('The Ocean', 'Loading…');
      try { await loadBoard(); } catch (e) { setMode('none'); message('The Ocean can\'t be reached', `${e.message}. It lives on the website and on the home server.`); hud(true); raf = requestAnimationFrame(frame); return; }
      message(null);
      loadNight(board.night).then(() => { badgeKey = ''; hud(true); });
      loadStory().then(() => { badgeKey = ''; hud(true); morning(); });
      startLiveOcean();
      setTimeout(() => { if (mode === 'loading' && !F.cur) fallBack('slow to start'); }, 20000);
    } else if (live && mode === 'live') live.resume();
    clampCam();
    hud(true);
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function closeOcean() {
    if (!open) return;
    open = false; el.hidden = true; hideSheet();
    if (live) live.pause();
    if (raf) cancelAnimationFrame(raf); raf = 0;
    art.open(false);
  }
  const btn = document.getElementById('oceanBtn');
  if (btn) btn.onclick = (e) => { e.stopPropagation(); openOcean(); };
  // Ocean first (author, 2026-11-19): once you follow a species there, the game opens on it
  if ((saved.follow || waiting || PLAYER) && !/[?&](design|preset)=/.test(location.search)) openOcean();
  // for headless tests (as window.__tg in the Lab): the live run's speed, and what is shown
  window.__ocean = { wx: (x) => { forceWx = x; cloudN = -1; }, pick: (uid) => pickCell(uid), look: (x, y, z) => { cam.follow = 0; cam.ts = z; cam.tx = cam.x = x; cam.ty = cam.y = y; clampCam(); camButton(); }, cells: () => (shown ? shown.cells.filter((c) => !c.dead).map((c) => [c.uid, c.species, W / 2 + (c.q[0] - cam.x) * cam.s, H / 2 - (c.q[1] - cam.y) * cam.s]) : []), speed: (x) => live && live.speed(x), recAt: (f) => { if (rec) { rec.steps = rec.rp.from + f * (rec.rp.to - rec.rp.from); primed = false; } }, play: (n) => playNight(n), state: () => ({ mode, slow, cells: shown ? shown.cells.length : 0, clock: shown ? clock(shown) : null, info: live && live.info }) };
  return { open: openOcean, close: closeOcean };
}
