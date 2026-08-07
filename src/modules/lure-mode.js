window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installLureModeModule = function installLureModeModule(bot) {
  const configStorageKey = "minibiaBot.lure.config";
  const COUNT_RANGE = 7;
  const COUNT_RANGE_Y = 5;
  const TICK_MS = 150;
  const DEFAULT_STEP_DELAY_MS = 450;
  const LOST_MONSTER_GRACE_MS = 10000;

  const config = Object.assign(
    { enabled: false, mode: 1, minMonsters: 3, maxDistance: 4, stepDelayMs: DEFAULT_STEP_DELAY_MS },
    bot.storage.get(configStorageKey, {}) || {}
  );

  const state = {
    timerId: null,
    uiTimerId: null,
    pathfinder: null,
    originalFindPath: null,
    suppressingAttack: false,
    restoreAttackEnabled: false,
    lastHoldLogAt: 0,
    lastStatus: null,
    clearingPack: false,
    resumeCaveAfterClear: false,

    // Mode 2 is intentionally independent from Cavebot path execution.
    mode2Active: false,
    mode2CaveWasRunning: false,
    mode2Waypoint: null,
    mode2NextStepAt: 0,
    mode2LastMonsterSeenAt: 0,
    mode2LastStepAt: 0,
    mode2LastStepFrom: null,
    mode2LastStepTo: null,
  };

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }

  function intValue(value, fallback, min = 1, max = 99) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }

  function modeValue(value) { return Number(value) === 2 ? 2 : 1; }

  function pos(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }
      : null;
  }

  function dist(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return Infinity;
    return Math.max(Math.abs(Number(a.x) - Number(b.x)), Math.abs(Number(a.y) - Number(b.y)));
  }

  function isWithinDetectionRange(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return false;
    return Math.abs(Number(a.x) - Number(b.x)) <= COUNT_RANGE
      && Math.abs(Number(a.y) - Number(b.y)) <= COUNT_RANGE_Y;
  }

  function playerPos() { return pos(bot.getPlayerPosition?.() || window.gameClient?.player?.__position); }
  function monsterPos(monster) { return pos(monster?.getPosition?.() || monster?.__position || monster?.position); }
  function currentTarget() { return bot.attack?.getCurrentTarget?.() || window.gameClient?.player?.__target || null; }
  function visibleMonsters() { return bot.attack?.getNearbyMonsters?.() || bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []; }

  function getOffStatus() {
    return {
      enabled: false,
      mode: modeValue(config.mode),
      countRange: COUNT_RANGE,
      minMonsters: intValue(config.minMonsters, 3, 1, 20),
      maxDistance: intValue(config.maxDistance, 4, 1, COUNT_RANGE),
      stepDelayMs: intValue(config.stepDelayMs, DEFAULT_STEP_DELAY_MS, 100, 2000),
      monsterCount: 0,
      closestDistance: null,
      farthestDistance: null,
      readyToEngage: false,
      clearingPack: false,
      luring: false,
      shouldHoldWalking: false,
      hasTarget: false,
      combatActive: false,
      phase: "off",
      mode2Active: false,
    };
  }

  function getLureMonsters() {
    if (!config.enabled) return [];
    const me = playerPos();
    if (!me) return [];
    return visibleMonsters()
      .map((monster) => ({ monster, position: monsterPos(monster) }))
      .map((entry) => ({ ...entry, distance: dist(me, entry.position) }))
      .filter((entry) => entry.position && isWithinDetectionRange(me, entry.position))
      .sort((a, b) => a.distance - b.distance || Number(a.monster?.id || 0) - Number(b.monster?.id || 0));
  }

  function getLureStatus() {
    if (!config.enabled) return getOffStatus();

    const monsters = getLureMonsters();
    const mode = modeValue(config.mode);
    const minMonsters = intValue(config.minMonsters, 3, 1, 20);
    const maxDistance = intValue(config.maxDistance, 4, 1, COUNT_RANGE);
    const stepDelayMs = intValue(config.stepDelayMs, DEFAULT_STEP_DELAY_MS, 100, 2000);
    const hasTarget = !!currentTarget();
    const combatActive = !!bot.attack?.status?.()?.combatActive;
    const closestDistance = monsters.length ? monsters[0].distance : Infinity;
    const farthestDistance = monsters.length ? monsters[monsters.length - 1].distance : Infinity;
    const readyToEngage = monsters.length >= minMonsters;
    const clearingPack = !!state.clearingPack;
    const luring = monsters.length > 0 && !readyToEngage && !clearingPack && !hasTarget && !combatActive;

    let phase = "looking";
    let shouldHoldWalking = false;

    if (clearingPack) {
      phase = "clearing";
      shouldHoldWalking = true;
    } else if (readyToEngage) {
      phase = "engage";
      shouldHoldWalking = true;
    } else if (mode === 1 && luring) {
      shouldHoldWalking = closestDistance > maxDistance;
      phase = shouldHoldWalking ? "waiting" : "walking";
    } else if (mode === 2 && state.mode2Active) {
      if (!monsters.length) phase = "lost-wait";
      else if (farthestDistance > maxDistance) phase = "waiting";
      else if (Date.now() < state.mode2NextStepAt) phase = "delay";
      else phase = "step-ready";
      shouldHoldWalking = true;
    } else if (monsters.length) {
      phase = "seen";
    }

    return {
      enabled: true,
      mode,
      countRange: COUNT_RANGE,
      minMonsters,
      maxDistance,
      stepDelayMs,
      monsterCount: monsters.length,
      closestDistance: Number.isFinite(closestDistance) ? closestDistance : null,
      farthestDistance: Number.isFinite(farthestDistance) ? farthestDistance : null,
      readyToEngage,
      clearingPack,
      luring,
      shouldHoldWalking,
      hasTarget,
      combatActive,
      phase,
      mode2Active: !!state.mode2Active,
      mode2Waypoint: state.mode2Waypoint ? { ...state.mode2Waypoint } : null,
      mode2NextStepAt: state.mode2NextStepAt,
    };
  }

  function setAttackSuppressed(shouldSuppress) {
    const attackConfig = bot.attack?.config;
    if (!attackConfig) return false;

    if (shouldSuppress) {
      if (!state.suppressingAttack) {
        state.restoreAttackEnabled = !!attackConfig.enabled;
        state.suppressingAttack = true;
      }
      attackConfig.enabled = false;
      return true;
    }

    if (state.suppressingAttack) {
      if (state.restoreAttackEnabled) attackConfig.enabled = true;
      state.suppressingAttack = false;
      state.restoreAttackEnabled = false;
      return true;
    }
    return false;
  }

  function stopCurrentPath() {
    const targets = [
      window.gameClient?.world?.pathfinder,
      window.gameClient?.player,
      window.gameClient?.world,
    ].filter(Boolean);

    let stopped = false;
    ["stop", "cancel", "clear", "clearPath", "stopWalking", "cancelWalking", "stopAutoWalk", "reset"].forEach((name) => {
      targets.forEach((target) => {
        if (typeof target?.[name] !== "function") return;
        try { target[name](); stopped = true; } catch (error) {}
      });
    });
    return stopped;
  }

  function getCurrentCaveWaypoint() {
    const status = bot.cave?.status?.() || null;
    return pos(status?.currentWaypoint);
  }

  function pauseCaveForMode2() {
    if (state.mode2Active) return true;
    const caveStatus = bot.cave?.status?.() || null;
    state.mode2CaveWasRunning = !!caveStatus?.running;
    state.mode2Waypoint = pos(caveStatus?.currentWaypoint);
    state.mode2Active = true;
    state.mode2NextStepAt = 0;
    state.mode2LastMonsterSeenAt = Date.now();

    stopCurrentPath();
    if (caveStatus?.running) {
      try { bot.cave?.stop?.({ persistEnabled: false }); }
      catch (error) { try { bot.cave?.stop?.(); } catch (ignored) {} }
    }

    bot.log?.("lure mode 2 took control from cavebot", {
      waypoint: state.mode2Waypoint,
      caveWasRunning: state.mode2CaveWasRunning,
    });
    return true;
  }

  function releaseMode2Control({ resumeCave = true } = {}) {
    if (!state.mode2Active) return false;
    const shouldResume = resumeCave && state.mode2CaveWasRunning;

    state.mode2Active = false;
    state.mode2NextStepAt = 0;
    state.mode2LastMonsterSeenAt = 0;
    state.mode2LastStepAt = 0;
    state.mode2LastStepFrom = null;
    state.mode2LastStepTo = null;
    state.mode2Waypoint = null;
    state.mode2CaveWasRunning = false;

    stopCurrentPath();

    if (shouldResume) {
      try { bot.cave?.start?.(); } catch (error) {}
    }
    return true;
  }

  function pauseCaveForFight() {
    stopCurrentPath();

    if (modeValue(config.mode) === 2) {
      if (!state.mode2Active) pauseCaveForMode2();
      return;
    }

    try {
      const caveStatus = bot.cave?.status?.();
      if (caveStatus?.running && typeof bot.cave.stop === "function") {
        state.resumeCaveAfterClear = true;
        bot.cave.stop();
      }
    } catch (error) {}
  }

  function resumeCaveIfNeeded() {
    if (modeValue(config.mode) === 2) {
      releaseMode2Control({ resumeCave: true });
      return;
    }

    if (!state.resumeCaveAfterClear) return;
    state.resumeCaveAfterClear = false;
    try { bot.cave?.start?.(); } catch (error) {}
  }

  // Mode 1 keeps the old pathfinder behavior. Mode 2 never uses this.
  function patchPathfinderForMode1() {
    if (!config.enabled || modeValue(config.mode) !== 1) {
      restorePathfinder();
      return false;
    }

    const pf = window.gameClient?.world?.pathfinder;
    if (!pf || typeof pf.findPath !== "function") return false;
    if (state.pathfinder === pf && state.originalFindPath) return true;

    if (state.pathfinder && state.originalFindPath) {
      try { state.pathfinder.findPath = state.originalFindPath; } catch (error) {}
    }

    state.pathfinder = pf;
    state.originalFindPath = pf.findPath.bind(pf);

    pf.findPath = function lureMode1FindPathGuard(...args) {
      if (!config.enabled || modeValue(config.mode) !== 1) {
        return state.originalFindPath(...args);
      }

      const status = getLureStatus();
      state.lastStatus = status;

      if (status.shouldHoldWalking) {
        const now = Date.now();
        stopCurrentPath();
        if (now - state.lastHoldLogAt > 1500) {
          state.lastHoldLogAt = now;
          bot.log?.("lure mode 1 holding path", {
            monsterCount: status.monsterCount,
            closestDistance: status.closestDistance,
            maxDistance: status.maxDistance,
          });
        }
        return null;
      }

      return state.originalFindPath(...args);
    };

    return true;
  }

  function restorePathfinder() {
    if (state.pathfinder && state.originalFindPath) {
      try { state.pathfinder.findPath = state.originalFindPath; } catch (error) {}
    }
    state.pathfinder = null;
    state.originalFindPath = null;
  }

  // ----- Mode 2 one-tile movement engine -----

  const walkMatrixCache = new Map();

  function getWalkabilityMatrix(z) {
    const key = String(z);
    const cached = walkMatrixCache.get(key);
    if (cached && Date.now() - cached.at <= 750) return cached.matrix;

    const matrix = new Map();
    const chunks = window.gameClient?.world?.chunks || [];

    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) {
        const p = pos(tile?.__position);
        if (!p || p.z !== z) continue;
        matrix.set(`${p.x},${p.y}`, tile.isWalkable ? tile.isWalkable() : false);
      }
    }

    walkMatrixCache.set(key, { matrix, at: Date.now() });
    return matrix;
  }

  function getNeighbors(node, matrix) {
    const directions = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    return directions
      .map((d) => ({ x: node.x + d.x, y: node.y + d.y, z: node.z }))
      .filter((p) => matrix.get(`${p.x},${p.y}`) === true);
  }

  function heuristic(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function reconstructPath(node) {
    const path = [];
    let current = node;
    while (current) {
      path.unshift({ x: current.x, y: current.y, z: current.z });
      current = current.parent;
    }
    return path;
  }

  function findOneStepToward(start, goal) {
    const from = pos(start);
    const to = pos(goal);
    if (!from || !to || from.z !== to.z) return null;
    if (from.x === to.x && from.y === to.y) return null;

    const matrix = getWalkabilityMatrix(from.z);
    const open = [{ ...from, g: 0, f: heuristic(from, to), parent: null }];
    const closed = new Set();
    const key = (p) => `${p.x},${p.y}`;

    while (open.length) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i += 1) {
        if (open[i].f < open[bestIndex].f) bestIndex = i;
      }

      const current = open.splice(bestIndex, 1)[0];
      if (current.x === to.x && current.y === to.y) {
        const path = reconstructPath(current);
        return path.length > 1 ? path[1] : null;
      }

      closed.add(key(current));

      for (const neighbor of getNeighbors(current, matrix)) {
        const neighborKey = key(neighbor);
        if (closed.has(neighborKey)) continue;

        const diagonal = neighbor.x !== current.x && neighbor.y !== current.y;
        const g = current.g + (diagonal ? 1.4 : 1);
        const f = g + heuristic(neighbor, to);
        const existing = open.find((entry) => entry.x === neighbor.x && entry.y === neighbor.y);

        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
          }
        } else {
          open.push({ ...neighbor, g, f, parent: current });
        }
      }
    }

    return null;
  }

  function pickArrowKey(from, to) {
    if (!from || !to) return null;
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);

    if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) && dx !== 0) {
      return dx > 0 ? "ArrowRight" : "ArrowLeft";
    }
    if (dy !== 0) return dy > 0 ? "ArrowDown" : "ArrowUp";
    return null;
  }

  function dispatchArrowKey(key) {
    if (!key) return false;
    const target = document.activeElement || document.body || document.documentElement;
    const eventInit = { key, code: key, bubbles: true, cancelable: true, composed: true };

    target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    document.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    window.dispatchEvent(new KeyboardEvent("keydown", eventInit));

    window.setTimeout(() => {
      target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      document.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      window.dispatchEvent(new KeyboardEvent("keyup", eventInit));
    }, 40);

    return true;
  }

  function mode2StepOnce(status) {
    if (!state.mode2Active) return false;
    const from = playerPos();
    if (!from) return false;

    let waypoint = state.mode2Waypoint;
    if (!waypoint) {
      waypoint = getCurrentCaveWaypoint();
      state.mode2Waypoint = waypoint;
    }
    if (!waypoint || waypoint.z !== from.z) {
      bot.log?.("lure mode 2 cannot step: waypoint unavailable or different floor", { from, waypoint });
      return false;
    }

    const nextTile = findOneStepToward(from, waypoint);
    if (!nextTile) {
      bot.log?.("lure mode 2 cannot find one-tile step", { from, waypoint });
      return false;
    }

    const key = pickArrowKey(from, nextTile);
    if (!key) return false;

    const moved = dispatchArrowKey(key);
    if (!moved) return false;

    state.mode2LastStepAt = Date.now();
    state.mode2NextStepAt = state.mode2LastStepAt + status.stepDelayMs;
    state.mode2LastStepFrom = from;
    state.mode2LastStepTo = nextTile;

    bot.log?.("lure mode 2 single step", {
      key,
      from,
      nextTile,
      waypoint,
      monsterCount: status.monsterCount,
      farthestDistance: status.farthestDistance,
      maxDistance: status.maxDistance,
      nextStepAt: state.mode2NextStepAt,
    });
    return true;
  }

  function updateStatusUi(status = null) {
    const label = document.getElementById("minibia-bot-lure-status");
    if (!label) return;

    const current = status || (config.enabled ? state.lastStatus || getLureStatus() : getOffStatus());
    const prefix = `Lure ${current.mode}`;

    if (!current.enabled) label.textContent = `${prefix}: off`;
    else if (current.clearingPack) label.textContent = `${prefix}: clearing ${current.monsterCount} left`;
    else if (current.readyToEngage) label.textContent = `${prefix}: engaging ${current.monsterCount}/${current.minMonsters}`;
    else if (current.mode === 2 && current.mode2Active) {
      if (current.phase === "lost-wait") label.textContent = `${prefix}: holding lure — monster temporarily lost`;
      else if (current.phase === "waiting") label.textContent = `${prefix}: wait ${current.farthestDistance}/${current.maxDistance}`;
      else if (current.phase === "delay") label.textContent = `${prefix}: stepped — rechecking pack`;
      else if (current.phase === "step-ready") label.textContent = `${prefix}: one step ready ${current.monsterCount}/${current.minMonsters}`;
      else label.textContent = `${prefix}: luring ${current.monsterCount}/${current.minMonsters}`;
    } else if (current.shouldHoldWalking) {
      label.textContent = `${prefix}: waiting ${current.closestDistance}/${current.maxDistance}`;
    } else if (current.monsterCount > 0) {
      label.textContent = `${prefix}: walking ${current.monsterCount}/${current.minMonsters}`;
    } else {
      label.textContent = `${prefix}: looking 0/${current.minMonsters}`;
    }
  }

  function tickMode2() {
    restorePathfinder();

    let status = getLureStatus();
    state.lastStatus = status;

    if (state.clearingPack) {
      setAttackSuppressed(false);
      pauseCaveForFight();

      if (!status.hasTarget && status.monsterCount > 0) {
        bot.attack?.triggerAttack?.();
      }

      if (!status.hasTarget && !status.combatActive && status.monsterCount === 0) {
        state.clearingPack = false;
        bot.log?.("lure mode 2 pack cleared");
        releaseMode2Control({ resumeCave: true });
        status = getLureStatus();
      }

      state.lastStatus = status;
      updateStatusUi(status);
      return status;
    }

    if (status.readyToEngage) {
      if (!state.mode2Active) pauseCaveForMode2();
      state.clearingPack = true;
      setAttackSuppressed(false);
      stopCurrentPath();
      bot.attack?.triggerAttack?.();

      window.setTimeout(() => {
        if (!config.enabled || modeValue(config.mode) !== 2 || !state.clearingPack) return;
        stopCurrentPath();
        bot.attack?.triggerAttack?.();
      }, 100);

      bot.log?.("lure mode 2 engaging pack", {
        monsterCount: status.monsterCount,
        minMonsters: status.minMonsters,
      });

      const current = getLureStatus();
      state.lastStatus = current;
      updateStatusUi(current);
      return current;
    }

    if (status.hasTarget || status.combatActive) {
      if (!state.mode2Active) pauseCaveForMode2();
      setAttackSuppressed(false);
      stopCurrentPath();
      updateStatusUi(status);
      return status;
    }

    if (!state.mode2Active) {
      if (status.monsterCount <= 0) {
        setAttackSuppressed(false);
        updateStatusUi(status);
        return status;
      }
      pauseCaveForMode2();
      status = getLureStatus();
      state.lastStatus = status;
    }

    setAttackSuppressed(true);
    stopCurrentPath();

    if (status.monsterCount > 0) {
      state.mode2LastMonsterSeenAt = Date.now();

      if (
        Number.isFinite(status.farthestDistance)
        && status.farthestDistance <= status.maxDistance
        && Date.now() >= state.mode2NextStepAt
      ) {
        mode2StepOnce(status);
      }
    } else {
      const lostForMs = Date.now() - state.mode2LastMonsterSeenAt;
      if (state.mode2LastMonsterSeenAt && lostForMs >= LOST_MONSTER_GRACE_MS) {
        bot.log?.("lure mode 2 released lost lure", { lostForMs });
        setAttackSuppressed(false);
        releaseMode2Control({ resumeCave: true });
        status = getLureStatus();
      }
    }

    state.lastStatus = status;
    updateStatusUi(status);
    return status;
  }

  function tickMode1() {
    patchPathfinderForMode1();

    let status = getLureStatus();
    state.lastStatus = status;

    if (state.clearingPack && !status.hasTarget && !status.combatActive && status.monsterCount === 0) {
      state.clearingPack = false;
      status = getLureStatus();
      bot.log?.("lure mode 1 pack cleared");
      resumeCaveIfNeeded();
    }

    if (state.clearingPack) {
      setAttackSuppressed(false);
      pauseCaveForFight();
      if (!status.hasTarget && status.monsterCount > 0) bot.attack?.triggerAttack?.();
      const current = getLureStatus();
      state.lastStatus = current;
      updateStatusUi(current);
      return current;
    }

    if (status.readyToEngage) {
      state.clearingPack = true;
      setAttackSuppressed(false);
      pauseCaveForFight();
      bot.attack?.triggerAttack?.();
      window.setTimeout(() => {
        if (!config.enabled || modeValue(config.mode) !== 1) return;
        pauseCaveForFight();
        bot.attack?.triggerAttack?.();
      }, 100);
      const current = getLureStatus();
      state.lastStatus = current;
      updateStatusUi(current);
      return current;
    }

    if (status.hasTarget || status.combatActive) {
      setAttackSuppressed(false);
      updateStatusUi(status);
      return status;
    }

    setAttackSuppressed(true);
    if (status.shouldHoldWalking) stopCurrentPath();
    updateStatusUi(status);
    return status;
  }

  function tick() {
    if (!config.enabled) return getOffStatus();
    return modeValue(config.mode) === 2 ? tickMode2() : tickMode1();
  }

  function startRuntime() {
    if (!config.enabled || state.timerId != null) return false;

    if (modeValue(config.mode) === 1) {
      patchPathfinderForMode1();
    } else {
      restorePathfinder();
    }

    tick();
    state.timerId = window.setInterval(() => {
      try { tick(); } catch (error) { bot.log?.("lure mode tick failed", error?.message || error); }
    }, TICK_MS);

    return true;
  }

  function stopRuntime() {
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
    state.clearingPack = false;
    state.resumeCaveAfterClear = false;
    state.lastStatus = getOffStatus();

    setAttackSuppressed(false);
    restorePathfinder();
    releaseMode2Control({ resumeCave: true });
    updateStatusUi(state.lastStatus);
    return true;
  }

  function updateConfig(nextConfig = {}) {
    const hadEnabled = !!config.enabled;
    const previousMode = modeValue(config.mode);

    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) config.enabled = !!nextConfig.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "mode")) config.mode = modeValue(nextConfig.mode);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMonsters")) {
      config.minMonsters = intValue(nextConfig.minMonsters, config.minMonsters || 3, 1, 20);
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxDistance")) {
      config.maxDistance = intValue(nextConfig.maxDistance, config.maxDistance || 4, 1, COUNT_RANGE);
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "stepDelayMs")) {
      config.stepDelayMs = intValue(nextConfig.stepDelayMs, config.stepDelayMs || DEFAULT_STEP_DELAY_MS, 100, 2000);
    }

    persistConfig();

    const nextMode = modeValue(config.mode);
    if (previousMode !== nextMode) {
      state.clearingPack = false;
      setAttackSuppressed(false);
      restorePathfinder();
      releaseMode2Control({ resumeCave: true });

      if (config.enabled && nextMode === 1) patchPathfinderForMode1();
    }

    if (config.enabled && !hadEnabled) startRuntime();
    else if (!config.enabled && hadEnabled) stopRuntime();
    else if (!config.enabled) state.lastStatus = getOffStatus();

    bot.log?.("lure mode config updated", { ...config, countRange: COUNT_RANGE });
    updateUiValues();
    updateStatusUi();
    return { ...config };
  }

  function updateUiValues() {
    const enabled = document.getElementById("minibia-bot-lure-enabled");
    const mode = document.getElementById("minibia-bot-lure-mode");
    const min = document.getElementById("minibia-bot-lure-min-monsters");
    const max = document.getElementById("minibia-bot-lure-max-distance");
    const delay = document.getElementById("minibia-bot-lure-step-delay");

    if (enabled) enabled.checked = !!config.enabled;
    if (mode && document.activeElement !== mode) mode.value = String(modeValue(config.mode));
    if (min && document.activeElement !== min) min.value = String(intValue(config.minMonsters, 3, 1, 20));
    if (max && document.activeElement !== max) max.value = String(intValue(config.maxDistance, 4, 1, COUNT_RANGE));
    if (delay && document.activeElement !== delay) delay.value = String(intValue(config.stepDelayMs, DEFAULT_STEP_DELAY_MS, 100, 2000));
  }

  function installLureStyle() {
    let style = document.getElementById("minibia-bot-lure-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "minibia-bot-lure-style";
      document.head.appendChild(style);
    }

    style.textContent = `
      #minibia-bot-panel { width: min(98vw, 1260px) !important; max-width: calc(100vw - 12px) !important; }
      #minibia-bot-panel .mb-body:not([hidden]) { grid-template-columns: minmax(0, 1fr) 280px 240px 280px !important; }
      #minibia-bot-panel .mb-aoe-column { display: grid !important; gap: 10px !important; align-content: start !important; min-width: 0 !important; }
      #minibia-bot-lure-section .mb-field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      #minibia-bot-lure-standalone { display: none !important; }
      @media (max-width: 760px) { #minibia-bot-panel .mb-body:not([hidden]) { grid-template-columns: 1fr !important; } }
    `;
  }

  function makeSection() {
    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-lure-section";
    section.innerHTML = `
      <div class="mb-label">Lure Mode</div>
      <div class="mb-stack">
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-lure-enabled" /><span>Enable Lure Mode</span></label>
        <label class="mb-field" for="minibia-bot-lure-mode"><span class="mb-field-label">Mode</span>
          <select id="minibia-bot-lure-mode">
            <option value="1">Lure Mode 1 (Current)</option>
            <option value="2">Lure Mode 2 (One-Step)</option>
          </select>
        </label>
        <div class="mb-field-grid">
          <label class="mb-field" for="minibia-bot-lure-min-monsters"><span class="mb-field-label">Min Monsters</span><input type="number" id="minibia-bot-lure-min-monsters" min="1" max="20" step="1" /></label>
          <label class="mb-field" for="minibia-bot-lure-max-distance"><span class="mb-field-label">Max Distance</span><input type="number" id="minibia-bot-lure-max-distance" min="1" max="7" step="1" /></label>
          <label class="mb-field" for="minibia-bot-lure-step-delay"><span class="mb-field-label">Mode 2 Step Delay (ms)</span><input type="number" id="minibia-bot-lure-step-delay" min="100" max="2000" step="50" /></label>
        </div>
        <div class="mb-small-note">Mode 2 stops Cavebot while luring. When every tracked monster is inside Max Distance, it presses exactly one movement key toward the current waypoint, then waits and checks again.</div>
        <div class="mb-small-note">Cavebot resumes only after the pack is cleared, or after the lure has been lost for 10 seconds.</div>
        <div class="mb-small-note" id="minibia-bot-lure-status">Lure 1: off</div>
      </div>
    `;

    section.querySelector("#minibia-bot-lure-enabled")?.addEventListener("change", (event) => updateConfig({ enabled: event.target.checked }));
    section.querySelector("#minibia-bot-lure-mode")?.addEventListener("change", (event) => updateConfig({ mode: event.target.value }));
    section.querySelector("#minibia-bot-lure-min-monsters")?.addEventListener("input", (event) => updateConfig({ minMonsters: event.target.value }));
    section.querySelector("#minibia-bot-lure-max-distance")?.addEventListener("input", (event) => updateConfig({ maxDistance: event.target.value }));
    section.querySelector("#minibia-bot-lure-step-delay")?.addEventListener("input", (event) => updateConfig({ stepDelayMs: event.target.value }));
    return section;
  }

  function cleanupDuplicateLurePanels() {
    document.querySelectorAll("#minibia-bot-lure-standalone").forEach((node) => node.remove());
    const sections = Array.from(document.querySelectorAll("#minibia-bot-lure-section"));
    sections.slice(1).forEach((node) => node.remove());
    return sections[0] || null;
  }

  function getOrCreateLureSection() {
    const existing = cleanupDuplicateLurePanels();
    if (existing) existing.remove();
    return makeSection();
  }

  function getFourthColumn() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const body = panel?.querySelector?.(".mb-body");
    if (!panel || !body) return null;

    let column = document.getElementById("minibia-bot-aoe-column");
    if (!column) {
      column = document.createElement("div");
      column.id = "minibia-bot-aoe-column";
      column.className = "mb-aoe-column";
      body.appendChild(column);
    }
    return column;
  }

  function injectUi() {
    installLureStyle();

    let section = document.getElementById("minibia-bot-lure-section");
    if (!section || !document.getElementById("minibia-bot-lure-mode")) section = getOrCreateLureSection();

    const column = getFourthColumn();
    if (column && section.parentElement !== column) column.appendChild(section);

    cleanupDuplicateLurePanels();
    updateUiValues();
    updateStatusUi();
    return !!document.getElementById("minibia-bot-lure-section");
  }

  function startUiInjector() {
    let attempts = 0;
    state.uiTimerId = window.setInterval(() => {
      attempts += 1;
      injectUi();
      const section = document.getElementById("minibia-bot-lure-section");
      const column = document.getElementById("minibia-bot-aoe-column");
      const correctlyPlaced = !!section && !!column && section.parentElement === column;
      if (correctlyPlaced || attempts >= 120) {
        window.clearInterval(state.uiTimerId);
        state.uiTimerId = null;
      }
    }, 250);
    injectUi();
  }

  function start() {
    config.enabled = true;
    persistConfig();
    updateUiValues();
    return startRuntime();
  }

  function stop(options = {}) {
    config.enabled = false;
    if (options.persistEnabled !== false) persistConfig();
    updateUiValues();
    return stopRuntime();
  }

  function destroy() {
    stop({ persistEnabled: false });
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
  }

  function status() {
    return {
      running: config.enabled && state.timerId != null,
      config: { ...config, countRange: COUNT_RANGE },
      lure: config.enabled ? getLureStatus() : getOffStatus(),
      clearingPack: config.enabled && state.clearingPack,
      resumeCaveAfterClear: config.enabled && (state.resumeCaveAfterClear || state.mode2CaveWasRunning),
      suppressingAttack: config.enabled && state.suppressingAttack,
      mode2: {
        active: state.mode2Active,
        caveWasRunning: state.mode2CaveWasRunning,
        waypoint: state.mode2Waypoint ? { ...state.mode2Waypoint } : null,
        nextStepAt: state.mode2NextStepAt,
        lastMonsterSeenAt: state.mode2LastMonsterSeenAt,
        lastStepAt: state.mode2LastStepAt,
        lastStepFrom: state.mode2LastStepFrom,
        lastStepTo: state.mode2LastStepTo,
      },
    };
  }

  bot.lureMode = { start, stop, status, updateConfig, getLureStatus, config };

  if (config.enabled) startRuntime();
  else state.lastStatus = getOffStatus();

  startUiInjector();
  bot.addCleanup?.(destroy);
};
