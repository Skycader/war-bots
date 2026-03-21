class Patrol extends Tank {
  static get botName() {
    return "Patrol";
  }

  constructor() {
    console.log(arguments);
    super(...arguments);
  }

  main() {
    // Когда очередь опустела — ставим заново (бесконечный цикл)
    this.impulseScan();
  }
  onLaserScan(info) {
    if (info.target === "tank") {
      this.say("Вижу танк");
    }
  }
}
