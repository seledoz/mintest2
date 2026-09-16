(() => {
  const ACTION_KEY = "minibiaBot.cave.waypointActions";
  const CONFIG_KEY = "minibiaBot.cave.ropeWaypoint3.config";
  const ACTION = "rope3";
  const HOTKEY_DELAY_MS = 100;

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

  function isRope3(bot) {
    const status = bot?.cave?.status?.();
    if (!status?.running) return false;
    return actionsFor(bot)[Math.trunc(Number(status.currentIndex) || 0)] === ACTION;
  }

  function currentWaypoint(bot, status) {
    return normalizePosition(status?.currentWaypoint) || normalizePosition((bot?.cave?.getRoute?.() || [])[Math.trunc(Number(status?.currentIndex) || 0)]);
  }

  function getConfig(bot) {
    const raw = bot?.storage?.get?.(CONFIG_KEY, {});
    const slot = Math.trunc(Number(raw?.hotbarSlot));
    return { hotbarSlot: Number.isFinite(slot) && slot >= 1 && slot <= 12 ? slot : null };
  }

  function getTileAt(position) {
    if (!position) return null;
    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      if (!Array.isArray(chunk?.tiles)) continue;
      for (const tile of chunk.tiles) {
        const p = normalizePosition(tile?.__position);
        if (p && p.x === position.x && p.y === position.y && p.z === position.z) return tile;
      }
    }
    try {
      const worldPosition = typeof Position === "function" ? new Position(position.x, position.y, position.z) : position;
      return window.gameClient?.world?.getTileFromWorldPosition?.(worldPosition) || null;
    } catch (_) {
      return null;
    }
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
    if (!bot || bot.cave?.__ropeWaypoint3Installed) return;
    bot.cave.__ropeWaypoint3Installed = true;
    const state = { phase: "idle", index: -1, fromZ: null, hotkeyAt: 0, clickTimer: null, lastLogAt: 0 };

    const pollId = window.setInterval(() => {
      try {
        const status = bot.cave?.status?.();
        if (!status?.running || !isRope3(bot)) {
          state.phase = "idle";
          state.index = -1;
          state.fromZ = null;
          if (state.clickTimer != null) { window.clearTimeout(state.clickTimer); state.clickTimer = null; }
          return;
        }

        const index = Math.trunc(Number(status.currentIndex) || 0);
        if (state.index !== index) {
          state.index = index;
          state.phase = "idle";
          state.fromZ = null;
          if (state.clickTimer != null) { window.clearTimeout(state.clickTimer); state.clickTimer = null; }
        }

        const player = normalizePosition(bot.getPlayerPosition?.());
        const waypoint = currentWaypoint(bot, status);
        if (!player || !waypoint) return;

        if (state.phase === "waiting-floor") {
          if (player.z !== state.fromZ) {
            const fromZ = state.fromZ;
            state.phase = "idle";
            state.fromZ = null;
            const route = bot.cave?.getRoute?.() || [];
            bot.cave?.setCurrentIndex?.(nextIndex(status, route.length));
            bot.log?.("cave Rope Waypoint 3.0 floor change detected", { index: index + 1, fromZ, toZ: player.z });
          }
          return;
        }

        if (state.phase === "waiting-click") return;

        // Rope 3.0 intentionally requires the player to reach the exact
        // waypoint coordinates. There is no nearby-hole search or tolerance.
        if (player.x !== waypoint.x || player.y !== waypoint.y || player.z !== waypoint.z) return;
        if (Date.now() - state.hotkeyAt < 500) return;

        const config = getConfig(bot);
        if (!config.hotbarSlot) {
          if (Date.now() - state.lastLogAt > 2000) {
            state.lastLogAt = Date.now();
            bot.log?.("cave Rope Waypoint 3.0 skipped: no rope hotkey configured");
          }
          return;
        }

        const targetPosition = { x: waypoint.x, y: waypoint.y, z: waypoint.z };
        const targetTile = getTileAt(targetPosition);
        if (!targetTile) return;

        stopMovement();
        const clickedHotkey = bot.clickHotbar?.(config.hotbarSlot - 1);
        if (clickedHotkey === false) return;

        state.hotkeyAt = Date.now();
        state.phase = "waiting-click";
        bot.log?.("cave Rope Waypoint 3.0 hotkey clicked", { index: index + 1, hotbarSlot: config.hotbarSlot, waypoint: targetPosition, delayMs: HOTKEY_DELAY_MS });

        state.clickTimer = window.setTimeout(() => {
          state.clickTimer = null;
          if (!isRope3(bot)) { state.phase = "idle"; return; }
          const latestStatus = bot.cave?.status?.();
          const latestWaypoint = currentWaypoint(bot, latestStatus);
          const latestPlayer = normalizePosition(bot.getPlayerPosition?.());
          if (!latestWaypoint || !latestPlayer ||
              latestWaypoint.x !== targetPosition.x || latestWaypoint.y !== targetPosition.y || latestWaypoint.z !== targetPosition.z ||
              latestPlayer.x !== targetPosition.x || latestPlayer.y !== targetPosition.y || latestPlayer.z !== targetPosition.z) {
            state.phase = "idle";
            return;
          }

          const exactTile = getTileAt(targetPosition);
          if (!exactTile) { state.phase = "idle"; return; }

          const mouse = window.gameClient?.mouse;
          let clicked = false;
          try {
            if (typeof mouse?.__handleItemUseWith === "function") {
              const result = mouse.__handleItemUseWith(null, { which: exactTile, index: 0xFF });
              clicked = result !== false;
            }
          } catch (_) {}
          if (!clicked) {
            try {
              if (typeof mouse?.__handleThingUse === "function") {
                const result = mouse.__handleThingUse({ which: exactTile, index: 0xFF });
                clicked = result !== false;
              }
            } catch (_) {}
          }

          if (clicked) {
            state.phase = "waiting-floor";
            state.fromZ = targetPosition.z;
            bot.log?.("cave Rope Waypoint 3.0 clicked exact rope-hole coordinates", { index: index + 1, waypoint: targetPosition });
          } else {
            state.phase = "idle";
          }
        }, HOTKEY_DELAY_MS);
      } catch (error) {
        bot.log?.("cave Rope Waypoint 3.0 failed", error?.message || error);
        state.phase = "idle";
      }
    }, 100);

    bot.addCleanup?.(() => {
      window.clearInterval(pollId);
      if (state.clickTimer != null) window.clearTimeout(state.clickTimer);
      delete bot.cave.__ropeWaypoint3Installed;
    });
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    const bot = window.minibiaBot;
    if (bot) { install(bot); window.clearInterval(timerId); }
    else if (++attempts >= 80) window.clearInterval(timerId);
  }, 250);
})();
