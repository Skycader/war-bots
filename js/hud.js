"use strict";

// ═══════════════════ HUD ═══════════════════
function updateHUD() {
  const g = gameInstance;

  // Список участников — всегда (даже без игрока)
  const el = document.getElementById("enemyList");
  el.innerHTML = "";
  const sorted = [...g.tanks].sort((a, b) =>
    a.alive === b.alive ? 0 : a.alive ? -1 : 1,
  );
  for (const t of sorted) {
    const wrap = document.createElement("div");
    wrap.style.cssText = `margin-bottom:5px;padding:4px;border:1px solid ${t.alive ? "#1a3a1a" : "#1a1a1a"};opacity:${t.alive ? "1" : "0.4"}`;
    const nr = document.createElement("div");
    nr.style.cssText =
      "display:flex;align-items:center;gap:5px;margin-bottom:2px";
    const dot = document.createElement("span");
    dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${t.alive ? t.color : "#333"}`;
    nr.appendChild(dot);
    const name = document.createElement("span");
    name.style.cssText = `font-size:0.8em;color:${t.isPlayer() ? "#00ff88" : t.alive ? t.color : "#444"};flex:1;overflow:hidden;white-space:nowrap`;
    name.textContent = t.label;
    nr.appendChild(name);
    if (t.team) {
      const tb = document.createElement("span");
      tb.style.cssText = `font-size:0.65em;padding:0 3px;border-radius:2px;background:${teamColor(t.team)};color:#000;margin-left:2px;flex-shrink:0`;
      tb.textContent = t.team;
      nr.appendChild(tb);
    }
    const st = document.createElement("span");
    st.style.cssText = `font-size:0.7em;color:${t.alive ? "#446644" : "#662222"}`;
    st.innerHTML = t.alive ? "&#9679;" : "&#10005;";
    nr.appendChild(st);
    wrap.appendChild(nr);
    if (t.alive) {
      // HP бар
      const hpRow = document.createElement("div");
      hpRow.style.cssText =
        "display:flex;align-items:center;gap:3px;margin-top:1px";
      const hpLbl = document.createElement("span");
      hpLbl.style.cssText =
        "font-size:0.65em;color:#884444;min-width:20px";
      hpLbl.textContent = "HP";
      const hpBar = document.createElement("div");
      hpBar.style.cssText =
        "flex:1;height:4px;background:#0d1a0d;border:1px solid #1a1a1a";
      const hpFill = document.createElement("div");
      hpFill.style.cssText = `height:100%;width:${t.hp}%;background:${t.hp > 50 ? "#cc2222" : t.hp > 20 ? "#ff6622" : "#ff0000"};transition:width 0.15s`;
      hpBar.appendChild(hpFill);
      hpRow.appendChild(hpLbl);
      hpRow.appendChild(hpBar);
      wrap.appendChild(hpRow);
      // Energy бар
      const enRow = document.createElement("div");
      enRow.style.cssText =
        "display:flex;align-items:center;gap:3px;margin-top:1px";
      const enLbl = document.createElement("span");
      enLbl.style.cssText =
        "font-size:0.65em;color:#886600;min-width:20px";
      enLbl.textContent = "Е";
      const enBar = document.createElement("div");
      enBar.style.cssText =
        "flex:1;height:3px;background:#0d1a0d;border:1px solid #1a1a1a";
      const enFill = document.createElement("div");
      enFill.style.cssText = `height:100%;width:${t.energy}%;background:#ffaa00;transition:width 0.15s`;
      enBar.appendChild(enFill);
      enRow.appendChild(enLbl);
      enRow.appendChild(enBar);
      wrap.appendChild(enRow);
    }
    el.appendChild(wrap);
  }

  // Статус игрока
  const p = g.player;
  document.getElementById("playerHud").style.display = p
    ? "block"
    : "none";
  if (!p) return;

  if (cfg.immortal) {
    document.getElementById("hudHP").textContent = "∞";
    document.getElementById("barHP").style.width = "100%";
    document.getElementById("barHP").style.background = "#00cc66";
  } else {
    document.getElementById("hudHP").textContent = Math.round(p.hp);
    document.getElementById("barHP").style.width = p.hp + "%";
    document.getElementById("barHP").style.background =
      p.hp > 50 ? "#cc2222" : p.hp > 20 ? "#ff6622" : "#ff0000";
  }

  document.getElementById("hudEnergy").textContent =
    Math.round(p.energy) + "%";
  document.getElementById("barEnergy").style.width = p.energy + "%";
  document.getElementById("barEnergy").style.background =
    p.energy > 30 ? "#ffaa00" : "#ff6600";

  const pp = p.pturCD > 0 ? (1 - p.pturCD / cfg.pturCD) * 100 : 100;
  document.getElementById("hudPtur").textContent =
    p.pturCD > 0 ? p.pturCD.toFixed(1) + "с" : "ГОТОВ";
  // Боезапас — точки в режиме Штурм
  const ammoRow = document.getElementById("hudAmmoRow");
  const ammoDots = document.getElementById("hudAmmoDots");
  if (cfg.assault && ammoRow && ammoDots) {
    ammoRow.style.display = "flex";
    const ammo = p.pturAmmo !== undefined ? p.pturAmmo : cfg.pturAmmo;
    const max = cfg.pturAmmo || 5;
    let dotsHtml = "";
    for (let i = 0; i < max; i++) {
      const filled = i < ammo;
      dotsHtml += `<div style="width:8px;height:8px;border-radius:50%;background:${filled ? "#00aaff" : "#0a1a2a"};border:1px solid ${filled ? "#0066cc" : "#1a3a4a"}"></div>`;
    }
    ammoDots.innerHTML = dotsHtml;
  } else if (ammoRow) {
    ammoRow.style.display = "none";
  }
  document.getElementById("barPtur").style.width = pp + "%";

  const sp2 = p.smokeCD > 0 ? (1 - p.smokeCD / cfg.smokeCD) * 100 : 100;
  document.getElementById("hudSmoke").textContent =
    p.smokeCD > 0
      ? p.smokeCD.toFixed(1) + "с"
      : "ГОТОВ(" + p.smokeCount + ")";
  document.getElementById("barSmoke").style.width = sp2 + "%";

  document.getElementById("hudSpeed").textContent = Math.abs(
    p.speed,
  ).toFixed(1);
  document.getElementById("hudAngle").textContent = Math.round(
    normDeg(p.angle),
  );
  const gearEl = document.getElementById("hudGear");
  if (p.gear !== 0) {
    gearEl.style.display = "inline-block";
    gearEl.innerHTML =
      (p.gear > 0 ? "&#9658;" : "&#9668;") + Math.abs(p.gear);
  } else gearEl.style.display = "none";

  drawSPO(p);
  document.getElementById("hudLaser").textContent = p.laserContinuous
    ? "НЕПРЕРЫВНЫЙ"
    : p.renderLaserLife > 0
      ? "ИМПУЛЬС"
      : "ОТКЛ";
  if (p.laserResult) {
    document.getElementById("hudDist").textContent =
      p.laserResult.dist.toFixed(1) + "м";
    document.getElementById("hudTarget").textContent = p.laserResult
      .inSmoke
      ? "ДЫМ"
      : p.laserResult.isDead
        ? "ОСТОВ"
        : p.laserResult.isEnemy
          ? "⚠ ТАНК"
          : p.laserResult.target
            ? "союзник"
            : "стена";
  } else {
    document.getElementById("hudDist").textContent = "";
    document.getElementById("hudTarget").textContent = "—";
  }
  document.getElementById("spolAlert").style.display = p.irradiated
    ? "block"
    : "none";
}

