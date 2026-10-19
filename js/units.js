"use strict";

// ═══════════════════ БАЗОВЫЙ КЛАСС ТАНКА ═══════════════════
// ═══════════════════ UNIT — базовый класс для Tank и Base ═══════════════════
// Содержит общее API: radio, команды, say, callbacks.
// Tank и Base наследуют Unit и добавляют свою физику/логику.
// ═══════════════════ BOT SANDBOX ═══════════════════
// Белый список методов доступных боту через Proxy
const BOT_API_WHITELIST = new Set([
  // Движение
  "setSpeed",
  "stop",
  "setTankDirection",
  "getTankDirection",
  // Башня
  "setGunDirection",
  "getGunDirection",
  "getRandomDegree",
  "setGunDirectionAndFire",
  // Лазер
  "impulseScan",
  "enableLaser",
  "disableLaser",
  // Оружие
  "fire",
  "fireSmoke",
  "selfDestruct",
  // Телеметрия
  "getCurrentInfo",
  "isIrradiated",
  "getIrradiatedAngle",
  "wasDamaged",
  "getLaserData",
  // Команды
  "getTeam",
  "isAlly",
  "isEnemy",
  // Радио / речь
  "broadcast",
  "say",
  "log",
  "logMsg",
  // Задачи
  "runTasks",
  "await",
  // Память
  "setMemory",
  "getMemory",
  // Колбэки (переопределяются ботом)
  "main",
  "onLaserScan",
  "onLaserDetection",
  "onSound",
  "onRadio",
  "onDamage",
]);

// Служебные поля движка — боту недоступны (к ним добавляются все поля и методы
// самого Tank, см. isBotField). Всё остальное (this.mode, this._shotCD…) —
// собственное состояние бота, его можно свободно читать и писать.
const ENGINE_PRIVATE = new Set([
  // публичные поля, которые движок создаёт не в конструкторе
  "renderLaserEndX",
  "renderLaserEndY",
  "pturAmmo",
  "isWreck",
  "maxHp",
  "isBaseObj",
  "_againstWall",
  "_ammoReloadTimer",
  "_api_damaged",
  "_api_irradiatedAngle",
  "_api_laser",
  "_api_sounds",
  "_assaultLoser",
  "_assaultReason",
  "_assaultWinner",
  "_beamClose",
  "_botProxy",
  "_broken",
  "_contScanTimer",
  "_continuousLaserCmd",
  "_desiredAngle",
  "_desiredSpeed",
  "_dirAndGoSpeed",
  "_dirAndGoTarget",
  "_engineSoundTimer",
  "_errCount",
  "_game",
  "_gateStart",
  "_gunAndFirePending",
  "_gunAndFireTarget",
  "_healTimer",
  "_hereTimer",
  "_lastAttackAngle",
  "_mainTimer",
  "_memory",
  "_radioMsgCount",
  "_sayBubbles",
  "_smokeReloadTimer",
  "_sparkTick",
  "_taskQueue",
  "_warnTimer",
]);

let _engineNames = null;
function isBotField(prop) {
  if (typeof prop !== "string") return false;
  if (!_engineNames) {
    _engineNames = new Set(ENGINE_PRIVATE);
    const probe = new Tank(-1, 0, 0, 0, "#000", "probe");
    for (
      let o = probe;
      o && o !== Object.prototype;
      o = Object.getPrototypeOf(o)
    )
      for (const k of Object.getOwnPropertyNames(o)) _engineNames.add(k);
  }
  return !_engineNames.has(prop);
}

// Создать защищённый Proxy для бота
// Скрывает координаты, внутренние поля, весь прямой доступ к Tank
function makeBotProxy(bot) {
  return new Proxy(bot, {
    get(target, prop) {
      // Приватные методы бота (начинаются с _) — разрешаем всегда
      // Это методы самого класса-бота, не движка
      if (
        typeof prop === "string" &&
        prop.startsWith("_") &&
        typeof target[prop] === "function"
      ) {
        return target[prop].bind(target);
      }
      // Собственные поля бота — читаем напрямую
      if (isBotField(prop)) {
        return target[prop];
      }
      // Разрешаем только белый список
      if (BOT_API_WHITELIST.has(prop)) {
        const val = target[prop];
        if (typeof val === "function") {
          // Оборачиваем каждый вызов в try/catch
          return function (...args) {
            try {
              return val.apply(target, args);
            } catch (e) {
              console.warn(
                `[Bot ${target.label}] Ошибка в ${prop}():`,
                e.message,
              );
            }
          };
        }
        return val;
      }
      // Всё остальное — undefined (координаты, hp, внутренние поля)
      return undefined;
    },
    set(target, prop, value) {
      // Свои поля бота писать можно, поля и методы движка — нет
      if (isBotField(prop)) {
        target[prop] = value;
        return true;
      }
      console.warn(
        `[Bot ${target.label}] Попытка записи в ${prop} — запрещено`,
      );
      return true; // silent fail
    },
  });
}

