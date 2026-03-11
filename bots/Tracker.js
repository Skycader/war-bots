/**
 * Tracker — стационарная зенитная установка.
 *
 * Режимы: idle → sound → lock
 * - idle:  вращает башню, ищет импульсным сканом
 * - sound: звук двигателя/выстрела зафиксирован — башня едет к источнику
 * - lock:  непрерывный лазер захватил врага — удержание + ПТУР
 *
 * Использует всю доступную информацию:
 *   onSound      → приблизительный пеленг, переход в sound
 *   onLaserScan  → точный захват, переход в lock
 *   smartLaser   → скорость/угол цели для экстраполяции
 */
class Tracker extends Tank {
  mode = "idle";
  scanAngle = 0;

  // Данные захвата
  lockAngle = 0;
  lockDist = 10;
  lockSpeed = 0;
  lockMovDir = 0; // рад canvas
  lockLost = 0;
  _hasTarget = false;
  _shotCD = 0;

  // Данные звукового пеленга
  soundAngle = 0;
  soundLost = 0;

  constructor() {
    super(...arguments);
  }
  static get botName() {
    return "Tracker";
  }

  // ── Вычислить за сколько тиков башня довернётся на delta градусов ──────────
  _turnsIn(deltaDeg) {
    const rps = 1.8 * (cfg.turretSpeed || 1); // рад/сек
    const dps = (rps * 180) / Math.PI; // °/сек
    return deltaDeg / dps; // секунд
  }

  // ── Экстраполировать lockAngle на dt секунд вперёд ─────────────────────────
  _extrapolate(dt) {
    if (this.lockSpeed < 0.1) return;
    const lockRad = degToRad(this.lockAngle);
    const cx = Math.cos(lockRad) * this.lockDist;
    const cy = Math.sin(lockRad) * this.lockDist;
    const nx = cx + Math.cos(this.lockMovDir) * this.lockSpeed * dt;
    const ny = cy + Math.sin(this.lockMovDir) * this.lockSpeed * dt;
    this.lockAngle = normDeg(Math.atan2(ny, nx));
    this.lockDist = Math.sqrt(nx * nx + ny * ny);
  }

  // ════════════════════════════════════════════════════════════
  main() {
    this.stop();
    this._shotCD = Math.max(0, this._shotCD - 1);

    if (this.mode === "idle") this._doIdle();
    else if (this.mode === "sound") this._doSound();
    else this._doLock();
  }

  // ── РЕЖИМ: ПОИСК ─────────────────────────────────────────────────────────
  _doIdle() {
    this.disableContinuousLaser();
    this.scanAngle = (this.scanAngle + 7) % 360;
    this.setGunDegree(this.scanAngle);
    this.impulseScan();
  }

  // ── РЕЖИМ: ЗВУКОВОЙ ПЕЛЕНГ ───────────────────────────────────────────────
  _doSound() {
    this.disableContinuousLaser();
    this.soundLost++;

    // Разворачиваем башню к источнику звука и сканируем
    this.setGunDegree(this.soundAngle);
    this.impulseScan(); // onLaserScan переведёт в lock если найдёт врага

    if (this.soundLost > 40) {
      // ~4 сек без подтверждения
      this.say("Пеленг потерян. Сканирую.");
      this.mode = "idle";
      this.scanAngle = this.soundAngle;
    }
  }

  // ── РЕЖИМ: ЗАХВАТ ─────────────────────────────────────────────────────────
  _doLock() {
    this.enableContinuousLaser();

    // Экстраполяция — насколько цель сдвинулась с последнего onLaserScan (0.2с)
    // При быстрой башне (×5) экстраполируем агрессивнее — башня успевает довернуть
    const dt = 0.1;
    if (!this._hasTarget) {
      this._extrapolate(dt);
    }

    this.setGunDegree(this.lockAngle);

    // Проверяем насколько башня уже довернулась
    const gunDiff = Math.abs(
      ((this.getGunDegree() - this.lockAngle + 540) % 360) - 180,
    );
    const aimed = gunDiff < 4;

    if (!this._hasTarget) {
      if (aimed) this.lockLost++;
    } else {
      this.lockLost = 0;
    }

    // Стрелять — не ждём полного прицеливания при быстрой башне
    const aimThreshold = Math.max(2, 8 / (cfg.turretSpeed || 1));
    if (
      gunDiff < aimThreshold &&
      this._hasTarget &&
      this.getCurrentInfo().pturReady &&
      this._shotCD === 0
    ) {
      this.fire();
      this._shotCD = 8;
      this.say("Пуск! Д=" + Math.round(this.lockDist));
    }

    // Сбрасываем флаг контакта — onLaserScan поставит снова если попадёт
    this._hasTarget = false;

    if (this.lockLost > 25) {
      // Откат в звуковой пеленг если был звук, иначе в поиск
      this.say("Захват потерян.");
      this.disableContinuousLaser();
      this.mode = "idle";
      this.scanAngle = this.lockAngle;
      this.lockSpeed = 0;
    }
  }

  // ════════════════════════════════════════════════════════════
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
      this.lockLost = 0;
      this.mode = "lock";
    }
  }

  // ════════════════════════════════════════════════════════════
  onSound(info) {
    if (this.mode === "lock") return; // захват приоритетнее звука

    // Ищем ближайший враждебный звук (двигатель или выстрел)
    const hostile = info
      .filter((s) => s.hostile === true)
      .sort((a, b) => a.dist - b.dist);
    if (hostile.length === 0) return;

    const src = hostile[0];
    this.soundAngle = src.angle; // нормализованный 0..360
    this.soundLost = 0;

    if (this.mode !== "sound") {
      const type = src.soundType === "engine" ? "двигатель" : "выстрел";
      this.say("Пеленг! " + type + " " + Math.round(src.angle) + "°");
      this.mode = "sound";
    }
  }

  // ════════════════════════════════════════════════════════════
  onLaserDetection(info) {
    const src = info.find((s) => s.hostile);
    if (!src) return;
    if (this.mode === "lock") return;
    this.say("Засечён лазер! " + Math.round(src.degree) + "°");
    this.soundAngle = src.degree;
    this.soundLost = 0;
    this.mode = "sound";
  }

  onDamage() {
    this.fireSmoke();
    this.say(this.mode === "lock" ? "Урон! Держу захват." : "Урон!");
  }
}
