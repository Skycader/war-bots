class Terminator extends Tank {
  // ═══ СОСТОЯНИЕ ═══
  mode = "scan"; // scan | pursue | evade

  // Цель
  targetAngle = 0;
  targetDist = 999;
  targetLostTimer = 0; // тиков без контакта с врагом

  // Преследование
  pursueAngle = 0;

  // Уклонение
  evadeTimer = 0; // тиков осталось (~50 = 5 сек)
  evadeDir = 1; // направление зигзага +1/-1
  evadeAngle = 0; // базовый угол зигзага
  evadeFireAngle = 0; // откуда облучали — туда и стреляем

  // Звук
  soundAngle = null;
  soundTimer = 0;

  constructor() {
    super(...arguments);
  }

  static get botName() {
    return "Terminator";
  }
  static get botTeam() {
    return "Terminators";
  }

  // ════════════════════════════════════════════════
  main() {
    // ── УКЛОНЕНИЕ ────────────────────────────────
    if (this.mode === "evade") {
      this.evadeTimer--;

      // Зигзаг каждые 10 тиков (~1 сек)
      if (this.evadeTimer % 10 === 0) {
        this.evadeDir *= -1;
        this.setDirection(this.evadeAngle + this.evadeDir * 45);
      }
      this.setSpeed(5);

      // Башня на источник угрозы — ответный огонь

      if (this.getCurrentInfo().pturReady)
        this.setGunDegreeAndFire(this.evadeFireAngle);

      if (this.evadeTimer <= 0) {
        this.say("Угроза миновала. Возобновляю поиск.");
        this.disableContinuousLaser();
        this.mode = "scan";
        this.targetLostTimer = 0;
      }
      return;
    }

    // ── ПРЕСЛЕДОВАНИЕ ────────────────────────────
    if (this.mode === "pursue") {
      this.targetLostTimer++;

      this.setDirection(this.pursueAngle);
      this.setSpeed(4);
      this.setGunDegree(this.targetAngle);
      this.impulseScan(); // уточняем позицию каждый тик

      if (this.getCurrentInfo().pturReady) this.fire();

      if (this.targetLostTimer > 25) {
        this.say("Цель потеряна. Сканирую...");
        this.disableContinuousLaser();
        this.mode = "scan";
        this.targetLostTimer = 0;
      }
      return;
    }

    // ── СКАНИРОВАНИЕ ─────────────────────────────
    this.setGunDegree(this.gunDegree() + 8); // полный оборот за ~4.5 сек
    this.impulseScan();

    if (this.soundTimer > 0) {
      this.soundTimer--;
      this.setDirection(this.soundAngle);
      this.setSpeed(2.5);
      if (this.soundTimer === 0) this.stop();
    } else {
      if (Math.random() > 0.97) {
        this.setDirection(this.getRandomDegree());
        this.setSpeed(2);
      }
    }
  }

  // ════════════════════════════════════════════════
  onLaserScan(info) {
    if (info.target === "tank") {
      if (!info.isHostile) return; // союзник — игнорируем

      // Враг захвачен
      this.targetAngle = this.gunDegree();
      this.targetDist = info.distance;
      this.targetLostTimer = 0;
      this.pursueAngle = this.gunDegree();

      if (this.mode !== "pursue") {
        this.say("Цель захвачена. Уничтожаю.");
        this.enableContinuousLaser();
        this.mode = "pursue";
      }

      if (info.distance < 8 && this.getCurrentInfo().pturReady) this.fire();
    }
  }

  // ════════════════════════════════════════════════
  onLaserDetection(info) {
    const src = info[0];

    if (!src.hostile) return; // союзник случайно светит — игнорируем

    // Враг облучает — немедленно выпускаем противоракету в его направлении
    // ПТУР полетит по лучу лазера (если enableContinuousLaser активен)
    // или просто в направлении угрозы
    const shootCM = this.getCurrentInfo().pturReady;
    if (shootCM) {
      this.setGunDegree(src.degree);
      // fire() сработает на следующем тике когда башня довернётся,
      // но setGunDegreeAndFire сделает это автоматически
      this.setGunDegreeAndFire(src.degree);
      this.say("Пуск противоракеты!");
    }

    if (this.mode === "evade") {
      // Уже уклоняемся — обновляем угол и продлеваем
      this.evadeFireAngle = src.degree;
      this.evadeTimer = Math.max(this.evadeTimer, 30);
      this.fireSmoke();
      return;
    }

    this.say("Попал под обстрел! Уклоняюсь!");
    this.evadeFireAngle = src.degree;
    this.evadeAngle = this.getDirection();
    this.evadeTimer = 50; // ~5 сек
    this.mode = "evade";

    this.fireSmoke();
    // Если противоракета уже запущена через setGunDegreeAndFire —
    // повторный fire() не нужен (КД не позволит)
    if (!shootCM) this.setGunDegreeAndFire(src.degree);
  }

  // ════════════════════════════════════════════════
  onSound(info) {
    // Игнорируем звуки союзников (hostile===false)
    // hostile===null — взрыв, источник неизвестен — реагируем
    const relevant = info.filter(
      (s) => s.hostile === true || s.hostile === null,
    );
    if (relevant.length === 0) return;

    const explosion = relevant.find((s) => s.soundType === "explosion");
    const target = explosion || relevant.sort((a, b) => a.dist - b.dist)[0];

    if (this.mode === "scan") {
      this.soundAngle = target.angle;
      this.soundTimer = 15;
      this.setGunDegree(target.angle);
      this.impulseScan();
      if (target.soundType === "shot") this.say("Слышу выстрел!");
      if (target.soundType === "engine") this.say("Слышу двигатель!");
    }

    // Близкий взрыв в любом режиме — уворачиваемся
    if (explosion && target.dist < 3) {
      this.setDirection(this.getDirection() + 90);
    }
  }

  // ════════════════════════════════════════════════
  onDamage() {
    if (this.mode !== "evade") {
      this.say("Получил урон!");
      this.evadeAngle = this.getDirection();
      this.evadeFireAngle = this.targetAngle;
      this.evadeTimer = 20;
      this.mode = "evade";
      this.fireSmoke();
    }
  }
}