class Unit {
  constructor(id, x, y, color, label) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.color = color;
    this.label = label;
    this.team = null;
    this.alive = true;
    this._game = null;
    this._sayBubbles = [];
  }

  isPlayer() {
    return false;
  }
  isBase() {
    return false;
  }

  // Команды
  getTeam() {
    return this.team;
  }
  isAlly(other) {
    return this.team !== null && other && this.team === other.team;
  }
  isEnemy(other) {
    return !this.isAlly(other) && other !== this;
  }

  // Речевое облачко
  say(text) {
    this._sayBubbles.push({
      text: String(text),
      life: 3.0,
      maxLife: 3.0,
    });
    if (this._sayBubbles.length > 3) this._sayBubbles.shift();
    return this;
  }

  // Память бота — произвольный объект, сохраняется между тиками
  setMemory(key, value) {
    if (!this._memory) this._memory = {};
    this._memory[key] = value;
    return this;
  }
  getMemory(key, defaultValue = undefined) {
    return this._memory && key in this._memory
      ? this._memory[key]
      : defaultValue;
  }

  // Журнал
  log(msg) {
    if (this._game) this._game.log(`[${this.label}] ${msg}`, "");
  }

  // Радио
  broadcast(message) {
    const game = this._game;
    if (!game) return;
    if (!cfg.radioEnabled) return;
    if (!game._radioMsgCount) game._radioMsgCount = 0;
    if (game._radioMsgCount >= 15) return;
    game._radioMsgCount++;
    game.radioMessages.push({
      sender: this,
      message: String(message),
      team: this.team || null,
    });
    if (cfg.radioWaves)
      game.radioWaves.push({ x: this.x, y: this.y, r: 0, life: 1.0 });
    this.say("📡 " + String(message).slice(0, 20));
    return this;
  }

  // Доставка радио (вызывается движком после всех AI)
  deliverRadio(game) {
    const radioMsgs = game.radioMessages
      .filter((m) => m.sender !== this)
      .map((m) => {
        const dx = m.sender.x - this.x,
          dy = m.sender.y - this.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const angle = normDeg(Math.atan2(dy, dx));
        const isAlly = this.team && m.team && this.team === m.team;
        return {
          angle,
          dist: isAlly ? d : null,
          message: isAlly ? m.message : null,
          fromTeam: isAlly,
        };
      });
    if (radioMsgs.length > 0) {
      if (!this._botProxy) this._botProxy = makeBotProxy(this);
      try {
        this.onRadio.call(this._botProxy, radioMsgs);
      } catch (e) {
        console.warn(`[Bot ${this.label}] onRadio:`, e.message);
      }
    }
  }

  // Callbacks — переопределяются в подклассах
  onLaserScan(info) {}
  onLaserDetection(info) {}
  onSound(info) {}
  onRadio(info) {}
  onDamage() {}
  main() {}
}

class Tank extends Unit {
  constructor(id, x, y, angle, color, label) {
    super(id, x, y, color, label);
    this.angle = angle;
    this.turretAngle = angle;
    this.turretTargetAngle = angle;
    this.speed = 0;
    this.energy = 100;
    this.hp = 100;
    this.pturCD = 0;
    this.smokeCD = 0;
    this.smokeCount = 6;
    // дымовые гранаты теперь летящие объекты — smokePending не нужен
    this.laserContinuous = false;
    this.laserResult = null;
    this.renderLaser = null;
    this.renderLaserLife = 0;
    this.renderLaserAngle = 0;
    this.irradiated = false;
    this.irradiatedBy = null;
    this.activePTUR = null;
    this.dots = [];
    // внутренние поля движка
    this._api_sounds = [];
    this._api_laser = null;
    this._api_irradiatedAngle = null;
    this._api_damaged = false;
    this._desiredSpeed = undefined;
    this._desiredAngle = undefined;
    this._continuousLaserCmd = undefined;
    this._taskQueue = [];
    this._mainTimer = 0;
    this._engineSoundTimer = rnd(0, 0.3); // случайный старт чтобы не все пищали одновременно
    this._game = null;
    this._sayBubbles = [];
  }

  isPlayer() {
    return false;
  }

  // ══════════════════════════════════════════════════
  // BOT API — всё что нужно боту. Нет аргументов game.
  // ══════════════════════════════════════════════════

  // Движение

  stop() {
    this._desiredSpeed = 0;
    return this;
  }
  setTankDirection(deg) {
    this._desiredAngle = ((+deg || 0) * Math.PI) / 180;
    return this;
  }

  // Повернуть корпус на deg градусов, и только когда довернул — начать движение со speed
  setSpeed(v) {
    const spd = Math.max(-2, Math.min(5, +v || 0));
    // Если вызван в цепочке после setTankDirection и поворот ещё не завершён — ждём
    if (
      this._desiredAngle !== undefined &&
      Math.abs(normAngle(this._desiredAngle - this.angle)) > 0.05
    ) {
      this._dirAndGoTarget = this._desiredAngle;
      this._dirAndGoSpeed = spd;
      this._desiredSpeed = 0;
    } else {
      this._desiredSpeed = spd;
    }
    return this;
  }

  // Башня
  setGunDirection(deg) {
    this.turretTargetAngle = ((+deg || 0) * Math.PI) / 180;
    return this;
  }

  // Телеметрия
  getGunDirection() {
    return normDeg(this.turretAngle);
  }
  getTankDirection() {
    return normDeg(this.angle);
  }
  getRandomDegree() {
    return rnd(0, 360);
  }
  getCurrentInfo() {
    return {
      energy: this.energy,
      health: this.hp,
      hp: this.hp,
      speed: Math.abs(this.speed),
      angle: normDeg(this.angle),
      gunAngle: normDeg(this.turretAngle),
      beingLasered: this.irradiated,
      pturReady: this.pturCD <= 0,
      pturCooldown: Math.max(0, this.pturCD),
      smokeReady: this.smokeCD <= 0 && this.smokeCount >= 2,
      smokeCooldown: Math.max(0, this.smokeCD),
      smokeCount: this.smokeCount,
      pturAmmo:
        this.pturAmmo !== undefined
          ? this.pturAmmo
          : cfg.assault
            ? cfg.pturAmmo
            : 999,

      // Порядковый номер среди живых союзников (сортировка по id, начиная с 0)
      // Стабилен пока живёт — при гибели союзника номера не пересчитываются
      teamIndex: this._game
        ? [...this._game.tanks]
            .filter(
              (t) =>
                t.alive &&
                !t.isBaseObj &&
                t.team === this.team &&
                t.team !== null,
            )
            .sort((a, b) => a.id - b.id)
            .indexOf(this)
        : 0,
    };
  }
  getLaserData() {
    return this._api_laser;
  }
  laserData() {
    return this._api_laser;
  }
  isIrradiated() {
    return this.irradiated;
  }
  getIrradiatedAngle() {
    return this._api_irradiatedAngle !== null
      ? normDeg(this._api_irradiatedAngle)
      : null;
  }
  wasDamaged() {
    return this._api_damaged;
  }