// ═══════════════════ СПО ═══════════════════
function drawSPO(player) {
  const canvas = document.getElementById("spoCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d"),
    W = canvas.width,
    H = canvas.height,
    cx = W / 2,
    cy = H / 2,
    R = W / 2 - 4;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#050e05";
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a4a1a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#0d2a0d";
  ctx.lineWidth = 0.5;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,255,136,0.3)";
  ctx.lineWidth = 1;
  const ga = player.angle;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ga) * R * 0.8, cy + Math.sin(ga) * R * 0.8);
  ctx.stroke();
  const sp = document.getElementById("spoStatus"),
    sd = document.getElementById("spoDir");
  // Звуковые пинги (двигатели и выстрелы вокруг игрока)
  if (player._api_sounds && player._api_sounds.length > 0) {
    for (const s of player._api_sounds) {
      const rel = (s.angle * Math.PI) / 180 - player.angle;
      const rr = Math.min(R * 0.85, (s.dist / SOUND_RANGE) * R * 0.85);
      const sx = cx + Math.cos(rel) * rr,
        sy = cy + Math.sin(rel) * rr;
      if (s.soundType === "engine") {
        ctx.fillStyle = s.hostile
          ? "rgba(255,180,0,0.7)"
          : "rgba(0,200,100,0.7)";
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.soundType === "shot" || s.soundType === "explosion") {
        ctx.strokeStyle = s.hostile
          ? "rgba(255,80,80,0.9)"
          : "rgba(80,255,150,0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  if (player.irradiated && player.irradiatedBy) {
    const src = player.irradiatedBy,
      angle = Math.atan2(src.y - player.y, src.x - player.x),
      rel = angle - player.angle;
    const dx = Math.cos(rel) * R * 0.65,
      dy = Math.sin(rel) * R * 0.65;
    const gr = ctx.createRadialGradient(
      cx + dx,
      cy + dy,
      0,
      cx + dx,
      cy + dy,
      5,
    );
    gr.addColorStop(0, "rgba(255,50,50,0.95)");
    gr.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,50,50,0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.8, rel - 0.25, rel + 0.25);
    ctx.stroke();
    if (sp) sp.textContent = "⚠ ОБЛУЧЕНИЕ";
    if (sd) sd.textContent = Math.round(normDeg(angle)) + "°";
    if (!spoLastIrradiated) startSpoBeep();
    spoLastIrradiated = true;
  } else {
    const sndCount = player._api_sounds ? player._api_sounds.length : 0;
    if (sp)
      sp.textContent =
        sndCount > 0 ? `♪ звуков: ${sndCount}` : "нет облучения";
    if (sd) sd.textContent = "";
    if (spoLastIrradiated) stopSpoBeep();
    spoLastIrradiated = false;
  }
}

