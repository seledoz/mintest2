window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaveForwardLoopModule = function installCaveForwardLoopModule(bot) {
  if (!bot || bot.caveForwardLoop?.destroy) return bot?.caveForwardLoop;

  const configStorageKey = "minibiaBot.caveForwardLoop.config";
  const state = {
    timerId: null,
    wrapCount: 0,
    lastWrapAt: 0,
    originalAttackStatus: null,
    lastCombatActiveAt: 0,
  };

  const config = Object.assign(
    {
      enabled: true,
      checkMs: 250,
      combatRetargetGraceMs: 750,
    },
    bot.storage.get(configStorageKey, {}) || {}
  );

  config.enabled = config.enabled !== false;
  config.checkMs = Math.max(100, Math.trunc(Number(config.checkMs) || 250));
  config.combatRetargetGraceMs = Math.max(0, Math.trunc(Number(config.combatRetargetGraceMs) || 750));

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function installCombatRetargetGrace() {
    if (!bot.attack?.status || state.originalAttackStatus) return false;

    state.originalAttackStatus = bot.attack.status.bind(bot.attack);
    bot.attack.status = function statusWithCombatRetargetGrace() {
      const status = state.originalAttackStatus();
      const now = Date.now();

      if (status?.combatActive) {
        state.lastCombatActiveAt = now;
        return status;
      }

      const graceMs = Math.max(0, Number(config.combatRetargetGraceMs) || 0);
      const elapsed = state.lastCombatActiveAt ? now - state.lastCombatActiveAt : Number.POSITIVE_INFINITY;
      if (graceMs > 0 && elapsed < graceMs) {
        return {
          ...status,
          combatActive: true,
          combatRetargetGrace: true,
          combatRetargetGraceRemainingMs: Math.max(0, graceMs - elapsed),
        };
      }

      return status;
    };

    return true;
  }

  function removeCombatRetargetGrace() {
    if (!state.originalAttackStatus || !bot.attack) return;
    bot.attack.status = state.originalAttackStatus;
    state.originalAttackStatus = null;
    state.lastCombatActiveAt = 0;
  }

  function wrapIfReversing() {
    if (!config.enabled || !bot.cave?.status || !bot.cave?.setCurrentIndex) return false;

    const caveStatus = bot.cave.status();
    const routeLength = Array.isArray(caveStatus.route) ? caveStatus.route.length : 0;
    if (!caveStatus.running || routeLength <= 1) return false;

    if (Number(caveStatus.direction) < 0) {
      bot.cave.setCurrentIndex(0);
      state.wrapCount += 1;
      state.lastWrapAt = Date.now();
      bot.log("cave forward loop wrapped to first waypoint instead of reversing", {
        routeLength,
        previousIndex: Number(caveStatus.currentIndex) + 1,
        wrapCount: state.wrapCount,
      });
      return true;
    }

    return false;
  }

  function start() {
    installCombatRetargetGrace();
    if (state.timerId != null) return false;
    state.timerId = window.setInterval(wrapIfReversing, config.checkMs);
    return true;
  }

  function stop() {
    if (state.timerId != null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    return true;
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) {
      config.enabled = nextConfig.enabled !== false;
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "checkMs")) {
      config.checkMs = Math.max(100, Math.trunc(Number(nextConfig.checkMs) || config.checkMs || 250));
      if (state.timerId != null) {
        stop();
        start();
      }
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "combatRetargetGraceMs")) {
      config.combatRetargetGraceMs = Math.max(0, Math.trunc(Number(nextConfig.combatRetargetGraceMs) || 0));
    }
    persistConfig();
    return { ...config };
  }

  function status() {
    return {
      running: state.timerId != null,
      config: { ...config },
      wrapCount: state.wrapCount,
      lastWrapAt: state.lastWrapAt,
      lastCombatActiveAt: state.lastCombatActiveAt,
    };
  }

  function destroy() {
    stop();
    removeCombatRetargetGrace();
  }

  bot.caveForwardLoop = {
    start,
    stop,
    status,
    updateConfig,
    wrapIfReversing,
    destroy,
    config,
  };

  start();
  bot.addCleanup(destroy);
  return bot.caveForwardLoop;
};
