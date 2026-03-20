// index.js — загрузчик ботов и пресеты команд
// Единственный <script> тег в HTML. Загружает ботов по очереди,
// затем инициализирует пресеты и применяет сохранённый.

const BOTS = ["bots/Scanner.js"];

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
  botClasses = [Scanner];

  battleTeamsPresets = [
    {
      name: "Все боты",
      desc: "Все доступные боты без команд",
      teams: null,
    },
    {
      name: "Сканеры vs Охотники",
      desc: "6 Scanner против 6 Scanner",
      teams: {
        Scanners: { bot: Scanner, count: 6 },
        Scanners2: { bot: Scanner, count: 6 },
      },
    },
  ];

  // Применяем сохранённый пресет
  if (typeof applyPreset === "function") {
    try {
      const saved = parseInt(localStorage.getItem("ltw_preset") || "1");
      applyPreset(Math.min(saved, battleTeamsPresets.length - 1));
    } catch (e) {
      applyPreset(1);
    }
  }
});
