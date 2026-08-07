(() => {
  const STORAGE_KEY = "minibiaBot.lure.config";

  function isPauseBreak(event) {
    return event?.key === "Pause" || event?.code === "Pause" || event?.keyCode === 19;
  }

  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest("input, textarea, select, [contenteditable=\"true\"]");
  }

  function readConfig(bot) {
    return bot?.storage?.get?.(STORAGE_KEY, {}) || {};
  }

  function install() {
    const bot = window.minibiaBot;
    if (!bot?.pauseBreak) return false;
    if (window.__minibiaLureMode2PauseBreakIntegrationInstalled) return true;
    window.__minibiaLureMode2PauseBreakIntegrationInstalled = true;

    let resumeMode2 = false;

    function getController() {
      return bot.lureMode2Astar || bot.lureMode2RouteProgress || bot.lureMode2Replacement || null;
    }

    function controllerRunning(controller) {
      try {
        const status = controller?.status?.();
        return !!(status?.running || status?.timerId != null || status?.active || status?.installed && readConfig(bot).enabled && Number(readConfig(bot).mode) === 2);
      } catch (_) {
        const cfg = readConfig(bot);
        return !!controller && !!cfg.enabled && Number(cfg.mode) === 2;
      }
    }

    function onKeyDown(event) {
      if (!isPauseBreak(event) || event.repeat || isTypingTarget(event.target)) return;

      const pauseState = bot.pauseBreak?.status?.() || { paused: false };
      const controller = getController();

      if (!pauseState.paused) {
        const cfg = readConfig(bot);
        resumeMode2 = !!controller && !!cfg.enabled && Number(cfg.mode) === 2 && controllerRunning(controller);
        if (resumeMode2) {
          try { controller.stop?.(); } catch (_) {}
          try {
            const pf = window.gameClient?.world?.pathfinder;
            ["stop", "cancel", "clear", "clearPath", "stopWalking"].forEach((name) => {
              if (typeof pf?.[name] === "function") pf[name]();
            });
          } catch (_) {}
          bot.log?.("Pause/Break stopped Lure Mode 2 controller");
        }
      } else {
        const shouldResume = resumeMode2;
        resumeMode2 = false;
        if (shouldResume) {
          window.setTimeout(() => {
            const cfg = readConfig(bot);
            if (!bot.pauseBreak?.status?.().paused && cfg.enabled && Number(cfg.mode) === 2) {
              try { getController()?.start?.(); } catch (_) {}
              bot.log?.("Pause/Break resumed Lure Mode 2 controller");
            }
          }, 0);
        }
      }
    }

    // Window capture runs before the existing document capture Pause/Break handler.
    window.addEventListener("keydown", onKeyDown, true);
    bot.addCleanup?.(() => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.__minibiaLureMode2PauseBreakIntegrationInstalled = false;
    });
    return true;
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 100) window.clearInterval(timerId);
  }, 100);
  install();
})();
