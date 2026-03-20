/**
 * Guardian — защитник базы.
 * patrol → lock | rush → hunt → lock
 * Никогда не зависает: таймаут на каждый режим.
 */
class Guardian extends Tank {
  static get botName() {
    return "Guardian";
  }
  static get botTeam() {
    return "Defenders";
  }

  mode = "patrol";
  scanAngle = 0;
  _modeTimer = 0;

  // База (dead reckoning)
  _homeVx = null;
  _homeVy = null;
  _homeKnown = false;
  _askTimer = 0;

  // Захват
  lockAngle = 0;
  lockDist = 10;
  lockSpeed = 0;
  lockMovDir = 0;
  lockLost = 0;
  _hasTarget = false;
  _shotCD = 0;

  // Тревога
  _threatAngle = null;

  // Навигация
  _navEvade = null;
  _navTimer = 0;
  _patrolA = 0;

  _updateHomeVec() {
    if (this._homeVx === null) return;
    const moved = this.getCurrentInfo().speed * 0.1;
    const r = degToRad(this.getDirection());
    this._homeVx -= Math.cos(r) * moved;
    this._homeVy -= Math.sin(r) * moved;
  }
  _homeAngle() {
    return this._homeVx !== null
      ? normDeg(Math.atan2(this._homeVy, this._homeVx))
      : null;
  }
  _homeDist() {
    return this._homeVx !== null
      ? Math.sqrt(this._homeVx ** 2 + this._homeVy ** 2)
      : 999;
  }

  main() {
    this._shotCD = Math.max(0, this._shotCD - 1);
    this._updateHomeVec();
    if (this._modeTimer > 0) this._modeTimer--;

    this._askTimer--;
    if (this._askTimer <= 0) {
      this.broadcast("BASE_WHERE");
      this._askTimer = 60; // переспрашиваем регулярно чтобы вектор не устарел
    }

    if (this.mode === "patrol") this._doPatrol();
    else if (this.mode === "lock") this._doLock();
    else if (this.mode === "rush") this._doRush();
    else this._doHunt();
  }

  _doPatrol() {
    this.disableContinuousLaser();
    // Держимся вплотную к воротам — не дальше 2 клеток
    const ha = this._homeAngle();
    if (ha !== null && this._homeDist() > 2) {
      this._nav(ha, 2.5);
      return;
    }
    if (!this._homeKnown) {
      // Не знаем где база — просто стоим и ждём ответа
      this.stop();
      this.scanAngle = (this.scanAngle + 10) % 360;
      this.setGunDegree(this.scanAngle);
      this.impulseScan();
      return;
    }
    // У ворот: стоим и вращаем башней в сторону поля
    this.stop();
    this.scanAngle = (this.scanAngle + 10) % 360;
    this.setGunDegree(this.scanAngle);
    this.impulseScan();
  }

  _doLock() {
    this.stop();
    this.enableContinuousLaser();
    this.setGunDegree(this.lockAngle);
    const info = this.getCurrentInfo();
    const diff = Math.abs(
      ((this.getGunDegree() - this.lockAngle + 540) % 360) - 180,
    );

    if (this._hasTarget) {
      this.lockLost = 0;
      if (diff < 6 && info.pturReady && this._shotCD === 0) {
        this.fire();
        this._shotCD = 8;
        this.say("Огонь!");
      }
    } else {
      if (diff < 5) this.lockLost++;
      if (this.lockLost > 30) {
        this.disableContinuousLaser();
        this.mode = "patrol";
        this.lockLost = 0;
      }
    }
    this._hasTarget = false;
  }

  _doRush() {
    // Едем к базе, по пути активно сканируем
    const hd = this._homeDist();
    const ha = this._homeAngle();

    if (hd < 2.5 || ha === null || this._modeTimer <= 0) {
      this.stop();
      this.mode = "hunt";
      this._modeTimer = 100;
      return;
    }

    this._nav(ha, 4);
    this._updateHomeVec();

    // Сканируем башней в направлении угрозы пока едем
    if (this._threatAngle !== null) {
      const sweep = this._threatAngle + Math.sin(Date.now() / 300) * 20;
      this.setGunDegree(sweep);
      const hit = this.impulseScan();
      if (hit && hit.isHostile && !hit.isDead) {
        this._startLock(sweep, hit.distance, hit);
      }
    }
  }

