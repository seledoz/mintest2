window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installLureModeModule = function installLureModeModule(bot) {
  const configStorageKey = "minibiaBot.lure.config";
  const COUNT_RANGE = 7;
  const COUNT_RANGE_Y = 5;
  const TICK_MS = 150;
  const DEFAULT_STEP_DELAY_MS = 450;

  const config = Object.assign(
    { enabled: false, mode: 1, minMonsters: 3, maxDistance: 4, stepDelayMs: DEFAULT_STEP_DELAY_MS },
    bot.storage.get(configStorageKey, {}) || {}
  );

  const state = {
    timerId: null,
    uiTimerId: null,
    pathfinder: null,
    originalFindPath: null,
    suppressingAttack: false,
    restoreAttackEnabled: false,
    lastHoldLogAt: 0,
    lastStatus: null,
    clearingPack: false,
    resumeCaveAfterClear: false,
    nextMode2StepAt: 0,
    mode2StepOrigin: null,
    mode2StepInProgress: false,
  };

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function intValue(value, fallback, min = 1, max = 99) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }
  function modeValue(value) { return Number(value) === 2 ? 2 : 1; }
  function pos(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }
      : null;
  }
  function dist(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return Infinity;
    return Math.max(Math.abs(Number(a.x) - Number(b.x)), Math.abs(Number(a.y) - Number(b.y)));
  }
  function isWithinDetectionRange(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return false;
    return Math.abs(Number(a.x) - Number(b.x)) <= COUNT_RANGE
      && Math.abs(Number(a.y) - Number(b.y)) <= COUNT_RANGE_Y;
  }
  function playerPos() { return pos(bot.getPlayerPosition?.() || window.gameClient?.player?.__position); }
  function monsterPos(monster) { return pos(monster?.getPosition?.() || monster?.__position); }
  function currentTarget() { return bot.attack?.getCurrentTarget?.() || window.gameClient?.player?.__target || null; }
  function visibleMonsters() { return bot.attack?.getNearbyMonsters?.() || bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []; }

  function resetMode2Step() {
    state.mode2StepOrigin = null;
    state.mode2StepInProgress = false;
  }

  function getOffStatus() {
    return {
      enabled: false,
      mode: modeValue(config.mode),
      countRange: COUNT_RANGE,
      minMonsters: intValue(config.minMonsters, 3, 1, 20),
      maxDistance: intValue(config.maxDistance, 4, 1, COUNT_RANGE),
      stepDelayMs: intValue(config.stepDelayMs, DEFAULT_STEP_DELAY_MS, 100, 2000),
      monsterCount: 0,
      closestDistance: null,
      farthestDistance: null,
      readyToEngage: false,
      clearingPack: false,
      luring: false,
      shouldHoldWalking: false,
      hasTarget: false,
      combatActive: false,
    };
  }

  function getLureMonsters() {
    if (!config.enabled) return [];
    const me = playerPos();
    if (!me) return [];
    return visibleMonsters()
      .map((monster) => ({ monster, position: monsterPos(monster) }))
      .map((entry) => ({ ...entry, distance: dist(me, entry.position) }))
      .filter((entry) => entry.position && isWithinDetectionRange(me, entry.position))
      .sort((a, b) => a.distance - b.distance || Number(a.monster?.id || 0) - Number(b.monster?.id || 0));
  }

  function getLureStatus() {
    if (!config.enabled) return getOffStatus();
    const monsters = getLureMonsters();
    const mode = modeValue(config.mode);
    const minMonsters = intValue(config.minMonsters, 3, 1, 20);
    const maxDistance = intValue(config.maxDistance, 4, 1, COUNT_RANGE);
    const stepDelayMs = intValue(config.stepDelayMs, DEFAULT_STEP_DELAY_MS, 100, 2000);
    const hasTarget = !!currentTarget();
    const combatActive = !!bot.attack?.status?.()?.combatActive;
    const closestDistance = monsters.length ? monsters[0].distance : Infinity;
    const farthestDistance = monsters.length ? monsters[monsters.length - 1].distance : Infinity;
    const readyToEngage = monsters.length >= minMonsters;
    const clearingPack = !!state.clearingPack;
    const luring = monsters.length > 0 && !readyToEngage && !clearingPack && !hasTarget && !combatActive;
    const mode1Hold = luring && closestDistance > maxDistance;
    const mode2Hold = luring && (
      farthestDistance > maxDistance
      || state.mode2StepInProgress
      || Date.now() < state.nextMode2StepAt
    );

    return {
      enabled: true,
      mode,
      countRange: COUNT_RANGE,
      minMonsters,
      maxDistance,
      stepDelayMs,
      monsterCount: monsters.length,
      closestDistance: Number.isFinite(closestDistance) ? closestDistance : null,
      farthestDistance: Number.isFinite(farthestDistance) ? farthestDistance : null,
      readyToEngage,
      clearingPack,
      luring,
      shouldHoldWalking: (mode === 2 ? mode2Hold : mode1Hold) || (clearingPack && (monsters.length > 0 || hasTarget || combatActive)),
      hasTarget,
      combatActive,
    };
  }

  function setAttackSuppressed(shouldSuppress) {
    const attackConfig = bot.attack?.config;
    if (!attackConfig) return false;
    if (shouldSuppress) {
      if (!state.suppressingAttack) {
        state.restoreAttackEnabled = !!attackConfig.enabled;
        state.suppressingAttack = true;
      }
      attackConfig.enabled = false;
      return true;
    }
    if (state.suppressingAttack) {
      if (state.restoreAttackEnabled) attackConfig.enabled = true;
      state.suppressingAttack = false;
      state.restoreAttackEnabled = false;
      return true;
    }
    return false;
  }

  function stopCurrentPath() {
    const pf = window.gameClient?.world?.pathfinder;
    if (!pf) return false;
    let stopped = false;
    ["stop", "cancel", "clear", "clearPath", "stopWalking", "reset"].forEach((name) => {
      if (typeof pf[name] !== "function") return;
      try { pf[name](); stopped = true; } catch (error) {}
    });
    return stopped;
  }

  function pauseCaveForFight() {
    resetMode2Step();
    stopCurrentPath();
    try {
      const caveStatus = bot.cave?.status?.();
      if (caveStatus?.running && typeof bot.cave.stop === "function") {
        state.resumeCaveAfterClear = true;
        bot.cave.stop();
      }
    } catch (error) {}
  }

  function resumeCaveIfNeeded() {
    if (!state.resumeCaveAfterClear) return;
    state.resumeCaveAfterClear = false;
    try { bot.cave?.start?.(); } catch (error) {}
  }

  function patchPathfinder() {
    if (!config.enabled) return false;
    const pf = window.gameClient?.world?.pathfinder;
    if (!pf || typeof pf.findPath !== "function") return false;
    if (state.pathfinder === pf && state.originalFindPath) return true;
    if (state.pathfinder && state.originalFindPath) {
      try { state.pathfinder.findPath = state.originalFindPath; } catch (error) {}
    }

    state.pathfinder = pf;
    state.originalFindPath = pf.findPath.bind(pf);
    pf.findPath = function lureModeFindPathGuard(...args) {
      if (!config.enabled) return state.originalFindPath(...args);
      const status = getLureStatus();
      state.lastStatus = status;

      if (status.shouldHoldWalking) {
        const now = Date.now();
        stopCurrentPath();
        if (now - state.lastHoldLogAt > 1500) {
          state.lastHoldLogAt = now;
          bot.log?.(`lure mode ${status.mode} holding path`, {
            monsterCount: status.monsterCount,
            closestDistance: status.closestDistance,
            farthestDistance: status.farthestDistance,
            maxDistance: status.maxDistance,
            clearingPack: status.clearingPack,
          });
        }
        return null;
      }

      if (status.mode === 2 && status.luring) {
        state.mode2StepOrigin = playerPos();
        state.mode2StepInProgress = !!state.mode2StepOrigin;
      }

      return state.originalFindPath(...args);
    };
    return true;
  }

  function restorePathfinder() {
    if (state.pathfinder && state.originalFindPath) {
      try { state.pathfinder.findPath = state.originalFindPath; } catch (error) {}
    }
    state.pathfinder = null;
    state.originalFindPath = null;
  }

  function updateStatusUi(status = null) {
    const label = document.getElementById("minibia-bot-lure-status");
    if (!label) return;
    const current = status || (config.enabled ? state.lastStatus || getLureStatus() : getOffStatus());
    const prefix = `Lure ${current.mode}`;
    if (!current.enabled) label.textContent = `${prefix}: off`;
    else if (current.clearingPack) label.textContent = `${prefix}: clearing ${current.monsterCount} left`;
    else if (current.readyToEngage) label.textContent = `${prefix}: engaging ${current.monsterCount}/${current.minMonsters}`;
    else if (current.shouldHoldWalking) {
      const distance = current.mode === 2 ? current.farthestDistance : current.closestDistance;
      label.textContent = `${prefix}: waiting ${distance}/${current.maxDistance}`;
    } else if (current.monsterCount > 0) label.textContent = `${prefix}: walking ${current.monsterCount}/${current.minMonsters}`;
    else label.textContent = `${prefix}: looking 0/${current.minMonsters}`;
  }

  function tick() {
    if (!config.enabled) return getOffStatus();
    patchPathfinder();

    if (modeValue(config.mode) === 2 && state.mode2StepInProgress) {
      const current = playerPos();
      if (current && state.mode2StepOrigin && dist(current, state.mode2StepOrigin) >= 1) {
        stopCurrentPath();
        resetMode2Step();
        state.nextMode2StepAt = Date.now() + intValue(
          config.stepDelayMs,
          DEFAULT_STEP_DELAY_MS,
          100,
          2000
        );
      }
    }

    let status = getLureStatus();
    state.lastStatus = status;

    if (state.clearingPack && !status.hasTarget && !status.combatActive && status.monsterCount === 0) {
      state.clearingPack = false;
      status = getLureStatus();
      bot.log?.(`lure mode ${status.mode} pack cleared`);
      resumeCaveIfNeeded();
    }

    if (state.clearingPack) {
      setAttackSuppressed(false);
      pauseCaveForFight();
      if (!status.hasTarget && status.monsterCount > 0) bot.attack?.triggerAttack?.();
      const current = getLureStatus();
      state.lastStatus = current;
      updateStatusUi(current);
      return current;
    }

    if (status.readyToEngage) {
      state.clearingPack = true;
      setAttackSuppressed(false);
      pauseCaveForFight();
      bot.attack?.triggerAttack?.();
      window.setTimeout(() => {
        if (!config.enabled) return;
        pauseCaveForFight();
        bot.attack?.triggerAttack?.();
      }, 100);
      bot.log?.(`lure mode ${status.mode} engaging pack`, {
        monsterCount: status.monsterCount,
        minMonsters: status.minMonsters,
        countRange: COUNT_RANGE,
      });
      const current = getLureStatus();
      state.lastStatus = current;
      updateStatusUi(current);
      return current;
    }

    if (status.hasTarget || status.combatActive) {
      resetMode2Step();
      setAttackSuppressed(false);
      updateStatusUi(status);
      return status;
    }

    setAttackSuppressed(true);
    if (status.shouldHoldWalking) stopCurrentPath();
    updateStatusUi(status);
    return status;
  }

  function startRuntime() {
    if (!config.enabled || state.timerId != null) return false;
    state.nextMode2StepAt = 0;
    resetMode2Step();
    patchPathfinder();
    tick();
    state.timerId = window.setInterval(() => {
      try { tick(); } catch (error) { bot.log?.("lure mode tick failed", error?.message || error); }
    }, TICK_MS);
    return true;
  }

  function stopRuntime() {
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
    state.clearingPack = false;
    state.nextMode2StepAt = 0;
    resetMode2Step();
    state.lastStatus = getOffStatus();
    setAttackSuppressed(false);
    resumeCaveIfNeeded();
    restorePathfinder();
    updateStatusUi(state.lastStatus);
    return true;
  }

  function updateConfig(nextConfig = {}) {
    const hadEnabled = !!config.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) config.enabled = !!nextConfig.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "mode")) {
      config.mode = modeValue(nextConfig.mode);
      state.nextMode2StepAt = 0;
      resetMode2Step();
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMonsters")) config.minMonsters = intValue(nextConfig.minMonsters, config.minMonsters || 3, 1, 20);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxDistance")) config.maxDistance = intValue(nextConfig.maxDistance, config.maxDistance || 4, 1, COUNT_RANGE);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "stepDelayMs")) config.stepDelayMs = intValue(nextConfig.stepDelayMs, config.stepDelayMs || DEFAULT_STEP_DELAY_MS, 100, 2000);
    persistConfig();
    if (config.enabled && !hadEnabled) startRuntime();
    else if (!config.enabled && hadEnabled) stopRuntime();
    else if (!config.enabled) state.lastStatus = getOffStatus();
    bot.log?.("lure mode config updated", { ...config, countRange: COUNT_RANGE });
    updateUiValues();
    updateStatusUi();
    return { ...config };
  }

  function updateUiValues() {
    const enabled = document.getElementById("minibia-bot-lure-enabled");
    const mode = document.getElementById("minibia-bot-lure-mode");
    const min = document.getElementById("minibia-bot-lure-min-monsters");
    const max = document.getElementById("minibia-bot-lure-max-distance");
    const delay = document.getElementById("minibia-bot-lure-step-delay");
    if (enabled) enabled.checked = !!config.enabled;
    if (mode && document.activeElement !== mode) mode.value = String(modeValue(config.mode));
    if (min && document.activeElement !== min) min.value = String(intValue(config.minMonsters, 3, 1, 20));
    if (max && document.activeElement !== max) max.value = String(intValue(config.maxDistance, 4, 1, COUNT_RANGE));
    if (delay && document.activeElement !== delay) delay.value = String(intValue(config.stepDelayMs, DEFAULT_STEP_DELAY_MS, 100, 2000));
  }

  function installLureStyle() {
    let style = document.getElementById("minibia-bot-lure-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "minibia-bot-lure-style";
      document.head.appendChild(style);
    }
    style.textContent = `
      #minibia-bot-lure-section .mb-row-three { grid-template-columns: 1fr 72px 38px; }
      #minibia-bot-lure-section select,
      #minibia-bot-lure-section input[type="number"] { min-width: 0; width: 100%; box-sizing: border-box; }
    `;
  }

  function installUi() {
    const section = document.getElementById("minibia-bot-lure-section");
    if (!section) return false;
    installLureStyle();
    const stack = section.querySelector(".mb-stack");
    if (!stack) return false;

    let mode = document.getElementById("minibia-bot-lure-mode");
    if (!mode) {
      const row = document.createElement("div");
      row.className = "mb-row-three";
      row.innerHTML = `<span>Mode</span><select id="minibia-bot-lure-mode"><option value="1">1</option><option value="2">2</option></select><span></span>`;
      const minRow = document.getElementById("minibia-bot-lure-min-monsters")?.closest?.(".mb-row-three");
      if (minRow) stack.insertBefore(row, minRow);
      else stack.appendChild(row);
      mode = row.querySelector("select");
      mode.addEventListener("change", (event) => updateConfig({ mode: Number(event.target.value) }));
    }

    let delay = document.getElementById("minibia-bot-lure-step-delay");
    if (!delay) {
      const row = document.createElement("div");
      row.className = "mb-row-three";
      row.innerHTML = `<span>Step Delay</span><input type="number" id="minibia-bot-lure-step-delay" min="100" max="2000" step="50" /><span>ms</span>`;
      const statusLabel = document.getElementById("minibia-bot-lure-status");
      if (statusLabel) stack.insertBefore(row, statusLabel);
      else stack.appendChild(row);
      delay = row.querySelector("input");
      delay.addEventListener("change", (event) => updateConfig({ stepDelayMs: Number(event.target.value) }));
    }

    updateUiValues();
    updateStatusUi();
    return true;
  }

  function startUiWatcher() {
    if (state.uiTimerId != null) return;
    installUi();
    state.uiTimerId = window.setInterval(() => {
      try { installUi(); } catch (error) {}
    }, 1000);
  }

  function stopUiWatcher() {
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
  }

  bot.lureMode = {
    config,
    status: () => state.lastStatus || (config.enabled ? getLureStatus() : getOffStatus()),
    updateConfig,
    start: (overrides = {}) => updateConfig({ ...overrides, enabled: true }),
    stop: (options = {}) => {
      const persistEnabled = options.persistEnabled !== false;
      if (persistEnabled) return updateConfig({ enabled: false });
      config.enabled = false;
      stopRuntime();
      updateUiValues();
      return { ...config };
    },
  };

  startUiWatcher();
  if (config.enabled) startRuntime();
  bot.addCleanup?.(() => {
    stopRuntime();
    stopUiWatcher();
  });
};