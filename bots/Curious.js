class Curious extends Tank {
  constructor() {
    super(...arguments);
    this._soundDeg = null;
    this._investTimer = 0;
  }
  static get botName() {
    return "Curious";
  }
  onSound(info) {
    this._soundDeg = info[0].angle;
    this._investTimer = 5.0;
    this.log("Слышу!");
  }
  main() {
    if (this._investTimer > 0 && this._soundDeg !== null) {
      this._investTimer -= 0.1;
      this.setDirection(this._soundDeg);
      this.setGunDegree(this._soundDeg);
      if (this.getCurrentInfo().energy > 5) this.setSpeed(3.5);
    } else {
      this.setSpeed(0);
    }
  }
}
