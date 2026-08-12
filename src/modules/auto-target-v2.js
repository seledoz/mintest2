window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoTargetV2Module = function installAutoTargetV2Module(bot) {
  if (!bot || bot.autoTargetV2) return bot?.autoTargetV2 || null;

  const configStorageKey = "minibiaBot.autoTargetV2.config";
  const state = {
    running: false,
    uiTimerId: null,
    uiSyncTimerId: null,
    originalGetVisibleMonsters: null,
    filterInstalled: false,
    unreachableTargets: new Map(),
    reachabilityCache: new Map(),
  };

  const config = Object.assign({
    enabled: false,
    unreachableSkipMs: 4000,
    reachabilityCacheMs: 350,
  }, bot.storage.get(configStorageKey, {}));

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function getPositionKey(position) {
    const value = normalizePosition(position);
    return value ? `${value.x},${value.y},${value.z}` : null;
  }

  function getTile(position) {
    if (!position || typeof Position !== "function") return null;
    return window.gameClient?.world?.getTileFromWorldPosition?.(
      new Position(position.x, position.y, position.z)
    ) || null;
  }

  function findReachableAdjacentPosition(targetPosition, playerPosition) {
    const target = normalizePosition(targetPosition);
    const player = normalizePosition(playerPosition);
    if (!target || !player || target.z !== player.z) return null;

    const pathfinder = window.gameClient?.world?.pathfinder;
    const startTile = getTile(player);
    if (!pathfinder || !startTile || typeof pathfinder.search !== "function") return null;

    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    offsets.sort((a, b) => {
      const da = Math.abs(target.x + a.x - player.x) + Math.abs(target.y + a.y - player.y);
      const db = Math.abs(target.x + b.x - player.x) + Math.abs(target.y + b.y - player.y);
      return da - db;
    });

    for (const offset of offsets) {
      const candidate = {
        x: target.x + offset.x,
        y: target.y + offset.y,
        z: target.z,
      };
      const tile = getTile(candidate);
      if (!tile?.isWalkable?.()) continue;
      if (candidate.x === player.x && candidate.y === player.y) return candidate;

      try {
        const path = pathfinder.search(startTile, tile);
        if (Array.isArray(path) && path.length > 0) return candidate;
      } catch (error) {
        bot.logDebug?.("auto target v2 reachability check failed", {
          targetPosition: target,
          candidate,
          error: error?.message || error,
        });
      }
    }

    return null;
  }

  function pruneCaches(now = Date.now()) {
    for (const [id, entry] of state.unreachableTargets.entries()) {
      if (!entry || entry.until <= now) state.unreachableTargets.delete(id);
    }
    for (const [key, entry] of state.reachabilityCache.entries()) {
      if (!entry || now - entry.at > Math.max(100, Number(config.reachabilityCacheMs) || 350)) {
        state.reachabilityCache.delete(key);
      }
    }
  }

  function isMonsterReachable(monster, now = Date.now()) {
    if (!monster) return false;
    const playerPosition = normalizePosition(bot.getPlayerPosition?.());
    const targetPosition = normalizePosition(monster?.getPosition?.() || monster?.__position);
    if (!playerPosition || !targetPosition || playerPosition.z !== targetPosition.z) return false;

    pruneCaches(now);

    const targetKey = getPositionKey(targetPosition);
    const playerKey = getPositionKey(playerPosition);
    const id = monster?.id;
    const skipped = id != null ? state.unreachableTargets.get(id) : null;
    if (skipped && skipped.positionKey === targetKey && skipped.until > now) return false;
    if (skipped && skipped.positionKey !== targetKey) state.unreachableTargets.delete(id);

    const cacheKey = `${playerKey}|${id ?? "no-id"}|${targetKey}`;
    const cached = state.reachabilityCache.get(cacheKey);
    if (cached && now - cached.at <= Math.max(100, Number(config.reachabilityCacheMs) || 350)) {
      return cached.reachable;
    }

    const reachable = !!findReachableAdjacentPosition(targetPosition, playerPosition);
    state.reachabilityCache.set(cacheKey, { reachable, at: now });

    if (!reachable && id != null) {
      state.unreachableTargets.set(id, {
        until: now + Math.max(500, Number(config.unreachableSkipMs) || 4000),
        positionKey: targetKey,
      });
      bot.logDebug?.("auto target v2 filtered unreachable monster", {
        id,
        name: monster?.name || "Mob",
        position: targetPosition,
      });
    }

    return reachable;
  }

  function getRawVisibleMonsters(options = { sameFloorOnly: true }) {
    const getter = state.originalGetVisibleMonsters || bot.xray?.getVisibleMonsters?.bind(bot.xray);
    if (typeof getter !== "function") return [];
    return getter(options) || [];
  }

  function getReachableCandidates(now = Date.now()) {
    return getRawVisibleMonsters({ sameFloorOnly: true }).filter((monster) => isMonsterReachable(monster, now));
  }

  function installReachabilityFilter() {
    if (state.filterInstalled) return true;
    if (!bot.xray || typeof bot.xray.getVisibleMonsters !== "function") return false;

    state.originalGetVisibleMonsters = bot.xray.getVisibleMonsters.bind(bot.xray);
    bot.xray.getVisibleMonsters = function getVisibleMonstersWithAutoTargetV2Reachability(options = {}) {
      const monsters = state.originalGetVisibleMonsters(options) || [];
      if (!state.running) return monsters;
      const now = Date.now();
      return monsters.filter((monster) => isMonsterReachable(monster, now));
    };
    bot.xray.getVisibleMonsters.__autoTargetV2ReachabilityFilter = true;
    state.filterInstalled = true;
    return true;
  }

  function uninstallReachabilityFilter() {
    if (!state.filterInstalled) return;
    if (bot.xray && bot.xray.getVisibleMonsters?.__autoTargetV2ReachabilityFilter && state.originalGetVisibleMonsters) {
      bot.xray.getVisibleMonsters = state.originalGetVisibleMonsters;
    }
    state.originalGetVisibleMonsters = null;
    state.filterInstalled = false;
    state.unreachableTargets.clear();
    state.reachabilityCache.clear();
  }

  function syncUi() {
    const v2Toggle = document.getElementById("minibia-bot-auto-target-v2-enabled");
    const v1Toggle = document.getElementById("minibia-bot-auto-attack-enabled");
    if (v2Toggle) v2Toggle.checked = state.running;
    if (v1Toggle && state.running) v1Toggle.checked = false;
  }

  function startUiSync() {
    if (state.uiSyncTimerId != null) return;
    state.uiSyncTimerId = window.setInterval(() => {
      if (!state.running) return;
      syncUi();
    }, 100);
  }

  function stopUiSync() {
    if (state.uiSyncTimerId != null) window.clearInterval(state.uiSyncTimerId);
    state.uiSyncTimerId = null;
  }

  function start() {
    config.enabled = true;
    persistConfig();
    if (state.running) return false;
    if (!installReachabilityFilter()) {
      bot.log("auto target v2 could not install reachability filter");
      return false;
    }

    state.running = true;

    if (!bot.attack?.status?.().running) {
      bot.attack?.start?.();
    }

    startUiSync();
    syncUi();
    bot.log("auto target v2 started with full original auto attack behavior", {
      reachabilityOnly: true,
      attackEngineRunning: !!bot.attack?.status?.().running,
      originalToggleHiddenByV2: true,
    });
    return true;
  }

  function stop(options = {}) {
    const stopAttack = options.stopAttack !== false;
    state.running = false;
    stopUiSync();
    uninstallReachabilityFilter();

    if (stopAttack && bot.attack?.status?.().running) {
      bot.attack.stop();
    }

    if (options.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }

    syncUi();
    bot.log("auto target v2 stopped", { stoppedAttack: stopAttack });
    return true;
  }

  function tryTarget() {
    if (!state.running) return false;
    return !!bot.attack?.tryAttack?.();
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "unreachableSkipMs")) {
      nextConfig.unreachableSkipMs = Math.max(500, Math.trunc(Number(nextConfig.unreachableSkipMs) || config.unreachableSkipMs || 4000));
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "reachabilityCacheMs")) {
      nextConfig.reachabilityCacheMs = Math.max(100, Math.trunc(Number(nextConfig.reachabilityCacheMs) || config.reachabilityCacheMs || 350));
    }
    Object.assign(config, nextConfig);
    persistConfig();
    state.unreachableTargets.clear();
    state.reachabilityCache.clear();
    return { ...config };
  }

  function installUi() {
    if (document.getElementById("minibia-bot-auto-target-v2-enabled")) {
      syncUi();
      return true;
    }

    const v1Toggle = document.getElementById("minibia-bot-auto-attack-enabled");
    const v1Label = v1Toggle?.closest?.("label");
    if (!v1Label) return false;

    const label = document.createElement("label");
    label.className = "mb-toggle";
    label.innerHTML = '<input type="checkbox" id="minibia-bot-auto-target-v2-enabled" /><span>Auto Target 2.0</span>';
    v1Label.insertAdjacentElement("afterend", label);

    const v2Toggle = label.querySelector("#minibia-bot-auto-target-v2-enabled");
    v2Toggle.checked = state.running;
    v2Toggle.addEventListener("change", () => {
      if (v2Toggle.checked) start();
      else stop();
      syncUi();
    });

    v1Toggle.addEventListener("change", () => {
      if (v1Toggle.checked && state.running) {
        stop({ stopAttack: false });
        v1Toggle.checked = !!bot.attack?.status?.().running;
      }
    });

    return true;
  }

  function status() {
    const attackStatus = bot.attack?.status?.() || {};
    return {
      ...attackStatus,
      running: state.running,
      config: { ...config },
      attackConfig: attackStatus.config ? { ...attackStatus.config } : null,
      reachableCandidates: state.running
        ? getReachableCandidates().map((monster) => ({ id: monster?.id, name: monster?.name || "Mob" }))
        : [],
      unreachableTargetIds: Array.from(state.unreachableTargets.keys()),
      fullOriginalCombatEngine: true,
      runeAndHotbarInherited: true,
      meleeChaseInherited: true,
      creaturePriorityInherited: true,
    };
  }

  bot.autoTargetV2 = {
    start,
    stop,
    status,
    updateConfig,
    tryTarget,
    getReachableCandidates,
    findReachableAdjacentPosition,
    isMonsterReachable,
    config,
  };

  bot.addCleanup?.(() => {
    stop({ persistEnabled: false, stopAttack: false });
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
    stopUiSync();
  });

  if (!installUi()) {
    let attempts = 0;
    state.uiTimerId = window.setInterval(() => {
      attempts += 1;
      if (installUi() || attempts >= 80) {
        window.clearInterval(state.uiTimerId);
        state.uiTimerId = null;
      }
    }, 250);
  }

  if (config.enabled) start();
  return bot.autoTargetV2;
};

(() => {
  let attempts = 0;
  let lastBot = null;
  const timer = window.setInterval(() => {
    attempts += 1;
    const bot = window.minibiaBot;
    if (bot && bot !== lastBot && window.__minibiaBotBundle?.installAutoTargetV2Module) {
      lastBot = bot;
      if (!bot.autoTargetV2) {
        window.__minibiaBotBundle.installAutoTargetV2Module(bot);
      }
    }
    if (attempts >= 120) window.clearInterval(timer);
  }, 250);
})();