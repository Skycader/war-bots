/**
 * Terminator v4 — Умный штурмовик с самоидентификацией.
 *
 * teamIndex 0,1 → Охранник — патрулирует у базы
 * teamIndex 2+  → Штурмовик — идёт к базе врага
 *
 * При BASE_ATTACK — все возвращаются защищать базу (8 сек).
 * База ищется по вектору (dead reckoning), не по устаревшему углу.
 */
class Terminator extends Tank {
  static get botName() {
    return "Terminator";
  }
  static get botTeam() {
    return "Terminators";
  }

  scanAngle = 0;

  // Вектор до своей базы (обновляется dead reckoning)
  _homeVx = null; // null = не знаем
  _homeVy = null;
  _homeKnown = false;
  _askHomeTimer = 0;

  // База врага
  _enemyBaseAngle = null;
  _enemyBaseDist = null;

  // Захват танка (охранники)
  lockAngle = 0;
  lockDist = 10;
  lockSpeed = 0;
  lockMovDir = 0;
  lockLost = 0;
  _hasTarget = false;
  _shotCD = 0;

  // Тревога — все едут к базе
  _alarmTimer = 0;

  // Навигация
  _navEvade = null;
  _navTimer = 0;

  constructor() {
    super(...arguments);
  }

  _isGuard() {
    return this.getCurrentInfo().teamIndex <= 1;
  }

  // Угол и дистанция до своей базы из вектора
  _homeAngle() {
    if (this._homeVx === null) return null;
    return normDeg(Math.atan2(this._homeVy, this._homeVx));
  }
  _homeDist() {
    if (this._homeVx === null) return 999;
    return Math.sqrt(this._homeVx * this._homeVx + this._homeVy * this._homeVy);
  }

  // Обновить вектор до базы — вычесть пройденное
  _updateHomeVector() {
    if (this._homeVx === null) return;
    const dt = 0.1;
    const moved = this.getCurrentInfo().speed * dt;
    const myRad = degToRad(this.getDirection());
    this._homeVx -= Math.cos(myRad) * moved;
    this._homeVy -= Math.sin(myRad) * moved;
  }

  main() {
    this._shotCD = Math.max(0, this._shotCD - 1);
    this._updateHomeVector();

    // Запрашиваем базу если не знаем
    this._askHomeTimer--;
    if (this._askHomeTimer <= 0 && !this._homeKnown) {
      this.broadcast("BASE_WHERE");
      this._askHomeTimer = 80;
    }

    // Тревога — едем к базе
    if (this._alarmTimer > 0) {
      this._alarmTimer--;
      this._doRetreat();
      return;
    }

    if (this._isGuard()) this._doGuard();
    else this._doAssault();
  }

  _doGuard() {
    this.disableContinuousLaser();
    const hd = this._homeDist();

    // Слишком далеко — возвращаемся
    if (hd > 8 && this._homeKnown) {
      this._moveNav(this._homeAngle(), 2);
      this._updateHomeVector();
      return;
    }

    // Патруль + скан
    this.scanAngle = (this.scanAngle + 8) % 360;
    this.setGunDegree(this.scanAngle);
    this.impulseScan();
    const circleDir = (this.scanAngle + 90) % 360;
    this._moveNav(circleDir, 1);
    this._updateHomeVector();

    if (this._hasTarget) this._doLockFire();
  }

  _doAssault() {
    this.disableContinuousLaser();
    const info = this.getCurrentInfo();

    if (info.pturAmmo === 0) {
      this._doRetreat();
      return;
    }

    if (this._enemyBaseAngle !== null && this._enemyBaseDist < 6) {
      this.stop();
      this.enableContinuousLaser();
      this.setGunDegree(this._enemyBaseAngle);
      const diff = Math.abs(
        ((this.getGunDegree() - this._enemyBaseAngle + 540) % 360) - 180,
      );
      if (diff < 5 && info.pturReady && this._shotCD === 0) {
        this.fire();
        this._shotCD = 4;
        this.say("Огонь по базе!");
      }
      return;
    }

    const dir = this._enemyBaseAngle ?? this.getDirection();
    this._moveNav(dir, 3);
    this._updateHomeVector();

    const scanOff = Math.sin(Date.now() / 800) * 30;
    this.setGunDegree((((dir + scanOff) % 360) + 360) % 360);
    this.impulseScan();
  }

