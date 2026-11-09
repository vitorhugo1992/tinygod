// Runs one match off the page's thread, so the tank and the panel stay usable. In: { entries, seed, days, each, cap }.
// Out, about five times a second: { type: 'progress' | 'done', result, pop } (sim/match.js), or { type: 'error', message }.
import { newMatch, stepMatch, matchResult } from '../sim/match.js';

onmessage = (e) => {
  let m;
  try { m = newMatch(e.data); } catch (err) { postMessage({ type: 'error', message: err.message }); return; }
  const slice = () => {
    try {
      const until = performance.now() + 200;
      while (!m.over && performance.now() < until) stepMatch(m, 100);
      postMessage({ type: m.over ? 'done' : 'progress', result: matchResult(m), pop: m.pop });
      if (!m.over) setTimeout(slice, 0);
    } catch (err) { postMessage({ type: 'error', message: err.message }); }
  };
  slice();
};
