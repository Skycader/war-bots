/**
 * Saboteur — диверсант.
 * Крадётся по краю карты к базе врага, минимально светит лазером.
 * Использует NavMixin-подобную навигацию через impulseScan.
 * Найдя базу — выпускает все ПТУР и отступает.
 */
class Saboteur extends Tank {
  static get botName() {
    return "Saboteur";
  }
  static get botTeam() {
    return "Saboteurs";
  }

  mode = "sneak"; // sneak | attack | retreat | resupply
  _edgeDir = 0;
  _shotsFired = 0;
  _targetAngle = null;
  _homeAngle = null;
  _homeDist = null;
  _askTimer = 0;

  // Навигация
  _navEvade = null;
  _navTimer = 0;
  _stuckTimer = 0; // счётчик застревания
  _lastX = 0;
  _lastY = 0;
  _lastCheckTimer = 0;

  constructor() {
    super(...arguments);
    this._edgeDir = Math.random() < 0.5 ? 0 : 180;
    this._lastX = 0;
    this._lastY = 0;
  }

  main() {
    const info = this.getCurrentInfo();

    // Запрашиваем базу
    this._askTimer--;
    if (this._askTimer <= 0 && !this._homeAngle) {
      this.broadcast("BASE_WHERE");
      this._askTimer = 80;
    }

    // Проверка застревания каждые 20 тиков
    this._lastCheckTimer--;
    if (this._lastCheckTimer <= 0) {
      this._lastCheckTimer = 20;
      const dx = this.getDirection(); // используем угол как прокси позиции
      if (this._stuckTimer > 2) {
        // Застряли — разворот и сброс режима
        this._edgeDir = (this._edgeDir + 180) % 360;
        this._navEvade = null;
        this._navTimer = 0;
        this._stuckTimer = 0;
        if (this.mode === "sneak") this.say("Разворот!");
      }
      // Нет движения = застряли (скорость ~0)
      if (info.speed < 0.3 && this.mode === "sneak") this._stuckTimer++;
      else this._stuckTimer = 0;
    }

    if (this.mode === "sneak") this._doSneak(info);
    else if (this.mode === "attack") this._doAttack(info);
    else if (this.mode === "retreat") this._doRetreat(info);
    else this._doResupply(info);
  }

  _doSneak(info) {
    this.disableContinuousLaser();
    // Едем вдоль края через навигацию
    this._nav(this._edgeDir, 2);

    // Редко сканируем вперёд в сторону поля
    if (Math.random() < 0.05) {
      const toField = this._edgeDir + (Math.random() < 0.5 ? 60 : -60);
      this.setGunDegree(toField);
      this.impulseScan();
    }
  }

  _doAttack(info) {
    this.stop();
    if (this._targetAngle === null) {
      this.mode = "sneak";
      return;
    }

    this.setGunDegree(this._targetAngle);
    const diff = Math.abs(
      ((this.getGunDegree() - this._targetAngle + 540) % 360) - 180,
    );

    if (info.pturReady && this._shotsFired < 5 && diff < 8) {
      this.fire();
      this._shotsFired++;
      this.say("Диверсия! " + this._shotsFired + "/5");
    }

    if (this._shotsFired >= 5 || info.pturAmmo === 0) {
      this.say("Отход!");
      this.mode = "retreat";
      this._edgeDir = (this._edgeDir + 180) % 360;
      this._navEvade = null;
    }
  }

  _doRetreat(info) {
    this.disableContinuousLaser();
    this._nav(this._edgeDir, 3);
    if (this._homeAngle !== null && info.pturAmmo < 5) {
      this.mode = "resupply";
    }
  }

  _doResupply(info) {
    if (this._homeAngle === null) {
      this.broadcast("BASE_WHERE");
      this.stop();
      return;
    }
    this._nav(this._homeAngle, 3);
    if (info.pturAmmo >= 5) {
      this.say("Заправился.");
      this.mode = "sneak";
      this._shotsFired = 0;
      this._targetAngle = null;
      this._edgeDir = (this._edgeDir + 180) % 360;
      this._navEvade = null;
    }
  }

  // Навигация через impulseScan с anti-stuck
  _nav(targetAngle, speed) {
    if (this._navTimer > 0) this._navTimer--;
    else this._navEvade = null;
    const work = this._navEvade ?? targetAngle;

    this.setGunDegree(work);
    const sc = this.impulseScan();
    const blocked = sc && sc.target === "non-tank" && sc.distance < 2.0;

    if (blocked) {
      // Веер поиска свободного направления
      let found = null;
      for (let d = 25; d <= 150 && !found; d += 25) {
        for (const s of [-1, 1]) {
          const a = (((targetAngle + s * d) % 360) + 360) % 360;
          this.setGunDegree(a);
          const sc2 = this.impulseScan();
          if (!sc2 || sc2.target !== "non-tank" || sc2.distance >= 2.0) {
            found = a;
            break;
          }
        }
      }
      this._navEvade = found ?? (targetAngle + 170) % 360;
      this._navTimer = 15;
    }

    this.setDirection(this._navEvade ?? work);
    this.setSpeed(speed);
  }

  onLaserScan(info) {
    if (info.isHostile && !info.isDead && info.target === "non-tank") {
      // База врага!
      this._targetAngle = this.getGunDegree();
      if (this.mode === "sneak") {
        this.say("База! Атака!");
        this._shotsFired = 0;
        this.mode = "attack";
      }
    }
    if (info.isHostile && info.target === "tank" && this.mode === "sneak") {
      this.fireSmoke();
      this._edgeDir = (this._edgeDir + 180) % 360;
      this._navEvade = null;
    }
  }

  onRadio(messages) {
    for (const msg of messages) {
      if (!msg.fromTeam || !msg.message) continue;
      if (msg.message === "BASE_HERE") {
        this._homeAngle = msg.angle;
        this._homeDist = msg.dist;
      }
    }
  }

  onLaserDetection(info) {
    if (info.find((s) => s.hostile) && this.mode === "sneak") {
      this.fireSmoke();
      this._edgeDir = (this._edgeDir + 180) % 360;
      this._navEvade = null;
      this.say("Обнаружен! Обход.");
    }
  }

  onDamage() {
    this.fireSmoke();
    if (this.mode !== "attack") {
      this.mode = "retreat";
      this._edgeDir = (this._edgeDir + 180) % 360;
      this._navEvade = null;
    }
  }
}
