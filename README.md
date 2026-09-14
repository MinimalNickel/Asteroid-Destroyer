# Asteroid Destroyer

A mobile-friendly 2D turret-defense game built with plain HTML5 Canvas and JavaScript (no build step, no dependencies).

You're a turret mounted on a spaceship. Your turret is fixed pointing straight up and fires on its own — asteroids, comets, and meteors drift in from above, and you steer the whole ship left and right (by tilting your phone, or dragging on desktop) to line up your shots and dodge what you can't destroy in time. Any of them can be destroyed by a normal shot. There's no health bar: one unblocked hit destroys you. Destroying something earns gold and score, which you can spend between waves.

Hazards and effects:

- **Asteroids** split into smaller, faster pieces when hit. Reaching your ship consumes one shield — with no shields left, it's instant death.
- **Comets** (icy blue) freeze your ship in place for a few seconds if they reach you — you keep firing, but can't move to dodge or line up shots. They don't damage you or touch your shields.
- **Meteors** wipe out all your shields at once if they reach you — unless you've upgraded one to a meteor shield (see the Shield upgrade below), which absorbs a meteor hit by itself instead, so a meteor only fully wipes you out once you have no meteor-resistant shields left. With no shields left, a meteor is instant death. Because they're already this dangerous, meteors are kept spaced out: at least ~4 seconds real time between arrivals, so you never get two back-to-back with no time to recover.
- **Plasma Clouds** (green, from wave 12) don't cost a shield or freeze you — instead they weaken your turret, dropping fire rate and damage to 60% for 5 seconds.
- **Alien Turrets** (purple, from wave 16) sweep left-to-right or right-to-left across the screen while shooting bolts at your ship (asteroid-style: costs a shield, or instant death with none left) — dodge them by steering out of the way, or shoot them down before they land. When a turret exits the screen it pauses offscreen for 15 seconds before sweeping back in from the same side; if it's the only hazard left, it skips the pause and loops continuously so you're never left waiting. You have to shoot the turret itself to destroy it; it takes several hits and doesn't split. Clearing a wave wipes any of its bolts still in flight, so destroying the turret without shooting down its last shot can't carry an unavoidable hit into the wave that follows.
- Rare **big** comet/meteor versions show up a couple of waves after their normal counterpart — bigger, tougher (multiple hits to destroy), slower, but worth more gold and score. When destroyed they split into two normal-sized ones, same as asteroids splitting into smaller pieces.
- Nothing escapes off-screen — anything that drifts past an edge loops back in from the top and comes at you again, so you have to destroy everything eventually (alien turrets manage their own offscreen pause/re-entry instead). Hazards also aim more aggressively at your ship than they used to.
- Hazard HP scales with wave: every enemy's HP goes up by +1 every 5 waves (`baseHP + floor((wave-1)/5)`), so waves 1-5 are base HP, 6-10 are +1, 11-15 are +2, and so on through wave 99. Small Asteroids are capped at 7 HP and Plasma Clouds at 14 HP so neither becomes a tedious bullet sponge late-game — Plasma Clouds especially are meant to be a debuff threat, not a tank.
- At most 8 hazards can be alive on screen at once. Since nothing here despawns by leaving the screen, an uncapped screen would let a brief kill-rate shortfall snowball into a permanent, unrecoverable backlog for the rest of the wave — this ceiling keeps every wave theoretically clearable no matter how far the run has gone. Late-game difficulty instead comes from juggling multiple hazard *types* at once (asteroids + Alien Turret bolts + Plasma Clouds + Meteors together), not from the screen just filling up faster than you can shoot.
- How often hazards spawn ramps up gradually as the run goes on, on top of the HP scaling — though the spawn rate never gets faster than one every 0.52 seconds, so even the latest waves stay theoretically manageable.

Gold is a run-only currency: you earn it by destroying hazards and clearing waves, and it's gone when the run ends, so every run stands on its own.

- Kills pay out by hazard: Large Asteroid 1g, Medium 2g, Small 3g, Comet 3g, Big Comet 5g, Meteor 4g, Big Meteor 6g, Plasma Cloud 3g, Alien Turret 14g.
- Clearing a wave pays a bonus of `5 + 2 × wave` gold, on top of kill gold — so surviving matters, not just shooting.
- Take zero damage for the whole wave and the clear bonus gets a **Perfect Wave** +25% multiplier.

Clear a wave and you can spend your gold on an upgrade before the next one starts:

