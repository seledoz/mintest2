window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackModule = function installAutoAttackModule(bot) {
  const configStorageKey = "minibiaBot.attack.config";
  const state = {
    running: false,
    timerId: null,
    lastTargetHotkeyAt: 0,
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
      targetHotbarSlot: 3,
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
  if (config.targetHotbarSlot == null && storedConfig.hotbarSlot != null) {
    config.targetHotbarSlot = storedConfig.hotbarSlot;
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeHotbarSlot(slot) {
    const value = Number(slot);
    if (!Number.isFinite(value)) return null;
    const normalized = Math.trunc(value);
    return normalized >= 1 && normalized <= 12 ? normalized : null;
  }

  function getNearbyMonsters() { return bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []; }

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
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

  function isSameCreature(left, right) { return !!left && !!right && (left === right || left.id === right.id); }
  function findNearbyMonster(creature) { return creature ? getNearbyMonsters().find((monster) => isSameCreature(monster, creature)) || null : null; }
  function findNearbyMonsterById(id) { return id == null ? null : getNearbyMonsters().find((monster) => monster?.id === id) || null; }
  function getCurrentTarget() { return window.gameClient?.player?.__target || null; }
  function getCurrentFollowTarget() { return window.gameClient?.player?.__followTarget || null; }

  function pruneSkippedTargets(now = Date.now()) {
    for (const [id, expiresAt] of state.skippedTargetIds.entries()) if (expiresAt <= now) state.skippedTargetIds.delete(id);
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

  function clearCurrentTarget() {
    if (!window.gameClient?.player || typeof window.gameClient.send !== "function" || typeof TargetPacket !== "function" || !getCurrentTarget()) return false;
    window.gameClient.player.setTarget(null);
    window.gameClient.send(new TargetPacket(0));
    return true;
  }

  function markCombatActive(now = Date.now()) { if (!state.combatStartedAt) state.combatStartedAt = now; }
  function getCombatTargetCount() { return getEngagedTarget() ? 1 : 0; }
  function isCombatActive() { return !!(config.enabled && state.running && getEngagedTarget()); }

  function syncCombatState(now = Date.now()) {
    if (isCombatActive()) { markCombatActive(now); return true; }
    state.combatStartedAt = 0;
    return false;
  }

  function getEngagedTarget() {
    const currentTarget = getCurrentTarget();
    if (currentTarget) { state.engagedTargetId = currentTarget.id; return currentTarget; }
    if (state.engagedTargetId == null) return null;
    const followTarget = getCurrentFollowTarget();
    if (followTarget && followTarget.id === state.engagedTargetId) return findNearbyMonster(followTarget) || followTarget;
    const nearbyTarget = findNearbyMonsterById(state.engagedTargetId);
    if (nearbyTarget) return nearbyTarget;
    clearEngagedTarget();
    return null;
  }

  function setCurrentTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function" || typeof TargetPacket !== "function") return false;
    window.gameClient.player.setTarget(target);
    window.gameClient.send(new TargetPacket(target.id));
    state.engagedTargetId = target.id;
    return true;
  }

  function skipTarget(target, reason, now = Date.now(), skipMs = 4000) {
    if (!target?.id) return false;
    const until = now + Math.max(500, Number(skipMs) || 0);
    state.skippedTargetIds.set(target.id, until);
    const clearedTarget = isSameCreature(getCurrentTarget(), target) ? clearCurrentTarget() : false;
    if (state.engagedTargetId === target.id) clearEngagedTarget();
    else if (state.lastFollowTargetId === target.id) resetFollowProgress();
    bot.log("skipping auto attack target", { id: target.id, name: target.name || "Mob", reason, skippedForMs: Math.max(500, Number(skipMs) || 0), clearedTarget, clearedFollow: false });
    return true;
  }

  function isTargetSkipped(target, now = Date.now()) { pruneSkippedTargets(now); return !!target?.id && (state.skippedTargetIds.get(target.id) || 0) > now; }

  function getMonsterCandidates(now = Date.now()) {
    pruneSkippedTargets(now);
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    return getNearbyMonsters().filter((monster) => {
      if (isTargetSkipped(monster, now)) return false;
      return isInTargetRange(playerPosition, normalizePosition(monster?.getPosition?.() || monster?.__position));
    }).sort((left, right) => {
      const leftDistance = getTileDistance(playerPosition, normalizePosition(left?.getPosition?.() || left?.__position));
      const rightDistance = getTileDistance(playerPosition, normalizePosition(right?.getPosition?.() || right?.__position));
      return leftDistance - rightDistance || Number(left?.id || 0) - Number(right?.id || 0);
    });
  }

  function shouldGiveUpTarget(target) {
    return !isInTargetRange(normalizePosition(bot.getPlayerPosition()), normalizePosition(target?.getPosition?.() || target?.__position));
  }

  function resetTargetIfTooFar() {
    const currentTarget = getCurrentTarget();
    if (currentTarget && shouldGiveUpTarget(currentTarget)) { skipTarget(currentTarget, "target outside rectangular range", Date.now(), 2500); return true; }
    const engagedTarget = getEngagedTarget();
    if (engagedTarget && shouldGiveUpTarget(engagedTarget)) { skipTarget(engagedTarget, "engaged target outside rectangular range", Date.now(), 2500); return true; }
    return false;
  }

  function syncMeleeChase() { return false; }

  function canAttack(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.targetHotbarSlot);
    if (!slot) return false;
    if (now - state.lastTargetHotkeyAt < Math.max(0, Number(config.targetCooldownMs) || 0)) return false;
    if (config.meleeMode) return getMonsterCandidates(now).length > 0 && !getCurrentTarget();
    return getMonsterCandidates(now).length > 0;
  }

  function triggerAttack(now = Date.now()) {
    if (!canAttack(now)) return false;
    const engagedTarget = getEngagedTarget();
    const preferredTarget = engagedTarget && !isTargetSkipped(engagedTarget, now) && !shouldGiveUpTarget(engagedTarget) ? engagedTarget : (getMonsterCandidates(now)[0] || null);
    if (preferredTarget && setCurrentTarget(preferredTarget)) {
      state.lastTargetHotkeyAt = now;
      markCombatActive(now);
      bot.log("selected auto attack target", { id: preferredTarget.id, name: preferredTarget.name || "Mob", reason: isSameCreature(preferredTarget, engagedTarget) ? "engaged target" : "nearest candidate" });
      return true;
    }
    if (config.meleeMode) return false;
    const slot = normalizeHotbarSlot(config.targetHotbarSlot);
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) { state.lastTargetHotkeyAt = now; markCombatActive(now); }
    return clicked;
  }

  function gfbHasPriority() {
    try { return !!bot.attackGfb?.shouldReservePriority?.(); } catch (_error) { return false; }
  }

  function canUseRune(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.runeHotbarSlot);
    if (!slot || !getCurrentTarget() || gfbHasPriority()) return false;
    if (now - state.lastRuneHotkeyAt < Math.max(0, Number(config.runeCooldownMs) || 0)) return false;
    return true;
  }

  function triggerRune(now = Date.now()) {
    if (!canUseRune(now)) return false;
    const slot = normalizeHotbarSlot(config.runeHotbarSlot);
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      state.lastRuneHotkeyAt = now;
      markCombatActive(now);
      bot.log("used auto attack rune hotkey", { slot, target: getCurrentTarget()?.name || "Mob" });
    }
    return clicked;
  }

  function tryAttack() {
    if (!config.enabled) return false;
    const now = Date.now();
    if (resetTargetIfTooFar()) return true;
    syncCombatState(now);
    if (config.meleeMode) {
      syncMeleeChase(now);
      if (getCurrentTarget()) return triggerRune(now);
    }
    if (getCurrentTarget()) return triggerRune(now);
    return triggerAttack(now);
  }

  function scheduleNextTick() { if (state.running) state.timerId = window.setTimeout(tick, config.tickMs); }
  function tick() {
    if (!state.running) return;
    try { tryAttack(); } catch (error) { bot.log("auto attack tick failed", error?.message || error); } finally { scheduleNextTick(); }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) return false;
    state.running = true;
    tick();
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    if (options.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    clearEngagedTarget();
    state.lastChaseAt = 0;
    state.skippedTargetIds.clear();
    return true;
  }

  function status() {
    const combatActive = syncCombatState(Date.now());
    return {
      running: state.running,
      config: { ...config },
      lastTargetHotkeyAt: state.lastTargetHotkeyAt,
      lastRuneHotkeyAt: state.lastRuneHotkeyAt,
      engagedTargetId: state.engagedTargetId,
      combatActive,
      combatStartedAt: state.combatStartedAt || 0,
      combatDurationMs: state.combatStartedAt ? Math.max(0, Date.now() - state.combatStartedAt) : 0,
      targetCount: getCombatTargetCount(),
      lastChaseAt: state.lastChaseAt,
      currentTarget: getCurrentTarget() ? { id: getCurrentTarget().id, name: getCurrentTarget().name, type: getCurrentTarget().type, position: getCurrentTarget().__position || null } : null,
      nearbyMonsters: getMonsterCandidates().map((creature) => ({ id: creature.id, name: creature.name, type: creature.type, position: creature.__position || null })),
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "targetHotbarSlot")) nextConfig.targetHotbarSlot = normalizeHotbarSlot(nextConfig.targetHotbarSlot) ?? config.targetHotbarSlot;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "runeHotbarSlot")) nextConfig.runeHotbarSlot = normalizeHotbarSlot(nextConfig.runeHotbarSlot);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxTargetDistance")) {
      const legacyDistance = Math.max(1, Math.trunc(Number(nextConfig.maxTargetDistance) || 0));
      nextConfig.maxTargetDistanceX = legacyDistance;
      nextConfig.maxTargetDistanceY = legacyDistance;
      delete nextConfig.maxTargetDistance;
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxTargetDistanceX")) nextConfig.maxTargetDistanceX = Math.max(1, Math.trunc(Number(nextConfig.maxTargetDistanceX) || config.maxTargetDistanceX || 7));
    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxTargetDistanceY")) nextConfig.maxTargetDistanceY = Math.max(1, Math.trunc(Number(nextConfig.maxTargetDistanceY) || config.maxTargetDistanceY || 5));
    Object.assign(config, nextConfig);
    persistConfig();
    return { ...config };
  }

  if (config.enabled) start();
  bot.addCleanup(() => { stop({ persistEnabled: false }); });
  bot.attack = { start, stop, status, updateConfig, tryAttack, canAttack, triggerAttack, canUseRune, triggerRune, getNearbyMonsters, getCurrentTarget, getCurrentFollowTarget, isCombatActive, syncMeleeChase, normalizeHotbarSlot, config };
};
