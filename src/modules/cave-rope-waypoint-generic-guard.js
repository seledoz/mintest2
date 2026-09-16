(() => {
  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const ropeAction = "rope";

  function isRopeAction(bot) {
    const status = bot?.cave?.status?.();
    if (!status?.running) return false;
    const index = Math.trunc(Number(status.currentIndex) || 0);
    const resolvedActions = bot.cave?.getWaypointActions?.();
    if (Array.isArray(resolvedActions)) return resolvedActions[index] === ropeAction;
    const preset = String(bot.cave?.getActivePresetName?.() || status.activePresetName || "Default").trim().replace(/\s+/g, " ") || "Default";
    const all = bot.storage.get(actionStorageKey, {});
    const actions = all && typeof all === "object" && !Array.isArray(all) ? all[preset] : null;
    return Array.isArray(actions) && actions[index] === ropeAction;
  }

  function install(bot) {
    if (!bot?.cave?.status || window.__minibiaRopeGenericGuardInstalled) return;

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
          const sourceItem = source?.which?.getSlotItem?.(source?.index);
          const sourceName = String(sourceItem?.name || sourceItem?.typeName || sourceItem?.description || window.gameClient?.itemDefinitionsByCid?.[sourceItem?.id]?.properties?.name || window.gameClient?.itemDefinitionsBySid?.[sourceItem?.id]?.properties?.name || "");
          if (/\brope\b/i.test(sourceName) && isRopeAction(bot)) {
            const status = bot.cave?.status?.();
            const waypoint = status?.currentWaypoint || bot.cave?.getRoute?.()?.[status?.currentIndex];
            const player = bot.getPlayerPosition?.();
            const targetPosition = target?.which?.__position || target?.which?.position;
            if (!waypoint || !player || !targetPosition ||
                Number(targetPosition.z) !== Number(player.z) ||
                Number(targetPosition.x) !== Number(waypoint.x) ||
                Number(targetPosition.y) !== Number(waypoint.y)) {
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
          if (mouse.__handleItemUseWith__?.__minibiaRopeGenericGuard) mouse.__handleItemUseWith__ = originalMouseUse;
        } catch (_) {}
      });
    }

    window.__minibiaRopeGenericGuardInstalled = true;
    bot.addCleanup?.(() => {
      try {
        if (bot.cave.handleFloorChange?.__minibiaRopeGenericFloorGuard) bot.cave.handleFloorChange = originalHandleFloorChange;
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
