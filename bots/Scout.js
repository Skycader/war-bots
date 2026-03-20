/**
 * Scout — Лазутчик / Шахед.
 *
 * Не знает размер карты и расположение базы заранее.
 * Маршрут: едет на юг → вдоль южной стены на запад → на север → на восток сканируя.
 * Параллельно при движении сканирует на север и юг — кто первый ответит isBase+isHostile.
 * Найдя врага → selfDestruct() если в зоне.
 */
class Scout extends Tank {
  static get botName() {
    return "Scout";
  }
  static get botTeam() {
    return "Scouts";
  }

  mode = "to_south"; // to_south|hug_west|to_north|scan_east
  _navEvade = null;
  _navTimer = 0;
  _scanDir = 270; // куда смотрит башня при сканировании

  main() {
    // Всегда параллельно сканируем на север и юг — ищем isBase+isHostile
    this._parallelScan();

    switch (this.mode) {
      case "to_south":
        this._goTo(90, 3, "hug_west");
        break;
      case "hug_west":
        this._goTo(180, 2.5, "to_north");
        break;
      case "to_north":
        this._goTo(270, 3, "scan_east");
        break;
      case "scan_east":
        this._doScanEast();
        break;
    }
  }

  // Сканируем попеременно север/юг без смены режима
  _parallelScan() {
    this._scanDir = this._scanDir === 270 ? 90 : 270;
    this.setGunDegree(this._scanDir);
    const sc = this.impulseScan();
    if (sc && sc.isBase && sc.isHostile) {
      this.say("База врага найдена! " + Math.round(sc.distance) + " кл");
      if (sc.distance <= SD_RADIUS_EDGE * 0.85) {
        this.say("💥 САМОПОДРЫВ!");
        this.selfDestruct();
      }
    }
  }

  // Едем в targetAngle до стены, потом nextMode
  _goTo(targetAngle, speed, nextMode) {
    this._nav(targetAngle, speed);
    this.setGunDegree(targetAngle);
    const sc = this.impulseScan();
    if (sc && sc.target === "non-tank" && !sc.isBase && sc.distance < 1.5) {
      this.mode = nextMode;
      this._navEvade = null;
      this._navTimer = 0;
      this.say("Стена. → " + nextMode);
    }
  }

  // Финальная фаза: едем на восток, башня смотрит на юг
  _doScanEast() {
    this._nav(0, 0.8);
    this.setGunDegree(90); // юг — где враг (если шли к северу)
    const sc = this.impulseScan();
    if (sc && sc.isBase && sc.isHostile) {
      this.say("База! Д=" + Math.round(sc.distance));
      if (sc.distance <= SD_RADIUS_EDGE * 0.85) {
        this.say("💥 САМОПОДРЫВ!");
        this.selfDestruct();
        return;
      }
    }
    // Дошли до края — разворот и едем обратно
    this.setGunDegree(0);
    const fwd = this.impulseScan();
    if (fwd && fwd.target === "non-tank" && !fwd.isBase && fwd.distance < 1.5) {
      this._navEvade = 180;
      this._navTimer = 20;
    }
  }

  _nav(targetAngle, speed) {
    if (this._navTimer > 0) this._navTimer--;
    else this._navEvade = null;
    const work = this._navEvade ?? targetAngle;
    this.setGunDegree(work);
    const sc = this.impulseScan();
    if (sc && sc.target === "non-tank" && !sc.isBase && sc.distance < 1.8) {
      let found = null;
      for (let d = 30; d <= 150 && !found; d += 30)
        for (const s of [-1, 1]) {
          const a = (((targetAngle + s * d) % 360) + 360) % 360;
          this.setGunDegree(a);
          const s2 = this.impulseScan();
          if (
            !s2 ||
            s2.isBase ||
            s2.target !== "non-tank" ||
            s2.distance >= 1.8
          ) {
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
