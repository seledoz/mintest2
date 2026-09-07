(() => {
  const bundle = window.__minibiaBotBundle || window.__minibiaBotReloadBundle;
  const install = bundle?.installRuneMakerDropModule;
  if (typeof install !== "function") return;

  const runeConfigStorageKey = "minibiaBot.runeMakerDrop.config";
  const coordination = {
    timerId: null,
    phase: "idle",
    resumeCave: false,
    runeStarted: false,
    wasRuneEnabled: false,
    pausedCombatModules: [],
  };

  function stopCoordinationTimer() {
    if (coordination.timerId != null) {
      window.clearInterval(coordination.timerId);
      coordination.timerId = null;
    }
  }

  function getCaveStatus() {
    try {
      return window.minibiaBot?.cave?.status?.() || null;
    } catch (_) {
      return null;
    }
  }

  function getRuneStatus() {
    try {
      return window.minibiaBot?.runeMakerDrop?.status?.() || null;
    } catch (_) {
      return null;
    }
  }

  function getPlayerPosition() {
    try {
      return window.minibiaBot?.getPlayerPosition?.() || null;
    } catch (_) {
      return null;
    }
  }

  function samePosition(a, b) {
    if (!a || !b) return false;
    return Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y) && Number(a.z) === Number(b.z);
  }

  function setRuneEnabled(enabled) {
    const rune = window.minibiaBot?.runeMakerDrop;
    if (!rune?.config) return false;
    rune.config.enabled = !!enabled;
    return true;
  }

  function clearGamePath() {
    try {
      window.gameClient?.world?.pathfinder?.setPathfindCache?.(null);
    } catch (error) {
      window.minibiaBot?.log?.("rune maker drop could not clear active path", error?.message || error);
    }
  }

  function pauseCombatModules() {
    const bot = window.minibiaBot;
    if (!bot) return;

    coordination.pausedCombatModules = [];
    const modules = [bot.attack, bot.attackAoe, bot.attackGfb];
    modules.forEach((module) => {
      if (!module?.stop || !module?.status) return;
      try {
        const status = module.status();
        if (!status?.running) return;
        coordination.pausedCombatModules.push(module);
        module.stop({ persistEnabled: false });
      } catch (error) {
        bot.log?.("rune maker drop could not pause combat module", { error: error?.message || error });
      }
    });

    clearGamePath();
  }

  function resumeCombatModules() {
    const modules = coordination.pausedCombatModules.slice();
    coordination.pausedCombatModules = [];
    modules.forEach((module) => {
      try { module.start?.(); } catch (error) {
        window.minibiaBot?.log?.("rune maker drop could not resume combat module", { error: error?.message || error });
      }
    });
  }

  function restoreRuneEnabled() {
    setRuneEnabled(coordination.wasRuneEnabled);
  }

  function finishCoordination(message = "rune maker drop coordination complete") {
    const bot = window.minibiaBot;
    const cave = bot?.cave;
    const caveStatus = getCaveStatus();
    const shouldResume = coordination.resumeCave && coordination.wasRuneEnabled && caveStatus?.config?.enabled !== false;

    coordination.phase = "idle";
    coordination.runeStarted = false;
    coordination.resumeCave = false;

    restoreRuneEnabled();

    if (shouldResume && cave) {
      try {
        cave.setCurrentIndex?.(0);
        cave.start();
        bot.log?.("rune maker drop resumed cavebot from waypoint 1", { waypoint: cave.getCurrentWaypoint?.() || null });
      } catch (error) {
        bot.log?.("rune maker drop failed to resume cavebot", { error: error?.message || error });
      }
    }

    resumeCombatModules();
    bot.log?.(message);
  }

  function abortCoordination(message) {
    const bot = window.minibiaBot;
    const cave = bot?.cave;
    const caveStatus = getCaveStatus();
    const shouldResume = coordination.resumeCave && caveStatus?.config?.enabled !== false;

    coordination.phase = "idle";
    coordination.runeStarted = false;
    coordination.resumeCave = false;
    restoreRuneEnabled();

    if (shouldResume && cave) {
      try {
        cave.setCurrentIndex?.(0);
        cave.start();
      } catch (_) {}
    }
    resumeCombatModules();
    bot.log?.(message);
  }

  function beginCoordination() {
    const bot = window.minibiaBot;
    const rune = bot?.runeMakerDrop;
    const cave = bot?.cave;
    const caveStatus = getCaveStatus();
    const runeStatus = getRuneStatus();
    const route = cave?.getRoute?.() || [];

    if (!rune?.config || !runeStatus || runeStatus.phase !== "idle") return false;
    if (!rune.config.enabled) return false;

    // Only coordinate when Cavebot is actually running and has a first waypoint.
    // Otherwise preserve the Rune Maker Drop module's existing behavior.
    if (!caveStatus?.running || !route.length) return false;

    const firstWaypoint = route[0];
    if (!firstWaypoint) return false;

    coordination.wasRuneEnabled = true;
    coordination.resumeCave = true;
    coordination.runeStarted = false;
    coordination.pausedCombatModules = [];
    coordination.phase = "to-waypoint-1";

    // Block Rune Maker Drop's normal low-cap trigger while the character is
    // being handed off to waypoint 1. Keep the user's setting enabled in the UI.
    setRuneEnabled(false);

    try {
      // First stop Cavebot and every active combat controller, then clear any
      // already queued game path. This prevents movement/fighting from racing
      // the Rune Maker Drop handoff.
      cave.stop({ persistEnabled: false });
      pauseCombatModules();
      clearGamePath();
      cave.setCurrentIndex?.(0);
      if (!cave.goToWaypoint?.(firstWaypoint)) {
        throw new Error("Cavebot could not path to waypoint 1");
      }
      bot.log?.("rune maker drop waiting at cavebot waypoint 1", { waypoint: firstWaypoint });
      return true;
    } catch (error) {
      abortCoordination("rune maker drop cavebot handoff failed: " + (error?.message || error));
      return false;
    }
  }

  function tickCoordination() {
    const bot = window.minibiaBot;
    const rune = bot?.runeMakerDrop;
    const cave = bot?.cave;
    if (!bot || !rune || !cave) return;

    const runeStatus = getRuneStatus();
    const caveStatus = getCaveStatus();
    if (!runeStatus || !caveStatus) return;

    if (coordination.phase === "idle") {
      if (!runeStatus.config?.enabled || runeStatus.phase !== "idle") return;
      const capacity = Number(runeStatus.capacity);
      const lowCap = Number(runeStatus.config?.lowCap);
      if (!Number.isFinite(capacity) || !Number.isFinite(lowCap) || capacity > lowCap) return;
      beginCoordination();
      return;
    }

    if (!coordination.resumeCave) {
      coordination.phase = "idle";
      return;
    }

    const route = cave.getRoute?.() || [];
    const firstWaypoint = route[0];
    const position = getPlayerPosition();

    if (coordination.phase === "to-waypoint-1") {
      if (!firstWaypoint || !position) return;
      const atFirstWaypoint = cave.isAtWaypoint?.(position, firstWaypoint) || samePosition(position, firstWaypoint);
      if (!atFirstWaypoint) return;

      // We are already stopped here and combat modules remain paused. Re-enable
      // Rune Maker Drop so its normal tick starts the drop cycle.
      setRuneEnabled(true);
      coordination.phase = "waiting-for-rune-cycle";
      bot.log?.("rune maker drop reached cavebot waypoint 1; starting drop cycle");
      return;
    }

    if (coordination.phase === "waiting-for-rune-cycle") {
      if (runeStatus.phase !== "idle") coordination.runeStarted = true;
      if (coordination.runeStarted && runeStatus.phase === "idle") {
        finishCoordination();
      }
    }
  }

  function startCoordination() {
    stopCoordinationTimer();
    tickCoordination();
    coordination.timerId = window.setInterval(tickCoordination, 200);
  }

  function installOnBot(bot) {
    if (!bot) return bot;

    if (bot.runeMakerDrop) {
      try {
        bot.runeMakerDrop.stop?.({ persistEnabled: false });
      } catch (_) {}
      try {
        delete bot.runeMakerDrop;
      } catch (_) {
        bot.runeMakerDrop = null;
      }
    }

    // Prevent the module's synchronous startup tick from taking the low-cap
    // trip before Cavebot coordination gets a chance to hand off movement.
    const storedConfig = bot.storage?.get?.(runeConfigStorageKey, {}) || {};
    const storedEnabled = storedConfig.enabled === true;
    if (storedEnabled) {
      bot.storage?.set?.(runeConfigStorageKey, { ...storedConfig, enabled: false });
    }

    install(bot);

    if (storedEnabled && bot.runeMakerDrop?.config) {
      bot.runeMakerDrop.config.enabled = true;
    }

    startCoordination();
    bot.addCleanup?.(() => {
      stopCoordinationTimer();
      resumeCombatModules();
      bot.runeMakerDrop?.stop?.({ persistEnabled: false });
    });
    return bot;
  }

  installOnBot(window.minibiaBot);

  const originalReload = window.minibiaBotReload;
  if (typeof originalReload === "function" && !originalReload.__runeMakerDropWrapped) {
    const wrappedReload = (...args) => installOnBot(originalReload(...args));
    wrappedReload.__runeMakerDropWrapped = true;
    window.minibiaBotReload = wrappedReload;
    if (window.minibiaBot) window.minibiaBot.reload = wrappedReload;
  }
})();