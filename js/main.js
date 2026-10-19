"use strict";

// ═══════════════════ ГЛАВНЫЙ ЦИКЛ ═══════════════════
let gameInstance = null,
  renderer = null,
  lastTime = 0,
  animId = null;
const MAX_SIM_STEP = 0.05; // максимальный шаг симуляции — ПТУР не телепортируются
let _prevPturCount = 0;
function gameLoop(ts) {
  const realDt = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;
  if (!paused) {
    // Разбиваем dt*timeScale на подшаги ≤ MAX_SIM_STEP
    let remaining = realDt * timeScale;
    while (remaining > 0) {
      const step = Math.min(remaining, MAX_SIM_STEP);
      gameInstance.update(step);
      remaining -= step;
    }
  }
  // Детектируем новый выстрел ПТУР
  const curPtur = gameInstance.pturs.length;
  if (curPtur > _prevPturCount) onPTURFired();
  _prevPturCount = curPtur;
  renderer.draw();
  updateHUD();
  tickKillNotify(realDt);
  updateEngineSoundsForPlayer();
  updateScoreboard();
  animId = requestAnimationFrame(gameLoop);
}

// ═══════════════════ СОХРАНЕНИЕ НАСТРОЕК ═══════════════════
const SAVE_KEY = "ltw_cfg_v2";
function saveSettings() {
  const ids = [
    "cfgPlayer",
    "cfgImmortal",
    "cfgPlayerTeam",
    "cfgWallDmg",
    "cfgTeamKill",
    "cfgSelfDmg",
    "cfgTeamSpawn",
    "cfgAssault",
    "cfgBaseHp",
    "cfgPturVsPtur",
    "cfgSmartPtur",
    "cfgWrecks",
    "cfgBaseZone",
    "cfgSmartLaser",
    "cfgNoiseRadius",
    "cfgRadioEnabled",
    "cfgRadioWaves",
    "cfgSymmetric",
    "cfgMapSize",
    "cfgObstacles",
    "cfgCollisionDmg",
    "cfgPturCD",
    "cfgPturSpeed",
    "cfgPturDmg",
    "cfgSmokeCD",
    "cfgTurretSpeed",
    "cfgWallDotLife",
  ];
  const data = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    data[id] = el.type === "checkbox" ? el.checked : el.value;
  }
  const activeVis = document.querySelector(".vis-btn.active");
  if (activeVis) data["visMode"] = activeVis.dataset.mode;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {}
}
function loadSettings() {
  // Шаг 1: применяем дефолты из DEFAULT_CFG
  for (const [id, val] of Object.entries(DEFAULT_CFG)) {
    if (id === "visMode") {
      document
        .querySelectorAll(".vis-btn")
        .forEach((b) =>
          b.classList.toggle("active", b.dataset.mode === val),
        );
      continue;
    }
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!val;
    else el.value = val;
  }
  // Шаг 2: поверх — сохранённые пользователем настройки
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    for (const [id, val] of Object.entries(data)) {
      if (id === "visMode") {
        document.querySelectorAll(".vis-btn").forEach((b) => {
          b.classList.toggle("active", b.dataset.mode === val);
        });
        continue;
      }
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!val;
      else el.value = val;
    }
  } catch (e) {}
  // Обновляем лейбл ползунка препятствий
  const obsEl = document.getElementById("cfgObstacles");
  if (obsEl)
    document.getElementById("cfgObstaclesVal").textContent =
      Math.round(obsEl.value * 100) + "%";
}
loadSettings();

// Автосохранение при любом изменении настроек
(function () {
  const ids = [
    "cfgPlayer",
    "cfgImmortal",
    "cfgPlayerTeam",
    "cfgWallDmg",
    "cfgTeamKill",
    "cfgSelfDmg",
    "cfgTeamSpawn",
    "cfgAssault",
    "cfgBaseHp",
    "cfgPturVsPtur",
    "cfgSmartPtur",
    "cfgWrecks",
    "cfgBaseZone",
    "cfgSmartLaser",
    "cfgNoiseRadius",
    "cfgRadioEnabled",
    "cfgRadioWaves",
    "cfgSymmetric",
    "cfgMapSize",
    "cfgObstacles",
    "cfgCollisionDmg",
    "cfgPturCD",
    "cfgPturSpeed",
    "cfgPturDmg",
    "cfgSmokeCD",
    "cfgTurretSpeed",
    "cfgWallDotLife",
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", saveSettings);
  }
  document
    .getElementById("cfgPlayerTeam")
    .addEventListener("change", saveSettings);
})();

// ═══════════════════ МЕНЮ vis-btn ═══════════════════
document.querySelectorAll(".vis-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".vis-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    saveSettings();
  });
});

