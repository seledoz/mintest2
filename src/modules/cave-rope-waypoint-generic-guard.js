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

    // The cave tick calls handleFloorChange() whenever a waypoint is on a
    // different floor. Rope waypoints have their own direct handler, so the
    // generic transition scanner must not run at all for those waypoints.
    const originalHandleFloorChange = bot.cave.handleFloorChange;
    if (typeof originalHandleFloorChange === "function" && !originalHandleFloorChange.__minibiaRopeGenericFloorGuard) {
      const guardedHandleFloorChange = function guardedHandleFloorChange(waypoint, ...args) {
        if (isRopeAction(bot)) {
          bot.logDebug?.("cave skipped generic floor-change scan for rope waypoint", { waypoint });
          return false;
        }
        return originalHandleFloorChange.call(this, waypoint, ...args);
      };
      guardedHandleFloorChange.__minibiaRopeGenericFloorGuard = true;
      guardedHandleFloorChange.__minibiaRopeGenericFloorGuardOriginal = originalHandleFloorChange;
      bot.cave.handleFloorChange = guardedHandleFloorChange;
    }

    const mouse = window.gameClient?.mouse;
    if (mouse && typeof mouse.__handleItemUseWith__ === "function") {
      const originalMouseUse = mouse.__handleItemUseWith__;
      const wrappedMouseUse = function guardedRopeUse(source, target, ...args) {
        try {
          if (isRopeSource(source) && isRopeAction(bot)) {
            const waypoint = getCurrentWaypoint(bot);
            const player = normalizePosition(bot.getPlayerPosition?.());
            const targetPosition = normalizePosition(target?.which?.__position || target?.which?.position);

            // If any other runtime still attempts a rope, only the exact
            // waypoint X/Y on the player's current floor is allowed.
            if (!waypoint || !player || !targetPosition ||
                targetPosition.z !== player.z ||
                targetPosition.x !== waypoint.x ||
                targetPosition.y !== waypoint.y) {
              bot.log?.("cave blocked generic rope target", { target: targetPosition, waypoint, player });
              return false;
            }
          }
        } catch (_) {}
        return originalMouseUse.call(this, source, target, ...args);
      };

      wrappedMouseUse.__minibiaRopeGenericGuard = true;
      wrappedMouseUse.__minibiaRopeGenericGuardOriginal = originalMouseUse;
      mouse.__handleItemUseWith__ = wrappedMouseUse;

      bot.addCleanup?.(() => {
        try {
          if (mouse.__handleItemUseWith__?.__minibiaRopeGenericGuard) {
            mouse.__handleItemUseWith__ = originalMouseUse;
          }
        } catch (_) {}
      });
    }

    window.__minibiaRopeGenericGuardInstalled = true;

    bot.addCleanup?.(() => {
      try {
        if (bot.cave.handleFloorChange?.__minibiaRopeGenericFloorGuard) {
          bot.cave.handleFloorChange = originalHandleFloorChange;
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
