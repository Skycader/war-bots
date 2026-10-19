"use strict";

// ═══════════════════ АУДИО ═══════════════════
let audioCtx = null,
  spoBeepNode = null,
  spoLastIrradiated = false,
  _spoBeepTO = null;
// Громкости звуков (0..1), управляются из модалки
const sndVol = {
  master: 0.8,
  engine: 1.0,
  shot: 1.0,
  explosion: 1.0,
  beep: 1.0,
};
// Хранилище непрерывных звуков двигателей: tankId → {osc, gain, panner}
const _engineNodes = {};

function ensureAudio() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

// Создаёт/обновляет непрерывный звук двигателя с позиционным аудио.
// pan: -1 (левый наушник) ... 0 (центр) ... +1 (правый наушник)
// vol: 0..1 громкость (зависит от расстояния и скорости)
function updateEngineSound(tankId, pan, vol, speed) {
  if (!audioCtx) return;
  if (vol < 0.01) {
    stopEngineSound(tankId);
    return;
  }
  if (!_engineNodes[tankId]) {
    // Создаём граф: oscillator(low rumble) → gain → panner → destination
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator(); // второй для биения
    const merger = audioCtx.createChannelMerger(1);
    const gn = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    const lpf = audioCtx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 180;
    osc.type = "sawtooth";
    osc2.type = "square";
    osc2.frequency.value = 0;
    // Модуляция — имитация оборотов двигателя
    const modGain = audioCtx.createGain();
    modGain.gain.value = 20;
    osc2.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(lpf);
    lpf.connect(gn);
    gn.connect(panner);
    panner.connect(audioCtx.destination);
    osc.start();
    osc2.start();
    _engineNodes[tankId] = { osc, osc2, gn, panner };
  }
  const node = _engineNodes[tankId];
  const baseFreq = 40 + Math.abs(speed) * 12; // выше обороты = выше тон
  node.osc.frequency.setTargetAtTime(baseFreq, audioCtx.currentTime, 0.1);
  node.osc2.frequency.setTargetAtTime(
    baseFreq * 0.97,
    audioCtx.currentTime,
    0.1,
  );
  node.gn.gain.setTargetAtTime(
    vol * 0.18 * sndVol.master * sndVol.engine,
    audioCtx.currentTime,
    0.05,
  );
  node.panner.pan.setTargetAtTime(
    Math.max(-1, Math.min(1, pan)),
    audioCtx.currentTime,
    0.05,
  );
}

function stopEngineSound(tankId) {
  if (!_engineNodes[tankId]) return;
  const node = _engineNodes[tankId];
  try {
    node.osc.stop();
    node.osc2.stop();
  } catch (e) {}
  delete _engineNodes[tankId];
}

function stopAllEngineSounds() {
  for (const id of Object.keys(_engineNodes)) stopEngineSound(id);
}

// Вычисляет стерео-пан для звука в мировой точке (x,y) относительно игрока
function calcPanForPlayer(x, y, game) {
  if (!game || !game.player || !game.player.alive) return 0;
  const p = game.player;
  const dx = x - p.x,
    dy = y - p.y;
  const worldAngle = Math.atan2(dy, dx);
  const relAngle = worldAngle - p.angle;
  return Math.max(-1, Math.min(1, Math.sin(relAngle)));
}

