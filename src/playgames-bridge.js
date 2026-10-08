// Google Play Games Services integration for the Android (Capacitor) build.
//
// This is the only file in the project that imports the native plugin. It's
// bundled by scripts/build.mjs into a single browser-ready script (no bare
// module specifiers left) so index.html can load it as a plain
// <script type="module">, same as any other asset -- game.js itself is never
// touched beyond two one-line event dispatches at the points a run ends.
//
// On the web/GitHub Pages build there's no native bridge: @capacitor/core
// reports isNativePlatform() === false, the Leaderboard button stays hidden,
// and the plugin's own web fallback makes every PlayGames.* call resolve to
// a safe no-op anyway. Every call here is also wrapped in try/catch so a
// Play Games failure of any kind can never interrupt or crash the game.

import { Capacitor } from '@capacitor/core';
import { PlayGames } from '@idleflowgames/capacitor-play-games';

const LEADERBOARD_ID = 'CgkI5bOK_JodEAIQAQ';

const leaderboardBtn = document.getElementById('leaderboardBtn');

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch (err) {
    return false;
  }
}

// Silent-only: never shows an interactive sign-in prompt on launch. If this
// fails or is unavailable, the game just continues without Play Games.
async function initPlayGames() {
  if (!isNative()) return;
  if (leaderboardBtn) leaderboardBtn.classList.remove('hidden');
  try {
    await PlayGames.initialize();
    await PlayGames.signIn({ silent: true });
  } catch (err) {
    console.warn('[PlayGames] silent init/sign-in failed, continuing without it:', err);
  }
}

// Called only from the Leaderboard button's click handler, i.e. always in
// response to a direct user gesture -- the one place an interactive sign-in
// prompt is allowed.
async function ensureSignedIn() {
  try {
    const { signedIn } = await PlayGames.isSignedIn();
    if (signedIn) return true;
  } catch (err) {
    console.warn('[PlayGames] isSignedIn check failed:', err);
  }
  try {
    const result = await PlayGames.signIn({ silent: false });
    return !!result.signedIn;
  } catch (err) {
    console.warn('[PlayGames] interactive sign-in failed:', err);
    return false;
  }
}

if (leaderboardBtn) {
  leaderboardBtn.addEventListener('click', async () => {
    if (!isNative()) return;
    try {
      const signedIn = await ensureSignedIn();
      if (!signedIn) return;
      await PlayGames.showLeaderboard({ leaderboardId: LEADERBOARD_ID });
    } catch (err) {
      console.warn('[PlayGames] could not open leaderboard:', err);
    }
  });
}

// game.js dispatches this once per run, right after its own game-over/
// victory handling, with the final score for that run. Submission only ever
// happens if the player is already signed in -- this never prompts.
window.addEventListener('asteroiddestroyer:runended', async (e) => {
  if (!isNative()) return;
  try {
    const { signedIn } = await PlayGames.isSignedIn();
    if (!signedIn) return;
    const score = e.detail && typeof e.detail.score === 'number' ? e.detail.score : 0;
    await PlayGames.submitScore({ leaderboardId: LEADERBOARD_ID, score });
  } catch (err) {
    console.warn('[PlayGames] score submission failed:', err);
  }
});

initPlayGames();
