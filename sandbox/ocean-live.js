// The live Ocean, the page's side (2026-11-19, the Ocean redone, step 1): starts sandbox/ocean-worker.js on last night's
// saved world and hands each frame (the whole world, ready for the Lab's drawing) to the Ocean screen. It also decides
// whether this device can show the Ocean live: if it can't keep about half speed for a while, it says 'slow' and the
// screen plays last night's recording instead (decided with the author, 2026-11-19).
//   const live = startLive({ onFrame(world, info), onState(state, info) })   state: 'loading' | 'live' | 'slow' | 'error'
//   live.speed(x) · live.pause() · live.resume() · live.stop() · live.info → { ratio, cost, cells, steps }
export const LIVE = {
  url: '../ocean/world.json.gz',
  fps: 8,            // frames a second from the worker (the page eases between them)
  minRatio: 0.5,     // slower than half speed …
  judgeAfter: 6000,  // … over this long (ms, after a warm-up of the same length) means 'slow'
};

export function startLive({ onFrame = () => {}, onState = () => {}, speed = 1, url = LIVE.url } = {}) {
  const worker = new Worker(new URL('./ocean-worker.js', import.meta.url), { type: 'module' });
  const info = { ratio: 0, cost: 0, cells: 0, steps: 0, state: 'loading' };
  let t0 = 0, slowSince = 0, stopped = false, currentSpeed = speed;
  const set = (s, extra) => { if (info.state === s) return; info.state = s; onState(s, { ...info, ...extra }); };
  onState('loading', info);
  worker.onmessage = (e) => {
    const m = e.data;
    if (stopped) return;
    if (m.type === 'ready') { info.cells = m.cells; info.steps = m.steps; t0 = performance.now(); set('live'); }
    else if (m.type === 'frame') {
      Object.assign(info, { ratio: m.ratio, cost: m.cost, cells: m.world.cells.length, steps: m.steps });
      const now = performance.now();
      if (now - t0 > LIVE.judgeAfter && info.state === 'live') {   // after the warm-up (loading, the first slow steps)
        if (m.ratio < LIVE.minRatio * currentSpeed) { slowSince = slowSince || now; if (now - slowSince > LIVE.judgeAfter) set('slow'); }
        else slowSince = 0;
      }
      onFrame(m.world, info);
    } else if (m.type === 'error') set('error', { message: m.message });
  };
  worker.onerror = (e) => set('error', { message: e.message || 'the live Ocean could not start' });
  worker.postMessage({ type: 'start', url: new URL(url, import.meta.url).href, speed, fps: LIVE.fps });
  return {
    info,
    speed(x) { currentSpeed = x; slowSince = 0; worker.postMessage({ type: 'speed', speed: x }); },
    pause() { worker.postMessage({ type: 'pause' }); },
    resume() { slowSince = 0; t0 = performance.now(); worker.postMessage({ type: 'resume' }); },
    stop() { stopped = true; worker.terminate(); },
  };
}