  // Оружие
  fire() {
    return this.shootPTUR(this._game);
  }
  fireSmoke() {
    return this.throwSmoke(this._game);
  }
  selfDestruct() {
    return this._doSelfDestruct(this._game);
  }

  // Лазер
  impulseScan() {
    const game = this._game;
    if (!game) return null;
    const res = this.shootLaserPulse(game);
    this._api_laser = res
      ? {
          target: res.target ? "tank" : "non-tank",
          distance: res.dist,
          isHostile: res.isEnemy,
          isDead: res.isDead || false,
          inSmoke: res.inSmoke,
          isBase: res.isBase || false,
          targetSpeed: res.smart?.targetSpeed ?? null,
          targetAngle: res.smart?.targetAngle ?? null,
        }
      : null;
    if (res) this.onLaserScan(this._api_laser);
    return this._api_laser;
  }
  enableLaser() {
    this._continuousLaserCmd = true;
    return this;
  }
  disableLaser() {
    this._continuousLaserCmd = false;
    return this;
  }

  // Журнал
  log(msg) {
    if (this._game) this._game.log(`[${this.label}] ${msg}`, "");
  }

  // Навести башню на угол и выстрелить как только наведётся
  setGunDirectionAndFire(deg) {
    this._gunAndFireTarget = degToRad(deg);
    this._gunAndFirePending = true;
    return this;
  }

  // runTasks: принимает функции () => void и специальный объект await(ms)
  // Задачи с setGunDirection внутри — ждут завершения поворота башни
  // Объект {_awaitMs: N} — ждёт N миллисекунд игрового времени
  runTasks(...tasks) {
    // Если очередь ещё не пуста — игнорируем вызов (задача ещё выполняется)
    if (this._taskQueue && this._taskQueue.length > 0) return;
    for (const t of tasks) {
      if (typeof t === "function")
        this._taskQueue.push({
          type: "fn",
          fn: t,
          started: false,
          targetGun: null,
          waitTimer: null,
        });
      else if (t && typeof t === "object" && "_awaitMs" in t)
        this._taskQueue.push({
          type: "await",
          ms: t._awaitMs,
          timer: t._awaitMs / 1000,
        });
    }
  }

  // await(ms) — используется внутри runTasks: this.runTasks( ()=>..., this.await(200), ()=>... )
  await(ms) {
    return { _awaitMs: ms };
  }

  // broadcast() и callbacks теперь в Unit

