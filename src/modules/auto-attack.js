window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackModule = function installAutoAttackModule(bot) {
  const configStorageKey = "minibiaBot.attack.config";
  const state = {
    running: false,
    timerId: null,
    targetHotkeyUiTimerId: null,
    lastTargetAt: 0,
    lastRuneHotkeyAt: 0,
    engagedTargetId: null,
    combatStartedAt: 0,
    lastChaseAt: 0,
    lastChaseDestinationKey: null,
    lastFollowTargetId: null,
    lastFollowDistance: Number.POSITIVE_INFINITY,
    lastFollowProgressAt: 0,
    lastFollowStallAt: 0,
    skippedTargetIds: new Map(),
  };

  const storedConfig = bot.storage.get(configStorageKey, {}) || {};
  const config = Object.assign(
    {
      tickMs: 300,
      runeHotbarSlot: null,
      targetCooldownMs: 1200,
      runeCooldownMs: 1200,
      maxTargetDistanceX: 7,
      maxTargetDistanceY: 5,
      meleeMode: true,
      enabled: false,
    },
    storedConfig
  );
  delete config.targetHotbarSlot;
  delete config.hotbarSlot;

  function persistConfig() {
    const { targetHotbarSlot, hotbarSlot, ...persistedConfig } = config;
    bot.storage.set(configStorageKey, persistedConfig);
  }

  function normalizeHotbarSlot(slot) {
    const value = Number(slot);
    if (!Number.isFinite(value)) return null;
    const normalized = Math.trunc(value);
    if (normalized < 1 || normalized > 12) return null;
    return normalized;
  }

  function getNearbyMonsters() {
    return bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
  }

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function getPositionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : null;
  }

  function isAdjacentTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) return false;
    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));
    return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
  }

  function getTileDistance(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(Number(from.x) - Number(to.x)), Math.abs(Number(from.y) - Number(to.y)));
  }

  function isInTargetRange(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) return false;
    const maxTargetDistanceX = Math.max(1, Number(config.maxTargetDistanceX) || 7);
    const maxTargetDistanceY = Math.max(1, Number(config.maxTargetDistanceY) || 5);
    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));
    return dx <= maxTargetDistanceX && dy <= maxTargetDistanceY;
  }

  function isSameCreature(left, right) {
    if (!left || !right) return false;
    return left === right || left.id === right.id;
  }

  function findNearbyMonster(creature) {
    if (!creature) return null;
    return getNearbyMonsters().find((monster) => isSameCreature(monster, creature)) || null;
  }

  function findNearbyMonsterById(id) {
    if (id == null) return null;
    return getNearbyMonsters().find((monster) => monster?.id === id) || null;
  }

  function getCurrentTarget() {
    return window.gameClient?.player?.__target || null;
  }

  function getCurrentFollowTarget() {
    return window.gameClient?.player?.__followTarget || null;
  }

  function pruneSkippedTargets(now = Date.now()) {
    for (const [id, expiresAt] of state.skippedTargetIds.entries()) {
      if (expiresAt <= now) state.skippedTargetIds.delete(id);
    }
  }

  function resetFollowProgress() {
    state.lastFollowTargetId = null;
    state.lastFollowDistance = Number.POSITIVE_INFINITY;
    state.lastFollowProgressAt = 0;
    state.lastFollowStallAt = 0;
  }

  function clearEngagedTarget() {
    state.engagedTargetId = null;
    state.combatStartedAt = 0;
    state.lastChaseDestinationKey = null;
    resetFollowProgress();
  }

  function clearCurrentFollowTarget() {
    return false;
  }

  function clearCurrentTarget() {
    if (!window.gameClient?.player || typeof window.gameClient.send !== "function") return false;
    if (typeof TargetPacket !== "function") return false;
    if (!getCurrentTarget()) return false;
    window.gameClient.player.setTarget(null);
    window.gameClient.send(new TargetPacket(0));
    return true;
  }

  function markCombatActive(now = Date.now()) {
    if (!state.combatStartedAt) state.combatStartedAt = now;
  }

  function getCombatTargetCount() {
    return getEngagedTarget() ? 1 : 0;
  }

  function isCombatActive() {
    if (!config.enabled || !state.running) return false;
    return !!getEngagedTarget();
  }

  function syncCombatState(now = Date.now()) {
    if (isCombatActive()) {
      markCombatActive(now);
      return true;
    }
    state.combatStartedAt = 0;
    return false;
  }

  function getEngagedTarget() {
    const currentTarget = getCurrentTarget();
    if (currentTarget) {
      state.engagedTargetId = currentTarget.id;
      return currentTarget;
    }
    if (state.engagedTargetId == null) return null;
    const followTarget = getCurrentFollowTarget();
    if (followTarget && followTarget.id === state.engagedTargetId) {
      return findNearbyMonster(followTarget) || followTarget;
    }
    const nearbyTarget = findNearbyMonsterById(state.engagedTargetId);
    if (nearbyTarget) return nearbyTarget;
    clearEngagedTarget();
    return null;
  }

  function setCurrentTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function") return false;
    if (typeof TargetPacket !== "function") return false;
    window.gameClient.player.setTarget(target);
    window.gameClient.send(new TargetPacket(target.id));
    state.engagedTargetId = target.id;
    return true;
  }

  function setCurrentFollowTarget(target) {
    return false;
  }

  function skipTarget(target, reason, now = Date.now(), skipMs = 4000) {
    if (!target?.id) return false;
    const until = now + Math.max(500, Number(skipMs) || 0);
    state.skippedTargetIds.set(target.id, until);
    const clearedTarget = isSameCreature(getCurrentTarget(), target) ? clearCurrentTarget() : false;
    const clearedFollow = false;
    if (state.engagedTargetId === target.id) clearEngagedTarget();
    else if (state.lastFollowTargetId === target.id) resetFollowProgress();
    bot.log("skipping auto attack target", {
      id: target.id,
      name: target.name || "Mob",
      reason,
      skippedForMs: Math.max(500, Number(skipMs) || 0),
      clearedTarget,
      clearedFollow,
    });
    return true;
  }

  function isTargetSkipped(target, now = Date.now()) {
    pruneSkippedTargets(now);
    return !!target?.id && (state.skippedTargetIds.get(target.id) || 0) > now;
  }

  function getMonsterCandidates(now = Date.now()) {
    pruneSkippedTargets(now);
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    return getNearbyMonsters()
      .filter((monster) => {
        if (isTargetSkipped(monster, now)) return false;
        const monsterPosition = normalizePosition(monster?.getPosition?.() || monster?.__position);
        return isInTargetRange(playerPosition, monsterPosition);
      })
      .sort((left, right) => {
        const leftDistance = getTileDistance(playerPosition, normalizePosition(left?.getPosition?.() || left?.__position));
        const rightDistance = getTileDistance(playerPosition, normalizePosition(right?.getPosition?.() || right?.__position));
        return leftDistance - rightDistance || Number(left?.id || 0) - Number(right?.id || 0);
      });
  }

  function shouldGiveUpTarget(target) {
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target?.getPosition?.() || target?.__position);
    if (!playerPosition || !targetPosition) return false;
    return !isInTargetRange(playerPosition, targetPosition);
  }

  function isPriorityTargetingActive() {
    const priority = bot.attackPriority;
    if (!priority) return false;
    const priorityConfig = priority.config || priority.status?.().config || {};
    return priorityConfig.highestHpEnabled === true ||
      (priorityConfig.enabled !== false && Array.isArray(priorityConfig.creatureNames) && priorityConfig.creatureNames.length > 0);
  }

  function resetTargetIfTooFar() {
    if (!isPriorityTargetingActive()) return false;
    const currentTarget = getCurrentTarget();
    if (currentTarget && shouldGiveUpTarget(currentTarget)) {
      skipTarget(currentTarget, "target outside rectangular range", Date.now(), 2500);
      bot.log("gave up distant auto attack target", {
        id: currentTarget.id,
        name: currentTarget.name || "Mob",
        position: normalizePosition(currentTarget.getPosition?.() || currentTarget.__position),
        maxTargetDistanceX: Math.max(1, Number(config.maxTargetDistanceX) || 7),
        maxTargetDistanceY: Math.max(1, Number(config.maxTargetDistanceY) || 5),
      });
      return true;
    }
    const engagedTarget = getEngagedTarget();
    if (engagedTarget && shouldGiveUpTarget(engagedTarget)) {
      skipTarget(engagedTarget, "engaged target outside rectangular range", Date.now(), 2500);
      bot.log("gave up distant auto attack target", {
        id: engagedTarget.id,
        name: engagedTarget.name || "Mob",
        position: normalizePosition(engagedTarget.getPosition?.() || engagedTarget.__position),
        maxTargetDistanceX: Math.max(1, Number(config.maxTargetDistanceX) || 7),
        maxTargetDistanceY: Math.max(1, Number(config.maxTargetDistanceY) || 5),
      });
      return true;
    }
    return false;
  }

  function getTileFromPosition(position) {
    if (!position || typeof Position !== "function") return null;
    return window.gameClient?.world?.getTileFromWorldPosition?.(new Position(position.x, position.y, position.z)) || null;
  }

  function findReachableAdjacentPosition(targetPosition, playerPosition) {
    if (!targetPosition || !playerPosition) return null;
    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];
    offsets.sort((a, b) => {
      const da = Math.abs(targetPosition.x + a.x - playerPosition.x) + Math.abs(targetPosition.y + a.y - playerPosition.y);
      const db = Math.abs(targetPosition.x + b.x - playerPosition.x) + Math.abs(targetPosition.y + b.y - playerPosition.y);
      return da - db;
    });
    const pathfinder = window.gameClient?.world?.pathfinder;
    const startTile = getTileFromPosition(playerPosition);
    if (!pathfinder || !startTile || typeof pathfinder.search !== "function") return null;
    for (const offset of offsets) {
      const candidatePosition = { x: targetPosition.x + offset.x, y: targetPosition.y + offset.y, z: targetPosition.z };
      const tile = getTileFromPosition(candidatePosition);
      if (!tile?.isWalkable?.()) continue;
      if (candidatePosition.x === playerPosition.x && candidatePosition.y === playerPosition.y) return candidatePosition;
      try {
        const path = pathfinder.search(startTile, tile);
        if (Array.isArray(path) && path.length > 0) return candidatePosition;
      } catch (error) {
        bot.log("auto attack reachability check failed", { ...candidatePosition, error: error?.message || error });
        return null;
      }
    }
    return null;
  }

  function syncMeleeChase(now = Date.now()) {
    if (!config.meleeMode) return false;
    const target = getEngagedTarget();
    if (!target) { clearEngagedTarget(); return false; }
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target.getPosition?.() || target.__position);
    if (!playerPosition || !targetPosition || playerPosition.z !== targetPosition.z) {
      bot.logDebug("auto attack chase target on different floor", { targetId: target.id, targetName: target.name || "Mob", playerZ: playerPosition?.z, targetZ: targetPosition?.z });
      return false;
    }
    if (!findNearbyMonster(target)) {
      bot.logDebug("auto attack chase target no longer nearby", { targetId: target.id, targetName: target.name || "Mob" });
      clearEngagedTarget();
      return false;
    }
    if (isAdjacentTile(playerPosition, targetPosition)) {
      state.lastChaseDestinationKey = null;
      resetFollowProgress();
      return false;
    }
    bot.logDebug("auto attack chase delegated to game", { targetId: target.id, targetName: target.name || "Mob", distance: getTileDistance(playerPosition, targetPosition) });
    return false;
  }

  function canAttack(now = Date.now()) {
    if (now - state.lastTargetAt < Math.max(0, Number(config.targetCooldownMs) || 0)) return false;
    if (getCurrentTarget() || state.engagedTargetId != null) return false;
    return getMonsterCandidates(now).length > 0;
  }

  function triggerAttack(now = Date.now()) {
    if (!canAttack(now)) return false;

    const priorityTarget = bot.attackPriority?.getPreferredTarget?.() || null;
    const candidates = getMonsterCandidates(now);
    const preferredTarget = priorityTarget && !isTargetSkipped(priorityTarget, now)
      ? priorityTarget
      : candidates[0];
    if (!preferredTarget) return false;

    const selected = setCurrentTarget(preferredTarget);
    if (selected) {
      state.lastTargetAt = now;
      bot.log("auto attack selected target", {
        id: preferredTarget.id,
        name: preferredTarget.name || "Mob",
        reason: priorityTarget && isSameCreature(priorityTarget, preferredTarget) ? "creature priority" : "nearest candidate",
      });
    }
    return selected;
  }

  function canUseRune(now = Date.now()) {
    if (!getCurrentTarget()) return false;
    if (now - state.lastRuneHotkeyAt < Math.max(0, Number(config.runeCooldownMs) || 0)) return false;
    if (bot.gfb?.status?.().reservedByPriority) return false;
    return normalizeHotbarSlot(config.runeHotbarSlot) != null;
  }

  function triggerRune(now = Date.now()) {
    if (!canUseRune(now)) return false;
    const slot = normalizeHotbarSlot(config.runeHotbarSlot);
    if (slot == null) return false;
    const hotbar = window.gameClient?.hotbar;
    const click = hotbar?.useHotbarSlot || hotbar?.useSlot || hotbar?.clickSlot;
    if (typeof click !== "function") return false;
    click.call(hotbar, slot);
    state.lastRuneHotkeyAt = now;
    return true;
  }

  function tryAttack() {
    if (!config.enabled || !state.running) return;
    const now = Date.now();
    resetTargetIfTooFar();
    syncCombatState(now);
    if (config.meleeMode) {
      syncMeleeChase(now);
      if (getCurrentTarget()) triggerRune(now);
    } else if (getCurrentTarget()) {
      triggerRune(now);
    }
    triggerAttack(now);
  }

  function scheduleNextTick() {
    if (!state.running) return;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = window.setTimeout(() => {
      state.timerId = null;
      tryAttack();
      scheduleNextTick();
    }, Math.max(50, Number(config.tickMs) || 300));
  }

  function start() {
    if (state.running) return true;
    state.running = true;
    config.enabled = true;
    persistConfig();
    scheduleNextTick();
    return true;
  }

  function stop() {
    state.running = false;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    clearEngagedTarget();
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      currentTarget: getCurrentTarget() ? { id: getCurrentTarget().id, name: getCurrentTarget().name } : null,
      engagedTarget: getEngagedTarget() ? { id: getEngagedTarget().id, name: getEngagedTarget().name } : null,
    };
  }

  bot.attack = bot.attack || {};
  bot.attack.config = config;
  bot.attack.start = start;
  bot.attack.stop = stop;
  bot.attack.status = status;
  bot.addCleanup(stop);
  return bot.attack;
};