// ═══════════════════ УВЕДОМЛЕНИЕ ОБ УБИЙСТВЕ ═══════════════════
let killNotifyTimer = 0;
function showKillNotify(name) {
  document.getElementById("killName").textContent = name;
  document.getElementById("killNotify").style.display = "block";
  killNotifyTimer = 3.0;
}
function tickKillNotify(dt) {
  if (killNotifyTimer > 0) {
    killNotifyTimer -= dt;
    if (killNotifyTimer <= 0)
      document.getElementById("killNotify").style.display = "none";
  }
}

// ═══════════════════ СКОРБОРД (Tab) ═══════════════════
function updateScoreboard() {
  if (!gameInstance) return;
  const sb = document.getElementById("scoreboard");
  if (!sb.classList.contains("open")) return;

  const tanks = gameInstance.tanks;
  // Собираем команды
  const teams = {};
  for (const t of tanks) {
    const key = t.team || "__none__";
    if (!teams[key])
      teams[key] = {
        name: t.team || "Без команды",
        color: t.team ? teamColor(t.team) : "#ffaa00",
        tanks: [],
      };
    teams[key].tanks.push(t);
  }

  const keys = Object.keys(teams).filter((k) => k !== "__none__");
  // Если нет команд — показать всех в одной колонке
  if (keys.length === 0) keys.push("__none__");

  const slots = [
    document.getElementById("sbTeam0"),
    document.getElementById("sbTeam1"),
  ];
  slots.forEach((s) => (s.innerHTML = ""));

  keys.slice(0, 2).forEach((key, i) => {
    const team = teams[key];
    const slot = slots[i];
    if (!slot) return;
    const alive = team.tanks.filter((t) => t.alive).length;
    const total = team.tanks.length;
    const pct = total > 0 ? (alive / total) * 100 : 0;
    const col = team.color;

    slot.innerHTML = `
<div class="sb-team-name" style="color:${col};border-color:${col}40">${team.name.toUpperCase()}</div>
<div class="sb-bar-wrap"><div class="sb-bar" style="width:${pct}%;background:${col}"></div></div>
${[...team.tanks]
  .sort((a, b) => (a.alive === b.alive ? 0 : a.alive ? -1 : 1))
  .map(
    (t) => `
  <div class="sb-tank ${t.alive ? "" : "dead"}">
    <div class="sb-dot" style="background:${t.alive ? col : "#333"}"></div>
    <div class="sb-label">${t.label}</div>
    <div class="sb-status">${t.alive ? "▶ живой" : "✕ уничтожен"}</div>
  </div>`,
  )
  .join("")}
    `;
  });
}

function toggleScoreboard() {
  const sb = document.getElementById("scoreboard");
  sb.classList.toggle("open");
  if (sb.classList.contains("open")) updateScoreboard();
}
window.addEventListener("keydown", (e) => {
  if (e.code === "Tab") {
    e.preventDefault();
    toggleScoreboard();
  }
});
document.getElementById("scoreboard").addEventListener("click", (e) => {
  if (e.target === e.currentTarget)
    document.getElementById("scoreboard").classList.remove("open");
});

// ═══════════════════ СКОРОСТЬ ВРЕМЕНИ ═══════════════════
let timeScale = 1.0;
let paused = false;
let ffShotActive = false; // режим перемотки до выстрела

function setTimeScale(v) {
  timeScale = v;
  document.querySelectorAll(".spd-btn").forEach((b) => {
    b.classList.toggle("active", parseFloat(b.dataset.v) === v);
  });
}

document.querySelectorAll(".spd-btn").forEach((b) => {
  b.onclick = () => {
    setTimeScale(parseFloat(b.dataset.v));
  };
});

document.getElementById("btnPause").onclick = () => {
  paused = !paused;
  document.getElementById("btnPause").textContent = paused ? "▶" : "⏸";
};

// Перемотка до выстрела — кнопка-переключатель
document.getElementById("chkFfShot").onclick = function () {
  ffShotActive = !ffShotActive;
  this.style.background = ffShotActive ? "var(--green)" : "#0a1a0a";
  this.style.color = ffShotActive ? "#000" : "#446644";
  this.style.borderColor = ffShotActive ? "var(--green)" : "#1a4a1a";
};

// Вызывается из gameLoop при любом выстреле ПТУР
function onPTURFired() {
  if (ffShotActive) setTimeScale(0.1); // только замедляем, галочку не трогаем
}