// ═══════════════════ ЗАПУСК ═══════════════════
document.getElementById("startBtn").onclick = startGame;

// ═══════════════════ ПРЕСЕТЫ КОМАНД ═══════════════════
// Определяются в bots/index.js после загрузки всех классов ботов
// Здесь только заглушка — реальное значение придёт позже
let battleTeamsPresets = [];
let botClasses = []; // заполняется из index.js после загрузки ботов

let activePresetIdx = 0; // текущий пресет

function updatePlayerTeamSelect() {
  const sel = document.getElementById("cfgPlayerTeam");
  if (!sel) return;
  const cur = sel.value;
  const preset = battleTeamsPresets[activePresetIdx];
  const teams = [];
  if (preset && preset.teams) {
    for (const t of Object.keys(preset.teams)) teams.push(t);
  } else if (preset && preset.customClasses) {
    const seen = new Set();
    for (const BC of preset.customClasses)
      if (BC.botTeam && !seen.has(BC.botTeam)) {
        seen.add(BC.botTeam);
        teams.push(BC.botTeam);
      }
  }
  sel.innerHTML = '<option value="">— нет (враг для всех) —</option>';
  for (const t of teams) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  }
  // По умолчанию — первая команда; если уже был выбор — восстановить
  if (teams.includes(cur)) sel.value = cur;
  else if (teams.length > 0 && !cur) sel.value = teams[0];
}

function applyPreset(idx) {
  activePresetIdx = idx;
  const preset = battleTeamsPresets[idx];
  // Обновляем строку под заголовком
  const text = presetLineText(preset);
  document.getElementById("presetLineText").textContent = text;
  try {
    localStorage.setItem("ltw_preset2", idx);
  } catch (e) {}
  // Обновляем список команд игрока
  if (typeof updatePlayerTeamSelect === "function")
    updatePlayerTeamSelect();
}

function presetLineText(preset) {
  if (!preset.teams && !preset.customClasses) return preset.name;
  if (preset.customClasses) return preset.name;
  const teams = Object.entries(preset.teams);
  const parts = teams.map(([name, t]) => name + " ×" + t.count);
  const counts = teams.map(([, t]) => t.count);
  const score = counts.join("v");
  return parts.join("  vs  ") + "  (" + score + ")";
}

function openPresetModal() {
  const list = document.getElementById("presetList");
  list.innerHTML = "";
  battleTeamsPresets.forEach((p, i) => {
    const div = document.createElement("div");
    div.className =
      "preset-item" + (i === activePresetIdx ? " active" : "");
    div.innerHTML = `<div class="preset-name">${p.name}</div><div class="preset-desc">${p.desc}</div>`;
    div.onclick = () => {
      document
        .querySelectorAll(".preset-item")
        .forEach((el) => el.classList.remove("active"));
      div.classList.add("active");
      applyPreset(i);
    };
    list.appendChild(div);
  });
  document.getElementById("presetModal").classList.add("open");
}

function closePresetModal() {
  document.getElementById("presetModal").classList.remove("open");
}
document.getElementById("presetModal").onclick = (e) => {
  if (e.target === e.currentTarget) closePresetModal();
};

// Получить активный список классов ботов для старта
function getActiveBotClasses() {
  const preset = battleTeamsPresets[activePresetIdx];
  if (preset.customClasses) return preset.customClasses;
  if (!preset.teams) return botClasses;
  const classes = [];
  for (const [, t] of Object.entries(preset.teams)) {
    for (let i = 0; i < t.count; i++) classes.push(t.bot);
  }
  return classes;
}

function isRoyalBattle() {
  if (cfg.royalBattle) return true;
  const preset = battleTeamsPresets[activePresetIdx];
  return preset && preset.royalBattle === true;
}

// Пресет загружается из bots/index.js после инициализации всех классов
// Показываем HP базы только в режиме Штурм
document
  .getElementById("cfgAssault")
  .addEventListener("change", function () {
    document.getElementById("baseHpRow").style.display =
      this.value === "1" ? "flex" : "none";
  });
if (document.getElementById("cfgAssault").value === "1")
  document.getElementById("baseHpRow").style.display = "flex";
// Королевская битва: принудительно убираем командный спавн
document
  .getElementById("cfgAssault")
  .addEventListener("change", function () {
    if (this.value === "2") {
      document.getElementById("cfgTeamSpawn").checked = false;
    }
  });

// Вставляем .dots между label и контролом в каждом setting-row
(function () {
  document.querySelectorAll(".setting-row").forEach((row) => {
    const label = row.querySelector("label");
    const control = label && label.nextElementSibling;
    if (!label || !control) return;
    // Не добавляем если уже есть
    if (control.classList && control.classList.contains("dots")) return;
    const dots = document.createElement("span");
    dots.className = "dots";
    row.insertBefore(dots, control);
  });
})();