  // ══════════════════════════════════════════════════
  // ДВИЖОК — внутренняя физика
  // ══════════════════════════════════════════════════
  updatePhysicsAndLaser(dt, game) {
    if (!this.alive) return;

    // Регенерация энергии
    this.energy = Math.min(100, this.energy + ENERGY_REGEN * dt);
    if (this.pturCD > 0) this.pturCD -= dt;
    if (this.smokeCD > 0) this.smokeCD -= dt;
    this.dots = this.dots.filter((d) => {
      d.update(dt);
      return d.alive();
    });
    if (this._sayBubbles)
      this._sayBubbles = this._sayBubbles.filter((b) => {
        b.life -= dt;
        return b.life > 0;
      });

    // Задержанный дым
    // Желаемая скорость (API)
    if (this._desiredSpeed !== undefined) {
      const diff = this._desiredSpeed - this.speed;
      if (Math.abs(diff) > 0.01)
        this.speed += Math.sign(diff) * Math.min(ACCEL * dt, Math.abs(diff));
      else this.speed = this._desiredSpeed;
    }

    // Желаемый угол корпуса (API) — не зависает: просто следует с ограниченной скоростью
    if (this._desiredAngle !== undefined) {
      const diff = normAngle(this._desiredAngle - this.angle);
      const step = TANK_TURN_SPEED * dt;
      if (Math.abs(diff) <= step) {
        this.angle = this._desiredAngle;
        // Довернули — если был setTankDirectionAndGo, отпускаем скорость
        if (this._dirAndGoTarget !== undefined) {
          this._desiredSpeed = this._dirAndGoSpeed;
          this._dirAndGoTarget = undefined;
          this._dirAndGoSpeed = undefined;
        }
      } else {
        this.angle = normAngle(this.angle + Math.sign(diff) * step);
      }
    }

    // Движение + коллизия
    if (Math.abs(this.speed) > 0.01) {
      const spd = this.speed; // скорость ДО движения
      const absSpd = Math.abs(spd);
      const dmgPerSpd = cfg.collisionDmg || 15;
      const nx = this.x + Math.cos(this.angle) * spd * dt;
      const ny = this.y + Math.sin(this.angle) * spd * dt;
      if (!game.isTankBlocked(nx, ny, this)) {
        this.x = nx;
        this.y = ny;
        this._againstWall = false;
      } else {
        const canX = !game.isTankBlocked(nx, this.y, this);
        const canY = !game.isTankBlocked(this.x, ny, this);

        if (this._sparkTick > 0) this._sparkTick--;

        // Вектор скорости
        const vx = Math.cos(this.angle) * spd;
        const vy = Math.sin(this.angle) * spd;

        // Перпендикулярная к стене составляющая скорости
        // canX=true → двигаемся по X, стена блокирует Y → перп = |vy|
        // canY=true → двигаемся по Y, стена блокирует X → перп = |vx|
        // ни то ни другое → угол ~45°, перп = absSpd
        let perpSpd;
        let wallNorm; // направление от стены (для разлёта осколков)
        if (!canX && !canY) {
          perpSpd = absSpd;
          wallNorm = this.angle + Math.PI;
        } else if (canX && !canY) {
          // Скользим по X, блокирован Y → перп = |vy|
          perpSpd = Math.abs(vy);
          wallNorm = vy > 0 ? -Math.PI / 2 : Math.PI / 2; // от стены вниз или вверх
        } else {
          // Скользим по Y, блокирован X → перп = |vx|
          perpSpd = Math.abs(vx);
          wallNorm = vx > 0 ? Math.PI : 0;
        }

        // Движение
        if (canX) this.x = nx;
        else if (canY) this.y = ny;
        else this.speed = 0; // оба заблокированы — стоп

        // Угол удара: острый если перп > 50% скорости
        const isHardHit = perpSpd >= absSpd * 0.5;

        // ── УДАР (только при смене состояния wall-контакта) ─────────────
        // Фиксируем момент первого касания
        const wasAgainstWall = this._againstWall || false;
        this._againstWall = true;
        const firstContact = !wasAgainstWall;

        if (isHardHit && firstContact && perpSpd >= 1) {
          // Звук
          ensureAudio();
          playWallHit(calcPanForPlayer(this.x, this.y, game));
          // Урон мгновенно при ударе
          if (cfg.wallDmg && cfg.collisionDmg > 0)
            this.takeHPDamage(perpSpd * cfg.collisionDmg, game, null);
          // Осколки стены
          const n = Math.max(3, Math.floor(perpSpd * 3));
          for (let i = 0; i < n; i++) {
            const a = wallNorm + rnd(-1.0, 1.0);
            game.wallParticles.push({
              x: this.x,
              y: this.y,
              vx: Math.cos(a) * rnd(2, 5 + perpSpd),
              vy: Math.sin(a) * rnd(2, 5 + perpSpd),
              type: "debris",
              life: 4 + Math.random() * 6,
              maxLife: 10,
              color: "#2a5a2a",
            });
          }
          // Осколки краски танка
          for (let i = 0; i < Math.floor(perpSpd * 2); i++) {
            const a = wallNorm + rnd(-0.7, 0.7);
            game.wallParticles.push({
              x: this.x,
              y: this.y,
              vx: Math.cos(a) * rnd(1, 4 + perpSpd),
              vy: Math.sin(a) * rnd(1, 4 + perpSpd),
              type: "debris",
              life: 1 + Math.random() * 2,
              maxLife: 3,
              color: this.color || "#888",
            });
          }
          this.speed *= 0.2; // гасим скорость при ударе
        }

        // ── ИСКРЫ при скольжении ─────────────────────────────────────────
        if (!isHardHit && absSpd >= 1 && !this._sparkTick) {
          this._sparkTick = 2;
          const sx = canX ? nx : this.x,
            sy = canX ? this.y : ny;
          for (let i = 0; i < 3; i++) {
            const a = wallNorm + rnd(-0.4, 0.4);
            game.wallParticles.push({
              x: sx,
              y: sy,
              vx: Math.cos(a) * rnd(3, 7),
              vy: Math.sin(a) * rnd(3, 7),
              type: "spark",
              life: 0.3 + Math.random() * 0.2,
              maxLife: 0.5,
              color: "#ffcc44",
            });
          }
        }
      }
      // Стоимость движения по энергии
      this.energy = Math.max(
        0,
        this.energy - Math.abs(this.speed) * ENERGY_SPEED_COST * dt,
      );
    }
    if (this.speed > 0) this.speed = Math.max(0, this.speed - FRICTION * dt);
    else if (this.speed < 0)
      this.speed = Math.min(0, this.speed + FRICTION * dt);
    if (this.energy <= 0 && Math.abs(this.speed) > 0.01)
      this.speed *= Math.pow(0.25, dt);

    // Звук двигателя
    this._engineSoundTimer -= dt;
    if (this._engineSoundTimer <= 0) {
      if (Math.abs(this.speed) > 0.5) {
        game.emitSound(this.x, this.y, "engine", this);
        // Выхлопные газы — из 2 труб (как у Тигра), сзади корпуса
        if (game.wallParticles && Math.abs(this.speed) > 0.3) {
          const spd = Math.abs(this.speed);
          // Трубы расположены сзади (-0.62*sz) и смещены по Y (±0.21*sz)
          // В мировых координатах: повернуть относительно угла танка
          const bk = -0.45; // X назад вдоль корпуса (нормализовано)
          const pipes = [
            { ox: bk, oy: -0.13 },
            { ox: bk, oy: 0.13 },
          ];
          for (const pipe of pipes) {
            // Каждую трубу — 2-3 частицы каждый тик
            const n = Math.random() < 0.5 ? 2 : 3;
            for (let i = 0; i < n; i++) {
              const cos = Math.cos(this.angle),
                sin = Math.sin(this.angle);
              const px = this.x + pipe.ox * cos - pipe.oy * sin;
              const py = this.y + pipe.ox * sin + pipe.oy * cos;
              const ea = this.angle + Math.PI + rnd(-0.3, 0.3);
              game.wallParticles.push({
                x: px,
                y: py,
                vx: Math.cos(ea) * rnd(0.15, 0.4 + spd * 0.1),
                vy: Math.sin(ea) * rnd(0.15, 0.4 + spd * 0.1),
                type: "exhaust",
                life: 0.4 + Math.random() * 0.35,
                maxLife: 0.75,
                color: spd > 3 ? "#4a4a4a" : "#5a5a5a", // быстро = темнее
                small: true,
              });
            }
          }
        }
      }
      this._engineSoundTimer = 0.3; // сбрасываем всегда — не накапливаем долг
    }

    // Башня
    {
      const diff = normAngle(this.turretTargetAngle - this.turretAngle),
        step = BOT_TURRET_SPEED * (cfg.turretSpeed || 1) * dt;
      if (Math.abs(diff) <= step) this.turretAngle = this.turretTargetAngle;
      else
        this.turretAngle = normAngle(this.turretAngle + Math.sign(diff) * step);
    }
    // setGunDirectionAndFire: навести и выстрелить
    if (this._gunAndFirePending) {
      this.turretTargetAngle = this._gunAndFireTarget;
      const diff = Math.abs(
        normAngle(this.turretAngle - this._gunAndFireTarget),
      );
      if (diff < 0.05) {
        this._gunAndFirePending = false;
        this.shootPTUR(game);
      }
    }

    // Непрерывный лазер
    if (this._continuousLaserCmd !== undefined)
      this.laserContinuous = !!this._continuousLaserCmd;
    if (this.laserContinuous) {
      this.energy = Math.max(0, this.energy - LASER_DRAIN_CONT * dt);
      if (this.energy <= 0) this.laserContinuous = false;
      this.laserResult = game.castLaser(this, this.turretAngle);
      this.renderLaser = this.laserResult;
      // Запоминаем конец луча для рендера (даже если нет попадания — рисуем до стены/края)
      if (this.laserResult) {
        this.renderLaserEndX = this.laserResult.hitX;
        this.renderLaserEndY = this.laserResult.hitY;
      } else {
        this.renderLaserEndX = this.x + Math.cos(this.turretAngle) * 50;
        this.renderLaserEndY = this.y + Math.sin(this.turretAngle) * 50;
      }
      this.renderLaserLife = 0.08;
      this.renderLaserAngle = this.turretAngle;
      // Наводим ПТУР по лучу лазера
      if (this.activePTUR && this.activePTUR.alive) {
        const lx =
          this.renderLaserEndX ?? this.x + Math.cos(this.turretAngle) * 50;
        const ly =
          this.renderLaserEndY ?? this.y + Math.sin(this.turretAngle) * 50;
        this.activePTUR.guide(this.turretAngle, lx, ly);
      }
      // onLaserScan при непрерывном лазере — не чаще раза в 0.2с
      if (!this._contScanTimer) this._contScanTimer = 0;
      this._contScanTimer -= dt;
      if (this._contScanTimer <= 0 && this.laserResult) {
        this._contScanTimer = 0.2;
        this._api_laser = this.laserResult
          ? {
              target: this.laserResult.target ? "tank" : "non-tank",
              distance: this.laserResult.dist,
              isHostile: this.laserResult.isEnemy,
              isDead: this.laserResult.isDead || false,
              inSmoke: this.laserResult.inSmoke,
              // Умный лазер: скорость (клетки/сек) и угол движения цели (градусы)
              targetSpeed: this.laserResult.smart?.targetSpeed ?? null,
              targetAngle: this.laserResult.smart?.targetAngle ?? null,
            }
          : null;
        if (this._api_laser) this.onLaserScan(this._api_laser);
      }
    } else {
      this.laserResult = null;
      this._contScanTimer = 0;
      if (this.renderLaserLife > 0) {
        this.renderLaserLife -= dt;
        if (this.renderLaserLife <= 0) this.renderLaser = null;
      }
    }
  }

