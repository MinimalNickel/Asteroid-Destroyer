# Asteroid Destroyer

A mobile-friendly 2D turret-defense game built with plain HTML5 Canvas and JavaScript (no build step, no dependencies).

You're a turret mounted on a spaceship. Asteroids, comets, and meteors drift in from above — hold your finger on the screen to aim your turret and fire continuously; move your finger to steer it. Any of them can be destroyed by a normal shot. Destroying something earns score; let something reach your ship and it damages your health bar.

Hazards and effects:

- **Asteroids** split into smaller, faster pieces when hit. Larger ones deal more damage if they reach you.
- **Comets** (icy blue) freeze your turret for a few seconds if they reach you — no aiming or firing until it thaws.
- **Meteors** (fiery orange) don't hit all at once — they burn your ship with damage over time.
- From wave 4 (comets) and wave 5 (meteors), rare **big** versions show up — bigger, tougher (multiple hits to destroy), slower, and hit harder if they reach you, but worth more score. When destroyed they split into two normal-sized ones, same as asteroids splitting into smaller pieces.

Clear a wave and you earn 1 point, which you can spend on an upgrade before the next wave starts:

- **Health Capacity** — +10 max HP, and fully heals you.
- **Rate of Fire** — fire faster.
- **Damage** — +1 damage per shot.

Each upgrade costs more the more you buy it — 1 point the first time, then 2, then 3, then 4, and so on. You can also skip an upgrade to save your points for later.

## Playing

Just open `index.html` in a mobile browser (or desktop browser for testing). No install or server required, though serving it over HTTP works too:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 on your phone or browser
```

## Controls

- **Press and hold** anywhere above the ship: aims the turret at that point and fires continuously while held.
- **Drag while holding**: steer the turret to follow your finger.
- **On the wave-clear screen**: tap an upgrade card to buy and apply it (if you can afford it), or tap "Next Wave" to skip.

## Gameplay

- Health starts at 100; points start at 0.
- Each wave spawns a fixed number of hazards (more each wave). Clear them all to advance.
- Comets appear from wave 2, meteors from wave 3.
- Best score is saved locally on your device.

## Files

- `index.html` — page structure, HUD, and overlay markup (start, wave-clear upgrades, game over)
- `style.css` — mobile-first styling, safe-area aware HUD and upgrade cards
- `game.js` — game loop, hazards, upgrades, input handling, rendering
