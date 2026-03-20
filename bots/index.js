// bots/index.js — список ботов и пресеты команд
// Загружается ПОСЛЕ всех классов — все ссылки на классы безопасны

const botClasses = [
  Dummy,
  Attacker,
  Crazy,
  Shy,
  Coward,
  Curious,
  Scanner,
  Terminator,
  Tracker,
  Specter,
  TeamHunter,
  Saboteur,
  Guardian,
];

// ═══════════════════ ПРЕСЕТЫ КОМАНД ═══════════════════
battleTeamsPresets = [
  {
    name: "Все боты",
    desc: "Все доступные боты без команд",
    teams: null,
  },

  // ── Классические ─────────────────────────────────────
  {
    name: "Сканеры vs Охотники",
    desc: "6 Scanner  против  6 TeamHunter",
    teams: {
      Scanners: { bot: Scanner, count: 6 },
      Hunters: { bot: TeamHunter, count: 6 },
    },
  },
  {
    name: "Терминаторы vs Охотники",
    desc: "4 Terminator  против  4 TeamHunter",
    teams: {
      Terminators: { bot: Terminator, count: 4 },
      Hunters: { bot: TeamHunter, count: 4 },
    },
  },
  {
    name: "Призраки vs Трекеры",
    desc: "5 Specter  против  5 Tracker",
    teams: {
      Specters: { bot: Specter, count: 5 },
      Trackers: { bot: Tracker, count: 5 },
    },
  },
  {
    name: "Все против всех",
    desc: "2×Terminator + 2×Tracker + 2×Specter + 2×TeamHunter",
    teams: null,
    customClasses: [
      Terminator,
      Terminator,
      Tracker,
      Tracker,
      Specter,
      Specter,
      TeamHunter,
      TeamHunter,
    ],
  },

  // ── Режим Штурм ──────────────────────────────────────
  {
    name: "⚔ Штурм: Терминаторы vs Охотники",
    desc: "Режим Штурм. 6 Terminator против 6 TeamHunter",
    teams: {
      Terminators: { bot: Terminator, count: 6 },
      Hunters: { bot: TeamHunter, count: 6 },
    },
  },
  {
    name: "⚔ Штурм: Диверсанты vs Защитники",
    desc: "Режим Штурм. 4 Saboteur против 4 Guardian",
    teams: {
      Saboteurs: { bot: Saboteur, count: 4 },
      Defenders: { bot: Guardian, count: 4 },
    },
  },
  {
    name: "⚔ Штурм: Полный хаос",
    desc: "Режим Штурм. Термин.+Диверс.+Призрак vs Охотник+Защитник+Трекер",
    teams: null,
    customClasses: [
      // Команда Alpha (botTeam будет назначен движком из static botTeam)
      Terminator,
      Terminator,
      Saboteur,
      Saboteur,
      Specter,
      // Команда Hunters
      TeamHunter,
      TeamHunter,
      Guardian,
      Guardian,
      Tracker,
    ],
  },
];

if (typeof applyPreset === "function") {
  try {
    const saved = parseInt(localStorage.getItem("ltw_preset") || "1");
    applyPreset(Math.min(saved, battleTeamsPresets.length - 1));
  } catch (e) {
    applyPreset(1);
  }
}
