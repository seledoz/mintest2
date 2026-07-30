window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackAoeModule = function installAutoAttackAoeModule(bot) {
  if (!bot || bot.attackAoe?.destroy) return bot?.attackAoe;

  const configStorageKey = "minibiaBot.attackAoe.config";
  const state = {
    running: false,
    timerId: null,
    uiTimerId: null,
    lastSpellHotkeyAt: 0,
    lastCastMonsterCount: 0,
    lastGfbHotkeyAt: 0,
    lastGfbMonsterCount: 0,
    lastGfbTargetName: "",
  };

  const storedConfig = bot.storage.get(configStorageKey, {}) || {};
  const config = Object.assign({
    enabled: false,
    spellHotbarSlot: null,
    minMonsters: 3,
    squareRange: 3,
    cooldownMs: 2000,
    tickMs: 250,
    requireAutoAttackRunning: true,
    respectTargetFilters: true,
    gfbEnabled: false,
    gfbHotbarSlot: null,
    gfbMinMonsters: 4,
    gfbCooldownMs: 2000,
  }, storedConfig);

  delete config.energyWaveEnabled;
  delete config.energyWaveHotbarSlot;
  delete config.energyWaveMinMonsters;
  delete config.energyWaveCooldownMs;

  config.spellHotbarSlot = normalizeHotbarSlot(config.spellHotbarSlot);
  config.minMonsters = positiveInt(config.minMonsters, 3);
  config.squareRange = positiveInt(config.squareRange, 3);
  config.cooldownMs = nonNegativeInt(config.cooldownMs, 2000);
  config.tickMs = positiveInt(config.tickMs, 250);
  config.requireAutoAttackRunning = config.requireAutoAttackRunning !== false;
  config.respectTargetFilters = config.respectTargetFilters !== false;
  config.gfbEnabled = !!config.gfbEnabled;
  config.gfbHotbarSlot = normalizeHotbarSlot(config.gfbHotbarSlot);
  config.gfbMinMonsters = positiveInt(config.gfbMinMonsters, 4);
  config.gfbCooldownMs = nonNegativeInt(config.gfbCooldownMs, 2000);

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function normalizeHotbarSlot(slot) { const n = Math.trunc(Number(slot)); return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null; }
  function positiveInt(value, fallback) { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n > 0 ? n : fallback; }
  function nonNegativeInt(value, fallback) { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n >= 0 ? n : fallback; }
  function normalizeName(name) { return String(name || "").trim().toLowerCase(); }

  function getPosition(value) {
    const raw = value?.getPosition?.() || value?.__position || value?.position || value;
    if (!raw) return null;
    const x = Number(raw.x), y = Number(raw.y), z = Number(raw.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }
      : null;
  }

  function tileDistance(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(Number(a.x) - Number(b.x)), Math.abs(Number(a.y) - Number(b.y)));
  }

  function positionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : "";
  }

  function passesTargetFilters(monster) {
    if (!config.respectTargetFilters) return true;
    const attackConfig = bot.attack?.config || {};
    const mode = attackConfig.targetFilterMode === "include" || attackConfig.targetFilterMode === "exclude" ? attackConfig.targetFilterMode : "all";
    const monsterName = normalizeName(monster?.name || "Mob");
    const included = new Set((attackConfig.includedCreatureNames || []).map(normalizeName));
    const excluded = new Set((attackConfig.excludedCreatureNames || []).map(normalizeName));
    if (mode === "include") return (!included.size || included.has(monsterName)) && !excluded.has(monsterName);
    return !excluded.has(monsterName);
  }

  function getVisibleMonsters() {
    return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []).filter(passesTargetFilters);
  }

  function getCandidateMonsters() {
    const playerPosition = getPosition(bot.getPlayerPosition?.());
    if (!playerPosition) return [];
    const range = positiveInt(config.squareRange, 3);
    return getVisibleMonsters().filter((monster) => tileDistance(playerPosition, getPosition(monster)) <= range);
  }

  function isAutoAttackRunning() {
    if (!config.requireAutoAttackRunning) return true;
    return !!bot.attack?.status?.().running;
  }

  function canCastSquare(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.spellHotbarSlot);
    if (!config.enabled || !state.running || !slot || !isAutoAttackRunning()) return false;
    if (now - state.lastSpellHotkeyAt < nonNegativeInt(config.cooldownMs, 2000)) return false;
    return getCandidateMonsters().length >= positiveInt(config.minMonsters, 3);
  }

  function triggerSquareSpell(now = Date.now()) {
    if (!canCastSquare(now)) return false;
    const slot = normalizeHotbarSlot(config.spellHotbarSlot);
    const monsters = getCandidateMonsters();
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      state.lastSpellHotkeyAt = now;
      state.lastCastMonsterCount = monsters.length;
      bot.log("used auto attack AoE spell hotkey", { slot, monsterCount: monsters.length, squareRange: config.squareRange });
    }
    refreshUiValues();
    return clicked;
  }

  function getGfbTiles(centerPosition) {
    if (!centerPosition) return [];
    const rowWidths = [1, 5, 5, 7, 5, 5, 1];
    const tiles = [];
    for (let row = 0; row < rowWidths.length; row += 1) {
      const half = Math.floor(rowWidths[row] / 2);
      const yOffset = row - 3;
      for (let xOffset = -half; xOffset <= half; xOffset += 1) {
        tiles.push({ x: centerPosition.x + xOffset, y: centerPosition.y + yOffset, z: centerPosition.z });
      }
    }
    return tiles;
  }

  function evaluateGfbAtPosition(centerPosition, monsters = getVisibleMonsters()) {
    if (!centerPosition) return { position: centerPosition, count: 0, monsters: [], tiles: [] };
    const tileKeys = new Set(getGfbTiles(centerPosition).map(positionKey));
    const hitMonsters = monsters.filter((monster) => {
      const position = getPosition(monster);
      return position && position.z === centerPosition.z && tileKeys.has(positionKey(position));
    });
    return { position: centerPosition, count: hitMonsters.length, monsters: hitMonsters, tiles: Array.from(tileKeys) };
  }

  function getBestGfbCandidate() {
    const playerPosition = getPosition(bot.getPlayerPosition?.());
    if (!playerPosition) return null;
    const monsters = getVisibleMonsters().filter((monster) => {
      const position = getPosition(monster);
      return position && position.z === playerPosition.z && tileDistance(playerPosition, position) <= 7;
    });
    if (!monsters.length) return null;

    const candidatesByKey = new Map();
    monsters.forEach((monster) => {
      const position = getPosition(monster);
      if (position) candidatesByKey.set(positionKey(position), { position, target: monster });
    });

    const evaluations = Array.from(candidatesByKey.values()).map((candidate) => ({
      ...evaluateGfbAtPosition(candidate.position, monsters),
      target: candidate.target,
    }));

    evaluations.sort((left, right) => {
      const countDiff = right.count - left.count;
      if (countDiff) return countDiff;
      return tileDistance(playerPosition, left.position) - tileDistance(playerPosition, right.position);
    });
    return evaluations[0] || null;
  }

  function getTileFromPosition(position) {
    if (!position) return null;
    if (typeof Position === "function") {
      return window.gameClient?.world?.getTileFromWorldPosition?.(new Position(position.x, position.y, position.z)) || null;
    }
    return window.gameClient?.world?.getTileFromWorldPosition?.(position) || null;
  }

  function clickCrosshairTarget(best) {
    const slot = normalizeHotbarSlot(config.gfbHotbarSlot);
    if (!slot || !best?.position) return false;
    if (!bot.clickHotbar(slot - 1)) return false;

    const tile = getTileFromPosition(best.position);
    const target = best.target || best.monsters?.[0] || tile;
    const mouse = window.gameClient?.mouse;
    const targetRef = tile ? { which: tile, index: 0xFF } : target ? { which: target, index: 0xFF } : null;

    if (targetRef && typeof mouse?.__handleItemUseWith === "function") {
      try { mouse.__handleItemUseWith(null, targetRef); return true; } catch (error) {}
    }
    if (targetRef && typeof mouse?.__handleThingUse === "function") {
      try { mouse.__handleThingUse(targetRef); return true; } catch (error) {}
    }
    if (tile && typeof mouse?.__handleTileClick === "function") {
      try { mouse.__handleTileClick(tile); return true; } catch (error) {}
    }
    if (target && typeof mouse?.__handleCreatureClick === "function") {
      try { mouse.__handleCreatureClick(target); return true; } catch (error) {}
    }

    bot.log("GFB crosshair target could not be clicked by known mouse handlers", { position: best.position, target: best.target?.name || "Mob" });
    return false;
  }

  function canCastGfb(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.gfbHotbarSlot);
    if (!config.enabled || !state.running || !config.gfbEnabled || !slot) return false;
    if (now - state.lastGfbHotkeyAt < nonNegativeInt(config.gfbCooldownMs, 2000)) return false;
    const best = getBestGfbCandidate();
    return !!best && best.count >= positiveInt(config.gfbMinMonsters, 4);
  }

  function triggerGfb(now = Date.now()) {
    if (!canCastGfb(now)) return false;
    const best = getBestGfbCandidate();
    if (!best || best.count < positiveInt(config.gfbMinMonsters, 4)) return false;
    const clicked = clickCrosshairTarget(best);
    if (clicked) {
      state.lastGfbHotkeyAt = now;
      state.lastGfbMonsterCount = best.count;
      state.lastGfbTargetName = best.target?.name || best.monsters?.[0]?.name || "Mob";
      bot.log("used great fireball hotkey", { slot: config.gfbHotbarSlot, monsterCount: best.count, target: state.lastGfbTargetName, position: best.position, shape: "1-5-5-7-5-5-1" });
    }
    refreshUiValues();
    return clicked;
  }

  function triggerSpell(now = Date.now()) {
    return triggerGfb(now) || triggerSquareSpell(now);
  }

  function tick() {
    if (!state.running) return;
    try { triggerSpell(); } catch (error) { bot.log("auto attack AoE tick failed", error?.message || error); }
    state.timerId = window.setTimeout(tick, positiveInt(config.tickMs, 250));
  }

  function start(overrides = {}) {
    updateConfig(Object.assign({}, overrides, { enabled: true }), { silent: true });
    if (state.running) return false;
    state.running = true;
    bot.log("auto attack AoE started", { ...config });
    tick();
    refreshUiValues();
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    if (options.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    bot.log("auto attack AoE stopped");
    refreshUiValues();
    return true;
  }

  function updateConfig(nextConfig = {}, options = {}) {
    const cleaned = { ...nextConfig };
    delete cleaned.energyWaveEnabled;
    delete cleaned.energyWaveHotbarSlot;
    delete cleaned.energyWaveMinMonsters;
    delete cleaned.energyWaveCooldownMs;
    if (Object.prototype.hasOwnProperty.call(cleaned, "spellHotbarSlot")) cleaned.spellHotbarSlot = normalizeHotbarSlot(cleaned.spellHotbarSlot);
    if (Object.prototype.hasOwnProperty.call(cleaned, "minMonsters")) cleaned.minMonsters = positiveInt(cleaned.minMonsters, config.minMonsters || 3);
    if (Object.prototype.hasOwnProperty.call(cleaned, "squareRange")) cleaned.squareRange = positiveInt(cleaned.squareRange, config.squareRange || 3);
    if (Object.prototype.hasOwnProperty.call(cleaned, "cooldownMs")) cleaned.cooldownMs = nonNegativeInt(cleaned.cooldownMs, config.cooldownMs || 2000);
    if (Object.prototype.hasOwnProperty.call(cleaned, "tickMs")) cleaned.tickMs = positiveInt(cleaned.tickMs, config.tickMs || 250);
    if (Object.prototype.hasOwnProperty.call(cleaned, "requireAutoAttackRunning")) cleaned.requireAutoAttackRunning = cleaned.requireAutoAttackRunning !== false;
    if (Object.prototype.hasOwnProperty.call(cleaned, "respectTargetFilters")) cleaned.respectTargetFilters = cleaned.respectTargetFilters !== false;
    if (Object.prototype.hasOwnProperty.call(cleaned, "gfbEnabled")) cleaned.gfbEnabled = !!cleaned.gfbEnabled;
    if (Object.prototype.hasOwnProperty.call(cleaned, "gfbHotbarSlot")) cleaned.gfbHotbarSlot = normalizeHotbarSlot(cleaned.gfbHotbarSlot);
    if (Object.prototype.hasOwnProperty.call(cleaned, "gfbMinMonsters")) cleaned.gfbMinMonsters = positiveInt(cleaned.gfbMinMonsters, config.gfbMinMonsters || 4);
    if (Object.prototype.hasOwnProperty.call(cleaned, "gfbCooldownMs")) cleaned.gfbCooldownMs = nonNegativeInt(cleaned.gfbCooldownMs, config.gfbCooldownMs || 2000);
    Object.assign(config, cleaned);
    persistConfig();
    if (!options.silent) refreshUiValues();
    return { ...config };
  }

  function status() {
    const monsters = state.running && config.enabled ? getCandidateMonsters() : [];
    const bestGfb = state.running && config.enabled && config.gfbEnabled ? getBestGfbCandidate() : null;
    return {
      running: state.running,
      config: { ...config },
      nearbyMonsterCount: monsters.length,
      lastCastMonsterCount: state.lastCastMonsterCount,
      lastGfbMonsterCount: state.lastGfbMonsterCount,
      lastGfbTargetName: state.lastGfbTargetName,
      bestGfbCount: bestGfb?.count || 0,
      bestGfbTargetName: bestGfb?.target?.name || "",
      ready: canCastSquare(Date.now()) || canCastGfb(Date.now()),
    };
  }

  function findAutoAttackAnchor(panel) {
    return document.getElementById("minibia-bot-auto-attack-enabled")?.closest(".mb-section") ||
      document.getElementById("minibia-bot-auto-attack-enabled")?.parentElement ||
      panel.querySelector(".mb-main-column") || panel.querySelector(".mb-body") || panel;
  }

  function ensureUi() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    if (!panel || document.getElementById("minibia-bot-auto-attack-aoe-section")) return;
    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-auto-attack-aoe-section";
    section.innerHTML = `
      <div class="mb-label">AoE Spell</div>
      <div class="mb-stack">
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-aoe-enabled" /><span>Enable AoE Spells</span></label>
        <div class="mb-field-grid">
          <label class="mb-field"><span class="mb-field-label">Square Hotkey</span><input type="number" id="minibia-bot-auto-attack-aoe-hotkey" min="1" max="12" placeholder="5" /></label>
          <label class="mb-field"><span class="mb-field-label">Square Min Monsters</span><input type="number" id="minibia-bot-auto-attack-aoe-monsters" min="1" placeholder="3" /></label>
          <label class="mb-field"><span class="mb-field-label">Square Range</span><input type="number" id="minibia-bot-auto-attack-aoe-range" min="1" placeholder="3" /></label>
          <label class="mb-field"><span class="mb-field-label">Square Cooldown MS</span><input type="number" id="minibia-bot-auto-attack-aoe-cooldown" min="0" placeholder="2000" /></label>
        </div>
        <div class="mb-section">
          <div class="mb-label">Great Fireball 1-5-5-7-5-5-1</div>
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gfb-enabled" /><span>Enable Great Fireball</span></label>
          <div class="mb-field-grid">
            <label class="mb-field"><span class="mb-field-label">GFB Hotkey</span><input type="number" id="minibia-bot-gfb-hotkey" min="1" max="12" placeholder="8" /></label>
            <label class="mb-field"><span class="mb-field-label">GFB Min Creatures</span><input type="number" id="minibia-bot-gfb-monsters" min="1" placeholder="4" /></label>
            <label class="mb-field"><span class="mb-field-label">GFB Cooldown MS</span><input type="number" id="minibia-bot-gfb-cooldown" min="0" placeholder="2000" /></label>
          </div>
          <div class="mb-small-note">Hotkey should have Great Fireball selected on crosshairs. Picks the best 1-5-5-7-5-5-1 shot.</div>
        </div>
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-aoe-require-attack" /><span>Only square AoE while Auto Attack runs</span></label>
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-aoe-respect-filters" /><span>Use target filters</span></label>
        <div class="mb-small-note" id="minibia-bot-auto-attack-aoe-status">AoE: idle</div>
      </div>`;

    const anchor = findAutoAttackAnchor(panel);
    if (anchor && anchor.parentElement) anchor.insertAdjacentElement("afterend", section);
    else (panel.querySelector(".mb-main-column") || panel.querySelector(".mb-body") || panel).appendChild(section);

    const enabled = section.querySelector("#minibia-bot-auto-attack-aoe-enabled");
    const hotkey = section.querySelector("#minibia-bot-auto-attack-aoe-hotkey");
    const monsters = section.querySelector("#minibia-bot-auto-attack-aoe-monsters");
    const range = section.querySelector("#minibia-bot-auto-attack-aoe-range");
    const cooldown = section.querySelector("#minibia-bot-auto-attack-aoe-cooldown");
    const gfbEnabled = section.querySelector("#minibia-bot-gfb-enabled");
    const gfbHotkey = section.querySelector("#minibia-bot-gfb-hotkey");
    const gfbMonsters = section.querySelector("#minibia-bot-gfb-monsters");
    const gfbCooldown = section.querySelector("#minibia-bot-gfb-cooldown");
    const requireAttack = section.querySelector("#minibia-bot-auto-attack-aoe-require-attack");
    const filters = section.querySelector("#minibia-bot-auto-attack-aoe-respect-filters");
    enabled?.addEventListener("change", () => enabled.checked ? start() : stop());
    hotkey?.addEventListener("change", () => updateConfig({ spellHotbarSlot: hotkey.value }));
    monsters?.addEventListener("change", () => updateConfig({ minMonsters: monsters.value }));
    range?.addEventListener("change", () => updateConfig({ squareRange: range.value }));
    cooldown?.addEventListener("change", () => updateConfig({ cooldownMs: cooldown.value }));
    gfbEnabled?.addEventListener("change", () => updateConfig({ gfbEnabled: gfbEnabled.checked }));
    gfbHotkey?.addEventListener("change", () => updateConfig({ gfbHotbarSlot: gfbHotkey.value }));
    gfbMonsters?.addEventListener("change", () => updateConfig({ gfbMinMonsters: gfbMonsters.value }));
    gfbCooldown?.addEventListener("change", () => updateConfig({ gfbCooldownMs: gfbCooldown.value }));
    requireAttack?.addEventListener("change", () => updateConfig({ requireAutoAttackRunning: requireAttack.checked }));
    filters?.addEventListener("change", () => updateConfig({ respectTargetFilters: filters.checked }));
    refreshUiValues();
  }

  function refreshUiValues() {
    const enabled = document.getElementById("minibia-bot-auto-attack-aoe-enabled");
    const hotkey = document.getElementById("minibia-bot-auto-attack-aoe-hotkey");
    const monsters = document.getElementById("minibia-bot-auto-attack-aoe-monsters");
    const range = document.getElementById("minibia-bot-auto-attack-aoe-range");
    const cooldown = document.getElementById("minibia-bot-auto-attack-aoe-cooldown");
    const gfbEnabled = document.getElementById("minibia-bot-gfb-enabled");
    const gfbHotkey = document.getElementById("minibia-bot-gfb-hotkey");
    const gfbMonsters = document.getElementById("minibia-bot-gfb-monsters");
    const gfbCooldown = document.getElementById("minibia-bot-gfb-cooldown");
    const requireAttack = document.getElementById("minibia-bot-auto-attack-aoe-require-attack");
    const filters = document.getElementById("minibia-bot-auto-attack-aoe-respect-filters");
    const statusLabel = document.getElementById("minibia-bot-auto-attack-aoe-status");
    const panelCollapsed = document.getElementById("minibia-bot-panel")?.dataset?.collapsed === "true";
    const shouldScanUi = state.running && config.enabled && !panelCollapsed;
    const bestGfb = shouldScanUi && config.gfbEnabled ? getBestGfbCandidate() : null;
    if (enabled) enabled.checked = !!state.running;
    if (hotkey) hotkey.value = config.spellHotbarSlot || "";
    if (monsters) monsters.value = config.minMonsters;
    if (range) range.value = config.squareRange;
    if (cooldown) cooldown.value = config.cooldownMs;
    if (gfbEnabled) gfbEnabled.checked = !!config.gfbEnabled;
    if (gfbHotkey) gfbHotkey.value = config.gfbHotbarSlot || "";
    if (gfbMonsters) gfbMonsters.value = config.gfbMinMonsters;
    if (gfbCooldown) gfbCooldown.value = config.gfbCooldownMs;
    if (requireAttack) requireAttack.checked = !!config.requireAutoAttackRunning;
    if (filters) filters.checked = !!config.respectTargetFilters;
    if (statusLabel) {
      statusLabel.textContent = state.running
        ? `AoE: square ${shouldScanUi ? getCandidateMonsters().length : 0}/${config.minMonsters}; gfb ${bestGfb?.count || 0}/${config.gfbMinMonsters}`
        : "AoE: off";
    }
  }

  function destroy() {
    stop({ persistEnabled: false });
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    document.getElementById("minibia-bot-auto-attack-aoe-section")?.remove();
  }

  bot.attackAoe = {
    start,
    stop,
    status,
    updateConfig,
    triggerSpell,
    triggerSquareSpell,
    triggerGfb,
    getBestGfbCandidate,
    evaluateGfbAtPosition,
    getGfbTiles,
    destroy,
    config,
  };
  state.uiTimerId = window.setInterval(() => { ensureUi(); refreshUiValues(); }, 1000);
  bot.addCleanup(destroy);
  if (config.enabled) start(); else ensureUi();
  return bot.attackAoe;
};