  _doRetreat() {
    this.disableContinuousLaser();
    const hd = this._homeDist();

    if (this._homeKnown && hd < 3) {
      // Дошли до базы
      const info = this.getCurrentInfo();
      if (info.pturAmmo >= 5 || !this._isGuard()) {
        this.say("На базе.");
        this._alarmTimer = 0;
      }
      return;
    }

    if (this._homeKnown) {
      this._moveNav(this._homeAngle(), 4);
      this._updateHomeVector();
    } else {
      if (this._askHomeTimer <= 0) {
        this.broadcast("BASE_WHERE");
        this._askHomeTimer = 40;
      }
      this.stop();
    }
  }

  _doLockFire() {
    this.stop();
    this.enableContinuousLaser();
    this.setGunDegree(this.lockAngle);
    const diff = Math.abs(
      ((this.getGunDegree() - this.lockAngle + 540) % 360) - 180,
    );
    if (
      diff < 5 &&
      this._hasTarget &&
      this.getCurrentInfo().pturReady &&
      this._shotCD === 0
    ) {
      this.fire();
      this._shotCD = 8;
    }
    this._hasTarget = false;
    if (++this.lockLost > 20) {
      this.disableContinuousLaser();
      this.lockLost = 0;
    }
  }

  _moveNav(targetAngle, speed) {
    if (this._navTimer > 0) this._navTimer--;
    else this._navEvade = null;
    const work = this._navEvade ?? targetAngle;
    this.setGunDegree(work);
    const scan = this.impulseScan();
    const blocked = scan && scan.target === "non-tank" && scan.distance < 2;
    const tankFwd =
      scan && scan.target === "tank" && scan.isHostile && scan.distance < 4;
    if (blocked || tankFwd) {
      let found = null;
      for (let d = 20; d <= 150 && !found; d += 20)
        for (const s of [-1, 1]) {
          const a = (((targetAngle + s * d) % 360) + 360) % 360;
          this.setGunDegree(a);
          const sc = this.impulseScan();
          if (!sc || sc.distance >= 2) {
            found = a;
            break;
          }
        }
      this._navEvade = found ?? (targetAngle + 180) % 360;
      this._navTimer = 15;
    }
    this.setDirection(this._navEvade ?? work);
    this.setSpeed(speed);
  }

  onLaserScan(info) {
    if (info.isHostile && !info.isDead && info.target === "non-tank") {
      this._enemyBaseAngle = this.getGunDegree();
      this._enemyBaseDist = info.distance;
      this.say("База врага! Д=" + Math.round(info.distance));
      return;
    }
    if (info.isHostile && !info.isDead) {
      this._hasTarget = true;
      this.lockAngle = this.getGunDegree();
      this.lockDist = info.distance;
      this.lockLost = 0;
      if (info.targetSpeed !== null && info.targetAngle !== null) {
        this.lockSpeed = info.targetSpeed;
        this.lockMovDir = degToRad(info.targetAngle);
      }
    }
  }

  onRadio(messages) {
    for (const msg of messages) {
      if (msg.fromTeam && msg.message === "BASE_HERE") {
        // Вектор до базы — от отправителя (движок даёт angle+dist до него)
        // База ответила — она находится от меня под углом msg.angle на msg.dist
        const r = degToRad(msg.angle);
        this._homeVx = Math.cos(r) * msg.dist;
        this._homeVy = Math.sin(r) * msg.dist;
        this._homeKnown = true;
      }

      if (!msg.fromTeam || !msg.message) continue;

      if (
        msg.message.startsWith("BASE_ATTACK") ||
        msg.message === "BASE_LOW_HP"
      ) {
        this.say("Тревога! На базу!");
        this._alarmTimer = 80;
      }
      if (msg.message === "BASE_DESTROYED") {
        this.say("База пала. Штурм!");
        this._alarmTimer = 0;
      }
    }
  }

  onLaserDetection(info) {
    const src = info.find((s) => s.hostile);
    if (!src) return;
    if (!this._isGuard()) {
      this.fireSmoke();
      this._navEvade = (src.degree + 90) % 360;
      this._navTimer = 12;
    }
  }

  onDamage() {
    this.fireSmoke();
  }
}