(function () {
  const sl = document.getElementById("cfgObstacles");
  const lbl = document.getElementById("cfgObstaclesVal");
  sl.oninput = function () {
    lbl.textContent = Math.round(this.value * 100) + "%";
  };
  sl.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      const step = 0.01,
        dir = e.deltaY < 0 ? 1 : -1;
      this.value = Math.max(
        0,
        Math.min(0.9, parseFloat(this.value) + dir * step),
      );
      lbl.textContent = Math.round(this.value * 100) + "%";
    },
    { passive: false },
  );
})();

// ── Модалка звука ──
document.getElementById("soundSettingsBtn").onclick = () => {
  ensureAudio();
  document.getElementById("soundModal").classList.add("open");
};
document.getElementById("soundModalClose").onclick = () =>
  document.getElementById("soundModal").classList.remove("open");
document.getElementById("soundModal").onclick = (e) => {
  if (e.target === e.currentTarget)
    e.currentTarget.classList.remove("open");
};

(function () {
  const sliders = [
    ["volMaster", "master"],
    ["volEngine", "engine"],
    ["volShot", "shot"],
    ["volExplosion", "explosion"],
    ["volBeep", "beep"],
  ];
  // Load saved values
  const saved = JSON.parse(localStorage.getItem("ltw_snd") || "{}");
  sliders.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (saved[key] !== undefined) {
      el.value = Math.round(saved[key] * 100);
      sndVol[key] = saved[key];
    }
    document.getElementById(id + "Val").textContent = el.value + "%";
    el.oninput = function () {
      sndVol[key] = this.value / 100;
      document.getElementById(id + "Val").textContent = this.value + "%";
      localStorage.setItem(
        "ltw_snd",
        JSON.stringify(
          Object.fromEntries(
            sliders.map(([sid, sk]) => [
              sk,
              document.getElementById(sid).value / 100,
            ]),
          ),
        ),
      );
    };
  });
})();

