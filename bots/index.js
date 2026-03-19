// bots/index.js — список всех ботов для игры
// Добавь сюда свой класс чтобы он появился в игре

// Порядок = порядок спавна
const botClasses = [];

// ═══════════════════ ПРЕСЕТЫ КОМАНД ═══════════════════
// Добавляй свои пресеты сюда.
// teams: { "НазваниеКоманды": { bot: КлассБота, count: количество } }
// teams: null → использовать botClasses выше
// customClasses: [...] → произвольный массив классов (для FFA)
battleTeamsPresets = [
  {
    name: "Без пресета",
    desc: "Боты из botClasses, команды не назначены",
    teams: null,
  },
  {
    name: "Сканеры vs Охотники",
    desc: "12 Scanner  против  12 TeamHunter",
    teams: {
      Scanners: { bot: Scanner, count: 12 },
      Hunters: { bot: TeamHunter, count: 12 },
    },
  },
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
];

// Применяем сохранённый пресет после загрузки
if (typeof applyPreset === "function") {
  try {
    const saved = parseInt(localStorage.getItem("ltw_preset") || "1");
    applyPreset(Math.min(saved, battleTeamsPresets.length - 1));
  } catch (e) {
    applyPreset(1);
  }
}
