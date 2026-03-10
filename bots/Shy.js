class Shy extends Tank {
  constructor() {
    super(...arguments);
    this._reactTimer = 0;
    this._reactDeg = null;
  }
  static get botName() {
    return "Shy";
  }
  onLaserDetection(info) {
    this._reactDeg = info[0].degree;
    this._reactTimer = 1.2;
  }
  main() {
    if (this._reactTimer > 0) {
      this._reactTimer -= 0.1;
      if (this._reactDeg !== null) {
        this.setGunDegree(this._reactDeg);
        const diff = Math.abs(
          ((this.getGunDegree() - this._reactDeg + 540) % 360) - 180,
        );
        if (diff < 5) {
          this.enableContinuousLaser();
          this.impulseScan();
          this.fire();
        } else {
          this.disableContinuousLaser();
        }
      }
    } else {
      this.disableContinuousLaser();
      this._reactDeg = null;
    }
  }
}
