# Design a species for TinyGod

You are entering a tournament. Several AIs each design one species of single-celled alga (phytoplankton) from the
same parts, and all the designs are released together into one tank. **The goal: grow your species the most over
10 days** (by biomass, not by number of cells: section 2 says how it is scored). This brief is all you get: you can't run the game, so reason from the numbers below.

Everything you need is here: how the world works, every part with its numbers, the design format, the limits, the
traps earlier designers fell into, and the answer format. Read all of it before you design.

---

## 1. The world

- **The tank** is a 2D side view: 1,600 µm wide and 2,000 µm deep (y is measured up from the floor; depth = 2000 − y).
  Seawater, density 1025 kg/m³. Physics happens at the scale of a cell, where nothing coasts: a cell moves only while
  something pushes it and stops the moment it stops pushing. Every piece feels drag (about twice as much broadside as
  end-on), weight and buoyancy at its own centre, so **where the mass and the drag sit decides which way a cell turns**.
- **A day lasts 600 s**: sunrise at 06:00, sunset at 18:00, so one hour is 25 s. Night is 300 s of total darkness.
  Daylight rises steeply after dawn: the surface light is √(sin) of the sun's height, 0 to 1 at noon.
- **Light fades with depth**: light = daylight × e^(−0.0015 × depth µm). At noon: 100% at the surface, 47% at 500 µm,
  22% at 1,000 µm, 10% at 1,500 µm, 5% at the floor.
- **Too much light hurts**: above 40% of full sun (shallower than ~600 µm at noon) a plastid takes damage and earns
  less, and repairing it costs energy. The surface is a worse place to be than ~500 µm down.
