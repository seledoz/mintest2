window.__minibiaBotBundle = window.__minibiaBotBundle || {};

(function installCaveActiveTimerGates(bundle) {
  if (!bundle || bundle.__caveActiveTimerGatesInstalled) return;
  bundle.__caveActiveTimerGatesInstalled = true;

  function wrapCaveInstaller() {
    const originalInstall = bundle.installCaveModule;
    if (typeof originalInstall !== "function" || originalInstall.__activeTimerGated) return;

    function installCaveModuleWithActiveTimers(bot) {
      const originalSetInterval = window.setInterval;
      let observerCallback = null;

      window.setInterval = function captureCaveIntervals(callback, delay, ...args) {
        const timerId = originalSetInterval.call(window, callback, delay, ...args);
        if (Number(delay) === 200 && observerCallback == null) {
          observerCallback = callback;
          window.clearInterval(timerId);
          return timerId;
        }
        return timerId;
      };

      let result;
      try {
        result = originalInstall(bot);
      } finally {
        window.setInterval = originalSetInterval;
      }

      if (!bot.cave || typeof observerCallback !== "function") return result;

      let observerTimerId = null;
      const startObserver = () => {
        if (observerTimerId != null || !bot.cave?.status?.().running) return false;
        observerTimerId = originalSetInterval.call(window, () => {
          try { observerCallback(); } catch (error) { bot.log?.("cave observer failed", error?.message || error); }
        }, 200);
        return true;
      };
      const stopObserver = () => {
        if (observerTimerId == null) return false;
        window.clearInterval(observerTimerId);
        observerTimerId = null;
        return true;
      };

      const originalStart = bot.cave.start?.bind(bot.cave);
      const originalStop = bot.cave.stop?.bind(bot.cave);
      if (originalStart) {
        bot.cave.start = (...args) => {
          const value = originalStart(...args);
          startObserver();
          return value;
        };
      }
      if (originalStop) {
        bot.cave.stop = (...args) => {
          const value = originalStop(...args);
          stopObserver();
          return value;
        };
      }

      if (bot.cave.status?.().running) startObserver();
      bot.addCleanup?.(stopObserver);
      bot.caveActiveObserver = { start: startObserver, stop: stopObserver, status: () => ({ running: observerTimerId != null }) };
      return result;
    }

    installCaveModuleWithActiveTimers.__activeTimerGated = true;
    installCaveModuleWithActiveTimers.__originalInstallCaveModule = originalInstall;
    bundle.installCaveModule = installCaveModuleWithActiveTimers;
  }

  function wrapForwardLoopInstaller() {
    const originalInstall = bundle.installCaveForwardLoopModule;
    if (typeof originalInstall !== "function" || originalInstall.__activeTimerGated) return;

    function installForwardLoopWithActiveTimer(bot) {
      const result = originalInstall(bot);
      if (!bot.caveForwardLoop || !bot.cave) return result;

      if (!bot.cave.status?.().running) bot.caveForwardLoop.stop?.();

      const originalStart = bot.cave.start?.bind(bot.cave);
      const originalStop = bot.cave.stop?.bind(bot.cave);
      if (originalStart) {
        bot.cave.start = (...args) => {
          const value = originalStart(...args);
          if (bot.cave.status?.().running) bot.caveForwardLoop.start?.();
          return value;
        };
      }
      if (originalStop) {
        bot.cave.stop = (...args) => {
          const value = originalStop(...args);
          bot.caveForwardLoop.stop?.();
          return value;
        };
      }
      return result;
    }

    installForwardLoopWithActiveTimer.__activeTimerGated = true;
    bundle.installCaveForwardLoopModule = installForwardLoopWithActiveTimer;
  }

  function wrapWaypointActionsInstaller() {
    const originalInstall = bundle.installCaveWaypointActionsModule;
    if (typeof originalInstall !== "function" || originalInstall.__activeTimerGated) return;

    function installWaypointActionsWithActiveTimer(bot) {
      const originalSetInterval = window.setInterval;
      let actionCallback = null;

      window.setInterval = function captureWaypointActionInterval(callback, delay, ...args) {
        const timerId = originalSetInterval.call(window, callback, delay, ...args);
        if (Number(delay) === 100 && actionCallback == null) {
          actionCallback = callback;
          window.clearInterval(timerId);
          return timerId;
        }
        return timerId;
      };

      let result;
      try {
        result = originalInstall(bot);
      } finally {
        window.setInterval = originalSetInterval;
      }

      if (typeof actionCallback !== "function" || !bot.cave) return result;

      let actionTimerId = null;
      const startActions = () => {
        if (actionTimerId != null || !bot.cave?.status?.().running) return false;
        actionTimerId = originalSetInterval.call(window, actionCallback, 100);
        return true;
      };
      const stopActions = () => {
        if (actionTimerId == null) return false;
        window.clearInterval(actionTimerId);
        actionTimerId = null;
        return true;
      };

      const originalStart = bot.cave.start?.bind(bot.cave);
      const originalStop = bot.cave.stop?.bind(bot.cave);
      if (originalStart) {
        bot.cave.start = (...args) => {
          const value = originalStart(...args);
          startActions();
          return value;
        };
      }
      if (originalStop) {
        bot.cave.stop = (...args) => {
          const value = originalStop(...args);
          stopActions();
          return value;
        };
      }

      if (bot.cave.status?.().running) startActions();
      bot.addCleanup?.(stopActions);
      bot.caveActiveWaypointActions = { start: startActions, stop: stopActions, status: () => ({ running: actionTimerId != null }) };
      return result;
    }

    installWaypointActionsWithActiveTimer.__activeTimerGated = true;
    bundle.installCaveWaypointActionsModule = installWaypointActionsWithActiveTimer;
  }

  wrapCaveInstaller();
  wrapForwardLoopInstaller();
  wrapWaypointActionsInstaller();
})(window.__minibiaBotBundle);
