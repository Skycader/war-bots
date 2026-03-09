// Scanner — бот-сканер, свободно путешествует, ищет врагов
// Написан в точности по образцу из документации — без технических параметров
class Scanner extends Tank {
  enemyIsSeen = false;
  mode = "scan";
  timer = 20;
  constructor(id, x, y, angle) {
    super(id, x, y, angle, "#00ffcc", "SCAN-" + id);
  }

  main() {
    if (this.mode === "scan") {
      this.setGunDegree(this.gunDegree() + 5);
      this.impulseScan();

      if (Math.random() > 0.7) {
        this.setSpeed(3);
      } else {
        this.stop();
      }
      if (Math.random() > 0.09) {
        this.setDirection(this.getRandomDegree());
      }
    }

    if (this.mode === "flee" && this.timer > 0) {
      this.setSpeed(5);
      // this.setDirection(this.getCurrentInfo() + 5);
      this.timer -= 1;
    }

    if (this.mode === "search") {
      this.timer -= 1;
      this.impulseScan();

      if (!this.enemyIsSeen) {
        if (this.timer > 10) {
          this.setGunDirection(this.gunDegree() - 1);
        }
        if (this.timer < 10) {
          this.setGunDirection(this.gunDegree() + 1);
        }
      }
    }

    if (this.timer <= 0) {
      this.mode = "scan";
      this.stop();
      this.timer = 20;
    }
  }

  onLaserScan(info) {
    if (info.target === "tank" && info.isHostile) {
      this.enemyIsSeen = true;
      this.mode = "search";
      this.timer = 40;
      this.fire();
    }

    if (info.target === "non-tank") {
      this.enemyIsSeen = false;
      if (info.distance < 5) {
        // this.setDirection(this.getDirection() + 20);
        // this.setDirection(this.getDirection() + 90);
      }
    }
  }

  onLaserDetection(info) {
    this.fireSmoke();
    if (this.mode !== "flee") {
      this.mode = "flee";
    }

    // this.runTasks(
    //   // () => this.fireSmoke(),
    //   () => this.setGunDegree(info[0].degree),
    //   () => this.fire(),
    //   () => console.log("Вижу облучение лазером!", info),
    //   // () => this.setDirection(this.getRandomDegree()),
    //   // () => this.setSpeed(5),
    //   () => this.setDirection(this.getRandomDegree()),
    //   () => this.setSpeed(5),
    //   () => {
    //     this.isAttacked = false;
    //   },
    // );
  }

  onSound(info) {
    // this.setDirection(info[0].angle);
    // this.setGunDirection(info[0].angle);
    // if (info[0].soundType === "engine") {
    //   this.fire();
    // } else {
    //   this.impulseScan();
    //   if (this.laserData() && this.laserData().target === "tank") {
    //     this.fire();
    //   }
    // }
  }
}
