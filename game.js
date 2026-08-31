(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const healthBarEl = document.getElementById('healthBar');
  const healthLabelEl = document.getElementById('healthLabel');
  const currencyLabelEl = document.getElementById('currencyLabel');
  const scoreLabelEl = document.getElementById('scoreLabel');
  const waveLabelEl = document.getElementById('waveLabel');
  const burnStatusEl = document.getElementById('burnStatus');
  const powerStatusEl = document.getElementById('powerStatus');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');
  const towerButtons = Array.from(document.querySelectorAll('.tower-btn'));
  const towerTrayEl = document.getElementById('towerTray');

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

  // ---- Lane layout ----
  const LANES = 4;
  const SLOT_ROWS = 3;
  const SLOT_Y_FRAC = [0.30, 0.48, 0.66];
  const BASE_Y_OFFSET = 90;
  const SLOT_RADIUS = 24;

  function laneX(lane) { return (W / LANES) * (lane + 0.5); }
  function slotY(row) { return H * SLOT_Y_FRAC[row]; }
  function baseY() { return H - BASE_Y_OFFSET; }

  // ---- Tower definitions ----
  const TOWER_DEFS = {
    turret: { cost: 20, fireInterval: 0.5, dmg: 1, canHit: ['asteroid'], bulletColor: '#cfe6ff', bulletSpeed: 560 },
    missile: { cost: 40, fireInterval: 1.4, dmg: 3, canHit: ['asteroid'], splash: 45, bulletColor: '#ffb347', bulletSpeed: 420 },
    flame: { cost: 35, fireInterval: 0.25, dmg: 1, canHit: ['asteroid', 'comet'], bulletColor: '#ff8a5c', bulletSpeed: 500 },
    ice: { cost: 35, fireInterval: 0.6, dmg: 1, canHit: ['asteroid', 'meteor'], bulletColor: '#9fe3ff', bulletSpeed: 480 }
  };

  // ---- Game state ----
  const STATE = { MENU: 'menu', PLAYING: 'playing', OVER: 'over' };
  let state = STATE.MENU;

  let ship, bullets, hazards, powerups, particles, stars, towers, laneFreeze;
  let score = 0, currency = 0, health = 100, wave = 1;
  let spawnTimer = 0, spawnInterval = 1.6;
  let powerupTimer = 14;
  let elapsed = 0;
  let screenShake = 0;
  let nukeFlash = 0;
  const DOT_TICK_INTERVAL = 0.6;
  const DOT_TICK_DAMAGE = 6;
  const LANE_FREEZE_DURATION = 3;
  let selectedTowerType = null;

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
    ship = {
      x: W / 2,
      y: baseY(),
      radius: 26,
      dotTicksRemaining: 0,
      dotTimer: 0,
      powerShotTimer: 0
    };
    bullets = [];
    hazards = [];
    powerups = [];
    particles = [];
    towers = [];
    laneFreeze = new Array(LANES).fill(0);
    score = 0;
    currency = 60;
    health = 100;
    wave = 1;
    spawnTimer = 0;
    spawnInterval = 1.6;
    powerupTimer = 14;
    elapsed = 0;
    screenShake = 0;
    nukeFlash = 0;
    selectedTowerType = null;
    updateHud();
    updateStatusHud();
    updateTowerTray();
    makeStars();
  }

  function updateHud() {
    const pct = clamp(health, 0, 100);
    healthBarEl.style.width = pct + '%';
    if (pct > 50) healthBarEl.style.background = 'linear-gradient(90deg, #37e07a, #8bf0a8)';
    else if (pct > 25) healthBarEl.style.background = 'linear-gradient(90deg, #e0c437, #f0e08b)';
    else healthBarEl.style.background = 'linear-gradient(90deg, #e03737, #f08b8b)';
    healthLabelEl.textContent = Math.max(0, Math.round(health));
    currencyLabelEl.textContent = 'Gold: ' + currency;
    scoreLabelEl.textContent = 'Score: ' + score;
    waveLabelEl.textContent = 'Wave ' + wave;
    updateTowerTray();
  }

  function updateStatusHud() {
    burnStatusEl.classList.toggle('hidden', ship.dotTicksRemaining <= 0);
    powerStatusEl.classList.toggle('hidden', ship.powerShotTimer <= 0);
  }

  function updateTowerTray() {
    towerButtons.forEach(btn => {
      const type = btn.dataset.type;
      const def = TOWER_DEFS[type];
      btn.classList.toggle('selected', selectedTowerType === type);
      btn.classList.toggle('unaffordable', currency < def.cost);
    });
  }

  towerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      selectedTowerType = selectedTowerType === type ? null : type;
      updateTowerTray();
    });
  });

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

  function spawnAsteroid(size = null, lane = null) {
    const tier = size || 'large';
    const radiusMap = { large: rand(34, 44), medium: rand(20, 28), small: rand(11, 16) };
    const radius = radiusMap[tier];
    const ln = lane === null ? Math.floor(rand(0, LANES)) : lane;
    const speedBase = { large: 28, medium: 42, small: 60 }[tier] + wave * 2.2;
    hazards.push({
      kind: 'asteroid',
      lane: ln,
      x: laneX(ln) + rand(-8, 8),
      y: -radius - rand(0, 120),
      vy: speedBase * rand(0.85, 1.1),
      radius,
      tier,
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-1.2, 1.2),
      shape: makeAsteroidShape(radius),
      hp: tier === 'large' ? 3 : tier === 'medium' ? 2 : 1
    });
  }

  function spawnComet() {
    const radius = rand(20, 27);
    const ln = Math.floor(rand(0, LANES));
    hazards.push({
      kind: 'comet',
      lane: ln,
      x: laneX(ln),
      y: -radius - rand(0, 120),
      vy: 70 + wave * 3,
      radius,
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-2, 2),
      shape: makeAsteroidShape(radius),
      hp: 2,
      trailTimer: 0
    });
  }

  function spawnMeteor() {
    const radius = rand(24, 32);
    const ln = Math.floor(rand(0, LANES));
    hazards.push({
      kind: 'meteor',
      lane: ln,
      x: laneX(ln),
      y: -radius - rand(0, 120),
      vy: 50 + wave * 3,
      radius,
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-1.5, 1.5),
      shape: makeAsteroidShape(radius),
      hp: 2,
      trailTimer: 0
    });
  }

  function splitAsteroid(a) {
    const next = a.tier === 'large' ? 'medium' : a.tier === 'medium' ? 'small' : null;
    if (!next) return;
    for (let i = 0; i < 2; i++) {
      spawnAsteroid(next, a.lane);
      const na = hazards[hazards.length - 1];
      na.x = a.x + rand(-8, 8);
      na.y = a.y;
    }
  }

  function damageForTier(tier) {
    return tier === 'large' ? 26 : tier === 'medium' ? 16 : 9;
  }

  function scoreForTier(tier) {
    return tier === 'large' ? 10 : tier === 'medium' ? 20 : 35;
  }

  function scoreForHazard(h) {
    if (h.kind === 'asteroid') return scoreForTier(h.tier);
    if (h.kind === 'comet') return 25;
    if (h.kind === 'meteor') return 30;
    return 10;
  }

  function awardKill(h) {
    const v = scoreForHazard(h);
    score += v;
    currency += v;
  }

  // ---- Power-ups ----
  function spawnPowerup() {
    const radius = 17;
    const ln = Math.floor(rand(0, LANES));
    const roll = Math.random();
    const kind = roll < 0.08 ? 'nuke' : roll < 0.45 ? 'rocket' : 'repair';
    powerups.push({
      kind,
      lane: ln,
      x: laneX(ln),
      y: -radius - rand(0, 80),
      vy: rand(45, 60),
      radius,
      pulse: rand(0, Math.PI * 2)
    });
  }

  function applyPowerup(p) {
    if (p.kind === 'repair') {
      health = clamp(health + 25, 0, 100);
      burst(p.x, p.y, '#8bf0a8', 20);
    } else if (p.kind === 'rocket') {
      ship.powerShotTimer = Math.max(ship.powerShotTimer, 8);
      burst(p.x, p.y, '#ffd27f', 20);
    } else if (p.kind === 'nuke') {
      for (const h of hazards) {
        awardKill(h);
        burst(h.x, h.y, '#ffd27f', 24);
      }
      hazards.length = 0;
      screenShake = 0.6;
      nukeFlash = 1;
    }
    updateHud();
    updateStatusHud();
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

  function trailParticle(x, y, color) {
    particles.push({
      x: x + rand(-4, 4), y: y + rand(-4, 4),
      vx: rand(-10, 10), vy: rand(-10, 10),
      life: rand(0.2, 0.4),
      age: 0,
      color,
      r: rand(1, 2.2)
    });
  }

  // ---- Tower placement ----
  function slotAt(lane, row) {
    const towerHere = towers.find(t => t.lane === lane && t.row === row);
    return { x: laneX(lane), y: slotY(row), occupied: !!towerHere, tower: towerHere };
  }

  function handleCanvasTap(px, py) {
    if (state !== STATE.PLAYING || !selectedTowerType) return;
    const def = TOWER_DEFS[selectedTowerType];
    for (let lane = 0; lane < LANES; lane++) {
      for (let row = 0; row < SLOT_ROWS; row++) {
        const sx = laneX(lane), sy = slotY(row);
        if (dist2(px, py, sx, sy) < SLOT_RADIUS ** 2) {
          const slot = slotAt(lane, row);
          if (slot.occupied) return;
          if (currency < def.cost) return;
          currency -= def.cost;
          towers.push({ lane, row, type: selectedTowerType, cooldown: 0 });
          updateHud();
          return;
        }
      }
    }
  }

  canvas.addEventListener('pointerdown', (e) => handleCanvasTap(e.clientX, e.clientY));
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) handleCanvasTap(t.clientX, t.clientY);
  }, { passive: false });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  function startGame() {
    resetGame();
    state = STATE.PLAYING;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    towerTrayEl.classList.remove('hidden');
  }

  function endGame() {
    state = STATE.OVER;
    const best = Math.max(score, parseInt(localStorage.getItem(BEST_KEY) || '0', 10));
    try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    finalScoreEl.textContent = 'Score: ' + score;
    bestScoreEl.textContent = 'Best: ' + best;
    gameOverScreen.classList.remove('hidden');
    towerTrayEl.classList.add('hidden');
  }

  // ---- Update ----
  function update(dt) {
    elapsed += dt;

    // wave scaling
    const newWave = 1 + Math.floor(elapsed / 18);
    if (newWave !== wave) { wave = newWave; updateHud(); }
    spawnInterval = Math.max(0.45, 1.6 - wave * 0.12);

    // ship status effects
    let statusChanged = false;
    if (ship.powerShotTimer > 0) {
      ship.powerShotTimer = Math.max(0, ship.powerShotTimer - dt);
      statusChanged = true;
    }
    if (ship.dotTicksRemaining > 0) {
      ship.dotTimer -= dt;
      if (ship.dotTimer <= 0) {
        ship.dotTimer += DOT_TICK_INTERVAL;
        ship.dotTicksRemaining -= 1;
        health -= DOT_TICK_DAMAGE;
        burst(ship.x, ship.y - ship.radius * 0.5, '#ff9a5a', 6);
        updateHud();
        if (health <= 0) { health = 0; updateHud(); endGame(); return; }
      }
      statusChanged = true;
    }
    if (statusChanged) updateStatusHud();

    // lane freeze timers
    for (let i = 0; i < LANES; i++) {
      if (laneFreeze[i] > 0) laneFreeze[i] = Math.max(0, laneFreeze[i] - dt);
    }

    // spawn hazards
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = spawnInterval;
      const roll = Math.random();
      if (wave >= 3 && roll < 0.15) spawnMeteor();
      else if (wave >= 2 && roll < 0.32) spawnComet();
      else spawnAsteroid('large');
      if (wave >= 3 && Math.random() < 0.4) spawnAsteroid('medium');
    }

    // spawn power-ups
    powerupTimer -= dt;
    if (powerupTimer <= 0) {
      powerupTimer = rand(11, 17);
      spawnPowerup();
    }

    // hazards: move straight down their lane, resolve base breaches
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      h.y += h.vy * dt;
      h.rot += h.rotSpeed * dt;

      if (h.kind === 'comet' || h.kind === 'meteor') {
        h.trailTimer -= dt;
        if (h.trailTimer <= 0) {
          h.trailTimer = 0.05;
          trailParticle(h.x, h.y, h.kind === 'comet' ? '#bfefff' : '#ff9a5a');
        }
      }

      if (h.y + h.radius >= ship.y - ship.radius * 0.6) {
        if (h.kind === 'asteroid') {
          health -= damageForTier(h.tier);
          burst(h.x, h.y, '#ff6b6b', 20);
        } else if (h.kind === 'comet') {
          health -= 8;
          laneFreeze[h.lane] = LANE_FREEZE_DURATION;
          burst(h.x, h.y, '#bfefff', 24);
        } else if (h.kind === 'meteor') {
          ship.dotTicksRemaining = Math.min(6, ship.dotTicksRemaining + 4);
          ship.dotTimer = 0;
          burst(h.x, h.y, '#ff9a5a', 20);
        }
        screenShake = Math.max(screenShake, 0.35);
        hazards.splice(i, 1);
        updateHud();
        updateStatusHud();
        if (health <= 0) { health = 0; updateHud(); endGame(); return; }
        continue;
      }
    }

    // power-ups: move straight down; unshot ones just fall past, no effect
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += p.vy * dt;
      p.pulse += dt * 4;
      if (p.y > H + p.radius + 40) {
        powerups.splice(i, 1);
      }
    }

    // towers: auto-fire at the most advanced valid target in their lane
    for (const t of towers) {
      if (laneFreeze[t.lane] > 0) continue;
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const def = TOWER_DEFS[t.type];
      const ty = slotY(t.row);

      let best = null, bestY = -Infinity;
      for (const p of powerups) {
        if (p.lane !== t.lane) continue;
        if (p.y > bestY) { best = { kind: 'powerup', ref: p }; bestY = p.y; }
      }
      for (const h of hazards) {
        if (h.lane !== t.lane || !def.canHit.includes(h.kind)) continue;
        if (h.y > bestY) { best = { kind: 'hazard', ref: h }; bestY = h.y; }
      }

      if (best) {
        t.cooldown = def.fireInterval;
        const dir = bestY >= ty ? 1 : -1;
        bullets.push({
          x: laneX(t.lane), y: ty,
          vy: def.bulletSpeed * dir,
          lane: t.lane,
          type: t.type,
          dmg: def.dmg,
          splash: def.splash || 0,
          color: def.bulletColor
        });
      }
    }

    // bullets: move + collide
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y += b.vy * dt;
      if (b.y < -20 || b.y > H + 20) { bullets.splice(i, 1); continue; }

      // powerups: any tower type can activate one
      let hit = false;
      for (let j = powerups.length - 1; j >= 0; j--) {
        const p = powerups[j];
        if (p.lane !== b.lane) continue;
        if (dist2(p.x, p.y, b.x, b.y) < p.radius ** 2) {
          applyPowerup(p);
          powerups.splice(j, 1);
          hit = true;
          break;
        }
      }
      if (hit) { bullets.splice(i, 1); continue; }

      const def = TOWER_DEFS[b.type];
      for (let j = hazards.length - 1; j >= 0; j--) {
        const h = hazards[j];
        if (h.lane !== b.lane || !def.canHit.includes(h.kind)) continue;
        if (dist2(h.x, h.y, b.x, b.y) < h.radius ** 2) {
          bullets.splice(i, 1);
          burst(b.x, b.y, '#8bd0ff', 6);
          if (b.splash > 0) {
            for (let k = hazards.length - 1; k >= 0; k--) {
              const other = hazards[k];
              if (other.lane !== b.lane || other.kind !== 'asteroid') continue;
              if (dist2(other.x, other.y, b.x, b.y) > b.splash ** 2) continue;
              applyBulletDamage(other, k, b.dmg);
            }
          } else {
            applyBulletDamage(h, j, b.dmg);
          }
          hit = true;
          break;
        }
      }
      if (hit) continue;
    }

    function applyBulletDamage(h, index, dmg) {
      const instaKill = ship.powerShotTimer > 0;
      h.hp -= instaKill ? h.hp : dmg;
      if (h.hp <= 0) {
        awardKill(h);
        burst(h.x, h.y, '#ffd27f', 18);
        if (h.kind === 'asteroid' && !instaKill) splitAsteroid(h);
        const idx = hazards.indexOf(h);
        if (idx >= 0) hazards.splice(idx, 1);
        updateHud();
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
    if (nukeFlash > 0) nukeFlash = Math.max(0, nukeFlash - dt * 2.5);
  }

  // ---- Draw ----
  function drawShip() {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.fillStyle = '#2c3660';
    ctx.strokeStyle = '#7fa8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a2140';
    ctx.beginPath();
    ctx.arc(0, 0, ship.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cfe6ff';
    ctx.fillRect(-5, -ship.radius - 20, 10, 20);
    ctx.fillStyle = '#7fa8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLanes() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < LANES; i++) {
      const x = (W / LANES) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, baseY() + ship.radius);
      ctx.stroke();
    }
    for (let lane = 0; lane < LANES; lane++) {
      if (laneFreeze[lane] > 0) {
        ctx.fillStyle = `rgba(150,220,255,${clamp(laneFreeze[lane] / LANE_FREEZE_DURATION, 0, 1) * 0.12})`;
        ctx.fillRect((W / LANES) * lane, 0, W / LANES, baseY());
      }
    }
    ctx.restore();
  }

  function drawSlots() {
    for (let lane = 0; lane < LANES; lane++) {
      for (let row = 0; row < SLOT_ROWS; row++) {
        const slot = slotAt(lane, row);
        if (slot.occupied) {
          drawTower(slot.tower);
        } else if (selectedTowerType) {
          const affordable = currency >= TOWER_DEFS[selectedTowerType].cost;
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = affordable ? 'rgba(255,255,255,0.4)' : 'rgba(255,100,100,0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(slot.x, slot.y, SLOT_RADIUS, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  function drawTower(t) {
    const x = laneX(t.lane), y = slotY(t.row);
    const frozen = laneFreeze[t.lane] > 0;
    ctx.save();
    ctx.translate(x, y);
    if (t.type === 'turret') {
      ctx.fillStyle = frozen ? '#3a4a70' : '#2c3660';
      ctx.strokeStyle = '#7fa8ff';
    } else if (t.type === 'missile') {
      ctx.fillStyle = frozen ? '#7a5a30' : '#a56a1f';
      ctx.strokeStyle = '#ffd27f';
    } else if (t.type === 'flame') {
      ctx.fillStyle = frozen ? '#5a3a2a' : '#7a2a12';
      ctx.strokeStyle = '#ff8a5c';
    } else {
      ctx.fillStyle = frozen ? '#2a5a70' : '#1f5a7a';
      ctx.strokeStyle = '#9fe3ff';
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff4d9';
    if (t.type === 'turret') {
      ctx.fillRect(-3, -16, 6, 12);
    } else if (t.type === 'missile') {
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(6, 8); ctx.lineTo(-6, 8);
      ctx.closePath(); ctx.fill();
    } else if (t.type === 'flame') {
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.quadraticCurveTo(8, 2, 0, 10); ctx.quadraticCurveTo(-8, 2, 0, -11);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.lineTo(8, 0); ctx.lineTo(0, 11); ctx.lineTo(-8, 0);
      ctx.closePath(); ctx.fill();
    }

    if (frozen) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#bfefff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
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
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawPowerup(p) {
    const scale = 1 + Math.sin(p.pulse) * 0.08;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);

    if (p.kind === 'repair') {
      ctx.fillStyle = '#2e7d4f';
      ctx.strokeStyle = '#8bf0a8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#eafff2';
      ctx.fillRect(-2.5, -8, 5, 16);
      ctx.fillRect(-8, -2.5, 16, 5);
    } else if (p.kind === 'rocket') {
      ctx.fillStyle = '#a56a1f';
      ctx.strokeStyle = '#ffd27f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff4d9';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 7);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#7a1f1f';
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffe3e3';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + p.pulse * 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
        ctx.lineTo(Math.cos(a) * (p.radius - 2), Math.sin(a) * (p.radius - 2));
        ctx.stroke();
      }
    }
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

    if (state !== STATE.MENU) {
      drawLanes();
      drawSlots();
    }

    hazards.forEach(drawHazard);
    powerups.forEach(drawPowerup);

    bullets.forEach(b => {
      ctx.fillStyle = b.color;
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

    if (nukeFlash > 0) {
      ctx.save();
      ctx.globalAlpha = nukeFlash * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
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
  ship = { x: W / 2, y: baseY(), radius: 26, dotTicksRemaining: 0, dotTimer: 0, powerShotTimer: 0 };
  bullets = []; hazards = []; powerups = []; particles = []; towers = []; laneFreeze = new Array(LANES).fill(0);
  makeStars();

  const best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  if (best > 0) bestScoreEl.textContent = 'Best: ' + best;

  requestAnimationFrame(loop);
})();
