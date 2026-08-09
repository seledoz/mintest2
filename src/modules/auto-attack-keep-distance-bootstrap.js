(() => {
  const installer = window.__minibiaBotBundle?.installAutoAttackKeepDistanceModule;
  const bot = window.minibiaBot;
  if (typeof installer !== "function" || !bot || bot.attackKeepDistance) return;

  // The base keep-distance installer schedules its pathing tick immediately,
  // even when the feature is disabled. Suppress that one startup interval here
  // and let this bootstrap own both recurring timers so they only exist while
  // Keep Distance is enabled.
  const nativeSetInterval = window.setInterval;
  let suppressedInitialTick = false;
  window.setInterval = function keepDistanceInstallIntervalGuard(callback, delay, ...args) {
    if (!suppressedInitialTick && callback?.name === "tick") {
      suppressedInitialTick = true;
      return null;
    }
    return nativeSetInterval.call(window, callback, delay, ...args);
  };

  try {
    installer(bot);
  } finally {
    window.setInterval = nativeSetInterval;
  }

  let followGuardTimerId = null;
  let pathingTimerId = null;

  function isEnabled() {
    return !!bot.attackKeepDistance?.status?.().config?.enabled;
  }

  function clearFollowTarget() {
    const player = window.gameClient?.player;
    if (!isEnabled() || !player?.__followTarget) return false;

    try {
      player.setFollowTarget?.(null);
      if (typeof window.gameClient?.send === "function" && typeof FollowPacket === "function") {
        window.gameClient.send(new FollowPacket(0));
      }
      return true;
    } catch (error) {
      bot.log?.("keep distance follow guard failed", error?.message || error);
      return false;
    }
  }

  function stopTimers() {
    if (followGuardTimerId != null) {
      window.clearInterval(followGuardTimerId);
      followGuardTimerId = null;
    }
    if (pathingTimerId != null) {
      window.clearInterval(pathingTimerId);
      pathingTimerId = null;
    }
  }

  function startTimers() {
    if (!isEnabled()) {
      stopTimers();
      return;
    }

    const tickMs = Math.max(100, Number(bot.attackKeepDistance?.status?.().config?.tickMs) || 200);
    if (pathingTimerId == null) {
      pathingTimerId = window.setInterval(() => bot.attackKeepDistance?.tick?.(), tickMs);
    }
    if (followGuardTimerId == null) {
      // The game can apply follow immediately after selecting an attack target.
      // This guard only runs while Keep Distance is enabled.
      followGuardTimerId = window.setInterval(clearFollowTarget, 25);
    }
  }

  function syncTimers() {
    if (isEnabled()) startTimers();
    else stopTimers();
  }

  // External callers that toggle Keep Distance through the module API should
  // immediately start/stop its recurring work.
  const originalUpdateConfig = bot.attackKeepDistance?.updateConfig?.bind(bot.attackKeepDistance);
  if (originalUpdateConfig) {
    bot.attackKeepDistance.updateConfig = (nextConfig = {}) => {
      const result = originalUpdateConfig(nextConfig);
      syncTimers();
      return result;
    };
  }

  // The UI listener inside the base module closes over its private updateConfig,
  // so add a second listener after installation to synchronize timers after the
  // checkbox changes. The base listener was registered first.
  const enabledInput = document.getElementById("minibia-bot-auto-attack-keep-distance-enabled");
  const onEnabledChange = () => window.setTimeout(syncTimers, 0);
  enabledInput?.addEventListener("change", onEnabledChange);

  const originalStatus = bot.status;
  if (typeof originalStatus === "function") {
    bot.status = () => ({
      ...originalStatus(),
      attackKeepDistance: bot.attackKeepDistance?.status?.() || null,
    });
  }

  syncTimers();

  bot.addCleanup?.(() => {
    stopTimers();
    enabledInput?.removeEventListener("change", onEnabledChange);
  });

  console.log("[minibia-bot] auto attack keep-distance ready");
})();