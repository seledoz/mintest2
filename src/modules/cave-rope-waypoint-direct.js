(() => {
  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const ropeAction = "rope";

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function getRopeAction(bot) {
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

  function getCurrentWaypoint(bot, status = bot?.cave?.status?.()) {
    const direct = normalizePosition(status?.currentWaypoint);
    if (direct) return direct;
    const route = bot?.cave?.getRoute?.() || [];
    const index = Math.trunc(Number(status?.currentIndex) || 0);
    return normalizePosition(route[index]);
  }

  function getLoadedTileAt(position) {
    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) {
        const p = normalizePosition(tile?.__position);
        if (p && p.x === position.x && p.y === position.y && p.z === position.z) return tile;
      }
    }
    return null;
  }

  function stopMovement() {
    const pathfinder = window.gameClient?.world?.pathfinder;
    try { pathfinder?.setPathfindCache?.(null); } catch (_) {}
    const targets = [pathfinder, window.gameClient?.player, window.gameClient?.world].filter(Boolean);
    ["stop", "cancel", "clear", "clearPath", "stopWalking", "cancelWalking", "stopAutoWalk", "reset"].forEach((name) => {
      targets.forEach((target) => {
        if (typeof target?.[name] !== "function") return;
        try { target[name](); } catch (_) {}
      });
    });
  }

  function nextIndex(status, length) {
    if (length <= 1) return 0;
    const current = Math.max(0, Math.min(length - 1, Math.trunc(Number(status?.currentIndex) || 0)));
    const direction = Number(status?.direction) || 1;
    let next = current + direction;
    if (next >= length) next = length - 2;
    if (next < 0) next = 1;
    return Math.max(0, Math.min(length - 1, next));
  }

  function install(bot) {
    if (!bot?.cave?.status || bot.cave.__directRopeWaypointInstalled) return;
    bot.cave.__directRopeWaypointInstalled = true;
    const state = { pending: false, fromZ: null, lastUse: 0, index: -1 };
    const pathfinder = window.gameClient?.world?.pathfinder;
    const mouse = window.gameClient?.mouse;
    const world = window.gameClient?.world;

    bot.cave.useRopeOnNearestHole = () => false;

    // Cavebot's generic floor-change handler searches world.chunks for nearby
    // transition tiles. During a Rope waypoint, expose only the exact waypoint
    // X/Y on the player's current Z to that scanner. This prevents it from
    // probing the surrounding 3x3/9-square area while leaving normal chunk data
    // untouched for every other cave action.
    let originalChunks = null;
    let guardedChunks = null;
    let chunksPatched = false;
    const patchChunkScanner = () => {
      if (!world || !Object.prototype.hasOwnProperty.call(world, "chunks") || chunksPatched) return;
      const currentChunks = world.chunks;
      if (!Array.isArray(currentChunks)) return;
      originalChunks = currentChunks;
      guardedChunks = new Proxy(currentChunks, {
        get(target, property, receiver) {
          if (property !== Symbol.iterator || !getRopeAction(bot)) return Reflect.get(target, property, receiver);
          const status = bot.cave?.status?.();
          const waypoint = getCurrentWaypoint(bot, status);
          const player = normalizePosition(bot.getPlayerPosition?.());
          if (!waypoint || !player || player.z === waypoint.z) return Reflect.get(target, property, receiver);
          const exactX = waypoint.x;
          const exactY = waypoint.y;
          const exactZ = player.z;
          const filtered = [];
          for (const chunk of target) {
            if (!chunk?.tiles || !Array.isArray(chunk.tiles)) {
              filtered.push(chunk);
              continue;
            }
            const tiles = chunk.tiles.filter((tile) => {
              const p = normalizePosition(tile?.__position);
              return p && p.x === exactX && p.y === exactY && p.z === exactZ;
            });
            if (tiles.length) filtered.push({ ...chunk, tiles });
          }
          return filtered[Symbol.iterator].bind(filtered);
        },
      });
      try {
        world.chunks = guardedChunks;
        chunksPatched = world.chunks === guardedChunks;
      } catch (_) {
        originalChunks = null;
        guardedChunks = null;
      }
    };
    patchChunkScanner();

    if (mouse?.__handleItemUseWith__ && !mouse.__directRopeWaypointMouseGuard) {
      const originalMouseUse = mouse.__handleItemUseWith__;
      const guardedMouseUse = function directRopeWaypointMouseGuard(source, target, ...args) {
        try {
          if (getRopeAction(bot)) {
            const status = bot.cave?.status?.();
            const waypoint = getCurrentWaypoint(bot, status);
            const player = normalizePosition(bot.getPlayerPosition?.());
            const targetPosition = normalizePosition(target?.which?.__position || target?.which?.position);
            const sourceItem = source?.which?.getSlotItem?.(source?.index);
            const sourceName = String(sourceItem?.name || window.gameClient?.itemDefinitionsByCid?.[sourceItem?.id]?.properties?.name || window.gameClient?.itemDefinitionsBySid?.[sourceItem?.id]?.properties?.name || "").toLowerCase();
            if (sourceName.includes("rope") && waypoint && player && targetPosition) {
              const exact = targetPosition.x === waypoint.x && targetPosition.y === waypoint.y && targetPosition.z === player.z;
              if (!exact) return false;
            }
          }
        } catch (_) {}
        return originalMouseUse.call(this, source, target, ...args);
      };
      guardedMouseUse.__directRopeWaypointOriginal = originalMouseUse;
      mouse.__handleItemUseWith__ = guardedMouseUse;
      mouse.__directRopeWaypointMouseGuard = true;
    }

    const originalHandleFloorChange = typeof bot.cave.handleFloorChange === "function"
      ? bot.cave.handleFloorChange.bind(bot.cave)
      : null;
    if (originalHandleFloorChange && !bot.cave.__directRopeFloorChangePatched) {
      bot.cave.handleFloorChange = function ropeWaypointFloorChangeGuard(...args) {
        if (getRopeAction(bot)) return false;
        return originalHandleFloorChange(...args);
      };
      bot.cave.__directRopeFloorChangePatched = true;
    }

    if (pathfinder?.findPath && !pathfinder.__directRopeWaypointPatched) {
      const original = pathfinder.findPath.bind(pathfinder);
      const wrapped = (from, to, ...args) => {
        try {
          const status = bot.cave?.status?.();
          const waypoint = getCurrentWaypoint(bot, status);
          const fromPosition = normalizePosition(from);
          const toPosition = normalizePosition(to);
          if (getRopeAction(bot) && waypoint && fromPosition && toPosition && fromPosition.z !== waypoint.z &&
              toPosition.x === waypoint.x && toPosition.y === waypoint.y && toPosition.z === waypoint.z) {
            return original(from, new Position(waypoint.x, waypoint.y, fromPosition.z), ...args);
          }
        } catch (_) {}
        return original(from, to, ...args);
      };
      wrapped.__directRopeWaypointOriginal = original;
      pathfinder.findPath = wrapped;
      pathfinder.__directRopeWaypointPatched = true;
    }

    const pollId = window.setInterval(() => {
      try {
        patchChunkScanner();
        const status = bot.cave?.status?.();
        const ropeNow = getRopeAction(bot);
        if (!status?.running || !ropeNow) {
          state.pending = false;
          state.fromZ = null;
          state.index = -1;
          return;
        }
        const player = normalizePosition(bot.getPlayerPosition?.());
        const waypoint = getCurrentWaypoint(bot, status);
        if (!player || !waypoint || player.z === waypoint.z) return;

        const currentIndex = Math.trunc(Number(status.currentIndex) || 0);
        if (state.index !== currentIndex) {
          state.index = currentIndex;
          state.pending = false;
          state.fromZ = null;
        }

        if (state.pending) {
          if (player.z !== state.fromZ) {
            state.pending = false;
            state.fromZ = null;
            const route = bot.cave?.getRoute?.() || [];
            bot.cave?.setCurrentIndex?.(nextIndex(status, route.length));
          }
          return;
        }

        const targetPosition = { x: waypoint.x, y: waypoint.y, z: player.z };
        const dx = Math.abs(player.x - targetPosition.x);
        const dy = Math.abs(player.y - targetPosition.y);
        if (dx > 1 || dy > 1 || Date.now() - state.lastUse < 500) return;

        const targetTile = getLoadedTileAt(targetPosition);
        const ropeSource = bot.cave?.findRopeSource?.();
        if (!targetTile || !ropeSource) return;

        stopMovement();
        const used = window.gameClient?.mouse?.__handleItemUseWith__?.(
          { which: ropeSource.which, index: ropeSource.index },
          { which: targetTile, index: 0xFF }
        );
        if (used === false) return;
        state.lastUse = Date.now();
        state.pending = true;
        state.fromZ = player.z;
        bot.log?.("cave rope waypoint used at exact waypoint tile", { target: targetPosition, waypointIndex: currentIndex + 1 });
      } catch (error) {
        bot.log?.("direct cave rope waypoint failed", error?.message || error);
      }
    }, 100);

    bot.addCleanup?.(() => {
      window.clearInterval(pollId);
      if (chunksPatched && world && originalChunks) {
        try { world.chunks = originalChunks; } catch (_) {}
      }
      if (mouse?.__directRopeWaypointMouseGuard) {
        try {
          const original = mouse.__handleItemUseWith__?.__directRopeWaypointOriginal;
          if (original) mouse.__handleItemUseWith__ = original;
        } catch (_) {}
        delete mouse.__directRopeWaypointMouseGuard;
      }
      if (bot.cave?.__directRopeFloorChangePatched && originalHandleFloorChange) {
        try { bot.cave.handleFloorChange = originalHandleFloorChange; } catch (_) {}
        delete bot.cave.__directRopeFloorChangePatched;
      }
      if (pathfinder?.__directRopeWaypointPatched) {
        try {
          const current = pathfinder.findPath;
          const original = current?.__directRopeWaypointOriginal;
          if (original) pathfinder.findPath = original;
          delete pathfinder.__directRopeWaypointPatched;
        } catch (_) {}
      }
      delete bot.cave.__directRopeWaypointInstalled;
    });
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    const bot = window.minibiaBot;
    if (bot) {
      install(bot);
      window.clearInterval(timerId);
    } else if (++attempts >= 80) {
      window.clearInterval(timerId);
    }
  }, 250);
})();