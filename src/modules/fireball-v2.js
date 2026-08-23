window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installFireballV2Module = function installFireballV2Module(bot) {
  if (!bot || bot.fireballV2?.destroy) return bot?.fireballV2;

  const configStorageKey = "minibiaBot.fireballV2.config";
  const sectionId = "minibia-bot-fireball-v2-section";
  const state = {
    running: false,
    timerId: null,
    uiTimerId: null,
    lastCastAt: 0,
    lastMonsterCount: 0,
    lastTargetName: "",
    lastTargetPosition: null,
    currentBest: null,
    motion: new Map(),
    objectIds: new WeakMap(),
    nextObjectId: 1,
  };
  const config = Object.assign({
    enabled: false,
    highestPriority: false,
    hotbarSlot: null,
    minMonsters: 4,
    cooldownMs: 2000,
    scanMs: 100,
    maxRange: 7,
    respectTargetFilters: true,
    predictionLeadTiles: 1,
    predictionMinConsistentMoves: 2,
    predictionFreshMs: 450,
  }, bot.storage.get(configStorageKey, {}) || {});

  function normalizeHotbarSlot(value) { const slot = Math.trunc(Number(value)); return Number.isFinite(slot) && slot >= 1 && slot <= 12 ? slot : null; }
  function positiveInt(value, fallback) { const number = Math.trunc(Number(value)); return Number.isFinite(number) && number > 0 ? number : fallback; }
  function nonNegativeInt(value, fallback) { const number = Math.trunc(Number(value)); return Number.isFinite(number) && number >= 0 ? number : fallback; }
  function normalizeName(value) { return String(value || "").trim().toLowerCase(); }
  function getPosition(value) {
    const raw = value?.getPosition?.() || value?.__position || value?.position || value;
    if (!raw) return null;
    const x = Number(raw.x), y = Number(raw.y), z = Number(raw.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) } : null;
  }
  function tileDistance(left, right) {
    if (!left || !right || Number(left.z) !== Number(right.z)) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(Number(left.x) - Number(right.x)), Math.abs(Number(left.y) - Number(right.y)));
  }
  function positionKey(position) { return position ? `${position.x},${position.y},${position.z}` : ""; }
  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }

  config.enabled = !!config.enabled;
  config.highestPriority = !!config.highestPriority;
  config.hotbarSlot = normalizeHotbarSlot(config.hotbarSlot);
  config.minMonsters = positiveInt(config.minMonsters, 4);
  config.cooldownMs = nonNegativeInt(config.cooldownMs, 2000);
  config.scanMs = Math.max(100, positiveInt(config.scanMs, 100));
  config.maxRange = Math.min(7, positiveInt(config.maxRange, 7));
  config.respectTargetFilters = config.respectTargetFilters !== false;
  config.predictionLeadTiles = Math.min(2, positiveInt(config.predictionLeadTiles, 1));
  config.predictionMinConsistentMoves = Math.max(2, Math.min(4, positiveInt(config.predictionMinConsistentMoves, 2)));
  config.predictionFreshMs = Math.max(250, positiveInt(config.predictionFreshMs, 450));

  function passesTargetFilters(monster) {
    if (!config.respectTargetFilters) return true;
    const attackConfig = bot.attack?.config || {};
    const mode = ["include", "exclude"].includes(attackConfig.targetFilterMode) ? attackConfig.targetFilterMode : "all";
    const name = normalizeName(monster?.name || "Mob");
    const included = new Set((attackConfig.includedCreatureNames || []).map(normalizeName));
    const excluded = new Set((attackConfig.excludedCreatureNames || []).map(normalizeName));
    if (excluded.has(name)) return false;
    if (mode === "include" && included.size) return included.has(name);
    return true;
  }

  function getVisibleMonsters() {
    return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []).filter(passesTargetFilters);
  }

  function getCreatureKey(monster) {
    const explicitId = monster?.id ?? monster?.creatureId ?? monster?.__id ?? monster?.getId?.();
    if (explicitId != null && String(explicitId) !== "") return `id:${explicitId}`;
    if (monster && (typeof monster === "object" || typeof monster === "function")) {
      let token = state.objectIds.get(monster);
      if (!token) {
        token = state.nextObjectId++;
        state.objectIds.set(monster, token);
      }
      return `obj:${token}`;
    }
    return `name:${normalizeName(monster?.name || "mob")}`;
  }

  function updateMotion(monsters, now = Date.now()) {
    const seen = new Set();
    monsters.forEach((monster) => {
      const position = getPosition(monster);
      if (!position) return;
      const key = getCreatureKey(monster);
      seen.add(key);
      let motion = state.motion.get(key);
      if (!motion || motion.position?.z !== position.z) {
        motion = { position, direction: null, consistentMoves: 0, lastMoveAt: 0, lastSeenAt: now };
        state.motion.set(key, motion);
        return;
      }

      const dx = position.x - motion.position.x;
      const dy = position.y - motion.position.y;
      if (dx !== 0 || dy !== 0) {
        const stepDistance = Math.max(Math.abs(dx), Math.abs(dy));
        const direction = stepDistance === 1 ? { x: Math.sign(dx), y: Math.sign(dy) } : null;
        if (direction) {
          const sameDirection = motion.direction && motion.direction.x === direction.x && motion.direction.y === direction.y;
          motion.consistentMoves = sameDirection ? motion.consistentMoves + 1 : 1;
          motion.direction = direction;
        } else {
          motion.direction = null;
          motion.consistentMoves = 0;
        }
        motion.lastMoveAt = now;
        motion.position = position;
      }
      motion.lastSeenAt = now;
    });

    for (const [key, motion] of state.motion.entries()) {
      if (!seen.has(key) && now - motion.lastSeenAt > 1500) state.motion.delete(key);
    }
  }

  function getPredictedPosition(monster, now = Date.now()) {
    const actual = getPosition(monster);
    if (!actual) return { actual: null, predicted: null, confident: false };
    const motion = state.motion.get(getCreatureKey(monster));
    const fresh = motion?.lastMoveAt > 0 && now - motion.lastMoveAt <= config.predictionFreshMs;
    const confident = !!motion?.direction && fresh && motion.consistentMoves >= config.predictionMinConsistentMoves;
    if (!confident) return { actual, predicted: actual, confident: false };
    const predicted = {
      x: actual.x + motion.direction.x * config.predictionLeadTiles,
      y: actual.y + motion.direction.y * config.predictionLeadTiles,
      z: actual.z,
    };
    if (!getTile(predicted)) return { actual, predicted: actual, confident: false };
    return { actual, predicted, confident: true };
  }

  function getFireballTiles(centerPosition) {
    if (!centerPosition) return [];
    const rowWidths = [1, 3, 5, 3, 1];
    const tiles = [];
    rowWidths.forEach((width, row) => {
      const half = Math.floor(width / 2);
      const yOffset = row - 2;
      for (let xOffset = -half; xOffset <= half; xOffset += 1) {
        tiles.push({ x: centerPosition.x + xOffset, y: centerPosition.y + yOffset, z: centerPosition.z });
      }
    });
    return tiles;
  }

  function evaluateAtPosition(centerPosition, trackedMonsters) {
    const tileKeys = new Set(getFireballTiles(centerPosition).map(positionKey));
    const hits = trackedMonsters.filter((entry) => entry.predicted && entry.predicted.z === centerPosition.z && tileKeys.has(positionKey(entry.predicted)));
    const actualHits = trackedMonsters.filter((entry) => entry.actual && entry.actual.z === centerPosition.z && tileKeys.has(positionKey(entry.actual))).length;
    return {
      position: centerPosition,
      count: hits.length,
      actualCount: actualHits,
      predictionCount: hits.filter((entry) => entry.confident).length,
      monsters: hits.map((entry) => entry.monster),
      target: hits[0]?.monster || null,
    };
  }

  function calculateBestCandidate(now = Date.now()) {
    const playerPosition = getPosition(bot.getPlayerPosition?.());
    if (!playerPosition) return null;
    const monsters = getVisibleMonsters().filter((monster) => {
      const position = getPosition(monster);
      return position && position.z === playerPosition.z && tileDistance(playerPosition, position) <= config.maxRange;
    });
    if (!monsters.length) return null;

    updateMotion(monsters, now);
    const trackedMonsters = monsters.map((monster) => ({ monster, ...getPredictedPosition(monster, now) })).filter((entry) => entry.predicted);
    const predictedPositions = new Map();
    trackedMonsters.forEach((entry) => predictedPositions.set(positionKey(entry.predicted), entry.predicted));

    const candidates = new Map();
    predictedPositions.forEach((monsterPosition) => {
      getFireballTiles({ x: 0, y: 0, z: monsterPosition.z }).forEach((offsetTile) => {
        const center = { x: monsterPosition.x - offsetTile.x, y: monsterPosition.y - offsetTile.y, z: monsterPosition.z };
        if (tileDistance(playerPosition, center) > config.maxRange) return;
        if (!getTile(center)) return;
        candidates.set(positionKey(center), center);
      });
    });

    const evaluations = Array.from(candidates.values()).map((position) => ({
      ...evaluateAtPosition(position, trackedMonsters),
      occupiedByPredictedMonster: predictedPositions.has(positionKey(position)),
    }));
    evaluations.sort((left, right) =>
      right.count - left.count ||
      right.actualCount - left.actualCount ||
      right.predictionCount - left.predictionCount ||
      Number(right.occupiedByPredictedMonster) - Number(left.occupiedByPredictedMonster) ||
      tileDistance(playerPosition, left.position) - tileDistance(playerPosition, right.position)
    );
    return evaluations[0] || null;
  }

  function getBestCandidate() { return state.running && config.enabled ? (state.currentBest || calculateBestCandidate()) : null; }
  function shouldReservePriority() {
    if (!state.running || !config.enabled || !config.highestPriority || !normalizeHotbarSlot(config.hotbarSlot)) return false;
    const best = state.currentBest || calculateBestCandidate();
    return !!best && best.count >= config.minMonsters;
  }
  function getSquare2Slot() {
    try { const saved = JSON.parse(window.localStorage.getItem("minibiaBot.attackAoe.square2.config") || "{}"); return normalizeHotbarSlot(saved.hotbarSlot); } catch (_) { return null; }
  }
  function getBlockedSlots() {
    const slots = new Set();
    [bot.attack?.config?.runeHotbarSlot, bot.attackAoe?.config?.spellHotbarSlot, getSquare2Slot(), bot.greatFireballV2?.config?.hotbarSlot, bot.fireball?.config?.hotbarSlot].forEach((slot) => {
      const normalized = normalizeHotbarSlot(slot);
      if (normalized) slots.add(normalized);
    });
    return slots;
  }
  function patchClickHotbar() {
    if (!bot.clickHotbar || bot.__fireballV2PriorityPatched) return;
    const originalClickHotbar = bot.clickHotbar.bind(bot);
    bot.clickHotbar = function clickHotbarWithFireballV2Priority(index, ...args) {
      const attemptedSlot = Math.trunc(Number(index)) + 1;
      const fireballV2Slot = normalizeHotbarSlot(config.hotbarSlot);
      const originalFireballSlot = normalizeHotbarSlot(bot.fireball?.config?.hotbarSlot);
      if (attemptedSlot === fireballV2Slot && originalFireballSlot !== fireballV2Slot && bot.fireball?.shouldReservePriority?.()) {
        bot.logDebug?.("blocked Fireball 2.0 cast for original Fireball priority", { slot: attemptedSlot, originalFireballSlot });
        return false;
      }
      if (shouldReservePriority() && attemptedSlot !== fireballV2Slot && getBlockedSlots().has(attemptedSlot)) {
        bot.logDebug?.("blocked lower-priority cast for Fireball 2.0", { slot: attemptedSlot, fireballV2Slot });
        return false;
      }
      return originalClickHotbar(index, ...args);
    };
    bot.__fireballV2PriorityPatched = true;
  }

  function getTile(position) {
    if (!position) return null;
    try {
      const worldPosition = typeof Position === "function" ? new Position(position.x, position.y, position.z) : position;
      return window.gameClient?.world?.getTileFromWorldPosition?.(worldPosition) || null;
    } catch (_) { return null; }
  }

  function fireCrosshairAt(best) {
    const slot = normalizeHotbarSlot(config.hotbarSlot);
    if (!slot || !best?.position || !bot.clickHotbar?.(slot - 1)) return false;
    const tile = getTile(best.position);
    const target = best.target || best.monsters?.[0] || null;
    const mouse = window.gameClient?.mouse;
    const targetRef = tile ? { which: tile, index: 0xFF } : target ? { which: target, index: 0xFF } : null;
    try { if (targetRef && typeof mouse?.__handleItemUseWith === "function") { mouse.__handleItemUseWith(null, targetRef); return true; } } catch (_) {}
    try { if (targetRef && typeof mouse?.__handleThingUse === "function") { mouse.__handleThingUse(targetRef); return true; } } catch (_) {}
    try { if (tile && typeof mouse?.__handleTileClick === "function") { mouse.__handleTileClick(tile); return true; } } catch (_) {}
    try { if (target && typeof mouse?.__handleCreatureClick === "function") { mouse.__handleCreatureClick(target); return true; } } catch (_) {}
    bot.log("fireball 2.0 could not click crosshair target", { position: best.position, target: target?.name || "Mob" });
    return false;
  }

  function canCast(now = Date.now(), best = state.currentBest) {
    if (!state.running || !config.enabled || !normalizeHotbarSlot(config.hotbarSlot)) return false;
    if (now - state.lastCastAt < config.cooldownMs) return false;
    return !!best && best.count >= config.minMonsters;
  }

  function trigger(now = Date.now()) {
    if (!state.running || !config.enabled) return false;
    const best = state.currentBest || calculateBestCandidate(now);
    state.currentBest = best;
    if (!canCast(now, best)) return false;
    const fired = fireCrosshairAt(best);
    if (fired) {
      state.lastCastAt = now;
      state.lastMonsterCount = best.count;
      state.lastTargetName = best.target?.name || best.monsters?.[0]?.name || "Mob";
      state.lastTargetPosition = best.position;
      bot.log("used Fireball 2.0 with movement prediction", {
        slot: config.hotbarSlot,
        monsterCount: best.count,
        predictedTargets: best.predictionCount || 0,
        target: state.lastTargetName,
        position: best.position,
        minimum: config.minMonsters,
      });
    }
    refreshUi();
    return fired;
  }

  function tick() {
    if (!state.running || !config.enabled) return;
    try { state.currentBest = calculateBestCandidate(); trigger(); } catch (error) { bot.log("fireball 2.0 tick failed", error?.message || error); }
    if (state.running && config.enabled) state.timerId = window.setTimeout(tick, config.scanMs);
  }

  function stopUiTimer() { if (state.uiTimerId != null) window.clearInterval(state.uiTimerId); state.uiTimerId = null; }
  function startUiTimer() {
    if (!state.running || !config.enabled || state.uiTimerId != null) return;
    state.uiTimerId = window.setInterval(refreshUi, 1000);
  }
  function start(overrides = {}) {
    updateConfig({ ...overrides, enabled: true }, { silent: true });
    if (state.running) { startUiTimer(); return false; }
    state.running = true;
    state.currentBest = null;
    state.motion.clear();
    tick();
    startUiTimer();
    refreshUi();
    return true;
  }
  function stop(options = {}) {
    state.running = false;
    state.currentBest = null;
    state.motion.clear();
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    stopUiTimer();
    if (options.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    refreshUi();
    return true;
  }
  function updateConfig(nextConfig = {}, options = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) nextConfig.enabled = !!nextConfig.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "highestPriority")) nextConfig.highestPriority = !!nextConfig.highestPriority;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "hotbarSlot")) nextConfig.hotbarSlot = normalizeHotbarSlot(nextConfig.hotbarSlot);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMonsters")) nextConfig.minMonsters = positiveInt(nextConfig.minMonsters, config.minMonsters || 4);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "cooldownMs")) nextConfig.cooldownMs = nonNegativeInt(nextConfig.cooldownMs, config.cooldownMs || 2000);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "scanMs")) nextConfig.scanMs = Math.max(100, positiveInt(nextConfig.scanMs, config.scanMs || 100));
    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxRange")) nextConfig.maxRange = Math.min(7, positiveInt(nextConfig.maxRange, config.maxRange || 7));
    if (Object.prototype.hasOwnProperty.call(nextConfig, "respectTargetFilters")) nextConfig.respectTargetFilters = nextConfig.respectTargetFilters !== false;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "predictionLeadTiles")) nextConfig.predictionLeadTiles = Math.min(2, positiveInt(nextConfig.predictionLeadTiles, config.predictionLeadTiles || 1));
    if (Object.prototype.hasOwnProperty.call(nextConfig, "predictionMinConsistentMoves")) nextConfig.predictionMinConsistentMoves = Math.max(2, Math.min(4, positiveInt(nextConfig.predictionMinConsistentMoves, config.predictionMinConsistentMoves || 2)));
    if (Object.prototype.hasOwnProperty.call(nextConfig, "predictionFreshMs")) nextConfig.predictionFreshMs = Math.max(250, positiveInt(nextConfig.predictionFreshMs, config.predictionFreshMs || 450));
    Object.assign(config, nextConfig);
    persistConfig();
    if (!config.enabled) { state.currentBest = null; state.motion.clear(); stopUiTimer(); } else if (state.running) { startUiTimer(); }
    if (!options.silent) refreshUi();
    return { ...config };
  }
  function status() {
    const best = state.running && config.enabled ? (state.currentBest || calculateBestCandidate()) : null;
    return {
      running: state.running,
      config: { ...config },
      bestMonsterCount: best?.count || 0,
      predictedTargets: best?.predictionCount || 0,
      bestTargetName: best?.target?.name || "",
      bestTargetPosition: best?.position || null,
      lastMonsterCount: state.lastMonsterCount,
      lastTargetName: state.lastTargetName,
      lastTargetPosition: state.lastTargetPosition,
      priorityReserved: shouldReservePriority(),
      ready: canCast(Date.now(), best),
    };
  }

  function ensureUi() {
    const originalSection = document.getElementById("minibia-bot-fireball-section");
    const aoeSection = document.getElementById("minibia-bot-auto-attack-aoe-section");
    if (!originalSection && !aoeSection) return false;
    if (document.getElementById(sectionId)) return true;
    const section = document.createElement("div");
    section.id = sectionId;
    section.className = "mb-section";
    section.innerHTML = `<div class="mb-label">Fireball 2.0 — Movement Prediction</div><label class="mb-toggle"><input type="checkbox" id="minibia-bot-fireball-v2-enabled" /><span>Enable Fireball 2.0</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-fireball-v2-highest-priority" /><span>Fireball 2.0 Highest Priority</span></label><div class="mb-field-grid"><label class="mb-field"><span class="mb-field-label">Fireball 2.0 Hotkey</span><input type="number" id="minibia-bot-fireball-v2-hotkey" min="1" max="12" placeholder="8" /></label><label class="mb-field"><span class="mb-field-label">Minimum Creatures</span><input type="number" id="minibia-bot-fireball-v2-monsters" min="1" placeholder="4" /></label><label class="mb-field"><span class="mb-field-label">Cooldown MS</span><input type="number" id="minibia-bot-fireball-v2-cooldown" min="0" placeholder="2000" /></label></div><div class="mb-small-note">Same 13-tile Fireball diamond and empty-ground placement scan as the original. This version also tracks movement and leads targets one tile only after at least two consistent moves in the same direction.</div><div class="mb-small-note">If a target stops, changes direction, teleports, or the movement sample becomes stale, prediction immediately falls back to the target's current tile.</div><div class="mb-small-note" id="minibia-bot-fireball-v2-status">Fireball 2.0: off</div>`;

    if (originalSection?.parentElement) originalSection.insertAdjacentElement("afterend", section);
    else aoeSection.querySelector(".mb-stack")?.appendChild(section);

    const enabled = section.querySelector("#minibia-bot-fireball-v2-enabled");
    const priority = section.querySelector("#minibia-bot-fireball-v2-highest-priority");
    const hotkey = section.querySelector("#minibia-bot-fireball-v2-hotkey");
    const monsters = section.querySelector("#minibia-bot-fireball-v2-monsters");
    const cooldown = section.querySelector("#minibia-bot-fireball-v2-cooldown");
    enabled?.addEventListener("change", () => enabled.checked ? start() : stop());
    priority?.addEventListener("change", () => updateConfig({ highestPriority: priority.checked }));
    hotkey?.addEventListener("change", () => updateConfig({ hotbarSlot: hotkey.value }));
    monsters?.addEventListener("change", () => updateConfig({ minMonsters: monsters.value }));
    cooldown?.addEventListener("change", () => updateConfig({ cooldownMs: cooldown.value }));
    refreshUi();
    return true;
  }

  function refreshUi() {
    const enabled = document.getElementById("minibia-bot-fireball-v2-enabled");
    const priority = document.getElementById("minibia-bot-fireball-v2-highest-priority");
    const hotkey = document.getElementById("minibia-bot-fireball-v2-hotkey");
    const monsters = document.getElementById("minibia-bot-fireball-v2-monsters");
    const cooldown = document.getElementById("minibia-bot-fireball-v2-cooldown");
    const statusLabel = document.getElementById("minibia-bot-fireball-v2-status");
    const best = state.running && config.enabled ? (state.currentBest || calculateBestCandidate()) : null;
    if (enabled) enabled.checked = !!state.running;
    if (priority) priority.checked = !!config.highestPriority;
    if (hotkey && document.activeElement !== hotkey) hotkey.value = config.hotbarSlot || "";
    if (monsters && document.activeElement !== monsters) monsters.value = config.minMonsters;
    if (cooldown && document.activeElement !== cooldown) cooldown.value = config.cooldownMs;
    if (statusLabel) statusLabel.textContent = state.running
      ? `Fireball 2.0: biggest group ${best?.count || 0}/${config.minMonsters} • predicted ${best?.predictionCount || 0}${shouldReservePriority() ? " PRIORITY" : ""}`
      : "Fireball 2.0: off";
  }

  function destroy() {
    stop({ persistEnabled: false });
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    document.getElementById(sectionId)?.remove();
  }

  patchClickHotbar();
  bot.fireballV2 = { start, stop, trigger, status, updateConfig, shouldReservePriority, getBestCandidate, evaluateAtPosition, getFireballTiles, getPredictedPosition, destroy, config };
  bot.addCleanup(destroy);

  if (!ensureUi()) {
    let attempts = 0;
    state.uiTimerId = window.setInterval(() => {
      attempts += 1;
      if (ensureUi() || attempts >= 40) {
        window.clearInterval(state.uiTimerId);
        state.uiTimerId = null;
        if (state.running && config.enabled) startUiTimer();
      }
    }, 250);
  }

  if (config.enabled) start();
  return bot.fireballV2;
};

(() => {
  const bundle = window.__minibiaBotBundle;
  const originalInstall = bundle?.installFireballModule;
  if (!bundle || typeof originalInstall !== "function" || originalInstall.__fireballV2Wrapped) return;
  const wrappedInstall = function installFireballAndFireballV2(bot) {
    const result = originalInstall(bot);
    bundle.installFireballV2Module?.(bot);
    return result;
  };
  wrappedInstall.__fireballV2Wrapped = true;
  bundle.installFireballModule = wrappedInstall;
})();
