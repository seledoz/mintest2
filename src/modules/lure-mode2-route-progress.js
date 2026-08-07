(() => {
  const STORAGE_KEY = "minibiaBot.lure.config";
  const TICK_MS = 120;
  const LOST_GRACE_MS = 10000;

  function pos(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }
      : null;
  }

  function cheb(a, b) {
    if (!a || !b || a.z !== b.z) return Infinity;
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function readConfig(bot) {
    const saved = bot.storage.get(STORAGE_KEY, {}) || {};
    return {
      enabled: !!saved.enabled,
      mode: Number(saved.mode) === 2 ? 2 : 1,
      minMonsters: Math.max(1, Math.min(20, Math.trunc(Number(saved.minMonsters) || 3))),
      maxDistance: Math.max(1, Math.min(7, Math.trunc(Number(saved.maxDistance) || 4))),
      stepDelayMs: Math.max(100, Math.min(2000, Math.trunc(Number(saved.stepDelayMs) || 450))),
    };
  }

  function getMonsters(bot) {
    const me = pos(bot.getPlayerPosition?.() || window.gameClient?.player?.__position);
    if (!me) return [];
    const monsters = bot.attack?.getNearbyMonsters?.()
      || bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true })
      || [];
    return monsters
      .map((monster) => {
        const position = pos(monster?.getPosition?.() || monster?.__position || monster?.position);
        return { monster, position, distance: cheb(me, position) };
      })
      .filter((entry) => entry.position && entry.position.z === me.z)
      .filter((entry) => Math.abs(entry.position.x - me.x) <= 7 && Math.abs(entry.position.y - me.y) <= 5)
      .sort((a, b) => a.distance - b.distance);
  }

  function stopPathOnly() {
    const pf = window.gameClient?.world?.pathfinder;
    if (!pf) return;
    ["stop", "cancel", "clear", "clearPath", "stopWalking"].forEach((name) => {
      if (typeof pf[name] === "function") {
        try { pf[name](); } catch (_) {}
      }
    });
  }

  function getAdjacentStep(me, target) {
    if (!me || !target || me.z !== target.z) return null;
    const candidates = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const p = { x: me.x + dx, y: me.y + dy, z: me.z };
        let walkable = true;
        try {
          const tile = window.gameClient?.world?.getTileFromWorldPosition?.(new Position(p.x, p.y, p.z));
          if (tile && typeof tile.isWalkable === "function") walkable = !!tile.isWalkable();
        } catch (_) {}
        if (!walkable) continue;
        candidates.push({ p, score: cheb(p, target) });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0]?.p || null;
  }

  function install() {
    const bot = window.minibiaBot;
    if (!bot?.cave || !bot?.lureMode) return false;
    if (bot.lureMode2RouteProgress?.installed) return true;

    try { bot.lureMode2Replacement?.stop?.(); } catch (_) {}

    const legacy = bot.lureMode;
    const state = {
      timerId: null,
      active: false,
      caveWasRunning: false,
      route: [],
      routeIndex: 0,
      direction: 1,
      tolerance: 1,
      nextStepAt: 0,
      lastMonsterSeenAt: 0,
      clearing: false,
      lastStep: null,
    };

    function setStatus(text) {
      const label = document.getElementById("minibia-bot-lure-status");
      if (label) label.textContent = text;
    }

    function advanceRouteIndex() {
      if (state.route.length <= 1) return;
      let nextIndex = state.routeIndex + state.direction;
      if (nextIndex >= state.route.length) {
        state.direction = -1;
        nextIndex = state.route.length - 2;
      } else if (nextIndex < 0) {
        state.direction = 1;
        nextIndex = 1;
      }
      state.routeIndex = Math.max(0, Math.min(state.route.length - 1, nextIndex));
    }

    function syncRouteFromCave() {
      const cave = bot.cave.status?.();
      state.route = Array.isArray(cave?.route) ? cave.route.map(pos).filter(Boolean) : [];
      state.routeIndex = Math.max(0, Math.min(state.route.length - 1, Math.trunc(Number(cave?.currentIndex) || 0)));
      state.direction = Number(cave?.direction) < 0 ? -1 : 1;
      state.tolerance = Math.max(1, Math.trunc(Number(cave?.config?.waypointTolerance) || 1));
    }

    function getTargetWaypoint(me) {
      if (!state.route.length) return null;
      let target = state.route[state.routeIndex] || null;
      let guard = 0;
      while (target && me && cheb(me, target) <= state.tolerance && state.route.length > 1 && guard < state.route.length) {
        advanceRouteIndex();
        target = state.route[state.routeIndex] || null;
        guard += 1;
      }
      return target ? { ...target, index: state.routeIndex, direction: state.direction } : null;
    }

    function pauseCave() {
      if (state.active) return;
      const cave = bot.cave.status?.();
      state.caveWasRunning = !!cave?.running;
      syncRouteFromCave();
      state.active = true;
      stopPathOnly();
      if (cave?.running) bot.cave.stop?.({ persistEnabled: false });
    }

    function resumeCave() {
      const shouldResume = state.caveWasRunning;
      state.active = false;
      state.caveWasRunning = false;
      state.nextStepAt = 0;
      state.lastMonsterSeenAt = 0;
      state.clearing = false;
      state.lastStep = null;
      stopPathOnly();

      if (state.route.length) {
        try { bot.cave.setCurrentIndex?.(state.routeIndex); } catch (_) {}
      }
      if (shouldResume) bot.cave.start?.();
    }

    function suppressAttack(suppress) {
      if (!bot.attack?.config) return;
      bot.attack.config.enabled = !suppress;
    }

    function tick() {
      const cfg = readConfig(bot);
      if (!cfg.enabled || cfg.mode !== 2) {
        if (state.active) resumeCave();
        return;
      }

      try { bot.lureMode2Replacement?.stop?.(); } catch (_) {}
      if (legacy.status?.().running) legacy.stop?.({ persistEnabled: false });
      legacy.config.enabled = true;
      legacy.config.mode = 2;
      legacy.config.minMonsters = cfg.minMonsters;
      legacy.config.maxDistance = cfg.maxDistance;
      legacy.config.stepDelayMs = cfg.stepDelayMs;

      const monsters = getMonsters(bot);
      const me = pos(bot.getPlayerPosition?.() || window.gameClient?.player?.__position);
      const target = bot.attack?.getCurrentTarget?.() || window.gameClient?.player?.__target || null;
      const combatActive = !!bot.attack?.status?.()?.combatActive;
      const farthest = monsters.length ? monsters[monsters.length - 1].distance : null;

      if (!state.active && monsters.length) pauseCave();

      if (monsters.length >= cfg.minMonsters || state.clearing) {
        pauseCave();
        state.clearing = true;
        suppressAttack(false);
        stopPathOnly();
        if (!target && monsters.length) bot.attack?.triggerAttack?.();
        if (!target && !combatActive && monsters.length === 0) {
          setStatus("Lure 2: pack cleared — resuming");
          resumeCave();
        } else {
          setStatus(`Lure 2: clearing ${monsters.length} left`);
        }
        return;
      }

      if (!state.active) {
        suppressAttack(false);
        setStatus(`Lure 2: looking 0/${cfg.minMonsters}`);
        return;
      }

      suppressAttack(true);

      if (monsters.length) {
        state.lastMonsterSeenAt = Date.now();
        if (farthest > cfg.maxDistance) {
          stopPathOnly();
          setStatus(`Lure 2: wait ${farthest}/${cfg.maxDistance}`);
          return;
        }
        if (Date.now() < state.nextStepAt) {
          setStatus(`Lure 2: following route ${state.routeIndex + 1}/${state.route.length}`);
          return;
        }

        const waypoint = getTargetWaypoint(me);
        if (!waypoint) {
          setStatus("Lure 2: no route waypoint");
          return;
        }

        const nextTile = getAdjacentStep(me, waypoint);
        if (!nextTile) {
          setStatus(`Lure 2: no walkable tile to waypoint ${state.routeIndex + 1}`);
          return;
        }

        const moved = bot.cave.goToPosition?.(nextTile);
        if (moved !== false) {
          state.nextStepAt = Date.now() + cfg.stepDelayMs;
          state.lastStep = { from: me, to: nextTile, waypoint, routeIndex: state.routeIndex, direction: state.direction };
          setStatus(`Lure 2: wp ${state.routeIndex + 1}/${state.route.length} -> ${nextTile.x},${nextTile.y}`);
          bot.log?.("lure mode 2 route-progress step", state.lastStep);
        }
        return;
      }

      const lostFor = state.lastMonsterSeenAt ? Date.now() - state.lastMonsterSeenAt : 0;
      if (state.lastMonsterSeenAt && lostFor >= LOST_GRACE_MS) {
        suppressAttack(false);
        setStatus("Lure 2: lure lost — resuming");
        resumeCave();
      } else {
        stopPathOnly();
        setStatus("Lure 2: holding lost monster");
      }
    }

    function start() {
      if (state.timerId != null) return;
      try { bot.lureMode2Replacement?.stop?.(); } catch (_) {}
      // Do NOT call legacy.stop() here. Its stop() refreshes the legacy UI and
      // unchecks the shared lure checkbox. The route controller can start while
      // legacy is already stopped; if legacy happens to still be running, tick()
      // shuts it down on the next cycle and the UI owner immediately restores
      // the persisted Mode 2 checkbox state.
      state.timerId = window.setInterval(() => {
        try { tick(); } catch (error) { bot.log?.("lure mode 2 route-progress tick failed", error?.message || error); }
      }, TICK_MS);
      tick();
    }

    function stop() {
      if (state.timerId != null) window.clearInterval(state.timerId);
      state.timerId = null;
      if (state.active) resumeCave();
    }

    bot.lureMode2RouteProgress = {
      installed: true,
      start,
      stop,
      status: () => ({ ...state, config: readConfig(bot) }),
    };

    const cfg = readConfig(bot);
    if (cfg.enabled && cfg.mode === 2) start();

    document.addEventListener("change", () => {
      const next = readConfig(bot);
      window.setTimeout(() => {
        if (next.enabled && next.mode === 2) start();
        else stop();
      }, 0);
    }, true);

    bot.addCleanup?.(stop);
    return true;
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 100) window.clearInterval(timer);
  }, 100);
  install();
})();