  _doHunt() {
    // Стоим у ворот, активно сканируем сектор угрозы
    this.stop();
    this.disableContinuousLaser();

    // Таймаут — возврат в патруль
    if (this._modeTimer <= 0) {
      this.mode = "patrol";
      this._modeTimer = 0;
      this.say("Чисто. Патруль.");
      return;
    }

    // Сканируем сектор
    const baseAngle = this._threatAngle ?? this.scanAngle;
    const sweep = baseAngle + Math.sin(Date.now() / 400) * 50;
    this.setGunDegree(sweep);
    const hit = this.impulseScan();
    if (hit && hit.isHostile && !hit.isDead) {
      this._startLock(sweep, hit.distance, hit);
    }
  }

  _startLock(angle, dist, hit) {
    this.lockAngle = angle;
    this.lockDist = dist;
    this.lockLost = 0;
    this._hasTarget = true;
    if (hit && hit.targetSpeed !== null) {
      this.lockSpeed = hit.targetSpeed;
      this.lockMovDir = hit.targetAngle ? degToRad(hit.targetAngle) : 0;
    }
    this.mode = "lock";
    this._modeTimer = 200;
    this.say("Цель! Д=" + Math.round(dist));
  }

  _nav(targetAngle, speed) {
    if (this._navTimer > 0) this._navTimer--;
    else this._navEvade = null;
    const work = this._navEvade ?? targetAngle;
    this.setGunDegree(work);
    const sc = this.impulseScan();
    if (sc && sc.target === "non-tank" && sc.distance < 2) {
      let found = null;
      for (let d = 25; d <= 135 && !found; d += 25)
        for (const s of [-1, 1]) {
          const a = (((targetAngle + s * d) % 360) + 360) % 360;
          this.setGunDegree(a);
          const s2 = this.impulseScan();
          if (!s2 || s2.target !== "non-tank" || s2.distance >= 2) {
            found = a;
            break;
          }
        }
      this._navEvade = found ?? (targetAngle + 175) % 360;
      this._navTimer = 12;
    }
    this.setDirection(this._navEvade ?? work);
    this.setSpeed(speed);
  }

  onLaserScan(info) {
    if (!info.isHostile || info.isDead) return;
    this._startLock(this.getGunDegree(), info.distance, info);
  }

  onLaserDetection(info) {
    const src = info.find((s) => s.hostile);
    if (!src) return;
    // Немедленно разворачиваемся — не ждём тревоги от базы
    this.lockAngle = src.degree;
    this.lockDist = 8;
    this.lockLost = 0;
    this._hasTarget = false;
    this.mode = "lock";
    this._modeTimer = 150;
    this.disableContinuousLaser();
    setTimeout(() => {
      if (this.mode === "lock") this.enableContinuousLaser();
    }, 50);
    this.say("СПО! " + Math.round(src.degree) + "°");
  }

  onRadio(messages) {
    for (const msg of messages) {
      if (!msg.fromTeam || !msg.message) continue;

      if (msg.message === "BASE_HERE") {
        const r = degToRad(msg.angle);
        this._homeVx = Math.cos(r) * msg.dist;
        this._homeVy = Math.sin(r) * msg.dist;
        this._homeKnown = true;
        if (msg.dist > 2) this.say("База " + Math.round(msg.dist) + "кл →");
      }

      if (
        msg.message.startsWith("BASE_ATTACK:") ||
        msg.message === "BASE_LOW_HP"
      ) {
        let threat = null;
        if (msg.message.startsWith("BASE_ATTACK:")) {
          const deg = parseFloat(msg.message.split(":")[1]);
          if (!isNaN(deg)) {
            const sr = degToRad(msg.angle),
              tr = degToRad(deg);
            const vx = Math.cos(sr) * msg.dist + Math.cos(tr) * 10;
            const vy = Math.sin(sr) * msg.dist + Math.sin(tr) * 10;
            threat = normDeg(Math.atan2(vy, vx));
          }
        }
        this._threatAngle = threat;
        // Rush только если не в активном бою
        if (this.mode !== "lock") {
          this.mode = "rush";
          this._modeTimer = 100;
          this.disableContinuousLaser();
          this.say("Тревога! К воротам!");
        } else {
          // В бою — просто запоминаем угол угрозы
          this.say("Держу позицию!");
        }
      }

      if (msg.message === "BASE_DESTROYED") {
        this.mode = "patrol";
        this._modeTimer = 0;
        this.say("База пала. Мстить!");
      }
    }
  }

  onDamage() {
    this.fireSmoke();
    this.say(this.mode === "lock" ? "Урон! Держу." : "Урон!");
  }
}
