// The Ocean's sides join up (author, 2026-11-20: "when cells are pushed to the side limits of the ocean they spawn in the
// other side, like making full circle"): in a world with `wrap` (only the Ocean's: the Lab's tank keeps its walls) the
// tank is a loop across. stepWorld sets WRAP for the step; every place that compares positions across the tank (contact,
// sensing, tubes, pads, harpoons, the grids) asks here for the nearest image. Off, nothing here is used: the Lab's results
// are the same bit for bit.
import { PARAMS } from './params.js';

export const TW = PARAMS.tank.w;
export let WRAP = false;
export function setWrap(on) { WRAP = !!on; }
// what to add to bx so it is the image of b nearest to ax (0 unless the two are more than half the tank apart)
export const shiftTo = (ax, bx) => { const d = ax - bx; return d > TW / 2 ? TW : d < -TW / 2 ? -TW : 0; };
// a difference across the tank, made the shortest way round
export const across = (d) => (d > TW / 2 ? d - TW : d < -TW / 2 ? d + TW : d);
// a place across the tank brought back into [0, TW)
export const inTank = (x) => (x < 0 ? x + TW * Math.ceil(-x / TW) : x >= TW ? x - TW * Math.floor(x / TW) : x);
// a cell moved across by s µm (to meet a neighbour on the other side of the seam, then moved back exactly)
export function lend(c, s) {
  const keep = { q: c.q[0], cx: Float64Array.from(c.cx) };
  c.q[0] += s;
  for (let i = 0; i < c.cx.length; i++) c.cx[i] += s;
  return keep;
}
export function giveBack(c, keep) { c.q[0] = keep.q; c.cx.set(keep.cx); }
