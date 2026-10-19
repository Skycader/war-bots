// index.js — загрузчик ботов и пресеты команд
// Единственный <script> тег в HTML. Загружает ботов по очереди,
// затем инициализирует пресеты и применяет сохранённый.

const BOTS = [
  "bots/Dummy.js",
  "bots/Attacker.js",
  "bots/Crazy.js",
  "bots/Shy.js",
  "bots/Coward.js",
  "bots/Curious.js",
  "bots/Scanner.js",
  "bots/Patrol.js",
  "bots/Tracker.js",
  "bots/Specter.js",
  "bots/Terminator.js",
  "bots/TeamHunter.js",
  "bots/Guardian.js",
  "bots/Saboteur.js",
  "bots/Sample.js", // демо-шаблон API, в «Все боты» не входит
];

// Загружаем скрипты по одному (порядок важен — все наследуют Tank)
function loadScripts(paths, onDone) {
  if (paths.length === 0) {
    onDone();
    return;
  }
  const [first, ...rest] = paths;
  const script = document.createElement("script");
  script.src = first;
  script.onload = () => loadScripts(rest, onDone);
  script.onerror = (e) => {
    console.warn(`[index.js] Не удалось загрузить ${first}`, e);
    loadScripts(rest, onDone); // продолжаем без этого бота
  };
  document.head.appendChild(script);
}

loadScripts(BOTS, () => {
  // Все классы ботов загружены — инициализируем пресеты

  // Все доступные боты для режима "Все боты" (без пресета)
  // Sample — шаблон для написания ботов, в бой не берём
  botClasses = [
    Dummy,
    Attacker,
    Crazy,
    Shy,
    Coward,
    Curious,
    Scanner,
    Patrol,
    Tracker,
    Specter,
    Terminator,
    TeamHunter,
    Guardian,
    Saboteur,
  ];

  battleTeamsPresets = [
    {
      name: "Все боты",
      desc: "Все доступные боты без команд",
      teams: null,
    },
    {
      name: "Сканеры vs Сканеры",
      desc: "6 Scanner против 6 Scanner",
      teams: {
        Scanners: { bot: Scanner, count: 6 },
        Scanners2: { bot: Scanner, count: 6 },
      },
    },
    {
      name: "Дезматч: вы vs Охотники",
      desc: "Вы + 5 TeamHunter против 6 TeamHunter, с радиосвязью (по умолчанию)",
      teams: {
        Hunters: { bot: TeamHunter, count: 5 },
        Raiders: { bot: TeamHunter, count: 6 },
      },
    },
  ];

  // Применяем сохранённый пресет
  if (typeof applyPreset === "function") {
    try {
      // Без сохранённого выбора — командный дезматч (последний пресет)
      const last = battleTeamsPresets.length - 1;
      const saved = parseInt(localStorage.getItem("ltw_preset2") ?? last);
      applyPreset(Math.min(saved, last));
    } catch (e) {
      applyPreset(battleTeamsPresets.length - 1);
    }
  }
});
