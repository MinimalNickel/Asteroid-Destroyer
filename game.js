(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const shieldPips = Array.from(document.querySelectorAll('.shield-pip'));
  const currencyLabelEl = document.getElementById('currencyLabel');
  const scoreLabelEl = document.getElementById('scoreLabel');
  const waveLabelEl = document.getElementById('waveLabel');
  const frozenStatusEl = document.getElementById('frozenStatus');
  const startScreen = document.getElementById('startScreen');
  const upgradeScreen = document.getElementById('upgradeScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const skipUpgradeBtn = document.getElementById('skipUpgradeBtn');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');
  const upgradeGoldEl = document.getElementById('upgradeGold');
  const upgradeCards = Array.from(document.querySelectorAll('.upgrade-card'));

  const BEST_KEY = 'asteroidDestroyer.best';

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
  const STATE = { MENU: 'menu', PLAYING: 'playing', UPGRADE: 'upgrade', OVER: 'over' };
  let state = STATE.MENU;

  let ship, bullets, hazards, particles, stars;
  let score = 0, currency = 0, shields = 0, wave = 1;
  let spawnTimer = 0, spawnInterval = 1.6;
  let enemiesToSpawn = 0;
  let screenShake = 0;
  let isFiring = false;
  const MAX_SHIELDS = 3;
  const SHIELD_COSTS = [30, 90, 250];

  // ---- Player upgrades ----
  const BASE_FIRE_COOLDOWN = 0.35;
  const UPGRADE_COST_BASE = 40;
  const UPGRADE_COST_STEP = 25;
  let upgrades, fireCooldown, bulletDamage;

  function upgradeCost(level) {
    return UPGRADE_COST_BASE + level * UPGRADE_COST_STEP;
  }

  function applyUpgradeEffects() {
    fireCooldown = Math.max(0.05, BASE_FIRE_COOLDOWN * Math.pow(0.88, upgrades.fireRate));
    bulletDamage = 1 + upgrades.damage;
  }

  function enemiesForWave(w) {
    return 5 + w * 2;
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
    ship = {
      x: W / 2,
      y: H - 90,
      radius: 26,
      angle: -Math.PI / 2,
      targetAngle: -Math.PI / 2,
      frozenTimer: 0,
      fireTimer: 0
    };
    bullets = [];
    hazards = [];
    particles = [];
    score = 0;
    currency = 0;
    wave = 1;
    spawnTimer = 0;
    spawnInterval = 1.6;
    enemiesToSpawn = enemiesForWave(wave);
    screenShake = 0;
    updateHud();
    updateStatusHud();
    makeStars();
  }

  function updateHud() {
    shieldPips.forEach((el, i) => el.classList.toggle('filled', i < shields));
    currencyLabelEl.textContent = 'Gold: ' + currency;
    scoreLabelEl.textContent = 'Score: ' + score;
    waveLabelEl.textContent = 'Wave ' + wave;
  }

  function updateStatusHud() {
    frozenStatusEl.classList.toggle('hidden', ship.frozenTimer <= 0);
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
    hazards.push({
      kind: 'asteroid',
      x: sx, y: sy,
      vx: v.vx, vy: v.vy,
      radius,
      tier,
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-1.2, 1.2),
      shape: makeAsteroidShape(radius),
      hp: tier === 'large' ? 3 : tier === 'medium' ? 2 : 1
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
      hp: big ? 5 : 2,
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
      hp: big ? 6 : 2,
      trailTimer: 0
    });
  }

  // A hazard that drifts off any edge loops back in from the top instead of
  // despawning -- nothing escapes, everything has to be destroyed.
  function respawnAtTop(h) {
    h.x = rand(h.radius, W - h.radius);
    h.y = -h.radius - rand(0, 80);
    let speedBase, jitter;
    if (h.kind === 'asteroid') { speedBase = asteroidSpeed(h.tier); jitter = 0.15; }
    else if (h.kind === 'comet') { speedBase = cometSpeed(h.big); jitter = 0.12; }
    else { speedBase = meteorSpeed(h.big); jitter = 0.15; }
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
    return 10;
  }

  function goldForHazard(h) {
    if (h.kind === 'asteroid') {
      return h.tier === 'large' ? 3 : h.tier === 'medium' ? 5 : 8;
    }
    if (h.kind === 'comet') return h.big ? 15 : 8;
    if (h.kind === 'meteor') return h.big ? 18 : 10;
    return 3;
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
    ship.fireTimer = fireCooldown;
    const speed = 620;
    const tipX = ship.x + Math.cos(ship.angle) * (ship.radius + 10);
    const tipY = ship.y + Math.sin(ship.angle) * (ship.radius + 10);
    bullets.push({
      x: tipX, y: tipY,
      vx: Math.cos(ship.angle) * speed,
      vy: Math.sin(ship.angle) * speed,
      life: 1.4
    });
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  }

  function startFiring(clientX, clientY) {
    if (state !== STATE.PLAYING) return;
    isFiring = true;
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
  skipUpgradeBtn.addEventListener('click', startNextWave);
  upgradeCards.forEach(card => {
    card.addEventListener('click', () => {
      const stat = card.dataset.stat;
      if (stat === 'shield') {
        if (shields >= MAX_SHIELDS) return;
        const cost = SHIELD_COSTS[shields];
        if (currency < cost) return;
        currency -= cost;
        shields += 1;
        updateHud();
        startNextWave();
        return;
      }
      const level = upgrades[stat];
      const cost = upgradeCost(level);
      if (currency < cost) return;
      currency -= cost;
      upgrades[stat] += 1;
      applyUpgradeEffects();
      startNextWave();
    });
  });

  function startGame() {
    resetGame();
    state = STATE.PLAYING;
    startScreen.classList.add('hidden');
    upgradeScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
  }

  function updateUpgradeScreen() {
    upgradeGoldEl.textContent = 'Gold: ' + currency;
    ['fireRate', 'damage'].forEach(stat => {
      const level = upgrades[stat];
      const cost = upgradeCost(level);
      document.getElementById(stat + 'Level').textContent = 'Lv. ' + level;
      document.getElementById(stat + 'Cost').textContent = cost;
      const card = upgradeCards.find(c => c.dataset.stat === stat);
      card.classList.toggle('unaffordable', currency < cost);
    });
    const shieldCard = upgradeCards.find(c => c.dataset.stat === 'shield');
    document.getElementById('shieldLevel').textContent = shields + '/' + MAX_SHIELDS;
    if (shields >= MAX_SHIELDS) {
      document.getElementById('shieldCost').textContent = 'MAX';
      shieldCard.classList.add('unaffordable');
    } else {
      const cost = SHIELD_COSTS[shields];
      document.getElementById('shieldCost').textContent = cost;
      shieldCard.classList.toggle('unaffordable', currency < cost);
    }
  }

  function showWaveClear() {
    state = STATE.UPGRADE;
    updateUpgradeScreen();
    upgradeScreen.classList.remove('hidden');
  }

  function startNextWave() {
    wave += 1;
    enemiesToSpawn = enemiesForWave(wave);
    spawnInterval = Math.max(0.45, 1.6 - wave * 0.12);
    spawnTimer = 0;
    updateHud();
    upgradeScreen.classList.add('hidden');
    state = STATE.PLAYING;
  }

  function endGame() {
    state = STATE.OVER;
    const best = Math.max(score, parseInt(localStorage.getItem(BEST_KEY) || '0', 10));
    try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    finalScoreEl.textContent = 'Score: ' + score;
    bestScoreEl.textContent = 'Best: ' + best;
    gameOverScreen.classList.remove('hidden');
  }

  // ---- Update ----
  function update(dt) {
    if (ship.fireTimer > 0) ship.fireTimer -= dt;

    // ship status effects
    if (ship.frozenTimer > 0) {
      ship.frozenTimer = Math.max(0, ship.frozenTimer - dt);
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
      if (spawnTimer <= 0) {
        spawnTimer = spawnInterval;
        const roll = Math.random();
        if (wave >= 5 && roll < 0.04) spawnMeteor(true);
        else if (wave >= 4 && roll < 0.09) spawnComet(true);
        else if (wave >= 3 && roll < 0.24) spawnMeteor(false);
        else if (wave >= 2 && roll < 0.41) spawnComet(false);
        else spawnAsteroid('large');
        enemiesToSpawn -= 1;
      }
    } else if (hazards.length === 0 && state === STATE.PLAYING) {
      showWaveClear();
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

    // hazards: move + collide with ship
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.rotSpeed * dt;

      if (h.kind === 'comet' || h.kind === 'meteor') {
        h.trailTimer -= dt;
        if (h.trailTimer <= 0) {
          h.trailTimer = 0.04;
          const scale = h.big ? 1.6 : 1;
          if (h.kind === 'comet') {
            trailParticle(h.x, h.y, Math.random() < 0.5 ? '#bfefff' : '#e8faff', scale);
          } else {
            trailParticle(h.x, h.y, Math.random() < 0.5 ? '#ff9a5a' : '#ffd166', scale);
          }
        }
      }

      if (dist2(h.x, h.y, ship.x, ship.y) < (h.radius + ship.radius * 0.8) ** 2) {
        if (h.kind === 'asteroid') {
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
        } else if (h.kind === 'meteor') {
          if (shields > 0) {
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
          h.hp -= bulletDamage;
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
  }

  function drawHazard(h) {
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
  ship = { x: W / 2, y: H - 90, radius: 26, angle: -Math.PI / 2, targetAngle: -Math.PI / 2, frozenTimer: 0, fireTimer: 0 };
  bullets = []; hazards = []; particles = [];
  makeStars();

  const best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  if (best > 0) bestScoreEl.textContent = 'Best: ' + best;

  requestAnimationFrame(loop);
})();
