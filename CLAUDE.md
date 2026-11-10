# TinyGod

Players **design their own phytoplankton species** from parts and try to make it dominate a water column.
The author is a **phytoplankton researcher**: the biology carries weight, and their corrections on biology are
authoritative.

## Start here (handoff, 2026-11-01)

**FAST MODE, option A BUILT (2026-11-10; author: "yes").** physics.js: (1) **assembleBody** (exact): a cell moving as
one body (no joints, or every joint held still) has its balance written out term by term for its three unknowns;
(2) **the water once per cell** (results shift): flow.js flowGradAt gives the water and its change at the body's
centre, each piece takes u + the change over its offset (first order: keeps the stretch that turns a rod along the
stream); (3) **fixed pieces' directions composed** from the parent's with the mount's sine and cosine worked out once
(results shift in the last bits). 71 checks and the 17 mission cases pass. **Bench, 30 sim s, ms per sim second, at
the start -> now:** 6 Deepdweller II 61 -> 42; 6 Noctilla 109 -> ~99; the mixed ten 148 -> ~149; 4 Lanternrod 180 ->
~131-163 (the timings wander ±15% between runs on this computer: run the bench twice). **So: ~1.45× for drifters,
little for cells with beating tails** (their cost is the joints' own balance, m² per piece, and the 20 sub-steps a
beat). New fingerprints: ecafee6a, 0ab12721, 4efb85ef, 1acc15aa. **Every contest recorded before today was run on the
old numbers.** Not rerun: the 3-day lives of the house species, a 5-seed contest. **Still open:** (B) sensing, rules and
metabolism every 10 ms (~30% of the time is there); (C) a measured gait for matches. Matches stay at 2 days, 12 cells.
**MORE MISSIONS (author, 2026-11-10: "we need more missions, the ones we have barely scratch all possibilities").**
Proposed, waiting for a go on chapter 3 first: **3 Growing** (7 feed in the deep: the nutrient sensor; 8 divide at
dawn: the DIVIDE rule, a cell that splits at dusk and starves; 9 make your own nitrogen: the nitroplast; 10 grow or
split: the Size reading), **4 Other species** (11 too spiky to swallow: spines against a mouth; 12 jump away: the
spring on Drained; 13 stick together: kin pads, a chain too long to swallow; 14 drain it: the peduncle; 15 poison the
water: the leaking sac against a swarm; 16 the harpoon), **5 The tank** (17-18: plates against tubes, the oar and
statolith; then the Matches ladder). Needs in missions.js: goals on cell count and size, a rival placed in the
mission's tank, goals over 2-3 days, and each part opening with its own mission (not 13 at once after mission 6).

