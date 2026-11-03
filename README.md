# TinyGod

**Design your own phytoplankton species and watch it fight for a living in a sunlit water column.**

▶ **Play it in your browser: https://vitorhugo1992.github.io/tinygod/**
(It works on a phone, and keeps working offline once opened.)

---

## What it is

TinyGod is a game about the tiny drifting plants of the sea. You don't pick a ready-made creature: you **build one from parts**,
decide **how it behaves**, then drop it into a tank of water and see whether it lives, grows and spreads, or sinks and starves.

Everything a cell does comes from how you built it. A float in the wrong place tips it over. A tail with no light sensor
swims into the dark. A store too small runs out at 3 in the morning. When it dies, the game tells you why and where.

## Build a cell

- **Body:** round or rod-shaped, any size, a plain wall or armoured plates.
- **Inside:** plastids that turn sunlight into energy, starch and oil stores for the night, a buoyancy chamber to float or
  sink, a nucleus, a toxin sac.
- **Outside:** whip-like tails and oars to swim, spring legs to jump, spines, sticky pads that join cells into chains.
- **Senses:** eyespots for light, a gravity sensor, feelers for touch, nearby cells or moving water, a nutrient sensor.
- **Hunting:** a feeding tube that drains other cells (and steals their plastids), a mouth that swallows smaller ones
  whole, a harpoon fired blind.

Then you give the parts **rules**, written as plain sentences:
*"The tail runs when every eyespot sees less than 25% sun, unless energy is low."*
A small map under each rule shows at which hours and depths it would act.

## The tank

A column of water 2 mm deep, with a day and night that pass in ten minutes:

- **Light** from above, fading with depth: too little and a cell starves, too much and its plastids are damaged.
- **Nutrients** are rich deep down and poor near the surface, so a cell needs both the light above and the food below.
- **Moving water**: slow currents turn through the tank, stronger at night, and now and then the bottom stirs up.
- **Growth, division and death**: well-fed cells grow and split; starving ones die and sink.
- **Other species**: several designs share the tank and compete, hunt each other, or band together.

It is drawn like a living microscope: see-through cells with streaming insides, shafts of sunlight, drifting marine snow.

## Under the hood

The cells really swim, sink and turn by the physics of very small things in water (no momentum: they stop the moment they
stop pushing). Light, energy, nutrients and growth follow simple rules shaped by real phytoplankton biology, with the
numbers tuned for play. The same tank and the same start always play out the same way.

Plain JavaScript and the HTML canvas: no framework, no build step.

```
sim/        the simulation (no browser code; also runs in Node)
sandbox/    the game page: drawing, the build panel, the rules
designs/    species to try (in the game: 📥 From Claude)
design/     mock-ups of ideas
tools/      tests, a local server, contests between species
```

**Run it yourself:** `node tools/serve.mjs`, then open http://localhost:5180/sandbox/
**Test the physics:** `node tools/check.mjs`
**A contest:** `node tools/contest.mjs bathyscapha,noctilla,gula 10` (who has the most cells after 10 days)

## Status

An early, playable sandbox that changes often. Next: balancing the species against each other, then goals and
challenges.

Made by a phytoplankton researcher, built with [Claude](https://claude.com/claude-code).
