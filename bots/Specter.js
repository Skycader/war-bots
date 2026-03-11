/**
 * Specter — мобильная боевая единица.
 *
 * Режимы:
 *   patrol  — едет в случайном направлении на скорости 1,
 *             предварительно вычислив дистанцию до препятствия.
 *             Параллельно вращает башню 360° в поисках врага.
 *   lock    — обнаружен враг: стоит, держит непрерывный лазер,
 *             стреляет ПТУРами (механизм из Tracker).
 *   evade   — обнаружено лазерное облучение: пустить противоракету,
 *             бросить дым, задний ход на максимуме.
 */
class Specter extends Tank {
  mode = "patrol";

  // Патруль
  patrolDir = 0; // угол движения (0..360)
  patrolDist = 0; // клеток осталось до препятствия
  scanAngle = 0; // угол вращения башни

  // Захват (lock) — аналог Tracker
  lockAngle = 0;
  lockDist = 10;
  lockSpeed = 0;
  lockMovDir = 0;
  lockLost = 0;
  _hasTarget = false;
  _shotCD = 0;

  // Уклонение
  _evadeTimer = 0;
  _evadeDir = 0; // направление отступления

  constructor() {
    super(...arguments);
    this._pickNewPatrol();
  }

  static get botName() {
    return "Specter";
  }

  static get botTeam() {
    return "Specters";
  }

  // ══════════════════════════════════════════════════════
  // Выбрать новое случайное направление патруля и
  // заранее вычислить сколько клеток можно проехать
  _pickNewPatrol() {
    this.patrolDir = this.getRandomDegree();
    this.patrolDist = this._castDist(this.patrolDir);
    this.setDirection(this.patrolDir);
  }

  // Дистанция по лучу (приближение через impulseScan по башне)
  // Ставим башню в нужный угол и читаем дистанцию до стены/цели
  _castDist(deg) {
    this.setGunDegree(deg);
    const info = this.impulseScan();
    // Если луч ничего не нашёл — едем 10 клеток, потом выбираем снова
    if (!info) return 10;
    // Останавливаемся чуть раньше препятствия
    return Math.max(1, info.distance - 1.5);
  }

  // Экстраполяция цели (как в Tracker)
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

  // ══════════════════════════════════════════════════════
  main() {
    this._shotCD = Math.max(0, this._shotCD - 1);

    if (this.mode === "patrol") this._doPatrol();
    else if (this.mode === "lock") this._doLock();
    else this._doEvade();
  }

  // ── ПАТРУЛЬ ────────────────────────────────────────────
  _doPatrol() {
    this.disableContinuousLaser();

    // Движение
    if (this.patrolDist > 0) {
      this.setSpeed(1);
      this.setDirection(this.patrolDir);
      this.patrolDist -= 1 * 0.1; // ~скорость × dt тика
    } else {
      this.stop();
      this._pickNewPatrol();
      return;
    }

    // Вращение башни — полный оборот за ~360/7 ≈ 51 тик = ~5 сек
    this.scanAngle = (this.scanAngle + 7) % 360;
    this.setGunDegree(this.scanAngle);
    this.impulseScan(); // onLaserScan переключит в lock
  }

  // ── ЗАХВАТ (идентично Tracker) ─────────────────────────
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
    } else {
      this.lockLost = 0;
    }

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

    this._hasTarget = false;

    if (this.lockLost > 25) {
      this.say("Цель потеряна. Патрулирую.");
      this.disableContinuousLaser();
      this.mode = "patrol";
      this.scanAngle = this.lockAngle;
      this.lockSpeed = 0;
      this._pickNewPatrol();
    }
  }

  // ── УКЛОНЕНИЕ ──────────────────────────────────────────
  _doEvade() {
    this.disableContinuousLaser();
    this._evadeTimer--;

    // Задний ход на максимуме
    this.setDirection(this._evadeDir);
    this.setSpeed(-2); // назад

    if (this._evadeTimer <= 0) {
      this.stop();
      this.say("Уклонение завершено.");
      this.mode = "patrol";
      this._pickNewPatrol();
    }
  }

  // ══════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════
  onLaserDetection(info) {
    const src = info.find((s) => s.hostile);
    if (!src) return;
    if (this.mode === "evade") return; // уже уклоняемся

    this.say("Лазер! Противоракета!");

    // Пустить ПТУР в сторону источника лазера
    this.setGunDegree(src.degree);
    this.setGunDegreeAndFire(src.degree);

    // Бросить дым
    this.fireSmoke();

    // Уходим назад от источника угрозы
    // Направление "назад" — противоположное источнику лазера
    this._evadeDir = (src.degree + 180) % 360;
    this._evadeTimer = 20; // ~2 сек на максимальной скорости назад
    this.disableContinuousLaser();
    this.mode = "evade";
  }

  // ══════════════════════════════════════════════════════
  onDamage() {
    if (this.mode !== "evade") {
      this.fireSmoke();
      this.say("Урон!");
    }
  }
}
