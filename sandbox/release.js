// The release (2026-11-20, the Ocean redone, step 6; decided with the author 2026-11-19/20): a small ceremony that lets a
// species go from the Lab into the shared Ocean. Full screen: the cell drawn big, its name, your GitHub name (asked once,
// remembered: the Ocean then opens on your species), a test day run quietly in the Ocean's conditions (a warning if it
// would starve: you may release it anyway), "it can't be edited once out there"; then it sinks out of sight, and one tap
// opens a GitHub issue "Release: <name>" carrying the design's code. A job on GitHub checks it, queues it under the
// issue's author and answers on the issue; it arrives as 3 cells at the next night. Until then the Ocean shows it
// "waiting at the surface" (localStorage tinygod.release).
//   initRelease({ design: () => the design (a copy, no species), name: () => a suggested name, pack(obj) -> TG1 code,
//                 portrait(g, world, cell, X, Y, s) the Lab's drawing, onDone(release) })  -> open()
import { PARAMS } from '../sim/params.js';
import { makeWorld, addCell, stepWorld } from '../sim/world.js';
import { prepEntry, entryProblem } from '../sim/entry.js';
import { updatePose } from '../sim/physics.js';
import { clock } from '../sim/light.js';

export const PLAYER_KEY = 'tinygod.player', RELEASE_KEY = 'tinygod.release';
const ISSUES = 'https://github.com/vitorhugo1992/tinygod/issues/new';
const DT = PARAMS.time.dt, DAY = PARAMS.metab.day, TW = PARAMS.tank.w, TH = PARAMS.tank.h;
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor(60 * (h % 1))).padStart(2, '0')}`;
const read = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

const CSS = `
#releaseView { position: fixed; inset: 0; z-index: 950; display: grid; place-items: center; overflow: auto;
  background: radial-gradient(120% 80% at 50% 0%, #0d3a4e 0%, #04131f 55%, #01070c 100%); color: #e4eef3; font: 14px/1.45 system-ui, sans-serif; }
#releaseView[hidden] { display: none; }
#releaseView .box { width: min(420px, 100%); padding: 18px 18px 22px; display: grid; gap: 12px; }
#releaseView h2 { margin: 0; text-transform: none; color: #f2c14e; text-align: center; font: 700 22px/1.2 system-ui, sans-serif; letter-spacing: .02em; }
#releaseView .sub { text-align: center; color: #8eb0bf; font-size: 13px; margin-top: -6px; }
#releaseView canvas { width: min(300px, 74vw); aspect-ratio: 1; justify-self: center; border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, #0f3a4c, #031019 72%); box-shadow: 0 0 60px rgba(242,193,78,.12) inset, 0 0 0 1px rgba(242,193,78,.25); }
#releaseView label { display: grid; gap: 4px; font-size: 12px; color: #8eb0bf; }
#releaseView input { font: 600 16px system-ui, sans-serif; padding: 9px 11px; border-radius: 10px; border: 1px solid #2a4a60; background: #071a28; color: #e4eef3; }
#releaseView .test { padding: 9px 11px; border-radius: 10px; background: #0a2232; border: 1px solid #1e3c52; font-size: 13px; }
#releaseView .test.ok { border-color: #2f7a5c; color: #bff0d8; } #releaseView .test.warn { border-color: #a8742a; color: #ffd9a0; } #releaseView .test.bad { border-color: #a9444f; color: #ffc4cb; }
#releaseView .note { font-size: 12.5px; color: #9fb5c6; text-align: center; }
#releaseView .row { display: flex; gap: 8px; } #releaseView .row button { flex: 1; }
#releaseView button { font: 600 14px system-ui, sans-serif; padding: 11px; border-radius: 12px; border: 1px solid #2a4a60; background: #0d2333; color: #e4eef3; cursor: pointer; }
#releaseView .go { background: linear-gradient(#e0b44a, #b98a2a); border-color: #f2c14e; color: #1b1406; font-size: 16px; }
#releaseView .go:disabled { opacity: .45; cursor: default; }
#releaseView .bub { position: fixed; border-radius: 50%; border: 1px solid rgba(220,240,255,.6); pointer-events: none; animation: tgbub 2.2s ease-in forwards; }
@keyframes tgbub { to { transform: translateY(-260px); opacity: 0; } }
`;

export function initRelease(art) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'releaseView'; el.hidden = true; document.body.appendChild(el);
  let raf = 0, stopTest = null, sinkT = 0, view = null;

  function close() { el.hidden = true; if (raf) cancelAnimationFrame(raf); raf = 0; if (stopTest) stopTest(); stopTest = null; }

  // a test day in the Ocean's conditions (moving water, days, growth): one cell from mid-water at dawn
  function testDay(d, onDone, onProgress) {
    const w = makeWorld(7, { gravity: true, light: true, day: true, metab: true, grow: true, flow: true });
    let c;
    try { c = addCell(w, prepEntry(d), TW / 2, TH / 2, 90); } catch (e) { onDone({ bad: e.message }); return () => {}; }
    const end = Math.round(DAY / DT); let cancelled = false;
    const slice = () => {
      if (cancelled) return;
      const until = performance.now() + 25;
      while (w.steps < end && !c.dead && performance.now() < until) stepWorld(w);
      if (c.dead) return onDone({ died: hhmm(clock(w)), why: c.diedWhy || 'starved' });
      onProgress(w.steps / end);
      if (w.steps < end) setTimeout(slice, 0);
      else onDone({ lived: true, energy: c.metab ? Math.round(100 * c.metab.E / c.metab.C) : 100 });
    };
    setTimeout(slice, 0);
    return () => { cancelled = true; };
  }

  function draw(cv, d) {
    const g = cv.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth || 300;
    cv.width = cv.height = Math.round(W * dpr);
    const w = makeWorld(1, { metab: true }), c = addCell(w, prepEntry(d), 0, TH / 2, 0);
    updatePose(c);
    let x0 = Infinity, x1 = -Infinity, ya = Infinity, yb = -Infinity;
    c.pieces.forEach((p, i) => { const h = p.L / 2 + p.a; x0 = Math.min(x0, c.cx[i] - h); x1 = Math.max(x1, c.cx[i] + h); ya = Math.min(ya, c.cy[i] - h); yb = Math.max(yb, c.cy[i] + h); });
    const s = 0.7 * W / Math.max(x1 - x0, yb - ya, 1), mx = (x0 + x1) / 2, my = (ya + yb) / 2;
    view = { g, w, c, W, dpr, s, mx, my };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const sink = sinkT ? Math.min(1, (now - sinkT) / 1800) : 0;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, W);
      const bob = Math.sin(now / 900) * 3, dy = sink * sink * W * 0.9, k = 1 - 0.5 * sink;
      g.globalAlpha = 1 - sink * 0.85;
      art.portrait(g, w, c, (x) => W / 2 + (x - mx) * s * k, (y) => W / 2 + bob + dy - (y - my) * s * k, s * k);
      g.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
  }

  function open() {
    const d = art.design(), problem = entryProblem(d);
    const player = read(PLAYER_KEY), suggested = art.name();
    sinkT = 0;
    el.innerHTML = `<div class="box">
      <h2>🌊 Release into the Ocean</h2>
      <div class="sub">One shared ocean. Every player's species lives there.</div>
      <canvas></canvas>
      <label>Its name<input class="nm" maxlength="40" value="${esc(suggested)}" placeholder="Name your species"></label>
      <label>Your GitHub name${player ? '' : ' (asked once: the Ocean then opens on your species)'}<input class="pl" maxlength="39" value="${esc(player)}" placeholder="your GitHub user name" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <div class="test">${problem ? '' : 'Testing a day in the Ocean…'}</div>
      <div class="note">Once released it can't be edited. It arrives as 3 cells at the next night and lives on with no help from you. Wiped out 3 times, it is extinct.</div>
      <div class="row"><button class="back" type="button">Back to the Lab</button><button class="go" type="button">🌊 Release</button></div>
    </div>`;
    el.hidden = false;
    const q = (s) => el.querySelector(s), test = q('.test');
    draw(q('canvas'), d);
    q('.back').onclick = close;
    if (problem) { test.className = 'test bad'; test.textContent = `It can't enter the Ocean: ${problem}.`; q('.go').disabled = true; return; }
    stopTest = testDay(d, (r) => {
      stopTest = null;
      if (r.bad) { test.className = 'test bad'; test.textContent = `It can't enter the Ocean: ${r.bad}.`; q('.go').disabled = true; }
      else if (r.died) { test.className = 'test warn'; test.textContent = `⚠ In a test day it ${r.why === 'starved' ? 'starves' : `dies (${r.why})`} at ${r.died}. You can release it anyway, or go back and fix it.`; q('.go').textContent = '🌊 Release anyway'; }
      else { test.className = 'test ok'; test.textContent = `✓ It lived through a whole test day (energy ${r.energy}% at the next dawn).`; }
    }, (p) => { test.textContent = `Testing a day in the Ocean… ${Math.round(100 * p)}%`; });
    q('.go').onclick = async () => {
      const name = q('.nm').value.trim(), pl = q('.pl').value.trim().replace(/^@/, '');
      if (!name) { q('.nm').focus(); return; }
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(pl)) { q('.pl').focus(); q('.pl').style.borderColor = '#ff8a7a'; return; }
      write(PLAYER_KEY, pl);
      let code;
      try { code = await art.pack({ name, design: d }); } catch (e) { test.className = 'test bad'; test.textContent = 'This browser cannot pack a design.'; return; }
      // it sinks away
      if (stopTest) { stopTest(); stopTest = null; }
      sinkT = performance.now();
      const cv = q('canvas').getBoundingClientRect();
      for (let i = 0; i < 14; i++) setTimeout(() => {
        const b = document.createElement('div'), r = 3 + Math.random() * 7;
        b.className = 'bub'; Object.assign(b.style, { width: `${r}px`, height: `${r}px`, left: `${cv.left + cv.width * (0.3 + 0.4 * Math.random())}px`, top: `${cv.top + cv.height * (0.4 + 0.5 * Math.random())}px` });
        el.appendChild(b); setTimeout(() => b.remove(), 2300);
      }, i * 90);
      const title = `Release: ${name}`, body = `${pl} releases **${name}** into the TinyGod Ocean.\n\nTap **Create** (or Submit new issue): a job checks it and answers here within a few minutes.\n\n${code}`;
      let url = `${ISSUES}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, paste = false;
      if (url.length > 7500) {   // too long for a link: the code goes to the clipboard and the issue says where to paste it
        paste = true;
        try { await navigator.clipboard.writeText(code); } catch (e) { /* the page below says so */ }
        url = `${ISSUES}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body.replace(code, '(paste the code here)'))}`;
      }
      write(RELEASE_KEY, JSON.stringify({ name, player: pl, at: Date.now() }));
      setTimeout(() => {
        q('.box').innerHTML = `<h2>It has gone</h2><div class="sub">${esc(name)} is waiting at the surface.</div>
          <div class="note">One more step: GitHub keeps the Ocean's records. Tap below, then ${paste ? 'paste the code (it is copied) where it says and tap ' : ''}<b>Create</b> on the page that opens (signed in as <b>${esc(pl)}</b>). It arrives at the next night.</div>
          <div class="row"><button class="go gh" type="button">Open GitHub ▸</button></div><div class="row"><button class="back" type="button">Back to the Lab</button></div>`;
        q('.gh').onclick = () => { window.open(url, '_blank') || (location.href = url); };
        q('.back').onclick = close;
        if (art.onDone) art.onDone({ name, player: pl });
      }, 1900);
    };
  }
  return { open, close };
}