function startGame() {
  saveSettings();
  // Если игрок не участвует — режим наблюдения (всё видно)
  const hasPlayerChecked = document.getElementById("cfgPlayer").checked;
  const visMode = hasPlayerChecked
    ? document.querySelector(".vis-btn.active")?.dataset.mode ||
      "reflections"
    : "all";
  // Синхронизируем кнопки HUD
  document
    .querySelectorAll(".vis-btn,.vis-btn-hud")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === visMode),
    );
  cfg = {
    hasPlayer: document.getElementById("cfgPlayer").checked,
    playerTeam:
      document.getElementById("cfgPlayerTeam").value.trim() || null,
    immortal: document.getElementById("cfgImmortal").checked,
    wallDmg: document.getElementById("cfgWallDmg").checked,
    teamKill: document.getElementById("cfgTeamKill").checked,
    selfDmg: document.getElementById("cfgSelfDmg").checked,
    teamSpawn: document.getElementById("cfgTeamSpawn").checked,
    assault: document.getElementById("cfgAssault").value === "1",
    royalBattle: document.getElementById("cfgAssault").value === "2",
    baseHp: parseInt(
      document.getElementById("cfgBaseHp")?.value || "5000",
    ),
    pturVsPtur: document.getElementById("cfgPturVsPtur").checked,
    smartPtur: document.getElementById("cfgSmartPtur").checked,
    wrecks: document.getElementById("cfgWrecks").checked,
    baseZone: document.getElementById("cfgBaseZone")?.checked !== false,
    laserGen: parseInt(document.getElementById("cfgSmartLaser").value), // 0=early,1=doppler,2=lidar
    smartLaser:
      parseInt(document.getElementById("cfgSmartLaser").value) >= 1,
    smartLaserStill:
      parseInt(document.getElementById("cfgSmartLaser").value) >= 2,
    noiseRadius: document.getElementById("cfgNoiseRadius").checked,
    radioEnabled: document.getElementById("cfgRadioEnabled").checked,
    radioWaves: document.getElementById("cfgRadioWaves").checked,
    visMode,
    allMap: visMode === "all",
    symmetric: document.getElementById("cfgSymmetric").checked,
    mapSize: parseInt(document.getElementById("cfgMapSize").value),
    obstacleDensity: parseFloat(
      document.getElementById("cfgObstacles").value,
    ),
    pturCD: parseInt(document.getElementById("cfgPturCD").value),
    pturAmmo: 5, // фиксировано в режиме Штурм
    collisionDmg: parseInt(
      document.getElementById("cfgCollisionDmg")?.value || "15",
    ),
    pturSpeed: parseInt(document.getElementById("cfgPturSpeed").value),
    pturDmg: parseFloat(document.getElementById("cfgPturDmg").value),
    smokeCD: parseInt(document.getElementById("cfgSmokeCD").value),
    turretSpeed: parseInt(
      document.getElementById("cfgTurretSpeed").value,
    ),
    wallDotLife: parseFloat(
      document.getElementById("cfgWallDotLife").value,
    ),
  };

  document.getElementById("menu").style.display = "none";
  document.getElementById("gameContainer").style.display = "flex";
  document.getElementById("deathScreen").style.display = "none";
  document.getElementById("killNotify").style.display = "none";
  setTimeScale(1.0);
  paused = false;
  document.getElementById("btnPause").textContent = "⏸";
  _prevPturCount = 0;
  ensureAudio();

  document
    .querySelectorAll(".vis-btn-hud")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === visMode),
    );
  document.querySelectorAll(".vis-btn-hud").forEach((btn) => {
    btn.onclick = () => {
      document
        .querySelectorAll(".vis-btn-hud")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      cfg.visMode = btn.dataset.mode;
      cfg.allMap = cfg.visMode === "all";
    };
  });

  Object.keys(_teamColorCache).forEach((k) => delete _teamColorCache[k]);
  _teamColorIdx = 0;
  gameInstance = new Game(cfg);
  const canvas = document.getElementById("gameCanvas");
  renderer = new Renderer(canvas, gameInstance);
  const wrap = document.getElementById("canvasWrap");
  const scale = Math.min(
    wrap.clientWidth / canvas.width,
    (wrap.clientHeight - 40) / canvas.height,
    1.5,
  );
  canvas.style.width = canvas.width * scale + "px";
  canvas.style.height = canvas.height * scale + "px";

  // Убираем старые слушатели через AbortController
  if (window._gameAC) window._gameAC.abort();
  window._gameAC = new AbortController();
  const sig = { signal: window._gameAC.signal };

  if (gameInstance.player) {
    const p = gameInstance.player;
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          (e.code === "KeyW" || e.code === "ArrowUp") &&
          !p.keys[e.code]
        ) {
          console.log(
            "W pressed alive=",
            p.alive,
            "gear=",
            p.gear,
            "running=",
            gameInstance.running,
          );
          p.gear = Math.min(5, p.gear + 1);
        }
        if (
          (e.code === "KeyS" || e.code === "ArrowDown") &&
          !p.keys[e.code]
        ) {
          if (p.gear > 0) p.gear = Math.max(0, p.gear - 1);
          else p.gear = -1;
        }
        if (e.code === "KeyR") p.gear = 0;
        p.keys[e.code] = true;
        if (e.code === "KeyF") e.preventDefault();
      },
      sig,
    );
    window.addEventListener(
      "keyup",
      (e) => {
        p.keys[e.code] = false;
      },
      sig,
    );
    canvas.addEventListener(
      "mousemove",
      (e) => {
        const rect = canvas.getBoundingClientRect();
        p.mouseX =
          ((e.clientX - rect.left) * (canvas.width / rect.width)) / CELL;
        p.mouseY =
          ((e.clientY - rect.top) * (canvas.height / rect.height)) / CELL;
        p.turretTargetAngle = Math.atan2(p.mouseY - p.y, p.mouseX - p.x);
      },
      sig,
    );
    let mdt = 0;
    canvas.addEventListener(
      "mousedown",
      (e) => {
        if (e.button === 0) {
          p.mouseDown = true;
          mdt = performance.now();
        }
        if (e.button === 2) {
          if (p.shootPTUR(gameInstance))
            gameInstance.log("ПТУР!", "warn");
        }
        e.preventDefault();
      },
      sig,
    );
    canvas.addEventListener(
      "mouseup",
      (e) => {
        if (e.button === 0) {
          p.mouseDown = false;
          if (performance.now() - mdt < 180) {
            const res = p.shootLaserPulse(gameInstance);
            if (res)
              p.dots.push(
                new LaserDot(
                  res.hitX,
                  res.hitY,
                  res.isEnemy,
                  res.inSmoke,
                ),
              );
          }
          p.laserContinuous = false;
          p.laserResult = null;
        }
      },
      sig,
    );
    canvas.addEventListener(
      "contextmenu",
      (e) => e.preventDefault(),
      sig,
    );
  }

  if (animId) cancelAnimationFrame(animId);
  lastTime = performance.now();
  animId = requestAnimationFrame(gameLoop);
}

function backToMenu() {
  if (animId) cancelAnimationFrame(animId);
  if (window._gameAC) {
    window._gameAC.abort();
    window._gameAC = null;
  }
  stopSpoBeep();
  spoLastIrradiated = false;
  stopAllEngineSounds();
  document.getElementById("gameContainer").style.display = "none";
  document.getElementById("menu").style.display = "flex";
  document.getElementById("logBox").innerHTML = "";
}
