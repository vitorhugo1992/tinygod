// Death (step 1, author 2026-11-01): a cell whose energy pool has been empty PARAMS.grow.die seconds in a row dies
// (sim/metab.js marks it: cell.dead, diedAt, diedWhy); dead, it earns and spends nothing, its parts are still and its
// buoyancy chambers drift neutral, so it sinks. It is removed on reaching the floor or PARAMS.grow.gone seconds after
// dying, and its nitrogen (its body's share and what its meter held) goes back into the water where it is.
import { PARAMS } from './params.js';
import { takeNitrogen } from './nutrient.js';

const G = PARAMS.grow, DT = PARAMS.time.dt;

export function removeDead(world) {
  if (world.steps % G.every) return;
  const old = world.cells;
  if (!old.some((c) => c.dead && ((world.steps - c.diedAt) * DT >= G.gone || c.q[1] < c.reach + 1))) return;
  const keep = [];
  for (const c of old) {
    if (c.dead && ((world.steps - c.diedAt) * DT >= G.gone || c.q[1] < c.reach + 1)) {
      if (world.nitro) takeNitrogen(world, c.q[1], -(c.grow.Nneed + c.grow.N));   // rotting: its nitrogen back to the water
      for (const p of c.pads) p.link = null;
      world.deaths = (world.deaths || 0) + 1;
      (world.gone ||= []).push(c);   // for the viewer; it empties the list
    } else keep.push(c);
  }
  // pad links name cells by their place in the list: renumber them, drop those to a removed cell
  const at = new Map(keep.map((c, i) => [c, i]));
  world.links = (world.links || []).filter((l) => {
    const a = at.get(old[l.a]), b = at.get(old[l.b]);
    if (a === undefined || b === undefined) { l.padA.link = null; if (l.padB) l.padB.link = null; return false; }
    l.a = a; l.b = b; return true;
  });
  world.cells = keep;
}