  updateAI(dt, game) {
    if (!this.alive) return;
    this._game = game;

    // Звуки вокруг — фильтруем: не свои, в радиусе SOUND_RANGE
    this._api_sounds = game.sounds
      .filter((s) => s.owner !== this)
      .map((s) => {
        const d = dist({ x: this.x, y: this.y }, s);
        // Радиус слышимости: выстрелы и взрывы — полный SOUND_RANGE,
        // двигатель — пропорционально скорости источника (как кружок на экране)
        let maxDist = SOUND_RANGE;
        if (s.type === "engine" && s.owner) {
          const spd = Math.abs(s.owner.speed);
          maxDist = SOUND_RANGE * (spd / MAX_SPEED);
        }
        if (d > maxDist) return null;
        const hostile = s.owner ? this.isEnemy(s.owner) : null;
        return {
          angle: normDeg(Math.atan2(s.y - this.y, s.x - this.x)),
          dist: d,
          soundType: s.type,
          hostile,
        };
      })
      .filter(Boolean);

    if (this.irradiated && this.irradiatedBy)
      this._api_irradiatedAngle = Math.atan2(
        this.irradiatedBy.y - this.y,
        this.irradiatedBy.x - this.x,
      );
    else this._api_irradiatedAngle = null;

    // Колбэки — обёрнуты в try/catch защищают от ошибок в боте
    try {
      if (this.irradiated && this.irradiatedBy)
        this.onLaserDetection([
          {
            degree: normDeg(this._api_irradiatedAngle),
            hostile: this.isEnemy(this.irradiatedBy),
          },
        ]);
    } catch (e) {
      console.warn(`[Bot ${this.label}] onLaserDetection:`, e.message);
    }

    try {
      if (this._api_sounds.length > 0) this.onSound(this._api_sounds);
    } catch (e) {
      console.warn(`[Bot ${this.label}] onSound:`, e.message);
    }

    // Радио доставляется отдельным проходом после всех AI (см. deliverRadio)
    try {
      if (this._api_damaged) {
        this.onDamage();
        this._api_damaged = false;
      }
    } catch (e) {
      console.warn(`[Bot ${this.label}] onDamage:`, e.message);
      this._api_damaged = false;
    }

    // Очередь задач runTasks
    try {
      this._processTaskQueue(dt);
    } catch (e) {
      console.warn(`[Bot ${this.label}] runTasks:`, e.message);
      this._taskQueue = [];
    }

    // main() каждые 100мс
    this._mainTimer -= dt;
    if (this._mainTimer <= 0) {
      this._mainTimer = 0.1;
      if (!this._broken) {
        try {
          this.main();
        } catch (e) {
          console.warn(`[Bot ${this.label}] main():`, e.message);
          // После 3 ошибок подряд — отключаем бота
          this._errCount = (this._errCount || 0) + 1;
          if (this._errCount >= 3) {
            this._broken = true;
            console.error(`[Bot ${this.label}] отключён после 3 ошибок`);
          }
        }
      }
    }

    this.aiUpdate(dt, game);
  }

