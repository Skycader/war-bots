class Attacker extends Tank {
  constructor() {
    super(...arguments);
    this._scanMode = true;
    this._lockTimer = 0;
  }
  static get botName() {
    return "Attacker";
  }

  static get botTeam() {
    return "BlueTeam";
  }

  main() {
    if (this._scanMode) {
      this.setGunDegree(this.getGunDegree() + 1);
      this.impulseScan();
    } else {
      this._lockTimer -= 0.1;
      const data = this.getLaserData();
      if (data && data.isHostile && !data.inSmoke) {
        this.enableContinuousLaser();
        this.fire();
        this._lockTimer = 0.5;
      } else if (this._lockTimer <= 0) {
        this.disableContinuousLaser();
        this._scanMode = true;
      }
    }
  }
  onLaserScan(info) {
    if (info.isHostile && !info.inSmoke) {
      this._scanMode = false;
      this._lockTimer = 2.0;
      this.enableContinuousLaser();
    }
  }
}
