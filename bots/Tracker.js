/**
 * Tracker — стационарная зенитная установка.
 *
 * Физика честная: лазер на башне, башня поворачивается постепенно.
 *
 * Алгоритм удержания захвата:
 * Каждый тик когда непрерывный лазер попадает в цель — получаем
 * её скорость и угол движения (умный лазер). Экстраполируем позицию
 * цели на следующий тик и разворачиваем башню туда.
 * Пока захват жив — обновляем угол каждый тик через onLaserScan.
 */
class Tracker extends Tank {
  mode = "scan";
  scanAngle = 0;

  // Данные о цели
  lockAngle = 0; // угол на цель (0..360)
  lockDist = 0; // дистанция (клетки)
  lockSpeed = 0; // скорость цели (клетки/сек)
  lockMovDir = 0; // направление движения цели (радианы canvas)
  lockLost = 0; // тиков без контакта (лазер уже смотрит туда но цели нет)
  _shotCD = 0;
  _lastScanHit = false; // попал ли лазер в цель на прошлом тике

  constructor() {
    super(...arguments);
  }
  static get botName() {
    return "Tracker";
  }

  main() {
    this.stop();
    this._shotCD = Math.max(0, this._shotCD - 1);
    this._lastScanHit = false; // сбросится в onLaserScan если попали

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
    this.impulseScan(); // onLaserScan переключит в lock если найдёт врага
  }

  _doLock() {
    this.enableContinuousLaser();

    // Экстраполяция: предсказываем куда сдвинется цель за 1 тик (~0.1 сек)
    // на основе последних известных скорости и направления
    const dt = 0.1; // примерный интервал тика
    if (this.lockSpeed > 0.1) {
      // Текущий вектор до цели
      const lockRad = degToRad(this.lockAngle);
      const cx = Math.cos(lockRad) * this.lockDist;
      const cy = Math.sin(lockRad) * this.lockDist;
      // Куда сдвинется цель за dt
      const nx = cx + Math.cos(this.lockMovDir) * this.lockSpeed * dt;
      const ny = cy + Math.sin(this.lockMovDir) * this.lockSpeed * dt;
      // Новый угол на предсказанную позицию
      this.lockAngle = normDeg(Math.atan2(ny, nx));
      // Обновляем дистанцию
      this.lockDist = Math.sqrt(nx * nx + ny * ny);
    }

    this.setGunDegree(this.lockAngle);

    // Считаем потерю только если башня уже смотрит в нужную сторону
    const gunDiff = Math.abs(
      ((this.getGunDegree() - this.lockAngle + 540) % 360) - 180,
    );
    if (gunDiff < 5) {
      if (!this._lastScanHit) this.lockLost++;
      else this.lockLost = 0;
    }

    // Стреляем когда прицелились и цель видна
    if (
      gunDiff < 5 &&
      this._lastScanHit &&
      this.getCurrentInfo().pturReady &&
      this._shotCD === 0
    ) {
      this.fire();
      this._shotCD = 8;
      this.say("Пуск! Д=" + Math.round(this.lockDist));
    }

    if (this.lockLost > 25) {
      this.say("Цель потеряна. Сканирую.");
      this.disableContinuousLaser();
      this.mode = "scan";
      this.scanAngle = this.lockAngle;
    }
  }

  onLaserScan(info) {
    if (!info.isHostile || info.isDead) return;

    // Лазер попал в цель — обновляем все данные
    this._lastScanHit = true;
    this.lockAngle = this.getGunDegree(); // точный угол — где башня сейчас
    this.lockDist = info.distance;

    // Обновляем вектор движения цели из умного лазера
    if (info.targetSpeed !== null && info.targetAngle !== null) {
      this.lockSpeed = info.targetSpeed;
      // targetAngle — куда едет корпус цели (градусы 0..360 canvas)
      // degToRad конвертирует обратно в радианы canvas для math
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
    this.mode = "lock";
  }

  onDamage() {
    this.fireSmoke();
    this.say(this.mode === "lock" ? "Урон! Держу захват." : "Урон!");
  }
}
