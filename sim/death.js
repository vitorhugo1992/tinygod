// Death (step 1, author 2026-11-01): a cell whose energy pool has been empty PARAMS.grow.die seconds in a row dies
// (sim/metab.js marks it: cell.dead, diedAt, diedWhy); dead, it earns and spends nothing, its parts are still and its
// buoyancy chambers drift neutral, so it sinks. It is removed PARAMS.grow.gone seconds after dying, or, if it reaches the
// floor, that long after landing (author, 2026-11-03: it lies there, grey, instead of vanishing on contact), and its nitrogen (its body's share and what its meter held) goes back into the water where it is.
import { PARAMS } from './params.js';
import { takeNitrogen } from './nutrient.js';

const G = PARAMS.grow, DT = PARAMS.time.dt;

export function removeDead(world) {
  if (world.steps % G.every) return;
  const old = world.cells;
  // rotting where it dies (author 2026-11-05, recycling where life happens; was: where it was removed, mostly the floor):
  // its body's nitrogen, its meter's and what is left of a meal it was digesting go into the water at once
  if (world.nitro) for (const c of old) if (c.dead && !c.rotted && !c.eatenBy && c.grow) {
    const meal = c.meal ? c.meal.N * Math.max(0, 1 - c.meal.t / PARAMS.engulf.time) : 0;
    takeNitrogen(world, c.q[1], -(c.grow.Nbody + c.grow.N + meal), c.q[0]);
    c.rotted = true; c.grow.Nbody = 0; c.grow.N = 0; c.meal = null;
  }
  // the dead go G.gone s after dying, or after landing on the floor; one eaten whole at once (it is inside its predator)
  for (const c of old) if (c.dead && c.landedAt === undefined && c.q[1] < c.reach + 1) c.landedAt = world.steps;
  const goes = (c) => c.dead && (c.eatenBy || (world.steps - (c.landedAt ?? c.diedAt)) * DT >= G.gone);
  if (!old.some(goes)) return;
  const keep = [];
  for (const c of old) {
    if (goes(c)) {
      if (world.nitro && !c.eatenBy && !c.rotted) takeNitrogen(world, c.q[1], -(c.grow.Nbody + c.grow.N), c.q[0]);   // (rotted already, as a rule)
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
