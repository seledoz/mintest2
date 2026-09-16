(() => {
  const ACTION_KEY = "minibiaBot.cave.waypointActions";
  const ACTION = "rope2";
  const BUTTON_ID = "minibia-bot-cave-add-rope2";

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (![x, y, z].every(Number.isFinite)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function presetName(bot) {
    return String(bot?.cave?.getActivePresetName?.() || bot?.cave?.status?.()?.activePresetName || "Default").trim().replace(/\s+/g, " ") || "Default";
  }

  function actionsFor(bot) {
    const all = bot?.storage?.get?.(ACTION_KEY, {});
    const actions = all && typeof all === "object" && !Array.isArray(all) ? all[presetName(bot)] : null;
    return Array.isArray(actions) ? actions : [];
  }

  function isRope2(bot) {
    const status = bot?.cave?.status?.();
    if (!status?.running) return false;
    return actionsFor(bot)[Math.trunc(Number(status.currentIndex) || 0)] === ACTION;
  }

  function currentWaypoint(bot, status) {
    return normalizePosition(status?.currentWaypoint) || normalizePosition((bot?.cave?.getRoute?.() || [])[Math.trunc(Number(status?.currentIndex) || 0)]);
  }

  function getLoadedTileAt(position) {
    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      if (!Array.isArray(chunk?.tiles)) continue;
      for (const tile of chunk.tiles) {
        const p = normalizePosition(tile?.__position);
        if (p && p.x === position.x && p.y === position.y && p.z === position.z) return tile;
      }
    }
    return null;
  }

  function findRopeSource(bot) {
    const equipment = window.gameClient?.player?.equipment;
    const containers = Array.from(window.gameClient?.player?.__openedContainers || []);
    const sources = [];
    if (equipment?.slots) sources.push(equipment);
    sources.push(...containers);
    for (const source of sources) {
      const slots = source?.slots || [];
      for (let index = 0; index < slots.length; index += 1) {
        const item = source.getSlotItem?.(index);
        const id = item?.id;
        const definition = window.gameClient?.itemDefinitionsByCid?.[id] || window.gameClient?.itemDefinitionsBySid?.[id] || window.gameClient?.itemDefinitions?.[id];
        const name = String(definition?.properties?.name || item?.name || "").toLowerCase();
        if (/\brope\b/.test(name)) return { which: source, index, item };
      }
    }
    return bot?.cave?.findRopeSource?.() || null;
  }

  function stopMovement() {
    const pathfinder = window.gameClient?.world?.pathfinder;
    try { pathfinder?.setPathfindCache?.(null); } catch (_) {}
    for (const target of [pathfinder, window.gameClient?.player, window.gameClient?.world].filter(Boolean)) {
      for (const name of ["stop", "cancel", "clear", "clearPath", "stopWalking", "cancelWalking", "stopAutoWalk"]) {
        try { if (typeof target[name] === "function") target[name](); } catch (_) {}
      }
    }
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
    if (!bot || bot.cave?.__ropeWaypoint2Installed) return;
    bot.cave.__ropeWaypoint2Installed = true;
    const state = { pending: false, fromZ: null, index: -1, lastUse: 0, directUse: false };
    const world = window.gameClient?.world;
    const mouse = window.gameClient?.mouse;

    // Rope 2.0 owns the transition completely. Cavebot's normal floor-change
    // code scans world.chunks and can otherwise try nearby rope/hole tiles.
    // While this action is active, expose only the exact waypoint X/Y on the
    // player's current Z to that generic scanner.
    let originalChunks = null;
    let guardedChunks = null;
    let chunksPatched = false;
    const patchChunkScanner = () => {
      if (!world || chunksPatched) return;
      const currentChunks = world.chunks;
      if (!currentChunks || typeof currentChunks[Symbol.iterator] !== "function") return;
      originalChunks = currentChunks;
      guardedChunks = new Proxy(currentChunks, {
        get(target, property, receiver) {
          if (property !== Symbol.iterator || !isRope2(bot)) return Reflect.get(target, property, receiver);
          const status = bot.cave?.status?.();
          const waypoint = currentWaypoint(bot, status);
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

    // The learned-transition branch in cave.js obtains its source tile through
    // world.getTileFromWorldPosition. Return null for any non-exact Rope 2.0
    // transition source so it cannot bypass the chunk filter and rope elsewhere.
    let originalGetTileFromWorldPosition = null;
    if (world && typeof world.getTileFromWorldPosition === "function" && !world.__ropeWaypoint2TileGuard) {
      originalGetTileFromWorldPosition = world.getTileFromWorldPosition.bind(world);
      const guardedGetTile = function ropeWaypoint2TileGuard(position, ...args) {
        if (isRope2(bot)) {
          const status = bot.cave?.status?.();
          const waypoint = currentWaypoint(bot, status);
          const player = normalizePosition(bot.getPlayerPosition?.());
          const requested = normalizePosition(position);
          if (waypoint && player && requested && player.z !== waypoint.z &&
              (requested.x !== waypoint.x || requested.y !== waypoint.y || requested.z !== player.z)) {
            return null;
          }
        }
        return originalGetTileFromWorldPosition(position, ...args);
      };
      guardedGetTile.__ropeWaypoint2Original = originalGetTileFromWorldPosition;
      try {
        world.getTileFromWorldPosition = guardedGetTile;
        world.__ropeWaypoint2TileGuard = true;
      } catch (_) {}
    }

    // Block any generic rope use while Rope 2.0 is active. The only permitted
    // rope use is the one issued by this module against the exact waypoint tile.
    let originalMouseUse = null;
    if (mouse?.__handleItemUseWith__ && !mouse.__ropeWaypoint2MouseGuard) {
      originalMouseUse = mouse.__handleItemUseWith__;
      const guardedMouseUse = function ropeWaypoint2MouseGuard(source, target, ...args) {
        if (isRope2(bot) && !state.directUse) return false;
        return originalMouseUse.call(this, source, target, ...args);
      };
      guardedMouseUse.__ropeWaypoint2Original = originalMouseUse;
      try {
        mouse.__handleItemUseWith__ = guardedMouseUse;
        mouse.__ropeWaypoint2MouseGuard = true;
      } catch (_) {}
    }

    const pollId = window.setInterval(() => {
      try {
        patchChunkScanner();
        const status = bot.cave?.status?.();
        if (!status?.running || !isRope2(bot)) {
          state.pending = false; state.fromZ = null; state.index = -1;
          return;
        }
        const player = normalizePosition(bot.getPlayerPosition?.());
        const waypoint = currentWaypoint(bot, status);
        if (!player || !waypoint) return;
        const index = Math.trunc(Number(status.currentIndex) || 0);
        if (state.index !== index) { state.index = index; state.pending = false; state.fromZ = null; }

        if (state.pending) {
          if (player.z !== state.fromZ) {
            const fromZ = state.fromZ;
            state.pending = false; state.fromZ = null;
            const route = bot.cave?.getRoute?.() || [];
            bot.cave?.setCurrentIndex?.(nextIndex(status, route.length));
            bot.log?.("cave Rope Waypoint 2.0 floor change detected", { index: index + 1, fromZ, toZ: player.z });
          }
          return;
        }

        // Exact waypoint X/Y is the only rope target. The bot may stand on the
        // waypoint tile or an adjacent tile; it never searches nearby holes.
        const dx = Math.abs(player.x - waypoint.x);
        const dy = Math.abs(player.y - waypoint.y);
        if (player.z !== waypoint.z || dx > 1 || dy > 1) return;
        if (Date.now() - state.lastUse < 500) return;

        const targetPosition = { x: waypoint.x, y: waypoint.y, z: player.z };
        const targetTile = getLoadedTileAt(targetPosition);
        const rope = findRopeSource(bot);
        if (!targetTile || !rope) return;

        stopMovement();
        state.directUse = true;
        let used;
        try {
          used = window.gameClient?.mouse?.__handleItemUseWith__?.(
            { which: rope.which, index: rope.index },
            { which: targetTile, index: 0xFF }
          );
        } finally {
          state.directUse = false;
        }
        if (used === false) return;
        state.lastUse = Date.now();
        state.pending = true;
        state.fromZ = player.z;
        bot.log?.("cave Rope Waypoint 2.0 used exact waypoint tile", { waypoint: targetPosition, index: index + 1 });
      } catch (error) {
        bot.log?.("cave Rope Waypoint 2.0 failed", error?.message || error);
      }
    }, 100);

    let attempts = 0;
    const buttonTimer = window.setInterval(() => {
      if (injectButton(bot) || ++attempts >= 80) window.clearInterval(buttonTimer);
    }, 250);

    bot.addCleanup?.(() => {
      window.clearInterval(pollId);
      window.clearInterval(buttonTimer);
      document.getElementById(BUTTON_ID)?.remove();
      if (world && chunksPatched && originalChunks) {
        try { world.chunks = originalChunks; } catch (_) {}
      }
      if (world?.__ropeWaypoint2TileGuard && originalGetTileFromWorldPosition) {
        try { world.getTileFromWorldPosition = originalGetTileFromWorldPosition; } catch (_) {}
        delete world.__ropeWaypoint2TileGuard;
      }
      if (mouse?.__ropeWaypoint2MouseGuard && originalMouseUse) {
        try { mouse.__handleItemUseWith__ = originalMouseUse; } catch (_) {}
        delete mouse.__ropeWaypoint2MouseGuard;
      }
      delete bot.cave.__ropeWaypoint2Installed;
    });
  }

  function injectButton(bot) {
    const panel = document.getElementById("minibia-bot-panel");
    const addButton = panel?.querySelector("#minibia-bot-cave-add");
    if (!panel || !addButton || panel.querySelector(`#${BUTTON_ID}`)) return false;
    const button = document.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    button.textContent = "Add Rope Waypoint 2.0";
    button.title = "Adds a waypoint at your current position. Rope 2.0 uses only that exact X/Y tile for the rope action.";
    button.addEventListener("click", () => {
      const before = (bot.cave?.getRoute?.() || []).length;
      bot.cave?.addCurrentPosition?.();
      const route = bot.cave?.getRoute?.() || [];
      if (route.length <= before) return;
      if (!markLastWaypoint(bot)) return;
      bot.log?.("cave Rope Waypoint 2.0 added", { waypoint: normalizePosition(route[route.length - 1]) });
      bot.ui?.refreshCaveStatus?.();
      bot.ui?.refreshCaveClosestStatus?.();
    });
    addButton.insertAdjacentElement("afterend", button);
    return true;
  }

  function markLastWaypoint(bot) {
    const route = bot?.cave?.getRoute?.() || [];
    if (!route.length) return false;
    const name = presetName(bot);
    const all = bot.storage.get(ACTION_KEY, {});
    const next = all && typeof all === "object" && !Array.isArray(all) ? all : {};
    const actions = Array.isArray(next[name]) ? next[name].slice() : [];
    while (actions.length < route.length) actions.push("walk");
    actions[route.length - 1] = ACTION;
    next[name] = actions.slice(0, route.length);
    bot.storage.set(ACTION_KEY, next);
    return true;
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    const bot = window.minibiaBot;
    if (bot) { install(bot); window.clearInterval(timerId); }
    else if (++attempts >= 80) window.clearInterval(timerId);
  }, 250);
})();