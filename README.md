# Asteroid Destroyer

A mobile-friendly 2D lane tower-defense game built with plain HTML5 Canvas and JavaScript (no build step, no dependencies).

Asteroids, comets, and meteors drift down four lanes toward your ship at the bottom. Pick a tower from the tray and tap an empty slot in a lane to build it — towers auto-fire at whatever's in their lane. Destroying hazards earns gold, which you spend on more towers. Let something reach your ship and it damages your health bar.

Towers aren't all equally matched to every hazard:

- **Turret** and **Missile Launcher** only damage plain asteroids (missiles splash-damage everything nearby). They have no effect on comets or meteors.
- **Flame Tower** is the *only* tower that can destroy comets (it also damages asteroids).
- **Ice Tower** is the *only* tower that can destroy meteors (it also damages asteroids).

Hazards and effects:

- **Comets** (icy blue) freeze every tower in their lane for a few seconds if they reach the base — those towers stop firing until it thaws.
- **Meteors** (fiery orange) burn your ship with damage over time instead of a lump hit.
- Power-ups (**repair kit**, **rocket**, and a rare **nuke**) drift down lanes too — shoot one with any tower to activate it. Left alone, they just fall past with no effect.
  - Repair kit restores health.
  - Rocket grants ~8 seconds of one-shot-kill firing across all towers.
  - Nuke instantly clears every hazard on screen.

## Playing

Just open `index.html` in a mobile browser (or desktop browser for testing). No install or server required, though serving it over HTTP works too:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 on your phone or browser
```

## Controls

- **Tap a tower button** in the tray at the bottom to select it.
- **Tap an empty slot** in a lane to build the selected tower there (costs gold).
- Towers fire automatically — there's no manual aiming.

## Gameplay

- Health starts at 100; gold starts at 60.
- Each lane has 3 build slots. Hazards travel straight down their lane toward the base.
- Difficulty (spawn rate and hazard speed) ramps up every ~18 seconds (waves). Comets appear from wave 2, meteors from wave 3.
- Best score is saved locally on your device.

## Files

- `index.html` — page structure, HUD, tower tray, and overlay markup
- `style.css` — mobile-first styling, safe-area aware HUD and tower tray
- `game.js` — game loop, lanes, towers, hazards, power-ups, rendering
