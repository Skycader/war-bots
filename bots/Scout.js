/**
 * Scout — Лазутчик / Шахед.
 *
 * Определяет сторону вражеской базы через сканирование:
 * - Сканирует на север (270°) и на юг (90°)
 * - Своя база → isHostile=false, чужая → isHostile=true
 * - Нашёл вражескую базу → запоминает направление
 *
 * Маршрут (если враг на юге):
 *   1. Едет к северной стене
 *   2. Едет вдоль северной стены на запад до упора
 *   3. Поворачивает на юг, едет к южной стене
 *   4. Поворачивает на восток, медленно едет, башня на юг — сканирует
 *   5. База врага в зоне поражения → selfDestruct()
 *
 * Если враг на севере — зеркально.
 */
class Scout extends Tank {
  static get botName() {
    return "Scout";
  }
  static get botTeam() {
    return "Scouts";
  }

  mode = "probe"; // probe|to_near_wall|hug_side|to_far_wall|scan
  _enemyDir = null; // 90=юг или 270=север (направление к врагу)
  _probeTimer = 30; // тиков на зондирование
  _navEvade = null;
  _navTimer = 0;

  main() {
    switch (this.mode) {
      case "probe":
        this._doProbe();
        break;
      case "to_near_wall":
        this._goTo(this._nearWallDir(), 3, "hug_side");
        break;
      case "hug_side":
        this._goTo(this._sideDir(), 2.5, "to_far_wall");
        break;
      case "to_far_wall":
        this._goTo(this._enemyDir, 3, "scan");
        break;
      case "scan":
        this._doScan();
        break;
    }
  }

  // ── Зондирование: сканируем север и юг ──────────────────────────────
  _doProbe() {
    this.stop();
    this._probeTimer--;

    // Чередуем: чётные тики — север, нечётные — юг
    const dir = this._probeTimer % 2 === 0 ? 270 : 90;
    this.setGunDegree(dir);
    const sc = this.impulseScan();

    if (sc && sc.isHostile && !sc.isDead && sc.target === "non-tank") {
      // Нашли вражескую базу!
      this._enemyDir = dir;
      this.say(dir === 90 ? "Враг на юге!" : "Враг на севере!");
      this.mode = "to_near_wall";
      return;
    }

    if (this._probeTimer <= 0) {
      // Не нашли — пробуем ещё раз подольше
      this._probeTimer = 40;
    }
  }

  // Направление к "своей" стене (противоположной от врага)
  _nearWallDir() {
    return this._enemyDir === 90 ? 270 : 90;
  }

  // Направление вдоль стены (всегда на запад для простоты, можно рандомизировать)
  _sideDir() {
    return 180;
  }

  // ── Едем в направлении пока не стена, потом nextMode ────────────────
  _goTo(targetAngle, speed, nextMode) {
    this._nav(targetAngle, speed);
    this.setGunDegree(targetAngle);
    const sc = this.impulseScan();
    if (sc && sc.target === "non-tank" && sc.distance < 1.5) {
      this.mode = nextMode;
      this._navEvade = null;
      this._navTimer = 0;
    }
  }

  // ── Медленно поперёк карты, сканируем в сторону врага ───────────────
  _doScan() {
    const moveDir = this._enemyDir === 90 ? 0 : 180; // восток или запад
    this._nav(moveDir, 0.8);
    this.setGunDegree(this._enemyDir);
    const sc = this.impulseScan();

    if (sc && sc.isHostile && !sc.isDead && sc.target === "non-tank") {
      this.say("База! Д=" + Math.round(sc.distance));
      if (sc.distance <= SD_RADIUS_EDGE * 0.85) {
        this.say("💥 САМОПОДРЫВ!");
        this.selfDestruct();
      }
    }

    // Дошли до края карты — разворот
    this.setGunDegree(moveDir);
    const fwd = this.impulseScan();
    if (fwd && fwd.target === "non-tank" && fwd.distance < 1.5) {
      this._navEvade = (moveDir + 180) % 360;
      this._navTimer = 5;
    }
  }

  _nav(targetAngle, speed) {
    if (this._navTimer > 0) this._navTimer--;
    else this._navEvade = null;
    const work = this._navEvade ?? targetAngle;
    this.setGunDegree(work);
    const sc = this.impulseScan();
    if (sc && sc.target === "non-tank" && sc.distance < 1.8) {
      let found = null;
      for (let d = 30; d <= 150 && !found; d += 30)
        for (const s of [-1, 1]) {
          const a = (((targetAngle + s * d) % 360) + 360) % 360;
          this.setGunDegree(a);
          const s2 = this.impulseScan();
          if (!s2 || s2.target !== "non-tank" || s2.distance >= 1.8) {
            found = a;
            break;
          }
        }
      this._navEvade = found ?? (targetAngle + 180) % 360;
      this._navTimer = 12;
    }
    this.setDirection(this._navEvade ?? work);
    this.setSpeed(speed);
  }

  onLaserDetection(info) {
    if (info.find((s) => s.hostile)) this.fireSmoke();
  }
  onDamage() {
    this.fireSmoke();
  }
}
