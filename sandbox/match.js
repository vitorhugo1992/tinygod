// ⚔ Matches (2026-11-09; the outside review: "no game after the missions"): the design being built against the house
// rivals of sandbox/matches.js, one rung at a time. A match runs in a worker (match-worker.js; in the page, in slices,
// where a worker can't start), so the tank and the panel stay usable; it plays the design as it was when it started.
// The verdict: stars, each species' score, the population over the match, and how each side's cells died.
import { PARAMS } from '../sim/params.js';
import { newMatch, stepMatch, matchResult, matchStars, deathsText } from '../sim/match.js';
import { RUNGS, MATCH_DAYS, MATCH_CAP, rungSeed, rungEach, rungOpen, yourName } from './matches.js';

const KEY = 'tinygod.matches';
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const $ = (id) => document.getElementById(id);
const YOU = '#ffd36b', THEM = ['#7cb0ff', '#f08a6c', '#5fd3b0'];
const stars = (n) => '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i>';
const x1 = (v) => (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '×';

// getDesign(): the design being built; inMission(): a mission is being played (its cell is not the player's)
export function initMatch({ getDesign, inMission, leave }) {
  let progress = (() => { try { return Object.assign({ best: {}, score: {} }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { best: {}, score: {} }; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) { /* private mode: not kept */ } };
  let run = null;   // the match running or just over: { i, rung, you, worker, result, pop, done, error, t0 }
  const designs = {};

  // A rival's design: its file on the website; on the home server (which shares no designs/) from its list of Claude's
  async function rivalDesign(r) {
    if (designs[r.file]) return designs[r.file];
    let d = null;
    try { const got = await fetch('../' + r.file); if (got.ok) d = (await got.json()).design; } catch (e) { /* try the list */ }
    if (!d) {
      const list = await (await fetch('/designs')).json();
      d = (list.find((x) => x.name === r.name || x.name.startsWith(r.name + ' (')) || {}).design;
    }
    if (!d) throw new Error('no design');
    return (designs[r.file] = d);
  }

  function showList() {
    const total = RUNGS.reduce((s, r) => s + (progress.best[r.id] || 0), 0);
    $('matchTotal').innerHTML = `⭐ ${total} of ${3 * RUNGS.length} stars. The species you are building against a rival: the same number of cells each, `
      + `${MATCH_DAYS} days in moving water. <b>Score:</b> how many times its living biomass grew, averaged over the match. `
      + '★ yours is alive at the end · ★★ it outscores the rival · ★★★ twice the rival\'s score.';
    $('matchList').innerHTML = RUNGS.map((r, i) => {
      const open = rungOpen(i, progress.best), cur = run && run.i === i && !run.done;
      const sc = progress.score[r.id];
      return `<div class="mrow${open ? '' : ' locked'}${cur ? ' cur' : ''}"><span class="mnum">${i + 1}</span><span class="mname">${esc(r.title)}`
        + `<small>${esc(r.what)}${sc ? ` · your best ${x1(sc)}` : ''}</small></span><span class="mst">${stars(progress.best[r.id] || 0)}</span>`
        + (open ? `<button data-r="${i}" title="Send the species you are building into this match">${cur ? '…' : '▶'}</button>` : '<span title="Earn a star against the rival before">🔒</span>') + '</div>';
    }).join('');
    for (const b of $('matchList').querySelectorAll('button[data-r]')) b.onclick = () => start(Number(b.dataset.r));
  }

  function stop() {
    if (run && run.worker) run.worker.terminate();
    if (run) run.stopped = true;
    run = null;
  }

  async function start(i) {
    const box = $('matchRun');
    if (inMission()) leave();   // a match plays your own species: the mission ends and it comes back (it used to refuse, in a note easy to miss)
    stop();
    const rung = RUNGS[i], mine = JSON.parse(JSON.stringify(getDesign())), you = yourName(mine, rung);
    const me = run = { i, rung, you, result: null, pop: [], done: false, t0: performance.now() };
    frame(); showList();
    let rivals;
    try { rivals = await Promise.all(rung.rivals.map(rivalDesign)); }
    catch (e) { if (run === me) fail('The rival\'s design could not be loaded (no connection?).'); return; }
    if (run !== me) return;
    const job = { entries: [{ name: you, design: mine }, ...rung.rivals.map((r, k) => ({ name: r.name, design: rivals[k] }))],
      seed: rungSeed(i), days: MATCH_DAYS, each: rungEach(rung), cap: MATCH_CAP };
    const got = (msg) => {
      if (run !== me) return;
      if (msg.type === 'error') { fail(`Your design can't enter: ${msg.message}`); return; }
      me.result = msg.result; me.pop = msg.pop;
      if (msg.type === 'done') finish(); else update();
    };
    try {
      const w = new Worker(new URL('./match-worker.js', import.meta.url), { type: 'module' });
      me.worker = w;
      w.onmessage = (e) => got(e.data);
      w.onerror = () => { w.terminate(); me.worker = null; if (run === me && !me.result) inPage(job, me, got); };   // no module workers here
      w.postMessage(job);
    } catch (e) { inPage(job, me, got); }
  }
  // The same match on the page's own thread, a slice at a time
  function inPage(job, me, got) {
    let m;
    try { m = newMatch(job); } catch (e) { got({ type: 'error', message: e.message }); return; }
    let told = 0;
    const slice = () => {
      if (run !== me) return;
      try { const until = performance.now() + 25; while (!m.over && performance.now() < until) stepMatch(m, 50); }
      catch (e) { got({ type: 'error', message: e.message }); return; }
      if (m.over || performance.now() - told > 250) { told = performance.now(); got({ type: m.over ? 'done' : 'progress', result: matchResult(m), pop: m.pop }); }
      if (!m.over) setTimeout(slice, 8);
    };
    slice();
  }

  function fail(text) {
    const me = run; if (me && me.worker) me.worker.terminate();
    run = null;
    $('matchRun').hidden = false;
    $('matchRun').innerHTML = `<div class="mxnote bad">${esc(text)}</div>`;
    showList();
  }

  // The box of the running match, built once; update() fills it
  function frame() {
    const box = $('matchRun'), r = run;
    box.hidden = false;
    box.innerHTML = `<div class="mxhead"><b style="color:${YOU}">${esc(r.you)}</b> against ${r.rung.rivals.map((x, k) => `<b style="color:${THEM[k]}">${esc(x.name)}</b>`).join(', ')}</div>`
      + '<div class="mxday" id="mxDay">getting the rival…</div><div class="mxbar"><i id="mxFill"></i></div>'
      + '<canvas id="mxGraph"></canvas><div id="mxLegend"></div><div id="mxVerdict" hidden></div>'
      + '<div class="row"><button id="mxStop" title="Stop this match">✕ Stop</button></div>';
    $('mxStop').onclick = () => { stop(); box.hidden = true; showList(); };
    box.scrollIntoView({ block: 'nearest' });
  }
  const colorOf = (name) => (name === run.you ? YOU : THEM[run.rung.rivals.findIndex((x) => x.name === name)] || '#aaa');
  function update() {
    const r = run, res = r.result;
    if (!res || !$('mxDay')) return;
    const spent = (performance.now() - r.t0) / 1000, left = res.day > 0.05 ? spent * (res.days - res.day) / res.day : null;
    $('mxDay').textContent = res.over ? `${res.days} days played` : `day ${res.day.toFixed(1)} of ${res.days}`
      + (left === null ? '' : left > 90 ? ` · about ${Math.round(left / 60)} min left` : ` · about ${Math.max(5, Math.round(left / 5) * 5)} s left`) + ' · you can keep building meanwhile';
    $('mxFill').style.width = `${Math.min(100, 100 * res.day / res.days)}%`;
    $('mxLegend').innerHTML = res.species.map((s) => `<span><i style="background:${colorOf(s.name)}"></i>${esc(s.name)}: <b>${s.cells}</b> cell${s.cells === 1 ? '' : 's'} · score <b>${x1(s.score)}</b></span>`).join('');
    graph();
  }
  // Living cells of each species over the match: nights shaded, a tick at each day
  function graph() {
    const cv = $('mxGraph'), r = run;
    if (!cv || !r) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = cv.clientHeight || 110;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const days = r.result.days, L = 22, T = 6, B = 16, gw = W - L - 6, gh = H - T - B;
    const X = (d) => L + gw * d / days;
    let max = 4;
    for (const p of r.pop) for (const k in p.n) max = Math.max(max, p.n[k]);
    const Y = (n) => T + gh * (1 - n / max);
    g.fillStyle = 'rgba(40,50,90,.4)';
    for (let d = 0; d < days; d += 1 / 96) if (Math.sin(2 * Math.PI * (d + PARAMS.metab.dawn)) <= 0) g.fillRect(X(d), T, gw / days / 96 + 0.6, gh);
    g.strokeStyle = '#23324a'; g.lineWidth = 1; g.strokeRect(L + 0.5, T + 0.5, gw - 1, gh - 1);
    g.fillStyle = '#8197a8'; g.font = '10px system-ui'; g.textAlign = 'center';
    for (let d = 0; d <= days; d++) g.fillText(d === 0 ? 'start' : `day ${d}`, Math.min(W - 16, Math.max(L + 12, X(d))), H - 4);
    g.textAlign = 'right'; g.fillText(String(max), L - 3, T + 9); g.fillText('0', L - 3, T + gh);
    r.result.species.forEach((s, i) => {
      g.strokeStyle = colorOf(s.name); g.lineWidth = s.name === r.you ? 2.2 : 1.6; g.beginPath();
      const off = (i - (r.result.species.length - 1) / 2) * 1.6;
      let prev = null;
      for (const p of r.pop) { const y = Y(p.n[s.name] || 0) + off; if (prev === null) g.moveTo(X(p.day), y); else { g.lineTo(X(p.day), prev); g.lineTo(X(p.day), y); } prev = y; }
      g.stroke();
    });
  }

  function finish() {
    const r = run, res = r.result;
    r.done = true; if (r.worker) { r.worker.terminate(); r.worker = null; }
    update();
    const n = matchStars(res, r.you), me = res.species.find((s) => s.name === r.you), rivals = res.species.filter((s) => s.name !== r.you);
    const top = rivals.reduce((a, b) => (b.score > a.score ? b : a));
    const had = progress.best[r.rung.id] || 0;
    if (n > had) progress.best[r.rung.id] = n;
    if (me.cells && me.score > (progress.score[r.rung.id] || 0)) progress.score[r.rung.id] = me.score;
    save();
    // why, in a sentence: what decided it for the player's species
    const why = !me.cells ? `Every cell of yours died: ${deathsText(me.deaths)}.`
      : n >= 2 ? `Yours grew ${x1(me.score)} against ${esc(top.name)}'s ${x1(top.score)}.${n === 2 ? ` Three stars: twice its score (${x1(2 * top.score)}).` : ''}`
        : `Yours lived but grew slower: ${x1(me.score)} against ${esc(top.name)}'s ${x1(top.score)}.` + (me.deaths.length ? ` It lost ${deathsText(me.deaths)}.` : me.now < 1.5 ? ' It hardly grew: growth needs spare energy and nitrogen (richer below ~1,400 µm), or a nitroplast.' : '');
    const rows = [...res.species].sort((a, b) => b.score - a.score).map((s) => `<tr><td><i style="background:${colorOf(s.name)}"></i>${esc(s.name)}</td><td><b>${x1(s.score)}</b></td><td>${s.cells}</td>`
      + `<td>${s.deaths.length ? esc(deathsText(s.deaths)) : 'none'}</td></tr>`).join('');
    const v = $('mxVerdict');
    v.hidden = false;
    v.innerHTML = `<div class="mxstars">${n ? stars(n) : 'No star yet'}${n > had && !had && RUNGS[r.i + 1] ? ` · 🔓 ${esc(RUNGS[r.i + 1].title)} is open` : ''}</div>`
      + `<div class="mxwhy">${why}</div><table class="mxtab"><tr><th>Species</th><th>Score</th><th>Cells</th><th>Deaths</th></tr>${rows}</table>`;
    $('mxStop').textContent = '✕ Close';
    showList();
    v.scrollIntoView({ block: 'nearest' });
  }

  showList();
}
