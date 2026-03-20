class Scanner extends Tank {
  static get botName() {
    return "Scanner";
  }
  static get botTeam() {
    return "Scanners";
  }

  constructor() {
    super(...arguments);
    this.setMemory("mode", "scan");
    this.setMemory("timer", 20);
    this.setMemory("heading", 0);
    this.setMemory("distance", 0);
    this.setMemory("soundSource", 0);
    this.setMemory("soundDist", 0);
    this.setMemory("enemyIsSeen", false);
    console.log(Date.now());
  }

  main() {
    const mode = this.getMemory("mode");
    let timer = this.getMemory("timer");

    if (mode === "scan") {
      this.setGunDirection(this.getGunDirection() + 5);
      this.impulseScan();
      if (Math.random() > 0.95) {
        this.say("Двигаюсь к следующей точке");
        this.setMemory("mode", "move");
        this.setMemory("timer", 50);
      }
    }

    if (mode === "move") {
      timer -= 1;
      this.setMemory("timer", timer);
      if (timer % 15 === 0) this.impulseScan();
      const heading = this.getMemory("heading");
      this.setGunDirection(heading);
      if (this.getMemory("distance") > 5) {
        this.say("Путь свободен!");
        this.setTankDirection(heading).setSpeed(3);
      } else {
        this.stop();
        this.say("Впереди препятствие, меняю курс!");
        this.setMemory("heading", heading + 10);
      }
    }

    if (mode === "flee") {
      if (timer > 0) {
        this.setSpeed(5);
        this.setMemory("timer", timer - 1);
      }
    }

    if (mode === "search") {
      if (!this.getCurrentInfo().pturReady) {
        this.setMemory("mode", "flee");
      }
      timer -= 1;
      this.setMemory("timer", timer);
      this.impulseScan();
      const src = this.getMemory("soundSource");
      this.setTankDirection(src);
      if (this.getMemory("soundDist") > 3) this.setSpeed(2);
      if (!this.getMemory("enemyIsSeen")) {
        this.setGunDirection(timer > 10 ? src - 1 : src + 1);
      }
    }

    if (timer <= 0) {
      this.disableLaser();
      this.say("Перехожу в режим сканирования");
      this.setMemory("mode", "scan");
      this.setMemory("timer", 20);
      this.stop();
    }
  }

  onLaserScan(info) {
    this.setMemory("distance", info.distance);
    if (info.target === "tank" && info.isHostile && info.distance > 3) {
      this.say("Обнаружен противник");
      this.enableLaser();
      this.setMemory("enemyIsSeen", true);
      this.setMemory("mode", "search");
      this.setMemory("timer", 40);
      this.fire();
    }
    if (info.target === "non-tank") {
      if (this.getMemory("enemyIsSeen")) {
        this.say("Противник потерян");
        this.disableLaser();
      }
      this.setMemory("enemyIsSeen", false);
    }
  }

  onLaserDetection(sources) {
    if (sources[0]?.hostile) {
      this.say("Обнаружено облучение лазером!");
      this.setGunDirectionAndFire(sources[0].degree);
      this.fireSmoke();
      this.disableLaser();
      if (this.getMemory("mode") !== "flee") {
        this.setMemory("mode", "flee");
        this.enableLaser();
      }
    }
  }

  onSound(sounds) {
    if (sounds[0]?.dist > 0 && sounds[0]?.hostile) {
      this.setMemory("soundSource", sounds[0].angle);
      this.setMemory("soundDist", sounds[0].dist);
      this.say("Слышу противника");
      this.setMemory("mode", "search");
      this.setMemory("timer", 20);
    }
  }
}
