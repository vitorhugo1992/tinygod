# TinyGod

Players **design their own phytoplankton species** from parts and try to make it dominate a water column.
The author is a **phytoplankton researcher**: the biology carries weight, and their corrections on biology are
authoritative.

**Status (2026-10-23): building step 0, the physics sandbox** (author's go given). Done: sinking, joints, motors,
the swimming laws, a first viewer with presets. Next: inclusions that change over time, pads, sensors, coloured
light; then the drag-and-drop editor.

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
- **No free lunch.** Every part costs something. Forms balance only when each wins in one kind of water and pays
  in another (MONAD's lesson: every strictly-better form took over until it got a cost).
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

| Block | What it is | What the physics does with it |
|---|---|---|
| **Body** | the cell: round or elongated, any size | holds most of the mass; everything attaches to it |
| **Segment** | a stiff piece with length and thickness: spine, flagellum piece, plate | direction-dependent drag: steers, slows sinking, gives a stroke something to push on |
| **Joint** | hinge between pieces: free, or springy (stiffness, rest angle) | flexing; a springy joint is what makes a single beating part swim |
| **Motor** | drives one joint on a rhythm: beat rate, swing, stroke/recovery speed ratio | the only source of push; its energy cost is the power it delivers (force × speed) |
| **Inclusion** | something held inside the cell, with a volume and a fill level | changes density, so the cell rises or sinks with no push; off-centre, it turns the cell |
| **Pad** | adhesive patch on a piece | whatever touches it sticks through a spring that **snaps** if pulled too hard |
| **Sensor** | reads light (per colour), depth, tilt (gravity direction) or a day clock | turns a motor or an inclusion up or down (threshold or proportional, can invert) |

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
- **Blocks:** Body, Segment, Joint, Motor, Inclusion, Pad, Sensor. **Materials:** protein, glass, sap, oil.
- **Water: still.** A tall tank with gravity, walls, floor, and light in three colour bands (blue, green, red)
  fading with depth at different rates, with a day/night clock. Coloured from the start so sensors read colour
  and v1 never rebuilds the light. A simple **shear or eddy flow** comes later as a switch.
- **Energy is tracked and shown** per part (motor power, pumping, pad upkeep), but nothing dies, grows or divides
  yet. Several copies of a design can be dropped in (to test chains by meeting).
- **Sandbox view:** plain shapes; trails; force arrows; numbers (speed, depth, sinking rate, energy spent);
  pause, step, speed up. Designs save and load as JSON; a few presets (stiff flapper, flexible oar, sinkers with
  and without spines, bottom-heavy swimmer).

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
  sim/        pure simulation, no DOM: rng, dmath, physics, parts, materials, water, params
  sandbox/    index.html, editor, canvas drawing
  tools/      Node: headless runs, physics-law checks, determinism check, speed bench
  ```
- **Deterministic, as in MONAD:** all randomness through one seeded PRNG (mulberry32, state in the open); fixed
  timestep decoupled from rendering; maths limited to `+ − × ÷`, `sqrt`, and MONAD's custom `dexp` and `dsin`
  (copy them; never `Math.exp/sin/cos/pow` in `sim/`). Same seed, same world, on any engine.
- **All tunable numbers in one `PARAMS` object** (`sim/params.js`). No magic numbers scattered through the code.
- `sim/` never touches the DOM, so the browser and Node run the identical code.
- **Run:** `node tools/serve.mjs` then open http://localhost:5180/sandbox/ (`?preset=Wave%20tail` opens a preset).
  `node tools/check.mjs` runs the physics-law checks (~1 min). Port 8080 is taken on the author's machine.
- **Integration:** midpoint method, dt 1 ms. Simple Euler leaked a drift proportional to dt into strokes that should
  go nowhere (measured, 2026-10-23); keep a second-order method.
- **Speed (measured 2026-10-23):** ~2 ms per simulated second for a 5-piece cell, ~7 ms for a 6-piece motorised
  tail: fine for watching, ~100x too slow for scoring designs over many seeds by brute force. Likely plan for
  step 1: measure each design's swimming, sinking and turning once in full physics, and let the ecology use those
  numbers (to discuss with the author).
- Copy from MONAD; never share code with it (MONAD stays one finished file).

---

## Roadmap

0. **Physics sandbox** (above). ← now
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
- Commit with git after each finished step. Commits use the GitHub noreply address
  (`vitorhugo1992@users.noreply.github.com`); never commit a personal email. GitHub user: `vitorhugo1992`.
