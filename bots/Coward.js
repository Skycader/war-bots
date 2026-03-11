class Coward extends Tank {
  constructor() {
    super(...arguments);
    this._fleeing = false;
    this._fleeTimer = 0;
  }
  static get botName() {
    return "Coward";
  }
  onLaserDetection(info) {
    this.fireSmoke();
    if (!this._fleeing) {
      this.setDirection(this.getRandomDegree());
      this._fleeing = true;
      this._fleeTimer = rnd(2.5, 4.5);
      this.log("ПАНИКА!");
    } else {
      this._fleeTimer = Math.max(this._fleeTimer, 1.5);
    }
  }
  main() {
    if (this._fleeing) {
      this._fleeTimer -= 0.1;
      if (this._fleeTimer > 0) {
        if (this.getCurrentInfo().energy > 10) this.setSpeed(5);
      } else {
        this._fleeing = false;
        this.setSpeed(0);
      }
    }
  }
}
