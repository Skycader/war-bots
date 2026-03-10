// Scanner — пользовательский класс
class Scanner extends Tank {
  soundSource = 0;
  soundDist = 0;
  enemyIsSeen = false;
  heading = 0;
  distance = 0;
  mode = "scan";
  timer = 20;
  constructor() {
    super(...arguments);
  }
  static get botName() {
    return "Scanner";
  }

  static get botTeam() {
    return "RedTeam";
  }

  main() {
    if (this.mode === "scan") {
      this.setGunDegree(this.gunDegree() + 5);
      this.impulseScan();
      if (Math.random() > 0.95 && this.mode === "scan") {
        this.say("Двигаюсь к следующей точке");
        this.mode = "move";
        this.timer = 50;
      }
    }

    if (this.mode === "move") {
      this.timer -= 1;
      if (this.timer % 15 === 0) this.impulseScan();
      this.setGunDirection(this.heading);
      if (this.distance > 5) {
        this.say("Путь свободен!");
        this.setDirection(this.heading);
        this.setSpeed(3);
      } else {
        this.stop();
        this.say("Впереди препятствие, меняю курс!");
        this.heading += 10;
      }
    }

    if (this.mode === "flee" && this.timer > 0) {
      this.setSpeed(5);
      this.timer -= 1;
    }

    if (this.mode === "search") {
      if (!this.getCurrentInfo().pturReady) {
        this.mode = "flee";
      }
      this.timer -= 1;
      this.impulseScan();
      this.setDirection(this.soundSource);
      if (this.soundDist > 3) this.setSpeed(2);
      if (!this.enemyIsSeen) {
        if (this.timer > 10) {
          this.setGunDirection(this.soundSource - 1);
        }
        if (this.timer < 10) {
          this.setGunDirection(this.soundSource + 1);
        }
      }
    }

    if (this.timer <= 0) {
      this.disableConstantLaser();
      this.say("Перехожу в режим сканирования");
      this.mode = "scan";
      this.stop();
      this.timer = 20;
    }
  }

  onLaserScan(info) {
    this.distance = info.distance;
    if (info.target === "tank" && info.isHostile && info.distance > 3) {
      this.say("Обнаружен противник");
      this.enableContinuousLaser();
      this.enemyIsSeen = true;
      this.mode = "search";
      this.timer = 40;
      this.fire();
    }
    if (info.target === "non-tank") {
      if (this.enemyIsSeen) {
        this.say("Противник потерян");
      }
      this.enemyIsSeen = false;
    }
  }

  onLaserDetection(info) {
    if (info[0].hostile) {
      this.say("Обнаружено облучение лазером!");
      this.setGunDegreeAndFire(info[0].degree);
      this.fireSmoke();
      this.disableConstantLaser();
      if (this.mode !== "flee") {
        this.mode = "flee";
        this.enableConstntLaser();
      }
    }
  }

  onSound(info) {
    if (info[0].dist > 0 && info[0].hostile) {
      this.soundSource = info[0].angle;
      this.soundDist = info[0].soundDist;
      this.say("Слышу противника");
      this.mode = "search";
      this.timer = 20;
    }
  }
}
