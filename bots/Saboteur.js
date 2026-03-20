/**
 * Saboteur — диверсант.
 *
 * Стратегия: движется к базе врага через поле, активно объезжая препятствия.
 * Не знает где база → исследует карту сканированием.
 * Нашёл базу → атакует всеми ПТУР и отступает.
 * Без ПТУР → едет к своей базе пополниться.
 *
 * Навигация: impulseScan веером каждый тик — едет туда где свободнее.
 */
class Saboteur extends Tank {
  static get botName() {
    return "Saboteur";
  }
  static get botTeam() {
    return "Saboteurs";
  }

  mode = "advance"; // advance | attack | retreat | resupply
  _targetAngle = null; // угол на базу врага
  _shotsFired = 0;
  _homeAngle = null;
  _askTimer = 0;

  // Навигация: простой wall-follow через веер лазеров
  _heading = null; // текущий желаемый курс
  _headTimer = 0; // тиков до смены курса
  _stuckTimer = 0;
  _prevSpeed = 0;

  constructor() {
    super(...arguments);
    // Начинаем движение в сторону противоположной стены
    // Примерно "вперёд" — к врагу
    this._heading = Math.random() < 0.5 ? 80 : 100; // чуть вниз (к нижней базе) или вверх
  }

  main() {
    const info = this.getCurrentInfo();

    this._askTimer--;
    if (this._askTimer <= 0) {
      this.broadcast("BASE_WHERE");
      this._askTimer = 40;
    }

    // Детект застревания
    if (info.speed < 0.3) this._stuckTimer++;
    else this._stuckTimer = 0;

    if (this._stuckTimer > 15) {
      this._stuckTimer = 0;
      this._heading = this.getRandomDegree();
      this._headTimer = 30;
      this.say("Застрял! Разворот.");
    }

    if (this.mode === "advance") this._doAdvance(info);
    else if (this.mode === "attack") this._doAttack(info);
    else if (this.mode === "retreat") this._doRetreat(info);
    else this._doResupply(info);
  }

  // ── ДВИЖЕНИЕ К БАЗЕ ВРАГА ─────────────────────────────────────────────
  _doAdvance(info) {
    this.disableContinuousLaser();

    // Каждые 5 тиков переоцениваем курс через веер сканирования
    if (this._headTimer <= 0) {
      this._headTimer = 5;
      this._heading = this._findBestAngle(this._heading ?? this.getDirection());
    }
    this._headTimer--;

    this.setDirection(this._heading);
    this.setSpeed(2);
  }

  // Ищем направление с максимальной дистанцией в секторе ±60° от текущего курса
  _findBestAngle(preferred) {
    let bestAngle = preferred;
    let bestDist = 0;

    // Проверяем 9 направлений в секторе ±80°
    for (let d = -80; d <= 80; d += 20) {
      const a = (((preferred + d) % 360) + 360) % 360;
      this.setGunDegree(a);
      const sc = this.impulseScan();
      const dist = sc ? sc.distance : 30;
      if (dist > bestDist) {
        bestDist = dist;
        bestAngle = a;
      }
    }

    // Если лучшая дистанция слишком мала — разворачиваемся сильнее
    if (bestDist < 2) {
      bestAngle = (preferred + 120 + Math.random() * 120) % 360;
    }

    return bestAngle;
  }

  // ── АТАКА БАЗЫ ────────────────────────────────────────────────────────
  _doAttack(info) {
    this.stop();
    if (this._targetAngle === null) {
      this.mode = "advance";
      return;
    }

    this.setGunDegree(this._targetAngle);
    const diff = Math.abs(
      ((this.getGunDegree() - this._targetAngle + 540) % 360) - 180,
    );

    if (info.pturReady && this._shotsFired < 5 && diff < 10) {
      this.fire();
      this._shotsFired++;
      this.say("Огонь! " + this._shotsFired + "/5");
    }

    if (this._shotsFired >= 5 || info.pturAmmo === 0) {
      this.say("Отход!");
      this._shotsFired = 0;
      this.mode = "retreat";
      // Разворот на 180° для отступления
      this._heading =
        this._heading !== null
          ? (this._heading + 180) % 360
          : this.getRandomDegree();
    }
  }

  // ── ОТСТУПЛЕНИЕ ───────────────────────────────────────────────────────
  _doRetreat(info) {
    this.disableContinuousLaser();

    if (this._homeAngle !== null) {
      this.setDirection(this._homeAngle);
      this.setSpeed(3);
    } else {
      // Не знаем где база — едем обратно по курсу
      if (this._headTimer <= 0) {
        this._headTimer = 8;
        this._heading = this._findBestAngle(
          this._heading ?? this.getDirection(),
        );
      }
      this._headTimer--;
      this.setDirection(this._heading);
      this.setSpeed(3);
    }

    if (info.pturAmmo >= 5) {
      this.say("Заправился.");
      this.mode = "advance";
      this._targetAngle = null;
      this._heading =
        this._heading !== null
          ? (this._heading + 180) % 360
          : this.getRandomDegree();
    } else if (this._homeAngle !== null) {
      this.mode = "resupply";
    }
  }

  // ── ПОПОЛНЕНИЕ У БАЗЫ ─────────────────────────────────────────────────
  _doResupply(info) {
    if (this._homeAngle === null) {
      this.broadcast("BASE_WHERE");
      this.stop();
      return;
    }
    this.setDirection(this._homeAngle);
    this.setSpeed(3);

    if (info.pturAmmo >= 5) {
      this.say("Заправился! Снова в рейд.");
      this.mode = "advance";
      this._targetAngle = null;
      this._heading =
        this._heading !== null
          ? (this._heading + 180) % 360
          : this.getRandomDegree();
      this._headTimer = 0;
    }
  }

  // ── CALLBACKS ────────────────────────────────────────────────────────
  onLaserScan(info) {
    // Нашли базу врага
    if (info.isHostile && !info.isDead && info.target === "non-tank") {
      this._targetAngle = this.getGunDegree();
      if (this.mode === "advance") {
        this._shotsFired = 0;
        this.mode = "attack";
        this.say("База врага! Атака!");
      }
    }
    // Встретили танк — уклоняемся
    if (info.isHostile && info.target === "tank" && this.mode === "advance") {
      this.fireSmoke();
      this._heading =
        ((this._heading ?? this.getDirection()) + 90 + Math.random() * 90) %
        360;
      this._headTimer = 20;
    }
  }

  onRadio(messages) {
    for (const msg of messages) {
      if (!msg.fromTeam || !msg.message) continue;
      if (msg.message === "BASE_HERE") {
        this._homeAngle = msg.angle;
      }
    }
  }

  onLaserDetection(info) {
    if (info.find((s) => s.hostile) && this.mode === "advance") {
      this.fireSmoke();
      this._heading =
        ((this._heading ?? this.getDirection()) + 120 + Math.random() * 120) %
        360;
      this._headTimer = 25;
      this.say("Уклонение!");
    }
  }

  onDamage() {
    this.fireSmoke();
    if (this.mode === "advance") {
      this._heading =
        ((this._heading ?? this.getDirection()) + 150 + Math.random() * 60) %
        360;
      this._headTimer = 20;
    }
  }
}
