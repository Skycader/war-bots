"use strict";

// ═══════════════════ ОБЪЕКТЫ МИРА ═══════════════════
class SmokeCloud {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.life = SMOKE_DURATION;
    this.maxLife = SMOKE_DURATION;
    this.growing = true;
  }
  get radius() {
    const age = this.maxLife - this.life;
    if (age < SMOKE_GROW_TIME)
      return SMOKE_MAX_RADIUS * (age / SMOKE_GROW_TIME); // растёт
    const fadeStart = SMOKE_DURATION - SMOKE_GROW_TIME;
    if (this.life < SMOKE_GROW_TIME)
      return SMOKE_MAX_RADIUS * (this.life / SMOKE_GROW_TIME); // тает
    return SMOKE_MAX_RADIUS; // максимум
  }
  update(dt) {
    this.life -= dt;
  }
  alive() {
    return this.life > 0;
  }
  contains(x, y) {
    return Math.hypot(x - this.x, y - this.y) < this.radius;
  }
}

// Летящая дымовая граната
class SmokeGrenade {
  constructor(x, y, angle, game) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.dist = 0;
    this.alive = true;
    this.vx = Math.cos(angle) * SMOKE_GRENADE_SPD;
    this.vy = Math.sin(angle) * SMOKE_GRENADE_SPD;
  }
  update(dt, game) {
    if (!this.alive) return;
    const step = SMOKE_GRENADE_SPD * dt;
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    this.dist += step;
    // Блокируется стенами
    if (game.isBlocked(nx, ny) || this.dist >= SMOKE_GRENADE_DIST) {
      this.alive = false;
      game.smokes.push(new SmokeCloud(this.x, this.y));
      // Звук — глухой хлопок
      playSmokeExplosion(calcPanForPlayer(this.x, this.y, game));
      // Искры — короткие белые/оранжевые брызги
      if (game.wallParticles) {
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2,
            spd = rnd(1.5, 4);
          game.wallParticles.push({
            x: this.x,
            y: this.y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            type: "spark",
            life: 0.15 + Math.random() * 0.2,
            maxLife: 0.35,
            color: `hsl(${Math.random() < 0.5 ? 45 : 0},100%,80%)`,
          });
        }
      }
      return;
    }
    this.x = nx;
    this.y = ny;
  }
}

class LaserDot {
  constructor(x, y, isEnemy, inSmoke) {
    this.x = x;
    this.y = y;
    this.isEnemy = isEnemy;
    this.inSmoke = inSmoke;
    // Красные точки (попадание в танк) живут максимум 5 сек,
    // чтобы не засорять карту при wallDotLife=99999
    const base = cfg.wallDotLife || 5;
    this.life = isEnemy ? Math.min(base, 5) : base;
    this.maxLife = this.life;
  }
  update(dt) {
    this.life -= dt;
  }
  alive() {
    return this.life > 0;
  }
}

// Постоянные обломки — живут до конца боя (alive() всегда true)
class Debris {
  constructor(x, y, angle, type, color) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.type = type; // 'turret' | 'chunk'
    this.color = color;
    this.vx = 0;
    this.vy = 0;
    this.va = 0;
    this.settled = false;
    this.life = 1.0;
    this.alpha = 0.85;
  }
  update(dt) {
    if (this.settled) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.va * dt;
    this.vx *= Math.pow(0.15, dt);
    this.vy *= Math.pow(0.15, dt);
    this.va *= Math.pow(0.1, dt);
    this.life = Math.max(0, this.life - dt * 0.8);
    if (Math.abs(this.vx) < 0.02 && Math.abs(this.vy) < 0.02)
      this.settled = true;
  }
  alive() {
    return true;
  }
}

// Горение корпуса — дым и огонь 30 сек после уничтожения
class WreckFire {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.burnLife = 30.0; // 30 сек горения
    this.smokeTime = 0;
    this.fireTime = 0;
    this.particles = []; // частицы дыма/огня
  }
  update(dt) {
    this.burnLife -= dt;
    this.smokeTime -= dt;
    this.fireTime -= dt;
    // Спавним дым — каждые 0.15 сек пока горит
    if (this.smokeTime <= 0 && this.burnLife > 0) {
      this.smokeTime = 0.12 + Math.random() * 0.08;
      // Тип: fire (первые 3 сек) или smoke
      const isFire = this.burnLife > 27;
      this.particles.push({
        x: this.x + (Math.random() - 0.5) * 0.3,
        y: this.y + (Math.random() - 0.5) * 0.15,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.8 - Math.random() * 0.6, // вверх (Y вверх в мировых координатах = вниз в canvas — нет, y растёт вниз)
        life: isFire
          ? 0.5 + Math.random() * 0.3
          : 1.2 + Math.random() * 0.8,
        maxLife: isFire ? 0.8 : 2.0,
        r: isFire ? 2.5 : 3.5 + Math.random() * 2,
        isFire,
      });
    }
    // Обновляем частицы
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.7, dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
  alive() {
    return this.burnLife > 0 || this.particles.length > 0;
  }
}

// ═══════════════════ БАЗА (РЕЖИМ ШТУРМ) ═══════════════════
// Наследует Tank — получает broadcast(), onRadio(), onLaserDetection(), onDamage().
// Стоит неподвижно по центру своей стены, встроена в границу карты.
// Частицы от удара о стену: осколки (долгие) и искры (короткие)
class WallParticle {
  constructor(x, y, vx, vy, type) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.type = type; // 'debris' | 'spark'
    this.life =
      type === "spark"
        ? 0.3 + Math.random() * 0.2
        : 6 + Math.random() * 4;
    this.maxLife = this.life;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(type === "spark" ? 0.6 : 0.2, dt);
    this.vy *= Math.pow(this.type === "spark" ? 0.6 : 0.2, dt);
    this.life -= dt;
  }
  alive() {
    return this.life > 0;
  }
}

class Explosion {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.life = 0.55;
    this.maxLife = 0.55;
    this.particles = [];
    for (let i = 0; i < 14; i++) {
      const a = rnd(0, Math.PI * 2),
        sp = rnd(0.8, 3.5);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rnd(1.5, 4),
        life: rnd(0.2, 0.55),
        maxLife: 0.55,
        color: `hsl(${rndInt(10, 45)},100%,${rndInt(50, 75)}%)`,
      });
    }
  }
  update(dt) {
    this.life -= dt;
    for (const p of this.particles) {
      p.x += p.vx * dt * CELL;
      p.y += p.vy * dt * CELL;
      p.life -= dt;
      p.vx *= 0.88;
      p.vy *= 0.88;
    }
  }
  alive() {
    return this.life > 0;
  }
}

