/**
 * Sample — демонстрационный класс бота.
 * Показывает все доступные методы API и структуру аргументов колбэков.
 * Не предназначен для реального использования.
 */
class Sample extends Tank {
  static get botName() {
    return "Sample";
  }
  static get botTeam() {
    return "Samples";
  } // убери если бот без команды

  // ── Своё состояние ────────────────────────────────────────────────────
  scanAngle = 0;

  constructor() {
    super(...arguments);
  }

  // ══════════════════════════════════════════════════════════════════════
  // main() — вызывается каждые ~100мс игрового времени
  // ══════════════════════════════════════════════════════════════════════
  main() {
    // ── Телеметрия ──────────────────────────────────────────────────────
    const info = this.getCurrentInfo();

    info.hp; // number  0..100  — текущее здоровье
    info.energy; // number  0..100  — энергия (тратится на лазер/движение, регенерирует)
    info.speed; // number  0..5    — текущая скорость (абсолютная)
    info.angle; // number  0..360  — угол корпуса (0=восток, 90=юг, 270=север)
    info.gunAngle; // number  0..360  — угол башни
    info.beingLasered; // bool            — тебя сейчас облучают
    info.pturReady; // bool            — ПТУР готов к выстрелу
    info.pturCooldown; // number  сек     — секунд до готовности ПТУР (0 = готов)
    info.pturAmmo; // number          — боезапас ПТУР (999 = бесконечно, в штурме ограничен)
    info.smokeReady; // bool            — дымовая граната готова
    info.smokeCooldown; // number  сек     — секунд до готовности дыма
    info.smokeCount; // number          — запас дымовых гранат (0..3)
    info.teamIndex; // number  0,1,2…  — порядковый номер среди живых союзников
    //                   0 и 1 → например охранники, 2+ → штурм

    // ── Движение ────────────────────────────────────────────────────────
    this.setSpeed(3); // задать скорость -2..5 (отриц = задний ход). return this
    this.setSpeed(-1); // задний ход
    this.stop(); // скорость = 0. return this
    this.setTankDirection(90); // повернуть корпус на угол (градусы). return this
    this.getTankDirection(); // → number: текущий угол корпуса

    // Цепочка: сначала поворот, потом движение
    this.setTankDirection(DIR_SOUTH).setSpeed(3);

    // ── Башня ────────────────────────────────────────────────────────────
    this.setGunDirection(270); // повернуть башню (градусы). return this
    this.getGunDirection(); // → number: текущий угол башни
    this.getRandomDegree(); // → number: случайный угол 0..360

    // Цепочка: навести башню и выстрелить когда наведётся
    this.setGunDirection(180).fire();

    // ── Лазер ────────────────────────────────────────────────────────────
    this.setGunDirection(45);
    const hit = this.impulseScan();
    // hit = null если ничего нет, иначе:
    // hit.target       // 'tank' | 'non-tank'
    // hit.distance     // number — дистанция в клетках
    // hit.isHostile    // bool   — враг?
    // hit.isBase       // bool   — это база (non-tank)?
    // hit.isDead       // bool   — мёртвый остов?
    // hit.inSmoke      // bool   — цель в дыму?
    // hit.targetSpeed  // number | null — скорость цели (только tank)
    // hit.targetAngle  // number | null — угол движения цели (только tank)
    if (hit && hit.isHostile && !hit.isDead) {
      if (info.pturReady) this.fire();
    }

    this.enableLaser(); // включить непрерывный лазер. return this
    this.disableLaser(); // выключить. return this

    // Цепочки с лазером
    this.setGunDirection(0).enableLaser();
    this.disableLaser().setGunDirection(90);

    // ── Оружие ───────────────────────────────────────────────────────────
    this.fire(); // выстрел ПТУР → false если не готов. return this
    this.fireSmoke(); // дымовая граната. return this
    this.selfDestruct(); // самоподрыв: урон ×10, радиус ×3 от ПТУР. return this
    this.setGunDirectionAndFire(90); // повернуть башню и выстрелить как наведётся. return this

    // ── Команды ──────────────────────────────────────────────────────────
    this.getTeam(); // → string | null — название команды
    // isAlly / isEnemy используются внутри колбэков где есть объект танка

    // ── Радио ────────────────────────────────────────────────────────────
    this.broadcast("HELLO"); // отправить строку всем. return this
    // Союзники получат полное сообщение, враги — только угол

    // ── Лог и речь ───────────────────────────────────────────────────────
    this.say("текст"); // пузырь над танком 3 сек. return this
    this.log("текст"); // в лог игры

    // Цепочки
    this.say("Атака!").setGunDirection(DIR_SOUTH).fire();

    // ── runTasks ─────────────────────────────────────────────────────────
    // Последовательное выполнение (игнорируется если очередь ещё занята)
    this.runTasks(
      () => {
        this.setTankDirection(DIR_SOUTH).setSpeed(2);
      },
      this.await(3000), // ждать 3000мс игрового времени
      () => {
        this.setTankDirection(DIR_EAST).setSpeed(2);
      },
      this.await(3000),
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // onLaserScan(hit) — impulseScan() что-то нашёл
  // ══════════════════════════════════════════════════════════════════════
  onLaserScan(hit) {
    hit.target; // 'tank' | 'non-tank'
    hit.distance; // дистанция в клетках
    hit.isHostile; // враг?
    hit.isBase; // это база?
    hit.isDead; // остов?
    hit.inSmoke; // в дыму?
    hit.targetSpeed; // скорость цели (null если non-tank)
    hit.targetAngle; // угол движения цели (null если non-tank)
  }

  // ══════════════════════════════════════════════════════════════════════
  // onLaserDetection(sources) — тебя облучают лазером
  // ══════════════════════════════════════════════════════════════════════
  onLaserDetection(sources) {
    // sources = Array of:
    // { degree: number, hostile: bool }
    // degree  — откуда пришёл луч (0..360)
    // hostile — true если враг, false если союзник

    for (const src of sources) {
      if (src.hostile) {
        this.setGunDirection(src.degree).enableLaser();
        this.fireSmoke();
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // onSound(sounds) — услышал звук в радиусе SOUND_RANGE (10 клеток)
  // ══════════════════════════════════════════════════════════════════════
  onSound(sounds) {
    // sounds = Array of:
    // { type: string, angle: number, dist: number }
    // type  — 'engine' | 'explosion' | 'ptur'
    // angle — откуда звук (0..360)
    // dist  — расстояние в клетках

    for (const snd of sounds) {
      if (snd.type === "explosion" && snd.dist < 5) {
        this.fireSmoke();
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // onRadio(messages) — получил радиосообщение
  // ══════════════════════════════════════════════════════════════════════
  onRadio(messages) {
    // messages = Array of:
    // { angle: number, dist: number|null, message: string|null, fromTeam: bool }
    // angle    — откуда пришло (0..360) — всегда
    // dist     — расстояние в клетках  — только от союзников (null от врагов)
    // message  — текст сообщения       — только от союзников (null от врагов)
    // fromTeam — true если союзник

    for (const msg of messages) {
      if (!msg.fromTeam) continue;

      if (msg.message === "BASE_WHERE") {
        this.broadcast("BASE_HERE");
      }
      if (msg.message === "BASE_HERE") {
        // msg.angle — угол до базы
        // msg.dist  — дистанция до базы
        this.setTankDirection(msg.angle).setSpeed(2);
      }
      if (msg.message?.startsWith("BASE_ATTACK:")) {
        const threatDeg = parseFloat(msg.message.split(":")[1]);
        this.setGunDirection(threatDeg);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // onDamage() — получил урон в этом тике
  // ══════════════════════════════════════════════════════════════════════
  onDamage() {
    this.fireSmoke();
  }
}