  _processTaskQueue(dt) {
    if (!this._taskQueue || this._taskQueue.length === 0) return;
    const entry = this._taskQueue[0];

    if (entry.type === "await") {
      entry.timer -= dt;
      if (entry.timer <= 0) this._taskQueue.shift();
      return;
    }

    // type === 'fn'
    if (!entry.started) {
      const gunBefore = this.turretTargetAngle;
      const dirBefore = this._desiredAngle;
      entry.fn();
      entry.started = true;
      // Если изменился целевой угол башни — ждём
      entry.targetGun =
        this.turretTargetAngle !== gunBefore ? this.turretTargetAngle : null;
      entry.targetDir =
        this._desiredAngle !== dirBefore ? this._desiredAngle : null;
    }

    const gunDone =
      entry.targetGun === null ||
      Math.abs(normAngle(this.turretAngle - entry.targetGun)) < 0.05;
    const dirDone =
      entry.targetDir === null ||
      Math.abs(normAngle(this.angle - entry.targetDir)) < 0.05;

    if (gunDone && dirDone) this._taskQueue.shift();
  }

  update(dt, game) {
    this.updatePhysicsAndLaser(dt, game);
    this.updateAI(dt, game);
  }

  // deliverRadio теперь в Unit

  shootLaserPulse(game) {
    if (this.energy < LASER_DRAIN_PULSE) return null;
    this.energy -= LASER_DRAIN_PULSE;
    const res = game.castLaser(this, this.turretAngle);
    this.renderLaser = res;
    this.renderLaserAngle = this.turretAngle;
    this.renderLaserLife = 1.0;
    if (res) {
      this.renderLaserEndX = res.hitX;
      this.renderLaserEndY = res.hitY;
    } else {
      this.renderLaserEndX = this.x + Math.cos(this.turretAngle) * 50;
      this.renderLaserEndY = this.y + Math.sin(this.turretAngle) * 50;
    }

    return res;
  }

  _doSelfDestruct(game) {
    if (!game || !this.alive) return false;
    const dmgBase = (cfg.pturDmg || 200) * SELF_DESTRUCT_DMG_MULT;
    // Взрыв — урон всем в радиусе
    for (const tank of game.tanks) {
      if (tank === this) continue;
      if (!tank.alive && !tank.isWreck) continue;
      if (tank.isBaseObj && this.isAlly(tank)) continue; // своя база не страдает
      const d = dist({ x: this.x, y: this.y }, { x: tank.x, y: tank.y });
      let dmg = 0;
      if (d <= SD_RADIUS_FULL) dmg = dmgBase;
      else if (d <= SD_RADIUS_HALF) dmg = dmgBase * 0.5;
      else if (d <= SD_RADIUS_EDGE) dmg = dmgBase * 0.15;
      if (dmg > 0) tank.takeHPDamage(dmg, game, this);
    }
    // Серия мощных взрывов
    for (let i = 0; i < 5; i++) {
      const ox = (Math.random() - 0.5) * SD_RADIUS_FULL * 2;
      const oy = (Math.random() - 0.5) * SD_RADIUS_FULL * 2;
      game.explosions.push(
        new Explosion((this.x + ox) * CELL, (this.y + oy) * CELL),
      );
    }
    playExplosion(calcPanForPlayer(this.x, this.y, game));
    playDetonation(calcPanForPlayer(this.x, this.y, game));
    // Осколки
    if (game.wallParticles) {
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = 3 + Math.random() * 8;
        game.wallParticles.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          type: "debris",
          life: 5 + Math.random() * 5,
          maxLife: 10,
          color: this.color || "#888",
        });
      }
    }
    // Уничтожаем себя
    this.destroy(game, null);
    return true;
  }

  shootPTUR(game) {
    if (!game || this.pturCD > 0 || (this.activePTUR && this.activePTUR.alive))
      return false;
    // Боезапас в режиме Штурм
    if (cfg.assault && !this.isBaseObj) {
      if (this.pturAmmo === undefined) this.pturAmmo = cfg.pturAmmo;
      if (this.pturAmmo <= 0) {
        if (this.isPlayer && this.isPlayer()) this.say("Нет боеприпасов!");
        return false;
      }
      this.pturAmmo--;
    }
    this.pturCD = cfg.pturCD;
    // Смещаем стартовую позицию вперёд на TANK_RADIUS+небольшой зазор
    // чтобы радиовзрыватель не сработал немедленно на стрелке
    const pturOffset = TANK_RADIUS + 0.5;
    const ptur = new PTUR(
      this,
      this.x + Math.cos(this.turretAngle) * pturOffset,
      this.y + Math.sin(this.turretAngle) * pturOffset,
      this.turretAngle,
    );
    game.pturs.push(ptur);
    this.activePTUR = ptur;
    game.emitSound(this.x, this.y, "shot", this);
    playShot(calcPanForPlayer(this.x, this.y, game));
    return true;
  }

  throwSmoke(game) {
    if (!game || this.smokeCD > 0 || this.smokeCount < 2) return false;
    this.smokeCD = cfg.smokeCD;
    this.smokeCount -= 2;
    // 2 гранаты летят из башни с разбросом ±5°
    const a = this.turretAngle;
    game.grenades.push(new SmokeGrenade(this.x, this.y, a - 0.087, game));
    game.grenades.push(new SmokeGrenade(this.x, this.y, a + 0.087, game));
    return true;
  }

  // Урон здоровью (от ПТУРов, стен, лазера)
  takeHPDamage(amount, game, killer) {
    this.hp = Math.max(0, this.hp - amount);
    this._api_damaged = true;
    if (this.hp <= 0) this.destroy(game, killer);
  }

  // Урон энергии (от непрерывного лазера — не убивает)
  takeEnergyDamage(amount) {
    this.energy = Math.max(0, this.energy - amount);
  }

  destroy(game, killer) {
    this.alive = false;
    this.isWreck = true;
    this.speed = 0;
    this._desiredSpeed = 0;
    this.laserContinuous = false;

    // Взрывы, обломки и огонь — ВСЕГДА, независимо от галочки "Трупы"
    // Звук детонации БК — мощный, отдельный от обычного взрыва ПТУР
    playDetonation(calcPanForPlayer(this.x, this.y, game));
    // Серия визуальных взрывов
    game.explosions.push(new Explosion(this.x * CELL, this.y * CELL));
    for (let i = 0; i < rndInt(2, 3); i++) {
      const ox = (Math.random() - 0.5) * 0.6,
        oy = (Math.random() - 0.5) * 0.6;
      game.explosions.push(
        new Explosion((this.x + ox) * CELL, (this.y + oy) * CELL),
      );
    }

    // Башня улетает
    const turret = new Debris(
      this.x,
      this.y,
      this.turretAngle,
      "turret",
      this.color,
    );
    const blastAngle = this.turretAngle + rnd(-0.5, 0.5);
    const blastSpeed = rnd(4, 8);
    turret.vx = Math.cos(blastAngle) * blastSpeed;
    turret.vy = Math.sin(blastAngle) * blastSpeed;
    turret.va = rnd(-6, 6);
    game.debris.push(turret);

    // Куски брони
    const nChunks = rndInt(3, 5);
    for (let i = 0; i < nChunks; i++) {
      const chunk = new Debris(
        this.x,
        this.y,
        rnd(0, Math.PI * 2),
        "chunk",
        this.color,
      );
      const a = rnd(0, Math.PI * 2),
        sp = rnd(1.5, 5);
      chunk.vx = Math.cos(a) * sp;
      chunk.vy = Math.sin(a) * sp;
      chunk.va = rnd(-4, 4);
      game.debris.push(chunk);
    }

    // Горение и дым 30 сек
    game.wreckFires.push(new WreckFire(this.x, this.y));
    // Корпус-остов остаётся только если галочка стоит (управляет рендером и коллизией)

    game.log(
      `${this.label} УНИЧТОЖЕН${killer ? " [" + killer.label + "]" : ""}`,
      "kill",
    );
    if (killer && killer.isPlayer()) showKillNotify(this.label);
    game.checkWin();
  }

  aiUpdate(dt, game) {}
}

