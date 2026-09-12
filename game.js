(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const shieldPips = Array.from(document.querySelectorAll('.shield-pip'));
  const currencyLabelEl = document.getElementById('currencyLabel');
  const scoreLabelEl = document.getElementById('scoreLabel');
  const waveLabelEl = document.getElementById('waveLabel');
  const frozenStatusEl = document.getElementById('frozenStatus');
  const weakenedStatusEl = document.getElementById('weakenedStatus');
  const startScreen = document.getElementById('startScreen');
  const upgradeScreen = document.getElementById('upgradeScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const skipUpgradeBtn = document.getElementById('skipUpgradeBtn');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');
  const bestWaveEl = document.getElementById('bestWave');
  const upgradeGoldEl = document.getElementById('upgradeGold');
  const waveBonusEl = document.getElementById('waveBonus');
  const upgradeMessageEl = document.getElementById('upgradeMessage');
  const upgradeCards = Array.from(document.querySelectorAll('.upgrade-card'));
  const shieldNameEl = document.getElementById('shieldName');
  const shieldDescEl = document.getElementById('shieldDesc');
  const victoryScreen = document.getElementById('victoryScreen');
  const victoryScoreEl = document.getElementById('victoryScore');
  const playAgainBtn = document.getElementById('playAgainBtn');

  const BEST_KEY = 'asteroidDestroyer.best';
  const BEST_WAVE_KEY = 'asteroidDestroyer.bestWave';
  const FINAL_WAVE = 99;

  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let W = 0, H = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- Game state ----
  const STATE = { MENU: 'menu', PLAYING: 'playing', UPGRADE: 'upgrade', OVER: 'over', WON: 'won' };
  let state = STATE.MENU;

  let ship, bullets, hazards, particles, stars, enemyBullets;
  let score = 0, currency = 0, shields = 0, wave = 1;
  let spawnTimer = 0, spawnInterval = 1.6;
  let enemiesToSpawn = 0;
  let screenShake = 0;
  let isFiring = false;
  let tookDamageThisWave = false;
  const MAX_SHIELDS = 3;
  const SHIELD_COSTS = [30, 90, 200];
  // Once all 3 shields are bought, the Shield upgrade card switches over to
  // offering a Meteor Shield upgrade instead: converting one of your existing
  // shields so it survives a meteor hit (absorbing just that one shield)
  // rather than being wiped out along with the rest. Purchased in order, so
  // meteorUpgrades counts up from 0 to MAX_SHIELDS.
  const METEOR_UPGRADE_COSTS = [350, 550, 850];
  let meteorUpgrades = 0;

  // ---- Plasma Cloud (green) -- debuffs the turret instead of costing a shield ----
  const PLASMA_DEBUFF_DURATION = 5;
  const PLASMA_DEBUFF_FACTOR = 0.6; // fire rate & damage drop to 60% while weakened

  // ---- Alien Turret -- sweeps across the screen shooting back, must be
  // destroyed by the player. Exits one edge, pauses offscreen, then re-enters
  // and sweeps again -- unless it's the only hazard left, in which case it
  // loops continuously with no pause so the player is never left waiting.
  const ALIEN_TURRET_HP = 6;
  const ALIEN_TURRET_RADIUS = 30;
  const ALIEN_TURRET_PAUSE_DURATION = 15;
  const ALIEN_BOLT_SPEED = 260;
  const ALIEN_BOLT_RADIUS = 13;

  // ---- Player upgrades ----
  const BASE_FIRE_COOLDOWN = 0.35;
  const MAX_UPGRADE_LEVEL = 15;
  // Cost to buy level (index+1) of Damage or Fire Rate -- shared curve for both.
  // Grows roughly geometrically (~1.6x per level) so a thorough player is
  // still chasing the mid-teens levels around wave 70-90, not maxed by wave 20.
  // The last 3 levels (13-15) push into true-endgame-grind territory -- more
  // of an aspirational stretch goal than something most runs will finish.
  const UPGRADE_COSTS = [50, 80, 130, 210, 340, 550, 890, 1440, 2330, 3770, 6100, 9870, 15800, 25300, 40500];
  let upgrades, fireCooldown, bulletDamage;

  function upgradeCost(stat, level) {
    return UPGRADE_COSTS[level];
  }

  function applyUpgradeEffects() {
    fireCooldown = Math.max(0.05, BASE_FIRE_COOLDOWN * Math.pow(0.88, upgrades.fireRate));
    bulletDamage = 1 + upgrades.damage;
  }

  // While weakened by a Plasma Cloud hit, fire slower and hit softer -- read
  // at fire/collision time rather than baked into fireCooldown/bulletDamage
  // so the penalty clears itself the moment the debuff timer runs out.
  function currentFireCooldown() {
    return ship.debuffTimer > 0 ? fireCooldown / PLASMA_DEBUFF_FACTOR : fireCooldown;
  }

  function currentBulletDamage() {
    return ship.debuffTimer > 0 ? Math.max(1, Math.round(bulletDamage * PLASMA_DEBUFF_FACTOR)) : bulletDamage;
  }

  function waveClearBonus(w) {
    return 5 + w * 2;
  }

  // Grows with wave like before, but caps out so a very late wave doesn't
  // balloon into an unplayable number of hazards to clear.
  function enemiesForWave(w) {
    return Math.min(5 + w * 2, 60);
  }

  // Hard ceiling on how many hazards can be alive on screen at once. Without
  // this, a wave that briefly falls behind never recovers: nothing here
  // despawns by leaving the screen (it wraps around instead), so any kill-rate
  // shortfall just accumulates for the rest of the wave. This caps the
  // backlog itself rather than only the spawn rate feeding it.
  const MAX_CONCURRENT_HAZARDS = 8;

  // +1 HP every 5 waves: waves 1-5 get the base HP, 6-10 get +1, 11-15 +2, etc.
  // Still gets tougher all the way to wave 99, but without pushing nearly
  // every hazard past 40 HP by the end -- that's what turned the late game
  // into an unavoidable backlog regardless of player skill or gear.
  function hpForWave(baseHp, w) {
    return baseHp + Math.floor((w - 1) / 5);
  }

  function makeStars() {
    stars = [];
    const count = 90;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(0.5, 1.8),
        tw: rand(0, Math.PI * 2)
      });
    }
  }

  function resetGame() {
    upgrades = { fireRate: 0, damage: 0 };
    applyUpgradeEffects();
    shields = 0;
    meteorUpgrades = 0;
    ship = {
      x: W / 2,
      y: H - 90,
      radius: 26,
      angle: -Math.PI / 2,
      targetAngle: -Math.PI / 2,
      frozenTimer: 0,
      debuffTimer: 0,
      fireTimer: 0
    };
    bullets = [];
    enemyBullets = [];
    hazards = [];
    particles = [];
    score = 0;
    currency = 0;
    wave = 1;
    spawnTimer = 0;
    spawnInterval = 1.6;
    enemiesToSpawn = enemiesForWave(wave);
    screenShake = 0;
    tookDamageThisWave = false;
    meteorCooldown = 0;
    updateHud();
    updateStatusHud();
    makeStars();
  }

  function updateHud() {
    shieldPips.forEach((el, i) => {
      el.classList.toggle('filled', i < shields);
      el.classList.toggle('resistant', i >= MAX_SHIELDS - meteorUpgrades);
    });
    currencyLabelEl.textContent = 'Gold: ' + currency;
    scoreLabelEl.textContent = 'Score: ' + score;
    waveLabelEl.textContent = 'Wave ' + wave;
  }

  function updateStatusHud() {
    frozenStatusEl.classList.toggle('hidden', ship.frozenTimer <= 0);
    weakenedStatusEl.classList.toggle('hidden', ship.debuffTimer <= 0);
  }

  // ---- Hazard shapes ----
  function makeAsteroidShape(radius) {
    const points = Math.floor(rand(7, 11));
    const shape = [];
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2;
      const r = radius * rand(0.75, 1.15);
      shape.push({ a, r });
    }
    return shape;
  }

  // Tight, aggressive homing toward the ship -- used both on spawn and when a
  // hazard loops back in after leaving the screen.
  function aimedVelocity(sx, sy, speedBase, jitter) {
    const targetX = ship.x + rand(-60, 60);
    const targetY = ship.y;
    const ang = Math.atan2(targetY - sy, targetX - sx) + rand(-jitter, jitter);
    const speed = speedBase * rand(0.92, 1.08);
    return { vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed };
  }

  function asteroidSpeed(tier) {
    return { large: 28, medium: 42, small: 60 }[tier] + wave * 2.2;
  }

  function cometSpeed(big) {
    return (70 + wave * 3) * (big ? 0.75 : 1);
  }

  function meteorSpeed(big) {
    return (50 + wave * 3) * (big ? 0.75 : 1);
  }

  function plasmaCloudSpeed() {
    return 45 + wave * 2;
  }

  function alienFireInterval() {
    return Math.max(0.9, 1.8 - wave * 0.03);
  }

  function alienTurretMoveSpeed() {
    return 70 + wave * 1.5;
  }

  // Small asteroids scale like everything else, but capped so they never
  // become tediously tanky -- they're already dangerous just for being
  // tiny and fast.
  const SMALL_ASTEROID_HP_CAP = 7;

  // Plasma Clouds are meant to be a debuff threat, not a tank -- capped so
  // their HP never becomes the reason one lingers on screen.
  const PLASMA_CLOUD_HP_CAP = 14;

  function spawnAsteroid(size = null, x = null, y = null) {
    const tier = size || 'large';
    const radiusMap = { large: rand(34, 44), medium: rand(20, 28), small: rand(11, 16) };
    const radius = radiusMap[tier];
    let sx = x, sy = y;
    if (sx === null) {
      sx = rand(radius, W - radius);
      sy = -radius - rand(0, 120);
    }
    const v = aimedVelocity(sx, sy, asteroidSpeed(tier), 0.15);
    const baseHp = tier === 'large' ? 3 : tier === 'medium' ? 2 : 1;
    let hp = hpForWave(baseHp, wave);
    if (tier === 'small') hp = Math.min(hp, SMALL_ASTEROID_HP_CAP);
    hazards.push({
      kind: 'asteroid',
      x: sx, y: sy,
      vx: v.vx, vy: v.vy,
      radius,
      tier,
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-1.2, 1.2),
      shape: makeAsteroidShape(radius),
      hp
    });
  }

  function spawnComet(big = false) {
    const radius = big ? rand(34, 42) : rand(20, 27);
    const sx = rand(radius, W - radius);
    const sy = -radius - rand(0, 120);
    const v = aimedVelocity(sx, sy, cometSpeed(big), 0.12);
    hazards.push({
      kind: 'comet',
      big,
      x: sx, y: sy,
      vx: v.vx, vy: v.vy,
      radius,
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-2, 2),
      shape: makeAsteroidShape(radius),
      hp: hpForWave(big ? 5 : 2, wave),
      trailTimer: 0
    });
  }

  function spawnMeteor(big = false) {
    const radius = big ? rand(38, 46) : rand(24, 32);
    const sx = rand(radius, W - radius);
    const sy = -radius - rand(0, 120);
    const v = aimedVelocity(sx, sy, meteorSpeed(big), 0.15);
    hazards.push({
      kind: 'meteor',
      big,
      x: sx, y: sy,
      vx: v.vx, vy: v.vy,
      radius,
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-1.5, 1.5),
      shape: makeAsteroidShape(radius),
      hp: hpForWave(big ? 6 : 2, wave),
      trailTimer: 0
    });
  }

  function spawnPlasmaCloud() {
    const radius = rand(28, 36);
    const sx = rand(radius, W - radius);
    const sy = -radius - rand(0, 120);
    const v = aimedVelocity(sx, sy, plasmaCloudSpeed(), 0.14);
    const puffs = [];
    const puffCount = Math.floor(rand(5, 7));
    for (let i = 0; i < puffCount; i++) {
      const a = (i / puffCount) * Math.PI * 2;
      puffs.push({ ox: Math.cos(a) * radius * 0.55, oy: Math.sin(a) * radius * 0.4, r: rand(radius * 0.4, radius * 0.6) });
    }
    hazards.push({
      kind: 'plasmaCloud',
      x: sx, y: sy,
      vx: v.vx, vy: v.vy,
      radius,
      rot: 0,
      rotSpeed: 0,
      puffs,
      hp: Math.min(hpForWave(3, wave), PLASMA_CLOUD_HP_CAP),
      trailTimer: 0
    });
  }

  function spawnAlienTurret() {
    const radius = ALIEN_TURRET_RADIUS;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const sy = rand(H * 0.12, H * 0.32);
    const sx = dir === 1 ? -radius - 10 : W + radius + 10;
    hazards.push({
      kind: 'alienTurret',
      x: sx, y: sy,
      vx: dir * alienTurretMoveSpeed(), vy: 0,
      radius,
      rot: 0,
      rotSpeed: 0,
      hp: hpForWave(ALIEN_TURRET_HP, wave),
      fireTimer: rand(0.5, 1.4),
      dir,
      phase: 'sweeping',
      pauseTimer: 0
    });
  }

  // Wave-gated spawn pool: which hazards can appear, and how often relative
  // to each other, at a given wave. Asteroids-only for waves 1-2, comets join
  // at wave 3, meteors at wave 5, plasma clouds at wave 8, alien turrets at
  // wave 12 -- after which every hazard type is in the mix. Meteor weights
  // are kept modest since one meteor already wipes every shield at once --
  // late-game difficulty should come from juggling several hazard *types*
  // at once, not from meteors alone getting more common too.
  function availableSpawns(w) {
    const pool = [{ kind: 'asteroid', fn: () => spawnAsteroid('large'), weight: 10 }];
    if (w >= 4) pool.push({ kind: 'comet', fn: () => spawnComet(false), weight: 5 });
    if (w >= 6) pool.push({ kind: 'comet', fn: () => spawnComet(true), weight: 1.5 });
    if (w >= 8) pool.push({ kind: 'meteor', fn: () => spawnMeteor(false), weight: 3 });
    if (w >= 10) pool.push({ kind: 'meteor', fn: () => spawnMeteor(true), weight: 0.8 });
    if (w >= 12) pool.push({ kind: 'plasmaCloud', fn: () => spawnPlasmaCloud(), weight: 3 });
    if (w >= 16) pool.push({ kind: 'alienTurret', fn: () => spawnAlienTurret(), weight: 2 });
    return pool;
  }

  // Guarantees real spacing between meteor arrivals -- without this, a run
  // of bad luck could roll several meteors within a couple seconds of each
  // other, and since a single meteor already wipes every shield, that's an
  // effectively unavoidable death no matter how skilled the player is.
  let meteorCooldown = 0;
  const METEOR_COOLDOWN_DURATION = 4;

  function spawnRandomHazard() {
    let pool = availableSpawns(wave);
    if (meteorCooldown > 0) pool = pool.filter(p => p.kind !== 'meteor');
    const total = pool.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * total;
    let picked = pool[pool.length - 1];
    for (const p of pool) {
      roll -= p.weight;
      if (roll <= 0) { picked = p; break; }
    }
    picked.fn();
    if (picked.kind === 'meteor') meteorCooldown = METEOR_COOLDOWN_DURATION;
  }

  // Sends a paused (offscreen) alien turret back in from its entry edge to
  // sweep across again, in the same left-to-right or right-to-left direction
  // it started with.
  function resumeAlienSweep(h) {
    h.phase = 'sweeping';
    h.x = h.dir === 1 ? -h.radius - 10 : W + h.radius + 10;
    h.vx = h.dir * alienTurretMoveSpeed();
    h.fireTimer = rand(0.4, 1.0);
  }

  // A hazard that drifts off any edge loops back in from the top instead of
  // despawning -- nothing escapes, everything has to be destroyed.
  // (Alien turrets manage their own offscreen pause/re-entry and never reach this.)
  function respawnAtTop(h) {
    h.x = rand(h.radius, W - h.radius);
    h.y = -h.radius - rand(0, 80);
    let speedBase, jitter;
    if (h.kind === 'asteroid') { speedBase = asteroidSpeed(h.tier); jitter = 0.15; }
    else if (h.kind === 'comet') { speedBase = cometSpeed(h.big); jitter = 0.12; }
    else if (h.kind === 'meteor') { speedBase = meteorSpeed(h.big); jitter = 0.15; }
    else { speedBase = plasmaCloudSpeed(); jitter = 0.14; }
    const v = aimedVelocity(h.x, h.y, speedBase, jitter);
    h.vx = v.vx;
    h.vy = v.vy;
  }

  function splitAsteroid(a) {
    const next = a.tier === 'large' ? 'medium' : a.tier === 'medium' ? 'small' : null;
    if (!next) return;
    for (let i = 0; i < 2; i++) {
      spawnAsteroid(next, a.x + rand(-8, 8), a.y + rand(-8, 8));
      const na = hazards[hazards.length - 1];
      na.vx += rand(-30, 30);
      na.vy += rand(-30, 30);
    }
  }

  function splitBigHazard(h) {
    for (let i = 0; i < 2; i++) {
      if (h.kind === 'comet') spawnComet(false);
      else spawnMeteor(false);
      const nh = hazards[hazards.length - 1];
      nh.x = h.x + rand(-8, 8);
      nh.y = h.y + rand(-8, 8);
      nh.vx += rand(-30, 30);
      nh.vy += rand(-30, 30);
    }
  }

  function scoreForTier(tier) {
    return tier === 'large' ? 10 : tier === 'medium' ? 20 : 35;
  }

  function scoreForHazard(h) {
    if (h.kind === 'asteroid') return scoreForTier(h.tier);
    if (h.kind === 'comet') return h.big ? 60 : 25;
    if (h.kind === 'meteor') return h.big ? 70 : 30;
    if (h.kind === 'plasmaCloud') return 20;
    if (h.kind === 'alienTurret') return 80;
    return 10;
  }

  function goldForHazard(h) {
    if (h.kind === 'asteroid') {
      return h.tier === 'large' ? 1 : h.tier === 'medium' ? 2 : 3;
    }
    if (h.kind === 'comet') return h.big ? 5 : 3;
    if (h.kind === 'meteor') return h.big ? 6 : 4;
    if (h.kind === 'plasmaCloud') return 3;
    if (h.kind === 'alienTurret') return 14;
    return 1;
  }

  function awardKill(h) {
    score += scoreForHazard(h);
    currency += goldForHazard(h);
  }

  // ---- Particles ----
  function burst(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const speed = rand(40, 220);
      particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: rand(0.3, 0.7),
        age: 0,
        color,
        r: rand(1.5, 3.5)
      });
    }
  }

  function trailParticle(x, y, color, scale = 1) {
    particles.push({
      x: x + rand(-4, 4) * scale, y: y + rand(-4, 4) * scale,
      vx: rand(-10, 10), vy: rand(-10, 10),
      life: rand(0.2, 0.4),
      age: 0,
      color,
      r: rand(1, 2.2) * scale
    });
  }

  // ---- Audio (all synthesized -- no sound files, no dependencies) ----
  let audioCtx = null;

  // Browsers refuse to start/resume an AudioContext without a user gesture,
  // so this is only ever called from a button click (startGame). Many mobile
  // browsers (iOS Safari especially) still hand back a freshly-created
  // context in the 'suspended' state even from inside that gesture, so it's
  // not enough to resume() only on reuse -- a brand-new context needs it too,
  // or every sound is silently dropped for the whole first playthrough.
  function ensureAudio() {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtx = new Ctx();
      }
      if (audioCtx && audioCtx.state !== 'running') {
        audioCtx.resume().catch(() => {});
      }
    } catch (e) {}
  }

  function playTone({ freq, endFreq = freq, type = 'sine', duration = 0.15, volume = 0.15, attack = 0.005, delay = 0 }) {
    if (!audioCtx) return;
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function playNoise({ duration = 0.2, volume = 0.15, filterType = 'lowpass', filterFreq = 800, filterQ = 1, delay = 0 }) {
    if (!audioCtx) return;
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    const t0 = audioCtx.currentTime + delay;
    const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    noise.connect(filter).connect(gain).connect(audioCtx.destination);
    noise.start(t0);
    noise.stop(t0 + duration + 0.02);
  }

  // Quick descending laser blip -- fired a lot, so kept short and cheap.
  function sfxLaser() {
    playTone({ freq: 1100, endFreq: 320, type: 'square', duration: 0.09, volume: 0.08, attack: 0.002 });
  }

  // Icy shimmer for a comet freezing the turret.
  function sfxFreeze() {
    playTone({ freq: 1800, endFreq: 2400, type: 'sine', duration: 0.4, volume: 0.16, attack: 0.01 });
    playTone({ freq: 2300, endFreq: 3000, type: 'sine', duration: 0.5, volume: 0.1, attack: 0.02, delay: 0.03 });
  }

  // Sci-fi warble for the alien turret's bolt launch.
  function sfxAlienZap() {
    playTone({ freq: 520, endFreq: 950, type: 'sawtooth', duration: 0.1, volume: 0.11, attack: 0.004 });
    playTone({ freq: 900, endFreq: 240, type: 'sawtooth', duration: 0.14, volume: 0.09, attack: 0.01, delay: 0.05 });
  }

  // Gassy hiss for a Plasma Cloud hit.
  function sfxGassyHiss() {
    playNoise({ duration: 0.5, volume: 0.14, filterType: 'bandpass', filterFreq: 700, filterQ: 0.7 });
    playTone({ freq: 180, endFreq: 90, type: 'sine', duration: 0.4, volume: 0.07, attack: 0.02 });
  }

  // Fiery crackle + thud for a meteor impact.
  function sfxMeteorHit() {
    playNoise({ duration: 0.25, volume: 0.2, filterType: 'lowpass', filterFreq: 2200, filterQ: 0.5 });
    playTone({ freq: 150, endFreq: 45, type: 'sawtooth', duration: 0.3, volume: 0.18, attack: 0.004 });
  }

  // ---- Input ----
  function aimAt(px, py) {
    let ang = Math.atan2(py - ship.y, px - ship.x);
    const upMin = -Math.PI + 0.12;
    const upMax = -0.12;
    if (ang > upMax) ang = upMax;
    if (ang < upMin && ang > -Math.PI) ang = upMin;
    ship.targetAngle = ang;
  }

  function fireBullet() {
    if (ship.fireTimer > 0) return;
    ship.fireTimer = currentFireCooldown();
    const speed = 620;
    const tipX = ship.x + Math.cos(ship.angle) * (ship.radius + 10);
    const tipY = ship.y + Math.sin(ship.angle) * (ship.radius + 10);
    bullets.push({
      x: tipX, y: tipY,
      vx: Math.cos(ship.angle) * speed,
      vy: Math.sin(ship.angle) * speed,
      life: 1.4
    });
    sfxLaser();
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  }

  function startFiring(clientX, clientY) {
    if (state !== STATE.PLAYING) return;
    isFiring = true;
    // Re-resume defensively -- mobile browsers can suspend the AudioContext
    // again after the tab is backgrounded, so every tap re-checks it.
    ensureAudio();
    if (ship.frozenTimer <= 0) aimAt(clientX, clientY);
  }

  function updateAim(clientX, clientY) {
    if (state === STATE.PLAYING && isFiring && ship.frozenTimer <= 0) aimAt(clientX, clientY);
  }

  function stopFiring() {
    isFiring = false;
  }

  canvas.addEventListener('pointerdown', (e) => {
    startFiring(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pressure === 0 && e.pointerType === 'mouse') return;
    if (e.buttons > 0) updateAim(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', stopFiring);
  canvas.addEventListener('pointercancel', stopFiring);
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    startFiring(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length) updateAim(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    stopFiring();
  }, { passive: false });
  canvas.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    stopFiring();
  }, { passive: false });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
  playAgainBtn.addEventListener('click', startGame);
  skipUpgradeBtn.addEventListener('click', startNextWave);
  function showUpgradeMessage(text) {
    upgradeMessageEl.textContent = text;
    upgradeMessageEl.classList.remove('hidden');
  }

  function clearUpgradeMessage() {
    upgradeMessageEl.classList.add('hidden');
  }

  upgradeCards.forEach(card => {
    card.addEventListener('click', () => {
      const stat = card.dataset.stat;
      if (stat === 'shield') {
        if (shields < MAX_SHIELDS) {
          const cost = SHIELD_COSTS[shields];
          if (currency < cost) { showUpgradeMessage('Not enough gold!'); return; }
          currency -= cost;
          shields += 1;
        } else if (meteorUpgrades < MAX_SHIELDS) {
          const cost = METEOR_UPGRADE_COSTS[meteorUpgrades];
          if (currency < cost) { showUpgradeMessage('Not enough gold!'); return; }
          currency -= cost;
          meteorUpgrades += 1;
        } else {
          return;
        }
        clearUpgradeMessage();
        updateHud();
        updateUpgradeScreen();
        return;
      }
      const level = upgrades[stat];
      if (level >= MAX_UPGRADE_LEVEL) return;
      const cost = upgradeCost(stat, level);
      if (currency < cost) { showUpgradeMessage('Not enough gold!'); return; }
      currency -= cost;
      upgrades[stat] += 1;
      applyUpgradeEffects();
      clearUpgradeMessage();
      updateHud();
      updateUpgradeScreen();
    });
  });

  function startGame() {
    ensureAudio();
    resetGame();
    state = STATE.PLAYING;
    startScreen.classList.add('hidden');
    upgradeScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    victoryScreen.classList.add('hidden');
  }

  function updateUpgradeScreen() {
    upgradeGoldEl.textContent = 'Gold: ' + currency;
    ['fireRate', 'damage'].forEach(stat => {
      const level = upgrades[stat];
      const card = upgradeCards.find(c => c.dataset.stat === stat);
      document.getElementById(stat + 'Level').textContent = level + '/' + MAX_UPGRADE_LEVEL;
      if (level >= MAX_UPGRADE_LEVEL) {
        document.getElementById(stat + 'Cost').textContent = 'MAX';
        card.classList.add('unaffordable');
      } else {
        const cost = upgradeCost(stat, level);
        document.getElementById(stat + 'Cost').textContent = cost;
        card.classList.toggle('unaffordable', currency < cost);
      }
    });
    const shieldCard = upgradeCards.find(c => c.dataset.stat === 'shield');
    if (shields < MAX_SHIELDS) {
      shieldNameEl.textContent = 'Shield';
      shieldDescEl.textContent = 'Blocks one hit. A meteor wipes out all your shields at once.';
      document.getElementById('shieldLevel').textContent = shields + '/' + MAX_SHIELDS;
      const cost = SHIELD_COSTS[shields];
      document.getElementById('shieldCost').textContent = cost;
      shieldCard.classList.toggle('unaffordable', currency < cost);
    } else {
      shieldNameEl.textContent = 'Meteor Shield';
      shieldDescEl.textContent = 'Upgrade a shield to survive a meteor -- it absorbs one meteor hit instead of being wiped out with the rest.';
      document.getElementById('shieldLevel').textContent = meteorUpgrades + '/' + MAX_SHIELDS;
      if (meteorUpgrades >= MAX_SHIELDS) {
        document.getElementById('shieldCost').textContent = 'MAX';
        shieldCard.classList.add('unaffordable');
      } else {
        const cost = METEOR_UPGRADE_COSTS[meteorUpgrades];
        document.getElementById('shieldCost').textContent = cost;
        shieldCard.classList.toggle('unaffordable', currency < cost);
      }
    }
  }

  function showWaveClear() {
    state = STATE.UPGRADE;
    // An Alien Turret's bolts can still be in flight the instant its wave
    // clears (you killed the turret but not every bolt it already fired) --
    // without this they'd carry over and could hit you the moment the next
    // wave starts, before you've even seen anything spawn.
    enemyBullets.length = 0;
    const perfect = !tookDamageThisWave;
    const bonus = Math.round(waveClearBonus(wave) * (perfect ? 1.25 : 1));
    currency += bonus;
    updateHud();
    waveBonusEl.textContent = perfect
      ? `+${bonus} gold — Perfect Wave bonus!`
      : `+${bonus} gold (wave clear)`;
    clearUpgradeMessage();
    updateUpgradeScreen();
    upgradeScreen.classList.remove('hidden');
  }

  function startNextWave() {
    wave += 1;
    enemiesToSpawn = enemiesForWave(wave);
    // Ramps down gradually over a long stretch so hazards keep spawning
    // faster well into a long run, but the floor is kept high enough that
    // late-game waves stay theoretically manageable rather than flooding
    // the screen faster than they can possibly be destroyed.
    spawnInterval = Math.max(0.52, 1.6 - wave * 0.03);
    spawnTimer = 0;
    tookDamageThisWave = false;
    updateHud();
    upgradeScreen.classList.add('hidden');
    state = STATE.PLAYING;
  }

  function updateBests() {
    const best = Math.max(score, parseInt(localStorage.getItem(BEST_KEY) || '0', 10));
    try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    const bestWave = Math.max(wave, parseInt(localStorage.getItem(BEST_WAVE_KEY) || '0', 10));
    try { localStorage.setItem(BEST_WAVE_KEY, String(bestWave)); } catch (e) {}
    return { best, bestWave };
  }

  function endGame() {
    state = STATE.OVER;
    const { best, bestWave } = updateBests();
    finalScoreEl.textContent = 'Score: ' + score;
    bestScoreEl.textContent = 'Best: ' + best;
    bestWaveEl.textContent = 'Best Wave: ' + bestWave;
    gameOverScreen.classList.remove('hidden');
  }

  // Wave 99 is the last one, but the player is never told that in advance --
  // clearing it just quietly swaps the usual upgrade screen for a one-off
  // victory screen instead.
  function showVictory() {
    state = STATE.WON;
    updateBests();
    victoryScoreEl.textContent = 'SCORE: ' + score;
    victoryScreen.classList.remove('hidden');
  }

  // ---- Update ----
  function update(dt) {
    if (ship.fireTimer > 0) ship.fireTimer -= dt;
    if (meteorCooldown > 0) meteorCooldown -= dt;

    // ship status effects
    if (ship.frozenTimer > 0) {
      ship.frozenTimer = Math.max(0, ship.frozenTimer - dt);
      updateStatusHud();
    }
    if (ship.debuffTimer > 0) {
      ship.debuffTimer = Math.max(0, ship.debuffTimer - dt);
      updateStatusHud();
    }

    // turret smoothing (frozen turret stays put)
    if (ship.frozenTimer <= 0) {
      let da = ship.targetAngle - ship.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      ship.angle += da * clamp(dt * 12, 0, 1);
    }

    // hold-to-fire: keep shooting while the finger/pointer is held down
    if (isFiring && ship.frozenTimer <= 0) fireBullet();

    // spawn hazards for this wave
    if (enemiesToSpawn > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0 && hazards.length < MAX_CONCURRENT_HAZARDS) {
        spawnTimer = spawnInterval;
        spawnRandomHazard();
        enemiesToSpawn -= 1;
      }
    } else if (hazards.length === 0 && state === STATE.PLAYING) {
      if (wave >= FINAL_WAVE) {
        showVictory();
      } else {
        showWaveClear();
      }
      return;
    }

    // bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
        bullets.splice(i, 1);
      }
    }

    // alien turret bolts: move + collide with ship (asteroid-style damage)
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const eb = enemyBullets[i];
      eb.x += eb.vx * dt;
      eb.y += eb.vy * dt;
      if (eb.x < -20 || eb.x > W + 20 || eb.y < -20 || eb.y > H + 20) {
        enemyBullets.splice(i, 1);
        continue;
      }
      if (dist2(eb.x, eb.y, ship.x, ship.y) < (ship.radius * 0.7 + ALIEN_BOLT_RADIUS) ** 2) {
        enemyBullets.splice(i, 1);
        tookDamageThisWave = true;
        if (shields > 0) {
          shields -= 1;
          burst(eb.x, eb.y, '#c9a6ff', 18);
          updateHud();
        } else {
          burst(eb.x, eb.y, '#c9a6ff', 28);
          screenShake = 0.5;
          updateHud();
          endGame();
          return;
        }
      }
    }

    // player bullets vs alien bolts -- shoot down incoming projectiles
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      for (let j = enemyBullets.length - 1; j >= 0; j--) {
        const eb = enemyBullets[j];
        if (dist2(b.x, b.y, eb.x, eb.y) < (ALIEN_BOLT_RADIUS + 3.5) ** 2) {
          bullets.splice(i, 1);
          enemyBullets.splice(j, 1);
          burst(eb.x, eb.y, '#c9a6ff', 10);
          break;
        }
      }
    }

    // hazards: move + collide with ship
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.rotSpeed * dt;

      if (h.kind === 'comet' || h.kind === 'meteor' || h.kind === 'plasmaCloud') {
        h.trailTimer -= dt;
        if (h.trailTimer <= 0) {
          h.trailTimer = 0.04;
          const scale = h.big ? 1.6 : 1;
          if (h.kind === 'comet') {
            trailParticle(h.x, h.y, Math.random() < 0.5 ? '#bfefff' : '#e8faff', scale);
          } else if (h.kind === 'meteor') {
            trailParticle(h.x, h.y, Math.random() < 0.5 ? '#ff9a5a' : '#ffd166', scale);
          } else {
            trailParticle(h.x, h.y, Math.random() < 0.5 ? '#7CFC9A' : '#c8ffd9', scale);
          }
        }
      }

      if (h.kind === 'alienTurret') {
        if (h.phase === 'sweeping') {
          h.fireTimer -= dt;
          if (h.fireTimer <= 0) {
            h.fireTimer = alienFireInterval();
            const ang = Math.atan2(ship.y - h.y, ship.x - h.x);
            enemyBullets.push({
              x: h.x + Math.cos(ang) * (h.radius + 6),
              y: h.y + Math.sin(ang) * (h.radius + 6),
              vx: Math.cos(ang) * ALIEN_BOLT_SPEED,
              vy: Math.sin(ang) * ALIEN_BOLT_SPEED
            });
            sfxAlienZap();
          }
          if (h.x < -h.radius - 20 || h.x > W + h.radius + 20) {
            h.phase = 'paused';
            h.vx = 0;
            h.pauseTimer = ALIEN_TURRET_PAUSE_DURATION;
          }
        } else {
          // Nothing else left to shoot at -- skip the pause and keep looping.
          const alone = hazards.length === 1;
          if (alone) {
            resumeAlienSweep(h);
          } else {
            h.pauseTimer -= dt;
            if (h.pauseTimer <= 0) resumeAlienSweep(h);
          }
        }
        continue; // never collides with the ship, and never wraps like other hazards
      }

      if (dist2(h.x, h.y, ship.x, ship.y) < (h.radius + ship.radius * 0.8) ** 2) {
        if (h.kind === 'asteroid') {
          tookDamageThisWave = true;
          if (shields > 0) {
            shields -= 1;
            burst(h.x, h.y, '#9fe3ff', 20);
          } else {
            burst(h.x, h.y, '#ff6b6b', 26);
            screenShake = 0.5;
            hazards.splice(i, 1);
            updateHud();
            endGame();
            return;
          }
        } else if (h.kind === 'comet') {
          ship.frozenTimer = Math.max(ship.frozenTimer, h.big ? 4 : 2.5);
          burst(h.x, h.y, '#bfefff', h.big ? 34 : 24);
          sfxFreeze();
        } else if (h.kind === 'meteor') {
          tookDamageThisWave = true;
          sfxMeteorHit();
          if (shields > MAX_SHIELDS - meteorUpgrades) {
            shields -= 1;
            burst(h.x, h.y, '#9fe3ff', 34);
          } else if (shields > 0) {
            shields = 0;
            burst(h.x, h.y, '#9fe3ff', 34);
          } else {
            burst(h.x, h.y, '#ff9a5a', 30);
            screenShake = 0.5;
            hazards.splice(i, 1);
            updateHud();
            endGame();
            return;
          }
        } else if (h.kind === 'plasmaCloud') {
          ship.debuffTimer = Math.max(ship.debuffTimer, PLASMA_DEBUFF_DURATION);
          burst(h.x, h.y, '#7CFC9A', 26);
          updateStatusHud();
          sfxGassyHiss();
        }
        screenShake = Math.max(screenShake, 0.35);
        hazards.splice(i, 1);
        updateHud();
        updateStatusHud();
        continue;
      }

      if (h.y > H + h.radius + 40 || h.x < -h.radius - 40 || h.x > W + h.radius + 40) {
        respawnAtTop(h);
        continue;
      }
    }

    // collisions: bullet vs hazard
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (dist2(h.x, h.y, b.x, b.y) < (h.radius) ** 2) {
          bullets.splice(j, 1);
          h.hp -= currentBulletDamage();
          burst(b.x, b.y, '#8bd0ff', 6);
          if (h.hp <= 0) {
            awardKill(h);
            burst(h.x, h.y, '#ffd27f', 18);
            if (h.kind === 'asteroid') splitAsteroid(h);
            else if ((h.kind === 'comet' || h.kind === 'meteor') && h.big) splitBigHazard(h);
            hazards.splice(i, 1);
            updateHud();
          }
          break;
        }
      }
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }

    if (screenShake > 0) screenShake = Math.max(0, screenShake - dt);
  }

  // ---- Draw ----
  function drawShip() {
    ctx.save();
    ctx.translate(ship.x, ship.y);

    ctx.fillStyle = ship.frozenTimer > 0 ? '#294a66' : '#2c3660';
    ctx.strokeStyle = ship.frozenTimer > 0 ? '#bfefff' : '#7fa8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1a2140';
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(ship.angle);
    ctx.fillStyle = ship.frozenTimer > 0 ? '#bfefff' : '#cfe6ff';
    ctx.fillRect(0, -5, ship.radius + 20, 10);
    ctx.fillStyle = ship.frozenTimer > 0 ? '#bfefff' : '#7fa8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (shields > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 + shields * 0.15;
      ctx.strokeStyle = '#9fe3ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, ship.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (ship.frozenTimer > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(ship.frozenTimer / 2.5, 0, 1) * 0.5;
      ctx.strokeStyle = '#bfefff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, ship.radius + 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (ship.debuffTimer > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(ship.debuffTimer / PLASMA_DEBUFF_DURATION, 0, 1) * 0.5;
      ctx.strokeStyle = '#7CFC9A';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, ship.radius + 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlasmaCloud(h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#5CDB7A';
    ctx.strokeStyle = '#2f7a45';
    ctx.lineWidth = 1.5;
    h.puffs.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.ox, p.oy, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawAlienTurret(h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.fillStyle = '#4a2f7a';
    ctx.strokeStyle = '#c9a6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, h.radius, h.radius * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c9a6ff';
    ctx.beginPath();
    ctx.arc(0, -h.radius * 0.2, h.radius * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1a4a';
    ctx.beginPath();
    ctx.arc(0, -h.radius * 0.2, h.radius * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHazard(h) {
    if (h.kind === 'plasmaCloud') { drawPlasmaCloud(h); return; }
    if (h.kind === 'alienTurret') { drawAlienTurret(h); return; }
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    ctx.beginPath();
    h.shape.forEach((p, i) => {
      const x = Math.cos(p.a) * p.r;
      const y = Math.sin(p.a) * p.r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    if (h.kind === 'comet') {
      ctx.fillStyle = '#9fe3ff';
      ctx.strokeStyle = '#2a6a8f';
    } else if (h.kind === 'meteor') {
      ctx.fillStyle = '#ff8a5c';
      ctx.strokeStyle = '#8a2f10';
    } else {
      ctx.fillStyle = '#8b7d6b';
      ctx.strokeStyle = '#3f372c';
    }
    ctx.lineWidth = h.big ? 4 : 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (screenShake > 0) {
      const s = screenShake * 10;
      ctx.translate(rand(-s, s), rand(-s, s));
    }

    ctx.fillStyle = '#05060f';
    ctx.fillRect(-20, -20, W + 40, H + 40);
    stars.forEach(s => {
      s.tw += 0.02;
      const alpha = 0.4 + Math.sin(s.tw) * 0.4;
      ctx.fillStyle = `rgba(200,220,255,${clamp(alpha, 0.15, 0.9)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });

    hazards.forEach(drawHazard);

    ctx.fillStyle = '#cfe6ff';
    bullets.forEach(b => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    enemyBullets.forEach(eb => {
      ctx.fillStyle = '#c9a6ff';
      ctx.beginPath();
      ctx.arc(eb.x, eb.y, ALIEN_BOLT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f0e0ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    particles.forEach(p => {
      const alpha = 1 - p.age / p.life;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    if (state !== STATE.MENU) drawShip();

    ctx.restore();
  }

  // ---- Loop ----
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (state === STATE.PLAYING) update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  // initial idle scene
  upgrades = { fireRate: 0, damage: 0 };
  applyUpgradeEffects();
  ship = { x: W / 2, y: H - 90, radius: 26, angle: -Math.PI / 2, targetAngle: -Math.PI / 2, frozenTimer: 0, debuffTimer: 0, fireTimer: 0 };
  bullets = []; enemyBullets = []; hazards = []; particles = [];
  makeStars();

  const best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  if (best > 0) bestScoreEl.textContent = 'Best: ' + best;
  const bestWaveInit = parseInt(localStorage.getItem(BEST_WAVE_KEY) || '0', 10);
  if (bestWaveInit > 0) bestWaveEl.textContent = 'Best Wave: ' + bestWaveInit;

  requestAnimationFrame(loop);
})();
