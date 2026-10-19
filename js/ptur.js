"use strict";

class PTUR {
  constructor(owner, x, y, angle) {
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.guideAngle = angle;
    this.canGuide = true;
    this.speed = cfg.pturSpeed || 10;
    this.alive = true;
    this.trail = [];
    this.prevDist = null;
  }

  static blastDamage(d) {
    const max = cfg.pturDmg || 100;
    if (d <= PTUR_SPLASH_FULL) return max;
    if (d <= PTUR_SPLASH_HALF) return max * 0.5;
    if (d <= PTUR_SPLASH_EDGE) return max * 0.15;
    return 0;
  }

  explode(game) {
    game.explosions.push(new Explosion(this.x * CELL, this.y * CELL));
    game.emitSound(this.x, this.y, "explosion", null);
    playExplosion(calcPanForPlayer(this.x, this.y, game));
    // Разлёт осколков от удара ПТУР (10 сек)
    if (game.wallParticles) {
      const n = 6 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2);
        game.wallParticles.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(a) * rnd(1.5, 5),
          vy: Math.sin(a) * rnd(1.5, 5),
          type: "debris",
          life: 6 + Math.random() * 4,
          maxLife: 10,
          color: "#3a3a1a",
        });
      }
    }
    for (const tank of game.tanks) {
      if (!tank.alive) continue;
      if (tank === this.owner && !cfg.selfDmg) continue;
      if (tank.isBaseObj && this.owner && this.owner.isAlly(tank))
        continue; // своя база не страдает
      if (
        !cfg.teamKill &&
        this.owner &&
        this.owner.isAlly(tank) &&
        !tank.isBaseObj
      )
        continue;
      const d = dist({ x: this.x, y: this.y }, { x: tank.x, y: tank.y });
      const dmg = PTUR.blastDamage(d);
      if (dmg > 0) tank.takeHPDamage(dmg, game, this.owner);
    }
    this.alive = false;
  }

  update(dt, game) {
    const totalDist = this.speed * dt;
    const steps = Math.max(1, Math.ceil(totalDist / 0.3));
    const stepDist = totalDist / steps;
    const maxTurn = (PTUR_MAX_TURN * dt) / steps; // макс поворот за один подшаг
    for (let s = 0; s < steps; s++) {
      if (this.canGuide && this._beamClose !== false) {
        // Ограничиваем угловую скорость — инерция ракеты
        let diff = this.guideAngle - this.angle;
        // Нормализуем diff в -π..+π
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) <= maxTurn) this.angle = this.guideAngle;
        else this.angle += Math.sign(diff) * maxTurn;
      }
      this.x += Math.cos(this.angle) * stepDist;
      this.y += Math.sin(this.angle) * stepDist;
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 20) this.trail.shift();
      // Дымный след ПТУР — позади ракеты, мелкий
      if (game.wallParticles && Math.random() < 0.5) {
        const trailX = this.x - Math.cos(this.angle) * 0.35;
        const trailY = this.y - Math.sin(this.angle) * 0.35;
        const a = this.angle + Math.PI + rnd(-0.25, 0.25);
        game.wallParticles.push({
          x: trailX,
          y: trailY,
          vx: Math.cos(a) * rnd(0.1, 0.4),
          vy: Math.sin(a) * rnd(0.1, 0.4),
          type: "exhaust",
          life: 4.5 + Math.random() * 1.0,
          maxLife: 5.5,
          color: "#4a4a4a",
          small: true,
        });
      }

      // canGuide: лазер активен И нет стены между владельцем и ПТУР
      if (this.owner.laserContinuous || this.owner.renderLaserLife > 0)
        this.canGuide = !game.segmentHitsWall(
          this.x,
          this.y,
          this.owner.x,
          this.owner.y,
        );
      else {
        this.canGuide = false;
        this._beamClose = false;
      }

      const cx = Math.floor(this.x),
        cy = Math.floor(this.y);
      if (cx < 0 || cy < 0 || cx >= game.mapW || cy >= game.mapH) {
        this.explode(game);
        return;
      }
      if (game.map[cy][cx] === 1) {
        // Проверяем не попали ли в базу (ворота в стене)
        let hitBase = false;
        if (cfg.assault && game.bases) {
          for (const base of game.bases) {
            if (!base.alive) continue;
            // Попадание в клетку ворот (плоский объект в стене)
            const gateY = base.y < 2 ? 0 : game.mapH - 1;
            const gsX = Math.round(base.x - 1.5);
            const hitRow = Math.floor(this.y) === gateY;
            const hitCol =
              Math.floor(this.x) >= gsX && Math.floor(this.x) <= gsX + 3;
            if (hitRow && hitCol) {
              base.takeHPDamage(PTUR.blastDamage(0), game, this.owner);
              hitBase = true;
              break;
            }
          }
        }
        this.explode(game);
        return;
      }

      // Проверка радиовзрывателя — пересечение отрезка шага с окружностью вокруг танка
      // Это ловит быстрые ракеты которые "проскакивают" танк за один шаг
      const px0 = this.x - Math.cos(this.angle) * stepDist; // позиция до шага
      const py0 = this.y - Math.sin(this.angle) * stepDist;
      // Вспомогательная функция: дистанция от отрезка до точки
      const segDist = (tx, ty) => {
        const dx = this.x - px0,
          dy = this.y - py0;
        const lenSq = dx * dx + dy * dy;
        let t2 =
          lenSq > 0 ? ((tx - px0) * dx + (ty - py0) * dy) / lenSq : 0;
        t2 = Math.max(0, Math.min(1, t2));
        return dist(
          { x: px0 + t2 * dx, y: py0 + t2 * dy },
          { x: tx, y: ty },
        );
      };

      // ── Радиовзрыватель ──────────────────────────────────────────────────
      // Умный ПТУР: подрыв только в точке минимального сближения
      //   (расстояние перестало уменьшаться → цель миновали)
      // Обычный ПТУР: подрывается как только d < PROX_FUSE_RANGE,
      //   и реагирует на стены тоже

      // Проверка стен для обычного взрывателя
      if (!cfg.smartPtur) {
        // Проверяем стены в радиусе PROX_FUSE_RANGE вокруг текущей позиции
        const wallCheckR = PROX_FUSE_RANGE;
        const wx0 = Math.floor(this.x - wallCheckR),
          wx1 = Math.floor(this.x + wallCheckR);
        const wy0 = Math.floor(this.y - wallCheckR),
          wy1 = Math.floor(this.y + wallCheckR);
        outer: for (let wy = wy0; wy <= wy1; wy++)
          for (let wx = wx0; wx <= wx1; wx++) {
            if (wx < 0 || wy < 0 || wx >= game.mapW || wy >= game.mapH)
              continue;
            if (game.map[wy][wx] !== 1) continue;
            // Дистанция от ПТУР до ближайшей точки клетки стены
            const nearX = Math.max(wx, Math.min(this.x, wx + 1));
            const nearY = Math.max(wy, Math.min(this.y, wy + 1));
            if (
              dist({ x: this.x, y: this.y }, { x: nearX, y: nearY }) <
              PROX_FUSE_RANGE
            ) {
              this.explode(game);
              return;
            }
          }
      }

      // Проверка по танкам
      for (const tank of game.tanks) {
        if (!tank.alive) continue;
        if (tank === this.owner) continue;
        const d = segDist(tank.x, tank.y);
        if (d >= PROX_FUSE_RANGE) continue;

        if (cfg.smartPtur) {
          // Умный: следим за расстоянием до конкретного танка
          // Если расстояние начало расти (или равно) — точка сближения пройдена → взрыв
          const key = "_pd_" + tank.id;
          const prev = this[key];
          this[key] = d;
          if (prev !== undefined && d >= prev) {
            // Сближение прекратилось — подрыв
            this.explode(game);
            return;
          }
          // Ещё сближаемся — ждём
        } else {
          // Обычный: подрывается сразу как d < PROX_FUSE_RANGE
          this.explode(game);
          return;
        }
      }

      // ПРО: перехват вражеских ПТУРов
      if (cfg.pturVsPtur) {
        for (const other of game.pturs) {
          if (other === this || !other.alive) continue;
          if (other.owner === this.owner) continue;
          const d = dist(
            { x: this.x, y: this.y },
            { x: other.x, y: other.y },
          );
          if (d < PROX_FUSE_RANGE * 0.6) {
            other.explode(game);
            this.explode(game);
            return;
          }
        }
      }
    }
  }

  // Обновить наведение: turretAngle — угол башни (рад), laserEndX/Y — конец луча (клетки)
  guide(turretAngle, laserEndX, laserEndY) {
    // Проверяем: проходит ли лазерный луч рядом с ПТУР?
    // Луч идёт от стрелка (owner) до laserEndX/Y.
    // Считаем ближайшее расстояние от ПТУР до этого отрезка.
    const ox = this.owner.x,
      oy = this.owner.y;
    const dx = laserEndX - ox,
      dy = laserEndY - oy;
    const lenSq = dx * dx + dy * dy;
    let beamDist = 9999;
    if (lenSq > 0.001) {
      let t = ((this.x - ox) * dx + (this.y - oy) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      beamDist = dist(
        { x: ox + t * dx, y: oy + t * dy },
        { x: this.x, y: this.y },
      );
    }
    // Наведение только если луч проходит достаточно близко
    if (beamDist <= PTUR_BEAM_GUIDE_RADIUS) {
      this.guideAngle = turretAngle;
      this._beamClose = true;
    } else {
      this._beamClose = false;
    }
  }
}

