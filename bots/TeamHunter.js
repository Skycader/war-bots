/**
 * TeamHunter — командный охотник с радиосвязью и объездом стен.
 *
 * Протокол broadcast:
 *   "TARGET:<угол>:<дист>"  — вижу врага под таким углом на такой дистанции
 *   "LASER:<угол>"          — меня облучают вон оттуда
 */
class TeamHunter extends Tank {
  static get botName() {
    return "TeamHunter";
  }
  static get botTeam() {
    return "Hunters";
  }

  mode = "patrol";

  // Патруль
  patrolDir = 0;
  patrolDist = 0;
  scanAngle = 0;
  _navTick = 0;

  // Объезд стен
  _evadeAngle = null;
  _evadeTimer = 0;

  // Захват
  lockAngle = 0;
  lockDist = 10;
  lockSpeed = 0;
  lockMovDir = 0;
  lockLost = 0;
  _hasTarget = false;
  _shotCD = 0;

  // Охота
  _huntVx = 0;
  _huntVy = 0;
  huntTimer = 0;

  _lastBroadcast = 0;

  constructor() {
    super(...arguments);
    this._pickPatrol();
  }

  // ── Утилиты ─────────────────────────────────────────────
  _pickPatrol() {
    this.patrolDir = this.getRandomDegree();
    this.patrolDist = 6 + Math.random() * 6;
  }

  _extrapolate(dt) {
    if (this.lockSpeed < 0.1) return;
    const r = degToRad(this.lockAngle);
    const cx = Math.cos(r) * this.lockDist,
      cy = Math.sin(r) * this.lockDist;
    const nx = cx + Math.cos(this.lockMovDir) * this.lockSpeed * dt;
    const ny = cy + Math.sin(this.lockMovDir) * this.lockSpeed * dt;
    this.lockAngle = normDeg(Math.atan2(ny, nx));
    this.lockDist = Math.sqrt(nx * nx + ny * ny);
  }

  _triangulate(senderAngle, senderDist, targetAngle, targetDist) {
    const sRad = degToRad(senderAngle);
    const sx = Math.cos(sRad) * senderDist;
    const sy = Math.sin(sRad) * senderDist;
    const tRad = degToRad(targetAngle);
    const tx = sx + Math.cos(tRad) * targetDist;
    const ty = sy + Math.sin(tRad) * targetDist;
    return { vx: tx, vy: ty };
  }

  _startHunt(vx, vy) {
    if (this.mode === "lock") return;
    this._huntVx = vx;
    this._huntVy = vy;
    this.huntTimer = 100;
    this.mode = "hunt";
    const angle = normDeg(Math.atan2(vy, vx));
    const d = Math.sqrt(vx * vx + vy * vy);
    this.say("Охота! " + Math.round(angle) + "° Д≈" + Math.round(d));
  }

  // Объезд стен через лазер.
  // Зондируем targetAngle — если стена близко, ищем свободный сектор.
  // Возвращает угол движения и устанавливает направление.
  _moveWithNav(targetAngle, speed) {
    const LOOK = 2.0; // клетки зондирования

    if (this._evadeTimer > 0) this._evadeTimer--;
    else this._evadeAngle = null;

    const workAngle =
      this._evadeAngle !== null ? this._evadeAngle : targetAngle;

    // Зондируем лазером по рабочему углу
    this.setGunDegree(workAngle);
    const scan = this.impulseScan();
    const blocked = scan && scan.target === "non-tank" && scan.distance < LOOK;

    if (blocked) {
      // Ищем свободный сектор веером ±120°
      let found = null;
      for (let delta = 20; delta <= 120 && found === null; delta += 20) {
        for (const sign of [-1, 1]) {
          const testAngle = (((targetAngle + sign * delta) % 360) + 360) % 360;
          this.setGunDegree(testAngle);
          const s = this.impulseScan();
          if (!s || s.target !== "non-tank" || s.distance >= LOOK) {
            found = testAngle;
            break;
          }
        }
      }
      if (found === null) found = (targetAngle + 180) % 360;
      this._evadeAngle = found;
      this._evadeTimer = 10;
      this.setDirection(found);
    } else {
      this.setDirection(workAngle);
    }
    this.setSpeed(speed);
  }

  // ── main() ──────────────────────────────────────────────
  main() {
    this._shotCD = Math.max(0, this._shotCD - 1);
    this._lastBroadcast++;

    if (this.mode === "patrol") this._doPatrol();
    else if (this.mode === "lock") this._doLock();
    else this._doHunt();
  }

  // ── ПАТРУЛЬ ─────────────────────────────────────────────
  _doPatrol() {
    this.disableContinuousLaser();
    if (this.patrolDist > 0) {
      this.patrolDist -= 0.1;
      // Чётные тики: _moveWithNav зондирует путь башней
      // Нечётные: сканируем в поисках врага
      this._navTick = (this._navTick + 1) % 2;
      if (this._navTick === 0) {
        this._moveWithNav(this.patrolDir, 1);
      } else {
        this.setDirection(this.patrolDir);
        this.setSpeed(1);
        this.scanAngle = (this.scanAngle + 14) % 360;
        this.setGunDegree(this.scanAngle);
        this.impulseScan();
      }
    } else {
      this.stop();
      this._pickPatrol();
    }
  }

