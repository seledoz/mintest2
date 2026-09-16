(() => {
  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const ropeAction = "rope";

  function normalizePresetName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || "Default";
  }

  function getRopeWaypointAction(bot) {
    const status = bot?.cave?.status?.();
    if (!status?.running) return null;
    const index = Math.trunc(Number(status.currentIndex) || 0);
    const presetName = normalizePresetName(status.activePresetName || bot.cave?.getActivePresetName?.());
    const allActions = bot.storage.get(actionStorageKey, {});
    const actions = allActions && typeof allActions === "object" && !Array.isArray(allActions)
      ? allActions[presetName]
      : null;
    return Array.isArray(actions) && actions[index] === ropeAction ? ropeAction : null;
  }

  function getThingDefinition(thing) {
    const id = thing?.id;
    if (!id) return null;
    return window.gameClient?.itemDefinitionsByCid?.[id] ||
      window.gameClient?.itemDefinitionsBySid?.[id] ||
      window.gameClient?.itemDefinitions?.[id] || null;
  }

  function getThingName(thing) {
    const definition = getThingDefinition(thing);
    return String(definition?.properties?.name || thing?.name || "").trim().toLowerCase();
  }

  function getTileThings(tile) {
    if (!tile) return [];
    const things = [];
    if (tile.id) things.push(tile);
    if (Array.isArray(tile.items)) tile.items.forEach((item) => item && things.push(item));
    return things;
  }

  function isRopeTargetTile(tile) {
    return getTileThings(tile).some((thing) => {
      const name = getThingName(thing);
      return name.includes("hole") || name.includes("rope spot");
    });
  }

  function getLoadedTiles() {
    const chunks = window.gameClient?.world?.chunks || [];
    const tiles = [];
    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) {
        if (tile?.__position) tiles.push(tile);
      }
    }
    return tiles;
  }

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function findRopeHole(playerPosition, waypoint) {
    if (!playerPosition || !waypoint || playerPosition.z === waypoint.z) return null;
    const waypointDistance = Math.abs(playerPosition.x - waypoint.x) + Math.abs(playerPosition.y - waypoint.y);
    const radius = Math.max(4, Math.min(20, waypointDistance + 2));
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    getLoadedTiles().forEach((tile) => {
      const position = normalizePosition(tile.__position);
      if (!position || position.z !== playerPosition.z || !isRopeTargetTile(tile)) return;
      if (Math.abs(position.x - playerPosition.x) > radius || Math.abs(position.y - playerPosition.y) > radius) return;
      const playerDistance = Math.abs(position.x - playerPosition.x) + Math.abs(position.y - playerPosition.y);
      const waypointDistance = Math.abs(position.x - waypoint.x) + Math.abs(position.y - waypoint.y);
      const score = playerDistance * 10 + waypointDistance;
      if (score < bestScore) {
        bestScore = score;
        best = { tile, position };
      }
    });

    return best;
  }

  function isBesideOrSameTile(a, b) {
    return !!a && !!b && a.z === b.z && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
  }

  function stopCurrentMovement() {
    const pathfinder = window.gameClient?.world?.pathfinder;
    const targets = [pathfinder, window.gameClient?.player, window.gameClient?.world].filter(Boolean);
    ["stop", "cancel", "clear", "clearPath", "stopWalking", "cancelWalking", "stopAutoWalk", "reset"].forEach((name) => {
      targets.forEach((target) => {
        if (typeof target?.[name] !== "function") return;
        try { target[name](); } catch (_) {}
      });
    });
  }

  function getNextRouteIndex(status, routeLength) {
    if (routeLength <= 1) return 0;
    const currentIndex = Math.max(0, Math.min(routeLength - 1, Math.trunc(Number(status?.currentIndex) || 0)));
    const direction = Number(status?.direction) || 1;
    let nextIndex = currentIndex + direction;
    if (nextIndex >= routeLength) nextIndex = routeLength - 2;
    if (nextIndex < 0) nextIndex = 1;
    return Math.max(0, Math.min(routeLength - 1, nextIndex));
  }

  function installRopeWaypointBehavior(bot) {
    if (!bot?.cave?.status || bot.cave.__ropeWaypointOption1Installed) return;
    bot.cave.__ropeWaypointOption1Installed = true;

    const state = {
      ropePending: false,
      pendingFromZ: null,
      lastUseAt: 0,
      pollId: null,
    };

    const pathfinder = window.gameClient?.world?.pathfinder;
    if (pathfinder?.findPath && !pathfinder.__minibiaRopeWaypointOption1Patched) {
      const originalFindPath = pathfinder.findPath.bind(pathfinder);
      pathfinder.findPath = (from, to, ...args) => {
        try {
          const status = bot.cave?.status?.();
          const waypoint = status?.currentWaypoint;
          const action = getRopeWaypointAction(bot);
          const fromPosition = normalizePosition(from);
          const toPosition = normalizePosition(to);
          const isCurrentWaypoint = !!waypoint && !!toPosition &&
            Number(waypoint.x) === toPosition.x && Number(waypoint.y) === toPosition.y && Number(waypoint.z) === toPosition.z;

          if (action === ropeAction && fromPosition && toPosition && fromPosition.z !== toPosition.z && isCurrentWaypoint) {
            const ropeHole = findRopeHole(fromPosition, waypoint);
            if (ropeHole) {
              const holeTarget = new Position(ropeHole.position.x, ropeHole.position.y, fromPosition.z);
              bot.log?.("cave rope waypoint pathing to rope hole", {
                waypoint,
                ropeHole: ropeHole.position,
              });
              return originalFindPath(from, holeTarget, ...args);
            }
          }
        } catch (error) {
          bot.log?.("cave rope waypoint path override failed", error?.message || error);
        }
        return originalFindPath(from, to, ...args);
      };
      pathfinder.__minibiaRopeWaypointOption1Patched = true;
    }

    const poll = () => {
      try {
        const status = bot.cave?.status?.();
        if (!status?.running) {
          state.ropePending = false;
          state.pendingFromZ = null;
          return;
        }

        const action = getRopeWaypointAction(bot);
        if (action !== ropeAction) {
          state.ropePending = false;
          state.pendingFromZ = null;
          return;
        }

        const playerPosition = normalizePosition(bot.getPlayerPosition?.());
        const waypoint = normalizePosition(status.currentWaypoint);
        if (!playerPosition || !waypoint || playerPosition.z === waypoint.z) return;

        if (state.ropePending) {
          if (playerPosition.z !== state.pendingFromZ) {
            state.ropePending = false;
            state.pendingFromZ = null;
            const route = bot.cave?.getRoute?.() || [];
            const nextIndex = getNextRouteIndex(status, route.length);
            bot.log?.("cave rope waypoint floor change detected", {
              fromZ: state.pendingFromZ,
              toZ: playerPosition.z,
              nextIndex: nextIndex + 1,
            });
            bot.cave?.setCurrentIndex?.(nextIndex);
          }
          return;
        }

        const ropeHole = findRopeHole(playerPosition, waypoint);
        if (!ropeHole || !isBesideOrSameTile(playerPosition, ropeHole.position)) return;
        if (Date.now() - state.lastUseAt < 500) return;

        stopCurrentMovement();
        const used = bot.cave?.useRopeOnNearestHole?.(waypoint);
        if (!used) return;

        state.lastUseAt = Date.now();
        state.ropePending = true;
        state.pendingFromZ = playerPosition.z;
        bot.log?.("cave rope waypoint used at rope hole", {
          waypoint,
          ropeHole: ropeHole.position,
        });
      } catch (error) {
        bot.log?.("cave rope waypoint behavior failed", error?.message || error);
      }
    };

    state.pollId = window.setInterval(poll, 100);
    bot.addCleanup?.(() => {
      if (state.pollId != null) window.clearInterval(state.pollId);
      state.pollId = null;
      if (pathfinder?.__minibiaRopeWaypointOption1Patched) {
        try { pathfinder.findPath = pathfinder.findPath.__minibiaRopeWaypointOriginal || pathfinder.findPath; } catch (_) {}
      }
    });
  }

  function markLastWaypointAsRope(bot) {
    const route = bot?.cave?.getRoute?.() || [];
    if (!route.length) return false;
    const presetName = normalizePresetName(bot.cave?.getActivePresetName?.());
    const allActions = bot.storage.get(actionStorageKey, {});
    const next = allActions && typeof allActions === "object" && !Array.isArray(allActions) ? allActions : {};
    const actions = Array.isArray(next[presetName]) ? next[presetName].slice() : [];
    while (actions.length < route.length) actions.push("walk");
    actions[route.length - 1] = ropeAction;
    next[presetName] = actions.slice(0, route.length);
    bot.storage.set(actionStorageKey, next);
    return true;
  }

  function injectRopeWaypointButton(bot) {
    installRopeWaypointBehavior(bot);
    const panel = document.getElementById("minibia-bot-panel");
    const addButton = panel?.querySelector("#minibia-bot-cave-add");
    if (!panel || !addButton || panel.querySelector("#minibia-bot-cave-add-rope")) return !!panel;

    const ropeButton = document.createElement("button");
    ropeButton.type = "button";
    ropeButton.id = "minibia-bot-cave-add-rope";
    ropeButton.textContent = "Add Rope Waypoint";
    ropeButton.title = "Add a rope waypoint at your current position.";
    ropeButton.addEventListener("click", () => {
      const beforeLength = (bot?.cave?.getRoute?.() || []).length;
      bot.cave?.addCurrentPosition?.();
      const afterRoute = bot?.cave?.getRoute?.() || [];

      if (afterRoute.length <= beforeLength) {
        bot.log?.("cave rope waypoint not added: current position could not be added", {});
        return;
      }

      if (!markLastWaypointAsRope(bot)) return;
      bot.log?.("cave rope waypoint added", { waypoint: bot.getPlayerPosition?.() });
      bot.ui?.refreshCaveStatus?.();
      bot.ui?.refreshCaveClosestStatus?.();
    });

    addButton.insertAdjacentElement("afterend", ropeButton);
    return true;
  }

  window.__minibiaInstallRopeWaypointButton = injectRopeWaypointButton;

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    const bot = window.minibiaBot;
    if (bot && injectRopeWaypointButton(bot)) {
      window.clearInterval(timerId);
      bot.addCleanup?.(() => window.clearInterval(timerId));
      return;
    }
    if (attempts >= 80) window.clearInterval(timerId);
  }, 250);
})();