// ═══════════════════ ИГРОК ═══════════════════

class Base extends Unit {
  constructor(id, x, y, team, color, label) {
    super(id, x, y, color, label);
    this.team = team;
    this.hp = cfg.baseHp || 500;
    this.maxHp = cfg.baseHp || 500;
    this.energy = 100;
    this.angle = Math.PI / 2;
    this.turretAngle = Math.PI / 2;
    this.isBaseObj = true;
    this.isWreck = false;
    this.speed = 0;
    this.irradiated = false;
    this.irradiatedBy = null;
    this._api_damaged = false;
    this._healTimer = 0;
    this._lastAttackAngle = null;
    this._warnTimer = 0;
  }

  isPlayer() {
    return false;
  }
  isBase() {
    return true;
  }

  // Заглушки для совместимости с игровым циклом
  updatePhysicsAndLaser(dt, game) {
    /* База неподвижна — физики нет */
  }
  updateAI(dt, game) {
    this.update(dt, game);
    // Обработка колбэков (облучение)
    if (this.irradiated && this.irradiatedBy) {
      const _hostile = this.isEnemy(this.irradiatedBy);
      this.onLaserDetection([
        {
          degree: normDeg(
            Math.atan2(
              this.irradiatedBy.y - this.y,
              this.irradiatedBy.x - this.x,
            ),
          ),
          hostile: _hostile,
        },
      ]);
    }
    if (this._api_damaged) {
      this.onDamage();
      this._api_damaged = false;
    }
    this._game = game;
  }

  // Радиус зоны лечения и пополнения боезапаса
  static get HEAL_RADIUS() {
    return 3;
  }
  static get HEAL_RATE() {
    return 15;
  } // HP/сек
  static get AMMO_RESUPPLY() {
    return 5;
  } // ПТУР при доке

  update(dt, game) {
    if (!this.alive) return;
    // Лечим союзников в радиусе
    this._healTimer -= dt;
    if (this._healTimer <= 0) {
      this._healTimer = 0.5;
      for (const t of game.tanks) {
        if (!t.alive || t.isBaseObj) continue;
        // Союзник = та же команда ИЛИ игрок с той же командой
        const allied =
          this.team &&
          (t.team === this.team ||
            (t.isPlayer && t.isPlayer() && t.team === this.team));
        if (!allied) continue;
        const d = dist({ x: this.x, y: this.y }, { x: t.x, y: t.y });
        if (d > Base.HEAL_RADIUS) continue;
        // Лечение HP — медленное (15 HP каждые 0.5 сек = 30 HP/сек)
        if (t.hp < 100) t.hp = Math.min(100, t.hp + Base.HEAL_RATE * 0.1); // замедлено в 5 раз
        // Пополняем ПТУР — 1 ракета каждые 2 сек
        if (cfg.assault) {
          if (t.pturAmmo === undefined) t.pturAmmo = cfg.pturAmmo;
          if (t.pturAmmo < cfg.pturAmmo) {
            if (!t._ammoReloadTimer) t._ammoReloadTimer = 0;
            t._ammoReloadTimer -= 0.5;
            if (t._ammoReloadTimer <= 0) {
              t.pturAmmo++;
              t._ammoReloadTimer = 10.0;
            } // 1 ракета каждые 10 сек
          } else {
            t._ammoReloadTimer = 0;
          }
        }
        // Пополняем дымовые гранаты — 1 граната каждые 5 сек
        if (t.smokeCount !== undefined && t.smokeCount < 3) {
          if (!t._smokeReloadTimer) t._smokeReloadTimer = 0;
          t._smokeReloadTimer -= 0.5;
          if (t._smokeReloadTimer <= 0) {
            t.smokeCount++;
            t._smokeReloadTimer = 25.0;
          } // 1 граната каждые 25 сек
        } else {
          t._smokeReloadTimer = 0;
        }
      }
    }
    // Крик об атаке
    if (this._warnTimer > 0) this._warnTimer -= dt;
    if (this._hereTimer > 0) this._hereTimer -= dt;

    if (this._sayBubbles)
      this._sayBubbles = this._sayBubbles.filter((b) => {
        b.life -= dt;
        return b.life > 0;
      });
  }