  // ── ЗАХВАТ ──────────────────────────────────────────────
  _doLock() {
    this.stop();
    this.enableContinuousLaser();
    if (!this._hasTarget) this._extrapolate(0.1);
    this.setGunDegree(this.lockAngle);

    const gunDiff = Math.abs(
      ((this.getGunDegree() - this.lockAngle + 540) % 360) - 180,
    );
    if (!this._hasTarget) {
      if (gunDiff < 4) this.lockLost++;
    } else this.lockLost = 0;

    if (
      gunDiff < 5 &&
      this._hasTarget &&
      this.getCurrentInfo().pturReady &&
      this._shotCD === 0
    ) {
      this.fire();
      this._shotCD = 8;
      this.say("Огонь! Д=" + Math.round(this.lockDist));
    }

    if (this._hasTarget && this._lastBroadcast >= 5) {
      this._lastBroadcast = 0;
      this.broadcast(
        `TARGET:${Math.round(this.lockAngle)}:${this.lockDist.toFixed(1)}`,
      );
    }

    this._hasTarget = false;

    if (this.lockLost > 25) {
      this.say("Цель потеряна. Патруль.");
      this.disableContinuousLaser();
      this.mode = "patrol";
      this._pickPatrol();
      this.lockSpeed = 0;
    }
  }

  // ── ОХОТА ───────────────────────────────────────────────
  _doHunt() {
    this.huntTimer--;
    if (this.huntTimer <= 0) {
      this.say("Не нашёл. Патруль.");
      this.disableContinuousLaser();
      this.mode = "patrol";
      this._pickPatrol();
      return;
    }

    const huntAngle = normDeg(Math.atan2(this._huntVy, this._huntVx));
    const huntDist = Math.sqrt(
      this._huntVx * this._huntVx + this._huntVy * this._huntVy,
    );

    if (huntDist > 2) {
      const spd = Math.min(3, huntDist * 0.5);
      this._moveWithNav(huntAngle, spd);

      // Обновляем вектор — вычитаем пройденное
      const moved = this.getCurrentInfo().speed * 0.1;
      const myRad = degToRad(this.getDirection());
      this._huntVx -= Math.cos(myRad) * moved;
      this._huntVy -= Math.sin(myRad) * moved;
    } else {
      // На месте — ищем башней
      this.stop();
      const sweep = huntAngle + Math.sin(this.huntTimer * 0.25) * 40;
      this.setGunDegree(sweep);
      this.impulseScan();
    }
  }

  // ── CALLBACKS ────────────────────────────────────────────
  onLaserScan(info) {
    if (!info.isHostile || info.isDead) return;
    this._hasTarget = true;
    this.lockAngle = this.getGunDegree();
    this.lockDist = info.distance;
    if (info.targetSpeed !== null && info.targetAngle !== null) {
      this.lockSpeed = info.targetSpeed;
      this.lockMovDir = degToRad(info.targetAngle);
    }
    if (this.mode !== "lock") {
      this.say("Захват! Д=" + Math.round(info.distance));
      this.lockLost = 0;
      this.mode = "lock";
    }
  }

  onLaserDetection(info) {
    const src = info.find((s) => s.hostile);
    if (!src) return;
    this.broadcast(`LASER:${Math.round(src.degree)}`);
    this.say("СПО! " + Math.round(src.degree) + "°");
    if (this.mode !== "lock") {
      this.fireSmoke();
      const estDist = 10;
      const r = degToRad(src.degree);
      this._startHunt(Math.cos(r) * estDist, Math.sin(r) * estDist);
    }
  }

  onRadio(messages) {
    for (const msg of messages) {
      if (!msg.fromTeam || !msg.message) continue;
      const parts = msg.message.split(":");
      const type = parts[0];

      if (type === "TARGET" && parts.length >= 3) {
        const targetAngle = parseFloat(parts[1]);
        const targetDist = parseFloat(parts[2]);
        if (isNaN(targetAngle) || isNaN(targetDist)) continue;
        const v = this._triangulate(
          msg.angle,
          msg.dist,
          targetAngle,
          targetDist,
        );
        this.say("📡Цель " + Math.round(normDeg(Math.atan2(v.vy, v.vx))) + "°");
        this._startHunt(v.vx, v.vy);
      } else if (type === "LASER" && parts.length >= 2) {
        const laserAngle = parseFloat(parts[1]);
        if (isNaN(laserAngle)) continue;
        const estDist = msg.dist * 0.8;
        const v = this._triangulate(msg.angle, msg.dist, laserAngle, estDist);
        this.say("⚡СПО " + Math.round(normDeg(Math.atan2(v.vy, v.vx))) + "°");
        this._startHunt(v.vx, v.vy);
      }
    }
  }

  onDamage() {
    this.fireSmoke();
    if (this._lastBroadcast > 3)
      this.broadcast(`LASER:${Math.round(this.getGunDegree())}`);
    this.say(this.mode === "lock" ? "Урон! Держу цель." : "Урон!");
  }
}
