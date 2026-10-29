# TinyGod

Players **design their own phytoplankton species** from parts and try to make it dominate a water column.
The author is a **phytoplankton researcher**: the biology carries weight, and their corrections on biology are
authoritative.

## Start here (handoff, 2026-10-24)

**Where we are:** step 0, the physics sandbox, is built and being played with by the author; step 1 (the ecology) is
next once they are happy with it. Two long chats so far (2026-10-21 to 23: design and sandbox; 2026-10-23 to 24:
building tools, sensors, rules, journal). Every decision is in this file; the sections below the handoff are a
chronological log, newest additions last in each block.

**Run it:** `node tools/serve.mjs --lan` (from this folder), then http://localhost:5180/sandbox/ on the computer;
the phone uses http://192.168.1.69:5180/sandbox/ (home Wi-Fi; the page shows it under its title). Restart the server
after changing tools/serve.mjs. `node tools/check.mjs`: 44 physics checks, all passing (~2 min). Check every change
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
