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
    this.runTasks(
      () => {
        this.setTankDirection(DIR_SOUTH).setSpeed(2);
        this.set;
      },
      this.await(1000),
      () => {
        this.setTankDirection(DIR_EAST).stop();
        this.setGunDirection(DIR_EAST).fire();
      },
      this.await(1000),
      () => {
        this.setTankDirection(DIR_NORTH).setSpeed(2);
      },
      this.await(1000),
      () => {
        this.setTankDirection(DIR_WEST).stop();
        this.setGunDirection(DIR_WEST).fire();
      },
      this.await(1000),
    );
  }
}
