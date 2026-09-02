window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installMonsterXrayAlarmModule = function installMonsterXrayAlarmModule(bot) {
  if (!bot || bot.monsterXrayAlarm) return bot?.monsterXrayAlarm || null;

  const configStorageKey = "minibiaBot.monsterXrayAlarm.config";
  const scanIntervalMs = 500;
  const alertDurationMs = 10000;
  const cooldownMs = 30000;
  const doubleBeepRepeatMs = 1000;
  const pauseDurationMs = 15000;

  const defaultConfig = {
    enabled: false,
    monsterNames: [],
  };

  const state = {
    running: false,
    timerId: null,
    uiTimerId: null,
    audioContext: null,
    activeAlerts: new Map(),
    cooldownUntilByName: new Map(),
    lastDetectedNames: [],
    pauseActive: false,
    pauseTimerId: null,
    pauseResumeSnapshot: null,
  };

  const storedConfig = bot.storage.get(configStorageKey, {}) || {};
  const config = Object.assign({}, defaultConfig, storedConfig);
  config.monsterNames = normalizeMonsterNames(config.monsterNames);

  function normalizeName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function displayName(value) {
    return String(value || "").trim();
  }

  function normalizeMonsterNames(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
      .map(displayName)
      .filter((name) => {
        const normalized = normalizeName(name);
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, {
      enabled: !!config.enabled,
      monsterNames: [...config.monsterNames],
    });
  }

  function isWatchedName(name) {
    const normalized = normalizeName(name);
    return !!normalized && config.monsterNames.some((watchedName) => normalizeName(watchedName) === normalized);
  }

  function getXrayMonsters() {
    const byKey = new Map();
    const visible = bot.xray?.getVisibleMonsters?.() || [];
    const overlay = bot.xray?.getOverlayCreatures?.() || [];

    [...visible, ...overlay].forEach((creature) => {
      if (!creature || creature.type === 0) return;
      const normalized = normalizeName(creature.name);
      if (!normalized) return;
      const key = creature.id != null ? `id:${creature.id}` : `${normalized}:${creature.__position?.x ?? "?"}:${creature.__position?.y ?? "?"}:${creature.__position?.z ?? "?"}`;
      if (!byKey.has(key)) byKey.set(key, creature);
    });

    return [...byKey.values()];
  }

  function getDetectedWatchedMonsters() {
    return getXrayMonsters().filter((creature) => isWatchedName(creature?.name));
  }

  function getAudioContext() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!state.audioContext || state.audioContext.state === "closed") {
        state.audioContext = new AudioContextClass();
      }
      if (state.audioContext.state === "suspended") state.audioContext.resume?.();
      return state.audioContext;
    } catch (error) {
      return null;
    }
  }

  function beepAt(context, startAt, frequency = 960, durationSeconds = 0.14) {
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + durationSeconds + 0.02);
      return true;
    } catch (error) {
      return false;
    }
  }

  function playDoubleBeep() {
    const context = getAudioContext();
    if (!context) return false;
    const now = context.currentTime + 0.01;
    const first = beepAt(context, now, 960, 0.14);
    const second = beepAt(context, now + 0.24, 1120, 0.14);
    return first || second;
  }

  function unlockAudio() {
    const context = getAudioContext();
    if (!context) return false;
    try { context.resume?.(); } catch (_) {}
    return true;
  }

  function forceStopWalkingOnce() {
    if (typeof bot.gmKillSwitch?.forceStopWalkingOnce === "function") {
      try {
        return !!bot.gmKillSwitch.forceStopWalkingOnce();
      } catch (error) {
        bot.log?.("X-ray monster pause reused GM stop-walk command failed", { error: String(error) });
      }
    }

    const player = window.gameClient?.player;
    const world = window.gameClient?.world;
    const pathfinder = world?.pathfinder;
    const candidates = [
      [player, "stopWalking"],
      [player, "stopAutoWalk"],
      [player, "cancelWalk"],
      [player, "cancelWalking"],
      [player, "clearPath"],
      [pathfinder, "stop"],
      [pathfinder, "cancel"],
      [pathfinder, "abort"],
      [pathfinder, "reset"],
      [pathfinder, "clearPath"],
      [world, "stopWalking"],
      [world, "cancelWalk"],
    ];

    for (const [target, method] of candidates) {
      if (typeof target?.[method] !== "function") continue;
      try {
        target[method]();
        bot.log?.("X-ray monster pause forced walking stop", { method });
        return true;
      } catch (error) {
        bot.log?.("X-ray monster pause walking stop command failed", { method, error: String(error) });
      }
    }

    const current = bot.getPlayerPosition?.();
    if (current && typeof pathfinder?.findPath === "function") {
      try {
        const currentTile = typeof Position === "function"
          ? new Position(Number(current.x), Number(current.y), Number(current.z))
          : current;
        pathfinder.findPath(current, currentTile);
        bot.log?.("X-ray monster pause forced walking stop", { method: "pathfinder.findPath(current,current)" });
        return true;
      } catch (error) {
        bot.log?.("X-ray monster pause walking stop command failed", { method: "pathfinder.findPath(current,current)", error: String(error) });
      }
    }

    bot.log?.("X-ray monster pause could not find walking stop command");
    return false;
  }

  function resumeMonsterPause() {
    if (!state.pauseActive) return false;
    const snapshot = state.pauseResumeSnapshot || { cave: false, attack: false };
    state.pauseTimerId = null;
    state.pauseActive = false;
    state.pauseResumeSnapshot = null;
    if (snapshot.cave) bot.cave?.start?.();
    if (snapshot.attack) bot.attack?.start?.();
    bot.ui?.refreshAutoAttackStatus?.();
    bot.ui?.refreshCaveStatus?.();
    bot.log?.("X-ray monster pause resumed modules after 15 seconds", snapshot);
    return true;
  }

  function triggerMonsterPause(monsterName) {
    if (state.pauseActive) return false;
    const snapshot = {
      cave: !!bot.cave?.status?.().running,
      attack: !!bot.attack?.status?.().running,
    };
    state.pauseActive = true;
    state.pauseResumeSnapshot = snapshot;
    if (snapshot.cave) bot.cave?.stop?.({ persistEnabled: false });
    if (snapshot.attack) bot.attack?.stop?.({ persistEnabled: false });
    const walkingStopped = forceStopWalkingOnce();
    bot.ui?.refreshAutoAttackStatus?.();
    bot.ui?.refreshCaveStatus?.();
    state.pauseTimerId = window.setTimeout(resumeMonsterPause, pauseDurationMs);
    bot.log?.("X-ray monster pause triggered", {
      monster: monsterName,
      walkingStopped,
      pauseMs: pauseDurationMs,
      resumeSnapshot: snapshot,
    });
    return true;
  }

  function triggerName(name, now = Date.now()) {
    const normalized = normalizeName(name);
    if (!normalized) return false;

    const cooldownUntil = Number(state.cooldownUntilByName.get(normalized) || 0);
    if (cooldownUntil > now || state.activeAlerts.has(normalized)) return false;

    const display = config.monsterNames.find((watchedName) => normalizeName(watchedName) === normalized) || displayName(name);
    state.activeAlerts.set(normalized, {
      name: display,
      alertUntil: now + alertDurationMs,
      nextBeepAt: now,
    });
    // The 30-second lockout begins after the 10-second alarm finishes.
    state.cooldownUntilByName.set(normalized, now + alertDurationMs + cooldownMs);
    const paused = triggerMonsterPause(display);
    bot.log?.("X-ray monster alarm triggered", {
      monster: display,
      alertDurationMs,
      cooldownMs,
      pauseDurationMs,
      paused,
    });
    return true;
  }

  function serviceAlerts(now = Date.now()) {
    state.activeAlerts.forEach((alert, normalized) => {
      if (now >= alert.alertUntil) {
        state.activeAlerts.delete(normalized);
        return;
      }
      if (now >= alert.nextBeepAt) {
        playDoubleBeep();
        alert.nextBeepAt = now + doubleBeepRepeatMs;
      }
    });

    state.cooldownUntilByName.forEach((untilAt, normalized) => {
      if (now >= untilAt && !state.activeAlerts.has(normalized)) {
        state.cooldownUntilByName.delete(normalized);
      }
    });
  }

  function updateStatus() {
    const status = document.getElementById("minibia-bot-monster-xray-alarm-status");
    if (!status) return;

    if (!config.enabled) {
      status.textContent = "Status: off";
      return;
    }

    const now = Date.now();
    const alarming = [...state.activeAlerts.values()].map((entry) => entry.name);
    if (alarming.length) {
      status.textContent = `ALARM: ${alarming.join(", ")} — double beep for 10s; Cavebot/Auto Attack paused for 15s`;
      return;
    }

    if (state.lastDetectedNames.length) {
      const cooldowns = state.lastDetectedNames.map((name) => {
        const untilAt = Number(state.cooldownUntilByName.get(normalizeName(name)) || 0);
        const seconds = Math.max(0, Math.ceil((untilAt - now) / 1000));
        return seconds > 0 ? `${name} (${seconds}s cooldown)` : name;
      });
      status.textContent = `Detected: ${cooldowns.join(", ")}`;
      return;
    }

    status.textContent = "Status: watching X-ray creatures";
  }

  function checkMonsters(now = Date.now()) {
    if (!config.enabled) return false;

    const detected = getDetectedWatchedMonsters();
    const detectedNames = [];
    const seenNames = new Set();
    let triggered = false;

    detected.forEach((creature) => {
      const normalized = normalizeName(creature?.name);
      if (!normalized || seenNames.has(normalized)) return;
      seenNames.add(normalized);
      const display = config.monsterNames.find((watchedName) => normalizeName(watchedName) === normalized) || displayName(creature?.name);
      detectedNames.push(display);
      if (triggerName(display, now)) triggered = true;
    });

    state.lastDetectedNames = detectedNames;
    serviceAlerts(now);
    updateStatus();
    return triggered;
  }

  function tick() {
    if (!state.running || !config.enabled) return;
    try {
      checkMonsters();
    } catch (error) {
      bot.log?.("X-ray monster alarm tick failed", error?.message || error);
    } finally {
      if (state.running && config.enabled) {
        state.timerId = window.setTimeout(tick, scanIntervalMs);
      }
    }
  }

  function syncToggle() {
    const toggle = document.getElementById("minibia-bot-monster-xray-alarm-enabled");
    if (toggle) toggle.checked = !!config.enabled;
  }

  function start() {
    config.enabled = true;
    persistConfig();
    syncToggle();
    if (state.running) return false;
    state.running = true;
    state.lastDetectedNames = [];
    bot.log?.("X-ray monster alarm started", { monsterNames: [...config.monsterNames] });
    tick();
    return true;
  }

  function stop(options = {}) {
    config.enabled = false;
    if (options.persistEnabled !== false) persistConfig();
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    state.running = false;
    state.activeAlerts.clear();
    state.cooldownUntilByName.clear();
    state.lastDetectedNames = [];
    syncToggle();
    updateStatus();
    bot.log?.("X-ray monster alarm stopped");
    return true;
  }

  function addMonsterName(name) {
    const cleaned = displayName(name);
    if (!cleaned || isWatchedName(cleaned)) return false;
    config.monsterNames.push(cleaned);
    config.monsterNames = normalizeMonsterNames(config.monsterNames);
    persistConfig();
    renderMonsterList();
    if (config.enabled) checkMonsters();
    return true;
  }

  function removeMonsterName(name) {
    const normalized = normalizeName(name);
    const previousLength = config.monsterNames.length;
    config.monsterNames = config.monsterNames.filter((watchedName) => normalizeName(watchedName) !== normalized);
    if (config.monsterNames.length === previousLength) return false;
    state.activeAlerts.delete(normalized);
    state.cooldownUntilByName.delete(normalized);
    config.monsterNames = normalizeMonsterNames(config.monsterNames);
    persistConfig();
    renderMonsterList();
    if (config.enabled) checkMonsters();
    return true;
  }

  function renderMonsterList() {
    const list = document.getElementById("minibia-bot-monster-xray-alarm-list");
    if (!list) return;
    list.innerHTML = "";

    if (!config.monsterNames.length) {
      const empty = document.createElement("div");
      empty.className = "mb-small-note";
      empty.textContent = "No monster names added.";
      list.appendChild(empty);
      return;
    }

    config.monsterNames.forEach((name) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "6px";
      row.style.marginTop = "4px";

      const label = document.createElement("span");
      label.textContent = name;
      label.style.overflow = "hidden";
      label.style.textOverflow = "ellipsis";

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mb-button";
      removeButton.textContent = "Delete";
      removeButton.addEventListener("click", () => removeMonsterName(name));

      row.appendChild(label);
      row.appendChild(removeButton);
      list.appendChild(row);
    });
  }

  function injectPanelSection() {
    const existing = document.getElementById("minibia-bot-monster-xray-alarm-section");
    if (existing) {
      syncToggle();
      renderMonsterList();
      updateStatus();
      return true;
    }

    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const targetColumn = panel?.querySelector?.(".mb-side-column") || panel?.querySelector?.(".mb-cave-column") || panel?.querySelector?.(".mb-body") || panel;
    if (!targetColumn) return false;

    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-monster-xray-alarm-section";
    section.innerHTML = `
      <div class="mb-label">Monster Alarm</div>
      <div class="mb-stack">
        <label class="mb-toggle">
          <input type="checkbox" id="minibia-bot-monster-xray-alarm-enabled" />
          <span>Enable X-ray Monster Alarm</span>
        </label>
        <div class="mb-small-note">Detects watched monster names using X-ray creature data. On trigger: stop Cavebot/Auto Attack, send one stop-walk command, pause them for 15 seconds, then resume only what was running. Double-beeps for 10 seconds, then that name has a 30-second cooldown.</div>
        <div style="display:flex; gap:6px; margin-top:6px;">
          <input type="text" id="minibia-bot-monster-xray-alarm-name-input" class="mb-input" placeholder="Monster name" style="flex:1 1 auto;" />
          <button type="button" class="mb-button" id="minibia-bot-monster-xray-alarm-add">Add</button>
        </div>
        <div class="mb-small-note" style="margin-top:6px;">Monster list:</div>
        <div id="minibia-bot-monster-xray-alarm-list"></div>
        <div class="mb-small-note" id="minibia-bot-monster-xray-alarm-status">Status: off</div>
      </div>`;

    targetColumn.appendChild(section);

    const toggle = document.getElementById("minibia-bot-monster-xray-alarm-enabled");
    const nameInput = document.getElementById("minibia-bot-monster-xray-alarm-name-input");
    const addButton = document.getElementById("minibia-bot-monster-xray-alarm-add");

    toggle.checked = !!config.enabled;
    const submitName = () => {
      unlockAudio();
      if (addMonsterName(nameInput.value)) nameInput.value = "";
    };

    section.addEventListener("pointerdown", unlockAudio);
    section.addEventListener("click", unlockAudio);
    toggle.addEventListener("change", () => {
      unlockAudio();
      if (toggle.checked) start();
      else stop();
    });
    addButton.addEventListener("click", submitName);
    nameInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      submitName();
    });

    renderMonsterList();
    updateStatus();
    return true;
  }

  function watchForPanel() {
    if (injectPanelSection()) return;
    let attempts = 0;
    state.uiTimerId = window.setInterval(() => {
      attempts += 1;
      if (injectPanelSection() || attempts >= 40) {
        window.clearInterval(state.uiTimerId);
        state.uiTimerId = null;
      }
    }, 250);
  }

  function status() {
    return {
      running: state.running,
      config: { enabled: !!config.enabled, monsterNames: [...config.monsterNames] },
      activeAlerts: [...state.activeAlerts.values()].map((entry) => ({ ...entry })),
      cooldownUntilByName: Object.fromEntries(state.cooldownUntilByName),
      detectedNames: [...state.lastDetectedNames],
      pauseActive: state.pauseActive,
      pauseResumeSnapshot: state.pauseResumeSnapshot ? { ...state.pauseResumeSnapshot } : null,
      scanIntervalMs,
      alertDurationMs,
      cooldownMs,
      pauseDurationMs,
    };
  }

  bot.addCleanup?.(() => {
    if (state.timerId != null) window.clearTimeout(state.timerId);
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    if (state.pauseTimerId != null) window.clearTimeout(state.pauseTimerId);
    state.timerId = null;
    state.uiTimerId = null;
    state.pauseTimerId = null;
    state.running = false;
    state.pauseActive = false;
    state.pauseResumeSnapshot = null;
    state.activeAlerts.clear();
    try { state.audioContext?.close?.(); } catch (_) {}
    state.audioContext = null;
  });

  bot.monsterXrayAlarm = {
    start,
    stop,
    addMonsterName,
    removeMonsterName,
    checkMonsters,
    getDetectedWatchedMonsters,
    triggerMonsterPause,
    forceStopWalkingOnce,
    status,
    config,
  };

  if (config.enabled) start();
  window.setTimeout(watchForPanel, 0);
  return bot.monsterXrayAlarm;
};

if (window.minibiaBot) {
  window.__minibiaBotBundle.installMonsterXrayAlarmModule(window.minibiaBot);
}
