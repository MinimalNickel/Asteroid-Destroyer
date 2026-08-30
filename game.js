(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const healthBarEl = document.getElementById('healthBar');
  const healthLabelEl = document.getElementById('healthLabel');
  const scoreLabelEl = document.getElementById('scoreLabel');
  const waveLabelEl = document.getElementById('waveLabel');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');

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
  const STATE = { MENU: 'menu', PLAYING: 'playing', OVER: 'over' };
  let state = STATE.MENU;

  let ship, bullets, asteroids, particles, stars;
  let score = 0, health = 100, wave = 1;
  let spawnTimer = 0, spawnInterval = 1.6;
  let elapsed = 0;
  let screenShake = 0;
  let fireTimer = 0;
  const FIRE_COOLDOWN = 0.14;

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
      y: H - 90,
      radius: 26,
      angle: -Math.PI / 2, // pointing up
      targetAngle: -Math.PI / 2
    };
    bullets = [];
    asteroids = [];
    particles = [];
    score = 0;
    health = 100;
    wave = 1;
    spawnTimer = 0;
    spawnInterval = 1.6;
    elapsed = 0;
    screenShake = 0;
    fireTimer = 0;
    updateHud();
    makeStars();
  }

  function updateHud() {
    const pct = clamp(health, 0, 100);
    healthBarEl.style.width = pct + '%';
    if (pct > 50) healthBarEl.style.background = 'linear-gradient(90deg, #37e07a, #8bf0a8)';
    else if (pct > 25) healthBarEl.style.background = 'linear-gradient(90deg, #e0c437, #f0e08b)';
    else healthBarEl.style.background = 'linear-gradient(90deg, #e03737, #f08b8b)';
    healthLabelEl.textContent = Math.max(0, Math.round(health));
    scoreLabelEl.textContent = 'Score: ' + score;
    waveLabelEl.textContent = 'Wave ' + wave;
  }

  // ---- Asteroids ----
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

  function spawnAsteroid(size = null, x = null, y = null) {
    const tier = size || 'large';
    const radiusMap = { large: rand(34, 44), medium: rand(20, 28), small: rand(11, 16) };
    const radius = radiusMap[tier];
    let sx = x, sy = y;
    if (sx === null) {
      sx = rand(radius, W - radius);
      sy = -radius - rand(0, 120);
    }
    const speedBase = { large: 28, medium: 42, small: 60 }[tier] + wave * 2.2;
    const targetX = ship.x + rand(-140, 140);
    const targetY = ship.y;
    const ang = Math.atan2(targetY - sy, targetX - sx) + rand(-0.35, 0.35);
    asteroids.push({
      x: sx, y: sy,
      vx: Math.cos(ang) * speedBase * rand(0.7, 1.1),
      vy: Math.sin(ang) * speedBase * rand(0.7, 1.1),
      radius,
      tier,
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-1.2, 1.2),
      shape: makeAsteroidShape(radius),
      hp: tier === 'large' ? 3 : tier === 'medium' ? 2 : 1
    });
  }

  function splitAsteroid(a) {
    const next = a.tier === 'large' ? 'medium' : a.tier === 'medium' ? 'small' : null;
    if (!next) return;
    const count = 2;
    for (let i = 0; i < count; i++) {
      spawnAsteroid(next, a.x + rand(-8, 8), a.y + rand(-8, 8));
      const na = asteroids[asteroids.length - 1];
      na.vx += rand(-30, 30);
      na.vy += rand(-30, 30);
    }
  }

  function damageForTier(tier) {
    return tier === 'large' ? 26 : tier === 'medium' ? 16 : 9;
  }

  function scoreForTier(tier) {
    return tier === 'large' ? 10 : tier === 'medium' ? 20 : 35;
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

  // ---- Input ----
  function aimAt(px, py) {
    let ang = Math.atan2(py - ship.y, px - ship.x);
    // keep barrel within upper hemisphere so it never points back through the hull
    const upMin = -Math.PI + 0.12;
    const upMax = -0.12;
    if (ang > upMax) ang = upMax;
    if (ang < upMin && ang > -Math.PI) ang = upMin;
    // handle wrap for angles below +upMax but positive going down (shouldn't normally happen since atan2 range covers it)
    ship.targetAngle = ang;
  }

  function fireBullet() {
    if (fireTimer > 0) return;
    fireTimer = FIRE_COOLDOWN;
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

  function handlePointer(clientX, clientY) {
    if (state !== STATE.PLAYING) return;
    aimAt(clientX, clientY);
    fireBullet();
  }

  canvas.addEventListener('pointerdown', (e) => {
    handlePointer(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pressure === 0 && e.pointerType === 'mouse') return;
    if (state === STATE.PLAYING && e.buttons > 0) aimAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) handlePointer(t.clientX, t.clientY);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (state === STATE.PLAYING && e.touches.length) {
      aimAt(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);

  function startGame() {
    resetGame();
    state = STATE.PLAYING;
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
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
    elapsed += dt;
    if (fireTimer > 0) fireTimer -= dt;

    // wave scaling
    const newWave = 1 + Math.floor(elapsed / 18);
    if (newWave !== wave) { wave = newWave; updateHud(); }
    spawnInterval = Math.max(0.45, 1.6 - wave * 0.12);

    // turret smoothing
    let da = ship.targetAngle - ship.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    ship.angle += da * clamp(dt * 12, 0, 1);

    // spawn
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnTimer = spawnInterval;
      spawnAsteroid('large');
      if (wave >= 3 && Math.random() < 0.4) spawnAsteroid('medium');
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

    // asteroids
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rot += a.rotSpeed * dt;

      if (dist2(a.x, a.y, ship.x, ship.y) < (a.radius + ship.radius * 0.8) ** 2) {
        health -= damageForTier(a.tier);
        screenShake = 0.35;
        burst(a.x, a.y, '#ff6b6b', 20);
        asteroids.splice(i, 1);
        updateHud();
        if (health <= 0) { health = 0; updateHud(); endGame(); }
        continue;
      }

      if (a.y > H + a.radius + 40) {
        asteroids.splice(i, 1);
        continue;
      }
    }

    // collisions bullet vs asteroid
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (dist2(a.x, a.y, b.x, b.y) < (a.radius) ** 2) {
          bullets.splice(j, 1);
          a.hp -= 1;
          burst(b.x, b.y, '#8bd0ff', 6);
          if (a.hp <= 0) {
            score += scoreForTier(a.tier);
            burst(a.x, a.y, '#ffd27f', 18);
            splitAsteroid(a);
            asteroids.splice(i, 1);
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

    // hull
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

    // turret barrel
    ctx.rotate(ship.angle);
    ctx.fillStyle = '#cfe6ff';
    ctx.fillRect(0, -5, ship.radius + 20, 10);
    ctx.fillStyle = '#7fa8ff';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawAsteroid(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.beginPath();
    a.shape.forEach((p, i) => {
      const x = Math.cos(p.a) * p.r;
      const y = Math.sin(p.a) * p.r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = '#8b7d6b';
    ctx.strokeStyle = '#3f372c';
    ctx.lineWidth = 2;
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

    // background
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

    asteroids.forEach(drawAsteroid);

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
  ship = { x: W / 2, y: H - 90, radius: 26, angle: -Math.PI / 2, targetAngle: -Math.PI / 2 };
  bullets = []; asteroids = []; particles = [];
  makeStars();

  const best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  if (best > 0) bestScoreEl.textContent = 'Best: ' + best;

  requestAnimationFrame(loop);
})();