**SLOTS EARNED BY STARS, BUILT (2026-11-10; author: "agree with ur take on the slots").** sandbox/main.js only (the
simulation, rivals and AI entries keep the nucleus's own 16): 6 slots open at first, one more for every 3 stars in
missions and matches together (SLOTS_START, SLOTS_PER, starsTotal, openSlots; 30 stars open all 16; 🔓 All parts opens
them at once). slotsShort() refuses a new sensor (＋ Add, a mirror copy) or rule group that would need a shut slot and
says how many stars open the next; a design that already uses more (saved, pasted, From Claude) loads and runs. The
meter is hidden until a design uses over half its open slots; shut slots are drawn dashed. The stars' declaration moved
up beside `let mission` (the meter reads it at the first load). Seen in the page: 6 stars, 8 slots, the 9th eyespot
refused.
**FAST MODE, stages 0 and 1 BUILT (author: "go"); stage 2 NOT started, and its gain is smaller than promised.**
**0:** tools/bench.mjs [sim seconds]: four fixed tanks, ms per sim second and a fingerprint of the end state (same
fingerprint = results bit for bit the same). **1 (exact):** physics.js: while every joint of a cell is held still
(motors off, hinges latched) only the body's three unknowns are assembled and solved (LIM, solveBody). Fingerprints
unchanged; 71 checks and the 17 mission cases pass. **Measured, 30 sim s, before -> after:** 6 Deepdweller II 61 -> 64
ms per sim second (no gain: it has no joints), 6 Noctilla 109 -> 95, the mixed ten 148 -> 139, 4 Lanternrod 180 -> 131.
**What the profile says now (bench tanks):** assemble 33%, flowAt 11%, velocities 7.5%, updatePose 7%; and ~30% is not
physics at all: ruleState 7%, interact 6%, metabolize 6%, sense 4%, garbage 3.5%: **rules, sensors and metabolism run
every millisecond.** So stage 2 as planned (rigid cells as one cached body, the water sampled once per cell) would
give about 2× on drifters and ~1.3× on swimmers, not 3-6×. **The real lever is how often things run:** a cell with
nothing moving doesn't need 1 ms steps, and rules and metabolism don't need 1,000 looks a second. Options for the
author: (A) stage 2 as planned (~2×, results shift once); (B) also run sensing, rules and metabolism every 10 ms
(another ~1.3×; every timer in sense / metab / interact must use the longer step: careful work); (C) the measured
gait for matches and Skip (large, a different simulation for matches). Claude's lean: A then B, and measure before C.

**2026-11-10, after the author tried the matches (pushed).** (1) On a computer the **Missions and Matches sections fold**
to their heading (tap it; `data-fold`, main.js foldSection, localStorage tinygod.folded; on a phone they are tabs, never
folded). (2) **The mission bar has an ✕** beside ▾ (the author "couldn't remove" it; ✕ Leave was there but not seen).
(3) **Leaving a mission brings your own species back** (kept in tinygod.current when the mission starts; it used to
leave the mission's cell in its place). (4) **A match started inside a mission leaves the mission and plays your own
species** (it used to refuse in a note under the list, which read as "nothing is happening"); the running match's box
now sits above the ladder. Seen in headless Edge at 1400×900 and 400×860.
**OPEN QUESTION, the nucleus's slots (author: "don't have much use… the goal was to grow the slots as the cell got more
intelligent, not well implemented enough").** Claude agrees: 16 slots, designs use 3-11, so the limit never binds and
the meter is noise from mission 1. Claude's lean: **slots earned by stars** (start at ~6, +1 per few mission and match
stars up to 16+; the meter hidden until a design uses over half), which gives stars a use and is the author's "smarter
with progress"; the other choice is to drop the limit and hide the meter. Not built: the author to choose.
**FAST MODE, PLAN (author: "yes, plan fast mode"; not started, waits for a go).** Where the time goes (a match
profiled): physics.js assemble 42%, velocities + solve 15%, flowAt 10%, updatePose 7%. Stages, each measured against
the one before: **0. a yardstick first** (tools/bench.mjs: fixed tanks, seconds per sim second; and a hash of the
tank's state after N steps, so every later change shows at once whether results moved). **1. Exact savings** (same
numbers, bit for bit: no refilling of untouched matrix cells, no per-step allocations; expect ~1.2-1.5×). **2. Rigid
cells as one body** (results shift slightly, once: every recorded contest and the mission and match outcomes must be
rerun and checked): a cell with nothing moving this step (no running motor, no spring off its rest: every drifter,
every resting swimmer, spines and tubes) has 3 unknowns, not 3 + its joints, and its drag matrix is fixed in its own
frame (rebuilt when it grows): Deepdweller II is 9 pieces solved as 1; the water sampled once per small cell (speed and
curl at its centre) instead of per piece; contacts found on a grid instead of every pair. Expect 3-6× on drifter
tanks, little for cells swimming all day. **3. Only if still too slow: a measured gait** for matches and Skip (a
beating tail replaced by its thrust and turning measured once per design; the watched tank keeps full physics):
the old "measure each design's movement once" idea; a big change, to decide after stage 2's numbers. **Passes if:**
tools/check.mjs and missions-check.mjs pass, the house species still live alone 3 days, and a 5-seed contest keeps
its order of species. Then matches can go back to 3 days and more cells.

**⚔ MATCHES BUILT (2026-11-09, the review's item 1; author: "do what u think it's best").** A Match tab (second, after
Missions): the design being built against a house rival, a ladder of six: Noctilla, Plebella, Nutricline Bobber
(tournament/bobber-blind-opus.json), Deepdweller II, Needle Drifter (tournament/fixer-blind-opus2.json), then Plebella +
Deepdweller II + Needle Drifter at once; a rung opens with a star on the one before. **Format: 2 cells each (1 each in
the tank of four), 2 days, moving water, at most 12 cells, each rung its own fixed seed** (the same design always gets
the same match). Score as the tournament's (living biomass ÷ starting, averaged over the start and every half day);
★ alive at the end · ★★ outscores every rival · ★★★ twice the best rival's score. **Why so small: speed.** First built
as 4 cells each, 3 days, cap 40: 10 minutes got to day 1.5. A profile of a match: physics.js assemble 42%, velocities
15%, flowAt 10%; 12 cells cost ~0.5 s a sim second. Rung 1 in the page with Deepline Spindle (a fast grower, the worst
case): 289 s, ★★★ (3.6× against Noctilla's 1.2×), the page at 37 fps meanwhile. Lanternrod was left out of the ladder
(four of them took 5 min for half a day: 12 tail pieces and springs). **The ChatGPT and Gemini entries are not rungs**:
their round-2 designs are copies of Deepdweller. **Code:** sim/match.js (pure: newMatch, stepMatch, matchResult,
matchStars, deathsText), sandbox/matches.js (RUNGS, the format), sandbox/match-worker.js (a module worker; where one
can't start the match runs in the page in slices), sandbox/match.js (the tab: ladder, progress bar, population graph,
the verdict with each side's deaths and causes; progress in localStorage tinygod.matches), tools/match.mjs
`<design.json> [rung | all] [--days= --each= --cap=]`. Rivals' designs are fetched from designs/ and tournament/ (the
home server shares no designs/: there the page falls back to GET /designs). sw.js lists the new files (cache v4).
**Not built:** a replay or watching the match tank, several seeds, other players. **Not checked:** a phone's speed; the
order of the rungs by difficulty (only rung 1 was played to the end); tools/check.mjs was not rerun (no existing sim
file changed). **Next: the fast mode** (it decides how long and how full a match can be), then the mission design
points below.

**OUTSIDE REVIEW (2026-11-09, a fresh Claude asked to play it and be critical; author: "great insights, take first what
u think it's best").** Main findings: the page has no game after the six missions (~20 min; contests are Node tools
only); one winning design (a slim rod mid-water with a nitroplast: blind entries' length ÷ width 16, 10, 7 win, 2.2-2.5
lose; a round r 9 cell can't fit its organelles); alone 3 days Lanternrod with / without its nitroplast 6.3× / 4.4×;
speed blocks everything (6 cells at 20× = 5.7× real time); sim/ breaks its own maths rule (Math.hypot, cbrt, sin, cos,
atan2 in ~20 places: fix before replays on other browsers). **Top 5 proposed:** (1) a match in the page (your saved
species vs 2-3 house species, 3 days, Skip, a verdict that says why); (2) a fast mode; (3) the stuck points, then
chapters 3-5; (4) rebalance (a division also pays for its wall by surface; fixers leak part of what they fix; one bad
spell a match; 10+ seeds); (5) an async ladder through GitHub issues with the AI entries as house rivals.
**Stuck points fixed the same day (sandbox/main.js only):** the first tap on ＋ Add to body adds (it used to only show
the ghost when the asked spot was taken); an edited organelle that no longer fits moves to the nearest spot that does
(mission 3's "Size all the way" gave "inclusion sticks out of the body"; findFit now tries depths both ways); in a
mission a changed rule restarts the attempt (restartAttempt; the old verdict stayed up); a new light condition starts as
"less than 25% (dim)" (was "more than 50%"); the design being built is kept between visits (localStorage
tinygod.current, not a mission's cell). Seen in headless Edge at 400×860. **Still open, the author's call:** mission 1's
third star rewards a plastid the budget line marks red (0.6× upkeep), and its two-star win ends starving on the floor;
missions 4 and 6 give three stars for one tap; mission 3's third star can't be won with what was taught; the tank is a
~150 px strip under the mission bar on a phone; 13 parts open at once after mission 6; developer words in the Tank tab
("From Claude", "Send to Claude").

**2026-11-09 (pushed):** README updated (missions, AI entries, new screenshots); the rule editor's range shows each end's
value; its "its day" graph redone (a title in words, the range's ends dashed with values, zones up the side, dawn / noon /
dusk, a legend); **the tank revamped** (author: "feels cheap, not immersive… like looking at a marine slice"; sandbox/scene.js
drawWater / drawBed, main.js draw()): the view is locked to the tank (no zooming out past it filling the screen, no panning
past the sides, surface or seabed; the seabed shows above the clock line and the day graph, the mission bar never covers
the surface), a seabed (uneven lit top, layered textured sediment, grains, old diatom shells, fluff, a haze above it), a
surface seen from below, murk clouds, soft light beams fixed to the water, a far parallax layer of specks, the nitrogen
haze one smooth image (its column seams drew lines). Not yet measured: frame rate on a real phone. **Next:** the author
plays missions 1-6; then chapter 3 (growing) as a plan.

**IDEA FOR LATER (author, 2026-11-08): symbiosis**, species in relationships with each other (not planned yet). Pieces already there: pads that hold strangers (mucus), sharing between joined kin (shareChains: energy and growth N), stolen plastids, the nitroplast (itself an endosymbiont). Possible routes to discuss: a pad that shares with a stranger it holds (a fixer feeding N to a partner that gives energy, like diatom-diazotroph associations, e.g. Richelia in Hemiaulus); hosting a partner inside (an endosymbiont that divides with the host); cleaning or riding (a swimmer carrying a drifter). Needs two players' designs to agree, so it fits matches between species.

**MISSIONS BUILT, chapters 1-2 (2026-11-08; author: "yes" to the plan).** sandbox/missions.js (pure; the page and
tools/missions-check.mjs share it): MISSIONS (id, chapter, title, teaches: Build-panel template names, story, task, design: the
broken cell, start { hour, depth, angle }, three stars: { text, all: [conditions], hint }), startWorld (still water, its hour),
judge(m, world, cell) (sampled once a sim second: alive at an hour · above a depth by / at an hour · never shallower / deeper
between hours · a part under a share of the cell; each star won / lost / pending, J.eta, J.clock), runMission, partOpen (a part
a mission teaches opens with that mission's first star; parts no mission teaches yet open once every mission has a star;
progress.all opens all), missionOpen (the one before has a star). **The six:** (1) Catch the light, plastid (r 10 round, 07:00,
100 µm: ★ alive 13:00, ★★ dusk, ★★★ dusk with a plastid under 7%); (2) Survive the night, store (11:00, 50 µm: midnight / 04:00 /
08:00, the last needs oil or a bigger store); (3) Stay off the floor, chamber (a rod r 10 L 34 with room in front, 07:00 at 800 µm:
above 1,900 µm at noon / above 1,200 at 16:00 / alive at dawn; a default-size chamber doesn't lift, Size all the way does); (4)
Sleep through the night, the REST rule (unlocks the eyespot; 14:00: dawn / 10:00 / noon never on the floor); (5) Swim, wave tail
(round swimmer on the floor at 06:30: above 1,000 µm by noon / by 09:00 / again by 08:00 next day; a tail at the back pushes it
into the floor, at the front with Pull it climbs and levels off where the light is 25%); (6) Fix the rule (its tail runs only
above 25%: turn it round; ★★ never above 400 µm 10:00-16:00, which a 50% rule misses). **Check:** node tools/missions-check.mjs
(17 cases: every broken cell 0 stars, each fix its stars; ~1 min). **Page:** a 🎯 Missions tab (first on a phone and the default
section on a first visit; on a computer the section spans both columns): chapters, stars, ▶ / 🔒, ↺ Start over; playing one:
its design loaded as species "<title>", the tank reset to its start (reset() in mission mode: no carry, still water, its hour),
**every edit restarts the attempt**, undo history cleared; #missionBar over the tank (story, task, the three stars live with
"in 3 h 20 min", ▶ Play, ⏩ Skip to the result (advance() flat out in 40 ms slices), ↺ Again, ✕ Leave; the verdict: stars,
"🔓 X is open", the death and the first missed star's hint, Next mission ▶); the camera keeps the cell below the bar; death
toasts are off in a mission; the Add panel shows only open parts (the taught one pulsing gold) and "🔒 N more parts open as you
finish missions"; 🔓 All parts in ⋯ More. Progress in localStorage tinygod.missions { best, all }. Seen in headless Edge at
400×860 and 1400×900 (mission 1 played: ★★☆, plastid opened, mission 2 opened). **Bug fixed on the way:** a motor with no rule
switched off while starving stayed off for good (metab.js now marks it offBy 'starve', as rest and stun did). **Measured on the
way:** a 25% chamber in a 20 × 54 µm rod rises only ~4 µm/s (90 s to pump light), so a floor start needs a strong plastid; a
chamber's float threshold hardly changes a drifter's day (too slow to follow the light); glare doesn't kill a swimmer, nor does
swimming all night with an oil store. **Next:** the author plays them; then chapters 3-5 (growing, other species, the tank). **Fixes after the author played (2026-11-08):** the bar hides while arranging (body.arranging); mission 5 says "at the FRONT (Where 0°) with ⇠ Pull" in its task and opens the Add panel set that way (mission.builder { where, pull }; the default Where 180° pushes and tips the cell over, which read as "no parts to control its trajectory"); **the Nucleus board was a copy of the parts list** (same rule cards; only its slot meter was new): the slot meter (slotMeter()) now tops the Parts tab, 🧬 Open the nucleus shows only on a computer (where it unfolds the Nucleus window), and tapping the nucleus on a phone opens Parts at its card.

**MISSIONS, PLANNING (2026-11-07; author: "I don't make my own designs because all the functions articulations are a bit daunting, we need a system that rewards slow but steady progress"):** short missions, each teaching one tool from a prepared failing cell, judged by the sim (hints from the trouble log), 1-3 stars (goal / under a limit / harder), a chapter map. Draft chapters: staying alive (plastid, store, chamber), first rules (eyespot + chamber, rest, swimmer), growing (divide, 4 cells), other species (defend, hunt, chains, toxins, harpoons, tethers), the tank (beat a rival). **Decided: parts unlock by missions** (the free sandbox's Build panel starts small and gains each part as its mission is done; a setting can open everything); **a mission starts from a broken cell** (it almost works; you add the one missing thing; later missions hand you less); **an attempt plays live** in the tank at any speed with the goal's progress on screen, and ⏩ Skip to the result works it out in seconds and replays the deciding moment. Still to decide one at a time before building. Shelved the same day (author: "lets leave for now"): why every design is a rod (one body shape; uptake by surface; length no defence against mouths; a diffusion-limited uptake law would penalise size, not shape: a needle keeps 1.6× of its 2× edge).

**NON-FIXERS vs FIXERS (2026-11-07; author: "why fixers always win is what I'm worried about"):** a test before any rule change: three blind non-fixer designs (claude -p, brief only: Opus Abyssal Reed, Sonnet Nutricline Drifter, Opus Deepline Spindle; all aimed deep, 1,400-1,650 µm) and Claude's Bloomeater (designs/_gulper.json: a r 12 L 90 rod, four mouths, eats Needle Drifters; surface at night, ~1,500 µm by day) against Needle Drifter, Lanternrod, Leviathella, Pachyderma; random starts, 5 days, seeds 1-3 (contest.mjs leviathella,pachyderma,_needle,_lantern,_reed,_nutri,_deep,_gulper 5). **Seed 1: Deepline Spindle 13.9× (23 cells) beat Needle Drifter 13.0× (30)**; seed 2: Needle 16.4×, Bloomeater 2.7× (6 cells, 8 kills, all but 2 Needle Drifters), Spindle eaten out by Leviathella; seed 3: Needle 9.0×, Spindle 8.4× (16), Abyssal Reed 2.3×, Bloomeater 2.1×. **Lanternrod died out in all three (eaten by Leviathella, 4-5 a run). Nutricline Drifter starved on the floor every run.** So a non-fixer can match a fixer (a slim, small deep swimmer: Spindle's growth per biomass is high) and a hunter can farm a fixer bloom; Needle Drifter still tops 2 of 3. The _reed, _nutri, _deep, _gulper designs are untracked like the other _ entries.

**NITROPLAST PRICE 300 -> 600 pJ a unit (2026-11-07; author: "go" on Claude's lean)** (a division's N now costs twice the
division's energy; rate unchanged; brief, tip, check 28am follow). **Same 11-species tank rerun, 5 days, seeds 1-3:**
seed 1: Needle Drifter 13.0× (33 cells; was 23.9×), Deepdweller II 4.9×, Bobber 3.5×; seed 2: Needle Drifter 10.1× (22),
Lanternrod 8.1× (12), all else gone; seed 3: Lanternrod 2.4× (2 cells; was 11.3×), Noctilla 1.7×, a sparse tank
(Leviathella 9 kills). Fixers' scores roughly halved but they still top every run. **Why the old species vanish: not
outgrown, they die early (days 0-2) on their own:** eaten by Leviathella, which sits on the floor where everyone starts
(16 of its 17 kills over the three runs; 5 in the first day), or starved on the floor (Saltella, Plebella, Deepdweller
II, Isolume). Needle Drifter no longer crashes at dawn (33 -> 33 over the last half day; was 67 -> 36). **Next, for the
author:** keep 600 (Claude's lean) and look at the start (everyone from the floor beside a floor-living Leviathella).
**RANDOM STARTS BUILT (2026-11-07; author: "species should not always start on the floor but randomly on the tank"):**
sim/start.js startSpots(seed, n): spread across the width (shuffled), each at a random height 100 µm off the floor to
100 µm under the surface; contest.mjs and tournament.mjs use it (contest --floor: the old start); brief and entry page
updated. **IS SHADING WORTH IT? (author asked) Measured:** compute ~0.15 ms a sim second vs ~2,800 ms for the rest at 60
cells: nil. Same tank (random starts, 5 days) with and without (contest.mjs --noshade; makeWorld({ shade })), seeds
1-3, final cells shaded / unshaded: 50 / 72, 42 / 61, 37 / 90; **Needle Drifter's bloom ~0.55×** (38 / 68, 17 / 41,
35 / 58; score 15.7 / 24.8, 8.2 / 16.3, 14.5 / 21.5); small species still alive 4 / 2, 3 / 4, 1 / 4: **it brakes
blooms by about half but doesn't keep more species alive.** Fixers top all six; Plebella, Deepdweller II, Saltella
die out in all six even from random starts; Leviathella 8-17 kills a run.

**SELF-SHADING BUILT (2026-11-07; author chose "plastids only", then "ur recommendation" for strength and giants):**
sim/shade.js, PARAMS.shading { k 0.001733, cell 40 µm, every 1000 steps }: once a sim second every plastid is laid on
a 40 µm grid (its volume spread over the columns its outline covers, in the square of its centre); light at (x, y) =
clear light × e^(−optical depth above it in its column, half its own square), columns blended between their middles;
a cell's own plastids are taken back out (cell.shadeLay), so a cell alone gets exactly today's light. **20 mid-size
cells (~40,000 µm³ of plastid) in a 100 µm column halve the light**; a giant (Leviathella / Pachyderma: one 460,000
µm³ blob ~150 µm wide) leaves ~0.02% under it (the full shadow, no package effect: the lever if giants become
light-hogs). On with grow (world.shade); lightAt(world, y, x, cell) shades only when given x (metab plastid income,
eyespots, the journal; the budget line and rule maps stay clear water). Page: drawShade (scene.js, darker water under
plastids by day), the numbers' "light here … N% shaded by cells above it". Brief: a paragraph under the light. Check
28an (70 checks). Seen in the page (a dark column under a giant, a fainter one under 24 Deepdweller IIs).
**Then started: the 11-species tank, 5 days, 3 seeds** (contest.mjs leviathella,pachyderma,plebella,deepdweller2,
laqueella,_bobber,noctilla,saltella,_lantern,_needle,_isolume 5 --seed=N; the _ designs are the untracked blind fixer
entries copied from tournament/*-blind-*.json; ~2 h per seed). **Results (seed 2 stopped at day 4, author: "good
enough"):** seed 1: Needle Drifter 23.9× (67 cells at day 4.5, 36 at day 5), Lanternrod died out, Deepdweller II 4.0×,
the rest ≤ 1.9×; seed 3: Lanternrod 11.3× (18 cells), Laqueella 2.3×, Needle Drifter died out; seed 2 at day 4:
Lanternrod 22, Bobber 3, Needle 3. **Fixers too strong**: one fixer takes each tank, old species mostly gone (Plebella,
Saltella, Deepdweller II out of most); Leviathella eats them (10-12 kills) but can't keep up. **Shading is a weak brake
when a bloom spreads across the tank** (67 Needle Drifters over 1,600 µm: ~30% loss at the bottom); it bites only in a
crowded column. Needle Drifter's crashes are its dusk division. **NEXT, the author to choose:** raise the nitroplast's
price (PARAMS.fix.cost 300 -> ~600 pJ a unit, Claude's lean) or slow its rate (0.03 N/s per µm³); then rerun this tank.

**NEXT CHAT STARTS HERE (handoff, 2026-11-05).** (1) **Tether snaps traced:** not the reel (a reel-stall was built,
then undone: the reel at 0 µm held only ~3 pN); a Leviathella rising off the floor pulled the line past 40 pN while Laqueella
stayed down (its own drag is only ~2 pN: something else, maybe its second tether, held it; not checked). (2) **Real threats to
giants** talked over; author: no viruses or parasite infection ("invisible stuff, toxins are enough"). (3) **The siege** (scratch
tools/_siege.mjs, uncommitted: 20 Plebellas with two 20 µm tubes, "Tubella", round one Pachyderma; run as
node tools/_siege.mjs [bare] days): plated, at the old price (440k at once): not one latch; bare: ~24 tubes drained ~276M of its
1,420M a day, it died (drained) before day 2.75; the swarm was stuck at 5% nitrogen while the giant floated high, then bloomed
20 -> 132 by day 4 once it sank to the floor. Run time ~110 min for 4 days. (4) **DRILLING BUILT** (author: "yes good idea"; the
idea parked on 2026-11-02): a tube latched on a plated prey pays its own price at once (40k for 20 µm) and DRILLS what the plates
add (f.cost × 2 × thickness) as a flow, PARAMS.feed.drill 2,000 pJ/s, only from its pool above burnBelow; it drains nothing until
through; letting go loses it (lastMeal.drillLost). Code: link.drill / drillAll / drilled; metab.js feed() returns -pay while
drilling (m.drilling). Page: pill DRILLING n%, a gold ring round the latch filling with progress, numbers DRILLING / DRILLED,
log lines. Unplated prey: unchanged. Check 28am (67 checks). **SIEGE RERUN WITH DRILLING (2026-11-05, plated Pachyderma,
stopped at day 3; author: "we have enough info"):** all 20 tubes latched at once and drilled; 13 let go while the giant sank to
~1,840 µm early on, the rest were through by day 0.5; the giant regrew its stores to ~1,445M by day 1.25, then lost ~115M every
eighth of a day: 1,420M -> 267M at day 3 (dying ~day 3.3; bare it died before 2.75); the swarm 20 -> 163. **Plates now delay a
siege by ~half a day instead of stopping it.** tools/_siege.mjs deleted. **Mucus sticks to giants now** (author: yes): the chain volume cap counts kin chains only (kin pad to kin pad links; interact.js groups() kinGroup, divide.js chainOf kinOnly); mucus links still count toward maxChain 32. Measured: 12 Plebellas beside a Pachyderma, 4 stuck in 60 s (was 0). **Spines count at a mouth** (author: yes; Leviathella ate everything): interact.js mouthSize(c) = half the prey's narrowest width (every 2°) over its body and the tips of its rigid outside parts (spines, harpoons, tethers, tubes; not flagella; a rod goes in end-first), tested against gape × the predator's radius. Sizes now: Pachyderma 80, Jaculella 24.7, Deepdweller 18, Deepdweller II 17, Laqueella 14 (Gula, gape 7.5, can't eat these three now); Saltella, Raptilla, Plebella, Noctilla unchanged. Leviathella's gape 25 still takes every species except Pachyderma: spines are now the tool against it. Check 28ae extended; brief and tips say so. **Darker floor** (author: yes; every species ended on the floor): PARAMS.light murkBand 300 µm, murk 0.003/µm (light.js depthLight, used by the sandbox too): noon light at the floor 2% (was 5%), a shade plastid earns ~4.4 there (was ~7.3); brief updated. Measured (Leviathella, Pachyderma, Plebella, Deepdweller II, Laqueella; 3 runs × 3 days): the floor species still end on the floor, just fewer (small cells 7/5/3, was 16/20/22). Three blind designers (claude -p, brief only) all aimed mid-water; Opus's Nutricline Bobber (1,300-1,700 µm) won 2 of 3 runs in that tank (8, 5 cells; eaten on day 0.55 in the third); Sonnet's Deep Drifter never left the floor and starved there (lived under the old floor). **The upper water is still empty: nitrogen.** A research agent (marine ecologist): real surfaces live on nitrogen recycled in place (f-ratio ~0.1, Eppley & Peterson 1979), then small cells, N fixation, migration, mixotrophy; the game recycles N only where corpses are removed (the floor) and hunters' lost shares vanish. **Author chose A, recycling where life happens; the nitrogen-fixing part (B) maybe later.** **A BUILT (2026-11-05, (a) (b) (d) of the plan; (c), a steady leak from living cells, left out): (a) sloppy feeding**: a tube's unkept 80% of the nitrogen it sucks goes into the water at the prey, a mouth's unkept half at the predator as it digests (and what a full meter can't take; metab.js feed / digest(world, cell)); **(b) the dead rot where they die**: body N + meter N + the rest of a meal released at once (death.js, c.rotted; Nbody and N zeroed; was: at removal, mostly the floor); **(d) surpluses linger**: a square richer than the profile eases back over PARAMS.nutrient.fade 1800 s (3 days), poorer ones still over resupply 600 s. Check 28t now: released where it died. Brief updated. **A TESTED (2026-11-06): the upper water is still empty.** Bobber tank + Noctilla + Saltella, 3 seeds × 3 days (~10 min): final cells 8 / 13 / 7; every survivor below ~1,650 µm except one Noctilla (1,278) and one Deepdweller II (1,286); Plebella 4 / 6 / 4 on the floor (score 3.3-5.6×, the top every run); Bobber 0 / 2 / 0. **Leviathella made 9 of the 11 deaths** (Bobber ×3, Saltella ×3, Noctilla, Laqueella, Deepdweller II), anywhere from 42 µm to the floor: it eats the very migrators that would use the upper water. Recycling changed little (small cells similar to before). **Author: is Leviathella the problem, or just well built against undefended prey?** Claude: not overpowered (9 kills gained it ~30k µm³ on 2.1 million, never grew or divided, score 1.0×; spines counter it; no species here was built against it). **Same tank WITHOUT Leviathella** (3 seeds × 3 days): final cells 11 / 14 / 16, deaths 2 / 2 / 4 (Deepdweller II draining, starving on the floor); Plebella 4 / 1 / 10, Bobber 0 / 8 / 0 (1,340-1,690 µm), Laqueella 2 / 1 / 2; **still nothing lives above ~1,340 µm** (one Saltella at 406 µm, mid-hop). So Leviathella is not why the upper water is empty: nitrogen is. **B BUILT (2026-11-06; author: "do what you think best"): THE NITROPLAST** (real: Braarudosphaera bigelowii, Coale et al. 2024): material nitroplast (1100), an inclusion, no rule; while the N bar is not full and the pool is above fillAbove (after the stores), it turns energy into nitrogen, PARAMS.fix rate 0.03 N/s per µm³, cost 300 pJ a unit (a division's N costs as much energy again as the division); upkeep insideUpkeep; m.fixing. Build panel (Inside the cell, teal icon, tip), drawn teal with rings, brighter while fixing; numbers line; brief (materials table, growth paragraph); check 28am (69 checks). Measured pinned at a depth 2 days: 300 µm plain 1.1× vs fixer 1.5×; deep below the nutricline no gain (too dark). **Three blind designers (claude -p, brief only) ALL used it unprompted** (tournament/fixer-blind-*.json): Opus Lanternrod alone 17 cells in 3 days (330-800 µm by day, ~1,400 at night), Opus Needle Drifter 20 then crashed to 1 (divides at dusk: half its oil for the night), Sonnet Isolume Rod 2 (20-260 µm). **Mixed tank, 11 species (8 old + 3 fixers), 3 seeds × 3 days: fixers top every run** (Needle Drifter 8.6× / 4.3× / 10.2×, Lanternrod 0.6 / 4.9 / 3.6×; Deepdweller II next ~2×); **the upper water is lived in at last** (Lanternrod 5 and 2 above 700 µm, Isolume 2). **Leviathella feeds on them** (13 kills in run 2, 296k µm³, grows to 1.2×; 7 in run 3): kill-the-winner appears. Needle Drifter still dies en masse on the floor each dawn (its own dusk division). **5-DAY RUN (2026-11-06, same 11 species, 3 seeds; author: "it's enough" after run 1 stalled):** boom and bust, no steady winner. Run 1 stopped at day 3.5: Needle Drifter bloomed to 126 of 139 cells (the run crawled: 72 min a half day). Run 2: Needle Drifter peaked at 7 then died out (dusk division), every fixer gone by day 4; Laqueella 5 and Bobber 5 won (2.7×, 2.4×). Run 3: Lanternrod 19 cells (9.7×; 250-750 µm by day), Isolume Rod 4 (near the surface), Leviathella 14 kills. Fixers are strong but not unbeatable; nothing limits a bloom in the upper water except light (light depends on depth only: no self-shading). **NEXT (author, 2026-11-07: "yes", in a fresh chat): PLAN SELF-SHADING** (cells dim the light in the water below them, so a bloom brakes itself; MONAD has it; plan with the author first: how shading is computed per column, its cost per step, what the sandbox shows). Not raising the nitroplast price. Then the giants scoring 1.0×.

**NEXT CHAT STARTS HERE (handoff, 2026-11-04).** Built today (all pushed, 66 checks pass):
(1) **Gula, Jaculella, Miasmella retuned** (author: then "don't change anything in the species"): one new body, a 30 × 96 µm
rod, chamber 22% steered by LIGHT (float when every eyespot < 12% but one sees some; at night neutral, sinking to the rich
floor, a feeler lifting it off; patchy nitrogen fools a nitrogen gauge: the floor of a poor patch reads 0.06-0.33), shade
plastid 22%, oil 7%, rest below 40% energy. Alive alone 3/3; in mixed tanks the Deepdwellers drain them. (2) **Plebella**
(the author's strategy: tiny, explosive, toxic, sticky): 8 × 32 µm, NO nucleus (no rules: leaks always, divides at once),
shade plastid 30%, oil 12%, mucus pads, kin pads. Beat Deepdweller 1 of 3, weakened Deepdweller II. **Mucus pads can't
stick to giants**: a mucus link joins the group and the chain volume cap (8 r 10 cells) refuses it (to raise with the
author). (3) **Giants**: every size up to the entry limit (r 50, L 200: 2.1 million µm³) survives alone; they barely grow
(nitrogen by surface). **Pachyderma** (passive elephant: 5 µm plates, 20 spines) and **Leviathella** (8 mouths, gape 25
µm: eats everything; 13 kills in one tank). (4) **Plates soften harpoons** (wound ÷ 1 + 2 × thickness; plates up to a
tenth of the radius on big cells; check 28ak). (5) **Score by growth** (author: "counting only cells is unfair"): living
biomass ÷ starting biomass, averaged over every half day and the runs: contest.mjs, tournament.mjs, the brief, the entry
page; contest.mjs also prints cells, biomass share, kills, harpoon shots. (6) **Tubes left as they are** (measured:
without tubes Deepdweller II dies out every run and Plebella takes the tank 21-25×: tubes are the counter to swarms).
Size price skipped (the growth score already prices size). (7) **THE TETHER** (decided one question at a time: a harpoon
on a line; holds only, no wound or stun; chamber-like reel rule; author: "an option for releasing it"): Spine Kind
Tether, joint { type: 'tether', controls: FIRES }; two RULE PARTS naming it by `of`: { type: 'rule', joint: { type:
'reel' } } (GO reels in, STOP lets out, in wins, neither holds) and { type: 'release' } (lets go); the sandbox adds them
(withoutTimers) and shows the three cards in the tether's row. PARAMS.tether (range 40, cost 1,000 pJ/µm, reload 20 s,
hold 40 pN averaged 0.1 s, stiffness 5, reel 10 µm/s, max 100 µm); a rope link { tether: true } skipped by chains;
built-in reading Tied (-11). Drawn as a nematocyst-like capsule with a coiled thread, a glassy thread that sags slack and
trembles taut, a barbed anchor; the ghost shows the capsule (author: "make sure the previews work", "looks real"). Check
28al. A brainless cell can't fire one (no rule: never), so (author chose A) **Laqueella**: a tethered swarm WITH a
nucleus (10 × 54 µm), 18-26 cells alone in 4 days; in a six-species tank it won 1 run of 3 and wiped itself out in two
(its burst sac). **Next:** remove Laqueella's burst sac (suggested, not yet agreed); count tether ties in contest.mjs;
rerun the six-species tank with 5 runs; then the balance talk (excess: giants untouchable, Leviathella strong; lacking:
the upper water unused, every kill below 1,700 µm). The author's idea for later: reeling to keep a set distance.

**NEXT CHAT STARTS HERE (handoff, 2026-11-03 night).** Built today (entries below: "STEP 1 DONE", "ROUNDS 1-2",
"BALANCE FROM THE TOURNAMENT"): the brief, the entry page (https://vitorhugo1992.github.io/tinygod/enter/), the
tournament (two rounds), and a rebalance (slow chamber, deeper nutricline, nitrogen patches). **Next, agreed (author:
"maybe tomorrow we bring some of these unique species back tuned"):** retune the deleted species with unique mechanics
to the new balance, in git history before commit 0204c98: **Gula** (the only swallower), **Jaculella** (the only
harpooner), **Miasmella** (the only toxin leaker); maybe Scalella (chains) and the author's Pendulina. They died alone
from the floor: built on Bathyscapha's body, whose chamber no longer lifts it (light 800, slow) and whose depth (~1 mm)
is now nitrogen-poor. Then: a 5-day tournament round with fresh blind entries on the new brief (do the swimmer,
drifter and floor-dweller hold up together?).

**Earlier handoff (2026-11-03 evening): the AI TOURNAMENT, step 1, THE BRIEF.** The author's idea: "make
different AI compete with each other" (ChatGPT, Gemini, Claude…): each designs a species from the same brief, and the
designs fight in one tank. Agreed outline (Claude's proposal; author: "maybe we do that brief in a fresh chat"):
(1) **the brief**, docs/DESIGN-A-SPECIES.md: written for an AI that knows nothing about TinyGod, self-contained (pasted
into any chat, or read from https://raw.githubusercontent.com/vitorhugo1992/tinygod/main/docs/DESIGN-A-SPECIES.md):
what the game is and what a cell needs to live (light by day, stores for the night, off the floor, nitrogen below);
every part with the numbers that matter (sizes, costs, what it does; from sandbox/parts.js PART_TEMPLATES and CONTROLS
and sim/params.js); the design JSON format (body; parts: inclusion / segment / sensor / pad / mouth / rule; `at`
positions in the body frame; joints and their rules as `controls` with sensor ids, min, max, not, or, stop, vs;
built-in readings by name: energy, starch, oil, health, feeding, size, drained, neighbours, alarm, poisoned); the
limits (nucleus slots, room inside, no overlapping organelles; buildCell's errors); 2-3 working species as examples
with why they live (Bathyscapha, Noctilla, Jaculella); the traps found (shuttlecock tipping, the rest trap, plastids
too small, a store too slow, a jumper landing front-down); the goal (most cells after 10 days in a shared tank) and
the answer format (a JSON { name, design } that 📋 Paste takes). **Test it**: give it to a fresh subagent with no other
context and check its design builds and lives. (2) **tools/tournament.mjs**: entries (e.g. designs/entries/<ai>.json),
validate, run 5-10 seeds free-for-all (contest.mjs runs one), score by mean cells at day 10, log deaths and causes,
write results. (3) **a leaderboard page** on the website with ▶ Watch (all entries into the tank). Rounds: 1 blind,
2 informed (each AI gets its own results and revises once). Claude enters too, as "Claude (with the simulator)", a
benchmark.
**STEP 1 DONE (2026-11-03, next chat): the brief, docs/DESIGN-A-SPECIES.md, and the entry page.** **No example
species in it** (author: "wouldn't that make the AI have a tendency to copy these?"; chose no species over round-2-only
or keeping them): part snippets (each checked to build), one skeleton that builds and starves by noon, the traps as
physics, a budget table (daily-average plastid income per µm³ by depth, damage included: Chl a 16.5 at 500 µm, 12 at
1 mm, 4.6 at the floor; shade peaks ~12 at 1-1.25 mm), the nitrogen reading by depth, a sinking-speed estimate.
**Tested:** two subagents (Opus, Sonnet) and one truly blind `claude -p` run (Sonnet, from an empty folder outside the
project, brief piped in, no tools; **subagents load this CLAUDE.md, so they are not blind**): all three entries built
first time and lived alone 3 days from the floor (5, 6, 8 cells, never starving). All three were nutricline drifters
with a front chamber (the brief's "light up, nitrogen down" may steer them; watch for sameness in real entries).
Their unclear points were fixed in the brief. **sim/entry.js** (prepEntry, entryProblem: nucleus exactly r 4.3 and
round, no rules without a nucleus, body r 1-50 / L 0-200, unique ids, then buildCell; readAnswer: the first {...} in a
reply). **tools/trial.mjs** <file> [days] [--seed]: checks and runs an entry alone from the floor. **The entry page**
https://vitorhugo1992.github.io/tinygod/enter/ (enter/index.html; author: "a link or something with all the rules"):
ChatGPT / Claude buttons open a new chat with the task and the brief's raw GitHub link (chatgpt.com/?q=,
claude.ai/new?q=), Gemini copies it; 📋 Copy the whole rules for AIs that can't open links; paste the answer back: it
is checked in the page (the sim's own errors), ▶ Watch opens it in the sandbox (**sandbox/?design=TG1.…** now opens and
saves any packed design), 📤 Enter opens a GitHub issue "Entry: <AI>: <species>"; **tools/inbox.mjs saves those as
designs/entries/<AI>.json**. Fair play on the page: a new chat per AI, no hints, a refused design may be sent its error
back once (Claude's proposal; the author may change it). tools/serve.mjs also serves enter/ and docs/. Seen in headless
Edge at phone size. **Next: step 2, tools/tournament.mjs** (entries from designs/entries/, 5 seeds, mean cells at day 10).

**ROUNDS 1-2 (2026-11-03, same chat).** Entries: ChatGPT, Gemini (restarted once: its first try was spoiled by the
vague overlap error), Claude (claude.ai). **tools/tournament.mjs** [--round --seeds 3 --days 5 --cap 40] (author: "30 mins
max"; 200 cells simulate ~17 s per sim second, so 10 days at cap 200 would take 10+ hours): seeds in parallel processes,
progress every half day, state saved (run-N.json, --report for results so far), tournament/round-N/results.json + .md,
tournament/latest.json. **Round 1** (3 days, 3 runs, cap 40, ~13 min): Claude's Deepdweller 25.3 (a 12 × 78 µm rod, a
nitrogen-gauge chamber at ~1,300 µm, a 32% plastid, spines, two feeding tubes: drained 2 ChatGPT cells), ChatGPT 2.7,
Gemini 0 (starved on the floor). **Round 2 messages** on the entry page (section 3, from latest.json): the results, each
species' story. Round 2 showed every design's JSON: **ChatGPT and Gemini copied Deepdweller part for part**; Claude kept
its plan (slimmer, + a toxin sac). **So from round 3 opponents are described, not given** (author agreed, and "might
also apply to human competition": players see what beat them, not the blueprint): their note, body size and a list of
the parts they carry; only your own design in full.

**BALANCE FROM THE TOURNAMENT (2026-11-03, author: "balance is key"; Claude's analysis, the author: "implement them"):**
every AI (and all my own contests) built a rod with a buoyancy chamber and no tail: the chamber was strong, fast and
free at neutral; the nutrient sensor a perfect orientation-free depth gauge; one depth (~1,000-1,300 µm) good for both
light and nitrogen; nothing to find sideways. Swimming's cost judged fair (holding depth by swimming ~310 pJ/s vs a
chamber ~450): the problem was no payoff. **Changed:** (1) chamber light 500 -> **800** kg/m³, rate 25 -> **2.5** kg/m³/s
(neutral to light ~90 s, ~3.5 h of the day), holdLight 0.5 -> 0.25 (same cost per pN of lift); MATERIALS.chamber.min
800; check 14 runs 120 s. (2) nutricline 0.5 -> **0.7** (~1,400 µm, noon light ~12% there; 13% richness at 1 mm).
(3) **patchy nitrogen**: sim/nutrient.js is a grid of 40 layers × 16 columns (100 µm), PARAMS.nutrient.columns, spreadX,
patches { count 2, width 150 (σ), base 0.3, wander 1800 s, reach 0.7 }: the profile × a richness across the tank
(0.3× to 2-3× where patches overlap, mean 1) that wanders over days (patchAt, seeded); nitrogenAt / takeNitrogen take
x; the chem sensor tops out at 1; the sandbox draws the haze per column. **Measured alone 3 days from the floor:**
Deepdweller 26 -> 3, Deepdweller II 5, Noctilla 2 (migrates daily ~200-500 / ~1,800 µm), Trochilla 1, Saltella 1;
**Bathyscapha, Pendulina, Scalella, Caecella now die** (tuned to the old numbers; retune if wanted). Everything grows
slower: run tournaments 5+ days. Mixed contest (3 days): Deepdweller II 6, Noctilla 2, Saltella 1, Trochilla 0.
**Blind designers on the new brief made three strategies**: Opus a swimmer (Lanternfall, 2), Opus a **floor-dweller**
(Benthic Mat Rod: heavy, shade plastid, the richest water; 6 cells: the best), Sonnet a drifter (1). **Floor-dwellers
kept as a niche** (author: "interesting, i like it"; microphytobenthos); watch whether they dominate a full tournament
(levers: a darker floor, a weaker shade plastid).
**Deleted (author: "delete old non surviving species")**, all dying alone from the floor under the new balance:
Bathyscapha, Pendulina, Scalella, Caecella, Gula, Jaculella, Miasmella (the last three on Bathyscapha's body; with them
went the only example swallower, harpooner and leaker; in git history). Left in From Claude: Deepdweller, Deepdweller II
(claude.ai), Noctilla, Trochilla, Saltella, Raptilla, Raptilla 2 (each alive alone 3 days). contest.mjs's default list
follows.

**State at handoff:** all pushed, 64 checks pass. Built on 2026-11-03 (entries below): the stirred bottom, the harpoon
(Spine Kind), the moving-water Feeler, toxins leaked into water (toxin sac Kind Leak), the living-microscope look
(sandbox/scene.js, drawCell), tank controls (Remove cell, saved designs list, rotate on the rail), twilight, README with
screenshots. Species added: Pendulina (the author's, fixed), Jaculella (a harpooner), Miasmella (toxic). A
10-species contest with Jaculella was running when the chat ended and its results were not recorded: rerun with
`node tools/contest.mjs bathyscapha,noctilla,saltella,trochilla,caecella,raptilla2,scalella,gula,pendulina,jaculella,miasmella 10 --seed=N`
for N = 1-5 (~45 min each; run them in parallel). Bash lesson: never put backticks in `node -e` strings (the shell
runs them); write text through files.

**WHEN THE AUTHOR SAYS THEY SENT A DESIGN: run `node tools/inbox.mjs`** (2026-11-03). On the website 📤 Send to Claude
packs the design ("TG1." + base64url of the deflated JSON, numbers to 2 decimals: ~2.8k characters for a 27-part design,
was 10k of JSON) and opens a pre-filled GitHub issue "Design: <name>" on vitorhugo1992/tinygod (public, like the repo);
the author taps Create. tools/inbox.mjs (gh) unpacks every open "Design:" issue into designs/<name>.json, comments and
closes it; `node tools/inbox.mjs TG1.…` unpacks a code pasted in the chat. Over ~7,500 characters the issue opens empty
and the code is copied to paste. At home the old POST to the server still works; 📋 Paste takes a TG1 code too.
**Deaths are told** (author: "when it sinks to the bottom it disappears??"): a red message over the tank (#toast, 12 s,
tap to close) when the followed cell or one of this design's cells dies: why, when, how deep, how many of its kind are
left; a corpse now lies on the floor PARAMS.grow.gone (30) s after landing instead of vanishing on contact (death.js
landedAt). **The author's first species** (2026-11-03, "Round cell", a 31 × 92 µm rod: a buoyancy chamber floating
while the nutrient sensor tastes rich water holds it at the nutricline, ~1,000 µm, light ~20%; two tails on eight
stranger-only feelers; no rest rule): lives the day at 75-80% energy, starves at ~01:00 (its body is 15× a r 10 cell:
61,600 of its 70,800 pJ/s upkeep; plastid 4.6%, starch 6.3%), dies on the floor at 03:24. Its feelers feel strangers
only, so alone its tails never run. Told the author; fixes are theirs.

**2026-11-03 (new chat).** (1) **Contest rerun with chains counting as one** (tools/contest.mjs now kept in the repo:
`node tools/contest.mjs [names] [days]`, one cell each from the floor, cap 200, ~36 min for 8 species): **day 10:
Scalella 20, Bathyscapha 8, Noctilla 5, Gula 4, Raptilla 2 3, Trochilla 1, Caecella 1 (alive for once), Saltella 0**
(starved day 0.43 on the floor: it tipped front-down at the start, its known weakness, not the contest's story). **Gula
swallowed ONE Scalella in 10 days** (day 7.2): chains protect, and drifters still only meet in shared columns (moving
water). Drifters lead again. (2) **Rule maps redrawn** (author: "confusing… looks abstract"; mock-up
design/maps-mockup.html, approved with hours added and no µm on the depth axis): the water drawn as it is (dark
nights, a bright noon fading with depth), where the part acts in its colour laid over it in stripes with a bright edge
(chamber: pale floats, deep blue sinks), a question as the title ("When does it rest?"), hours 00h-24h every 3 h with
dawn / noon / dusk under, surface / floor on the side, a legend (runs / still, floats / sinks / neutral, rests / awake,
your cell now), caption "Runs 82% of the day and depths"; a rule with no condition gets a line, not a map ("◷ No map: it
holds at every hour and depth…"). main.js drawRunMap / runMapEl (MAP_W 192 × MAP_H 64), CSS .rmap / .rmapnone.
(3) **Mouths cost** PARAMS.engulf.upkeep 100 pJ/s each (author: "cost per mouth"). (4) **MOVING WATER BUILT** (author:
"very important, how to do it in a contained tank is crucial"; chose Claude's recommendation, convection rolls, over a
wraparound current or random eddies; defaults agreed): sim/flow.js, PARAMS.flow. Stream function psi = sin(pi y/H)(a2
sin(2 pi x/W) + a3 sin(3 pi x/W)): zero on every wall (no water through it; it slides along the floor); two loops and
three blended, the blend turning over `shift` 1800 s (3 days) so loop edges wander; fastest stream night 10 µm/s, day 2
(by daylight). physics.js: each piece's drag is against the water (force R·u at its centre, torque xr·curl/2), so a
weightless cell rides it exactly and turns with its curl; stepCell(cell, t, gravity, flow), world.flowNow; makeWorld({
flow }) (checks: off; sandbox, Test a day and tools/contest.mjs: on, `--still` for still water). Nitrogen layers mix up
to 1 + mix 4 times faster as it moves (nutrient.js). Page: faint streaks drifting with it (drawMotes, ~70 in view at any
zoom), ≋ Water in ⋯ More. Check 28af (60 checks). Measured: all eight of Claude's species alone, 3 days from the floor in
moving water: alive (Bathyscapha 2, Gula 2, Scalella 2, the rest 1). A loop takes about a day; ~1.3 ms per sim s for the
water's cost on a 1-piece cell. **First contest in moving water** (8 species, 10 days): **day 10: Bathyscapha 12,
Saltella 10, Gula 7, Noctilla 2, Raptilla 2 2, Trochilla 1, Scalella 0, Caecella 0.** Gula met and swallowed the lone
Scalella on day 2.05, before it ever divided (still water: one swallow in 10 days, on day 7.2): moving water makes
meetings happen. Saltella did far better (10, was 0-11). Caecella starved day 3.9 (909 µm), one Bathyscapha day 7.9,
one Saltella on the floor day 9.3. One run is one seed: contests are chaotic, score over several seeds before tuning.
**Five starts in moving water** (tools/contest.mjs --seed=N shuffles who starts where; seeds 1-5), day 10, mean (range):
Bathyscapha 10.8 (8-14), Scalella 12 (0-22), Gula 5 (4-7), Saltella 4.8 (0-10), Noctilla 3.4 (2-4), Raptilla 2 1.6 (0-3),
Trochilla 1.4 (0-2), **Caecella 0 in all five** (starves day 3.9-6.9: its oil-clock rest rule, a design weakness). Gula
swallowed 19 Scalellas over the five (1, 6, 6, 2, 4), mostly days 5-10 as both multiply; Scalella still ends near the
top (kill-the-winner, mild). **Raptilla 2 drained nothing to death in any run.** Most other deaths are starving on the
floor (Saltella 7 times, Raptilla 2 twice, Trochilla once). Drifters still lead (~23 of ~40 cells).

**2026-11-03 (same chat, later).** **Pendulina** (designs/pendulina.json, From Claude): the author's Round cell made to last at their request ("feeling lazy"): body 20 × 54 µm (was 31 × 92: the cytoplasm was 87% of its upkeep), nucleus r 4.3, Bathyscapha's interior turned round (chamber 15% at the back under the eyespot, plastid 9%, starch 4%), REST when the eyespot sees < 3%; their chamber rule, feelers and tails kept. Alone from the floor in moving water: never starving, 4 cells by day 5.5. Name suggested (alt. Gustella). **THE STIRRED BOTTOM BUILT** (author: the floor deaths are mostly design flaws, "still option A is realistic… sometimes the bottom doesn't stir, sometimes it does"; a cyst rule was offered and REJECTED: "I don't like B"): PARAMS.flow.stir { lift 20 µm/s at the floor, layer 300 µm (linear to 0), every 200 s a stretch, chance 0.4 (from world.seed via hash01: same seed, same spells), patch 0.5 (patchy along the floor, so it turns cells) }; sim/flow.js stirNow (sin² envelope, strength 0.5-1), added to flowAt (v and curl) while moving water is on; a cell lifts if it sinks slower than the stirred water there. Journal: "the stirred bottom lifted it off the floor". Check 28af's wall test now looks at the loops only; check 28ag (61 checks). Measured alone 3 days from the floor: Saltella front-down and upside down now lives (died both ways without it); Noctilla, Trochilla unchanged; Caecella dies 1 in 4 starts either way (its rest trap). Not yet: a contest with it.

**THE HARPOON BUILT (2026-11-03; author: "harpoon is great, implement", trying "to maintain parts at a managing level but with lots of options")**: not a new part but the Spine's **Kind: Fixed / Harpoon** (the old Material row; partMaterial protein / harpoon; template Spine gives joint { type: 'fire' }, label Harpoon). Blind (author: it must not "know magically where the enemy is"): FIRES when… (no rule: never) throws the spine straight out along itself; the first piece of any cell within PARAMS.harpoon.range 40 µm of its tip takes it: **a body, kin too** (author: "mechanical damage"), is stunned stun 8 s (sense.js: its flagella, springs, tubes, mouths and harpoons stop; a latched hunter lets go) and loses venom 60k pJ (metab.js drainEnergy, shared with the toxin burst); a spine or flagellum catches it harmlessly; a miss wastes it. **The spine is the dart** (author): thrown, its piece is cut to length 0 and grows back over reload (20 s, then 150 s: author "needs considerable time") (build.js setSegmentLength: drag, volume, weight follow); **cost 3,000 pJ per µm of spine each shot** (author: "make it costly, as it can severely damage bigger predators"; 20 µm = 60k). Code: build.js cell.harpoons [{ piece, x, full, cost, controls, go, t, shot }], rewire; interact.js fires (walks the dart's line in 0.5 µm steps); stun via cell.stunT. Also fixed: motors stopped by a rest or a stun come back on afterwards (j.offBy; a rule-less tail used to stay stopped after resting). Page: Kind row and tip, rule card "Fires when…", pill LOADED / REGROWING n s / OFF, map "When would it fire?", the dart drawn as a fading yellow line (a dot where it struck), a stunned cell's outline yellow, numbers (STUNNED, harpoon thrown / growing back), log "threw its harpoon: hit a X / caught by a spine or flagellum / missed", "hit by a X's harpoon: stunned 8 s, lost 60k pJ". Check 28ah (62 checks). Seen in the page (Archer: harpoon fired when a feeler feels a stranger within 57 µm). **The wound, retuned (author: "potent"; then "a smaller cell will hurt more or die, but a larger cell will also suffer damage"):** PARAMS.harpoon.venom 400k pJ + wound 0.1 of all it holds (metab.js energyOf: pool + stores); more than it holds kills it at once (diedWhy "killed by a X's harpoon"). Our species hold ~0.5 million (an r 10 swimmer late at night) to 14 million (a fed Gula): Saltella at night nearly dies, Bathyscapha loses ~a third, Gula ~10%. Author: "I can already imagine a swarm surrounding a massive predator and launch their harpoons". **THE MOVING-WATER FEELER BUILT (2026-11-03; author: "similar to feelers", so a third Feels choice, not a part):** Feels: Other species / Anything / **Moving water** (template: kind 'flow', range max(20, 200 × Sensitivity) µm). sense.js flowFelt: the water's turning there (|curl| / PARAMS.sensor.flowCurl 0.25 rad/s: midnight loops ~0.24, a stirring spell ~0.3) plus each other cell's wake within range, any species (its speed THROUGH the water, averaged over flowSmooth 0.5 s, / flowWake 6 µm/s × a/(a+d) × (1 − d/range)); a still cell or one carried by the current makes none (swimming gives you away). Measured: a wave-tail swimmer passing reads up to 0.78, a still cell 0, out of range 0. Page: zones still / gently moving / moving / rough, "feels the water more than 40% (moving)", 🌊, its range drawn. Check 28ai (63 checks). Seen in the page: an Archer firing its harpoon when its feeler feels the water above 40% killed a swimmer coming at it. Log fix: "60 s without energy" only for starving or draining. **Talked about, not built:** ~~flow sensing as a third Feeler setting~~ (built above) "moving water" (rough water + wakes of moving cells; author: "similar to feelers"); bioluminescence tied to the Alarm (a flash startles an attacker and kin read it); the feeding veil parked (author: "sounds op").

**THE LIVING MICROSCOPE (2026-11-03; author: "the tank and species need a visual revamp. it feels robotic and monotonous… make it feel more alive… physics stays exactly the same"; chose direction A over pixel art; mock-up design/microscope-mockup.html, also on the website /design/microscope-mockup.html: "i love it").** Drawing only. **Step 1, the water** (sandbox/scene.js: drawWater, drawDrift, drawVignette, speciesTint): colour by depth and hour from the game's light (teal top, ink-blue deep, warm at dawn/dusk, near-black at night), swaying light shafts, ripple light (caustics) near the surface, marine snow and specks carried by the moving water (replaced the streaks; snow sinks), out-of-focus cells far away in the species' tints, a lit surface line, a sediment floor, a vignette; the grid lines went (depth labels stay, faint). **Step 2, the cells** (main.js drawCell / drawOrganelle / taper / capsulePts / chainsOf): a see-through body in its species' tint (scene.js speciesTint: a palette in order of first appearance), a wobbling membrane, streaming granules, a halo, light from above; plastids banded and glossy (still bleach, stolen ones dashed and fading), stores glossy containers filled to their level, chambers clear bubbles (deep blue when heavy), nucleus shaded violet, statolith grain, toxin sac magenta; flagella and oars as smooth tapering whips in their rule colour (pale without one, faded when stopped), spines glassy, harpoons with a barb (gone while regrowing), peduncles pink tubes, springs coils; eyespots red-orange pigment spots glowing when lit, feelers fine hairs, mouths with lips, pads glowing knobs; rim red starving, blue resting, yellow stunned, grey dead. Joint dots dropped; sensor rule rings only on the selected cell; eyespot view cones only while its card is lit. Seen in the page (9 species, close, far, Arrange). Speed: 61 fps with the water alone, ~20 fps while 5 contests ran beside it (not yet measured on a phone).

**Tank controls (author, 2026-11-03: "where is the delete button… the upload cells design is confusing, no button to send to tank, no button to delete… rotation shouldn't be hidden… hide the arrow thing and the info"; "hide [the trajectory] and give an option to see it"):** Tank section: 🗑 Remove cell (the selected one, links renumbered; the last cell stays; none of its kind left, the editor takes the next cell's design); saved designs are a list (#savedList), each row ＋ Tank (addToTank: a cell of it beside the selected one, its own species) · ✎ Edit (applyDesign: it replaces the selected cell's design) · 🗑 (delete, confirmed); the old dropdown and ✕ went. Rail: ⟲ ⟳ visible (where ↗ and ⓘ were); ↗ Forces, ⓘ Info and a new ⋰ Trail (the selected cell's path, now hidden by default) in ⋯ More. Seen in the page.

**Contest with Pendulina and the stirred bottom (2026-11-03; 9 species, 5 seeds, moving water, 10 days; harpoon not used by any of them):** mean (range) at day 10: Bathyscapha 11 (8-16), Scalella 5 (0-14), Gula 5 (4-8), Noctilla 3.8 (3-4), Pendulina 3.2 (2-4), Raptilla 2 1.4 (0-3), Saltella 1.2 (0-3), Trochilla 1.2 (0-2), Caecella 0.6 (0-1; was 0 in all five). Deaths: Gula swallowed 12 Scalellas; **Raptilla 2 drained a Scalella to death twice (its first kills)**; 15 starved, **10 of them on the floor (~1,990 µm), 6 of those Saltellas**: the stirred bottom rescued Saltella alone from the floor but not in a crowded tank over 10 days. Drifters still lead (Bathyscapha + Scalella + Pendulina ~19 of ~32 cells).

**JACULELLA** (designs/jaculella.json, Claude, a harpooner; author: "design an harpoon cell"): Bathyscapha + four 20 µm harpoons on the diagonal corners, each fired when the feeler beside it (near, strangers, 40 µm) reads above 0.5 (within 20 µm) AND more than the opposite corner's feeler (a compare condition). Beside Gula, Raptilla 2 and Scalella 2 days: 21 shots, 8 hits (7 Gula), never starving; side-mounted harpoons did worse (3 of 19); each wall of feelers fired all four before the compare rule (37 shots, 8 hits). A contest with it (10 species, 5 seeds) was started in the background.
**TOXINS LEAKED INTO THE WATER BUILT (2026-11-03; author: "yes, we need that", plan with numbers approved: "go"):** the toxin sac has **Kind: Burst / Leak** (template content 'leak' -> joint { type: 'leak' }; build inc.leak; sense: no rule = always leaks, burst stays no rule = never; metab burst() skips leak sacs). sim/toxin.js: one cloud per toxic species (world.toxins Map species -> Float64Array) on a 40 µm grid (40 × 50), every 0.1 s carried by the flow (semi-Lagrangian), spread (20 µm²/s) and faded (half 60 s); leak(): rate 1 unit/s per µm³ of sac, 3.7 pJ and 0.0087 N a unit (a r 4 sac ~1,000 pJ/s, a third of an r 10 division's N a day), not while starving or without the N; poison(): other species lose harm 0.001 pJ/s per unit per µm² of surface and plastid damage 5e-6 per unit-s; kin immune; cell.poison { level, loss, by }; a starving death while losing > a quarter of its upkeep to toxin is "poisoned by a X's toxin". Built-in reading **Poisoned** (-10, 1 at 5,000 units). Measured, a lone r 4 leaker in still water: a stranger 30 µm away loses ~2,000 pJ/s (plastids ~16% damaged); in night currents only ~100 (the cloud is carried off): toxins pay in crowds and calm water. Page: Kind row (#toxRow), card "Leaks when…" (LEAKING / IDLE), map "When does it leak?", the haze in the species' tint (scene.js drawToxins: the grid stretched smooth), numbers and log (began / stopped leaking, "in a X's toxin: losing …"). Check 28aj (64 checks). **MIASMELLA** (designs/miasmella.json, Claude, toxic): Bathyscapha lengthened to L 44 with a r 4 Leak sac between starch and nucleus; alone 4 days never starving, divides ~day 4 (Bathyscapha ~2.5); three of them killed a Scalella sharing their water within a day (without leaking it divided); swimmers escaped. Seen in the page (POISONED neighbours, the haze, the Kind row).

**NEWEST HANDOFF (2026-11-02, end of a very long chat; the author starts a new chat).** Built today, all pushed, 59
checks pass (details in the entries below, search for the names): the population graph (tap the graph strip); the
armoured wall (cellulose plates; glass removed); the Feeding reading; hunters keep 20%; **growing cells** (the design is
the newborn; 10% steps to 8×; organelles keep pace to 2×, half beyond; the Size reading); **stealing plastids** (from a
kill and every 30 s latched on a living prey; they squeeze into gaps, fade by half a day, never repaired, shared at
division; a robbed prey rebuilds); **chains** (at division pad to pad, middle cells slot in, cap 8 r 10 cells by
volume, pad rule "Holds while…", sharing, Drained reading, drag shielding); **pads that sense and attract** and the
**Neighbours** reading; oil retuned (one night); the **nutrient sensor back** (a depth sense against the floor trap);
**swarm defence** (the Alarm reading; the **toxin sac**, kamikaze); **engulfing** (the Mouth: gape, free room, digested
over a minute drawn shrinking inside; **chains count as one**: a chain must fit across the predator). Dropped: the
nitrogen store. Species (designs/, From Claude): Raptilla, Raptilla 2 (a thief), Scalella (a ladder chain), Gula (a
swallower); Saltella now flees when drained, Caecella rests at oil above 40%.
**Open, in order:** (1) the contest with Gula ran with the OLD rule (chains swallowable): rerun it with the scratch
contest (8 species, 10 days, cap 200; ~40 min); (2) **the mouth doesn't look like a mouth** (author: "alright for now");
(3) mouths cost nothing (no upkeep, no room): a balance point to raise with the author; (4) **in a still tank drifters
only move up and down: encounters need shared columns** (Gula met nothing 60 µm away): moving water rises in priority;
(5) drifters (Bathyscapha, Scalella) win every contest; swimmers lose; the floor kills; (6) the author will design a
species (contests so far are all Claude's designs). Queue: toxins as clouds (the toxin sac is the seed), drilling,
peduncle stretching, coloured light and pigments, chalk and mucus, moving water, self-shading, seasons (where oil and a
nitrogen store would pay), a fast mode, challenges with stars, share as a link, tips while building.
**Testing tools (scratchpad is gone with the chat):** headless page tests: write a CDP script (headless Edge,
--remote-debugging-port, Network.setCacheDisabled, phone size 400×860), kill the Edge processes after (PowerShell:
Get-CimInstance Win32_Process msedge.exe whose CommandLine has the profile dir); **window.__tg** gives the live world
and selected cell, and `import('/sim/grow.js')` etc. share the page's modules; to run one check alone, cut
tools/check.mjs to its imports and helpers plus that check (watch apostrophes in check names); contests: makeWorld with
grow, one cell of each design from the floor, PARAMS.grow.cap 200. Don't `git add -A designs` (species_test.json is
the author's, kept out of git).

**Newest handoff (2026-11-02, end of the day; the author went to sleep): step 1a is nearly done, predation has begun.**
Built and pushed today (details in the numbered entries below): the nitrogen field and the two-bar growth meter;
division (two identical cells, cap 12); death (60 s starving; nitrogen returned); collisions between species tested;
the first contest (Claude's five species, 10 days: Bathyscapha, Noctilla, Saltella 8, Trochilla 4, Caecella extinct);
**no grazers** and **the glass wall goes** (author); the **peduncle** (drains energy and nitrogen, keeps half; length
10-80 µm, 2,000 pJ per µm to pierce); the **DIVIDE rule** (Division card). 50 checks pass. **Next, agreed order:**
(1) ~~the population graph~~ **BUILT (2026-11-02, next chat):** sandbox/journal.js census(world) counts living cells per
species every 5 s (world.census { s, colors }, ten days kept, carried through rebuilds like births); drawCensus draws
it in the graph strip (a stepped line per species in its own colour, a little apart so equal counts show, nights
shaded, days along the bottom, counts now in the legend, births · deaths); **tap the strip to switch** "the last
day ⇄" / "population ⇄" (main.js graphPop, graphBox); seen in the page at phone size; (2) ~~the armoured wall~~
**BUILT (2026-11-02), decided with the author one question at a time:** **cellulose thecal plates** (not chalk);
**pricier to pierce, not slower** (author convinced: a delay protects only prey with an escape; a price works for any
prey and makes armour scale with how rich the prey is; "drilling", the price paid as a flow, parked for later); **costs:
growth + weight** (no upkeep); **glass removed entirely** (walls and spines; old designs load as protein; the Glass rod
preset is now Plated rod). Code: MATERIALS.plates (1,150 kg/m³), legacyMaterial; body { wall: 'plates', plates: µm }
(PARAMS.plates: 0.25-2, start 0.5); the plate layer replaces that much cytoplasm (weight) but **does not take room from
organelles** (Claude's call so Plates never breaks a packed design; at 2 µm the nucleus is drawn over the band; tell
the author, revisit if it bothers); the energy bar needs + 300 pJ per µm³ of plate, nitrogen unchanged; a peduncle pays
f.cost × (1 + 2 × thickness) (link.price), can't latch without it (A.cantPierce; card pill TOO DEAR; trouble log "can't
afford to pierce a plated X"). Body section: Wall Plain / Plates, Thickness, a note ("pierced at ×3 · +30% energy per
division · sinks 1.6× as fast", from the design built with and without). Drawn as a tan band inside the outline with
seams. Check 28v (51 checks). Measured r 10: 1 µm sinks 7.8 → 12.5 µm/s, division 1.26 → 1.63 million pJ.
**The hunter (2026-11-02, Claude designs it, author's choice): Raptilla** (designs/raptilla.json): Noctilla + a 20 µm
peduncle at 40°, angled 20° forward; its tail stops while feeding. **What designing it taught:** (1) a PUSHER hunter
(tail behind, tube in front) sank front-down every night (the tail's drag; only a ~60 µm front tube would balance it,
120k a latch): kept the proven puller; (2) **a swimming hunter tore its own latch off** in 0.2-0.3 s (27 latches on
Saltella in 2 min, 40k each, ~2k kept; Saltella never jumped): **the Feeding reading built** (author chose it over a
stronger tube): a built-in reading, 1 while a peduncle is latched (sim/sense.js feedingLevel, BUILT_IN -5, BUILT_INS,
offered when the design has a peduncle; sentence "unless it is feeding"); with "tail stops while feeding" one latch
held 218 s, drained 1.8 million pJ, killed the Saltella; (3) a feeler stopping the tail stopped it before it touched;
(4) a hunter re-pierced an empty corpse: prey.emptied, never pierced again; (5) **meetings are rare**: in 2 days it met
only Saltella (cells move up and down in a 1.6 mm wide tank). Check 28w (52 checks).
**Next, the author's order (2026-11-02):** (1) ~~a contest with a hunter~~ **RUN (2026-11-02):** the five + Raptilla, one each from the floor, 10 days
(~36 min): **day 10: Trochilla 4, Raptilla 8, the rest extinct** (first contest: Bathyscapha 8, Noctilla 8, Saltella 8,
Trochilla 4, Caecella 0). 21 latches, 10 kills: Saltella (its only cell, day 1.6, before it ever divided), every
Noctilla, every Bathyscapha (a still rod, rich: one latch took 7.6 million pJ); Caecella died on its own as before
(day 3.8); two Raptillas starved on the floor. Latches cluster as prey multiply (days 6-9: kill rate rises with
density). **Trochilla was never latched: its four 40 µm oars keep the tube off its body** (an unplanned defence, the
spines idea working). Balance worries for the author: (a) **a kill pays far more than a division** (half of a rich
prey's stores: 3.8 million kept from one Bathyscapha, ~3 divisions; real food chains pass on ~10-30%); (b) **plates
wouldn't have helped**: the price (×3 = 120k) is nothing against a 7.6 million meal or a fed hunter's pool; (c) 8 latches
on Noctilla took 0 (torn at once or nothing to give), 40k each. **Hunter keeps 20% (author, 2026-11-02; was 50%).** Rerun (same start, code before growing): **day 10: Bathyscapha 4,
Trochilla 4, Raptilla 1**; Saltella eaten day 1.6 again (its only cell), Noctilla eaten out by day 6.5 (it shares the
hunter's depth), Caecella died on its own; then the hunters starved on the floor: a predator-prey crash, three species
left (was two).
**GROWING CELLS BUILT (2026-11-02; author: "as the cell prospers it grows; the player decides to keep growing or
divide"; decided one question at a time):** the design is the newborn; sim/grow.js: surplus energy + nitrogen (the
bars bank up to a doubling's worth, as before) grow it PARAMS.grow.step (10%) of its newborn volume at a time, up to
PARAMS.grow.max 8× (twice its width; there it stops, surplus to stores); **the body and rim parts grow by its width
(author: outside parts too); organelles gain half its volume gain** (PARAMS.grow.organelles 0.5; author: "so it has
incentive to steal plastids and energy from prey"; first plan was organelles fixed, the author: "the cell will
die"); the nucleus keeps its slots; stores keep their energy (emptier when grown). regrow() rebuilds the cell in place
(same object: journal, lineage, pad and feed links remapped). **Division** at ≥ 2× when the DIVIDE rule holds (none:
at 2×), each daughter half the volume (2×: two newborns), half the pool, of each store's energy and of the bars.
**Size reading** (built-in, -6: "1.5× its newborn volume", zones newborn / grown / big). Death returns grow.Nbody.
Page: real size drawn (the 8% swell gone), 🌱 1.6× on the clock line, size in the numbers, a violet size line in
the day graph, "grown to 2× its newborn volume: it can divide" in the log, pill "1.4× GROWING", card "Divides once
it has doubled", Test a day starts at the cell's size. Checks 28s (rewritten), 28x (53 checks). **Measured, 3 days
from the floor (no starving except Caecella):** Bathyscapha divided at ~2.4 d (was ~1.3-2.2), Noctilla 1.7×,
Saltella 1.6×, Raptilla 1.3×, Trochilla 1.3× (deep nights, ~1.8 mm), none divided; **Caecella died on day 1** (its
rest rule needs oil above 85%; a grown oil store is emptier: the division lesson again). Grown cells are
energy-limited (Noctilla 1.4×: upkeep +25%, income +15%; bigger stores to refill): doubling ~2× slower than before.
**Contest with growing, 1st (organelles half at every size):** Bathyscapha 16; Noctilla stuck at 1.8× from day 5,
Raptilla 1.8×, Trochilla 1.3×: **swimmers stalled below 2× and never divided** (each step adds upkeep, drag and longer
flagella; income lagged). **Fixed (author): organelles keep pace up to 2×, half beyond** (grow.js organelleGrowth).
**2nd:** day 10: **Bathyscapha 16, Noctilla 8, Trochilla 1 (1.6×, energy-poor: its oars grow and cost more)**;
Saltella eaten out by day 5.2; both Raptillas starved ON THE FLOOR (day 5.6-5.7) after draining Saltellas deep (the
tail stops while feeding: a heavy prey drags both down; the drained prey dies on the floor and the hunter is stuck
there); Caecella died day 1.8 (its oil clock). 3 days from the floor: Noctilla divides by day 3, Saltella 1.9×.
(2) ~~stealing plastids~~ **BUILT (2026-11-02; decided with the author):** a working copy that fades; taken when
the prey dies of draining, biggest first, as many as fit (round, its own size, the nearest free spot from the
middle; the rest digested); shared out at division (alternating; a daughter keeps what fits her smaller body, else
digested). Defaults Claude set: output halves every sandbox day (PARAMS.steal.half 600 s; gone below 5%), bright
light damages them and they are never repaired. They live on the cell (cell.stolen [{ at (newborn frame), r,
pigment, damage, fade }], never in the design): grow.js withStolen adds them as inclusions (inc.stolen) at every
build; metab.js fades them and skips their repair; prey.robbed (one thief). Page: drawn paler as they fade with a
dashed outline; numbers "stolen 1 plastid at 45% of their output" and their upkeep; log "stole 2 plastids from the
Saltella it killed (1 didn't fit: digested)", "a stolen plastid faded away"; rebuilds and Test a day carry them.
**window.__tg** (sandbox/main.js: the live world and selected cell) for headless page tests. Check 28y (54 checks).
Measured: a newborn Wave-tail hunter (r 8) kept 1 of a prey's 2 plastids, grown to 4× it kept both. Found on the
way: **a drained prey in light never starves** (its own plastids refill its pool every step: the hunter only taps its
income) and an oil prey only trickles: kills happen in the dark or on store-less prey.
**Stealing from a LIVING prey (author, 2026-11-02: "stealing plastids doesn't mean the prey dies"):** every
PARAMS.steal.every (30) s a peduncle stays latched, the prey's biggest plastid that fits in the thief moves through
(metab.js l.stealT -> cell.toTake; grow.js take()); the prey lives on without it: its own are marked cell.lost (the
design part stands in as an empty rule part, so indices stay) and **rebuilt from its growth meter at growth prices for
their volume before it grows further** (author's choice); daughters inherit the gap and rebuild too; one it had stolen
is simply gone. A kill still gives up what is left that fits. Page: "robbed" line in the numbers; log "took a
plastid from a living X", "a X took one of its plastids through its tube", "rebuilt a plastid a thief had taken".
Raptilla 2 (scratch: grows to 3× before dividing, feeds only in light) under the kill-only rule: grew to 2.8×, kept
no plastid (none fitted at its two kills), divided on day ~7.5, both starved deep on day 9.
Same with mid-meal stealing: still none fitted. **Why: free room comes in thin gaps** (Raptilla 2's organelles fill
15-20% of it, but its biggest round gap is r 1.9 µm newborn, 3.0 at 2.8×; a Saltella plastid is 3.5). **Stolen
plastids squeeze (author):** into the roomiest gap down to PARAMS.steal.squeeze 0.6 of their radius, keeping their
volume and output (stolen.v; income × v / drawn v). **Contest with squeezing (Raptilla 2): day 10: Bathyscapha 17,
Noctilla 4, Raptilla 2 SIX (thieves carrying stolen plastids: one at 2.7× with 4), Trochilla 1; Saltella extinct (day
9.4), Caecella dead (day 1.8).** 26 latches but only 3 kills: **hunters farm their prey** (latch in light, take a
plastid every 30 s; the prey lives and rebuilds), mostly on Bathyscapha. First contest where a hunter makes a living.
**Seven-species contest (2026-11-02; old oil numbers): day 10: Scalella 22 (chains of 6, 6, 5, 2), Bathyscapha 13,
Saltella 10, Noctilla 4, Trochilla 1; Caecella starved day 4.8 (was 1.8); Raptilla 2 extinct** (15 of its 19 latches
on Saltellas, which now jump free when drained: none died of it; each latch cost 40k: the thief starved out; it ate one
Bathyscapha, divided, both starved on the floor). Scalella beat its parent Bathyscapha: chains (sharing, shielding) and
small cells take nitrogen faster per volume. The floor killed a Noctilla, a Saltella and both Raptillas.
**Same contest with the new oil:** day 10: Scalella 20 (chains 6, 6, 3, 2, 2), Bathyscapha 17, Saltella 11, Raptilla 2
2 (38 of its 43 latches on Saltellas, which jump free), Trochilla 1, Noctilla 0 (one starved on the floor day 6.4, one
at 620 µm day 7.6), Caecella 0 (day 4.9). Faster oil didn't rescue the oil users; drifters still lead.
**The floor trap (author: "needs to be solved cleverly, not with an SOS button"; chose a sense of depth):** the
Nutrient sensor is back in the Build panel (Sensors; tip: poor upper half, rich below the nutricline ~1 mm, less
where cells used it up). Measured: Noctilla now sinks to the floor at night (1,988 µm); with "rests … unless the
nutrient sensor tastes rich water" it never goes below 1,001 µm (wakes at the nutricline, hovers) and divided by day 3.
The sensor saturates below ~1.3 mm: a two-zone gauge (upper / lower half), enough to stay off the floor.
**Oil retuned (author, 2026-11-02: "is oil still a good tool?"):** it lost to starch every night: a night is 300 s and
oil released a full store in 600 s, so an awake night needed an oil store 1/15 of the upkeep rate vs starch 1/20, and
it filled only halfway in a day. Now PARAMS.metab.oil fill 1/400, burn 1/300 (one night): oil carries a night in less
room (1.5× denser) but fills slower and floats; starch fills and bursts faster and is ballast. Budget tip now says
"starch (2× quicker)". Measured 3 days from the floor (4 starts): Noctilla, Caecella, Raptilla 2 never starve;
Noctilla 1.9× by day 3 (divided before: more of the surplus goes into the store and is burned at night).
(3) **chains** (author: chains form when cells interact, at division or not: kin pads meeting
already make them; "at division" is only one way, a daughter starting stuck; **what chains should offer (author,
2026-11-02): protection from predators, more buoyancy, cells in a chain trading nutrients between themselves, more
resting, etc.**; **the chain's form comes from where the pads sit and the cell's geometry** (author; already true in
the physics: front-back pads a line, angled pads an arc or ring, three a star; rods end to end a thread, side pads a
ladder). **CHAINS BUILT (2026-11-02), as planned below, plus (author, mid-build): middle cells' daughters SLOT IN (between the
mother and a neighbour; her twin pad takes the neighbour's link; the chain's links can't snap for PARAMS.pads.grace 1 s
while contact pushes it apart: without that the shove snapped them), and a CAP by volume (PARAMS.pads.chainVolume = 8
r 10 cells: smaller cells longer chains up to maxChain 32, bigger ones shorter, at least 2; a full chain's daughters
separate; the same when kin meet). Code: divide.js chainSpot (least turn first; padNormal, posedClear, chainOf);
build.js pad.go/controls (joint { type: 'hold' }); sense.js pad.go, drainedLevel (BUILT_IN -7); interact.js letGo
for pads (rule fails, either dies), groups() ignores feed links and sums volume, cell.shield; physics.js body drag ×
shield; metab.js shareChains (PARAMS.pads.share 0.05/s). Page: pad card "Holds always / while …" (pill JOINED / FREE
/ LETS GO), Drained in the readings ("unless it is being drained"), old pads get the rule slot on load, numbers
"chain 3 cells joined…", log "born by division, joined to its mother in a chain". Measured: r 10 front-back pads: a
straight line, longest 8; arcs (±60°) curve 60° a cell; three pads branch; a chain of 3 sinks 11% faster; an emptied
pool refilled to 25% by its neighbours in 10 s. Seen in the page (8 cells in a line). Check 28z (55 checks).
**The plan as decided:** (a) **forming at division by the pads:**
a cell with kin pads places its daughter pad to pad (turned so the pads face), joined; meeting kin still sticks;
no pads, they separate; (b) **breaking:** links snap under force, a dead cell lets go, and each kin pad may carry an
optional rule **"Holds while…"** (none: always holds); (c) **sharing:** joined kin slowly even out their energy pools
and their growth meters' nitrogen (automatic); (d) **defence:** a built-in **"Drained" reading** (on while a peduncle
drains this cell; with sharing a predator drains the whole chain through one cell), wired by the player, e.g. a pad
"Holds while not drained" cuts the victim loose; (e) **resting** comes from sharing (no new rule); (f) **floating:**
chains don't float better (author agreed: a chain sinks like its cells in this physics); chains help **swimmers swim
faster** and mostly **defend**: **drag shielding (author: yes, simple):** a cell joined to kin feels less drag (~15%
less with one neighbour, ~25% with two; to tune), so chains of swimmers outpace singles and passive chains sink a bit
faster. **Later, with moving water:** chains in currents take layouts that maximise photosynthesis (author); needs
moving water and self-shading (light today depends on depth only)); (4) ~~engulfing~~ **ENGULFING BUILT (2026-11-02; decided with the author: a mouth, gape-limited;
digested over time with NO physical food vacuole (lowest bug risk; author: "wont engulf cause lots of bugs?"), but
drawn shrinking inside (author: "make it disappear slowly from the inside"); and the predator needs ROOM (author:
"won't the predator need a lot of space to swallow"): the prey's volume must fit its free cytoplasm):** a 'mouth' part
on the rim (Hunting: "Mouth"; joint { type: 'engulf' }, rule "Engulfs when…"); interact.js swallows another species'
cell touching it (PARAMS.engulf.reach 2 µm) if prey radius ≤ gape 0.5 × its own and prey volume ≤ its free cytoplasm,
not while digesting; the prey is marked eatenBy and dead, death.js removes it at once (its nitrogen goes to the
predator, not the water; links cleaned as for any removal); metab.js digest(): over PARAMS.engulf.time 60 s the
predator keeps keep 20% of its energy (pool + stores) and keepN 50% of its nitrogen. Drawn: the mouth a dark gap with
a pale lip, the meal a brown body shrinking and fading inside; pill DIGESTING / READY / OFF; log "swallowed a X
whole", "digested a X: kept Nk pJ". Found: a mouth adds no reach (the near test needed + reach). **Chains protect (author, 2026-11-02: "wouldn't chains protect the cells?";
"unless the predator breaks the chain with some strategy and then can swallow the loose cells"):** a chained cell
counts as its whole chain: swallowed only if the chain fits across the predator (its extent ≤ the predator's width),
in its free room, and every cell within the gape; then the whole chain at once. Breaking chains already works through
physics (a drained cell dies and lets go; links snap under a pull; a kamikaze burst kills its cell). **Gula** (Claude,
a swallower; designs/gula.json): Bathyscapha at 1.5× with four mouths, eats Scalella-sized cells; directly below a
Scalella it swallowed it within a fifth of a day, but 60 µm apart side by side they never met in 3 days: **in a still
tank drifters only move up and down, so encounters need shared columns** (moving water would fix it for every hunter).
Mouths cost nothing yet (no upkeep, no room): a balance point. Check 28ae (59
checks). Seen in the page. Was: **engulfing, if possible** (only a
considerably bigger cell swallows a smaller one whole); (5) **toxins** last, open to debate (feels abstract). **PRIORITY (author, 2026-11-02: "important"): pads that sense and attract, the Neighbours
reading, and a nitrogen store ("seems good").** **Nitrogen store DROPPED for now (author, 2026-11-02, after weighing depth vs
confusion):** the growth meter's N bar already banks a doubling's worth (migration works through it); a store only
matters beyond that, and would add a second place nitrogen lives and a third Content under "Energy store". Revisit with
seasons or long dark spells. **Pads and Neighbours BUILT (2026-11-02; author chose both, and kin pads only, short and
weak):** a rule can read any pad by its id (0 free, 0.5 joined to kin, 1 stuck to a stranger; build.js PAD_READ -100 -
its index, sense.js padLevel; a module only once wired) and the built-in **Neighbours** (-8: kin joined, 0..4+;
interact.js cell.neighbours; offered when the design has kin pads); free kin pads pull free kin pads of their species
within PARAMS.pads.attract 15 µm at PARAMS.pads.pull 3 pN (mucus and strangers: no), not while the pad's rule fails;
rewire() knows pads. Check 28aa (56 checks). Seen in the page: the rule editor lists the pads and Neighbours. **ALARM BUILT (2026-11-02, the swarm's first piece; author chose "a cue in the water"):** a
built-in reading (-9): kin within PARAMS.alarm.range 60 µm (surface to surface) of a cell being drained read 1
touching to 0 at the range, fading over PARAMS.alarm.fade 3 s once the attack stops (interact.js cell.alarm); not
the victim itself (it has Drained), not strangers; how near, not which way. Log "alarm: a kin nearby is being drained".
Check 28ac (57 checks). **KAMIKAZE BUILT (2026-11-02; author: no size rule, "let the economics decide": a burst costs the whole cell, cheap
when small; small sacs add up around one predator):** material 'toxin' (sim/materials.js), PARAMS.toxin (range 30,
energy 5000 pJ and damage 10 per µm³ of sac at contact, nitrogen 2 per µm³ at each doubling); build.js inc.toxin and
its controls (joint { type: 'lyse' }); sense.js inc.go; metab.js burst() at the start of metabolize: the cell dies
("burst itself (its toxin sac)"), other-species cells within range lose pool then store energy and plastid health,
o.poisoned. Page: Build panel "Toxin sac" (Inside the cell; tip), card "Bursts when… (dies, poisoning other species
within 30 µm: kin are immune)", pill SAFE / ARMED / BURST, drawn magenta, log "burst itself: its toxin poisoned N
cells" / "poisoned by a X bursting close by". Measured: a prey with a r 4 sac, "bursts when it is being drained":
the hunter lost 1.08 million pJ and fell to 63% plastid health; kin 35 µm away and a stranger 80 µm away spared; the
sac raised a doubling's nitrogen 4,189 -> 4,725. Check 28ad (58 checks). As decided: a TOXIN SAC part (room, upkeep, double nitrogen for its
volume at each doubling), rule "Bursts when…" (none: never); bursting kills the cell and POISONS other-species cells
within 30 µm (energy lost and plastid damage, by sac volume and nearness); kin immune. **(6) Swarm / kamikaze defence (author, 2026-11-02):** one cell attacked, kin nearby
respond: surround the predator, release a toxin, damage it, or make it sink. Pieces: Drained exists (the victim knows);
needed: an ALARM reading (a kin nearby / in its chain is being drained; real: wounded diatoms release oxylipin alarm
cues); making it sink can come from physics already built (kin piling onto it with mucus pads, their weight); kamikaze
(die on purpose, "self-destruct when…", releasing harm) needs toxins or contact damage (harpoons). Design one question
at a time. Scratchpad tools are gone with the
chat: for headless page tests write a CDP script (headless Edge, --remote-debugging-port, Network.setCacheDisabled or
the profile caches main.js) and kill the Edge processes after; contests run in Node with PARAMS.grow.cap raised.

**Previous handoff (2026-11-01, end of a long chat): STEP 1 STARTS, the living tank.** The sandbox is done for now
(author: "if u think it's good enough lets go to the next step, with reproduction, division, nutrients"). Rules are
sentences with ranges, maps and links (all built, see the log's 2026-11-01 entries); the budget line and its warnings show
whether a design survives; Claude designed three species that survive day and night from the floor (Bathyscapha,
Noctilla, Caecella; designs/, in From Claude) and reported on balance (the log: "Balance, from building four species" is
in the chat; its points are in the entries for each species). **The plan for step 1a, agreed in outline (author said yes to
the first decision; the rest still to settle ONE QUESTION AT A TIME, with a recommendation, before building):**
1. **Nitrogen, a second currency (DECIDED, author 2026-11-01: growth needs BOTH energy and nitrogen).** Rich deep, poor at
   the surface (replace sim/nutrient.js's fixed layer with a field cells use up locally, mixed back from below slowly);
   taken up through the cell's surface; the sap vacuole's planned job as a nitrogen store. Purpose: light is up, nitrogen
   is down, so depth and migration matter (today a still cell does as well anywhere between 100 and 1,500 µm).
2. **Growth:** surplus energy + nitrogen fill a growth meter (the day's wasted surplus finds a use); the cell visibly swells a
   little. **Cost DECIDED (author 2026-11-01, Claude's recommendation):** a division costs energy and nitrogen in proportion
   to the cell's volume (~300 pJ per µm³: ~1.2 million pJ for an r 10 cell, about the surplus a good design wastes today);
   no fixed rate: once a day, twice, once in two days comes out of how the cell is built ("if it has all it needs to divide
   it's cool"). The author expects **smaller cells to divide faster**: energy alone is scale-free (plastid share of volume),
   so that has to come from nitrogen taken up through the surface (surface/volume falls with size). Priced per part by
   material: later. **Swelling DECIDED (author 2026-11-01, Claude's recommendation): drawn only**, up to ~8% wider as the
   meter fills; the physics keeps the designed size; real growth (the design as the newborn, growing to 1.26× its volume)
   kept for later.
   **Trigger DECIDED (author 2026-11-01: "automatic and rule"):** divides by itself when the meter is full, unless the
   nucleus carries an optional DIVIDE when… rule (like REST), in which case a full cell waits until the rule holds; while
   it waits, its surplus goes to the stores as today.
   **Nitrogen DECIDED (author 2026-11-01, Claude's recommendation): the meter has two bars, energy and nitrogen; it divides
   when both are full.** Uptake through the surface (in proportion to surface area and to the water's nitrogen there,
   levelling off when rich); a division needs nitrogen in proportion to volume, so half as wide fills in half the time.
   Round numbers to tune from: an r 10 cell fills its N bar in ~half a day in the rich deep, ~5 days at the surface
   (surface ~1/10 of the deep). The N bar is the store (a migrator fills it deep at night, energy near the light by day);
   no separate N pool; a nitrogen store part (the sap vacuole's old job) later.
   **Cap DECIDED (author 2026-11-01): 24 cells in the sandbox**, **lowered to 12 (author 2026-11-02: "make it a lower cap,
   fewer cells")** after measuring: 16 cells in a clump cost ~0.5 s of computing per simulated second (~200 ms spread
   out), so 24 would run a sandbox day in ~5 minutes at best; at the cap a full cell
   waits ("tank full"), surplus to its stores; nothing is removed to make room. The fast mode (1b) lifts it.
   **Death DECIDED (author 2026-11-01, Claude's recommendation):** dies after its energy pool has been empty 60 s in a row
   (a tenth of a day; resting doesn't pause it); turns grey, parts still, sinks; removed at the floor or after 30 s; the
   trouble log says why and where; **its nitrogen (body share + its bar) goes back into the water where it is removed.**
   **All step 1a questions settled (2026-11-01). Build order:** (a) the nitrogen field (replaces sim/nutrient.js's fixed
   layer; used up locally, mixed back from below) and uptake into the N bar; (b) the energy bar and drawn swelling;
   (c) division (automatic, the DIVIDE rule, the cap); (d) death and nitrogen returned; (e) the lineage shown (count,
   graph, generations, births and deaths). Check each in Node (Claude's species must still live) and in the page.
   **(a) and (b) BUILT (2026-11-02), shown to the author before division.** makeWorld(…, { grow: true }) (the sandbox
   and Test a day use it; checks don't): sim/nutrient.js is now a field of 40 layers (world.nitro; nitrogenAt(world, y),
   takeNitrogen, mixNitrogen: each layer eases back to the usual profile over a day, PARAMS.nutrient.resupply, and evens
   with its neighbours); the profile now has a surface floor (PARAMS.nutrient.surface 0.06). cell.grow { E, N, Eneed,
   Nneed, uptake } (sim/metab.js, PARAMS.grow): N by body.area (build.js now stores it) × n/(n + 1), ×0.4 resting, none
   starving; E = the pool above fillAbove after the stores. Shown: 🌱 ⚡E% N% on the clock line, "growth" and "nitrogen"
   in the numbers, two lines in the day graph, trouble log "has the energy / nitrogen for a division", the body drawn up
   to 8% wider (min of the bars), the tan haze from the live field. Rebuilds and Test a day keep the bars and the water.
   **Measured (3 days from the floor, none starving):** energy bar ~1.3 d for every r 10 species from an empty start;
   nitrogen: Saltella (nights at ~1.6 mm) 1.25 d, Trochilla (deep nights) 1.06 d, Noctilla 1.6 d, Bathyscapha (surface
   nights, big rod) 2.2 d, Caecella (lives ~300 µm) ~3.4 d. Trochilla is energy-limited (four oars rowing: 85% after 3
   days). So nitrogen paces most designs and depth decides it; costly swimming paces others: different limits per
   strategy, as hoped. Resting slows uptake to 40% (a trade-off for deep resters; told the author).
   **Collisions between species tested (author asked, 2026-11-02):** contact (sim/interact.js) is species-blind, only pads
   care. Overlapped pairs of any species part within 0.5 s (a brief fast push, moving each only by the overlap); a swimmer
   driven into another species slides round it (worst overlap 0.7 µm); a clump of 16 cells of four species sorts itself
   out on the floor and in mid-water, nothing lost. Check 16b keeps it tested (46 checks). Division must place the
   daughter touching, not overlapping, to avoid the push.
   **(c) Division BUILT, automatic part (2026-11-02; author: "divide should form two identical cells, same size").**
   sim/divide.js (divideCells, every PARAMS.grow.every steps, in stepWorld with world.grow): both bars full, not
   starving, fewer than PARAMS.grow.cap (12) cells → a daughter of exactly the design, turned the same way, every joint
   as the parent's, placed touching (0.5 µm) beside it across its axis, else ahead / behind, the nearest spot where all
   its pieces clear every cell and the tank's edges (else it waits: cell.waiting 'tank full' / 'no room beside it');
   pool and each store's fill halved between the two; plastid damage and chamber state copied; both meters to zero;
   cell.uid (addCell), gen (both +1), mother, born; world.births. Shown: 👥 n on the clock line, "lineage" and "(ready;
   waits: …)" in the numbers, "divided: two cells now (generation n)" / "born by division" / "ready to divide, but
   waits" in the trouble log; rebuilds keep uid, gen, births. Check 28s (47 checks). **Measured:** a Saltella from the
   floor: 2 cells at 1.5 d, 4 at 4.5 d; the second division took 3 days because it **divided at dusk**: half its starch
   ran out in the night and the next day's surplus went to refilling the stores first. A reason for the DIVIDE rule
   ("divide only after dawn"). Speed: 1 Saltella ~15 ms per sim s, 2 touching ~43, 4 ~90-120. **Not yet:** the DIVIDE
   when… rule (the nucleus carries one rule, REST, as its joint; a second rule on one part needs plumbing in build.js
   and the rule cards); chains at division. The phone's clock line overflows (it did before; to tidy).
   **The first contest (author asked, 2026-11-02): Claude's five species, one each from the floor, 10 days, headless
   (cap raised to 200 for the run; no predators then).** Day 10: **Bathyscapha 8, Noctilla 8, Saltella 8 (1 death),
   Trochilla 4, Caecella 0** (both its cells died on day 3.8). Why Caecella died: it divided at 16:24; each daughter got
   half its oil (50%), and its rest rule needs oil above 85%, so neither rested; both swam all night, oil released too
   slowly, both starved at 01:24 with a third of their oil left. **Lesson: rules tuned to full stores break after a
   division** (a reason for the DIVIDE rule, e.g. divide only in the morning so the stores refill by night). The
   nitrogen at 1 mm fell from 0.52 to ~0.39 as the population grew (depleting begins at ~30 cells). Run time ~50 min.
   No density limit yet except nitrogen: the contest measures growth rate.
   **The DIVIDE rule BUILT (2026-11-02; Claude's pick of what next, author: "do what you feel is best").** A design part
   { type: 'rule', id: 'divide', label: 'Division', joint: { type: 'divide', controls } } that nothing in the tank
   draws; the sandbox adds one to every design (withoutTimers), its card under "Life cycle" (no Remove, no mirrors):
   "Divides when its growth meter is full [and …] [, unless …]."; pill n% GROWN / WAITING / DIVIDING; map "WHEN IT WOULD
   DIVIDE". build.js cell.divideRule { part, controls }, sense.js cell.divideOk, divide.js: a full cell whose rule
   doesn't hold waits ('its DIVIDE rule says not yet'). Its conditions take nucleus slots like any rule. Check in 28s
   (50 checks). Test-browser lesson: the headless Edge profile cached main.js; tools in the scratchpad now disable the
   cache (Network.setCacheDisabled).
   **Predation and defence (author, 2026-11-02: "strategies for cells to kill other enemy cells, opportunistic
   behaviours, taking rides, stealing energy or plastids, or killing through other forms; and strategies for resistance,
   chain forming etc."). A menu offered to the author, order to settle one question at a time:**
   attack: (1) **peduncle** (myzocytosis, *Dinophysis*): latches on touch and drains energy and nitrogen; (2)
   **kleptoplasty** (*Mesodinium*, *Dinophysis*): the drained prey's plastids move in, keep working, fade; (3)
   **engulfing** (phagotrophy, *Noctiluca*, many dinoflagellates): swallow a smaller cell whole, gape limited by size;
   (4) **toxins** (*Karenia*, *Prymnesium*, *Alexandrium*): a cloud in a field like nitrogen that harms other species,
   kin immune, costs nitrogen; (5) **harpoons** (nematocysts, *Polykrikos*): fire on touch, wound; (6) opportunism that
   already half exists: mucus pads (riding a swimmer), out-taking nitrogen. Defence: size (too big to swallow), spines
   (bigger to a mouth, keep a peduncle off), glass / chalk walls (resist piercing), **chains** by kin pads (too long to
   swallow; chains at division), the spring escape on touch (built), feelers to flee, toxins as deterrent, mucus,
   depth (hiding). Plus a **non-player grazer** (step 1b plan: a ciliate or copepod-like hunter that grazes whatever is
   common: kill-the-winner keeps monopolies hard, and gives every defence a reason even in a one-species tank).
   **(d) Death BUILT (2026-11-02).** sim/metab.js: with world.grow, cell.starveT counts seconds of empty pool in a row;
   at PARAMS.grow.die (60) cell.dead (diedAt, diedWhy 'starved'); dead, metabolize earns and spends nothing, motors off,
   chambers drift neutral. sim/death.js removeDead: on the floor or PARAMS.grow.gone (30) s after dying, removed, its
   nitrogen (Nneed + its meter's N) back into the layer where it is, pad links renumbered; world.deaths, world.gone.
   Sandbox: drawn faded with a grey outline; numbers "STARVING dies in N s" / "DEAD starved: sinking…"; trouble log
   "died: starved (1686 µm deep, 60 s without energy)"; the followed cell gone, the view follows its kin; rebuilds don't
   resurrect dead copies. Check 28t (48 checks).
   **DECIDED (author, 2026-11-02): NO GRAZERS** ("I want this a battle between existing species for survival and
   dominance"): every attack and defence is between players' species. **The glass wall goes** (silica is a layer of
   complexity too many): to be replaced by **some way to form an armoured wall** (to design with the author; protein
   stays the plain wall). **The first attack part: the PEDUNCLE (author, 2026-11-02, Claude's recommendation).** A
   feeding tube on the rim; latches on touching another species' body (not kin, not spines) and drains it. **Decided so
   far:** a fixed length to start (stretching later; author: "10 µm seems short, it should be able to stretch… start
   basic"); **it takes energy in whatever form the prey releases** (no menu: it sucks the prey's pool, which the prey
   refills from its own stores at their burn speed: starch prey are rich and quick, oil prey give a trickle and starve
   with their oil unspent; a choice of what to steal belongs to stealing plastids later) **and nitrogen from the prey's
   growth meter**; **a steady drain while latched: up to 20,000 pJ/s and 50 N/s, the predator keeps half** (author:
   "middle term, but we need to ensure balance"; a ramp was offered and dropped: steady is clearer; a piercing delay is
   the knob if predators kill too fast). Balance by contests. **Latching (agreed):** by itself when its tip touches the
   body of another species (no rule = always feeds); an optional rule "Feeds when…" (no latching while it doesn't hold,
   and it lets go); lets go when the rule stops, when the prey has nothing left (it stays on a dead prey until then), or
   when pulled harder than 40 pN (a kin pad's strength: steady swimming ~4-10 pN holds, a spring jump ~50 pN snaps,
   a tug of war may). **Costs (agreed):** upkeep by length like any outside part; **40,000 pJ to pierce, each latch**
   (~4 s of full gain: latching on poor or escaping prey loses); half the take lost; the tether and the prey's
   defences come from the physics. No hidden stat penalty. Length: ~20 µm fixed to start.
   **Peduncle BUILT (2026-11-02).** A segment with joint { type: 'feed', controls } (rigid; the "joint" only holds its
   rule, as the chamber's and REST's do); build.js cell.feeders [{ piece, x: its tip, r: mouth, part, controls, go,
   link }]; sense.js sets f.go from its rule (none: always); interact.js latches a free feeder whose rule holds and whose
   pool has the piercing price, its tip within PARAMS.feed.mouth (1.5 µm) of another species' BODY (piece 0 only), as a
   pad-like link { feed: true, pieceB: 0, took, tookN }; it lets go when its rule stops, its cell dies, or metab sets
   link.done (a dead prey with nothing left); A.lastMeal { prey, why: drained / died / rule / torn, took }. **A feed
   link breaks on its pull averaged over PARAMS.feed.loadTime 0.1 s** (found: a swimmer's own strokes jerk its body ~10
   µm 20 times a second and tore every latch off within 8 ms; a spring jump's long pull still snaps it). metab.js
   feed(): sucks min(rate·dt, prey pool) (a dead prey: its stores directly) and min(N rate·dt, prey meter N), keeps
   half (pool; N into its meter), m.feeding (pJ/s kept), prey.drainedBy; a cell starving to death within 60 s of being
   fed on dies 'drained by a <species>'. Sandbox: Build panel "Peduncle" (On the outside; category Hunting), its rule card
   "Feeds when… (latches on another species' body it touches…)", pill FEEDING / READY / OFF, the map "IT WOULD FEED";
   the latch drawn as a red line and a red dot on the prey; numbers "feeding on a X: +N pJ/s kept" / "DRAINED by a X";
   trouble log "latched onto a X (40k pJ to pierce)", "let go of a X (nothing left / torn off…): took Nk pJ", "a X
   latched on: it is being drained". **Measured (a still predator, no plastid, dark):** a prey with no store dies in 68 s
   (83k kept); a starch prey (r 5 store) in 215 s (1.3 million kept, full N); an oil prey releases ~7,800 pJ/s, so the
   predator keeps less than its upkeep (it starved first). A swimmer latching on pushes its prey along while feeding.
   Check 28u (49 checks). **Length slider (author, 2026-11-02: "the longer the more energy needed to use it"):** 10-80 µm
   (default 20); piercing costs PARAMS.feed.pierce 2,000 pJ per µm of tube (f.cost: 20 µm 40k, 80 µm 160k); upkeep by
   length as every outside part. Not yet: stretching, stealing plastids; the contest with a hunter.
   **First, the author asked for a contest:** all Claude's species in one tank, 10 days, which
   has the most cells.
3. **Division:** the meter full, the cell splits: the daughter an exact copy (kin), beside it, stores shared. Later: a rule
   for when to divide; chains at division with kin pads.
4. **Death:** starving too long, it dies, sinks, is removed; the trouble log says why ("starved at 03:20, 1.9 mm deep").
5. **The lineage shown:** population count and graph, generations, births and deaths.
Step 1b after: grazers (the surface costly at night: the author worried Bathyscapha "stays on the surface exposed to
predators"), then a fast mode for big populations and matches (full physics carries ~10-30 cells at playable speed).
**Open questions to ask first (one at a time):** what the growth meter costs (energy and N per division, in round numbers);
the division trigger (automatic when full, recommended for now); whether size grows before division; how nitrogen is
taken up (by surface area, saturating) and whether the cell needs a nitrogen store to migrate; the population cap; what
death leaves (nothing, or nutrients back to the water). Keep the sandbox playable at phone speed. Check every change in
the real page (headless Edge, phone size) and run tools/check.mjs after any sim/ change; Claude's species must still live
(scratchpad scripts are gone with the chat: re-measure in Node with sim/world.js, a cell from the floor, 3 days).
**Practical lessons from the last chat:** editing main.js through inline `node -e` with template literals in Bash breaks
(the shell expands backticks): write scripts to files or use the Edit tool; a `git checkout` turns files to CRLF, after
which multi-line string matches fail (strip \r first). Kill headless Edge processes after testing (they slow the server).

**Where we are:** step 0, the physics sandbox, is built and being played with by the author; step 1 (the ecology) is
next once they are happy with it. Two long chats so far (2026-10-21 to 23: design and sandbox; 2026-10-23 to 24:
building tools, sensors, rules, journal). Every decision is in this file; the sections below the handoff are a
chronological log, newest additions last in each block.

**Run it:** `node tools/serve.mjs --lan` (from this folder), then http://localhost:5180/sandbox/ on the computer;
the phone uses http://192.168.1.69:5180/sandbox/ (home Wi-Fi; the page shows it under its title). Restart the server
after changing tools/serve.mjs. `node tools/check.mjs`: 45 physics checks, all passing (~2 min). Check every change
in the real page with headless Edge over the DevTools protocol at phone size (400×860) and look at screenshots.
**The website (author, 2026-10-28):** https://vitorhugo1992.github.io/tinygod/sandbox/ (GitHub Pages from the public
repo github.com/vitorhugo1992/tinygod, branch main, root). **Push after every finished step** (`git push`) so the
author gets it anywhere. Offline: sandbox/sw.js (registered only on https) keeps a copy, network first, so a phone that
opened it once runs it with no connection; add a new sandbox/ or sim/ file to its FILES list. Home-screen manifest and
icon in sandbox/. Away from home there is no server: 📤 Send to Claude copies the design instead (the author pastes it
in the chat); 📥 From Claude reads designs/index.json, so after writing a design for the author run
`node tools/designs-index.mjs`, commit and push. 📋 Copy / 📋 Paste carry designs between devices (each address keeps
its own saved designs).

**The sandbox today, in short:** a still 2 mm tank with light from above and a 10-minute day. Build a cell from parts:
flagella (wave tail, with Pull; flexible oar; stiff flap; Length; Flip; mirror copies), spines, an escape (the spring), inside (plastid Sun / Shade; one Vacuole part with Content Starch / Oil / Sap / Gas; any of them round or
a rod), pads, sensors (eyespot, statolith, touch, proximity, nutrients; built-in energy, starch and oil levels), and the
**nucleus**, the brain box (below).
Each moving part has a **rule card**: GO when / OR GO when / STOP if (the override), conditions "above / below /
between / outside" or "more / less than" another sensor, and a BEAT SPEED that can follow a reading either way; the
🎛 Wiring view shows the same rules as a modular synth (GO boxes, a red STOP box). Metabolism v0 (energy, upkeep,
stores that fill and burn and change buoyancy, gas vesicles that wear and crush). Seeing why: 📈 day graph, "what
happened" trouble log (ⓘ), ↗ force arrows, nights left; ⏩ Test a day forecasts. Ghost preview with nudge-to-fit,
Undo/Redo, edits keep the time of day and the tank. 💾 Save (in the browser), 📤 Send to Claude (the server writes
designs/<name>.json: when the author says they sent one, read designs/), 📥 From Claude (write designs/<name>.json as
{ name, from: "Claude", note, design } and tell them to tap it). The sandbox opens with an empty cell; Claude's
species Vesperella (a daily migrator) is a preset and starts in the saved designs.

**Too much light hurts (built 2026-10-24).** Diagnosis after designing two species (Vesperella; the author's legged
cell, designs/my_species_survives_night.json): **one answer won: get to the surface and stay there** (bright light
never hurt, nutrients don't limit growth, no grazers), so the shade plastid, depth-holding and eyespot "not too
bright" rules had no purpose. Fix: **photoinhibition** (PARAMS.metab.photo, sim/metab.js): light above a safe level
(sun 0.4, shade 0.15 and twice as fast) damages a plastid (0-1), its output falls in proportion, repair runs all the
time and costs energy; a starving cell can't repair. Plastid output raised 10% (sun 55, shade 33) so the best depth
pays about what the surface used to. Measured (a plastid held at a depth): sun best ~500 µm down; the surface earns
39% less at noon, 21% less over a day; shade best ~1.3 mm, badly hurt near the top. Shown: plastids bleach toward
pale yellow, a "plastids" line in the day graph, "bright light damaged its plastids" / "mended" in the trouble log,
"repairing plastids" in the budget; **plastid health** is a built-in reading ('health' in wiring, 🌿), offered when
the design has a plastid (author: partly redundant with the eyespot, but kept as a way to build without one).
Rebuilds and Test a day keep the damage. **Consequence:** Vesperella and the legged cell,
which sat at the surface and only just broke even, now starve some nights (they need to stay out of the noon light;
Vesperella's strong gas vesicles keep floating it back up). Step 1 then adds the other two costs of the surface:
nutrients needed to grow (surface poor, deep rich) and grazers.
**Swimming costs more (author, 2026-10-24, option A of two; a deliberate break from "running is nearly free"):** a
beating motor costs PARAMS.metab.beat (10 pJ/s) per µm of its piece and the passive pieces hanging from it, times its
beat speed, nothing at rest (burst organs excluded; on top of the real work). A 48 µm tail: ~530 pJ/s, ~6% of a
surface cell's income. The budget line reads "flagella beating". Resting now pays: buoyancy beats swimming to hold a
depth. The author chose this over higher flagellum upkeep (B), which gives no reason to rest.
**Sap vacuole and oil: kept** (author, 2026-10-24), to retune in step 1.
**An eyespot facing away still sees some light** (author, 2026-10-28: upside down in bright surface water it read
dark, "doesn't make sense"): reading = light × (PARAMS.sensor.scatter 0.2 + 0.8 × how squarely it faces up, within its
cone); scattered light and light through the shield. Direction still shows (up 1, away 0.2 of the light there).
**The ejectisome was removed and the burst organ renamed Spring** (author, 2026-10-28: "i dont like the ejectisome";
"Burst organ is much better, but I don't like the name"). The ejectisome left the Build panel and presets; its physics
(an extending ribbon) stays for check 13, and old designs with one still edit. The spring keeps its template name
("Burst organ (escape)") and code names (joint.burst) so saved designs load; their "Burst organ" labels read Spring.
**Parts audit (Claude, agreed by the author):** useless until step 1 gives them a world: escapes (burst organ,
ejectisome), touch and proximity (nothing to flee or meet), spines and glass wall (protection with no grazers), pads
and chains (a chain gains nothing), stiff flap (a lesson, not a part), nutrient sensor (nutrients feed nothing: only a
depth gauge). Weak: sap vacuole and oil (kept, see above; in step 1 oil becomes the dense slow store for several
hungry days and seasons, sap the nitrate store and the only two-way buoyancy). Doing the work: eyespot, statolith, wave tail,
oar, starch, gas, plastid, energy level. Also: size buys nothing yet (bigger only costs); no reproduction, so no
score; energy is the only currency. **The timer was removed** (author, 2026-10-24); designs saved with one load with
it stripped and its cables unplugged.

**The nucleus, the brain box (built 2026-10-28; author: "the brain box will shape much of the users' builds").**
sim/brain.js, PARAMS.brain. An inclusion (Inside the cell → Nucleus, always round, drawn like a real nucleus: violet,
envelope, chromatin specks, nucleolus; density 1100, upkeep 1 pJ/s per µm³). Its cross-section gives it **slots**
(7 µm² each). **One size for now** (author, 2026-10-28: "the size is something for later"): PARAMS.brain.radius 4.3 µm,
8 slots (was 4: two wired oars and their two sensors need 6); no Size slider, a tip says what it is; bigger nuclei later, unlocked by progress. **One per cell:** its Build
button hides while the cell has one. **Moving it:** Where and Inside, like any organelle; moving Where while it sits
at the very centre brings it halfway out (author: "I can't move it"). **What takes a slot (author chose A):** every sensor on the
cell, every built-in reading once wired (energy, starch, oil, health), every rule box (each GO box, a part's STOP box);
cables are free. buildCell refuses a design that needs more slots ("nucleus full: 5 modules, 4 slots. Free one:
remove a sensor or a rule box"), or two nuclei, so the ghost turns red and wiring is refused with the same words. **No nucleus = no brain:**
the sandbox drops the wiring (every part runs; Undo brings it back) and the rule cards say why; the physics itself
still reads wiring on any cell (the checks rely on it). **Opening it:** tap the nucleus in the tank, or 🧬 Open the
nucleus under On this body: the wiring view drawn as the nucleus opened up, a **rectangular box** (author: rectangle for
space efficiency) labelled "NUCLEUS · 2 of 4 slots" holding the sensor modules and rule boxes, free slots dashed, the
parts it drives outside at the rim, unwired built-in readings in an "available" tray above. Modules arrange themselves
for now (phones); **later: drag modules into the box by hand, fully customisable** (author: "dragging is part of its
puzzle-like charm"). Every new cell (Round cell) starts with an 8-slot nucleus. **Old designs deleted** (author: "forget
the old designs"): the Vesperella preset and its first-visit seeding, designs/my_species_*.json; designs/index.json is
empty. Not yet: a size cap unlocked by progress; cables costing upkeep (open).
**Clearer rules in the parts list (built 2026-10-28; author: "the wiring box is more confusing than the menu… first
improve the menu"; the box stays as it is until the list is clear).** Every part a rule drives and every sensor has
**its own colour** (8-colour palette, the least used first; stored as the root part's `tag`; copies and mirrors get a
new one): a stripe and dot on its card, the part drawn in it in the tank (faded while stopped, every piece its motor
moves), a ring round sensors, the same in the nucleus box. **Names you can recognise:** what and where ("Oar
(back-bottom)", "Eyespot (top)"; a statolith by the way it faces, "Statolith 45°", author's idea), ✎ to rename
("left leg"; stored as `name`; a copy's name is dropped). **Cards fold** to a one-line sentence ("Runs when ● Eyespot
(top) between 15% and 85% of full sun, but stops if ● Statolith 45° tilted below −6°."); tap the name or the sentence to
open the card. **Readings in words** (author: "many people won't know what a statolith below 0.45 means"): every value
bar says "= …" and every live reading "0.23 (−33°)": light as % of full sun, energy/stores % full, health % healthy, the
statolith as a signed angle (+90° up, 0° level, −90° down), touch touching / not, proximity "something within 30 µm",
nutrients poor / rich. **Tap a part in the tank** (a flagellum, spring or sensor; hit-tested on the drawn, calm pose):
its card opens, outlined in its colour, the part lit a moment; tapping a card's name lights its part too. **⧉ Copy rule
/ 📋 Paste rule from …** (author: "a chain of functions for a tail… something similar for another tail with slight
adjustments"): the rule with its STOP conditions and beat speed, refused with "nucleus full" if the boxes don't fit.
**Simpler parts, the same routes (built 2026-10-28; author: "simplified implementations that don't simplify the game").**
Conditions offer above / below / more / less only (between = above AND below, outside = below OR above; old conditions
still show theirs). One **Spine** with a Material row (protein / glass), one **Pad** with "Sticks to" (its own kind =
kin / anything = mucus), one **Feeler** (Range at its least: touch only; wider: feels within N µm, the old proximity
sensor). Hidden from the Build panel (old designs still edit): the stiff flap (a lesson; a tip later) and the nutrient
sensor (no use until step 1). Build panel: 11 buttons. Later the same day (author): pigments named **Chl a / Phycobilins** (was Sun / Shade; internal
values sun / shade); the Feeler's slider is **Sensitivity**; the **day graph starts tucked away**; the sandbox **starts paused**;
**Flip stays on the spring** (measured: its 208 µm jump curves ~46 µm and 26° to one side, flipped to the other).
**Agreed next (author, 2026-10-28):** (1) the **buoyancy chamber** (BUILT, see below; the plan as agreed): replaces the sap vacuole
and removes gas vesicles entirely; three states, light (~1000 kg/m³) / neutral (1025, seawater: no effect, no cost) /
heavy (~1070, to sink on purpose); holding light or heavy costs energy in proportion to size and distance from
neutral (~5% of income for a mid-size one held light all day); ~20 s to change; rule card FLOAT when… / SINK when…,
neither = neutral, SINK wins if both (Claude's default, author did not object); a bigger chamber pushes harder but
takes room and costs more. Energy stores become their own part, Energy store (Starch / Oil), the material deciding the
trade-off. (2) **Resting** (author: "cool, like slowing the metabolism"): a built-in action a rule triggers (REST
when…), lower upkeep, no swimming or repair while resting. Later: one stated cost rule (everything costs by size and
material); dragging organelles by finger. **The author's "species test"** (designs/species_test.json, not committed):
Claude was asked to make it survive the night, then told to stop (author: "don't finish any species, don't get into
complicated rabbit holes without telling me"). Found: income ~1,400 vs upkeep ~5,400 pJ/s; a STOP "starch below 30%"
blocked the dawn climb; oars below outdragged spines above, so it flipped sinking; and a sandbox bug (fixed: a range
from 0.03 held on in total darkness). **Lesson for Claude: tell the author before long searches; never brute-force.**
**The buoyancy chamber (built 2026-10-28).** Material 'chamber' (sim/materials.js; PARAMS.chamber), a part under Inside
the cell, round or a rod. Three states, pumped at 10 kg/m³ per s: **light 900** (made playable: the cytoplasm is 1060,
so at 1000 a chamber had to be two-thirds of the cell to lift it; at 900 a quarter does), **neutral 1025** (seawater:
no lift, no cost), **heavy 1100**. Holding it away from neutral costs PARAMS.chamber.hold 0.004 pJ/s per µm³ per kg/m³
(a chamber r 6.5 in a r 10 cell: 575 pJ/s light, 345 heavy). Its rule is stored like a part's: joint: { type:
'chamber', controls } on the inclusion; the card reads FLOAT when… (GO groups) / SINK if… (STOP: sinking wins); neither:
neutral. Starving, it drifts neutral. Measured (r 6.5 in r 10, no other parts): neutral sinks 5.9 µm/s, light rises
1.1 µm/s, heavy sinks 10 µm/s. Drawn pale when light, deep blue when heavy; the nucleus box shows FLOAT / SINK /
neutral; the budget "holding the buoyancy chamber"; the day graph's "float" line is the chamber's state. **Energy
store** is its own part (Starch / Oil). **Removed:** gas vesicles entirely (material, crush, wear and rebuild, drawing,
log entry, PARAMS.gas, two checks) and the sap vacuole and its slider (check 14 now tests the chamber). **The starting
nucleus now sits at the bottom** (at the centre it blocked anything bigger than a quarter of the room). Checks: 41.
**Resting (built 2026-10-28; author: "like slowing the metabolism").** The nucleus carries the REST rule (joint: { type:
'rest', controls } on the nucleus; its card: REST when… / DON'T REST if…; slots like any rule). While it holds, upkeep
and plastid income run at PARAMS.metab.rest (0.4), flagella stop, plastids aren't repaired; stores and buoyancy chambers
keep working. Resting in the dark saves energy, in light throws income away. Shown: the body outline turns calm blue,
"began resting / woke" in the trouble log, a budget line, RESTING / awake in the nucleus box. Check 28q. Checks: 42.
**For later (author, 2026-10-28): dragging organelles by finger, and shaping them.** The cell held fixed on screen while
editing; drag an organelle to move it; pinch it to make it slimmer, longer, curved or rounder. Everything that can be moulded is mouldable, the nucleus
included (author, 2026-10-28); only parts whose shape is their function stay fixed (the statolith). Curved shapes are new to the physics
(room, overlap, weight): plan with the author first.
**Arranging and moulding (built 2026-10-28; author: "they should snuggle together"; curved shapes left for later).**
✋ Arrange inside the cell (under On this body): the tank pauses, the camera holds the cell still and large. One finger
drags an organelle anywhere inside, or a part round the rim (rebuilt where the finger points, keeping its rule, colour
and name). Two fingers (or the mouse wheel; Shift+wheel turns) stretch an organelle into a longer, slimmer rod or back
to round, **its volume kept** (so energy, weight and cost don't change). **Snuggling** (author chose: the still one
gives way): an organelle pushed into another makes it flatten across the push (volume kept, down to 45% of its round
radius), then slide aside, kept inside the wall; the statolith is rigid, so the moved one flattens or backs off
instead. Every move is tried by building the cell (refused: the organelle outlined red stays where it last fitted); on
letting go the design updates (one Undo step). The nucleus is mouldable: its slots now count its volume
(brain.js nucleusSlots), not its radius. Each moved organelle's Edit sliders (build: where, depth, size, length, turn)
follow it. Code: the arrange block in sandbox/main.js (capsule geometry, squash, stretch, snuggle, syncBuild).
**Squishy arranging (built 2026-10-29; author: "it should feel more moldable… like a softy squishy thing").** Replaces
the first arrange. Tap an organelle to select it (outlined); drag it; **drag its edge** to reshape it (past an end: that
end follows; at its side: thicker or thinner; its area changes); **pinch anywhere** (two fingers, even outside the
cell) to resize the selected one (author: "pinch is size only"); **drag the cell's wall** to resize the cell (organelles
keep their size and get squeezed). Pushed into the wall, an organelle **moulds along it**: a band bent round a round
wall (or flat along a rod body's side), thinner the harder it is pushed (half the push), its volume kept, at most 0.9π
of the way round. **Bent organelles** are new physics (sim/build.js arcPoints, polyGap; part.bend = 1/radius of
curvature): a chain of 8 short straight pieces along an arc; room, overlap, inside-the-wall all on the chain; weight
and light at its centroid; volume as a rod of the same length. **Soft packing** (relax): overlapping organelles are
nudged apart a little each pass, ones that stay squeezed slowly flatten (volume kept), ones out of the wall ease back
in or mould to it; the one in hand and the statolith don't move. **Overlaps are allowed while arranging** (buildCell
opts.loose, drawn red); a change that fits becomes the design when the finger lifts (one Undo step); ✓ Done with
something red shows a warning and 🫧 **Squish to fit** (soft packing until nothing overlaps). Tested in the page: a
plastid pushed into the top wall becomes a band; after an oversized pinch, Squish packs it into a bean along the wall.
Then (author, 2026-10-29): a **Zoom** slider (1-4× the arrange view) and a **Turn** slider for the selected organelle (a
statolith: the way it reads); **deselect only by tapping the selected organelle again**; **calmer neighbours**
(resizing or reshaping one leaves the others where they are, red if they overlap; moving one only nudges them, no
squashing; squashing and moulding happen in Squish to fit and when the cell is made smaller).
Then (author, 2026-10-29): **neighbours locked** (while arranging nothing else moves; only Squish to fit packs; a
smaller cell moulds what no longer fits to the wall); **selecting centres the view** on the organelle; **sliders over
the tank**: Y vertical on the left, Zoom vertical on the right (1-4×), X horizontal along the bottom (the Zoom slider
left the panel; Turn stays there); the clock box, the tank strip and the day graph hide while arranging; **selection is
a thin cyan contour**, overlaps a thin dashed red one (no overlays); **bent organelles keep their looks** (bandPath: a
band's outline along its points; stores fill from the bottom, the nucleus keeps chromatin and nucleolus).
Then (author, 2026-10-29): with nothing selected two fingers (or the wheel) zoom the view; **deselect only with the
Deselect button** (taps deselected by accident).
**NEXT, agreed (author said go, 2026-10-29): soft blobs (option A).** Why: dragging part of a selected organelle's wall
should make a local bump or dent there; today's shapes (round, rod, band) can't. Plan: every mouldable organelle's
outline becomes ~12 radii round its centre (a smooth closed curve when drawn); volume from the outline's area as a
sphere of the same cross-section (4/3·π·(A/π)^1.5); room, overlap and inside-the-wall checks on the polygon; weight and
light at its centroid; moulding to the wall clamps only the radii that touch it; dragging a spot moves the nearest
radius and its neighbours smoothly; pinch scales all radii; round / rod / band designs convert to outlines on load
(the statolith stays round). **Two stages, check with the author between:** (1) blobs in sim/build.js and the
drawing, old designs converted and looking as now, checks passing; (2) the arranging tools (drag a spot, pinch,
local moulding to the wall and to neighbours in Squish to fit). Started in a fresh chat (this one was long).
**Soft blobs, stage 1 (built 2026-10-29; stage 2 waits for the author).** sim/shape.js: every organelle's shape is a
closed outline (polygon, counter-clockwise, body frame); room, overlap (edges crossing or one inside the other) and
inside-the-wall are tested on it; weight and light at its centroid (round ones and straight rods: at `at`, as before).
A design inclusion either has its own `outline` ([[x, y], ...] round `at`, in its own frame, x along `angle`; nothing
writes it yet: stage 2) or is round / rod / band as before, built as the offset of its middle line (a band's arc now 24
pieces, was 8) with PARAMS.shape.points 48 corners round a round one, on the curve. **Two changes from the plan, to
tell the author:** (1) points round the outline, not ~12 radii from a centre (12 radii can't draw a long thin rod or a
band); (2) **volume is not "a sphere of the same area"** (that doubles a rod: 3 × 20 µm oil, 678 → 1358 µm³, so old
designs would change): round, rod and band keep their exact capsule volume; any other outline is "the rod with its area
and its thickness" (thickness = the widest circle inside it; V = π·t²·ℓ + 4/3·π·t³, ℓ = (A − π·t²)/(2t); blobVolume,
cached), exact for traced rods and bands (check), a bump adds volume, a dent takes some (a first try, the capsule with
the same area and perimeter, made outward bumps *shrink* it). The nucleus's slots come from that volume. Drawing:
every organelle from its outline (a smooth curve through its edges' middles), stores fill along it, the nucleus's
chromatin along its middle line, the arrange contours just outside it; tapping the nucleus tests its outline. Seen in
the page next to the old version: the same pictures. Check 28l2.
**Soft blobs, stage 2 (built 2026-10-29, author: "yes, go").** The arranging tools work on outlines (sandbox/mould.js,
pure geometry; check 28l3). An organelle becomes its own `outline` (points evened out along its edge, 48-120) the first
time a tool reshapes it; untouched ones stay round / rod / band. **Drag a spot of the selected one's edge**: that point
follows the finger, its neighbours less (a Gaussian along the edge, half its size wide), so it bulges or dents; refused
if the edge would cross itself or get thinner than 0.4 µm; past the wall it flattens on it; its volume changes. **Pinch**:
the same shape, bigger or smaller (the statolith: its radius). **Move it into the wall**: the points that touch flatten
along it, the rest bulge from its centroid until its volume is back (within 0.3%); its middle can't go past ~half its
thickness from the wall. **Moved off the wall it keeps its moulded shape** (was: round again; clay rather than
rubber, author agreed 2026-10-29: "clay like is fine"). **A smaller cell** flattens what sticks out against the wall, volume kept.
**Squish to fit**: overlapping ones are pushed apart; then the points of one inside another go onto the other's edge
(and where a corner pokes in between its points, that edge is pushed out), each swelling elsewhere to keep its volume;
out of the wall: eased back in, then flattened against it; at most 1 s. Packing has a real limit: a flattened
organelle needs *more* cross-section for the same volume, so a cell much over ~35% full can stay red. Mirror copies
reflect an outline (and now a band's bend, which they didn't before). The nucleus's chromatin spreads from its widest
inside spot to its outline. Not done: the Edit sliders (Size, Length, Turn in the Build panel) rebuild a moulded one
round from its template; the ghost and nudge for new parts still place round / rod shapes.
**Easier arranging (author, 2026-10-29: "denting and pushing a wall is a bit finicky, undo buttons needed… a button to
deselect, selecting other organelle while one is selected should not work… an autofit option").** Buttons over the
tank, under the top bar: ↶ Undo, ↷ Redo, 🫧 Fit, ✕ Deselect (Deselect left the panel). **While one is selected the
finger works on it alone**: its edge band (16 px out, up to 45% of its thickness in) drags a spot, inside it moves it,
anywhere else nothing (no other selection, no wall, no rim part; Deselect first); a second finger still pinches it.
Drags follow **how far the finger moves**, not where it is (the spot and the wall no longer jump to the fingertip);
hit zones are fingertip size (16 px). Undo while arranging first drops a change not yet kept (red), then steps the
design's history and refreshes the view (the panel's Undo does the same). **Fit** (= Squish to fit, any time,
lit while something is red): organelles right on top of each other now come apart too (pushed by how far they overlap
along the push when their corners can't tell). Known: a cell over ~40% full can stay red with one squeezed below its
volume; Undo brings it back.
**Edge reshaping dropped; one finger pans (author, 2026-10-29: "the edge reshape is not allowing me [to grab]… maybe
scrap it"; the plastid "easily can get a weird shape").** While arranging: nothing selected, one finger slides the view
(the X / Y sliders follow) and a tap (no slide) on an organelle selects it; the wall and rim parts still drag. One
selected: on it (or a fingertip from it) the finger moves it, elsewhere it pans; a second finger pinches its size.
Shapes now change only by pressing into the wall, pinching and Fit. dragSpot stays in mould.js (check 28l3), unused.
Then (author, 2026-10-29): 🗑 **Remove** over the tank while arranging (the selected organelle, cables unplugged, undoable);
conditions offer **between / outside** again (author: "I miss the range option"); the buoyancy chamber's template had
no rule slot (no card): fixed, old designs get one on load. **The chamber was too weak, so light is now 500 kg/m³** (author
agreed, 2026-10-29; was 900): at 900 a r 10 cell with a nucleus, a plastid and a half-full starch store still sank with a
chamber of 9% of its volume (r 4.5, a fifth of the picture); at 500 that one floats. The holding cost per µm³ is
unchanged (PARAMS.chamber.holdLight 0.5 / holdHeavy 0.3 pJ/s per µm³ held fully, in proportion on the way; replaces
hold per kg/m³); rate 25 kg/m³ per s (neutral to light ~21 s). Check 14: the r 6.5 chamber in r 10 rises 23 µm/s (was 1.1).
**Several sensors in one condition (built 2026-10-29; author: "multiple choices instead of doing one at the time", chose
an ANY / ALL toggle).** A condition line has ＋ sensor: more sensors join it (one of the same kind first) and an **ANY of
them / ALL of them** button. Same-kind sensors share the line's value; another kind (an eyespot with a statolith) gets
its own slider in the line, with the same above / below / between / outside. In the design: `also: [{ sensor, min, max
}]` and `all: true` on the condition (sim/build.js resolveControl, sim/sense.js ruleState sets ctl.ok, which the cards'
live green reads); a compare (more / less than) keeps one sensor. Sentences read "any of ● A, ● B below 10% …" (mixed
kinds: "(● A … or ● B …)"); cables run from every sensor; removing a sensor takes it out of the condition (the next one
takes the first place). No extra slots (sensors already take theirs). Check 28r.
**Desktop layout and the new wiring board: mock-up agreed (author, 2026-10-29: "looks great… we are done with the
mockup").** design/desk-mockup.html (also at https://claude.ai/artifact/T9fscqviXLoQw6j3VJBAJ6, private to the author;
a standalone page with pretend readings, not the game). Research behind it: FF XII gambits / Gladiabots (ordered "if → do"
cards), Factorio deciders (Anything / Everything = our ANY / ALL), Pigments / HALion (colour-coded drag to assign, drop
spots light green), a user test where blocks beat node graphs (keep the cards as the core, cables only picture them),
SBGN (arrow = activates, bar = inhibits: our GO / STOP). What it has: three windows (Tank · Cell · Nucleus) with drag
handles between them (smallest widths 220 / 300 / 540 px; dragged well past it a window folds to a strip; double-click:
usual sizes; remembered per browser), a – button to fold each; each window rearranges by its own width (container
queries: part buttons 3-6 a row, a compact nucleus without sensor graphs); the Cell window's sections each with a hue and
a spine (Body teal, Add a part amber with small pictures, On this body coral, Arrange blue); a help line along the
bottom (what the thing under the pointer does); the nucleus board: sensor cards with a day trace, built-ins not wired in
a dimmed tray, one rule card per acting part with a state pill (ON / FLOAT / RESTING), conditions showing their sensors'
traces with the threshold and the band where they hold, lit green while they hold, a "today" strip per card, cards fold
to a sentence (Fold all / Open all), the rules column ~390 px; cables: Pathway (each sensor its own lane, branches at
right angles, arrow or bar) or Cables (synth plugs); Traces on / off; drag a sensor onto a rule or tap then a green spot;
"nucleus full" refused; a day slider; dark and light themes (☀ / ☾). Phone: windows stack, no handles. **Next: build it
into the sandbox** (desktop layout first: done, stage 1 below; **next, stage 2: the wiring board**).
**Phone layout, vertical (built 2026-11-01; author: "the mobile layout should have the tabs organized vertically to
take advantage of the screen aspect ratio of phones"; Claude's recommendation, both):** (1) the tank's tools are a
46 px column down its left edge, beside the canvas (nothing drawn under it): ▶, speed (one button stepping 0.1× → 20×),
↺, ⚡, 📈, ↗, ⓘ, −, +, and **⋯ More** (a pop-out: Step, camera, Gravity, Light, Calm, Day, turn); it hides while
arranging. (2) the panel is four **sections with vertical tabs** down its left edge, one shown at a time: **Body**
(teal), **Add** (amber), **Parts** (coral: Delete all, Arrange, the nucleus, the parts list), **Tank** (blue: cells, Test
a day, saved designs, Claude, Copy / Paste, JSON); Undo / Redo and the message line (#buildErr) are pinned above; the
open tab is remembered; tapping a part in the tank opens Parts, picking or ✎ editing a part opens Add. On a computer the
same sections stack in one column as before (headings in their hues). Code: sandbox/index.html (.sec, #tabs, #barMore),
main.js showSection. The canvas follows its own size (ResizeObserver).
**Desktop layout, stage 1 (built 2026-11-01; the agreed mock-up's windows; the wiring board is stage 2).** Over 1100 px:
a header (TinyGod · the toolbar, moved there by JS · a clock: time, energy, depth), **three windows Tank · Cell ·
Nucleus** with drag handles between them (smallest 220 / 300 / 540 px; dragged ~90 px past it a window folds to a 40 px
strip with its name standing up, tap it to open; – folds too; double-click a handle: usual sizes 420 / 380 / rest;
sizes and folds remembered, localStorage tinygod.windows), and a **help line** along the bottom (the tooltip of what is
under the pointer). The Cell window holds the panel's sections, each with its hue's spine; at 640 px or wider (container
query) they sit in two columns (Body + Add | Parts + Tank). The Nucleus window holds today's wiring view, docked and
always open while the window is (🧬 Open the nucleus or tapping the nucleus unfolds it). 761-1100 px: the layout as
before (panel on the right, the wiring view over the lower tank). The frames are wrappers (#top, #cols, .win, .split,
#help) that are display: contents below 1100 px. Not yet (stage 2): the new wiring board, part buttons with pictures,
the light theme.
**Wiring still unclear (author, 2026-11-01: "doesn't feel intuitive… make it immediate and visually intuitive"; also
"the mockup was much prettier").** Claude's diagnosis: a rule lives in three places (card, nucleus box, cables);
numbers without seeing their effect; programmer's words (GO / STOP / ANY / ALL / slots); sensor and part never meet on
the cell; no picture of the result. **Rules mock-up** to try (design/wiring-mockup.html, also
https://claude.ai/artifact/BQdUxXRNU3cniipnTf32Ex, private, pretend readings): one sentence per moving part ("The tail
beats when ● Eyespot sees more than 5% sun (dim), unless ● Energy is less than 25% (low), at full speed"), every
coloured word tappable, "and / or" a tappable word, "unless" for STOP; an editor with the sensor's named zones (light
scale stretched at the dim end), the reading now, and today's trace at this depth lit where it counts; a **map of when
it runs** per card (time across, depth down, shaded where it runs, the cell's now as a dot); 🔗 Wire: tap a sensor on the
cell, then a part; the focused card's links drawn on the cell; the nucleus as a row of slots. Waiting for the author's
verdict (if it is clear, or if the problem is something else) before building anything in the sandbox.
**One range, inside or outside (author, 2026-11-01: "feels like an improvement, i see the vision… isn't it redundant to have below, above and between"):** a condition is one range with two ends on the sensor's scale and an inside / outside switch; an end dragged to the scale's end makes it one-sided, and the sentence still reads "more than 5% sun" / "less than 25%" / "between 5 and 25% sun (dim)" / "not between…"; tapping a zone name (dark, dim…) takes that zone as the range. Comparing two sensors stays a separate choice; "unless" stays (stop if). Built in the rules mock-up; the game already stores min / max / not, so no simulation change.
**Rules as sentences, stage A (built 2026-11-01; author: "lets do it!").** The rule cards (in the parts list and the Nucleus board) are now the mock-up's sentences: "Runs when ● Eyespot (top) sees more than 15% sun (dim) and …, unless ● Starch is less than 30% (low), at full speed." (chamber: Floats when… / Sinks when…; nucleus: Rests when…). Every coloured word opens an editor under the sentence: the sensor (or several: any / all of them), inside the range / outside it / than another sensor (more / less), the range on the sensor's own scale with named zones (drag its ends, tap a zone's name), the reading now (orange needle), and its day lit where it counts (light: at the cell's depth as it faces now; energy, stores, plastid health, nutrients: the journal's last day). "and" between two conditions is tappable: "or" starts a new group (a slot; refused when the nucleus is full). "+ and…", "+ unless…", the speed words open the beat-speed editor; copy / paste rule kept. Words lit green while they hold, red while an unless stops it; a state pill per card (RUNNING, STOPPED, FLOAT, SINK, RESTING…). **The cable view is gone:** the Nucleus window (phone: the overlay) is now the board: its slots, then every part's card. Code: sandbox/main.js, "rules as sentences" (KINDS: zones, verbs, words) and "the rule card" / "the editor" / "the Nucleus board". **Next, stage B:** the "when it runs" map per card (time × depth) and 🔗 Wire (tap a sensor on the cell, then a part); then the part buttons with small pictures (author: "don't forget").
**Surviving the night: measured, and the budget shown (author, 2026-11-01: "feels like it lacks options. still have trouble surviving the night").** Measured (a still 24 µm cell, 2 days): the options are there, the sizes are the trouble. Plastid 2.7% of the cell: starves; 5-10%: earns its day; the night needs starch ~6% of the cell full, or **resting** (with rest a 5% plastid and a 3.7% store live). Depth hardly matters for a still cell between 100 and 1,500 µm (the stores fill by mid-morning; the rest is wasted); the bottom ~400 µm (≤ ~6% light) kills even a resting cell, so a cell there must climb or float. Size buys nothing (30 and 40 µm cells with the same proportions live exactly as 24 µm ones): step 1 should give size and the surface their reasons. A plastid a third of the cell's width is only ~4% of its volume (cubes), which the game never said. **Built:** a budget line pinned above the panel (#budgetLine): "⚖ At 400 µm a day earns 1.4× its upkeep (2.0× resting at night) · stores carry 78% of a night (196% resting)" (green / yellow / red; judged at the selected cell's depth; an estimate from the design: plastids over a day with bright-light damage at balance, upkeep, full stores and half the pool; swimming not counted; matched the simulation); the Size readout of inside parts adds "· 11% of the cell" and for a store "· ~92% of a night"; new plastids start at 50% thick (~11%), energy stores at 40% (~5%).
**or / and / but not when (author, 2026-11-01: "this or that, this and that, this and not for that").** Every joining word in a rule's sentence is one tap that cycles: between conditions **and → or → but not when → and** ("or" starts a new group, a slot; "but not when B" is B turned inside out, stored as an "and" with not: true, so it works for chambers too); inside a condition of several sensors **or → and → but not when** (the last sensor becomes its own condition, inside out); in an unless list only or / and.
**Claude's second species, Bathyscapha (author's challenge, 2026-11-01: "survives day and full night, but it starts at the bottom"; designs/bathyscapha.json, in From Claude).** No flagella: a rod cell (radius 10, length 34; 20 × 54 µm) with, front to back, a buoyancy chamber 15% of the cell, a plastid 9%, a starch granule 4%, the nucleus; an eyespot at the front (180°). FLOAT when it sees less than 25% sun, SINK when more than 50%, REST when less than 3%. From the floor (any way up: it rights itself, the float in front) it rises in the morning, hovers ~1 mm by day (light ~25%: safe for its plastid), floats up at dusk and rests at the top; 3 days, never starving, pool never below 30%, starch ~54% at dawn. **What designing it taught:** (1) round organelles waste most of a round cell: a chamber and a plastid of ~10% each don't fit beside each other in a round cell of any size (volume fractions are scale-free); a rod cell with them in a row does; (2) the chamber has to carry the full starch store: at 10% the cell sank back to the floor each evening once its starch was full, at 15% it doesn't; (3) resting at night halves the store needed. Its parts have no build record (placed by hand), so Edit can't resize them; Arrange can. The author: "very nice, but at night it stays on the surface exposed to predators" (a cost step 1's grazers should bring).
**Claude's third species, Noctilla (author's challenge, 2026-11-01: "now do a swimmer, no buoyancy chamber allowed"; designs/noctilla.json, in From Claude; built from Build-panel templates, so it edits).** Round, r 10; a 48 µm wave tail at the FRONT set to Pull (a puller); three eyespots (front, left, right, 180° each); two plastids (sides, 3.6% each), an oil store at the front (5%), the nucleus at the back. Tail runs when ALL eyespots see less than 25% sun; rests when ALL see less than 1%. From the floor (any way up): 3 days, never starving, pool ≥ 30%; by day ~950 µm, at dusk it follows the dimming light up to ~300 µm, then rests and sinks to ~1.3 mm by dawn (off the surface at night). **What designing it taught:** (1) a pusher sinks front-down (the tail drags the back up: the shuttlecock again) and on the floor lies front-down, pushing itself into the floor; a puller sinks front-up and climbs off the floor; (2) on the floor the cell lies on its side and one eyespot looks sideways (only the scattered 20%): three eyespots on one condition (ANY / ALL) always have one looking up; (3) **every condition's hysteresis is 0.03 in reading units, so a threshold near 0 ("more than 2%") can't switch on in dim water** (it needs 5%): ranges starting at 0 work, small thresholds don't; worth fixing (a hysteresis relative to the threshold) or showing; (4) the author suggested a statolith (two tails steered by it, like their legged cell) as the other route; the puller made it unnecessary. **Vesperella deleted** (author): the game drops saved designs named Vesperella… on load (the preset went on 2026-10-28).
**Hysteresis fixed (author: "yeah u can fix").** sim/sense.js holds(): the margin at each end of a range is PARAMS.sensor.hysteresis (0.03) but at most hysteresisShare (0.3) of the room beyond that end and of the range's width, so "more than 2% sun" switches at ~2.6%, not 5%. Checks pass; Noctilla and Bathyscapha still never starve.
**Claude's fourth species, Caecella (author's challenge, 2026-11-01: "make a species but u cant use the eyespot"; designs/caecella.json).** Noctilla's puller body without eyespots, oil store 8%. Tail runs while Plastid health is more than 90% (climbs until the light starts to hurt, rides just below it all day); rests while Energy is below 35% AND Oil is more than 85% (the oil emptying through the night is a built clock: rests and sinks for most of the night, wakes ~4:30 and swims up before dawn). From the floor: 0 s starving three ways up, 35 s once facing down. Fragile (clock at 80%: starves). **What it taught:** (1) without light sensing a cell can't tell night from deep water: resting in the dark from ~1.2 mm it never woke (resting earns only 40%, and it kept sinking): **the rest trap**; (2) oil burns at 1/600 of the store a second, slower than a swimming cell spends: a swimmer starved with 3/4 of its oil left (a bigger store burns faster); the budget line doesn't show this limit; (3) energy (≈80% earning, 100% full, 30% losing) and plastid health (too bright) are usable senses.
**Budget warnings (author, 2026-11-01: "add point 4").** Under the budget line, in orange: (1) the stores' supply: what they can give a second (starch 1/150 of a full store a second, oil 1/600) against what a night costs, resting if the design has a rest rule ("at night its stores can give only X pJ/s, less than it spends even resting"), or, with flagella, swimming ("swimming at night it spends Y, more than its stores can give"); (2) with a rest rule, the rest trap: "below ~1650 µm its plastids earn less than its upkeep even at noon: resting there, its energy can't rise to wake it" (plastids work while resting, at 40%, as does upkeep: it wakes by earning only where noon income beats upkeep). Oil's slow burn is kept as a trade-off (dense, light, slow), now shown. Warnings are one short line each, the explanation in their tooltip.
**Claude's fifth species, Saltella (author, 2026-11-01: "make another species, surprise me"; designs/saltella.json).** A
jumper: no tail, no chamber; the spring (an escape with no job yet) used to travel. Round, r 10; two springs at the
back, mirror copies (one alone curves each jump ~26° and turned the cell over in a few hops; the pair cancels); a 60 µm
spine in front; three eyespots; two plastids 4.3% each, starch 5% at the back. Springs fire when ALL eyespots see less
than 15% AND ANY sees more than 1.5%; rests when all see less than 1%. It sinks slowly and hops 200-400 µm up whenever
the light gets too dim, ~10 jumps a day; at dusk it chases the light to the top, then rests and sinks to ~1.6 mm. From
the floor: 3 days never starving (starts from level to front-up); front pointing below level on the floor: stuck,
starves (jumps only slide it). **What it taught:** (1) springs at the back drag like a shuttlecock's feathers and
tipped it front-down even with all the weight behind (starch at −6 µm); the front spine fixed it (Vesperella's lesson
again); (2) on the floor jumps don't turn the cell at all (a one-sided "righting kick" did nothing), so a jumper must
land front-up; (3) the burst organ fires while resting (only flagella stop); (4) a rule with a mirrored pair, three
eyes and rest fills the 8 slots exactly (a righting kick needed 9-10).
**16 brain slots (author, 2026-11-01: "increase the starter brain slots, so creativity is not constrained").** The
nucleus keeps its size (r 4.3 µm, no more room taken); a slot is smaller: PARAMS.brain.slotArea 3.6 µm² (was 7: 8
slots). Check 28p's too-small nucleus is now r 2 (3 slots). Bigger or smaller nuclei by progress stay for later.
**Claude's sixth species, Trochilla (the author's idea, 2026-11-01: "a species surrounded by oars or tails, with a
statolith that it uses to maneuver"; designs/trochilla.json).** Round, r 10; four 40 µm flexible oars in a plus; two
small statoliths at right angles (facing front and left: one alone can't tell left from right); four eyespots on the
diagonals; 11 of 16 slots. **Each oar rows only while it points within ~80° of down** (one statolith condition per oar:
the back oar while "Statolith 0°" reads above 0.6, the front below 0.4, the sides on "Statolith 90°"), so the oars
underneath always push it up: it has no right way up and climbs from the floor lying any way (Saltella can't). Plus
the light: row while no eyespot sees more than 25% and one sees more than 1.5%; rest below 1%. **Surprise: it
cartwheels** (~20°/s): each stroke twists the body, and the job passes oar to oar. Measured: climbs ~9.5 µm/s from any
start angle; zones of ±45° (one oar at a time) climbed half as fast, and longer oars slower (60 µm: 2 µm/s, 80: 1);
stopping at 15% sun it rode too deep (starch never past 65%), at 35% it spent nights near the surface. Its day: rolls up
at dawn, rides 700-900 µm, follows dusk to ~400 µm, rests and sinks to ~1.7 mm. 3 days from the floor at 0/45/90/180/
270°: never starving. Seen in the page: the rule sentence is long (four eyespots named twice): the case for naming a
group of sensors ("any eyespot").
**Sensor groups in words; numbers hidden (author, 2026-11-01).** A condition naming EVERY sensor of one kind on the
cell reads as the group: "every ●●●● eyespot sees less than 25% sun" (all) / "any ●●●● eyespot sees…" (any), the
sensors' colour dots before the word; tapping "every / any" switches it (data-groupq), the group word opens the editor,
where each sensor is still listed. Nouns: eyespot, statolith, feeler, nutrient sensor (GROUP_NOUN; built-in readings are
single). A subset still lists its sensors. Trochilla's oar cards: 6 lines to 3 on a phone. **The numbers box starts
hidden on every screen** (was shown on computers; author: "remove that text box from the tank view"); ⓘ still opens it,
as it holds the trouble log.
**The mock-up's last pieces (built 2026-11-01; author: "better do this now").** (1) **Part buttons with small pictures** (sandbox/main.js PART_ICONS, partIcon), in the colour each part is drawn in the tank, in a grid; four rows: Flagella, On the outside (spine, spring, pad), Inside the cell, Sensors. (2) **The map of when it runs** under every rule card: time across (night darker), depth down, coloured where the rule makes the part act (its colour; a chamber pale FLOAT / deep blue SINK; resting pale blue), the selected cell as a dot; a guess from the rule: light at that hour and depth as each eyespot has faced the light lately (journal.js keeps a ~1 min running mean, j.face; none yet: facing up), energy and stores as at that hour over the last day, the rest as now; redrawn every 4 s and live while a range is dragged (sandbox/main.js mapReader, ruleAt, drawRunMap). (3) **Links on the cell**: the card last tapped or opened has its sensors joined to its part by dashed lines in the sensors' colours (red for unless) on the selected cell (drawRuleLinks); **tapping a sensor on the cell while a condition is open puts it in the condition**. A separate 🔗 Wire mode was not built (Claude: filler now that the sentences do it; the author asked).
**Queue:** the author's priority is that building a cell and wiring it are intuitive (2026-10-28). Then, from the
research notes: challenges with stars (Claude's top pick), share a design as a link, dragging modules into the nucleus. Not wanted now: memory switch, light-change sensor
(both removed or declined). For step 1 and later: division (trigger to discuss), glass wall needing silica, coccolith
plates (Emiliania huxleyi), grazing, peduncle (latch and drain another cell; was offered for now, not picked yet), pads
that sense and attract, progress as upgrades for the next design (no mutations), moving water, seasons, tips while
building. Open: sap and oil (above); cables costing upkeep.

**Working with the author (most important):** plan first and wait for an explicit go; one question at a time;
recommend; plain words; phone-first UI; give tools, not finished builds (except when asked, as with Vesperella);
gameplay balance first, biology gives the shape; commit after each finished step (noreply address).

**Built (the log starts here):** sinking (Stokes, size, density, shape), joints, motors (wave tails, flexible oar, stiff flap), latched
springs, extending parts (ejectisome), a **burst organ** for escapes (~200 µm), pumped sap vacuoles, cells touching,
kin and mucus pads, chains (hidden cap 32), **light from above** fading with depth with a **10-minute day/night**,
sensors (eyespot with cone width; touch and proximity feeling other species or anything incl. walls) and the
**built-in energy level**, **wiring** (each part: conditions, each a reading inside or outside a range, ANDed in groups joined by OR),
**metabolism v0** (energy only: plastids earn by light; upkeep; starch and oil fill and burn automatically and change
buoyancy; starving stops motors). Viewer: one-tap toolbar, Build panel (body shape, parts by category, where / tilt /
inside / size / feels, edit in place, live rewiring), budget panel, phone layout with pinch zoom.
**Building tools** (author asked, 2026-10-23): a **ghost** (the part drawn dashed on the cell while picking and
dragging sliders, red with "won't fit" when it would not build; nothing simulated; tapping the lit part hides it);
**⇅ Flip** while placing (the part mirrored about its own line: it beats or kicks the other way); **⇆ / ⇅ on each
part's row** add a mirror copy across the left-right or top-bottom line (an independent part, still editable; exact
reflection: positions, angles, and every motor's swing and spring's rest negated, sandbox/parts.js `mirrorGroup`;
a mirrored pair of oars swims straight, the check proves a copy swims as the exact mirror image); **↶ Undo / ↷ Redo**
(the last 50 design changes; undoing only wiring rewires the tank without a reset) and **🗑 Delete all** (keeps the
body; undoable, so no confirm). **Length** slider (author asked, 2026-10-24) for the wave tail (16-96 µm, more 8 µm
pieces), flexible oar (10-100 µm, both pieces in proportion), stiff flap (10-100) and burst organ (10-40 µm, more
pieces); the ghost beats like the real part (from the start of its stroke, the calm rhythm), so Flip shows in it.
**The latched spring part was removed** from the Build panel and presets (author, 2026-10-24: "it looks like it has no
utility"; it swung 150° through the body, spun the cell, hopped ~10 µm and stayed bent). The physics (a latched
springy hinge) stays: the no-coasting and one-flick checks use it, and the Release button still frees one in an old
design. The burst organ and ejectisome are the escape parts (Build heading "Escapes").
**More puzzle pieces (author asked, 2026-10-24: "more sensors, more physical apparatuses, more combinations"):**
- **Statolith** (sensor, placed inside like a droplet: takes room, a heavy grain): reads 1 while its direction ("Faces",
  0° = the front) points up, 0 down, 0.5 level or with gravity off; the grain is drawn on the chamber's lower wall.
- **Timer** (replaces the proposed clock; author: a dial "doesn't seem very biological... a bit weak and automatic"):
  counts from the moment its **trigger** (a rule, wired like a part's) comes true: 0 then, 1 after its span (1 s to one
  day), 1 before it ever started; drawn as a granule that glows on starting and fades. Reset by an eyespot at dawn it
  is a circadian clock (real clocks are entrained by dawn; a cell kept too deep loses track of time); by touch, a
  "for a while after" switch. Seasons would need day length to change (step 1, from MONAD).
- **Gas vesicles** (inclusion): very light; **Strength** sets the crush depth, from 900 µm down (just below where new
  cells start) to the floor; stronger lift less (density 150-600 kg/m³, round numbers). Crushed for good (grey dashes).
- **Nutrient layer and sensor**: a fixed nutricline (poor above, rich below the tank's middle; sim/nutrient.js), drawn
  as a faint tan haze, read by a surface sensor. Stands in for step 1's nutrients so night descent has a purpose.
- Osmotic pressure: real (stretch-sensitive channels) but flat in open water; for an estuary water type in step 1.
- **The patch view** ("🎛 Wiring view" under On this body; author chose the modular-synth idea): sensors with live
  readings on the left, each part's rule as boxes (a box = conditions that all hold, AND; several boxes = OR) and
  the parts on the right; cables carry a range label; **tap a sensor, then a box or a part** to patch, tap a label to
  edit (range, is / is not, unplug). Cables, boxes and parts light up live; a part shows ON/OFF (timers: waiting,
  counting, time up). Opens over the panel on a phone and over the lower tank on a computer (the camera keeps the cell
  above it). The compact list under each part stays (sentences, icons, "is / is not", range ends named).

**v0 pass tests (below):** 1, physics honest: **passed** (checks). 2, fun and depth: **for the author to judge**
(candidate ways to hold a depth: eyespot-wired tail, buoyancy, starch sinking at dusk, burst organ, chains;
candidate surprises: a climbing swimmer needs an oil droplet to stay pointed up, and a narrow tank's wall had been
faking it; the flexible oar's stiffness sweet spot; longer ribbons throw disproportionately farther). 3, cheap:
**failed** (~170-520 ms per simulated minute per cell vs < 1 ms); plan for step 1: measure each design's movement
once in full physics and let the ecology reuse it (to decide).

**Claude's species, Vesperella** (author's challenge, 2026-10-24; preset "Vesperella
(Claude's species)", built only from Build-panel parts so it edits): a daily migrator, r 9 µm, wave tail 48 µm at
the back, a wide eyespot (180°) at the front, two plastids (top and bottom), a starch granule behind and strong gas
vesicles in front (on the axis, keeping it upright), a 60 µm protein spine in front. Rule: tail runs when the eyespot
reads 0.05-1 (any light) AND energy 0.2-1. Day: rests just under the surface, starch fills; dusk: tail stops, the
starch carries it down (~600 µm by dawn), burned overnight; first light: climbs back. Steady over 3 days in Node and
seen in the page. **What designing it taught (good candidate surprises for test 2):** (1) **the shuttlecock**: a
cell heavier than water with a long tail behind tips over as it sinks (the tail's drag lifts it), front down, so its
eyespot never sees dawn; a float in front was not enough; a **spine in front balancing the tail's drag** fixed it.
(2) A pusher is stable in whatever direction it swims; only gravity turns it up (gyrotaxis). (3) The energy budget
is tight: plastids ~8% of the body barely pay for a night of starch; a bigger body costs as much more as it earns.
(4) A statolith-driven side tail as a righting reflex overshot and spun the cell (needs damping or a narrower
range). (5) A rule like "eyespot below 0.6" is also true in the dark: the tail ran all night until the rule asked
for some light.

**Built 2026-10-24 (author: "implement all those with the exception of memory, the nucleus brain and step 1"):**
- **Gas vesicles wear out** (half their lift in about a sandbox day) and are **rebuilt automatically from the energy
  pool** while it is above burnBelow (400 pJ per µm³; the budget shows it): a fed cell keeps floating, a starving one
  slowly sinks; worn vesicles are drawn as fewer bubbles. (Not leaking: vesicle walls pass gas freely; real lift is
  lost by collapse and by dilution and turnover.) With metabolism off they neither wear nor cost.
- **One "Vacuole" part with a Content choice** (Starch · Oil · Sap · Gas) and a one-line tip; Strength appears for
  gas. Plastid and statolith stay separate parts. Old designs' separate templates still edit.
- **Stores drawn as containers** filling from the bottom (starch cream, oil yellow); a sap vacuole pale while lighter
  than seawater, deep blue while heavier.
- **Compare is a kind of condition**, not a part (author: "it shouldn't be a sensor but something inherent... closer
  to logic functions"; first built as a placed Compare module, then turned into a condition the same day): a
  condition is either "A **is** in a range" or "A **is more than** B" (by PARAMS.sensor.compareMargin, 0.05, so near
  ties don't flicker; "is not" flips it). In the design: { sensor: A, vs: B }. In the list: an "in range / more than…"
  button and a second sensor menu; in the patch view the second sensor's cable is dashed, the label reads "> 👁 B°".
  Two eyespots on opposite sides and "side tail runs when the right eyespot is more than the left" = turning toward the
  light, built not given.
- **Light changing removed** (built, merged into the eyespot, then removed the same day; author: "it does nothing or
  is kinda redundant"; Claude agreed: dusk and climbing are covered by brightness ranges and the dawn-reset timer, and
  a reading about change was the hardest to understand). Easy to bring back if a build needs it (photoreceptor
  adaptation: the light against a ~10 s running average, relative, Weber-like).
**Build queue:** **the nucleus** (see Notes to carry: the box is the nucleus; every module inside it, cables only
inside; tapping it opens the patch view), after the author tries the sandbox. Not wanted for now: the memory switch
(author: "still not convinced").

**Built 2026-10-24 from Claude's debrief after designing Vesperella** (author: "add day graph, cause of death and all
other suggestions"):
- **Day graph** (📈 Graph, on by default): a strip along the bottom of the tank with the selected cell's last day:
  depth (white, surface at the top), energy (yellow), starch, oil, float (blue), night shaded, serious moments as red
  ticks and the latest one written out. sandbox/journal.js samples every cell once a sim second (two days kept).
- **Trouble log** ("what happened", in the ⓘ panel; nothing dies yet, so it records the moments that explain a fate):
  ran out of energy (motors stopped) and recovered, reached the floor / the surface, tipped over while sinking (front
  down), at dawn its eyespot faced away from the light, gas vesicles crushed (depth), starch / oil used up, dawn, dusk.
- **⏩ Test a day**: runs a copy of the selected cell (its design, place, time of day, energy share) a day ahead in
  slices, and shows the forecast in the graph ("✕ Close forecast" returns to the last day). Caught a real case: a
  Vesperella with a longer tail runs out of energy at 03:23.
- **↗ Forces**: weight minus buoyancy (red down: sinks; blue up: floats, in pN), the way it moves (green, µm/s), and
  which way gravity turns it about its centre (orange arc; the dashed arc is the turn it actually makes).
- **Nights left** on the clock line: pool plus stores against the upkeep of a night (e.g. "80% · 0.6 nights").
- **Rebuilds keep the time and the tank**: an edit no longer resets to dawn; other cells stay as they are, this
  design's copies are rebuilt where they were, and each keeps its energy share, its stores' and floats' fill and its
  journal. (Reset still starts again at dawn.)
- **Organelles nudge into room**: when a vacuole or plastid doesn't fit where asked, the ghost shows the nearest spot
  that does (round the body, then nearer the centre) and Add puts it there; if none, "no free spot big enough".
- **Gradual wiring**: a motor's beat speed can follow a reading (stopped at the low end, full at the high end, in
  proportion between: joint.speed { sensor, min, max }), set under the part; the patch view shows it.
- **Pull** (wave tail): the wave runs from the tip toward the body, so the tail pulls the cell after it (like the
  hairy flagella of some flagellates); measured the exact mirror of pushing (49.2 µm/s).
- **Gas vesicles are rebuilt whenever the pool holds 10%** (was: above the 30% where stores burn, so on a starch night
  they quietly wore out): a fed night keeps the float; a starving cell still loses it. Vesperella still migrates.
- **Saving designs** (💾 Save, in this browser's storage, survives a reload): a list to load a saved design in place of
  the selected cell (the tank goes on), ✕ to delete; saved designs are also in the Add-cell menu, as their own species,
  to test side by side.
- **📤 Send to Claude** (author asked, 2026-10-24): POSTs the design to the sandbox server, which writes
  designs/<name>.json in the project (JSON only, at most 256 KB, a file name from letters and digits only) so Claude can
  read the author's species. Works while the server runs (home Wi-Fi). **When the author says they sent one, look in
  designs/.**
- **📥 From Claude**: GET /designs lists the designs Claude wrote in designs/ (marked "from": "Claude", with a note);
  the button puts them in the author's saved designs (same name replaced). To hand the author a design, write
  designs/<name>.json as { name, from: "Claude", note, design } and tell them to tap the button.
- **The author's legged cell** (designs/my_species_incomplete.json; corrected in my_species_corrected.json, 2026-10-24):
  two flexible oars underneath as legs and a statolith as a righting reflex. Its speed settings could not do it (speed
  only rises with a reading). Working on/off wiring: back leg runs when eyespot 0.1-1 AND statolith 0-0.55, front leg
  when eyespot 0.1-1 AND statolith 0.45-1: rights itself from 30° either way in ~4 s and climbs. Surprises: the BACK
  leg must push when the front tips down (an oar pushes along its length and its beat twists the body); an upward
  eyespot with a 0.5 threshold switched both legs off as soon as the cell tipped.

**Rod-shaped inclusions** (author asked, 2026-10-24: elongated cells waste room with round vacuoles; real chloroplasts
are often bands or plates): a plastid or vacuole (any content) can be a rod with rounded ends, Length its straight part
(0: round), Turn its angle from the body's axis (0: along it). Volume, weight, energy stored, room, overlap (segment to
segment) and fitting inside the wall are the real capsule's; its weight and the light it gets are taken at its centre.
Drawn as rods; stores fill along them; gas clusters spread along; the ghost and the nudge handle them. A statolith stays
round. Measured: in a cell 8 × 56 µm a rod holds 4.8× the biggest round inclusion.

**Store levels and clearer boxes** (author, 2026-10-24: an oar wired to light should stop when starch runs low,
overriding the light; tapping a "when" box seemed to do nothing): the cell's **starch and oil levels** are built-in
readings like the energy level (0 used up, 1 full; offered when the design has such a store; 'starch' / 'oil' in
wiring); putting "starch 0.2-1" in the same box as the light condition is the override (AND). A box tapped on its
own now explains itself (all its cables must hold; a sensor then the box adds one; a sensor then "+ or" adds an OR)
and reads "all of (AND)". The followed camera keeps the cell above the day graph.

**Fixes (author, 2026-10-24):** removing a part unplugs every cable from it (a wired timer or eyespot could not be
removed: the rules left pointing at it broke the rebuild). The sandbox opens with an empty round cell; Vesperella is in
the Add-cell menu and, on a browser's first visit, in its saved designs (to load and edit in place). Bigger flagella
already cost more: upkeep by length (5 pJ/s per µm), the beat itself very little.

**Rule cards, GO / STOP** (author, 2026-10-24: the logic was confusing in both the list and the wiring view): one
card per part, the same under the part in the list and under the wiring view (tap a part, a box or a cable label):
"GO when" groups (all of a group: AND; "OR GO when": another group), "STOP if" (the override: any STOP condition
stops the part whatever the GO groups say; stored as stop: true), each condition a sensor and "above / below /
between / outside" a value (one slider for above / below) or "more / less than" another sensor; lines glow green while
they hold, red while a STOP is stopping. Timers read START when / DON'T START if; burst organs FIRE when / DON'T FIRE
if. BEAT SPEED: always full, or follows a reading, faster as it reads more or less (speed.down). The wiring view draws
the same rule: GO boxes and a red STOP box; tap a sensor then a box. The old "is / is not" and two-handle ranges are
gone from the UI (still read in old designs: not = outside).
**Sun / Shade plastids** (author: simplify colours to "more efficient at depth"): Pigment on the plastid: Sun
(chlorophyll, as before) or Shade (phycobilins: half its top output at 1/5 of the light, a lower top, 2.5× upkeep;
drawn pink-red). Shade earns more below ~1 mm (measured 1800 µm down: 5042 vs 3371 pJ/s), less near the top (7724 vs
11114). No coloured light (a rabbit hole).

**Left in the sandbox (none blocks v0):**
- Wiring stores to the energy level (decided optional).
- Planned, not done: tips while building; more materials (chalk, mucus); a memory switch (author not convinced).
- Ideas from the debrief not built: a "fit it" drag of organelles by finger inside the cell (the nudge stands in).
- **Moving water is for v1** (author, 2026-10-23): the tank is still. The physics decision says "the big water moves
  everything"; a Water switch (shear, gentle eddies) would break chains and pads, make spines sea anchors and gather
  bottom-heavy swimmers into thin layers (gyrotaxis). The one basic left out of v0 on purpose.
- Done since: beating parts are drawn calmly (about 2.5 strokes a second; the physics unchanged; a Calm toggle). The
  body is drawn at its position averaged over the last beat (2026-10-24): it really bounces ~10 µm per stroke 20 times a
  second and frames caught it anywhere (jitter); now it glides at its net speed, as at 0.1x (author: "I like the
  fluidity at 0.1x"); the camera and ghost follow the drawn body. Calm off or slow motion shows the true bounce.
- Flexible oars push mostly along their own length (like a tail): a mirrored pair pointing left and right cancels and
  sinks; pointing down and out (240°/300°) it climbs ~28 µm/s (measured 2026-10-24).

**Next after v0: step 1, the ecology** (roadmap below): growth, death, division, a real water column with light
and nutrients, grazing, the optimiser. Open there: how designs move into MONAD's not-to-scale water; the speed plan;
the types of water; what a match is; how the optimiser searches.

---

## The idea (the author's)

- **The lab:** a species is built like Lego: swimming, buoyancy, storage, armour, chains, pigments, stealing
  chloroplasts (*Dinophysis*), mixotrophy.
- **What matters most:** players design their own **parts**, not presets, and find uses nobody planned, like the
  builds in *Zelda: Tears of the Kingdom*. New **materials** unlock over time.
- **The feel:** Tamagotchi longevity, Spore creativity, evolution. **Later:** multiplayer, species from around the
  world in one shared ocean.
- **The core problem (from living with MONAD):** watching gets stale without ownership. The player owns their
  species and parts, their choices visibly decide its fate, and **the game shows why** ("your plates made it sink
  below the light at night", never just "Population: 0").

## Principles

- **Systemic, not scripted.** A few physical building blocks whose function comes out of the simulation. No
  predefined abilities, no behaviour rules where physics can do the job (e.g. **no chain rule**: chains come from
  pads, meetings and the water pulling them apart).
- **Gameplay balance first; biology gives the shape** (author, 2026-10-23: "more important to be balanced for
  gameplay... not go into scientific rabbit holes"). Biology decides what costs what and what trades against what;
  the numbers are round and tuned for play (by playing, later by the optimiser), not researched to precision. Flag
  proposals that drift into rabbit holes.
- **No free lunch.** Every part costs something. Forms balance only when each wins in one kind of water and pays
  in another (MONAD's lesson: every strictly-better form took over until it got a cost).
- **Costs are honest in kind, and shown** (decided, author 2026-10-23; numbers tuned for play, see above). In real cells running parts is nearly free: a cell
  ~20 µm across catches ~200 pW by photosynthesis (~500-700 pg C growing ~1/day), the wave tail spends 0.26 pW
  (~0.1%; flagellar motion is well under 1% of a flagellate's budget, e.g. Raven & Richardson 1984) and a burst
  less than a tenth of a second of income. So parts cost what real ones cost: **materials to build** (nitrogen for
  protein, later silica for glass), **upkeep**, **room**, **weight and drag**, and later **grazing risk**; not their
  running. The sandbox shows each part's share of the budget ("tail: 0.1% of income; its upkeep: 4%") so players
  learn where the cost really is.
- **Time (decided, author 2026-10-23):** in the sandbox a day lasts ~10 minutes at 1x. Every energy flow
  (photosynthesis, upkeep, motors, pumps, store filling and burning) is sped up by the same factor (~144x), so each
  part's share of the budget stays honest; only motion stays in real seconds (made playable).
- **Scale:** the sandbox is almost at real scale (µm, seconds, pW). MONAD's water is not; how designs move into it
  is for later (author, 2026-10-23).
- **What matters is how parts interact** (author, 2026-10-23): with each other (an eyespot wired to a tail, a
  droplet that turns the cell its eyespot looks through, spines that slow a swimmer) and with the environment (light,
  depth, other species, the water's drag). The depth of the game is in these interactions, not in any single part.
- **Start simple, then scale.** Few blocks, few materials, cheap code. Add only what a test or the author asks for.
- **Mechanics first, visuals later.** The sandbox uses plain shapes; a visual identity (probably from MONAD's
  pixel style) comes after the prototype passes.

---

## Physics at plankton scale (decided, 2026-10-21)

Real low-Reynolds-number physics, made playable: keep the laws, scale time and speeds freely so things are
watchable, and show what is invisible.

- **No coasting.** Velocity follows force (overdamped); a cell stops the instant it stops pushing. A spring-burst
  moves it only a short way.
- **Back-and-forth goes nowhere** (Purcell's scallop theorem). A stiff part that opens and closes along the same
  path returns to its start, **however fast or slow each half is** (only the shape sequence counts, not the
  speed). Moving needs a stroke whose shape differs on the way back: a springy part that lags behind the beat
  (Purcell's flexible oar: the lag turns a flap into a small travelling wave, even with an even beat), or several
  joints beating out of step (a wave).
- **Size and shape decide sinking.** Sinking speed grows with size² and density excess (Stokes); spines, chains
  and flat or long shapes slow it. Buoyancy control costs energy.
- **Everything costs energy.**
- **Honest limit of 2D:** the world is a side view, so a rotating helical flagellum (corkscrew) cannot exist.
  Whip-like waves and flexing strokes can.

### How the physics is computed (approach C, author-approved)

A cell is a small 2D body of rigid pieces joined by hinges, placed and angled by the player. Movement uses
**resistive force theory** (the standard shortcut for flagella and cilia): each piece feels drag proportional to
its own velocity, about **twice as strong broadside as end-on** for a thin piece, less different for a thick one.
Each tick, for each connected group (a cell, or a chain of cells linked by pads):

- forces: gravity minus buoyancy at each piece's centre (so mass placement makes torques), motor and spring
  torques at joints, pad springs, soft contact between pieces and with walls;
- solve the balance "all forces and torques add up to zero" for the velocities (unknowns: the group's slide and
  turn, plus one angle per joint); a small linear system, solved with `+ − × ÷` only;
- step positions; substeps if springs are stiff.

The scallop theorem, the flexible oar, sinking by shape and self-righting all **fall out of this**; none is
written as a rule. Known simplification: pieces don't shield each other's drag, so a chain of swimmers is no
faster than one. A cheap shielding correction can be added if chains feel wrong (real *Alexandrium* chains swim
faster than single cells).

---

## The lab: blocks × materials

**Blocks** are shapes and functions; **materials** (unlockable) set density, stiffness, cost and one special
property. The lab grows by adding materials, not new rules.

**Total freedom of placement** (author, 2026-10-23): any number of any block, anywhere: several flagella, springs
or spines on the body, parts on parts, at any point and angle. The design format already allows it; the editor
must too. Costs, not limits, keep designs in check.

**Room inside a cell is a real limit** (author, 2026-10-23): inclusions (droplets, vacuoles) can sit anywhere inside
the body but may not overlap, and together fill at most 90% of it. Space pushes the player to choose carefully.

**Parts need not be always active** (author, 2026-10-23): a flagellum can rest, a spring can wait cocked. The
physics already supports it (a motor can be off and holds its angle; a hinge can start latched until released).
**What switches a part on or off is open, for a future discussion with the author**: sensors (the Sensor block
below) are one proposal, not decided. Until then the sandbox switches parts by hand (Release button).
**First switch built (author asked, 2026-10-23):** a light sensor (eyespot) that motors and latched springs can be
wired to: a motor runs only while it is lit (or only while dark), a latched spring is released the first time it
holds. A stopped motor freezes mid-beat and resumes from there (each motor keeps its own clock). Wiring takes a
**range** of the reading (0-1): e.g. a tail that runs while the light is below 0.8 climbs until the cell has
enough light, then hovers there (the author's idea: stop once near the surface and catching enough light).
**Several conditions per part** (author, 2026-10-23): a part's wiring is a list of conditions (a sensor or the
energy level, and a range), and it runs (or fires) only while **all** of them hold, e.g. a tail that runs while energy
is above 0.3 AND the eyespot reads 0.1-0.8 AND a proximity sensor says no wall is near.
**OR and NOT** (built 2026-10-23, author's go-ahead): a condition can hold while its reading is **outside** its range
(the "inside / outside" button; the bar lights the outside), and "＋ or instead…" starts a new group: the part goes
when every condition of **any one group** holds, e.g. (energy above 0.5 AND eyespot dark) OR touch. In the design: a
condition's `not: true`, and `or: true` on the condition that starts a group (ignored on the first). Hysteresis is
unchanged (NOT flips a condition's held state).
**Touch and proximity sensors** (author asked, 2026-10-23) feel another species by default, or, set to feel
**anything**, any other cell and the tank's walls, floor and surface (a flagellum can be shut off before a wall). By
default they feel another species, not kin: touch on its spot,
proximity rising as a stranger comes within range (a spring wired to touch is an escape trigger). Clock, depth and
tilt switches are still open.

**Navigating at night, without light** (author's question, 2026-10-23; to check with the author, the biologist).
Real cells combine:
1. **Gravity (gravitaxis)**, day and night: *passive* (a bottom-heavy or asymmetric cell turns upright by itself,
   part of how *Chlamydomonas* orients; already in the sandbox, e.g. an oil droplet at the front) or *active* (e.g.
   *Euglena* senses the cytoplasm pressing on mechanosensitive channels). Going up or down is then a matter of
   reversing the response.
2. **An internal clock**: in dinoflagellates such as *Lingulodinium polyedra* migration is clock-driven, starting
   down before dusk and up before dawn even in constant conditions. The clock says *when*, gravity *which way*.
3. **Their own hunger**: in migrators such as *Heterosigma*, nitrogen-starved cells descend at night toward the
   nutrients, replete ones stay up: the cell reads its own state, not the outside gradient.
4. **Chemical gradients (chemotaxis)**: real but weak at water-column scale (gradients over metres are too gentle
   for one cell); more for finding patches than for setting depth.
5. Weaker or uncertain: moonlight, temperature, perhaps pressure (better known in zooplankton).
For the game, as sensor parts wired like the eyespot: a **clock** (needs a day/night cycle), a **hunger sensor**
(reads the cell's own stores; needs step 1's ecology) and a **chemical sensor** (reads local nutrient; needs step
1's nutrient field).
**No abstract gravity sensor** (author, 2026-10-23: "gravity seems more like magic... the light sensor is more
charming"). **Principle: prefer sensors the player can see working** (an eyespot lighting up) over parts that just
"know" something. Night descent can emerge instead: a cell heavier than water with its tail wired to its eyespot
stops swimming in the dark and sinks by its own weight toward the nutrients, and climbs back at dawn (its droplet
keeping it pointed up). If gravity sensing is ever needed, make it visible and physical: a dense grain loose in a
chamber that rolls to the lower wall (statolith-like; e.g. the mineral grains of the ciliate *Loxodes*).

**Reserves and vacuoles change (open design, author 2026-10-23).** In the sandbox an oil droplet is a fixed float;
in real cells stores fill and empty: oil (light, compact, slow; builds up when light is plenty and nutrients short,
burned in long hunger), starch or chrysolaminarin (heavy, quick; filled by day, burned at night), the sap vacuole
(nitrate stock by luxury uptake; ion swaps for buoyancy cost energy), gas vesicles (built slowly, crushed too deep).
Rules to give them: stores fill from a budget (an energy pool with photosynthesis income and the spending already
tracked; nitrate from the water), buoyancy as a side effect of what is stored (daily migration out of eating, like
*Trichodesmium*'s carbohydrate ballast), speed vs density (starch fast but heavy and bulky, oil compact and light but
slow), shared room (reserves take space from plastids and vacuole), reserves buy time (survive dark or poor water),
division splits them. This is the bridge into step 1 (plastids, light as food, growth, starving, dividing).
**Decided (author, 2026-10-23): automatic, wiring optional.** Stores fill with surplus and are burned when short, on
their own (the player chooses which stores and how big); a player who wants to can wire a store to the cell's
**energy level** to set when it fills or burns.

**Metabolism v0 (built 2026-10-23; sim/metab.js, sim/light.js).** Energy only (nitrogen and silica later), in pJ,
round numbers tuned for play (PARAMS.metab). A **plastid** (an inclusion) earns by the light where it is,
saturating; upkeep is paid for the body (by volume), segments (by length) and plastids and stores (by size); motors'
and pumps' real power counts too, sped up like every flow (a sandbox day is 600 s, flows x144). The cytoplasm holds
a small **pool** (about a minute of upkeep). **Stores, automatic:** above 80% of the pool, surplus goes into starch
(quick, heavy) then oil (slow, light, denser energy); below 30%, starch then oil are burned. A store's weight follows
its fill, so a cell full of starch sinks faster at dusk (measured 2.4x). **Starving** (empty pool) stops motors and
pumps. Measured: a cell 16 µm across with one plastid and a starch granule lives day and night 100 µm down and starves
1.5 mm down. **The energy level is built into every cell**
(author, 2026-10-23: hunger is not a part you place): any flagellum or spring can be wired to it like a sensor
(e.g. a tail that rests below half energy). Not yet: wiring stores to it (decided optional), death, growth and division (step 1).

**Escape jumps: the burst organ (decided, author 2026-10-23).** The author's target: a ~20 µm spring should throw
the cell **at least 200 µm**, a high burst of energy that feels rewarding. A single push can't (at low Reynolds
number one push moves the cell by an amount set by the shape change, not the force: a released spring hops ~5 µm,
a 30 µm ejectisome ~6 µm, a 200 µm one ~71 µm), and momentum would break the physics. Chosen (option B over keeping
short jumps or adding momentum for jumps only): a **burst organ**, a ~20 µm coiled tail that waits charged and,
fired (by hand or by a sensor such as touch), beats extremely fast for a moment (like *Mesodinium*'s escape), then
stops dead and recharges (3 s). Default 500 Hz for 0.8 s: ~210 µm. **500 Hz is ~5x faster than any real flagellum
(made playable)**; the stroke physics is real. A burst costs as much energy as ~50 s of ordinary swimming.
**Eyespot cone width** (author, 2026-10-23): chosen per eyespot, 20-180°. Narrow sees only when pointed almost
straight at the light (precise), wide falls off gently (vague). Planned trade-off for when costs exist: a narrow
cone needs a bigger pigment shield and catches less light.

| Block | What it is | What the physics does with it |
|---|---|---|
| **Body** | the cell: round or elongated, any size | holds most of the mass; everything attaches to it |
| **Segment** | a stiff piece with length and thickness: spine, flagellum piece, plate | direction-dependent drag: steers, slows sinking, gives a stroke something to push on |
| **Joint** | hinge between pieces: free, or springy (stiffness, rest angle) | flexing; a springy joint is what makes a single beating part swim |
| **Motor** | drives one joint on a rhythm: beat rate, swing, stroke/recovery speed ratio | the only source of push; its energy cost is the power it delivers (force × speed) |
| **Inclusion** | something held inside the cell, with a volume and a fill level | changes density, so the cell rises or sinks with no push; off-centre, it turns the cell |
| **Pad** | adhesive patch on a piece | whatever touches it sticks through a spring that **snaps** if pulled too hard |
| **Sensor** | reads light (per colour), depth, tilt (gravity direction) or a day clock | turns a motor or an inclusion up or down (threshold or proportional, can invert) |

**A light-direction sensor** (author, 2026-10-23): a part that tells the cell **which way the light comes from**,
not just how bright it is, like the eyespot (stigma) of *Chlamydomonas* and many dinoflagellates, a pigment
shield beside a photoreceptor that the cell's own rotation sweeps across the light. Swimming toward or away from
light (phototaxis) would then come out of a built part, not a rule. Like all sensors, how it switches parts is
open (see above).

**Pads and chains:** a **kin-binding** pad (interlocking setae, surface recognition) is strong and sticks only to
the same species; a **mucus** pad is weak and sticks to anything (strangers, marine snow, a passing swimmer:
hitch-hiking). Chains form when kin meet (or, after v0, at division); where the pads sit decides the colony's
shape (straight, ring, star). **Hidden backstop: at most 32 cells per chain** (it only blocks a new link; real
chains should stay far below it).

**Materials:**

| Material | Density | Special | Real basis | In v0 |
|---|---|---|---|---|
| Protein / cellulose | ~neutral | flexible, cheap | thecal plates, flagella | yes |
| Glass | heavy | stiff; needs silica (later) | diatom frustules, setae | yes |
| Sap (ion vacuole) | **pumpable** light ↔ heavy | stores nutrient (later) | centric diatoms, *Noctiluca* | yes |
| Oil | light | energy store (later) | lipid droplets, copepod oil sacs | yes |
| Chalk | heavy | grazing shield | coccoliths | later |
| Mucus | ~neutral | sticky, swells | *Phaeocystis*, *Thalassiosira* threads | later |
| Sugar | heavy | energy store burned at night (daily ride up and down) | *Trichodesmium* | later |
| Gas | very light | crushes below a depth (one-way) | cyanobacterial gas vesicles | later |

**Storage doubles as ballast** (after v0): an oil-storing cell gets lighter as it fills, a sugar-storing cell
heavier by day and lighter at night, so vertical migration can come out of metabolism with no sensor.

### Later blocks (designed, not in v0)

- **Plastid, with pigments as materials** (v1). Light has colour: red goes in the first metres, the deep is blue,
  coastal water is green, and a bloom eats its own colour out of the water below. Chl *a* alone (blue + red,
  cheap); + fucoxanthin / peridinin (blue-green); + phycoerythrin (green; costly nitrogen-rich protein that
  doubles as an N store); + phycocyanin (orange-red). Real coexistence mechanism: species share water by eating
  different colours (Stomp et al. 2004). **Chromatic acclimation is built, not given:** a colour sensor wired to
  a plastid shifts its pigment mix slowly, at a cost. A species looks the colour of the light it doesn't eat.
- **Peduncle** (v2): a pad that pierces. On contact it latches and **drains** (energy, nutrients: mixotrophy,
  *Dinophysis*'s myzocytosis), **steals plastids** (kleptoplasty: they keep working, then fade, 1/e in ~240 s as in
  MONAD, and bring the prey's pigments with them) or **damages** (toxins, *Polykrikos*-like nematocysts).
  Physics does the rest: latching ties you to the prey (a strong swimmer drags its attacker; tug of war), long
  spines keep a peduncle from the body, glass resists piercing, a chain hides its middle cells.

---

## Step 0: the physics sandbox (current)

A plain visual sandbox in the browser to build a cell from blocks, press play and watch it; the same simulation
runs headless in Node for tests (and later the optimiser).

### v0 scope
- **Blocks:** Body, Segment, Joint (hinge, motor, extend), Inclusion, Pad, Sensor. **Materials:** protein, glass,
  sap, oil, starch, plastid.
- **Water: still.** A tall tank with gravity, walls and floor. A simple **shear or eddy flow** comes later as a
  switch.
- **Light from above** (author asked for it, 2026-10-23, to wire an eyespot). It **fades with depth over the tank**
  (to 5% at the floor): the 2 mm tank's light is a water column squeezed, made playable, so sensors can tell how
  close to the surface they are. A switch turns it off; a day/night cycle (10 minutes) dims it. Coloured light
  (blue, green, red bands for pigments) is for later.
- **Metabolism v0** (see above): energy only; nothing dies, grows or divides yet.
- **Sandbox view:** plain shapes; trails; numbers (speed, depth, light, energy budget) behind an info button, a line
  on the tank with time, energy and stores; pause, step, speeds 0.1-20x; several cells (copies are kin, presets are
  other species); tweezers (drag to move, wheel or Q/E or buttons to turn); presets in the Add-cell menu; the design
  as JSON under Advanced.

### v0 passes if
1. **The physics is honest** (automatic, in Node):
   - a stiff flap beating the same way out and back nets ~zero distance (scallop theorem), whatever its
     stroke/recovery speed ratio;
   - the same flap on a springy joint moves (flexible oar);
   - sinking speed grows with size² and density excess; long spines and flat shapes slow it;
   - a cell that stops pushing stops at once; a spring-burst moves it only a short way;
   - a bottom-heavy cell turns upright by itself;
   - the same design and seed give the same path, bit for bit.
2. **It is fun and has depth** (the author, playing):
   - a first swimmer can be built in a few minutes without reading instructions;
   - "reach the top from the bottom" or "hold mid-depth" can be solved in **at least 3 clearly different ways**
     (swimming, buoyancy, a sensor trick, a chain);
   - **at least one build surprises the author**: it works or fails for a reason not expected but recognised as
     real.
3. **It is cheap:** one design living 1 simulated minute costs well under 1 ms headless (a target to measure,
   so the optimiser can later score thousands of designs over many seeds).

### Tech
- **Plain JavaScript ES modules, HTML and Canvas 2D; no framework, no build step** for now (TypeScript or
  WebAssembly for the hot loop later only if needed). Served by a one-command local server. Node 24.
- **Layout:**
  ```
  sim/        pure simulation, no DOM: params, rng, dmath, materials, build (design -> cell), physics (overdamped
              solver, motors, bursts, pumps), interact (contact, pads, chains), sense (sensors, wiring), light (sun,
              depth), metab (energy, stores), world (step order), presets
  sandbox/    index.html, main.js (viewer, Build panel, wiring editor), parts.js (part templates, categories)
  tools/      check.mjs (physics-law checks), serve.mjs (local / Wi-Fi server)
  ```
- **Deterministic, as in MONAD:** all randomness through one seeded PRNG (mulberry32, state in the open); fixed
  timestep decoupled from rendering; maths limited to `+ − × ÷`, `sqrt`, and MONAD's custom `dexp` and `dsin`
  (copy them; never `Math.exp/sin/cos/pow` in `sim/`). Same seed, same world, on any engine.
- **All tunable numbers in one `PARAMS` object** (`sim/params.js`). No magic numbers scattered through the code.
- `sim/` never touches the DOM, so the browser and Node run the identical code.
- **Run:** `node tools/serve.mjs` then open http://localhost:5180/sandbox/ (`?preset=Wave%20tail` opens a preset).
  `node tools/serve.mjs --lan` also serves phones on the same Wi-Fi (prints the address; Windows asks once to allow
  Node through the firewall). The server shares only sandbox/ and sim/.
  `node tools/check.mjs` runs the physics-law checks (~2 min). Port 8080 is taken on the author's machine.
- **Integration:** midpoint method, dt 1 ms. Simple Euler leaked a drift proportional to dt into strokes that should
  go nowhere (measured, 2026-10-23); keep a second-order method.
- **Speed (measured 2026-10-23):** ~3 ms per simulated second for a 5-piece cell, ~9 ms for a 6-piece motorised
  tail: fine for watching, ~100x too slow for scoring designs over many seeds by brute force. Likely plan for
  step 1: measure each design's swimming, sinking and turning once in full physics, and let the ecology use those
  numbers (to discuss with the author).
- Copy from MONAD; never share code with it (MONAD stays one finished file).

---

## Roadmap

0. **Physics sandbox** (above). ← now, nearly done
1. **Headless prototype of the lab:** plastids and coloured light, growth, death and division, costs, 3–4 types
   of water, an optimiser (an evolutionary search over designs). Passes if it finds **different winners in
   different water**, **no single design wins in all of them**, and **at least one part combination does
   something nobody planned.** Still to decide with the author: the types of water, what a match is (how many
   species, how long, how dominance is scored), how the optimiser searches.
2. **Design doc:** what one play session is, how materials unlock, how dominance is scored.
3. **The lab on the phone.**
4. **Your own ocean as a pet** (MONAD's catch-up: the world lives on while the app is closed).
5. **Matches against other players' designs:** a server runs the same deterministic simulation.

### Notes to carry into step 1
- **Test balance with an optimiser,** not judgement: players find dominant strategies within days. A match is
  chaotic, so **score every design over many seeds**.
- **Cause-of-death log per lineage** from the first ecological prototype (MONAD's notebook ledger is the seed).
- **Score dominance over time,** not the literal last cell; grazing that hits whoever is winning, and
  kill-the-winner viruses, keep monopolies hard (MONAD needed silicate, host-specific viruses, immigration,
  self-shading, temperature, seasons and more before no group held >= 90% of the water).
- **Neighbours:** *Thrive* (open source, microbe stage with a part editor) and *Spore*'s cell stage. What is new
  here: real plankton physiology, real low-Reynolds physics, designs competing in one deterministic ocean.
- **Parked idea:** viruses that track genotypes; lineages with more mutation and diversity resist them (Red
  Queen), a real trade-off if players choose a mutation rate.
- **Parked idea (author, 2026-10-24): a "brain box" for modules.** An empty rectangle where the player drops sensor and
  logic modules (and fits them in by hand, like a puzzle), so its size limits how many the cell can carry and how much
  wiring it can do. The box grows with points or longevity: a bigger box is a more intelligent, more advanced cell.
  Open: whether it scales with cell size (sensors and logic need little room; plastids and vacuoles need a lot);
  the clash with placing organelles inside the cell by hand. **Decided (author, 2026-10-24): the box is the
  nucleus**, an organelle placed and sized inside the cell like the others, so a bigger "brain" takes room from
  plastids and vacuoles (an honest cost; dinoflagellates do carry huge nuclei); the modules and all the wiring fit
  inside it, and the player keeps the freedom to size and place everything in the cell. Progress unlocks how big a
  nucleus may get. How it works (author, 2026-10-24): every sensor placed on the cell (an eyespot on the surface, a
  statolith in its chamber) also has its **module inside the nucleus**, like its part of the brain; logic and timers
  are modules there too. **Cables run only between modules inside the nucleus** and are never drawn on the cell.
  **Tapping the nucleus opens the patch view**: the nucleus opened up, its size the board's edge.
  **Queued to build** (author, 2026-10-24: not yet, after trying the current sandbox).
- **Stores and vacuoles show their level (for later, author 2026-10-24):** a reserve drawn like a container filling
  with liquid (e.g. a starch granule filling with a coloured liquid by day and visibly emptying as it is burned; colours
  to decide), instead of today's shrinking disc in a faint outline. The same for buoyancy: a sap vacuole showing how
  light or heavy it is now, gas vesicles intact or crushed (already drawn).
- **Pads that sense and attract (for later, author 2026-10-24):** a pad tells the cell whether it is stuck, so the
  wiring can use it: a cell whose two pads are both used is in the middle of a chain and may not need all its tails
  (only the ends steer or push), and so on; sticking to another species' pad can trigger something too (a pad
  reading: free / stuck to kin / stuck to a stranger). Also some **attraction** so pads find each other and connect
  (a short-range pull), not only when cells happen to touch. Fits the "no chain rule" principle: chains still come
  from pads and meetings, the wiring just reads them.
- **Division (for notes, author 2026-10-24; step 1):** a cell divides when it reaches a certain energy store, size or
  other parameter (which, and whether the player chooses or wires the trigger like a part's rule, to discuss).
  Division splits stores (already noted under reserves), and chains can form at division.
- **Progress across generations (decided, author 2026-10-24): the safer form.** No mutations that stray from the
  player's design ("can be frustrating"). A species that survives long earns upgrades the player can use when
  designing its next version (e.g. a bigger nucleus, new module types), so generations feel improved while the design
  stays the player's; matches and the optimiser score a design as designed. Open: how many cables a module takes;
  Claude's suggestion (not decided): no hard cap, each cable costs a little upkeep (regulation is proteins), and the
  nucleus limits how many modules fit.
- **Research: what other sandbox games teach (Claude, 2026-10-28; the author: "all valid, save them in notes"; priority
  now is that building a cell and wiring it are intuitive, then the brain box).** From Claude's knowledge, no fresh search:
  1. **Challenges with stars** (Bad Piggies, Poly Bridge, Cell Lab, Zachtronics): short goals, several ways to win
     (reach it; without part X; under a budget). E.g. hold 400-700 µm for a day; 3 days without gas; floor to light by
     noon; only 2 parts. Turns v0 test 2 into play. Claude's top pick for after the brain box.
  2. **Compare on graphs** (Opus Magnum histograms): upkeep, nights survived, parts used; own designs first, others later.
  3. **Logic takes room** (Stormworks microcontrollers, Carnage Heart chips, Minecraft redstone): the brain box idea, proven.
  4. **Few parts, free combination, energy as the limit** (Zelda TotK); its Autobuild suggests saving a sub-assembly
     (e.g. a pair of legs with their wiring) as a module to reuse.
  5. **Honest failure teaches; planning readouts; unlocks by doing** (Kerbal: delta-v readout, science tree): finish
     challenges to unlock materials.
  6. **Life cycle as a design** (Cell Lab, the closest app): genome modes set cell type, when to split, what each
     daughter becomes, and whether daughters stay stuck (adhesin) so shapes emerge. Model for step 1's division and
     chains at division.
  7. **Stories from simulation** (Dwarf Fortress, RimWorld): grow the trouble log into a lineage's life story.
  8. **Live signals and stepping back** (Factorio wires, Zachtronics stepping): add rewind/scrub of the last minute.
  9. **Layers by density** (Oxygen Not Included): stratification from physics in step 1's water.
  10. **Share as a link** (Algodoo, Poly Bridge replays, Opus Magnum GIFs): a design URL on the website.
  Avoid: parts as stat bonuses (Spore cell stage, partly Thrive); brains the player doesn't control (Bibites,
  Creatures; mutations already declined); open-ended with no goals (Algodoo, Spore creature creator).
- **The niche radar** (MONAD's species page, eight traits scored 0–4) is a natural way to compare designs.
- **Tips while building** (author, 2026-10-23): when a player places a part or picks a material, a short true tip
  says what it does physically ("gas is much lighter than water: it floats the cell, but crushes below a certain
  depth"; "a stiff flap that beats back and forth goes nowhere: try a springy joint"), so the player is never
  completely in the dark. Like MONAD's curiosity facts: sourced, plain, never contradicting the model; they hint at
  the physics without giving away the builds.
- Whether TinyGod keeps MONAD's generative music is open.

## The engine to copy from: MONAD

`C:\CLAUDE PROJECTS\MONAD` (https://github.com/vitorhugo1992/monad), finished 2026-10-23. Its `CLAUDE.md` holds
every rule and its measured effect. Useful here: the deterministic core (mulberry32, `dexp`, `dsin`, fixed ticks,
exact save and restore, verified bit-identical desktop vs Android); the water (light with self-shading, nutrients,
silicate, upwelling, temperature, mixing and stratification, tides, seasons) for step 1; the forms' trade-offs and
real facts (`facts.json`) as a source of parts and materials; `tools/` (`sim-check.mjs`, `probe.mjs`,
`bench.mjs`) as the model for headless checks; the author's tuning method (parallel one-parameter sweeps against
written targets).

---

## Working with the author

- **Plan first, then wait for an explicit go-ahead** before building anything. Present choices with a
  recommendation.
- Ask **one question at a time** when several decisions are open.
- Explain plainly; avoid jargon or define it.
- **Give tools, not finished solutions:** the author wants to mount builds themselves ("give me the tools, and I'll
  try to do it"). Offer a build to try, don't build it for them.
- **UI:** one or two taps, buttons visible, no long texts (tooltips instead), phone-first (the author tests on a
  phone over Wi-Fi). Changing a setting should not reset the tank unless the cell's structure changes.
- **Check in the real page before reporting:** drive the sandbox headless (Edge over the DevTools protocol, phone
  size too) and look at screenshots; several bugs were only visible that way. Kill leftover headless browsers.
- **Gameplay balance first, biology gives the shape; no rabbit holes** (see Principles).
- Commit with git after each finished step. Commits use the GitHub noreply address
  (`vitorhugo1992@users.noreply.github.com`); never commit a personal email. GitHub user: `vitorhugo1992`.
