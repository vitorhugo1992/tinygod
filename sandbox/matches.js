// The match ladder (2026-11-09): the rivals a player's species meets, easiest first. Pure data: the page
// (sandbox/match.js) and tools/match.mjs share it. `file`: the rival's design, from the project's root. Each rung has its
// own seed (its starting spots), so the same design always gets the same match: a retry tests the change, not luck.
export const RUNGS = [
  { id: 'r1', title: 'Noctilla', by: 'Claude', what: 'a round swimmer that follows the dim light up and rests in the dark',
    rivals: [{ name: 'Noctilla', file: 'designs/noctilla.json' }] },
  { id: 'r2', title: 'Plebella', by: 'Claude', what: 'a tiny swarm with no nucleus: it divides at once, sticks together and leaks toxin',
    rivals: [{ name: 'Plebella', file: 'designs/plebella.json' }] },
  { id: 'r3', title: 'Nutricline Bobber', by: 'Claude Opus, designed blind from the rules', what: 'a slim rod with a float and a small tail: it bobs between the light and the nitrogen below',
    rivals: [{ name: 'Nutricline Bobber', file: 'tournament/bobber-blind-opus.json' }] },
  { id: 'r4', title: 'Deepdweller II', by: 'Claude, AI tournament round 2 winner', what: 'a slim drifter at the nutricline; its feeding tubes drain what drifts into them',
    rivals: [{ name: 'Deepdweller II', file: 'designs/deepdweller2.json' }] },
  { id: 'r5', title: 'Needle Drifter', by: 'Claude Opus, designed blind from the rules', what: 'a long needle that fixes its own nitrogen: the species that takes most tanks',
    rivals: [{ name: 'Needle Drifter', file: 'tournament/fixer-blind-opus2.json' }] },
  { id: 'r6', title: 'The crowded tank', by: 'three at once', what: 'Plebella, Deepdweller II and Needle Drifter together, one cell of each',
    rivals: [{ name: 'Plebella', file: 'designs/plebella.json' }, { name: 'Deepdweller II', file: 'designs/deepdweller2.json' }, { name: 'Needle Drifter', file: 'tournament/fixer-blind-opus2.json' }] },
];
export const MATCH_DAYS = 2, MATCH_CELLS = 4, MATCH_CAP = 12;   // 4 cells start in all: 2 each one against one, 1 each in a tank of four.
// Sized by what a browser can compute (measured 2026-11-09: 12 cells cost ~0.5 s a sim second; a 2-day match 2-5 min in the
// background); a fast mode would allow longer matches and more cells
export const rungSeed = (i) => i + 1;
export const rungEach = (r) => Math.floor(MATCH_CELLS / (r.rivals.length + 1));
export const rungOpen = (i, best) => i === 0 || best[RUNGS[i - 1].id] > 0;
// The player's species by a name no rival has
export function yourName(design, rung) {
  let n = String((design && design.species) || '').trim();
  if (!n || /^(Round cell|Spiny cell|Plated rod|Oil droplet|Stiff flapper|Flexible oar|Wave tail|Kin chain|Mucus hitchhiker)$/.test(n)) n = 'Your species';
  while (rung.rivals.some((r) => r.name === n)) n += ' (yours)';
  return n;
}