// Вызывается каждый кадр — обновляет позиционные звуки двигателей
function updateEngineSoundsForPlayer() {
  if (!gameInstance || !audioCtx) return;
  const player = gameInstance.player;
  // Собственный двигатель игрока — всегда центр, громкость по скорости
  if (player && player.alive) {
    const spd = Math.abs(player.speed);
    updateEngineSound(
      "player_self",
      0,
      spd > 0.3 ? 0.4 + spd * 0.06 : 0,
      spd,
    );
  } else {
    stopEngineSound("player_self");
  }
  // Двигатели других танков — позиционируем относительно игрока
  if (!player) return;
  for (const tank of gameInstance.tanks) {
    if (tank === player || !tank.alive) continue;
    if (Math.abs(tank.speed) < 0.3) {
      stopEngineSound("bot_" + tank.id);
      continue;
    }
    const dx = tank.x - player.x,
      dy = tank.y - player.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > SOUND_RANGE) {
      stopEngineSound("bot_" + tank.id);
      continue;
    }
    // Пан: угол относительно НАПРАВЛЕНИЯ игрока (а не мировых координат)
    // Правая сторона от игрока = +1, левая = -1
    const worldAngle = Math.atan2(dy, dx);
    const relAngle = worldAngle - player.angle; // угол относительно носа танка игрока
    const pan = Math.sin(relAngle); // sin: спереди=0, справа=+1, слева=-1
    // Громкость: затухает с расстоянием
    const vol =
      (1 - d / SOUND_RANGE) *
      Math.min(1, Math.abs(tank.speed) / 2) *
      0.35;
    updateEngineSound("bot_" + tank.id, pan, vol, tank.speed);
  }
}

// Воспроизводит одиночный звук (выстрел/взрыв) с позиционным паном
function playPositional(playFn, pan) {
  if (!audioCtx) return;
  // Временно патчим destination через panner
  const panner = audioCtx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(audioCtx.destination);
  playFn(panner);
}

function playShot(pan = 0) {
  if (!audioCtx) return;
  const n = Math.floor(audioCtx.sampleRate * 0.18),
    buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate),
    d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    d[i] =
      (Math.random() * 2 - 1) *
      Math.pow(1 - t, 2.5) *
      (i < n * 0.05 ? 1.5 : 0.6);
  }
  const src = audioCtx.createBufferSource(),
    g = audioCtx.createGain(),
    hpf = audioCtx.createBiquadFilter();
  const panner = audioCtx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  hpf.type = "highpass";
  hpf.frequency.value = 800;
  g.gain.setValueAtTime(
    0.35 * sndVol.master * sndVol.shot,
    audioCtx.currentTime,
  );
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
  src.buffer = buf;
  src.connect(hpf);
  hpf.connect(g);
  g.connect(panner);
  panner.connect(audioCtx.destination);
  src.start();
}
function playExplosion(pan = 0) {
  if (!audioCtx) return;
  const n = Math.floor(audioCtx.sampleRate * 0.4),
    buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate),
    d = buf.getChannelData(0);
  for (let i = 0; i < n; i++)
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.5);
  const src = audioCtx.createBufferSource(),
    g = audioCtx.createGain(),
    bq = audioCtx.createBiquadFilter();
  const panner = audioCtx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  bq.type = "lowpass";
  bq.frequency.value = 400;
  g.gain.setValueAtTime(
    0.6 * sndVol.master * sndVol.explosion,
    audioCtx.currentTime,
  );
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
  src.buffer = buf;
  src.connect(bq);
  bq.connect(g);
  g.connect(panner);
  panner.connect(audioCtx.destination);
  src.start();
}
// Детонация БК — три слоя: глубокий бас, шум взрыва, металлический звон
function playDetonation(pan = 0) {
  if (!audioCtx) return;
  const sr = audioCtx.sampleRate;
  const vol = sndVol.master * sndVol.explosion;
  const pv = Math.max(-1, Math.min(1, pan));

  function layer(
    dur,
    fillFn,
    filterType,
    freq,
    gainPeak,
    gainDur,
    startDelay = 0,
  ) {
    const n = Math.floor(sr * dur);
    const buf = audioCtx.createBuffer(1, n, sr);
    fillFn(buf.getChannelData(0), n);
    const src = audioCtx.createBufferSource();
    const flt = audioCtx.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.value = freq;
    const g = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = pv;
    g.gain.setValueAtTime(
      gainPeak * vol,
      audioCtx.currentTime + startDelay,
    );
    g.gain.exponentialRampToValueAtTime(
      0.0001,
      audioCtx.currentTime + startDelay + gainDur,
    );
    src.buffer = buf;
    src.connect(flt);
    flt.connect(g);
    g.connect(panner);
    panner.connect(audioCtx.destination);
    src.start(audioCtx.currentTime + startDelay);
  }

  // Бас-удар: синусоида 60Гц с быстрым спадом — ощущается как сотрясение
  {
    const n = Math.floor(sr * 1.2);
    const buf = audioCtx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // Синус + субгармоника — имитация давления взрывной волны
      const env = Math.exp(-t * 4) * (1 - Math.exp(-t * 80)); // быстрый attack, медленный release
      d[i] =
        Math.sin(2 * Math.PI * 55 * t) * env * 0.8 +
        Math.sin(2 * Math.PI * 28 * t) * env * 0.5;
    }
    const src = audioCtx.createBufferSource();
    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 200;
    const g = audioCtx.createGain();
    g.gain.value = 0.9 * vol;
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = pv;
    src.buffer = buf;
    src.connect(lp);
    lp.connect(g);
    g.connect(panner);
    panner.connect(audioCtx.destination);
    src.start();
  }

  // Взрывной шум: широкополосный с пиком на средних
  layer(
    1.5,
    (d, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] =
          (Math.random() * 2 - 1) *
          Math.pow(Math.exp(-t * 2.5) * (1 - Math.exp(-t * 60)), 0.7);
      }
    },
    "bandpass",
    350,
    1.8,
    1.5,
  );

  // Высокий свист разлетающихся осколков (0.6 сек, с задержкой 80мс)
  layer(
    0.6,
    (d, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
      }
    },
    "highpass",
    3500,
    0.4,
    0.6,
    0.08,
  );

  // Металлический резонанс корпуса (долгий хвост)
  layer(
    2.0,
    (d, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 5);
      }
    },
    "bandpass",
    180,
    0.6,
    2.0,
    0.12,
  );
}

