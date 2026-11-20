// The Ocean's life stories (2026-11-20, the Ocean redone, step 4; author: "yes"): each species' night in one line and its
// milestones (arrived, back from extinction, first division, 5 / 10 / 15 / 20 cells, at its ceiling, first kill, a tube
// it escaped, its first cell lost to a predator, down to its last cell, died out, rose to 1st, into the top 3, a week
// here), each with its moment in the night (t, 0-1) so the page can replay it. Public, like the board (decided
// 2026-11-20: every species' story and stats are public; designs and rules never). Written by tools/ocean.mjs into
// ocean/story.json: { night, species: { name: [{ night, from, to, line, ms: [{ k, text, tone, t, uid }] }] }, mem }.
//   storyNight(story, st, N)   adds night N (its record: nights/<n>.json.gz) for every species with a row that night
//   rankAt(st, n)              the board's ranks after night n (growth since arrival, over the last 7 nights)
export const STEPS = [5, 10, 15, 20];

export function rankAt(st, n, keep = 7) {
  const rows = [];
  for (const s of Object.values(st.species)) {
    const ns = s.nights.filter((x) => x.night <= n), now = ns[ns.length - 1];
    if (!now || now.night !== n) continue;
    const last = ns.slice(-keep);
    rows.push({ name: s.name, score: last.reduce((t, x) => t + x.growth, 0) / last.length, share: now.share || 0 });
  }
  rows.sort((a, b) => b.score - a.score || b.share - a.share);
  return new Map(rows.map((r, i) => [r.name, i + 1]));
}

const verb = (why) => (/^drained/.test(why) ? 'drained' : /^eaten|swallow/.test(why) ? 'swallowed' : /harpoon/.test(why) ? 'harpooned' : /poison/.test(why) ? 'poisoned' : 'killed');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// what happened to it that night, in one line (the page used to work this out from the record itself)
export function nightLine(N, sp, was, end) {
  const ev = N.events, born = ev.filter((e) => e.kind === 'born' && e.species === sp).length;
  const kills = ev.filter((e) => e.kind === 'died' && e.by === sp && e.species !== sp);
  const lost = ev.filter((e) => e.kind === 'died' && e.species === sp);
  const arrived = ev.find((e) => e.kind === 'arrived' && e.species === sp);
  const bits = [];
  if (arrived) bits.push(`${arrived.returned ? 'came back' : 'arrived'} as ${was} cells`);
  bits.push(end > was ? `grew from ${was} cells to ${end}` : end === was ? `held its ${was} cells` : end ? `fell from ${was} cells to ${end}` : 'died out');
  if (kills.length) bits.push(kills.map((k) => `${verb(k.why)} a ${k.species}`).join(', '));
  if (lost.length) bits.push(`lost ${lost.length} (${[...new Set(lost.map((d) => d.why))].join(', ')})`);
  if (!born && !kills.length && !lost.length && end) bits.push('a quiet night');
  return cap(bits.join(', ')) + '.';
}

export function storyNight(story, st, N) {
  const n = N.night, span = (N.to - N.from) || 1, T = (e) => Math.max(0, Math.min(1, Math.round((e.day - N.from) / span * 1000) / 1000));
  story.mem ||= {}; story.species ||= {};
  const before = rankAt(st, n - 1), after = rankAt(st, n);
  for (const s of Object.values(st.species)) {
    const row = s.nights.find((x) => x.night === n);
    const sp = s.name, ev = N.events;
    const arrivedEv = ev.find((e) => e.kind === 'arrived' && e.species === sp);
    if (!row || (!row.cells && !ev.some((e) => e.species === sp))) continue;   // not here that night (extinct, waiting)
    const m = story.mem[sp] ||= { divided: false, killed: false, lostTo: [], top: 0, steps: [], staysSeen: 0 };
    const prev = s.nights.find((x) => x.night === n - 1), was = arrivedEv ? arrivedEv.cells : prev ? prev.cells : 0;   // where the night started
    const end = row.cells, ms = [];
    const add = (k, text, tone, e) => ms.push({ k, text, tone: tone || '', t: e ? T(e) : 0, uid: e && e.uid ? e.uid : undefined });
    if (arrivedEv) {
      if (arrivedEv.returned) { add('returned', 'Back from extinction', 'gold', arrivedEv); m.steps = []; }
      else add('arrived', s.version > 1 ? `Released: version ${s.version}` : 'Arrived in the Ocean', 'gold', arrivedEv);
    }
    for (const e of ev) {
      if (e.kind === 'born' && e.species === sp) {
        if (!m.divided) { m.divided = true; add('division', 'First division', 'gold', e); }
        for (const k of STEPS) if (e.cells >= k && !m.steps.includes(k)) { m.steps.push(k); add('cells', `${k} cells`, 'gold', e); }
        if (st.rules && e.cells >= st.rules.capSpecies && !m.steps.includes('cap')) { m.steps.push('cap'); add('cap', `At the ceiling: ${e.cells} cells`, 'gold', e); }
      } else if (e.kind === 'died' && e.by === sp && e.species !== sp) {
        if (!m.killed) { m.killed = true; add('kill', `First kill: ${verb(e.why)} a ${e.species}`, 'gold', e); }
      } else if (e.kind === 'letgo' && e.prey === sp && /torn|rule/.test(e.why || '')) {
        const lived = !ev.some((d) => d.kind === 'died' && d.species === sp && d.by === e.species && d.day >= e.day);
        if (lived && !ms.some((x) => x.k === 'escaped')) add('escaped', `Escaped a ${e.species}'s tube`, 'gold', { day: e.day });
      } else if (e.kind === 'died' && e.species === sp) {
        if (e.by && e.by !== sp && !m.lostTo.includes(e.by)) { m.lostTo.push(e.by); add('lost', `First cell lost to a ${e.by}`, 'red', e); }
        if (e.cells === 1 && end) add('last', 'Down to its last cell', 'red', e);
      }
    }
    if (!end && row.cells === 0 && s.stays.some((x) => x.to === n && x.why && x.why !== 'replaced')) {
      const stay = s.stays.find((x) => x.to === n), last = ev.filter((e) => e.kind === 'died' && e.species === sp).pop();
      add('extinct', `Died out (${stay.why})`, 'red', last || { day: N.to });
    }
    const r0 = before.get(sp), r1 = after.get(sp);
    if (r1 === 1 && r0 !== 1) add('rank', 'Rose to 1st', 'gold', { day: N.to });
    else if (r1 && r1 <= 3 && (!r0 || r0 > 3)) add('rank', `Into the top 3 (${r1}${r1 === 2 ? 'nd' : 'rd'})`, 'gold', { day: N.to });
    const stay = s.stays.find((x) => x.from <= n && (!x.to || x.to >= n));
    if (end && stay && (!stay.to || stay.to > n) && (n - stay.from + 1) % 7 === 0) add('week', (n - stay.from + 1) === 7 ? 'A week in the Ocean' : `${(n - stay.from + 1) / 7} weeks in the Ocean`, 'gold', { day: N.to });
    ms.sort((a, b) => a.t - b.t);
    (story.species[sp] ||= []).push({ night: n, from: was, to: end, rank: r1 || null, line: nightLine(N, sp, was, end), ms });
  }
  story.night = n;
  return story;
}