- **Nitrogen is deep**: the water is poor down to ~1,100 µm (6% of the deep's richness at the surface, 13% at 1,000 µm)
  and rich below a nutricline at ~1,400 µm, where the noon light is only ~12%. No depth is good for both. Cells use
  the nitrogen up where they feed (a crowd empties its water), and it is slowly mixed back over about a day.
  **So light is up and food for growth is down.** That tension is the game.
- **Nitrogen is patchy across the tank**: the deep water's richness varies from side to side, from ~0.3× its usual
  value to 2-3× in two rich patches, each about 300 µm wide, that wander slowly across the tank over a few days. A cell
  in a rich patch fills its nitrogen several times faster than one in a poor stretch at the same depth.
- **The water moves**: slow convection loops up to 10 µm/s at night, 2 µm/s by day. A cell that sinks slower than the
  water is carried around; the loops also turn cells. Now and then the water at the floor is stirred and lifts light,
  slow-sinking cells off it.
- **Energy is the currency**, measured in pJ. A cell earns energy from light in its plastids and pays upkeep every
  second. It keeps a small **pool** (60 pJ per µm³ of body, about a minute of upkeep). When the pool is above 80%,
  surplus fills its energy stores; below 30%, the stores are burned. **A cell whose pool stays empty for 60 s in a row
  dies.** While the pool is empty its flagella stop and its chambers can't be held.
- **Growth and division**: surplus energy beyond the stores, plus nitrogen taken in through the cell's surface, fill a
  growth meter. The cell grows in 10% steps, and once it has doubled its volume it divides into two copies of your
  design (newborn size), each with half of everything. Doubling costs 300 pJ per µm³ of the newborn cell, plus
  1 nitrogen unit per µm³. Nitrogen uptake is up to 0.022 units per µm² of surface per second, times n/(n+1) where n is
  the water's richness (1 deep, ~0.06 at the surface). A radius-10 cell fills its nitrogen in ~300 s in the rich deep (faster in a patch, slower outside one),
  or ~5 days at the surface. Uptake runs at 40% while resting and stops while starving. **Smaller cells fill faster**:
  surface over volume. As it grows toward 2×, its body, outside parts and organelles all grow with it (stores hold
  more; a store keeps its energy, so it is emptier once grown). A cell that never divides can grow on to 8×, but beyond
  2× its organelles grow only half as fast as the body.
- **Other species are in the tank** and may hunt you (drain, swallow, harpoon or poison you). Cells of your own species
  are kin: kin pads stick to them and toxins spare them.

### How the tournament runs

One cell of each entry starts **on the floor** (60 µm above it, lying level, its front pointing sideways), at 07:26 on
day 0, spread along the floor. Moving water is on. The tank holds at most 200 cells: at that cap a cell ready to divide
waits (the 200 counts every species together). Your score is your species' **growth**: the total volume of its living cells divided by the volume it started with,
taken every half day over the 10 days (6,000 s) and **averaged over the whole run and over 5 runs** with different
starting spots. So big and small cells score alike for doubling, growing early and holding on counts, and a species that
dies out scores 0 from then on. (Cells, deaths and kills are reported too, but don't count.) Starting state: pool 80% full; each store starts as full as its
`"fill"` (0-1, default 1: full); a buoyancy chamber starts neutral.

Where surplus goes: while the pool is above 80%, surplus fills the stores first (starch before oil, each at its fill
speed); what the stores can't take goes to growth. At division each daughter gets half the pool and half of each
store's energy (in a newborn-sized store, so about as full as the mother's was at 2×).

---

## 2. The body

```json
"body": { "radius": 10, "length": 0 }
```

A capsule: a cylinder `length` µm long with round ends of `radius` µm (length 0 = a sphere). Radius 1-50, length
0-200. Optional armour: `"wall": "plates", "plates": 0.5` (cellulose plates, 0.25-2 µm thick, or up to a tenth of
the radius on cells bigger than radius 20: a feeding tube that latches on must first drill through them, paying 2 × thickness × its piercing price at up to
2,000 pJ/s from its spare energy and draining nothing until through; if it lets go the drilling is lost; a harpoon's
wound is divided by (1 + 2 × thickness); +300 pJ per µm³ of plate per division; heavier: a radius-10 cell with 1 µm
plates sinks 1.6× as fast).

The cytoplasm is 1,060 kg/m³, heavier than seawater: **a plain cell sinks**. A plain radius-10 cell sinks ~7 µm/s, the
whole tank in about one night. Sinking speed grows with radius² and with how much heavier than seawater the cell is
overall. A rod sinks a little slower than a sphere of the same volume and turns so its heavy end is down. For a rough
speed of any cell: its total buoyant weight W (pN) = 9.81e-6 × Σ (density − 1025) × volume µm³ over the cytoplasm (the body's volume not taken by inclusions, at 1060),
each inclusion (a store at its fill) and each outside part (1100), and
speed ≈ W / (6π × 0.00108 × R) µm/s, with R the radius of a sphere of its volume (more drag for rods and parts sticking
out: slower). A cell lying on the floor lifts off as soon as its weight turns negative. Body upkeep: **1 pJ/s per µm³** (radius 10 sphere: 4,189 µm³, so 4,189 pJ/s).

**The body's frame** (all `at` positions use it): x along the body's axis, **+x is the front**; y across it. Angles are
degrees counter-clockwise from +x (90 = the +y side). The cell starts with its front pointing sideways and its +y side
up.

- Surface points of a sphere of radius a: (a cos θ, a sin θ).
- A rod (radius a, length L): the straight sides are y = ±a for |x| ≤ L/2; the ends are (±L/2 + a cos θ, a sin θ).
- Inclusions (organelles) must sit inside the wall: **every point of an inclusion must be within (radius − 0.3) µm of
  the body's axis line** (the segment from x = −L/2 to +L/2 on y = 0). For a round inclusion at (x, y) of radius r in a
  sphere: √(x² + y²) + r ≤ radius − 0.3.

The world is drawn and moves in 2D, but volumes, weights and costs are 3D: every round thing is a sphere, every rod a
capsule, all centred on the drawing's plane. So room and overlap are tested in the plane (two inclusions overlap if
their outlines do). Volumes: a sphere is 4/3·π·r³, a capsule π·r²·L + 4/3·π·r³. **Volume goes with the cube**: an organelle with a third of
the cell's radius is only 3.7% of its volume.

---

## 3. The parts

A design is a body plus a list of parts. Every part has a `type`; give every part a unique `id`. All parts below are
on the body (`"parent": "body"` is the default) unless stated.

### 3.1 Inside the cell (inclusions)

```json
{ "type": "inclusion", "id": "p1", "material": "plastid", "at": [4, 0], "radius": 3 }
```

Round by default. Their upkeep is **on top of** the body's (the body pays for its whole volume). Add `"length": 12` to make it a rod (that much straight part between its round ends), and
`"angle": 90` to turn the rod from the body's axis. Volume and upkeep go by its real volume. Inclusions may not overlap,
must stay inside the wall, and together may fill at most 90% of the body. Inside upkeep: 0.2 pJ/s per µm³ unless stated.

| material | density kg/m³ | what it does |
|---|---|---|
| `nucleus` | 1100 | **The brain** (section 4). **Radius exactly 4.3, round, one per cell.** Upkeep 1 pJ/s per µm³ (~333 pJ/s). Needed for any rule; without one every part runs all the time (and the tournament refuses rules without a nucleus). |
| `plastid` | 1100 | **Makes energy from light**: up to 55 pJ/s per µm³ in full light, half of that at 20% light (saturating). Damaged above 40% light. `"pigment": "shade"` (phycobilins): up to 33, half at 4% light, damaged above 15% light and twice as fast, 2.5× the upkeep. |
| `starch` | 1500 full | **Quick energy store**, 6,000 pJ per µm³. Fills at up to 1/200 of its full capacity a second, burns at up to 1/150. Its weight follows its fill: the part not yet filled counts as cytoplasm (1060), so a full one is heavy ballast and an empty one weighs like cytoplasm. |
| `oil` | 920 full | **Slow energy store**, 9,000 pJ per µm³. Fills at 1/400, burns at 1/300 of its full capacity a second. Its weight follows its fill the same way: full, it is lighter than water and floats the cell a little. |
| `chamber` | 800 / 1025 / 1100 | **Buoyancy chamber**, pumped by its rule (section 4): light 800 (lifts), neutral 1025 (no effect, free), heavy 1100 (sinks). **Slow**: it changes at 2.5 kg/m³ per s, so neutral to light takes ~90 s (about 3.5 hours of the day), light to heavy ~120 s; a cell steered by a chamber overshoots and lags. Holding it light costs 0.25 pJ/s per µm³, heavy 0.3. Starving, it drifts neutral. |
| `statolith` | 1400 | **Gravity sensor** (counts as a sensor). Round only. `"angle": 0` is the direction it reads: 1 while that direction points straight up, 0 straight down, 0.5 level. |
| `toxin` | 1060 | **Toxin sac**, two kinds by its joint: `{"type":"lyse"}` bursts when its rule holds (no rule: never): the cell dies and other species within 30 µm lose up to 5,000 pJ per µm³ of sac and plastid health. `{"type":"leak"}` leaks while its rule holds (no rule: always) a toxin cloud into the water that drifts, spreads and fades (half-life 60 s); other species in it lose energy and plastid health. Leaking costs ~3.7 pJ/s and some nitrogen per µm³ of sac. Kin immune. Each division needs 2 extra nitrogen per µm³ of sac. |

How weight works: every piece's buoyant weight is (its density − 1025) × its volume. Inclusions replace cytoplasm
(1060), so a chamber held light adds a lift of (1060 − 800) = 260 per µm³ against the cytoplasm's 35 per µm³ of excess.
Ignoring everything else, a light chamber of 13.5% of the volume makes a plain cell neutral. But plastids, a nucleus
(1100) and a full starch store (1500) all add weight, and starch's weight changes through the day.

### 3.2 Sensors

Readings run 0 to 1. Every sensor takes one brain slot (section 4). Put sensors on the body's surface (section 2's
formulas: e.g. a rod's front tip is (L/2 + radius, 0)); `at` is where it senses.

```json
{ "type": "sensor", "id": "eye", "kind": "light", "at": [0, 10], "angle": 90, "cone": 180 }
```

| kind | reads |
|---|---|
| `light` (eyespot) | The light where it sits × (0.2 + 0.8 × how squarely it faces up within its cone). `angle`: the way it faces (default: straight out from where it sits). `cone`: 20-180°, narrow is precise, wide is forgiving. Facing down it still reads 20% of the light there. |
| `touch` | 1 while another species' cell is within 2 µm of it. |
| `near` | How close the nearest other-species cell is: 1 touching, 0 at `range` µm (up to 200). `"feels": "anything"` also feels kin, walls, floor and surface. |
| `flow` | How rough the water is there, plus the wakes of cells swimming through the water within `range` µm (20-200), any species: the water alone reads up to ~0.2-0.3 (night loops, a stirred floor), a swimmer passing close up to ~0.8. A still or drifting cell makes no wake. |
| `chem` (nutrient sensor) | The nitrogen in the water there (less where cells used it up). Untouched water by depth (the tank's mean across): 0 µm 0.06 · 500 0.06 · 1,000 0.13 · 1,100 0.18 · 1,200 0.27 · 1,300 0.39 · 1,400 0.53 · 1,500 0.67 · 1,600 0.79 · 1,750 0.91 · floor 0.98; in a rich patch up to 2-3× that, but the reading tops out at 1. A depth gauge for the lower half, and a way to tell a rich patch from a poor one. |

**Built-in readings** need no part; each takes one slot once you use it in a rule. Name them as the sensor:

| name | reads |
|---|---|
| `energy` | how full the pool is (0-1) |
| `starch`, `oil` | how full those stores are (0-1; 0 if none) |
| `health` | plastid health (1 unharmed, lower when bright light has damaged them) |
| `size` | 0 newborn to 1 at 8× its newborn volume (2× = 0.14) |
| `feeding` | 1 while one of its feeding tubes is latched on prey |
| `drained` | 1 while another cell's feeding tube drains it |
| `neighbours` | kin joined to it by pads: 0, 0.25, 0.5, 0.75, 1 (4 or more) |
| `alarm` | a kin cell within 60 µm is being drained: 1 touching, 0 at 60 µm, fades over 3 s |
| `poisoned` | how thick other species' toxin clouds are here (1 at a heavy dose) |
| `tied` | 1 while one of its tethers holds something on its line |
| a pad's id | that pad: 0 free, 0.5 joined to kin, 1 stuck to another species |

### 3.3 Flagella (swimming)

**Wave tail**: a chain of 8 µm pieces, each one a motor beating a little after the one before, which sends a wave down
it. 16-96 µm long (2-12 pieces). The first piece starts on the body's surface; each next piece hangs from the tip of
the one before (`"parent"`, `"at": [4, 0]`, half of 8 µm, so its parent's tip). Phases −0.15 × i **push** (the wave
runs to the tip: the cell goes the other way from the tail); +0.15 × i **pull** (the tail drags the cell after it).
A 48 µm tail moves a cell ~50 µm/s.

```json
{ "type": "segment", "id": "t0", "at": [-10, 0], "angle": 180, "length": 8, "radius": 0.25,
  "joint": { "type": "motor", "rate": 30, "swing": 35, "phase": 0 } },
{ "type": "segment", "id": "t1", "parent": "t0", "at": [4, 0], "angle": 0, "length": 8, "radius": 0.25,
  "joint": { "type": "motor", "rate": 30, "swing": 35, "phase": -0.15 } },
{ "type": "segment", "id": "t2", "parent": "t1", "at": [4, 0], "angle": 0, "length": 8, "radius": 0.25,
  "joint": { "type": "motor", "rate": 30, "swing": 35, "phase": -0.3 } }
```

(A 24 µm pushing tail at the back, pointing backward. **A rule on a tail must be copied onto every one of its
pieces**: each piece's motor reads its own `controls`. The brain counts the copies as one rule.)

**Flexible oar**: a driven blade (3/8 of its length) with a springy rest (5/8), 10-100 µm. It pushes mostly along its
own length, and each stroke also twists the body.

```json
{ "type": "segment", "id": "o0", "at": [0, -10], "angle": 270, "length": 15, "radius": 0.25,
  "joint": { "type": "motor", "rate": 20, "swing": 60, "stroke": 0.25 } },
{ "type": "segment", "id": "o1", "parent": "o0", "at": [7.5, 0], "length": 25, "radius": 0.25,
  "joint": { "type": "hinge", "stiffness": 700 } }
```

Flagella cost upkeep 5 pJ/s per µm of length, plus **beating 10 pJ/s per µm while running** (a 48 µm tail: 240 +
480 pJ/s). A motor with no rule beats all the time. Optional `"speed": { "sensor": "energy", "min": 0.3, "max": 0.8 }`
on each piece's joint makes the beat follow a reading (stopped at min, full at max; `"down": true` reverses).

**Spring** (escape jump): a short coiled tail that, fired, beats at 500 Hz for a moment and throws the cell ~200 µm,
then needs 3 s to recharge. 10-40 µm of 5 µm pieces, radius 0.3; all pieces share one `group`. **It fires only by its
rule** (no rule: never). A jump costs about as much as 50 s of swimming.

```json
{ "type": "segment", "id": "s0", "at": [-10, 0], "angle": 180, "length": 5, "radius": 0.3,
  "joint": { "type": "motor", "rate": 500, "swing": 40, "phase": 0, "burst": { "duration": 0.8, "recharge": 3, "group": "s" } } },
{ "type": "segment", "id": "s1", "parent": "s0", "at": [2.5, 0], "length": 5, "radius": 0.3,
  "joint": { "type": "motor", "rate": 500, "swing": 40, "phase": -0.2, "burst": { "duration": 0.8, "recharge": 3, "group": "s" } } }
```

(Continue to 4 pieces for 20 µm: phases −0.4, −0.6. Put the rule on every piece.)

### 3.4 On the outside

All cost 5 pJ/s per µm of length.

- **Spine**: `{ "type": "segment", "id": "sp", "at": [10, 0], "angle": 0, "length": 40, "radius": 0.5 }` (0-100 µm).
  Rigid: it adds drag where it sits (it slows sinking and turns the cell), keeps attackers' tubes and mouths off the
  body, and catches harpoons. Spines pointing several ways make a cell too wide to swallow (see Mouth); one alone, or
  spines along a rod's length, don't.
- **Harpoon**: a spine with `"joint": { "type": "fire", "controls": [...] }`. When its rule holds, it throws itself
  straight out along its line, **blind**: the first cell within 40 µm past its tip takes it (**kin too**). A body hit is
  stunned 8 s (its flagella, springs, tubes and mouths stop) and loses 400,000 pJ plus 10% of all the energy it holds
  (more than it holds kills it; plates divide the wound by 1 + 2 × their thickness). A spine or flagellum catches it harmlessly. A shot costs 3,000 pJ per µm of spine
  (20 µm: 60,000) from the pool, and the spine takes 150 s to grow back. No rule: never fires.
- **Tether**: a spine with `"joint": { "type": "tether", "controls": [...] }` (its id is needed). Fired like a harpoon
  (blind, straight out, 40 µm past its tip), but the dart stays on a **line**: it sticks to whatever it hits first (a
  body, spine or flagellum; kin too), with **no wound and no stun**. The line is a rope: slack until pulled tight. Two
  more rules, each its own part naming the tether: `{ "type": "rule", "id": "t1-reel", "of": "t1", "joint": {
  "type": "reel", "controls": [...] } }`: GO conditions **reel the line in**, `stop` conditions **let it out** (10 µm/s,
  up to 100 µm; reeling in wins; neither: it holds its length); and `{ "type": "rule", "id": "t1-go", "of": "t1",
  "joint": { "type": "release", "controls": [...] } }`: **lets go** when it holds (no rule: never by choice). It also
  lets go when either cell dies, and the line **snaps** above 40 pN of sustained pull (steady swimming pulls a few pN:
  a swimmer tows what it has tied; a spring jump snaps it). A shot costs 1,000 pJ per µm of spine; after a miss or a
  release the dart winds back for 20 s. Reeling a small cell to a big one mostly pulls the small one.
- **Peduncle** (feeding tube): `{ "type": "segment", "id": "ped", "at": [10, 0], "angle": 0, "length": 20, "radius": 0.6, "joint": { "type": "feed" } }`
  (10-80 µm). Its tip latches on any other species' body it touches. While latched it sucks up to 20,000 pJ/s and 50
  nitrogen/s from the prey and keeps 20%. Each latch costs 2,000 pJ per µm of tube. The link snaps if pulled harder than
  40 pN: a cell that keeps swimming while latched tears it off. Every 30 s latched it steals one of the prey's plastids,
  if one fits inside the thief; a stolen plastid works but fades by half each day. Rule: feeds when (no rule: always).
- **Mouth**: `{ "type": "mouth", "id": "m", "at": [10, 0], "joint": { "type": "engulf" } }`, a point on the surface.
  It swallows another species' cell that touches it (within 2 µm) whole, if that cell's size at the mouth is at most
  half this one's body radius. Size at the mouth: half its narrowest width, the way it would best go in, counting its
  body (a rod goes in end-first: its half-width) and the tips of its spines, harpoons, tethers and feeding tubes
  (flagella fold and don't count) and its volume fits in this cell's free room (body volume minus inclusions). Kin chains count as one, so a
  chain must fit across the predator. Digesting takes 60 s, keeps 20% of the prey's energy and half its nitrogen, and
  it can't swallow again meanwhile. Upkeep 100 pJ/s per mouth. Rule: engulfs when (no rule: always).
- **Pad**: `{ "type": "pad", "id": "pad1", "at": [10, 0], "kind": "kin" }`. A kin pad sticks to a kin cell's kin pad,
  holds 40 pN, and gently pulls free kin pads within 15 µm. At division, a cell with kin pads places its daughter pad to
  pad: **chains form**, and their shape follows where the pads sit. A chain holds up to 8 radius-10 cells' volume
  (smaller cells make longer chains). Joined kin slowly share energy and nitrogen, and each feels 15% (one neighbour)
  or 25% (two) less drag. `"kind": "mucus"` sticks weakly (4 pN) to anything. Rule: holds while (no rule: always). Pad
  ids can be read as sensors.

### 3.5 Division

Optional: a part `{ "type": "rule", "id": "divide", "joint": { "type": "divide", "controls": [...] } }`. A cell that has
doubled divides only while this rule holds (meanwhile its surplus goes to its stores). Without it, it divides as soon
as it has doubled.

---

## 4. Rules (the brain)

Parts with a `joint` take a rule as `"controls"`: a list of conditions.

```json
"controls": [
  { "sensor": "eye", "min": 0, "max": 0.25 },
  { "sensor": "energy", "min": 0.3, "max": 1 },
  { "sensor": "eye2", "min": 0.6, "max": 1, "or": true },
  { "sensor": "starch", "min": 0, "max": 0.1, "stop": true }
]
```

- A condition **holds while its reading is between `min` and `max`** (defaults 0 and 1). `"not": true`: while it is
  outside them.
- Conditions are ANDed in **groups**; `"or": true` starts a new group. The rule holds when every condition of any one
  group holds. Above: (eye ≤ 0.25 AND energy ≥ 0.3) OR eye2 ≥ 0.6.
- `"stop": true` conditions are overrides: if any holds, the rule is off, whatever the groups say.
- **Compare**: `{ "sensor": "a", "vs": "b" }` holds while a reads more than b by at least 0.05 (e.g. turn toward the
  brighter side).
- **Several sensors in one condition** (any kinds, each with its own `min` / `max`): `{ "sensor": "e1", "min": 0, "max": 0.25, "also": [ { "sensor": "e2", "min": 0, "max": 0.25 } ], "all": true }`:
  all of them in range (`"all": false`: any of them).
- A condition switches only a little past its edges (hysteresis ~0.03, smaller near 0 and 1), so it doesn't flicker.
- No conditions at all (or no `controls`): the part's default, given with each part: tails, oars, tubes, mouths, pads
  and leaking sacs always on; springs, harpoons and bursting sacs never.

What a rule does on each part:

| part | joint | GO conditions | `stop` conditions |
|---|---|---|---|
| tail, oar | `motor` | beats while they hold | stops it |
| spring | `motor` + `burst` | fires when they hold (if charged) | blocks firing |
| buoyancy chamber | `{"type":"chamber"}` | **FLOAT** (pumped light) | **SINK** (heavy; sinking wins); neither: neutral |
| nucleus | `{"type":"rest"}` | **REST**: upkeep and plastid income at 40%, flagella stop, plastids not repaired; stores and chambers keep working | don't rest |
| tether's reel rule | `{"type":"reel"}` | **REEL IN** | **LET OUT** (reeling in wins); neither: holds |
| harpoon, tether (fires), tether's release rule, peduncle, mouth, pad, toxin sac, division | as given above | acts | blocks |

**The nucleus's 16 slots.** Every sensor part takes one (including statoliths). Every built-in reading or pad used in
any rule takes one (once, however often used). Every rule takes one slot per group, plus one if it has any `stop`
condition (a tail's copies on its pieces count once). A design needing more than 16 doesn't build.

---

## 5. Budget rules of thumb

Daily-average income of a plastid per µm³ of plastid, over a full day **and night**, after light damage and repair:

| depth µm | 0 | 250 | 500 | 750 | 1,000 | 1,250 | 1,500 | 1,750 | floor |
|---|---|---|---|---|---|---|---|---|---|
| Chl a (default) | 14 | 16 | 16.5 | 15 | 12 | 10 | 8 | 6 | 4.6 |
| shade | 6 | 8 | 9 | 11 | 12 | 12 | 11 | 9 | 8 |

(A plastid's income doesn't depend on which way the cell faces, only on the light at its depth. A cell that moves gets
the average of where it spends its daylight hours.)

Costs to cover, per second, averaged:
- the body: 1 pJ/s per µm³; the nucleus ~333 pJ/s; everything else as listed (chambers held, flagella beating, mouths);
- growth: to double once a day, 300 pJ per µm³ of body over 600 s = **0.5 pJ/s per µm³ of body**.

So at ~500 µm a plastid of ~10% of the body pays for a plain cell and some growth; nearer the floor it would need a
fifth of the body. Income stops at night:
- **a night awake costs ~300 pJ per µm³ of body** (a starch store of ~5% of the body, full at dusk);
- **resting, 40% of that** (~2% starch). The night is 300 s, and the store must also **give it fast enough**: starch
  gives at most 40 pJ/s per µm³ of store, oil 30, at the same rate until it is empty. That rate has to cover what the
  cell spends at night. Resting does not cut a chamber's holding cost.

Stores fill only from surplus (pool above 80%), so they need the afternoon to fill.

---

## 6. Traps earlier designers fell into

These are physics, not fixes. Work out your own answers.

1. **The shuttlecock.** A sinking cell turns until its heavy, low-drag end is down and its draggy end is up. A long
   tail at one end of a heavy cell drags that end up, so a cell with a pushing tail behind sinks front-down and its
   front sensors face the floor. Mass placement and drag placement decide orientation; so does the floor when the cell
   lies on it.
2. **Lying on the floor.** All cells start on the floor in 5% light. An eyespot facing sideways or down sees only 20%
   of that. A cell must get off the floor on day 0 from any likely resting angle, or it starves there. Jumps and pushes
   along the floor don't turn a cell over.
3. **Dark means night, and dark means deep.** A rule like "rest when it is dark" is also true deep down at noon. A
   resting cell earns at 40%, and below ~1,650 µm even a noon's income doesn't beat upkeep, so a cell resting there may
   never earn its way out. Likewise "light below 60%" is true all night.
4. **Plastids too small.** Volume goes with the cube of the radius: see section 2. Count the percentage of the body.
5. **A store too slow or too small.** A big oil store that can't release energy as fast as the cell spends it starves
   the cell with oil left. A store that is full at dusk and then halved by a division may not last the night; **rules
   tuned to full stores break after a division.** Dividing late in the day leaves two cells with half a store each
   for the night.
6. **Small thresholds near zero.** A condition switches a little past its edge: tiny light thresholds like "more than
   1%" behave poorly in dim water.
7. **Swimming while feeding** tears a feeding tube's latch off.
8. **The floor.** Most deaths in earlier contests were cells sinking to the floor at night and starving there by day:
   the floor gets 5% of the light at noon, and a cell built for brighter water can't live on it. The stirred bottom
   sometimes rescues light, slow-sinking cells, never heavy ones. (The floor's water is the richest in nitrogen.)
9. **Encounters.** Drifters mostly move up and down; hunters only meet prey that shares their water, and moving water
   helps that. Defences matter only if someone hunts; growth matters always.

---

## 7. A format skeleton (it does NOT live)

This builds, and starves on the floor by noon of day 0 (its plastid is 2.7% of the cell, and it never leaves the
floor). It is here only to show how the pieces fit together.

```json
{
  "name": "Skeleton",
  "design": {
    "body": { "radius": 10 },
    "parts": [
      { "type": "inclusion", "id": "nucleus", "material": "nucleus", "at": [-5, 0], "radius": 4.3,
        "joint": { "type": "rest", "controls": [ { "sensor": "eye", "min": 0, "max": 0.02 } ] } },
      { "type": "inclusion", "id": "plastid", "material": "plastid", "at": [4, 0], "radius": 3 },
      { "type": "sensor", "id": "eye", "kind": "light", "at": [0, 10], "angle": 90, "cone": 180 }
    ]
  }
}
```

### Why a design is refused

- `inclusion sticks out of the body`: some point of it is past radius − 0.3 from the body's axis line.
- `inclusions overlap: there is no room for both there`.
- `inclusions overfill the body`: more than 90% of its volume.
- `nucleus full: N modules, 16 slots`.
- `a cell has one nucleus`; the nucleus must be round with radius 4.3.
- `no sensor called X`: a rule names a sensor id that doesn't exist (built-ins by their names in section 3.2).
- `unknown parent: X`: a segment hangs from an id that doesn't exist or comes later in the list (list parents first).
- `min must not be above max`.
- rules without a nucleus.

---

## 8. Your answer

Reply with **one JSON object** (any explanation around it is fine; the JSON is what enters):

```json
{ "name": "Your species' name", "note": "a few sentences: its strategy and why it should live", "design": { "body": { }, "parts": [ ] } }
```

Check before you answer: every id unique and every referenced id present; every inclusion inside the wall and not
overlapping (do the geometry); the slot count ≤ 16; the energy budget over a day and over a night; how it gets off the
floor on day 0; which way up it sinks; where it spends the day and the night.
