window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoTargetV2Module = function installAutoTargetV2Module(bot) {
  if (!bot || bot.autoTargetV2) return bot?.autoTargetV2 || null;

  const configStorageKey = "minibiaBot.autoTargetV2.config";
  const state = {
    running: false,
    timerId: null,
    skippedTargetIds: new Map(),
    lastTargetAt: 0,
    combatStartedAt: 0,
    originalAttackStatus: null,
    attackStatusBridgeInstalled: false,
  };

  const config = Object.assign({
    enabled: false,
    tickMs: 500,
    targetCooldownMs: 1200,
    unreachableSkipMs: 4000,
  }, bot.storage.get(configStorageKey, {}));
  config.tickMs = 500;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function getTile(position) {
    if (!position || typeof Position !== "function") return null;
    return window.gameClient?.world?.getTileFromWorldPosition?.(new Position(position.x, position.y, position.z)) || null;
  }

  function getNearbyMonsters() {
    return bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
  }

  function getTileDistance(from, to) {
    if (!from || !to || from.z !== to.z) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
  }

  function isInTargetRange(from, to) {
    if (!from || !to || from.z !== to.z) return false;
    const attackConfig = bot.attack?.config || {};
    const maxX = Math.max(1, Number(attackConfig.maxTargetDistanceX) || 7);
    const maxY = Math.max(1, Number(attackConfig.maxTargetDistanceY) || 5);
    return Math.abs(from.x - to.x) <= maxX && Math.abs(from.y - to.y) <= maxY;
  }

  function getCurrentTarget() {
    return window.gameClient?.player?.__target || null;
  }

  function getCreaturePriorityIndex(monster) {
    const priorityConfig = bot.attackPriority?.config;
    if (!priorityConfig?.enabled || !Array.isArray(priorityConfig.creatureNames) || !priorityConfig.creatureNames.length) {
      return Number.POSITIVE_INFINITY;
    }
    const name = String(monster?.name || "").trim().toLowerCase();
    if (!name) return Number.POSITIVE_INFINITY;
    const index = priorityConfig.creatureNames.findIndex((entry) => String(entry || "").trim().toLowerCase() === name);
    return index >= 0 ? index : Number.POSITIVE_INFINITY;
  }

  function syncCombatState(now = Date.now()) {
    if (!state.running) {
      state.combatStartedAt = 0;
      return false;
    }
    const target = getCurrentTarget();
    if (target) {
      if (!state.combatStartedAt) state.combatStartedAt = now;
      return true;
    }
    state.combatStartedAt = 0;
    return false;
  }

  function installAttackStatusBridge() {
    if (state.attackStatusBridgeInstalled || typeof bot.attack?.status !== "function") return false;
    state.originalAttackStatus = bot.attack.status.bind(bot.attack);
    const bridgedStatus = function autoTargetV2AttackStatusBridge() {
      const original = state.originalAttackStatus ? state.originalAttackStatus() : {};
      if (!state.running) return original;
      const now = Date.now();
      const combatActive = syncCombatState(now);
      return {
        ...original,
        combatActive,
        combatDurationMs: combatActive ? Math.max(0, now - state.combatStartedAt) : 0,
        targetCount: combatActive ? 1 : 0,
      };
    };
    bridgedStatus.__autoTargetV2Bridge = true;
    bot.attack.status = bridgedStatus;
    state.attackStatusBridgeInstalled = true;
    return true;
  }

  function uninstallAttackStatusBridge() {
    if (!state.attackStatusBridgeInstalled) return;
    if (bot.attack && bot.attack.status?.__autoTargetV2Bridge && state.originalAttackStatus) {
      bot.attack.status = state.originalAttackStatus;
    }
    state.originalAttackStatus = null;
    state.attackStatusBridgeInstalled = false;
  }

  function pruneSkipped(now = Date.now()) {
    for (const [id, until] of state.skippedTargetIds.entries()) {
      if (until <= now) state.skippedTargetIds.delete(id);
    }
  }

  function isSkipped(monster, now = Date.now()) {
    pruneSkipped(now);
    return !!monster?.id && (state.skippedTargetIds.get(monster.id) || 0) > now;
  }

  function skipMonster(monster, now = Date.now()) {
    if (!monster?.id) return;
    state.skippedTargetIds.set(monster.id, now + Math.max(500, Number(config.unreachableSkipMs) || 4000));
  }

  function findReachableAdjacentPosition(targetPosition, playerPosition) {
    if (!targetPosition || !playerPosition || targetPosition.z !== playerPosition.z) return null;

    const pathfinder = window.gameClient?.world?.pathfinder;
    const startTile = getTile(playerPosition);
    if (!pathfinder || !startTile || typeof pathfinder.search !== "function") return null;

    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    offsets.sort((a, b) => {
      const da = Math.abs(targetPosition.x + a.x - playerPosition.x) + Math.abs(targetPosition.y + a.y - playerPosition.y);
      const db = Math.abs(targetPosition.x + b.x - playerPosition.x) + Math.abs(targetPosition.y + b.y - playerPosition.y);
      return da - db;
    });

    for (const offset of offsets) {
      const candidate = { x: targetPosition.x + offset.x, y: targetPosition.y + offset.y, z: targetPosition.z };
      const tile = getTile(candidate);
      if (!tile?.isWalkable?.()) continue;
      if (candidate.x === playerPosition.x && candidate.y === playerPosition.y) return candidate;
      try {
        const path = pathfinder.search(startTile, tile);
        if (Array.isArray(path) && path.length > 0) return candidate;
      } catch (error) {
        bot.logDebug?.("auto target v2 reachability check failed", { targetPosition, candidate, error: error?.message || error });
      }
    }
    return null;
  }

  function getReachableCandidates(now = Date.now()) {
    const playerPosition = normalizePosition(bot.getPlayerPosition?.());
    if (!playerPosition) return [];

    return getNearbyMonsters()
      .filter((monster) => {
        if (isSkipped(monster, now)) return false;
        const targetPosition = normalizePosition(monster?.getPosition?.() || monster?.__position);
        if (!isInTargetRange(playerPosition, targetPosition)) return false;
        const reachable = findReachableAdjacentPosition(targetPosition, playerPosition);
        if (!reachable) {
          skipMonster(monster, now);
          bot.logDebug?.("auto target v2 skipped unreachable monster", {
            id: monster?.id,
            name: monster?.name || "Mob",
            position: targetPosition,
          });
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const priorityDiff = getCreaturePriorityIndex(a) - getCreaturePriorityIndex(b);
        if (Number.isFinite(priorityDiff) && priorityDiff !== 0) return priorityDiff;
        const aPriority = getCreaturePriorityIndex(a);
        const bPriority = getCreaturePriorityIndex(b);
        if (Number.isFinite(aPriority) && !Number.isFinite(bPriority)) return -1;
        if (!Number.isFinite(aPriority) && Number.isFinite(bPriority)) return 1;
        const ap = normalizePosition(a?.getPosition?.() || a?.__position);
        const bp = normalizePosition(b?.getPosition?.() || b?.__position);
        return getTileDistance(playerPosition, ap) - getTileDistance(playerPosition, bp) || Number(a?.id || 0) - Number(b?.id || 0);
      });
  }

  function setTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function" || typeof TargetPacket !== "function") return false;
    window.gameClient.player.setTarget(target);
    window.gameClient.send(new TargetPacket(target.id));
    return true;
  }

  function tryTarget(now = Date.now()) {
    if (!state.running || !config.enabled) return false;
    if (getCurrentTarget()) {
      syncCombatState(now);
      return false;
    }
    if (now - state.lastTargetAt < Math.max(0, Number(config.targetCooldownMs) || 1200)) return false;

    const target = getReachableCandidates(now)[0] || null;
    if (!target) {
      syncCombatState(now);
      return false;
    }
    if (!setTarget(target)) return false;

    state.lastTargetAt = now;
    state.combatStartedAt = now;
    bot.log("auto target v2 selected reachable target", {
      id: target.id,
      name: target.name || "Mob",
      priority: Number.isFinite(getCreaturePriorityIndex(target)) ? getCreaturePriorityIndex(target) + 1 : null,
      position: normalizePosition(target.getPosition?.() || target.__position),
    });
    return true;
  }

  function tick() {
    if (!state.running) return;
    try {
      syncCombatState();
      tryTarget();
    }
    catch (error) { bot.log("auto target v2 tick failed", error?.message || error); }
    finally {
      if (state.running) state.timerId = window.setTimeout(tick, config.tickMs);
    }
  }

  function start() {
    config.enabled = true;
    persistConfig();
    installAttackStatusBridge();
    if (bot.attack?.status?.().running) bot.attack.stop();
    if (state.running) return false;
    state.running = true;
    state.combatStartedAt = 0;
    tick();
    syncUi();
    bot.log("auto target v2 started");
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    state.combatStartedAt = 0;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    state.skippedTargetIds.clear();
    uninstallAttackStatusBridge();
    if (options.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }
    syncUi();
    bot.log("auto target v2 stopped");
    return true;
  }

  function syncUi() {
    const toggle = document.getElementById("minibia-bot-auto-target-v2-enabled");
    if (toggle) toggle.checked = state.running;
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

    const toggle = label.querySelector("#minibia-bot-auto-target-v2-enabled");
    toggle.checked = state.running;
    toggle.addEventListener("change", () => {
      if (toggle.checked) start(); else stop();
      syncUi();
      if (v1Toggle) v1Toggle.checked = !!bot.attack?.status?.().running;
    });

    v1Toggle.addEventListener("change", () => {
      if (v1Toggle.checked && state.running) stop();
    });
    return true;
  }

  let uiAttempts = 0;
  const uiTimer = window.setInterval(() => {
    uiAttempts += 1;
    if (installUi() || uiAttempts >= 80) window.clearInterval(uiTimer);
  }, 250);

  bot.addCleanup?.(() => {
    stop({ persistEnabled: false });
    window.clearInterval(uiTimer);
  });

  bot.autoTargetV2 = {
    start,
    stop,
    status: () => {
      const now = Date.now();
      const combatActive = syncCombatState(now);
      return {
        running: state.running,
        config: { ...config },
        skippedTargetIds: Array.from(state.skippedTargetIds.keys()),
        combatActive,
        combatDurationMs: combatActive ? Math.max(0, now - state.combatStartedAt) : 0,
        targetCount: combatActive ? 1 : 0,
        currentTarget: combatActive ? getCurrentTarget() : null,
      };
    },
    tryTarget,
    getReachableCandidates,
    findReachableAdjacentPosition,
    getCurrentTarget,
    getCreaturePriorityIndex,
    config,
  };

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
    if (attempts >= 120) {
      window.clearInterval(timer);
    }
  }, 250);
})();