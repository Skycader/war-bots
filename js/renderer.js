"use strict";

// ═══════════════════ ЦВЕТА КОМАНД ═══════════════════
const _teamColorCache = {};
const _teamPalette = [
  "#ff4466",
  "#4488ff",
  "#ffcc00",
  "#44ffaa",
  "#ff8800",
  "#cc44ff",
  "#00ccff",
  "#ff44cc",
];
let _teamColorIdx = 0;
function teamColor(team) {
  if (!team) return "#ffaa00";
  if (!_teamColorCache[team]) {
    _teamColorCache[team] =
      _teamPalette[_teamColorIdx++ % _teamPalette.length];
  }
  return _teamColorCache[team];
}

// ═══════════════════ РЕНДЕРЕР ═══════════════════
class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.resize();
  }
  resize() {
    this.canvas.width = this.game.mapW * CELL;
    this.canvas.height = this.game.mapH * CELL;
  }

  draw() {
    const ctx = this.ctx,
      g = this.game,
      C = CELL;
    ctx.fillStyle = "#050805";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Предвычисляем позиции ворот (нужно и внутри и снаружи visMode блока)
    const gateSet = new Set();
    if (cfg.assault && g._gateStart !== undefined) {
      const gs = g._gateStart;
      for (let dx = 0; dx <= 3; dx++) {
        gateSet.add(0 + "," + (gs + dx));
        gateSet.add(g.mapH - 1 + "," + (gs + dx));
      }
    }

    // Карта
    if (cfg.visMode === "map" || cfg.visMode === "all") {
      ctx.strokeStyle = "rgba(0,80,20,0.2)";
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= g.mapW; x++) {
        ctx.beginPath();
        ctx.moveTo(x * C, 0);
        ctx.lineTo(x * C, g.mapH * C);
        ctx.stroke();
      }
      for (let y = 0; y <= g.mapH; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * C);
        ctx.lineTo(g.mapW * C, y * C);
        ctx.stroke();
      }

      for (let y = 0; y < g.mapH; y++)
        for (let x = 0; x < g.mapW; x++)
          if (g.map[y][x] === 1) {
            const gateKey = y + "," + x;
            if (gateSet.has(gateKey)) {
              // Пропускаем — ворота рисуются отдельно ниже
            } else {
              ctx.fillStyle = "#1a3a1a";
              ctx.fillRect(x * C, y * C, C, C);
              ctx.strokeStyle = "#2a5a2a";
              ctx.lineWidth = 1;
              ctx.strokeRect(x * C + 0.5, y * C + 0.5, C - 1, C - 1);
            }
          }
    }

    // Ворота баз — рисуются всегда (независимо от visMode)
    for (const base of g.bases || []) {
      const gs =
        g._gateStart !== undefined
          ? g._gateStart
          : Math.round(base.x) - 1;
      const by = base.y < 2 ? 0 : g.mapH - 1;
      const col = base.alive ? base.color : "#444";
      const hp = base.hp / base.maxHp;
      // 4 клетки ворот — жёлтый цвет
      const wy = by * C;
      for (let dx = 0; dx <= 3; dx++) {
        const wx = (gs + dx) * C;
        ctx.fillStyle = base.alive
          ? "rgba(40,30,0,0.95)"
          : "rgba(20,20,20,0.9)";
        ctx.fillRect(wx, wy, C, C);
        ctx.strokeStyle = base.alive ? "#ffcc00" : "#555";
        ctx.lineWidth = 2;
        ctx.globalAlpha = base.alive ? 1 : 0.35;
        ctx.strokeRect(wx + 1, wy + 1, C - 2, C - 2);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = base.alive ? "#ffcc00" : col;
      ctx.globalAlpha = base.alive ? 0.5 : 0.15;
      ctx.lineWidth = 1.5;
      const x0 = gs * C,
        x1 = (gs + 4) * C,
        wy2 = by * C;
      for (let i = 1; i <= 3; i++) {
        const ly = wy2 + (C * i) / 4;
        ctx.beginPath();
        ctx.moveTo(x0 + 2, ly);
        ctx.lineTo(x1 - 2, ly);
        ctx.stroke();
      }
      // Вертикальные столбы по краям
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, wy2);
      ctx.lineTo(x0, wy2 + C);
      ctx.moveTo(x1, wy2);
      ctx.lineTo(x1, wy2 + C);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // HP бар — прямо под/над воротами (в сторону поля)
      if (base.alive) {
        const barY = by === 0 ? wy2 + C + 2 : wy2 - 8;
        ctx.fillStyle = "#0a1a0a";
        ctx.fillRect(x0, barY, C * 3, 5);
        ctx.fillStyle =
          hp > 0.5 ? "#00cc44" : hp > 0.25 ? "#ffaa00" : "#ff2222";
        ctx.fillRect(x0, barY, C * 3 * hp, 5);
        // Название
        ctx.fillStyle = col;
        ctx.font = "bold 7px Share Tech Mono";
        ctx.textAlign = "center";
        ctx.fillText(
          "База " + base.team,
          (gs + 2) * C,
          by === 0 ? wy + C + 16 : wy - 10,
        );
        ctx.textAlign = "left";
      }

      // Полукруг зоны хила/пополнения
      if (base.alive && cfg.baseZone) {
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = "#00ff88";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        const hcx = (gs + 2) * C,
          hcy = by === 0 ? wy2 + C : wy2;
        ctx.arc(
          hcx,
          hcy,
          Base.HEAL_RADIUS * C,
          by === 0 ? 0 : Math.PI,
          by === 0 ? Math.PI : Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
        // Заливка зоны
        ctx.globalAlpha = 0.04;
        ctx.fillStyle = "#00ff88";
        ctx.beginPath();
        ctx.arc(
          hcx,
          hcy,
          Base.HEAL_RADIUS * C,
          by === 0 ? 0 : Math.PI,
          by === 0 ? Math.PI : Math.PI * 2,
        );
        ctx.fill();
        ctx.globalAlpha = 1;
        // Иконки что восполняется
        ctx.fillStyle = "#00ff88";
        ctx.font = "7px Share Tech Mono";
        ctx.globalAlpha = 0.7;
        ctx.textAlign = "center";
        ctx.fillText(
          "HP ♦ БК ♦ ДЫМ",
          hcx,
          by === 0
            ? hcy + Base.HEAL_RADIUS * C + 10
            : hcy - Base.HEAL_RADIUS * C - 3,
        );
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      }
    }

    // Лазерные метки
    if (g.player) {
      for (const dot of g.player.dots) {
        const alpha = Math.min(1, dot.life / dot.maxLife);
        ctx.fillStyle = dot.inSmoke
          ? `rgba(200,200,200,${alpha})`
          : dot.isEnemy
            ? `rgba(255,30,50,${alpha})`
            : `rgba(0,200,80,${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(dot.x * C, dot.y * C, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = dot.isEnemy
          ? `rgba(255,100,100,${alpha})`
          : dot.inSmoke
            ? `rgba(200,200,200,${alpha * 0.5})`
            : `rgba(0,255,100,${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Летящие дымовые гранаты
    for (const gr of g.grenades || []) {
      if (!gr.alive) continue;
      ctx.save();
      ctx.translate(gr.x * CELL, gr.y * CELL);
      ctx.rotate(gr.angle);
      // Корпус — маленький цилиндр 3×1.5 px
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#4a6a40";
      ctx.beginPath();
      ctx.ellipse(0, 0, 3, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Жёлтая полоска — маркировка дымового боеприпаса
      ctx.fillStyle = "rgba(255,210,30,0.95)";
      ctx.fillRect(-0.3, -1.5, 1.2, 3);
      // Носик
      ctx.fillStyle = "#223322";
      ctx.beginPath();
      ctx.ellipse(3, 0, 1.2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Дым
    for (const s of g.smokes) {
      const lf = s.life / s.maxLife,
        sx = s.x * C,
        sy = s.y * C,
        sr = s.radius * C;
      if (cfg.visMode === "all") {
        const alpha = 0.55 + lf * 0.2;
        const gr = ctx.createRadialGradient(sx, sy, sr * 0.1, sx, sy, sr);
        gr.addColorStop(0, `rgba(210,215,220,${alpha})`);
        gr.addColorStop(0.5, `rgba(170,178,185,${alpha * 0.9})`);
        gr.addColorStop(0.85, `rgba(120,128,135,${alpha * 0.7})`);
        gr.addColorStop(1, "rgba(80,88,95,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const alpha = lf * 0.45,
          gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        gr.addColorStop(0, `rgba(180,180,180,${alpha})`);
        gr.addColorStop(1, "rgba(100,100,100,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Взрывы
    for (const exp of g.explosions) {
      const t = exp.life / exp.maxLife,
        ballR = (1 - t) * C * 1.4 + C * 0.3;
      const gr = ctx.createRadialGradient(
        exp.x,
        exp.y,
        0,
        exp.x,
        exp.y,
        ballR,
      );
      gr.addColorStop(0, `rgba(255,255,200,${t * 0.95})`);
      gr.addColorStop(0.3, `rgba(255,160,20,${t * 0.8})`);
      gr.addColorStop(0.7, `rgba(200,40,0,${t * 0.5})`);
      gr.addColorStop(1, "rgba(50,10,0,0)");
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, ballR, 0, Math.PI * 2);
      ctx.fill();
      for (const p of exp.particles) {
        if (p.life <= 0) continue;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (p.life / p.maxLife), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ПТУР — видно всегда (физический объект)
    for (const p of g.pturs) {
      for (let i = 0; i < p.trail.length; i++) {
        const t = p.trail[i],
          fr = i / p.trail.length;
        ctx.fillStyle = `rgba(255,${Math.floor(100 + fr * 120)},0,${fr * 0.6})`;
        ctx.beginPath();
        ctx.arc(t.x * C, t.y * C, fr * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(p.x * C, p.y * C);
      ctx.rotate(p.angle);
      ctx.fillStyle = "#ccddee";
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff4422";
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(2, -1.5);
      ctx.lineTo(2, 1.5);
      ctx.closePath();
      ctx.fill();
      const fl = 3 + Math.random() * 3,
        fg = ctx.createLinearGradient(-5, 0, -5 - fl, 0);
      fg.addColorStop(0, "rgba(255,200,50,0.9)");
      fg.addColorStop(1, "rgba(255,80,0,0)");
      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-5 - fl, 0);
      ctx.stroke();
      // LED индикатор наведения: мигает красным если лазер захвачен, гаснет если нет
      if (p.canGuide && p._beamClose) {
        const ledOn = Math.floor(Date.now() / 120) % 2 === 0;
        if (ledOn) {
          // LED в носу ракеты (красный треугольник находится в +X)
          ctx.fillStyle = "rgba(255,30,30,0.95)";
          ctx.shadowColor = "#ff0000";
          ctx.shadowBlur = 5;
          ctx.beginPath();
          ctx.arc(5, 0, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      ctx.restore();
    }

    // Лазерные лучи
    for (const tank of g.tanks) {
      if (!tank.alive) continue;
      const isCont = tank.laserContinuous;
      const hasTrace = isCont || tank.renderLaserLife > 0;
      const visible = tank.isPlayer()
        ? hasTrace
        : cfg.visMode === "all" && hasTrace;
      if (!visible) continue;
      const life = isCont ? 1 : tank.renderLaserLife || 0;
      const alpha = isCont ? 0.75 : life * 0.8;
      if (alpha < 0.01) continue;
      // Конец луча — из сохранённых координат (обновляются каждый тик пока активен)
      const ex =
        tank.renderLaserEndX !== undefined
          ? tank.renderLaserEndX
          : tank.x + Math.cos(tank.turretAngle) * 50;
      const ey =
        tank.renderLaserEndY !== undefined
          ? tank.renderLaserEndY
          : tank.y + Math.sin(tank.turretAngle) * 50;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = tank.isPlayer() ? "#00ff88" : tank.color;
      ctx.lineWidth = isCont ? 2 : 1;
      ctx.setLineDash(isCont ? [5, 3] : [1, 6]);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tank.x * C, tank.y * C);
      ctx.lineTo(ex * C, ey * C);
      ctx.stroke();
      // Точка попадания
      if (isCont && tank.laserResult) {
        ctx.setLineDash([]);
        ctx.fillStyle = tank.isPlayer() ? "#00ff88" : tank.color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(ex * C, ey * C, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // СПО-индикаторы облучения вокруг танка игрока
    if (
      g.player &&
      g.player.alive &&
      g.player.irradiated &&
      g.player.irradiatedBy
    ) {
      const p = g.player;
      const px = p.x * CELL,
        py = p.y * CELL;
      const src = p.irradiatedBy;
      const angle = Math.atan2(src.y - p.y, src.x - p.x);
      const R = CELL * 1.6; // радиус кольца вокруг танка
      const arrowX = px + Math.cos(angle) * R;
      const arrowY = py + Math.sin(angle) * R;
      const blink = Math.floor(Date.now() / 180) % 2 === 0;

      ctx.save();
      // Пульсирующее кольцо
      ctx.globalAlpha = blink ? 0.85 : 0.45;
      ctx.strokeStyle = "#ff2222";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(px, py, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Стрелка-указатель в направлении источника
      ctx.globalAlpha = blink ? 0.95 : 0.6;
      ctx.fillStyle = "#ff2222";
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 8;
      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Дистанция до источника
      const dToSrc = Math.sqrt((src.x - p.x) ** 2 + (src.y - p.y) ** 2);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#ff4444";
      ctx.font = "bold 8px Share Tech Mono";
      ctx.textAlign = "center";
      ctx.shadowBlur = 4;
      ctx.fillText(
        "⚠ " + Math.round(normDeg(angle)) + "°",
        arrowX,
        arrowY - (blink ? 12 : 10),
      );
      ctx.textAlign = "left";
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Радиоволны
    if (cfg.radioWaves && g.radioWaves) {
      for (const w of g.radioWaves) {
        ctx.save();
        ctx.globalAlpha = w.life * 0.5;
        ctx.strokeStyle = "#00ffcc";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.arc(w.x * C, w.y * C, w.r * C, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Радиус шума танков
    // Игрок — всегда. Боты — если в радиусе SOUND_RANGE от игрока.
    if (cfg.noiseRadius) {
      for (const tank of g.tanks) {
        if (!tank.alive) continue;
        if (!tank.isPlayer()) {
          // Если игрок есть — показываем только ботов в радиусе слышимости
          // Если игрока нет (режим наблюдения) — показываем всех
          const player = g.player;
          if (player) {
            const d = dist(
              { x: tank.x, y: tank.y },
              { x: player.x, y: player.y },
            );
            if (d > SOUND_RANGE) continue;
          }
        }
        const spd = Math.abs(tank.speed);
        if (spd < 0.3) continue;
        // Мультипликатор: скорость 1→x1, 2→x2, 3→x3, 5→x5
        const mult = (spd / MAX_SPEED) * 5;
        const noiseR = ((SOUND_RANGE * mult) / 5) * C;
        ctx.save();
        ctx.strokeStyle = tank.isPlayer()
          ? "rgba(0,255,136,0.12)"
          : "rgba(255,180,0,0.10)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.arc(tank.x * C, tank.y * C, noiseR, 0, Math.PI * 2);
        ctx.stroke();
        // Внутренний круг — ближняя зона
        ctx.strokeStyle = tank.isPlayer()
          ? "rgba(0,255,136,0.22)"
          : "rgba(255,180,0,0.18)";
        ctx.beginPath();
        ctx.arc(tank.x * C, tank.y * C, noiseR * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Частицы ударов о стену (осколки и искры) — только в режиме all
    if (g.wallParticles && cfg.visMode === "all") {
      for (const p of g.wallParticles) {
        const fr = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha =
          p.type === "spark"
            ? fr * 0.95
            : p.type === "exhaust"
              ? fr * 0.85
              : fr * 0.7;
        if (p.type === "spark") {
          ctx.fillStyle = `hsl(${40 + fr * 20},100%,${60 + fr * 30}%)`;
          ctx.shadowColor = "#ffaa00";
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(p.x * C, p.y * C, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === "exhaust") {
          // Дым: растёт и тускнеет; small=true → радиус вдвое меньше
          const maxR = p.small ? C * 0.14 : C * 0.45;
          const r = maxR * (0.5 + 0.5 * (1 - fr));
          ctx.fillStyle = p.color || "#444";
          // Более чёткий дым — два слоя: тёмное ядро + светлый ореол
          ctx.beginPath();
          ctx.arc(p.x * C, p.y * C, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha *= 0.4;
          ctx.fillStyle = "#888";
          ctx.beginPath();
          ctx.arc(p.x * C, p.y * C, r * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = p.color || "#2a4a2a";
          ctx.fillRect(p.x * C - 1.5, p.y * C - 1.5, 3, 3);
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // Горение остовов — дым и огонь
    for (const fire of g.wreckFires) {
      for (const p of fire.particles) {
        const fr = Math.max(0, p.life / p.maxLife);
        ctx.save();
        if (p.isFire) {
          // Огонь — жёлто-оранжевый, яркий
          ctx.globalAlpha = fr * 0.9;
          ctx.fillStyle = `hsl(${30 + fr * 30},100%,${50 + fr * 20}%)`;
          ctx.shadowColor = "#ff6600";
          ctx.shadowBlur = 6;
        } else {
          // Дым — серо-чёрный, поднимается вверх (vy отрицательный = вверх на экране)
          ctx.globalAlpha = fr * 0.35;
          const gray = Math.floor(40 + fr * 60);
          ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
        }
        ctx.beginPath();
        ctx.arc(
          p.x * CELL,
          p.y * CELL,
          p.r * (0.5 + fr * 0.5),
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }

    // Остовы — корпус на месте (цвет сохранён, слегка потемневший)
    if (cfg.wrecks) {
      for (const tank of g.tanks) {
        if (tank.alive || !tank.isWreck) continue;
        if (cfg.visMode !== "all" && !tank.isPlayer()) continue;
        const px = tank.x * C,
          py = tank.y * C,
          sz = C * 0.6;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(tank.angle);
        ctx.globalAlpha = 0.55;

        // Корпус — тот же цвет что был, но затемнённый
        ctx.fillStyle = tank.color;
        ctx.fillRect(-sz * 0.6, -sz * 0.45, sz * 1.2, sz * 0.9);
        // Гусеничные полосы
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(-sz * 0.6, -sz * 0.45, sz * 1.2, sz * 0.22);
        ctx.fillRect(-sz * 0.6, sz * 0.23, sz * 1.2, sz * 0.22);
        // Копоть поверх
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(-sz * 0.6, -sz * 0.45, sz * 1.2, sz * 0.9);
        // Пробоина
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.beginPath();
        ctx.arc(-sz * 0.15, sz * 0.05, sz * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(80,40,10,0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-sz * 0.15, sz * 0.05, sz * 0.16, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Обломки — башня и куски брони
      for (const d of g.debris) {
        const px = d.x * C,
          py = d.y * C,
          sz = C * 0.6;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(d.angle);
        ctx.globalAlpha = d.alpha;
        if (d.type === "turret") {
          // Башня — круг с обломком ствола
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(0, 0, sz * 0.28, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.4)";
          ctx.beginPath();
          ctx.arc(0, 0, sz * 0.28, 0, Math.PI * 2);
          ctx.fill();
          // Обломок ствола
          ctx.strokeStyle = d.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(sz * 0.28, 0);
          ctx.lineTo(sz * 0.55, sz * 0.15);
          ctx.stroke();
        } else {
          // Кусок брони — неровный четырёхугольник
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.moveTo(-sz * 0.18, -sz * 0.1);
          ctx.lineTo(sz * 0.18, -sz * 0.08);
          ctx.lineTo(sz * 0.15, sz * 0.12);
          ctx.lineTo(-sz * 0.12, sz * 0.1);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // Танки
    for (const tank of g.tanks) {
      if (!tank.alive) continue;
      if (tank.isBaseObj) continue; // базы рисуются отдельно
      if (cfg.visMode !== "all" && !tank.isPlayer()) continue;
      const px = tank.x * C,
        py = tank.y * C,
        sz = C * 0.6;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tank.angle);
      ctx.fillStyle = tank.color;
      ctx.fillRect(-sz * 0.6, -sz * 0.45, sz * 1.2, sz * 0.9);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(-sz * 0.6, -sz * 0.45, sz * 1.2, sz * 0.2);
      ctx.fillRect(-sz * 0.6, sz * 0.25, sz * 1.2, sz * 0.2);
      // Белое пятно сзади — обозначает корму
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(-sz * 0.5, 0, sz * 0.12, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      // Стрелка направления корпуса игрока (вперёд по курсу движения)
      if (cfg.playerArrow && tank.isPlayer()) {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(tank.angle);
        const r0 = sz * 0.95,
          r1 = sz * 1.65,
          hw = sz * 0.28;
        ctx.strokeStyle = "#00ff88";
        ctx.fillStyle = "#00ff88";
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r0, 0);
        ctx.lineTo(r1 - hw, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r1, 0);
        ctx.lineTo(r1 - hw, -hw * 0.8);
        ctx.lineTo(r1 - hw, hw * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tank.angle);
      ctx.rotate(-tank.angle);
      ctx.rotate(tank.turretAngle);
      ctx.fillStyle = tank.isPlayer() ? "#00cc66" : tank.color;
      ctx.beginPath();
      ctx.arc(0, 0, sz * 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Ствол: начинается у края башни, выходит за корпус
      ctx.fillStyle = tank.isPlayer() ? "#009944" : "#773300";
      ctx.fillRect(sz * 0.25, -sz * 0.065, sz * 0.65, sz * 0.13); // ствол выступает за корпус
      // Бронировка у основания ствола
      ctx.fillStyle = tank.isPlayer() ? "#00cc66" : tank.color;
      ctx.fillRect(sz * 0.22, -sz * 0.085, sz * 0.12, sz * 0.17);
      ctx.restore();
      if (tank.irradiated) {
        ctx.save();
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(px, py, sz * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (cfg.visMode === "all" || tank.isPlayer()) {
        const labelColor = tank.isPlayer()
          ? "#00ff88"
          : tank.team
            ? teamColor(tank.team)
            : "#ffaa00";
        ctx.fillStyle = labelColor;
        ctx.font = "7px Share Tech Mono";
        ctx.fillText(
          tank.label + (tank.team ? " [" + tank.team + "]" : ""),
          px - 22,
          py - sz * 0.55,
        );
        // HP бар (красный)
        const bw = sz * 1.2;
        ctx.fillStyle = "#0a1a0a";
        ctx.fillRect(px - bw / 2, py + sz * 0.5, bw, 3);
        const hpDisplay = cfg.immortal && tank.isPlayer() ? 100 : tank.hp;
        ctx.fillStyle =
          hpDisplay > 50
            ? "#cc2222"
            : hpDisplay > 20
              ? "#ff6622"
              : "#ff0000";
        ctx.fillRect(
          px - bw / 2,
          py + sz * 0.5,
          (bw * hpDisplay) / 100,
          3,
        );
        // Energy бар (жёлтый)
        ctx.fillStyle = "#0a1a0a";
        ctx.fillRect(px - bw / 2, py + sz * 0.5 + 4, bw, 2);
        ctx.fillStyle = "#ffaa00";
        ctx.fillRect(
          px - bw / 2,
          py + sz * 0.5 + 4,
          (bw * tank.energy) / 100,
          2,
        );
        // КД ПТУРа — голубой бар: полный = готов, пустой = перезаряжается
        {
          const pturMax = cfg.pturCD || 10;
          const pturFill =
            tank.pturCD > 0 ? 1 - tank.pturCD / pturMax : 1;
          const hasActivePtur = tank.activePTUR && tank.activePTUR.alive;
          ctx.fillStyle = "#0a1a0a";
          ctx.fillRect(px - bw / 2, py + sz * 0.5 + 7, bw, 2);
          // Цвет: голубой=готов, оранжевый=летит ПТУР, серый=перезаряжается
          ctx.fillStyle = hasActivePtur
            ? "#ff8800"
            : pturFill >= 1
              ? "#00aaff"
              : "#005588";
          ctx.fillRect(px - bw / 2, py + sz * 0.5 + 7, bw * pturFill, 2);
          // Мигающий пиксель-маркер «ГОТОВ»
          // Кружки боезапаса в режиме Штурм
          if (cfg.assault) {
            const ammo =
              tank.pturAmmo !== undefined ? tank.pturAmmo : cfg.pturAmmo;
            const maxAmmo = cfg.pturAmmo || 5;
            const dotSpacing = 4;
            const dotsW = (maxAmmo - 1) * dotSpacing;
            for (let ai = 0; ai < maxAmmo; ai++) {
              const ddx = px - dotsW / 2 + ai * dotSpacing;
              const ddy = py + sz * 0.5 + 11;
              ctx.beginPath();
              ctx.arc(ddx, ddy, 1.5, 0, Math.PI * 2);
              ctx.fillStyle = ai < ammo ? "#00aaff" : "#0a1a2a";
              ctx.fill();
              ctx.strokeStyle = ai < ammo ? "#0066cc" : "#1a3a4a";
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
          if (
            pturFill >= 1 &&
            !hasActivePtur &&
            Math.floor(Date.now() / 400) % 2 === 0
          ) {
            ctx.fillStyle = "#44ddff";
            ctx.fillRect(px + bw / 2 - 3, py + sz * 0.5 + 6, 3, 4);
          }
        }
      }
      // Речевые облачки say()
      if (tank._sayBubbles && tank._sayBubbles.length > 0) {
        const bubble = tank._sayBubbles[tank._sayBubbles.length - 1];
        const alpha = Math.min(1, bubble.life / 0.4); // fade out last 0.4s
        const text = bubble.text;
        ctx.save();
        ctx.font = "bold 8px Share Tech Mono";
        const tw = ctx.measureText(text).width;
        const bpad = 4,
          bw2 = tw + bpad * 2,
          bh = 13;
        const bx = px - bw2 / 2,
          by = py - sz * 0.55 - bh - 6;
        ctx.globalAlpha = alpha;
        // Фон облачка
        ctx.fillStyle = "rgba(240,240,220,0.95)";
        ctx.beginPath();
        ctx.roundRect
          ? ctx.roundRect(bx, by, bw2, bh, 3)
          : ctx.rect(bx, by, bw2, bh);
        ctx.fill();
        // Хвостик
        ctx.beginPath();
        ctx.moveTo(px - 4, by + bh);
        ctx.lineTo(px + 4, by + bh);
        ctx.lineTo(px, by + bh + 5);
        ctx.closePath();
        ctx.fill();
        // Обводка
        ctx.strokeStyle = "rgba(80,80,60,0.6)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // Текст
        ctx.fillStyle = "#1a1a00";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, px, by + bh / 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.restore();
      }
    }
  }
}

