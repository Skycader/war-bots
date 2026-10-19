"use strict";

// ═══════════════════ ИГРОВОЙ МИР ═══════════════════
class Game {
  constructor(config) {
    this.mapW = config.mapSize;
    this.mapH = config.mapSize;
    this.map = [];
    this.tanks = [];
    this.pturs = [];
    this.smokes = [];
    this.explosions = [];
    this.debris = [];
    this.wreckFires = [];
    this.radioMessages = [];
    this.radioWaves = [];
    this.wallParticles = [];
    this.bases = [];
    this.grenades = [];
    this.sounds = [];
    this.logs = [];
    this.running = true;
    this.winner = null;
    this.player = null;
    this.genMap(config.obstacleDensity);
    this.spawnTanks(config);
    if (cfg.assault) this.spawnBases();
  }

  genMap(density) {
    const W = this.mapW,
      H = this.mapH;
    for (let y = 0; y < H; y++) {
      this.map[y] = [];
      for (let x = 0; x < W; x++)
        this.map[y][x] =
          x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 1 : 0;
    }
    if (cfg.symmetric) {
      const half = Math.floor(H / 2);
      for (let y = 2; y < half; y++)
        for (let x = 2; x < W - 2; x++)
          if (Math.random() < density) this.map[y][x] = 1;
      for (let y = 2; y < half; y++)
        for (let x = 2; x < W - 2; x++)
          this.map[H - 1 - y][x] = this.map[y][x];
      if (H % 2 !== 0)
        for (let x = 1; x < W - 1; x++) this.map[half][x] = 0;
    } else {
      for (let y = 2; y < H - 2; y++)
        for (let x = 2; x < W - 2; x++)
          if (Math.random() < density) this.map[y][x] = 1;
    }
    // Режим Штурм: стены y=0 и y=H-1 НЕ очищаем — лазер/танки не проходят
    // Только очищаем пространство ПЕРЕД воротами (dy=1..3)
    if (cfg.assault) {
      const gs = Math.floor(W / 2) - 2; // ворота: gs, gs+1, gs+2, gs+3
      this._gateStart = gs;
      for (let dy = 1; dy <= 3; dy++)
        for (let dx = 0; dx <= 3; dx++) {
          this.map[dy][gs + dx] = 0;
          this.map[H - 1 - dy][gs + dx] = 0;
        }
    }
  }

  spawnBases() {
    const W = this.mapW,
      H = this.mapH;
    const gs =
      this._gateStart !== undefined
        ? this._gateStart
        : Math.floor(W / 2) - 2;
    const cx = gs + 1.5; // центр 4 ворот
    // Собираем уникальные команды из танков
    const teams = [
      ...new Set(this.tanks.map((t) => t.team).filter(Boolean)),
    ];
    if (teams.length < 2) return;

    // Команда 0 — верхняя база (y=3, смотрит вниз)
    // Команда 1 — нижняя база (y=H-4, смотрит вверх)
    const basePositions = [
      { x: cx, y: 0.5, angle: Math.PI / 2 }, // в верхней стене, смотрит вниз
      { x: cx, y: H - 0.5, angle: -Math.PI / 2 }, // в нижней стене, смотрит вверх
    ];

    let id = 9000;
    teams.slice(0, 2).forEach((team, i) => {
      const pos = basePositions[i];
      const color = teamColor(team);
      const base = new Base(
        id++,
        pos.x,
        pos.y,
        team,
        color,
        "База-" + team,
      );
      base.turretAngle = pos.angle;
      base.turretTargetAngle = pos.angle;
      base._game = this;
      this.bases.push(base);
      this.tanks.push(base); // база участвует как танк (радио, лазер, урон)
    });
  }

  freeCell(excl = 3) {
    return this.freeCellZone(0, this.mapH, excl);
  }

