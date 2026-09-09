# Asteroid Destroyer

A mobile-friendly 2D turret-defense game built with plain HTML5 Canvas and JavaScript (no build step, no dependencies).

You're a turret mounted on a spaceship. Asteroids, comets, and meteors drift in from above — hold your finger on the screen to aim your turret and fire continuously; move your finger to steer it. Any of them can be destroyed by a normal shot. There's no health bar: one unblocked hit destroys you. Destroying something earns gold and score, which you can spend between waves.

Hazards and effects:

- **Asteroids** split into smaller, faster pieces when hit. Reaching your ship consumes one shield — with no shields left, it's instant death.
- **Comets** (icy blue) freeze your turret for a few seconds if they reach you. They don't damage you or touch your shields.
- **Meteors** (fiery orange) wipe out *all* your shields at once if they reach you, no matter how many you have — or kill you outright if you have none.
- From wave 4 (comets) and wave 5 (meteors), rare **big** versions show up — bigger, tougher (multiple hits to destroy), slower, but worth more gold and score. When destroyed they split into two normal-sized ones, same as asteroids splitting into smaller pieces.
- Nothing escapes off-screen — anything that drifts past an edge loops back in from the top and comes at you again, so you have to destroy everything eventually. Hazards also aim more aggressively at your ship than they used to.

Gold is a run-only currency: you earn it by destroying hazards and clearing waves, and it's gone when the run ends, so every run stands on its own.

- Kills pay out by hazard: Large Asteroid 3g, Medium 4g, Small 5g, Comet 7g, Meteor 9g, Big Comet 12g, Big Meteor 15g.
- Clearing a wave pays a bonus of `5 + 2 × wave` gold, on top of kill gold — so surviving matters, not just shooting.
- Take zero damage for the whole wave and the clear bonus gets a **Perfect Wave** +25% multiplier.

Clear a wave and you can spend your gold on an upgrade before the next one starts:

- **Shield** — blocks one asteroid hit (a meteor still wipes all your shields at once). Max 3, costing 30g / 80g / 180g.
- **Rate of Fire** — about 12% faster per level. Costs `50 + 30 × level` gold.
- **Damage** — +1 damage per shot per level. Costs `40 + 25 × level` gold.

Rate of Fire and Damage each cap at level 10. You can also skip an upgrade to save your gold for later.

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

- No health bar — an unblocked hit ends the run. Shields (up to 3) are your only buffer.
- Gold starts at 0 each run, earned per kill and per wave clear (see the upgrade section above for exact amounts) and lost when the run ends.
- Each wave spawns a fixed number of hazards (more each wave). Everything must be destroyed to clear it — nothing despawns by leaving the screen.
- Comets appear from wave 2, meteors from wave 3.
- Best score is saved locally on your device.

## Files

- `index.html` — page structure, HUD, and overlay markup (start, wave-clear upgrades, game over)
- `style.css` — mobile-first styling, safe-area aware HUD, shield pips, and upgrade cards
- `game.js` — game loop, hazards, upgrades, input handling, rendering
