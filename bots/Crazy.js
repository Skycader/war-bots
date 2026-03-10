class Crazy extends Tank {
  constructor() {
    super(...arguments);
    this._thinkTimer = 0;
    this._turnCmd = 0;
    this._spdCmd = 3;
  }
  static get botName() {
    return "Crazy";
  }
  main() {
    this._thinkTimer -= 0.1;
    if (this._thinkTimer <= 0) {
      this._thinkTimer = rnd(0.5, 2.5);
      this._turnCmd = Math.random() < 0.33 ? -1 : Math.random() < 0.5 ? 0 : 1;
      this._spdCmd = rnd(1, 5);
    }
    if (this.getCurrentInfo().energy > 10) {
      this.setDirection(this.getDirection() + this._turnCmd * 12);
      this.setSpeed(this._spdCmd);
    }
  }
}
