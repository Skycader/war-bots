// Coward — при облучении бросает дым и убегает в случайном направлении
class Coward extends Tank {
  enemyIsSeen = false;
  mode = "scan";
  timer = 20;
  constructor(id, x, y, angle) {
    super(id, x, y, angle, "#00aacc", "COWARD-" + id);
  }

  main() {
    if (this.mode === "scan") {
    }

    if (this.mode === "flee" && this.timer > 0) {
      this.setSpeed(5);
      // this.setDirection(this.getCurrentInfo() + 5);
      this.timer -= 1;
    }

    if (this.timer <= 0) {
      this.mode = "scan";
      this.stop();
      this.timer = 20;
    }
  }

  onLaserScan(info) {}

  onLaserDetection(info) {
    console.log("COWARD: LASER!");
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
