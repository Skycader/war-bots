/**
 * Tracker — неотступный преследователь.
 *
 * - Сканирует пока не найдёт врага
 * - Нашёл → включает постоянный лазер, ведёт цель с упреждением
 * - Держит лок до последнего, не срывается
 * - Облучили → поворачивается к источнику и стреляет ПТУР
 * - При потере цели — ищет в последнем известном секторе
 */
class Tracker extends Tank {
  static get botName() {
    return "Tracker";
  }
  static get botTeam() {
    return "Trackers";
  }

  constructor() {
    super(...arguments);
    this.setMemory("mode", "scan"); // scan | track | search | respond
    this.setMemory("scanAngle", 0);
    this.setMemory("lockAngle", 0); // угол на цель
    this.setMemory("lockDist", 10); // дистанция до цели
    this.setMemory("lockSpeed", 0); // скорость цели
    this.setMemory("lockMovDir", 0); // угол движения цели
    this.setMemory("lockLostTimer", 0); // тиков с момента потери цели
    this.setMemory("searchTimer", 0);
    this.setMemory("threatAngle", null); // откуда облучили
    this.setMemory("shotCD", 0);
  }

  main() {
    const mode = this.getMemory("mode");
    let shotCD = this.getMemory("shotCD");
    if (shotCD > 0) this.setMemory("shotCD", shotCD - 1);

    if (mode === "scan") this._doScan();
    else if (mode === "track") this._doTrack();
    else if (mode === "search") this._doSearch();
    else if (mode === "respond") this._doRespond();
  }

  // ── СКАНИРОВАНИЕ ────────────────────────────────────────────────────────
  _doScan() {
    this.disableLaser();
    let a = this.getMemory("scanAngle");
    a = (a + 8) % 360;
    this.setMemory("scanAngle", a);
    this.setGunDirection(a);
    this.impulseScan();

    // Медленно вращаемся
    this.setTankDirection((a + 180) % 360).setSpeed(0.5);
  }

  // ── ЗАХВАТ И СОПРОВОЖДЕНИЕ ЦЕЛИ ─────────────────────────────────────────
  _doTrack() {
    const info = this.getCurrentInfo();
    let lockAngle = this.getMemory("lockAngle");
    let lockDist = this.getMemory("lockDist");
    let lockSpeed = this.getMemory("lockSpeed");
    let lockMovDir = this.getMemory("lockMovDir");
    let lostTimer = this.getMemory("lockLostTimer");

    this.stop();
    this.enableLaser();

    // Упреждение: прогнозируем куда переместится цель
    const lead = lockDist > 1 ? lockDist / 15 : 0; // время полёта ПТУР
    const predAngle =
      lockAngle +
      Math.sin(((lockMovDir - lockAngle) * Math.PI) / 180) *
        lockSpeed *
        lead *
        3;

    this.setGunDirection(predAngle);

    // Прицелились — стреляем
    const diff = Math.abs(
      ((this.getGunDirection() - predAngle + 540) % 360) - 180,
    );
    if (diff < 5 && info.pturReady && this.getMemory("shotCD") === 0) {
      this.fire();
      this.setMemory("shotCD", 6);
    }

    // Счётчик потери цели
    lostTimer++;
    this.setMemory("lockLostTimer", lostTimer);

    // Держим лок 40 тиков после последнего обнаружения
    if (lostTimer > 40) {
      this.disableLaser();
      this.setMemory("mode", "search");
      this.setMemory("searchTimer", 25);
    }
  }

  // ── ПОИСК В ПОСЛЕДНЕМ СЕКТОРЕ ───────────────────────────────────────────
  _doSearch() {
    let timer = this.getMemory("searchTimer");
    const lockAngle = this.getMemory("lockAngle");
    timer--;
    this.setMemory("searchTimer", timer);

    // Веер ±20° вокруг последнего угла
    const sweep = lockAngle + Math.sin(timer * 0.4) * 20;
    this.setGunDirection(sweep);
    this.impulseScan();

    if (timer <= 0) {
      this.setMemory("mode", "scan");
    }
  }

  // ── ОТВЕТ НА ОБЛУЧЕНИЕ ──────────────────────────────────────────────────
  _doRespond() {
    const threat = this.getMemory("threatAngle");
    if (threat === null) {
      this.setMemory("mode", "scan");
      return;
    }

    this.stop();
    this.setGunDirection(threat);

    const diff = Math.abs(
      ((this.getGunDirection() - threat + 540) % 360) - 180,
    );
    if (diff < 10) {
      // Стреляем в любом случае — даже если не видим цель
      const info = this.getCurrentInfo();
      if (info.pturReady && this.getMemory("shotCD") === 0) {
        this.fire();
        this.setMemory("shotCD", 8);
        this.fireSmoke();
      }
      // Переходим в поиск по этому углу
      this.setMemory("lockAngle", threat);
      this.setMemory("mode", "search");
      this.setMemory("searchTimer", 30);
      this.setMemory("threatAngle", null);
    }
  }

  // ── CALLBACKS ─────────────────────────────────────────────────────────────

  onLaserScan(hit) {
    if (!hit.isHostile || hit.isDead) return;

    // Обновляем данные цели
    this.setMemory("lockAngle", this.getGunDirection());
    this.setMemory("lockDist", hit.distance);
    this.setMemory("lockSpeed", hit.targetSpeed ?? 0);
    this.setMemory("lockMovDir", hit.targetAngle ?? 0);
    this.setMemory("lockLostTimer", 0); // сброс таймера потери

    if (this.getMemory("mode") !== "track") {
      this.say("Захват! " + Math.round(hit.distance) + " кл");
      this.setMemory("mode", "track");
    }
  }

  onLaserDetection(sources) {
    const threat = sources.find((s) => s.hostile);
    if (!threat) return;

    this.say("СПО! " + Math.round(threat.degree) + "°");
    this.setMemory("threatAngle", threat.degree);

    // Если не в трекинге — немедленно реагируем
    if (this.getMemory("mode") !== "track") {
      this.setMemory("mode", "respond");
    }
  }

  onDamage() {
    this.fireSmoke();
  }
}
