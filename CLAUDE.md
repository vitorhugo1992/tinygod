# TinyGod

Players **design their own phytoplankton species** from parts and try to make it dominate a water column.
The author is a **phytoplankton researcher**: the biology carries weight, and their corrections on biology are
authoritative.

## Start here (handoff, 2026-10-23)

**Where we are:** step 0, the physics sandbox, is built and close to done. The first design conversation and the
whole sandbox build happened in one long chat (2026-10-21 to 23); this file holds every decision from it.

**Run it:** `node tools/serve.mjs --lan` (from this folder), then http://localhost:5180/sandbox/ on the computer;
the page shows the phone address under its title (home Wi-Fi only; the author pinned it on the phone's home screen).
`node tools/check.mjs`: 38 physics checks, all passing (~2 min).

**Built:** sinking (Stokes, size, density, shape), joints, motors (wave tails, flexible oar, stiff flap), latched
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

**Built 2026-10-24 (author: "implement all those with the exception of memory, the nucleus brain and step 1"):**
- **Gas vesicles wear out** (half their lift in about a sandbox day) and are **rebuilt automatically from the energy
  pool** while it is above burnBelow (400 pJ per µm³; the budget shows it): a fed cell keeps floating, a starving one
  slowly sinks; worn vesicles are drawn as fewer bubbles. (Not leaking: vesicle walls pass gas freely; real lift is
  lost by collapse and by dilution and turnover.) With metabolism off they neither wear nor cost.
- **One "Vacuole" part with a Content choice** (Starch · Oil · Sap · Gas) and a one-line tip; Strength appears for
  gas. Plastid and statolith stay separate parts. Old designs' separate templates still edit.
- **Stores drawn as containers** filling from the bottom (starch cream, oil yellow); a sap vacuole pale while lighter
  than seawater, deep blue while heavier.
- **Compare module** (Sensors, placed inside, a diamond): reads 0.5 + (A − B)/2 of two inputs (any sensor or the
  energy level), chosen in the list under it or patched into its A and B boxes in the patch view. Two eyespots on
  opposite sides + a compare module wired to a side tail = turning toward the light, built not given.
- **Every eyespot reads its light changing** (first built as a separate light-change sensor; merged into the eyespot
  the same day, author: "could be built inside the eyespot"; real eyespot photoreceptors adapt, and sudden changes
  trigger the photophobic response): its photoreceptor gets used to the light over ~10 s and the second reading is
  change relative to that (Weber-like): 0.5 steady, toward 1 brightening (dawn, climbing), toward 0 dimming (dusk,
  sinking); measured noon 0.51, just before sunset 0.27, just after sunrise 1.00. Wired as 'id:change'; in the patch
  view the eyespot is one module with two jacks; on the cell a ring flickers while its light changes (warm brightening,
  cold dimming). Old designs with the separate part still work.
**Build queue:** **the nucleus** (see Notes to carry: the box is the nucleus; every module inside it, cables only
inside; tapping it opens the patch view), after the author tries the sandbox. Not wanted for now: the memory switch
(author: "still not convinced").

**Left in the sandbox (none blocks v0):**
- Wiring stores to the energy level (decided optional).
- Saving designs (now they live until reload, except via the JSON box under Advanced).
- A rebuild (any part change) resets the clock to dawn and clears other cells.
- Planned, not done: force arrows; tips while building; more materials (chalk, mucus); a memory
  switch (kept for later: drifts toward electronics).
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
