// 🌊 The Ocean (2026-11-18; the plan's step 4, from the mock-up the author approved: "much better"): the shared tank
// that never resets, one ocean day a night (tools/ocean.mjs writes ocean/). The tab shows last night in one line and the
// leaderboard; ▶ Watch opens the night full screen, over the whole page (the Ocean is a place, not the Lab's workbench):
// the night replayed from its record (frames every 5 s) as a highlight reel that follows one cell of the species you
// follow close up, slowing at its moments, each popping up as it happens; a HUD (night, clock, minimap, its badge, a
// track with its moments). Cells are drawn from what their species carries (board.json's part counts: described, never
// given), not their exact layout. Until releases exist (step 5) you pick a species to follow; it will become "yours".
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const KEY = 'tinygod.ocean';
const TW = 1600, TH = 2000;
const TINT = ['#7cc4f0', '#e39cf0', '#63dccd', '#f4a272', '#bfe27a', '#f080a6', '#9aa6ff', '#e2bf90', '#8fe0f0', '#f0d070', '#c0a0f0', '#90f0a0'];
const ICON = { born: '✦', died: '✖', latched: '🪝', tether: '〰', swallowed: '◉', letgo: '↯', arrived: '⬇', replaced: '⟳' };
const hour = (d) => { let h = 6 + 24 * (d + 0.06); return h - 24 * Math.floor(h / 24); };
const hhmm = (d) => { const h = hour(d); return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor(60 * (h % 1))).padStart(2, '0')}`; };
const light = (d) => { const s = Math.sin(2 * Math.PI * (d + 0.06)); return s > 0 ? Math.sqrt(s) : 0; };
const ord = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th');
const rnd = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };

const CSS = `
#oceanBox .oline { font-size: 15px; line-height: 1.4; margin: 6px 0 10px; } #oceanBox .oline b { color: #ffc952; }
#oceanBox .ometa { font-size: 12px; color: var(--dim, #8aa0b4); display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
#oceanBox select { max-width: 100%; }
#oceanBox .owatch { display: block; width: 100%; margin: 8px 0 12px; padding: 14px; font-size: 17px; font-weight: 700; color: #2b1d00; background: #ffc952; border: 0; border-radius: 999px; cursor: pointer; }
#oceanBox .owatch:disabled { opacity: .5; cursor: default; }
#oceanBox .olb { display: grid; gap: 6px; }
.orow { display: grid; grid-template-columns: 26px 32px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 7px 9px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid transparent; cursor: pointer; }
.orow.mine { border-color: #ffc952; background: linear-gradient(90deg, rgba(255,201,82,.14), rgba(255,255,255,.04) 60%); }
.orow .pos { font: 700 17px/1 system-ui, sans-serif; text-align: center; color: #9cb8c3; }
.orow:nth-child(1) .pos { color: #ffd76e; } .orow:nth-child(2) .pos { color: #d6e2e8; } .orow:nth-child(3) .pos { color: #e0a370; }
.orow canvas { width: 32px; height: 32px; }
.orow .nm { min-width: 0; display: grid; gap: 3px; } .orow .nm b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.orow .nm span { font-size: 11px; color: #9cb8c3; }
.orow .gb { height: 5px; border-radius: 3px; background: rgba(156,184,195,.18); overflow: hidden; } .orow .gb i { display: block; height: 100%; border-radius: 3px; }
.orow .sc { text-align: right; font: 700 15px/1 system-ui, sans-serif; font-variant-numeric: tabular-nums; } .orow .sc small { display: block; font-size: 10px; color: #9cb8c3; font-weight: 500; }
#oceanBox .onote { font-size: 12px; color: #9cb8c3; margin-top: 10px; }
#oceanView { position: fixed; inset: 0; z-index: 900; background: #03202c; color: #eef6f7; font-family: system-ui, -apple-system, sans-serif; }
#oceanView canvas.sea { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
#oceanView .hud { position: absolute; inset: 0; pointer-events: none; display: grid; grid-template-rows: auto 1fr auto; grid-template-columns: minmax(0, 1fr);
  padding: max(12px, env(safe-area-inset-top, 0px)) max(14px, env(safe-area-inset-right, 0px)) max(14px, env(safe-area-inset-bottom, 0px)) max(14px, env(safe-area-inset-left, 0px)); }
#oceanView .hud > * { pointer-events: auto; min-width: 0; }
#oceanView .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
#oceanView .night { display: grid; gap: 3px; text-shadow: 0 1px 8px rgba(0,0,0,.6); }
#oceanView .night b { font-size: 12px; letter-spacing: .3em; text-transform: uppercase; color: #9cb8c3; }
#oceanView .night .nn { display: flex; align-items: center; gap: 6px; font: 700 clamp(24px, 6vw, 38px)/1 system-ui, sans-serif; }
#oceanView .night .nn button { font-size: 16px; width: 30px; height: 30px; padding: 0; border-radius: 50%; }
#oceanView .night small { font: 600 13px/1.2 ui-monospace, Menlo, monospace; opacity: .85; font-variant-numeric: tabular-nums; }
#oceanView .tr { display: grid; gap: 8px; justify-items: end; }
#oceanView .mini { width: 88px; aspect-ratio: 4 / 5; border: 1px solid rgba(156,184,195,.45); border-radius: 8px; background: rgba(4,18,26,.55); }
#oceanView .mini canvas { width: 100%; height: 100%; display: block; }
#oceanView button { font: 600 13px/1 system-ui, sans-serif; color: #eef6f7; background: rgba(4,18,26,.72); border: 1px solid #1b4153; border-radius: 999px; padding: 9px 13px; cursor: pointer; white-space: nowrap; }
#oceanView button:focus-visible { outline: 2px solid #ffc952; outline-offset: 2px; }
#oceanView .toasts { align-self: start; justify-self: center; display: grid; gap: 8px; margin-top: 8px; width: min(420px, 100%); }
#oceanView .toast { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 14px; background: rgba(6,26,36,.84); border: 1px solid rgba(255,201,82,.55); box-shadow: 0 8px 30px rgba(0,0,0,.45); animation: opop .45s cubic-bezier(.2,1.4,.4,1) both; font-weight: 600; font-size: 14px; }
#oceanView .toast i { font-style: normal; font-size: 19px; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: rgba(255,201,82,.16); flex: none; }
#oceanView .toast.born { border-color: rgba(127,240,192,.6); } #oceanView .toast.died { border-color: rgba(255,122,102,.65); }
#oceanView .toast small { display: block; font: 500 12px/1.3 ui-monospace, Menlo, monospace; color: #9cb8c3; }
#oceanView .toast.out { animation: ofade .5s ease both; }
@keyframes opop { from { transform: translateY(-14px) scale(.9); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ofade { to { opacity: 0; transform: translateY(-8px); } }
#oceanView .bottom { display: grid; gap: 10px; }
#oceanView .badge { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 16px; background: rgba(4,18,26,.74); border: 1px solid #1b4153; max-width: 460px; cursor: pointer; }
#oceanView .badge canvas { width: 50px; height: 50px; flex: none; }
#oceanView .badge .bt { display: grid; gap: 1px; min-width: 0; } #oceanView .badge .bt b { font-size: 16px; } #oceanView .badge .bt span { font-size: 12px; color: #9cb8c3; }
#oceanView .rank { margin-left: auto; text-align: center; flex: none; } #oceanView .rank b { display: block; font: 700 26px/1 system-ui, sans-serif; color: #ffc952; }
#oceanView .rank small { font-size: 10px; color: #9cb8c3; letter-spacing: .08em; }
#oceanView .bar { display: flex; align-items: center; gap: 8px; min-width: 0; }
#oceanView .bar .play { width: 44px; height: 44px; padding: 0; font-size: 16px; background: #ffc952; color: #2b1d00; border-color: #ffc952; flex: none; }
#oceanView .bar .on { border-color: #ffc952; color: #ffc952; }
#oceanView .track { position: relative; flex: 1; min-width: 0; height: 44px; }
#oceanView .track input { position: absolute; inset: 0; width: 100%; margin: 0; opacity: 0; cursor: pointer; }
#oceanView .rail { position: absolute; left: 0; right: 0; top: 20px; height: 4px; border-radius: 2px; background: rgba(156,184,195,.3); }
#oceanView .fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 2px; background: #ffc952; }
#oceanView .knob { position: absolute; top: -6px; width: 16px; height: 16px; margin-left: -8px; border-radius: 50%; background: #eef6f7; box-shadow: 0 0 0 4px rgba(255,201,82,.35); }
#oceanView .mk { position: absolute; top: -5px; width: 6px; height: 14px; margin-left: -3px; border-radius: 3px; }
#oceanView .dn { position: absolute; left: 0; right: 0; top: 30px; height: 4px; border-radius: 2px; }
#oceanView .msg { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 20px; color: #9cb8c3; }
@media (prefers-reduced-motion: reduce) { #oceanView .toast { animation: none; } }`;

export function initOcean() {
  const box = document.getElementById('oceanBox');
  if (!box) return;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  let saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } })();
  const remember = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* private mode */ } };
  let board = null, nights = {}, follow = saved.follow || null;

  // ---- data: ocean/board.json and ocean/nights/<n>.json.gz (unpacked here; days counted from the night's dawn) ----
  async function loadNight(n) {
    if (nights[n]) return nights[n];
    const got = await fetch(`../ocean/nights/${n}.json.gz`, { cache: 'no-cache' });
    if (!got.ok) throw new Error(`night ${n} is not there (${got.status})`);
    const buf = new Uint8Array(await got.arrayBuffer());
    let text;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unpack the night (too old)');
      text = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else text = new TextDecoder().decode(buf);   // a server that unpacked it already
    const r = JSON.parse(text), f = r.from || 0, sh = (d) => d - f;
    r.frames.forEach((x) => { x.d = sh(x.day ?? x.d); });
    r.life.forEach((x) => { x.day = sh(x.day); });
    r.events.forEach((x) => { x.day = Math.max(0, sh(x.day)); });
    return (nights[n] = r);
  }
  const rowOf = (sp) => board && board.rows.find((r) => r.name === sp);
  const tintOf = (names) => (sp) => TINT[Math.max(0, names.indexOf(sp)) % TINT.length];

  // ---- words ----
  function eventsFor(N, sp) {
    if (!sp) return N.events.filter((e) => e.kind === 'died' || e.kind === 'swallowed' || e.kind === 'latched');
    return N.events.filter((e) => e.kind !== 'arrived' && (e.species === sp || e.prey === sp || e.by === sp || e.hit === sp));
  }
  function say(e, sp) {
    const who = (s) => (s === sp ? `the ${s}` : `a ${s}`), Me = (s) => (s === sp ? s : `A ${s}`);
    if (e.kind === 'born') return [`${Me(e.species)} divided${e.species === sp ? '!' : ''}`, `${e.cells} cells now`];
    if (e.kind === 'died') {
      if (e.by && e.by !== e.species) return [`${Me(e.by)} ${e.why.startsWith('drained') ? 'drained' : e.why.startsWith('eaten') ? 'swallowed' : 'killed'} ${who(e.species)}${e.by === sp ? '!' : ''}`, e.why];
      return [`${e.species === sp ? `One ${e.species}` : `A ${e.species}`} died`, e.why];
    }
    if (e.kind === 'latched') return [`${Me(e.species)} hooked ${who(e.prey)}`, 'a feeding tube'];
    if (e.kind === 'tether') return e.hit ? [`${Me(e.species)} lassoed ${who(e.hit)}`, 'tied on a line'] : [`${Me(e.species)} threw a tether`, 'missed'];
    if (e.kind === 'swallowed') return [`${Me(e.species)} swallowed ${who(e.prey)}`, 'whole'];
    if (e.kind === 'letgo') return [`${Me(e.species)} let go of ${who(e.prey)}`, e.why];
    if (e.kind === 'arrived') return [`${e.cells} ${e.species} arrived`, e.returned ? 'back from extinction' : 'released'];
    if (e.kind === 'replaced') return [`${e.species} was replaced`, `by ${e.by}`];
    return [e.kind, ''];
  }
  const kindOf = (e, sp) => (e.kind === 'born' ? 'born' : e.kind === 'died' && e.species === sp ? 'died' : 'hunt');
  function line(N, sp) {
    const r = rowOf(sp);
    if (!r) return '';
    const born = N.events.filter((e) => e.kind === 'born' && e.species === sp).length;
    const kills = N.events.filter((e) => e.kind === 'died' && e.by === sp && e.species !== sp);
    const lost = N.events.filter((e) => e.kind === 'died' && e.species === sp);
    const was = (N.life[0] && N.life[0].s[sp] && N.life[0].s[sp].n) || 0;
    const bits = [r.cells > was ? `grew from ${was} cells to <b>${r.cells}</b>` : r.cells === was ? `held its ${was} cells` : r.cells ? `fell from ${was} cells to ${r.cells}` : '<b>died out</b>'];
    if (kills.length) bits.push(kills.map((k) => `${k.why.startsWith('drained') ? 'drained' : 'killed'} a ${esc(k.species)}`).join(', '));
    if (lost.length) bits.push(`lost ${lost.length} (${[...new Set(lost.map((d) => esc(d.why)))].join(', ')})`);
    if (!born && !kills.length && !lost.length && r.cells) bits.push('a quiet night');
    return `<b>${esc(sp)}</b> ${bits.join(', ')}, and ranks <b>${ord(r.rank)}</b> of ${board.rows.length}.`;
  }

  // ---- drawing a cell (see-through body, organelles, its species' parts) ----
  function drawCell(g, c, sp, P, base, own, s, px, py, now, dim) {
    const [uid, , , , ang, r, len, dead] = c, DPR = s.dpr;
    const R = Math.max(own ? 3.5 * DPR : 2.6 * DPR, r * s.k), hl = (len || 0) * s.k / 2, wob = Math.sin(now / 260 + uid) * 0.06;
    g.save(); g.translate(px, py); g.rotate(-ang * Math.PI / 180);
    g.globalAlpha = dead ? 0.4 : dim ? 0.75 : 1;
    const big = R > 5 * DPR, k = s.k;
    if (big && !dead) {
      g.strokeStyle = base; g.lineCap = 'round';
      if (P.tail || P.oar) { g.lineWidth = Math.max(1, 0.8 * k); g.beginPath(); const L0 = 48 * k; for (let i = 0; i <= 16; i++) { const u = i / 16, xx = -(hl + R) - u * L0, yy = Math.sin(u * 9 - now / 60 + uid) * 5 * k * u; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke(); }
      if (P.tube) { g.lineWidth = Math.max(1.4, 1.6 * k); g.strokeStyle = '#ff9bb5'; g.beginPath(); g.moveTo(hl + R * 0.7, R * 0.6); g.lineTo(hl + R + 20 * k, R * 0.6 + 8 * k); g.stroke(); }
      if (P.spine || P.harpoon) { g.lineWidth = Math.max(1, 0.6 * k); g.strokeStyle = 'rgba(230,245,255,.75)'; for (const a of [0.9, -0.9, 3.14]) { g.beginPath(); g.moveTo(Math.cos(a) * (hl + R), Math.sin(a) * R); g.lineTo(Math.cos(a) * (hl + R + 18 * k), Math.sin(a) * (R + 14 * k)); g.stroke(); } }
      if (P.tether) { g.lineWidth = Math.max(1, 0.5 * k); g.strokeStyle = 'rgba(220,240,255,.55)'; g.beginPath(); g.moveTo(hl + R, 0); for (let i = 1; i <= 8; i++) g.lineTo(hl + R + i * 3 * k, Math.sin(i * 1.6) * 2 * k); g.stroke(); }
      if (P.mouth) { g.fillStyle = 'rgba(20,10,10,.6)'; for (let i = 0; i < Math.min(4, P.mouth); i++) { const a = i * Math.PI / 2; g.beginPath(); g.arc(Math.cos(a) * (hl + R * 0.92), Math.sin(a) * R * 0.92, R * 0.16, 0, 7); g.fill(); } }
    }
    if (own && !dead) { g.shadowColor = 'rgba(255,201,82,.9)'; g.shadowBlur = 18 * DPR; }
    const bg = g.createLinearGradient(0, -R, 0, R); bg.addColorStop(0, base + 'cc'); bg.addColorStop(1, base + '55');
    g.fillStyle = dead ? '#6c7a80' : bg;
    const Rw = R * (1 + wob);
    g.beginPath(); g.moveTo(-hl, -Rw); g.lineTo(hl, -Rw); g.arc(hl, 0, Rw, -Math.PI / 2, Math.PI / 2); g.lineTo(-hl, Rw); g.arc(-hl, 0, Rw, Math.PI / 2, -Math.PI / 2); g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.lineWidth = Math.max(1, 0.7 * k); g.strokeStyle = dead ? '#8b979c' : 'rgba(255,255,255,.55)'; g.stroke();
    if (big && !dead) {
      const span = hl + R * 0.4, blob = (u, v, rr, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(u, v, rr * 1.25, rr, 0, 0, 7); g.fill(); };
      if (P.plastid) blob(span * (rnd(uid) - 0.5) * 0.9, -R * 0.25, R * 0.38, 'rgba(126,190,80,.9)');
      if (P.nitroplast) blob(span * (rnd(uid + 4) - 0.5) * 0.9, -R * 0.2, R * 0.22, 'rgba(60,200,190,.9)');
      if (P.store) blob(span * (rnd(uid + 9) - 0.5) * 0.9 - R * 0.2, R * 0.3, R * 0.26, 'rgba(250,230,170,.85)');
      if (P.chamber) blob(span * 0.45, 0, R * 0.34, 'rgba(210,235,255,.45)');
      if (P.nucleus) blob(-span * 0.55, R * 0.05, R * 0.3, 'rgba(176,130,230,.95)');
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-hl * 0.3, -R * 0.55, Math.max(R, hl) * 0.45, R * 0.14, 0, 0, 7); g.fill();
    }
    g.restore();
  }
  function portrait(cv, r, colour, own) {
    const g = cv.getContext('2d'), sz = (r.size.match(/\d+/g) || [20, 20]).map(Number);
    const k = Math.min(cv.width / (sz[1] + 34), cv.height / (sz[0] + 34));
    g.clearRect(0, 0, cv.width, cv.height);
    drawCell(g, [7, 0, 0, 0, 20, sz[0] / 2, sz[1] - sz[0], 0], r.name, r.parts || {}, colour, own, { k, dpr: 1 }, cv.width / 2, cv.height / 2, 0, false);
  }

  // ---- the tab ----
  async function showTab() {
    try {
      const got = await fetch('../ocean/board.json', { cache: 'no-cache' });
      if (!got.ok) throw new Error(`no Ocean here (${got.status})`);
      board = await got.json();
    } catch (e) { box.innerHTML = `<p class="onote">The Ocean can't be reached: ${esc(e.message)}. It lives on the website (and on the home server).</p>`; return; }
    if (!board.night) { box.innerHTML = '<p class="onote">The Ocean is founded; its first night hasn\'t run yet.</p>'; return; }
    if (!follow || !rowOf(follow)) follow = board.rows[0].name;
    let N = null;
    try { N = await loadNight(board.night); } catch (e) { /* the line needs it; the board doesn't */ }
    const names = N ? N.names : board.rows.map((r) => r.name), tint = tintOf(names), top = Math.max(...board.rows.map((r) => r.score), 0.01);
    const cells = board.rows.reduce((a, r) => a + r.cells, 0);
    box.innerHTML = `<div class="ometa"><span>Night ${board.night} · ${cells} cells live here · ${board.rows.length} species</span>
        <label>Follow <select id="oceanFollow">${board.rows.map((r) => `<option ${r.name === follow ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>
      <p class="oline">${N ? line(N, follow) : ''}</p>
      <button class="owatch" id="oceanWatch" type="button" ${N ? '' : 'disabled'}>▶ Watch night ${board.night}</button>
      <div class="olb">${board.rows.map((r) => `<div class="orow ${r.name === follow ? 'mine' : ''}" data-sp="${esc(r.name)}"><div class="pos">${r.rank}</div><canvas width="64" height="64"></canvas>
        <div class="nm"><b>${esc(r.name)}</b><span>${r.house ? 'house' : esc(r.player)} · ${r.cells} cells${r.kills ? ` · ${r.kills} kill${r.kills > 1 ? 's' : ''}` : ''} · ${r.status === 'living' ? `${r.nightsAlive} night${r.nightsAlive > 1 ? 's' : ''} here` : `extinct, back on night ${r.returns}`}</span>
        <div class="gb"><i style="width:${(100 * Math.max(0, r.score) / top).toFixed(0)}%;background:${r.name === follow ? '#ffc952' : tint(r.name)}"></i></div></div>
        <div class="sc">${r.score.toFixed(2)}×<small>growth</small></div></div>`).join('')}</div>
      <p class="onote">Ranked by growth since arrival: living biomass ÷ what its 3 cells arrived with, over the last 7 nights. The Ocean never resets: one ocean day runs every night. Releasing your own species comes next.</p>`;
    box.querySelectorAll('.orow').forEach((row, i) => portrait(row.querySelector('canvas'), board.rows[i], board.rows[i].name === follow ? '#ffd677' : tint(board.rows[i].name), board.rows[i].name === follow));
    const pickIt = (sp) => { follow = sp; saved.follow = sp; remember(); showTab(); };
    document.getElementById('oceanFollow').onchange = (e) => pickIt(e.target.value);
    box.querySelectorAll('.orow').forEach((row) => (row.onclick = () => pickIt(row.dataset.sp)));
    document.getElementById('oceanWatch').onclick = () => openView(board.night);
  }

  // ---- the view: the night, full screen ----
  let view = null;
  async function openView(n) {
    if (view) view.close();
    const el = document.createElement('div');
    el.id = 'oceanView';
    el.innerHTML = `<canvas class="sea"></canvas><div class="msg">Loading night ${n}…</div>
      <div class="hud"><div class="top"><div class="night"><b>The Ocean</b><div class="nn"><button type="button" data-go="-1" aria-label="The night before">‹</button><span>Night ${n}</span><button type="button" data-go="1" aria-label="The night after">›</button></div><small class="clock"></small></div>
        <div class="tr"><button type="button" class="close" aria-label="Back to the Lab">✕ Lab</button><div class="mini" title="The whole Ocean: the box is what you see"><canvas width="176" height="220"></canvas></div></div></div>
        <div class="toasts" aria-live="polite"></div>
        <div class="bottom"><div class="badge"></div><div class="bar"><button class="play" type="button" aria-label="Play">▶</button>
          <div class="track"><div class="dn"></div><div class="rail"><div class="fill"></div><div class="knob"></div></div><input type="range" min="0" max="1" step="0.0005" value="0" aria-label="Time in the night"></div>
          <button class="cam on" type="button">Follow</button></div></div></div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    let alive = true;
    const close = () => { alive = false; el.remove(); view = null; document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    view = { close };
    q('.close').onclick = close;
    el.querySelectorAll('[data-go]').forEach((b) => { const m = n + Number(b.dataset.go); b.disabled = m < 1 || m > board.night; b.style.opacity = b.disabled ? 0.3 : 1; b.onclick = () => openView(m); });
    let N;
    try { N = await loadNight(n); } catch (e) { q('.msg').textContent = e.message; return; }
    if (!alive) return;
    q('.msg').remove();
    const names = N.names, tint = tintOf(names), sp = names.includes(follow) ? follow : null, F = N.frames, NF = F.length;
    const partsOf = (s) => (rowOf(s) && rowOf(s).parts) || {};
    const evs = eventsFor(N, sp);
    const sea = q('canvas.sea'), g = sea.getContext('2d'), DPR = Math.min(2, window.devicePixelRatio || 1);
    let cw = 0, ch = 0;
    const size = () => { const r = sea.getBoundingClientRect(); cw = Math.round(r.width * DPR); ch = Math.round(r.height * DPR); sea.width = cw; sea.height = ch; };
    size(); const ro = new ResizeObserver(size); ro.observe(sea);
    const cam = { x: 800, y: 1000, k: 0.2 };
    let T = Math.max(0, (evs[0] ? evs[0].day : 0.3) - 0.03), playing = false, followOn = true, pick = null, last = performance.now(), shown = new Set();
    const markShown = () => { shown = new Set(evs.map((x, i) => (x.day <= T ? i : -1)).filter((i) => i >= 0)); };
    markShown();
    const fx = [];
    const snow = Array.from({ length: 220 }, (_, i) => ({ x: rnd(i * 3 + 1) * TW, y: rnd(i * 3 + 2) * TH, z: 0.4 + rnd(i * 3 + 3) * 0.8, r: 0.6 + rnd(i * 7) * 1.8 }));
    const far = Array.from({ length: 12 }, (_, i) => ({ x: rnd(i * 5 + 11) * TW, y: rnd(i * 5 + 12) * TH, r: 6 + rnd(i * 5 + 13) * 14, c: TINT[i % TINT.length] }));
    function cellsAt(t) {
      const x = t * (NF - 1), f = Math.min(NF - 2, Math.max(0, Math.floor(x))), a = x - f, A = F[f], B = F[f + 1] || A;
      const nb = new Map(B.c.map((c) => [c[0], c]));
      return { day: A.d + (B.d - A.d) * a, cells: A.c.map((c) => { const m = nb.get(c[0]); if (!m) return c; let da = m[4] - c[4]; da -= 360 * Math.round(da / 360); return [c[0], c[1], c[2] + (m[2] - c[2]) * a, c[3] + (m[3] - c[3]) * a, c[4] + da * a, c[5], c[6], c[7]]; }) };
    }
    const sx = (x) => (x - cam.x) * cam.k + cw / 2, sy = (y) => (cam.y - y) * cam.k + ch / 2;
    function aim(cells, dt) {
      let tx = TW / 2, ty = TH / 2, tk = Math.min(cw / TW, ch / TH);
      const own = sp ? cells.filter((c) => names[c[1]] === sp && !c[7]) : [];
      if (followOn && own.length) {
        const next = evs.find((e) => e.day >= T - 0.004 && e.day <= T + 0.05 && (e.uid || e.preyUid));
        const want = next ? (own.some((c) => c[0] === next.uid) ? next.uid : next.preyUid) : null;
        const lead = own.find((c) => c[0] === want) || own.find((c) => c[0] === pick) || own[0];
        pick = lead[0]; tx = lead[2]; ty = lead[3]; tk = cw / 260;
      }
      const m = Math.min(1, dt * 2.2);
      cam.x += (tx - cam.x) * m; cam.y += (ty - cam.y) * m; cam.k += (tk - cam.k) * m;
      const hw = cw / cam.k / 2, hh = ch / cam.k / 2;
      cam.x = hw * 2 >= TW ? TW / 2 : Math.min(TW - hw, Math.max(hw, cam.x));
      cam.y = hh * 2 >= TH ? TH / 2 : Math.min(TH - hh, Math.max(hh, cam.y));
    }
    function water(day, now) {
      const L = light(day), h = hour(day), dawn = Math.max(0, 1 - Math.abs(h - 6.5) / 1.5) + Math.max(0, 1 - Math.abs(h - 18) / 1.5);
      const col = (y) => { const d = 1 - y / TH, l = L * Math.exp(-2.4 * d); return [Math.round(6 + 40 * l + 30 * dawn * l), Math.round(26 + 120 * l), Math.round(40 + 110 * l)]; };
      const grd = g.createLinearGradient(0, 0, 0, ch); grd.addColorStop(0, `rgb(${col(Math.min(TH, cam.y + ch / cam.k / 2))})`); grd.addColorStop(1, `rgb(${col(Math.max(0, cam.y - ch / cam.k / 2))})`);
      g.fillStyle = grd; g.fillRect(0, 0, cw, ch);
      for (const p of far) { g.fillStyle = p.c + '0b'; g.beginPath(); g.arc((p.x - cam.x) * cam.k * 0.45 + cw / 2, (cam.y - p.y) * cam.k * 0.45 + ch / 2, p.r * DPR * 2.2, 0, 7); g.fill(); }
      if (L > 0.05) {
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 7; i++) {
          const base = ((i * 260 + now * 0.004) % (TW + 400)) - 200, px = sx(base), sw = (40 + 30 * rnd(i + 90)) * cam.k, top = sy(TH), len = 900 * cam.k;
          const sg = g.createLinearGradient(0, top, 0, top + len); sg.addColorStop(0, `rgba(200,240,255,${0.10 * L})`); sg.addColorStop(1, 'rgba(200,240,255,0)');
          g.fillStyle = sg; g.beginPath(); g.moveTo(px, top); g.lineTo(px + sw, top); g.lineTo(px + sw + len * 0.25, top + len); g.lineTo(px + len * 0.25 - sw * 0.4, top + len); g.fill();
        }
        g.restore();
      }
      const ys = sy(TH);
      if (ys > -40) {
        g.fillStyle = `rgba(190,235,255,${0.12 + 0.3 * L})`; g.fillRect(0, ys - 3 * DPR, cw, 3 * DPR);
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 60; i++) { const x = (i / 60) * TW, w = Math.sin(now / 900 + i * 1.7) * 0.5 + 0.5; g.fillStyle = `rgba(210,245,255,${0.08 * L * w})`; g.beginPath(); g.ellipse(sx(x), ys + 30 * cam.k * (0.5 + w), 24 * cam.k, 5 * cam.k, 0, 0, 7); g.fill(); }
        g.restore();
      }
      for (const p of snow) {
        const y0 = (p.y - now * 0.004 * p.z) % TH, yy = y0 < 0 ? y0 + TH : y0, x = p.x + Math.sin(now / 3000 + p.y) * 8;
        const px = (x - cam.x) * cam.k * p.z + cw / 2, py = (cam.y - yy) * cam.k * p.z + ch / 2;
        if (px < -5 || py < -5 || px > cw + 5 || py > ch + 5) continue;
        g.fillStyle = `rgba(220,235,240,${0.18 + 0.25 * p.z * (0.3 + 0.7 * L)})`; g.beginPath(); g.arc(px, py, p.r * DPR * p.z, 0, 7); g.fill();
      }
      if (L < 0.05) for (let i = 0; i < 18; i++) { const tw = Math.sin(now / 400 + i * 2.3); if (tw < 0.7) continue; g.fillStyle = `rgba(110,200,255,${(tw - 0.7) * 2.4})`; g.beginPath(); g.arc(sx(rnd(i + 300) * TW), sy(rnd(i + 400) * TH), 2.2 * DPR, 0, 7); g.fill(); }
      const yf = sy(0);
      if (yf < ch + 40) {
        const bg = g.createLinearGradient(0, yf - 40 * cam.k, 0, yf + 30 * cam.k); bg.addColorStop(0, 'rgba(80,70,50,0)'); bg.addColorStop(0.55, '#3b3324'); bg.addColorStop(1, '#1d180f');
        g.fillStyle = bg; g.beginPath(); g.moveTo(0, ch); for (let x = 0; x <= TW; x += 20) g.lineTo(sx(x), yf - (6 + 6 * Math.sin(x / 37) + 4 * Math.sin(x / 11)) * cam.k); g.lineTo(cw, ch); g.fill();
        g.fillStyle = 'rgba(230,215,170,.35)'; for (let i = 0; i < 80; i++) { g.beginPath(); g.arc(sx(rnd(i + 700) * TW), yf - rnd(i + 800) * 8 * cam.k, (0.6 + rnd(i + 900)) * DPR, 0, 7); g.fill(); }
      }
      return L;
    }
    const mini = q('.mini canvas'), mg = mini.getContext('2d');
    function drawMini(cells, L) {
      const w = mini.width, h = mini.height, k = w / TW;
      const grd = mg.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, `rgba(60,${Math.round(120 + 80 * L)},${Math.round(150 + 60 * L)},.9)`); grd.addColorStop(1, 'rgba(4,18,26,.9)');
      mg.fillStyle = grd; mg.fillRect(0, 0, w, h);
      for (const c of cells) { const own = names[c[1]] === sp; mg.fillStyle = c[7] ? '#6c7a80' : own ? '#ffc952' : tint(names[c[1]]); mg.beginPath(); mg.arc(c[2] * k, (TH - c[3]) * k, own ? 3.4 : 2.2, 0, 7); mg.fill(); }
      const hw = cw / cam.k / 2, hh = ch / cam.k / 2;
      mg.strokeStyle = 'rgba(255,255,255,.85)'; mg.lineWidth = 1.5; mg.strokeRect((cam.x - hw) * k, (TH - cam.y - hh) * k, 2 * hw * k, 2 * hh * k);
    }
    function toast(e) {
      const [a, b] = say(e, sp), t = document.createElement('div');
      t.className = `toast ${kindOf(e, sp)}`; t.innerHTML = `<i>${ICON[e.kind] || '·'}</i><div>${esc(a)}<small>${hhmm(e.day)} · ${esc(b)}</small></div>`;
      const box2 = q('.toasts'); box2.prepend(t); while (box2.children.length > 3) box2.lastChild.remove();
      setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3100);
    }
    function fire(e, now) {
      const { cells } = cellsAt(e.day), at = cells.find((c) => c[0] === e.uid) || cells.find((c) => c[0] === e.preyUid);
      fx.push({ kind: e.kind === 'died' && e.species === sp ? 'died' : e.kind, t0: now, at });
      toast(e);
    }
    const speed = () => { let near = 1; for (const e of evs) { const d = Math.abs(e.day - T); if (d < 0.025) near = Math.min(near, 0.18 + d / 0.025 * 0.82); } return 0.022 * near; };
    const setPlay = () => { q('.play').textContent = playing ? '❚❚' : T >= 1 ? '↺' : '▶'; q('.play').setAttribute('aria-label', playing ? 'Pause' : 'Play'); };
    q('.play').onclick = () => { if (T >= 1) { T = 0; shown.clear(); } playing = !playing; setPlay(); };
    q('.track input').oninput = (e) => { T = +e.target.value; markShown(); };
    const camBtn = q('.cam'), setCam = (on) => { followOn = on; camBtn.classList.toggle('on', on); camBtn.textContent = on ? 'Follow' : 'Whole Ocean'; };
    camBtn.onclick = () => setCam(!followOn);
    let drag = null;
    sea.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; sea.setPointerCapture(e.pointerId); });
    sea.addEventListener('pointermove', (e) => { if (!drag) return; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 2) return; setCam(false); cam.x -= (e.clientX - drag.x) * DPR / cam.k; cam.y += (e.clientY - drag.y) * DPR / cam.k; drag = { x: e.clientX, y: e.clientY }; });
    sea.addEventListener('pointerup', () => { drag = null; });
    // the badge and the track
    const r = sp && rowOf(sp);
    if (r) {
      const kills = N.events.filter((e) => e.kind === 'died' && e.by === sp && e.species !== sp).length, births = N.events.filter((e) => e.kind === 'born' && e.species === sp).length;
      q('.badge').innerHTML = `<canvas width="100" height="100"></canvas><div class="bt"><b>${esc(sp)}</b><span>${r.cells} cells · ${births ? `+${births} born` : 'no divisions'}${kills ? ` · ${kills} kill${kills > 1 ? 's' : ''}` : ''} · ${r.score.toFixed(2)}× its arrival</span></div><div class="rank"><b>${ord(r.rank)}</b><small>OF ${board.rows.length}</small></div>`;
      portrait(q('.badge canvas'), r, '#ffd677', true);
      q('.badge').title = 'Tap: follow its next cell';
      q('.badge').onclick = () => { const own = cellsAt(Math.min(0.9999, T)).cells.filter((c) => names[c[1]] === sp && !c[7]); const i = own.findIndex((c) => c[0] === pick); pick = own.length ? own[(i + 1) % own.length][0] : null; setCam(true); };
    } else q('.badge').innerHTML = `<div class="bt"><b>${follow ? `${esc(follow)} wasn't here this night` : 'The whole Ocean'}</b><span>Pick a species to follow in the Ocean tab.</span></div>`;
    for (const e of evs) { const m = document.createElement('i'); m.className = 'mk'; m.style.left = `${100 * e.day}%`; m.style.background = e.kind === 'born' ? '#7ff0c0' : e.kind === 'died' && e.species === sp ? '#ff7a66' : '#ffb04d'; q('.rail').insertBefore(m, q('.knob')); }
    q('.dn').style.background = `linear-gradient(90deg, ${Array.from({ length: 24 }, (_, i) => { const L = light(i / 24); return `rgba(${Math.round(60 + 190 * L)},${Math.round(90 + 150 * L)},${Math.round(130 + 100 * L)},.55) ${(100 * i / 23).toFixed(1)}%`; }).join(',')})`;
    function frame(now) {
      if (!alive) { ro.disconnect(); return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (playing) {
        const T0 = T; T = Math.min(1, T + speed() * dt);
        evs.forEach((e, i) => { if (!shown.has(i) && e.day > T0 && e.day <= T) { shown.add(i); fire(e, now); } });
        if (T >= 1) { playing = false; setPlay(); }
      }
      const { day, cells } = cellsAt(Math.min(0.9999, T));
      aim(cells, dt);
      const L = water(day, now), S = { k: cam.k, dpr: DPR };
      for (const c of cells.slice().sort((a, b) => (names[a[1]] === sp) - (names[b[1]] === sp))) {
        const px = sx(c[2]), py = sy(c[3]);
        if (px < -120 || py < -120 || px > cw + 120 || py > ch + 120) continue;
        const s2 = names[c[1]], own = s2 === sp;
        drawCell(g, c, s2, partsOf(s2), own ? '#ffd677' : tint(s2), own, S, px, py, now, sp && !own);
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i], a = (now - f.t0) / 1400;
        if (a > 1 || !f.at) { fx.splice(i, 1); continue; }
        const px = sx(f.at[2]), py = sy(f.at[3]), c = f.kind === 'born' ? '127,240,192' : f.kind === 'died' ? '255,122,102' : '255,201,82';
        g.strokeStyle = `rgba(${c},${1 - a})`; g.lineWidth = 3 * DPR * (1 - a); g.beginPath(); g.arc(px, py, (14 + 60 * a) * DPR, 0, 7); g.stroke();
        if (f.kind === 'born') for (let j = 0; j < 10; j++) { const an = j / 10 * 6.28; g.fillStyle = `rgba(${c},${1 - a})`; g.beginPath(); g.arc(px + Math.cos(an) * 46 * a * DPR, py + Math.sin(an) * 46 * a * DPR, 2.5 * DPR, 0, 7); g.fill(); }
      }
      const vg = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,8,12,.55)');
      g.fillStyle = vg; g.fillRect(0, 0, cw, ch);
      drawMini(cells, L);
      q('.clock').textContent = `${hhmm(day)} · ${L > 0.05 ? 'day' : 'night'}`;
      q('.track input').value = T; q('.fill').style.width = `${100 * T}%`; q('.knob').style.left = `${100 * T}%`;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    setTimeout(() => { if (alive) { playing = true; setPlay(); } }, 600);
  }

  // load the tab when it is first shown (or at once on a computer, where every section is shown)
  let loaded = false;
  const sec = box.closest('.sec');
  const tryLoad = () => { if (!loaded && sec && (sec.classList.contains('show') || getComputedStyle(sec).display !== 'none')) { loaded = true; showTab(); } };
  new MutationObserver(tryLoad).observe(sec, { attributes: true, attributeFilter: ['class'] });
  tryLoad();
}
