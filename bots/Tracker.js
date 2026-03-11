/**
 * Tracker — стационарная зенитная установка.
 * Держит непрерывный лазер на цели, стреляет ПТУРами.
 * Использует экстраполяцию позиции цели между обновлениями умного лазера.
 */
class Tracker extends Tank {
  mode = "scan";
  scanAngle = 0;

  lockAngle = 0; // угол на цель (0..360)
  lockDist = 0; // дистанция (клетки)
  lockSpeed = 0; // скорость цели (клетки/сек)
  lockMovDir = 0; // направление движения цели (радианы canvas)
  lockLost = 0; // тиков подряд без попадания лазером
  _shotCD = 0;
  _hasTarget = false; // есть ли актуальный контакт с целью

  constructor() {
    super(...arguments);
  }
  static get botName() {
    return "Tracker";
  }

  main() {
    this.stop();
    this._shotCD = Math.max(0, this._shotCD - 1);

    if (this.mode === "scan") {
      this._doScan();
    } else {
      this._doLock();
    }
  }

  _doScan() {
    this.disableContinuousLaser();
    this.scanAngle = (this.scanAngle + 7) % 360;
    this.setGunDegree(this.scanAngle);
    this.impulseScan();
  }

  _doLock() {
    // Экстраполяция: двигаем lockAngle по вектору скорости цели между обновлениями
    const dt = 0.1;
    if (this.lockSpeed > 0.1 && !this._hasTarget) {
      // Цель не видна в этом тике — экстраполируем
      const lockRad = degToRad(this.lockAngle);
      const cx = Math.cos(lockRad) * this.lockDist;
      const cy = Math.sin(lockRad) * this.lockDist;
      const nx = cx + Math.cos(this.lockMovDir) * this.lockSpeed * dt;
      const ny = cy + Math.sin(this.lockMovDir) * this.lockSpeed * dt;
      this.lockAngle = normDeg(Math.atan2(ny, nx));
      this.lockDist = Math.sqrt(nx * nx + ny * ny);
    }

    // Держим лазер и башню на lockAngle
    this.enableContinuousLaser();
    this.setGunDegree(this.lockAngle);

    // Стреляем если есть контакт и ПТУР готов
    if (
      this._hasTarget &&
      this.getCurrentInfo().pturReady &&
      this._shotCD === 0
    ) {
      this.fire();
      this._shotCD = 8;
      this.say("Пуск! Д=" + Math.round(this.lockDist));
    }

    // Считаем потерю
    if (!this._hasTarget) {
      this.lockLost++;
    } else {
      this.lockLost = 0;
    }

    // Сбрасываем флаг — onLaserScan поставит его снова если попадёт
    this._hasTarget = false;

    if (this.lockLost > 30) {
      this.say("Цель потеряна. Сканирую.");
      this.disableContinuousLaser();
      this.mode = "scan";
      this.scanAngle = this.lockAngle;
      this.lockSpeed = 0;
    }
  }

  // Вызывается движком каждые 0.2с пока непрерывный лазер попадает в цель
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
      this.say(
        "Захват! Д=" +
          Math.round(info.distance) +
          (info.targetSpeed !== null
            ? " V=" + info.targetSpeed.toFixed(1)
            : ""),
      );
      this._hasTarget = true;
      this.lockLost = 0;
      this.mode = "lock";
    }
  }

  onLaserDetection(info) {
    const src = info.find((s) => s.hostile);
    if (!src || this.mode === "lock") return;
    this.say("Засечён лазер!");
    this.lockAngle = src.degree;
    this.lockDist = 8;
    this.lockSpeed = 0;
    this.lockLost = 0;
    this._hasTarget = false;
    this.mode = "lock";
  }

  onDamage() {
    this.fireSmoke();
    this.say(this.mode === "lock" ? "Урон! Держу захват." : "Урон!");
  }
}
