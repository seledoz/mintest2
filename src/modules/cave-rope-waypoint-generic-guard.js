(() => {
  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const ropeAction = "rope";

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function isRopeAction(bot) {
    const status = bot?.cave?.status?.();
    if (!status?.running) return false;
    const index = Math.trunc(Number(status.currentIndex) || 0);
    const preset = String(status.activePresetName || bot.cave?.getActivePresetName?.() || "Default").trim().replace(/\s+/g, " ") || "Default";
    const all = bot.storage.get(actionStorageKey, {});
    const actions = all && typeof all === "object" && !Array.isArray(all) ? all[preset] : null;
    return Array.isArray(actions) && actions[index] === ropeAction;
  }

  function getCurrentWaypoint(bot, status = bot?.cave?.status?.()) {
    const direct = normalizePosition(status?.currentWaypoint);
    if (direct) return direct;
    const route = bot?.cave?.getRoute?.() || [];
    const index = Math.trunc(Number(status?.currentIndex) || 0);
    return normalizePosition(route[index]);
  }

  function isRopeSource(source) {
    if (!source?.which) return false;
    const item = source.item || source.which?.getSlotItem?.(source.index);
    const name = String(item?.name || item?.typeName || item?.description || "");
    return /\brope\b/i.test(name);
  }

  function install(bot) {
    if (!bot?.cave?.status || window.__minibiaRopeGenericGuardInstalled) return;
    const mouse = window.gameClient?.mouse;
    if (!mouse || typeof mouse.__handleItemUseWith__ !== "function") return;

    const original = mouse.__handleItemUseWith__;
    const wrapped = function guardedRopeUse(source, target, ...args) {
      try {
        if (isRopeSource(source) && isRopeAction(bot)) {
          const waypoint = getCurrentWaypoint(bot);
          const player = normalizePosition(bot.getPlayerPosition?.());
          const targetPosition = normalizePosition(target?.which?.__position || target?.which?.position);

          // During a rope waypoint, only the exact waypoint X/Y on the
          // player's current floor may receive a rope. This blocks the
          // generic cave floor-change scanner from trying multiple tiles.
          if (!waypoint || !player || !targetPosition ||
              targetPosition.z !== player.z ||
              targetPosition.x !== waypoint.x ||
              targetPosition.y !== waypoint.y) {
            bot.log?.("cave blocked generic rope target", { target: targetPosition, waypoint, player });
            return false;
          }
        }
      } catch (_) {}
      return original.call(this, source, target, ...args);
    };

    wrapped.__minibiaRopeGenericGuard = true;
    wrapped.__minibiaRopeGenericGuardOriginal = original;
    mouse.__handleItemUseWith__ = wrapped;
    window.__minibiaRopeGenericGuardInstalled = true;

    bot.addCleanup?.(() => {
      try {
        if (mouse.__handleItemUseWith__?.__minibiaRopeGenericGuard) {
          mouse.__handleItemUseWith__ = original;
        }
      } catch (_) {}
      try { delete window.__minibiaRopeGenericGuardInstalled; } catch (_) { window.__minibiaRopeGenericGuardInstalled = false; }
    });
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    const bot = window.minibiaBot;
    if (bot) {
      install(bot);
      if (window.__minibiaRopeGenericGuardInstalled) window.clearInterval(timerId);
    } else if (++attempts >= 80) {
      window.clearInterval(timerId);
    }
  }, 250);
})();
