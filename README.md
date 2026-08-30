# Asteroid Destroyer

A mobile-friendly 2D turret-defense game built with plain HTML5 Canvas and JavaScript (no build step, no dependencies).

You're a turret mounted on a spaceship. Asteroids drift in from above — tap anywhere on the screen to aim your turret at that point and fire. Destroy asteroids before they reach your ship, or they'll chip away at your health bar. Large asteroids split into smaller, faster pieces when hit.

Watch out for tougher hazards and grab power-ups when they drift by:

- **Comets** (icy blue) freeze your turret for a few seconds if they reach you — no aiming or firing until it thaws.
- **Meteors** (fiery orange) don't hit all at once — they burn your ship with damage over time.
- **Repair kits** restore some health.
- **Rocket power-ups** let you one-shot any asteroid, comet, or meteor for a few seconds.
- **Nukes** (very rare) instantly clear every hazard on screen.

## Playing

Just open `index.html` in a mobile browser (or desktop browser for testing). No install or server required, though serving it over HTTP works too:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 on your phone or browser
```

## Controls

- **Tap** anywhere above the ship: aims the turret at that point and fires.
- **Drag**: keep aiming while your finger moves.

## Gameplay

- Health starts at 100. Large asteroids deal more damage than small ones.
- Score points by destroying asteroids — smaller fragments are worth more.
- Difficulty (spawn rate and asteroid speed) ramps up every ~18 seconds (waves).
- Best score is saved locally on your device.

## Files

- `index.html` — page structure and HUD/overlay markup
- `style.css` — mobile-first styling, safe-area aware HUD
- `game.js` — game loop, entities, input handling, rendering