function playSmokeExplosion(pan) {
  ensureAudio();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const panner = audioCtx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan || 0));
  panner.connect(audioCtx.destination);
  // Глухой хлопок
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  gain.gain.setValueAtTime(0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain);
  gain.connect(panner);
  osc.start(t);
  osc.stop(t + 0.2);
  // Шипение дыма
  const bufSize = Math.floor(audioCtx.sampleRate * 0.4);
  const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++)
    data[i] = (Math.random() * 2 - 1) * 0.15;
  const src = audioCtx.createBufferSource();
  const ng = audioCtx.createGain();
  src.buffer = buf;
  ng.gain.setValueAtTime(0.2, t + 0.05);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  src.connect(ng);
  ng.connect(panner);
  src.start(t + 0.05);
}

function playWallHit(pan = 0) {
  if (!audioCtx) return;
  const n = Math.floor(audioCtx.sampleRate * 0.08);
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Металлический удар: низкочастотный шум с быстрым затуханием
    d[i] =
      (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 0.8 +
      Math.sin(i * 0.4) * Math.pow(1 - t, 5) * 0.4;
  }
  const src = audioCtx.createBufferSource();
  const g = audioCtx.createGain();
  const lpf = audioCtx.createBiquadFilter();
  const panner = audioCtx.createStereoPanner();
  lpf.type = "lowpass";
  lpf.frequency.value = 600;
  g.gain.setValueAtTime(0.4 * sndVol.master, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  src.buffer = buf;
  src.connect(lpf);
  lpf.connect(g);
  g.connect(panner);
  panner.connect(audioCtx.destination);
  src.start();
}

function startSpoBeep() {
  if (!audioCtx || spoBeepNode) return;
  spoBeepNode = { active: true };
  scheduleSpoBeep();
}
function scheduleSpoBeep() {
  if (!spoBeepNode || !spoBeepNode.active || !audioCtx) return;
  const osc = audioCtx.createOscillator(),
    g = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  g.gain.setValueAtTime(
    0.12 * sndVol.master * sndVol.beep,
    audioCtx.currentTime,
  );
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
  _spoBeepTO = setTimeout(scheduleSpoBeep, 400);
}
function stopSpoBeep() {
  if (spoBeepNode) spoBeepNode.active = false;
  spoBeepNode = null;
  if (_spoBeepTO) {
    clearTimeout(_spoBeepTO);
    _spoBeepTO = null;
  }
}

