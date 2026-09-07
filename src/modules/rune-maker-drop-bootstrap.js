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
        cave.start();
        bot.log?.("rune maker drop resumed cavebot", { waypoint: cave.getCurrentWaypoint?.() || null });
      } catch (error) {
        bot.log?.("rune maker drop failed to resume cavebot", { error: error?.message || error });
      }
    }

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
      try { cave.start(); } catch (_) {}
    }
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
    coordination.phase = "to-waypoint-1";

    // Block Rune Maker Drop's normal low-cap trigger while we move the character
    // to waypoint 1. This is deliberately in-memory so the user's Rune Maker
    // Drop setting remains enabled and is restored after the cycle.
    setRuneEnabled(false);

    try {
      // Stop Cavebot before issuing the trip to waypoint 1 so there is exactly
      // one movement owner during this handoff.
      cave.stop({ persistEnabled: false });
      cave.setCurrentIndex?.(0);
      cave.goToWaypoint?.(firstWaypoint);
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

      // We are already stopped here, so there is no movement competition.
      // Re-enable Rune Maker Drop and let its normal tick start the drop cycle.
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

    // The panel is rebuilt during reloads, but the existing runeMakerDrop
    // object can survive long enough for this bootstrap to skip installation.
    // Stop that stale instance and reinstall it so its UI injection loop runs
    // again and restores the Rune Maker Drop section.
    if (bot.runeMakerDrop) {
      try {
        bot.runeMakerDrop.stop?.({ persistEnabled: false });
      } catch (_) {
        // Continue with a fresh installation even if the stale instance fails.
      }
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