  onLaserDetection(info) {
    const src = info.find((s) => s.hostile);
    if (!src) return;
    this._lastAttackAngle = src.degree;
    // Кричим не чаще раза в 3 сек
    if (this._warnTimer <= 0) {
      this._warnTimer = 3;
      this.broadcast(`BASE_ATTACK:${Math.round(src.degree)}`);
      this.say("⚠ АТАКА! " + Math.round(src.degree) + "°");
    }
  }

  onDamage() {
    if (this._warnTimer <= 0) {
      this._warnTimer = 2;
      const ang =
        this._lastAttackAngle !== null
          ? Math.round(this._lastAttackAngle)
          : "?";
      this.broadcast(`BASE_ATTACK:${ang}`);
      this.say("⚠ УРОН! " + ang + "°");
    }
    // Критическое HP
    if (this.hp < 100) this.broadcast("BASE_LOW_HP");
  }

  onRadio(messages) {
    for (const msg of messages) {
      if (!msg.fromTeam || !msg.message) continue;
      if (msg.message === "BASE_WHERE") {
        // Отвечаем не чаще раза в 5 сек чтобы не спамить
        if (!this._hereTimer || this._hereTimer <= 0) {
          this._hereTimer = 2; // 2 сек
          this.broadcast("BASE_HERE");
        }
      }
    }
  }

  takeHPDamage(amount, game, killer) {
    this.hp = Math.max(0, this.hp - amount);
    this._api_damaged = true;
    if (this.hp <= 0) this.destroy(game, killer);
  }

  destroy(game, killer) {
    this.alive = false;
    this.isWreck = true;
    game.log(`База "${this.team}" УНИЧТОЖЕНА!`, "kill");
    this.broadcast("BASE_DESTROYED");
    game.checkWin();
  }
}

class Player extends Tank {
  constructor(id, x, y) {
    super(id, x, y, 0, "#00ff88", "PLAYER");
    this.keys = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.gear = 0;
  }
  isPlayer() {
    return true;
  }

  updatePhysicsAndLaser(dt, game) {
    super.updatePhysicsAndLaser(dt, game);
    if (!this.alive) return; // мёртвый игрок не управляется
    const k = this.keys;
    if (k["KeyA"] || k["ArrowLeft"]) this.angle -= TANK_TURN_SPEED * dt;
    if (k["KeyD"] || k["ArrowRight"]) this.angle += TANK_TURN_SPEED * dt;
    if (k["KeyQ"])
      this.turretTargetAngle -= TURRET_TURN_SPEED * (cfg.turretSpeed || 1) * dt;
    if (k["KeyE"])
      this.turretTargetAngle += TURRET_TURN_SPEED * (cfg.turretSpeed || 1) * dt;
    if (k["KeyR"]) this.gear = 0;
    if (k["KeyF"]) {
      this.throwSmoke(game);
      k["KeyF"] = false;
    }

    // Скорость по передаче
    const targetSpd =
      this.gear > 0
        ? this.gear * (MAX_SPEED / 5)
        : this.gear < 0
          ? -MAX_SPEED * 0.4
          : 0;
    if (this.energy > 0) {
      const diff = targetSpd - this.speed;
      if (Math.abs(diff) > 0.05)
        this.speed += Math.sign(diff) * Math.min(ACCEL * dt, Math.abs(diff));
    }

    // Лазер игрока в первом проходе
    this.laserContinuous = this.mouseDown && this.energy > 0;
    if (this.laserContinuous) {
      this.energy = Math.max(0, this.energy - LASER_DRAIN_CONT * dt);
      const res = game.castLaser(this, this.turretAngle);
      this.laserResult = res;
      this.renderLaser = res;
      this.renderLaserLife = 0.08;
      if (res) {
        this.renderLaserEndX = res.hitX;
        this.renderLaserEndY = res.hitY;
      } else {
        this.renderLaserEndX = this.x + Math.cos(this.turretAngle) * 50;
        this.renderLaserEndY = this.y + Math.sin(this.turretAngle) * 50;
      }

      if (res)
        this.dots.push(
          new LaserDot(res.hitX, res.hitY, res.isEnemy, res.inSmoke),
        );
      if (this.activePTUR && this.activePTUR.alive) {
        const lx =
          this.renderLaserEndX ?? this.x + Math.cos(this.turretAngle) * 50;
        const ly =
          this.renderLaserEndY ?? this.y + Math.sin(this.turretAngle) * 50;
        this.activePTUR.guide(this.turretAngle, lx, ly);
      }
    }
  }
  aiUpdate(dt, game) {}

  destroy(game, killer) {
    if (cfg.immortal) {
      this.hp = 100;
      this.energy = Math.max(10, this.energy);
      return;
    }
    // Запоминаем режим видимости, чтобы вернуть его при возрождении
    if (cfg.visMode !== "all" || !this._visBeforeDeath)
      this._visBeforeDeath = cfg.visMode;
    super.destroy(game, killer);
    // После смерти: если возрождение — показываем подсказку
    // Если нет — переключаем в режим наблюдения
    // Всегда переключаем на "всю карту"
    cfg.visMode = "all";
    document
      .querySelectorAll(".vis-btn-hud")
      .forEach((b) => b.classList.toggle("active", b.dataset.mode === "all"));
  }
}