  // Для королевской битвы — спавн вдоль краёв карты (полоса 5 клеток от стены)
  _freeCellEdge(excl = 3) {
    const W = this.mapW,
      H = this.mapH,
      EDGE = 6;
    let att = 200;
    while (att-- > 0) {
      // Случайно выбираем одну из 4 полос
      const side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0) {
        x = rndInt(1, W - 2) + 0.5;
        y = rndInt(1, EDGE) + 0.5;
      } // верх
      else if (side === 1) {
        x = rndInt(1, W - 2) + 0.5;
        y = rndInt(H - EDGE, H - 2) + 0.5;
      } // низ
      else if (side === 2) {
        x = rndInt(1, EDGE) + 0.5;
        y = rndInt(1, H - 2) + 0.5;
      } // лево
      else {
        x = rndInt(W - EDGE, W - 2) + 0.5;
        y = rndInt(1, H - 2) + 0.5;
      } // право
      if (!this.isBlocked(x, y)) {
        let ok = true;
        for (const t of this.tanks)
          if (dist({ x, y }, t) < excl) {
            ok = false;
            break;
          }
        if (ok) return { x, y };
      }
    }
    return this.freeCell(excl);
  }

  // zone: yMin..yMax (в клетках) — для командного спавна
  freeCellZone(yMin, yMax, excl = 3) {
    let att = 200;
    while (att-- > 0) {
      const x = rndInt(2, this.mapW - 3) + 0.5;
      const y =
        rndInt(Math.max(2, yMin), Math.min(this.mapH - 3, yMax - 1)) +
        0.5;
      if (!this.isBlocked(x, y)) {
        let ok = true;
        for (const t of this.tanks)
          if (dist({ x, y }, t) < excl) {
            ok = false;
            break;
          }
        if (ok) return { x, y };
      }
    }
    return this.freeCell(excl); // fallback на всю карту
  }

  spawnTanks(config) {
    // Используем пресет если выбран, иначе botClasses из index.js
    const activeBots =
      typeof getActiveBotClasses === "function"
        ? getActiveBotClasses()
        : botClasses;
    // Команды из пресета (если есть)
    const preset =
      typeof battleTeamsPresets !== "undefined"
        ? battleTeamsPresets[activePresetIdx]
        : null;
    // Команда каждого слота (порядок как в getActiveBotClasses). Считаем по слотам,
    // а не по имени класса — иначе команды из одинаковых ботов сливаются в одну.
    const slotTeams = [];
    if (preset && preset.teams && !preset.customClasses) {
      for (const [teamName, t] of Object.entries(preset.teams)) {
        for (let i = 0; i < t.count; i++) slotTeams.push(teamName);
      }
    }
    const teamOf = (BC, i) => slotTeams[i] || BC.botTeam || null;

    let id = 0;
    const usedColors = new Set();

    // Командный спавн: собираем уникальные команды, делим карту
    const teamZones = {};
    if (config.teamSpawn || config.assault) {
      const allTeams = new Set();
      activeBots.forEach((BC, i) => {
        const team = teamOf(BC, i);
        if (team) allTeams.add(team);
      });
      if (config.playerTeam) allTeams.add(config.playerTeam);
      const teams = [...allTeams];
      if (teams.length >= 2) {
        const H = this.mapH;
        if (config.assault) {
          // Режим Штурм: спавн не далее 3 клеток от ворот
          const ASSAULT_STRIP = 3;
          teams.forEach((t, i) => {
            if (i === 0)
              teamZones[t] = { yMin: 1, yMax: 1 + ASSAULT_STRIP };
            else
              teamZones[t] = { yMin: H - 1 - ASSAULT_STRIP, yMax: H - 2 };
          });
        } else {
          // Обычный командный спавн — полоса 4 клетки у стены
          const STRIP = 4;
          teams.forEach((t, i) => {
            if (i === 0) {
              teamZones[t] = { yMin: 1, yMax: 1 + STRIP };
            } else if (i === teams.length - 1) {
              teamZones[t] = { yMin: H - 1 - STRIP, yMax: H - 2 };
            } else {
              const spread = Math.floor(H / (teams.length + 1)) * i;
              teamZones[t] = {
                yMin: STRIP + spread,
                yMax: STRIP + spread + STRIP,
              };
            }
          });
        }
      }
    }

    const getPos = (team) => {
      if (team && teamZones[team])
        return this.freeCellZone(
          teamZones[team].yMin,
          teamZones[team].yMax,
        );
      return this.freeCell();
    };

    let _rbIdx = 0; // royal battle unique team index
    for (const [slot, BC] of activeBots.entries()) {
      let team = teamOf(BC, slot);
      // Королевская битва: каждый бот — отдельная команда
      if (isRoyalBattle()) team = null; // каждый сам за себя
      const pos = isRoyalBattle() ? this._freeCellEdge() : getPos(team);
      let color = BOT_COLORS[id % BOT_COLORS.length];
      for (const col of BOT_COLORS) {
        if (!usedColors.has(col)) {
          color = col;
          break;
        }
      }
      usedColors.add(color);
      const name = (BC.botName || BC.name) + "-" + id;
      let bot;
      try {
        bot = new BC(
          id++,
          pos.x,
          pos.y,
          rnd(0, Math.PI * 2),
          color,
          name,
        );
      } catch (e) {
        console.error(
          `[Loader] Ошибка конструктора ${BC.botName || BC.name}:`,
          e.message,
        );
        id++;
        continue; // пропускаем сломанного бота
      }
      // Sandbox: оборачиваем колбэки бота в Proxy — бот получает только белый список API
      if (typeof makeBotProxy === "function") {
        const proxy = makeBotProxy(bot);
        // Перехватываем вызовы main/callbacks — внутри них this = proxy
        for (const cb of [
          "main",
          "onLaserScan",
          "onLaserDetection",
          "onSound",
          "onRadio",
          "onDamage",
        ]) {
          const orig = bot[cb].bind(proxy);
          bot[cb] = function (...args) {
            return orig(...args);
          };
        }
      }
      if (team) bot.team = team;
      this.tanks.push(bot);
    }
    if (config.hasPlayer) {
      const pos = getPos(config.playerTeam);
      this.player = new Player(id++, pos.x, pos.y);
      if (config.playerTeam) this.player.team = config.playerTeam;
      this.tanks.push(this.player);
    }
  }

  isBlocked(x, y) {
    const cx = Math.floor(x),
      cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= this.mapW || cy >= this.mapH)
      return true;
    return this.map[cy][cx] === 1;
  }

  isTankBlocked(x, y, self = null) {
    const r = TANK_RADIUS,
      d = r * 0.707;
    for (const [cx, cy] of [
      [x - r, y],
      [x + r, y],
      [x, y - r],
      [x, y + r],
      [x - d, y - d],
      [x + d, y - d],
      [x - d, y + d],
      [x + d, y + d],
    ]) {
      const gx = Math.floor(cx),
        gy = Math.floor(cy);
      if (
        gx < 0 ||
        gy < 0 ||
        gx >= this.mapW ||
        gy >= this.mapH ||
        this.map[gy][gx] === 1
      )
        return true;
    }
    // Коллизия с другими танками и остовами
    if (self) {
      const minDist = TANK_RADIUS * 2;
      for (const t of this.tanks) {
        if (t === self) continue;
        if (!t.alive && !t.isWreck) continue; // исчезнувшие — не блокируют
        if (!t.alive && t.isWreck && !cfg.wrecks) continue; // остовы только если включено
        if (dist({ x, y }, t) < minDist) return true;
      }
    }
    return false;
  }

  segmentHitsWall(x1, y1, x2, y2) {
    const steps =
      Math.ceil(dist({ x: x1, y: y1 }, { x: x2, y: y2 }) / 0.3) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        x = x1 + (x2 - x1) * t,
        y = y1 + (y2 - y1) * t;
      const cx = Math.floor(x),
        cy = Math.floor(y);
      if (
        cx < 0 ||
        cy < 0 ||
        cx >= this.mapW ||
        cy >= this.mapH ||
        this.map[cy][cx] === 1
      )
        return true;
    }
    return false;
  }

  inSmoke(x, y) {
    return this.smokes.some((s) => s.alive() && s.contains(x, y));
  }
  emitSound(x, y, type, owner = null) {
    this.sounds.push({ x, y, type, owner });
  }

  castLaser(fromTank, angle) {
    const step = 0.05;
    let rx = fromTank.x,
      ry = fromTank.y;
    const dx = Math.cos(angle) * step,
      dy = Math.sin(angle) * step;
    let d = 0;
    const maxDist = Math.max(this.mapW, this.mapH) * 1.5;
    let inSmokePrev = false;
    while (d < maxDist) {
      rx += dx;
      ry += dy;
      d += step;
      const cx = Math.floor(rx),
        cy = Math.floor(ry);
      if (cx < 0 || cy < 0 || cx >= this.mapW || cy >= this.mapH) break;
      // Проверяем базы ДО проверки стены — только клетки ворот (плоский объект)
      if (cfg.assault && this.bases) {
        for (const base of this.bases) {
          if (!base.alive || base === fromTank) continue;
          // Ворота занимают строку y=0 (или y=H-1) и 4 клетки по x
          const gateY = base.y < 2 ? 0 : this.mapH - 1;
          const gsX = Math.round(base.x - 1.5); // первая клетка ворот
          const hitGateRow = Math.floor(ry) === gateY;
          const hitGateCol =
            Math.floor(rx) >= gsX && Math.floor(rx) <= gsX + 3;
          if (hitGateRow && hitGateCol) {
            base.irradiated = true;
            base.irradiatedBy = fromTank;
            const hostile = fromTank.isEnemy(base);
            return {
              dist: d,
              isEnemy: hostile,
              hitX: rx,
              hitY: ry,
              inSmoke: false,
              target: base,
              isDead: false,
              isBase: true,
            };
          }
        }
      }
      if (this.map[cy][cx] === 1)
        return {
          dist: d,
          isEnemy: false,
          hitX: rx,
          hitY: ry,
          inSmoke: false,
          target: null,
        };
      const inSmk = this.inSmoke(rx, ry);
      // Лазер останавливается на ГРАНИЦЕ дыма (даже собственного)
      if (inSmk && !inSmokePrev && d > 0.3) {
        return {
          dist: d,
          isEnemy: false,
          hitX: rx,
          hitY: ry,
          inSmoke: true,
          target: null,
        };
      }
      inSmokePrev = inSmk;
      for (const tank of this.tanks) {
        if (tank === fromTank) continue;
        // Пропускаем мёртвых если остовы отключены
        if (!tank.alive && (!tank.isWreck || !cfg.wrecks)) continue;
        if (dist({ x: rx, y: ry }, { x: tank.x, y: tank.y }) < 0.4) {
          const isDead = !tank.alive && tank.isWreck;
          // Обычный лазер: стоячий живой танк воспринимается как препятствие (стена)
          // Умный лазер с опознаванием стоячих — всегда видит танк как танк
          const isStill = !isDead && Math.abs(tank.speed) < 0.15;
          // irradiated выставляем ВСЕГДА — СПО цели срабатывает независимо от поколения
          if (!isDead) {
            tank.irradiated = true;
            tank.irradiatedBy = fromTank;
          }

          // Поколение 0 (Ранний): вообще не различает танк и стену
          if (cfg.laserGen === 0) {
            return {
              dist: d,
              isEnemy: false,
              hitX: rx,
              hitY: ry,
              inSmoke: inSmk,
              target: null,
              isDead: false,
            };
          }

          // Поколение 1 (Доплер): не видит стоячих и нотчингующих (перпендикулярное движение)
          if (cfg.laserGen === 1) {
            if (isStill) {
              return {
                dist: d,
                isEnemy: false,
                hitX: rx,
                hitY: ry,
                inSmoke: inSmk,
                target: null,
                isDead: false,
              };
            }
            // Нотч: радиальная скорость = speed * cos(угол_между_курсом_и_лучом)
            const laserAngle = Math.atan2(
              tank.y - fromTank.y,
              tank.x - fromTank.x,
            );
            const relAngle = normAngle(tank.angle - laserAngle);
            // Проекция скорости на луч — если близко к 0 (перпендикулярно) — невидим
            const radialSpd = Math.abs(tank.speed * Math.cos(relAngle));
            if (radialSpd < 0.5) {
              // < ~0.5 кл/сек радиальной скорости = нотч
              return {
                dist: d,
                isEnemy: false,
                hitX: rx,
                hitY: ry,
                inSmoke: inSmk,
                target: null,
                isDead: false,
              };
            }
          }

          // Поколение 2 (ЛИДАР): видит всех
          const hostile = !inSmk && !isDead && fromTank.isEnemy(tank);
          const smartInfo =
            cfg.laserGen >= 1 && !isDead
              ? {
                  targetSpeed: tank.speed,
                  targetAngle: normDeg(tank.angle),
                }
              : null;
          return {
            dist: d,
            isEnemy: hostile,
            isDead,
            hitX: rx,
            hitY: ry,
            inSmoke: inSmk,
            target: tank,
            smart: smartInfo,
          };
        }
      }
    }
    return null;
  }

  update(dt) {
    if (!this.running) return;
    this.sounds = [];
    this.radioMessages = [];
    this._radioMsgCount = 0; // счётчик broadcast за тик
    this.radioWaves = this.radioWaves.filter((w) => {
      w.r += SOUND_RANGE * 1.5 * 0.1;
      w.life -= 0.1;
      return w.life > 0;
    });
    this.smokes = this.smokes.filter((s) => {
      s.update(dt);
      return s.alive();
    });
    this.grenades = this.grenades.filter((g) => {
      g.update(dt, this);
      return g.alive;
    });
    for (const d of this.debris) d.update(dt);
    for (const b of this.bases) if (b.alive) b.update(dt, this);
    this.wreckFires = this.wreckFires.filter((f) => {
      f.update(dt);
      return f.alive();
    });
    this.wallParticles = this.wallParticles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(p.type === "spark" ? 0.3 : 0.15, dt);
      p.vy *= Math.pow(p.type === "spark" ? 0.3 : 0.15, dt);
      p.life -= dt;
      return p.life > 0;
    });
    this.pturs = this.pturs.filter((p) => {
      p.update(dt, this);
      return p.alive;
    });
    this.explosions = this.explosions.filter((e) => {
      e.update(dt);
      return e.alive();
    });
    // Сброс irradiated перед проходом
    for (const t of this.tanks) {
      t.irradiated = false;
      t.irradiatedBy = null;
    }
    for (const b of this.bases) {
      b.irradiated = false;
      b.irradiatedBy = null;
    }
    // Проход 1: физика + лазеры (irradiated устанавливается)
    for (const t of this.tanks) t.updatePhysicsAndLaser(dt, this);
    // Проход 2: AI (видит irradiated, вызывает колбэки, может вызвать broadcast)
    for (const t of this.tanks) t.updateAI(dt, this);
    // Проход 3: доставка радио — ПОСЛЕ того как все боты отработали AI
    // Так broadcast одного бота гарантированно дойдёт до всех союзников
    if (this.radioMessages.length > 0)
      for (const t of this.tanks) if (t.alive) t.deliverRadio(this);
  }

  _showAssaultResult() {
    const ds = document.getElementById("deathScreen");
    if (!ds) return;
    const title = document.getElementById("deathTitle");
    const msg = document.getElementById("deathMsg");
    const hasPlayer = !!this.player;
    const playerTeam = this.player && this.player.team;
    const won = playerTeam === this._assaultWinner;
    if (hasPlayer) {
      title.textContent = won ? "ПОБЕДА!" : "ПОРАЖЕНИЕ";
      title.style.color = won ? "#00ff88" : "#ff2244";
    } else {
      title.textContent = "ПОБЕДА КОМАНДЫ";
      title.style.color = "#ffaa00";
    }
    msg.textContent = `Команда "${this._assaultWinner}" победила! Причина: уничтожена ${this._assaultReason} команды "${this._assaultLoser}".`;
    ds.style.display = "flex";
  }

  log(msg, type = "") {
    this.logs.unshift({ msg, type });
    if (this.logs.length > 20) this.logs.pop();
    const box = document.getElementById("logBox");
    if (!box) return;
    const div = document.createElement("div");
    div.className = "log-entry " + type;
    div.textContent = msg;
    box.prepend(div);
    if (box.children.length > 15) box.removeChild(box.lastChild);
  }

  checkWin() {
    const alive = this.tanks.filter((t) => t.alive && !t.isBaseObj);

    // Режим Штурм: победа если база врага уничтожена ИЛИ все танки врага мертвы
    if (cfg.assault && this.bases.length >= 2) {
      const teamGroups = {};
      for (const t of this.tanks)
        if (t.team && !t.isBaseObj) {
          if (!teamGroups[t.team])
            teamGroups[t.team] = { tanks: [], base: null };
          teamGroups[t.team].tanks.push(t);
        }
      for (const b of this.bases)
        if (b.team && teamGroups[b.team]) teamGroups[b.team].base = b;
      for (const [team, g] of Object.entries(teamGroups)) {
        const enemyTeams = Object.keys(teamGroups).filter(
          (t) => t !== team,
        );
        for (const et of enemyTeams) {
          const eg = teamGroups[et];
          const baseDestroyed = eg.base !== null && !eg.base.alive; // null = нет базы (не считается уничтоженной)
          const allDead = eg.tanks.every((t) => !t.alive);
          if (baseDestroyed || allDead) {
            this.running = false;
            this._assaultWinner = team;
            this._assaultLoser = et;
            this._assaultReason = baseDestroyed ? "база" : "все танки";
            setTimeout(() => this._showAssaultResult(), 800);
            return;
          }
        }
      }
      return; // В штурме обычная победа не применяется
    }

    // Обычный режим: все выжившие из одной команды
    let teamWin = null;
    if (alive.length > 0) {
      const teams = new Set(alive.map((t) => t.team));
      const realTeams = [...teams].filter((t) => t !== null);
      if (
        realTeams.length === 1 &&
        [...teams].every((t) => t === realTeams[0])
      ) {
        teamWin = realTeams[0];
      }
    }

    const gameOver = alive.length <= 1 || teamWin !== null;
    if (!gameOver) return;

    this.running = false;
    this.winner = alive.length === 1 ? alive[0] : null;

    setTimeout(() => {
      const ds = document.getElementById("deathScreen");
      if (!ds) return;
      const title = document.getElementById("deathTitle");
      const msg = document.getElementById("deathMsg");
      const hasPlayer = !!this.player;
      const playerAlive = this.player && this.player.alive;

      if (teamWin) {
        // Командная победа
        const playerWins = playerAlive && this.player.team === teamWin;
        if (playerWins) {
          title.textContent = "ПОБЕДА КОМАНДЫ!";
          title.style.color = "#00ff88";
        } else if (hasPlayer) {
          title.textContent = "ПОРАЖЕНИЕ";
          title.style.color = "#ff2244";
        } else {
          title.textContent = "ПОБЕДА КОМАНДЫ";
          title.style.color = "#ffaa00";
        }
        const survivors = alive.filter((t) => t.team === teamWin);
        msg.textContent = `Команда "${teamWin}" победила! Выжило: ${survivors.length}`;
      } else if (this.winner && this.winner.isPlayer()) {
        title.textContent = "ПОБЕДА!";
        title.style.color = "#00ff88";
        msg.textContent = "Все враги уничтожены.";
      } else if (this.winner) {
        title.textContent = hasPlayer ? "ПОРАЖЕНИЕ" : "ПОБЕДИТЕЛЬ";
        title.style.color = hasPlayer ? "#ff2244" : "#ffaa00";
        msg.textContent = "Победитель: " + this.winner.label;
      } else {
        title.textContent = "НИЧЬЯ";
        title.style.color = "#888";
        msg.textContent = "";
      }
      ds.style.display = "flex";
    }, 1500);
  }
}