- **Shield** — blocks one asteroid or alien-turret hit. Max 3, costing 30g / 90g / 200g. Once all 3 are full, the same card switches to a **Meteor Shield** upgrade: 350g / 550g / 850g each, converting one of your current shields so it survives a meteor hit (absorbing just that one) instead of being wiped out along with the rest. Meteor-resistance is tied to the shield itself, not a permanent unlock — lose that shield (to anything, not just a meteor) and the resistance goes with it. The card switches back to "Restore Shield" whenever you're below 3, and always gives back a plain shield; you'll need to upgrade it again if you want it meteor-resistant.
- **Rate of Fire** — about 12% faster per level.
- **Damage** — +1 damage per shot per level.

Rate of Fire and Damage share the same very steep cost curve (both cap at level 15): 50, 80, 130, 210, 340, 550, 890, 1440, 2330, 3770, 6100, 9870, 15800, 25300, 40500 gold for levels 1-15 — each level costs roughly 1.6x the last. It's a deliberately long grind: a thorough player is still chasing the mid-teens levels around wave 70-90, and the last 3 levels (13-15) are more of an aspirational stretch goal than something most runs will finish. You can also skip an upgrade to save your gold for later.

## Playing

Just open `index.html` in a mobile browser (or desktop browser for testing). No install or server required, though serving it over HTTP works too:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 on your phone or browser
```

## Controls

- **Tilt your phone left or right** to move the ship in that direction — the turret fires on its own the whole time, straight up. The tilt angle you're holding the phone at when a run starts is calibrated as "center," so tilt relative to however you're comfortably holding it.
- **Drag left/right on the screen** works too, as a fallback for desktop testing or if tilt permission isn't granted (iOS Safari requires an explicit permission prompt for motion sensors, requested the moment you tap "Tap to Start").
- **On the wave-clear screen**: tap an upgrade card to buy and apply it (if you can afford it), or tap "Next Wave" to skip.

Since steering is tilt-based, the game is meant to be played holding the phone in portrait. Rotating to landscape shows a "rotate back to portrait" overlay and genuinely pauses the game underneath it (nothing spawns, moves, or can hit you) until you rotate back, so an accidental turn mid-run can't cost you. On browsers that support it (mainly Android Chrome), it also tries to actually lock the screen orientation itself the moment you start a run -- best-effort only, since most mobile browsers (Safari included) don't support that at all; the overlay is what actually guarantees it everywhere.

## Gameplay

- No health bar — an unblocked hit ends the run. Shields (up to 3) are your only buffer, some of which can be upgraded to survive a meteor hit instead of being wiped by one.
- Gold starts at 0 each run, earned per kill and per wave clear (see the upgrade section above for exact amounts) and lost when the run ends.
- Each wave spawns a growing number of hazards (capped at 60 per wave so the late game stays playable). Everything must be destroyed to clear it — nothing despawns by leaving the screen.
- New hazard types unlock gradually: waves 1-3 are asteroids only, comets join at wave 4, meteors at wave 8, Plasma Clouds at wave 12, and Alien Turrets at wave 16 — after wave 16 every hazard type can appear. Big comet/meteor variants unlock a couple of waves after their base type.
- The run has a final wave, but the game never tells you in advance — it plays like an endless high-score climb. Clearing it swaps the usual wave-clear screen for a one-off victory screen with your final score, and "Play Again" starts a fresh run.
- Best score and best wave reached are both saved locally on your device.

## Sound

Everything — sound effects and music alike — is synthesized at runtime with the Web Audio API, no audio files or dependencies. The AudioContext is created the moment you tap "Tap to Start" (or tap the mute button first; browsers require a user gesture before audio can play).

- Effects: a quiet laser blip on every shot, a light tick when a bullet hits something without destroying it, an explosion (bigger for bigger hazards) when something's actually destroyed, a blip when an asteroid or Alien Turret bolt costs you a shield, an icy shimmer when a comet freezes you, a sci-fi warble when an Alien Turret fires its bolt, a gassy hiss when a Plasma Cloud hits you, and a fiery crackle/thud when a meteor hits you.
- A quiet, looping retro-arcade bassline plays in the background during gameplay — no audio file, just a small procedurally-scheduled note pattern. It pauses the instant a wave clears (replaced by a short triumphant fanfare) and picks back up, fresh from the top of the loop, the moment you start the next wave. It also stops the instant you're destroyed, replaced by an impact sting and a short descending "defeated" phrase, and doesn't resume until you start a new run.
- A **mute button** below the shield pips toggles all of it (effects and music together) on/off; your preference is saved locally and remembered next time.

## Starfield

The background starfield drifts downward continuously (bigger/closer-looking stars a little faster than small ones) to sell a sense of forward motion, on top of the existing twinkle animation. Purely decorative — it runs on the menu and every other screen, not just mid-run.

## Files

- `index.html` — page structure, HUD, and overlay markup (start, wave-clear upgrades, game over)
- `style.css` — mobile-first styling, safe-area aware HUD, shield pips, and upgrade cards
- `game.js` — game loop, hazards, upgrades, input handling, rendering, synthesized sound effects
