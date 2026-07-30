window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installLureModeModule = function installLureModeModule(bot) {
  const configStorageKey = "minibiaBot.lure.config";
  const COUNT_RANGE = 7;
  const TICK_MS = 150;

  const config = Object.assign({ enabled: false, minMonsters: 3, maxDistance: 4 }, bot.storage.get(configStorageKey, {}) || {});
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
  };

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function intValue(value, fallback, min = 1, max = 99) { const n = Math.trunc(Number(value)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
  function pos(value) { if (!value) return null; const x = Number(value.x), y = Number(value.y), z = Number(value.z); return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) } : null; }
  function dist(a, b) { if (!a || !b || Number(a.z) !== Number(b.z)) return Infinity; return Math.max(Math.abs(Number(a.x) - Number(b.x)), Math.abs(Number(a.y) - Number(b.y))); }
  function playerPos() { return pos(bot.getPlayerPosition?.() || window.gameClient?.player?.__position); }
  function monsterPos(monster) { return pos(monster?.getPosition?.() || monster?.__position); }
  function currentTarget() { return bot.attack?.getCurrentTarget?.() || window.gameClient?.player?.__target || null; }
  function visibleMonsters() { return bot.attack?.getNearbyMonsters?.() || bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []; }

  function getOffStatus() {
    return {
      enabled: false,
      countRange: COUNT_RANGE,
      minMonsters: intValue(config.minMonsters, 3, 1, 20),
      maxDistance: intValue(config.maxDistance, 4, 1, COUNT_RANGE),
      monsterCount: 0,
      closestDistance: null,
      readyToEngage: false,
      clearingPack: false,
      luring: false,
      shouldHoldWalking: false,
      hasTarget: false,
      combatActive: false,
    };
  }

  function getLureMonsters() {
    if (!config.enabled) return [];
    const me = playerPos();
    if (!me) return [];
    return visibleMonsters()
      .map((monster) => ({ monster, position: monsterPos(monster) }))
      .map((entry) => ({ ...entry, distance: dist(me, entry.position) }))
      .filter((entry) => entry.position && entry.distance <= COUNT_RANGE)
      .sort((a, b) => a.distance - b.distance || Number(a.monster?.id || 0) - Number(b.monster?.id || 0));
  }

  function getLureStatus() {
    if (!config.enabled) return getOffStatus();
    const monsters = getLureMonsters();
    const minMonsters = intValue(config.minMonsters, 3, 1, 20);
    const maxDistance = intValue(config.maxDistance, 4, 1, COUNT_RANGE);
    const hasTarget = !!currentTarget();
    const combatActive = !!bot.attack?.status?.()?.combatActive;
    const closestDistance = monsters.length ? monsters[0].distance : Infinity;
    const readyToEngage = monsters.length >= minMonsters;
    const clearingPack = !!state.clearingPack;
    const luring = monsters.length > 0 && !readyToEngage && !clearingPack && !hasTarget && !combatActive;
    return {
      enabled: true,
      countRange: COUNT_RANGE,
      minMonsters,
      maxDistance,
      monsterCount: monsters.length,
      closestDistance: Number.isFinite(closestDistance) ? closestDistance : null,
      readyToEngage,
      clearingPack,
      luring,
      shouldHoldWalking: (luring && closestDistance > maxDistance) || (clearingPack && (monsters.length > 0 || hasTarget || combatActive)),
      hasTarget,
      combatActive,
    };
  }

  function setAttackSuppressed(shouldSuppress) {
    const attackConfig = bot.attack?.config;
    if (!attackConfig) return false;
    if (shouldSuppress) {
      if (!state.suppressingAttack) { state.restoreAttackEnabled = !!attackConfig.enabled; state.suppressingAttack = true; }
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
    const pf = window.gameClient?.world?.pathfinder;
    if (!pf) return false;
    let stopped = false;
    ["stop", "cancel", "clear", "clearPath", "stopWalking", "reset"].forEach((name) => { if (typeof pf[name] !== "function") return; try { pf[name](); stopped = true; } catch (error) {} });
    return stopped;
  }

  function pauseCaveForFight() {
    stopCurrentPath();
    try {
      const caveStatus = bot.cave?.status?.();
      if (caveStatus?.running && typeof bot.cave.stop === "function") {
        state.resumeCaveAfterClear = true;
        bot.cave.stop();
      }
    } catch (error) {}
  }

  function resumeCaveIfNeeded() {
    if (!state.resumeCaveAfterClear) return;
    state.resumeCaveAfterClear = false;
    try { bot.cave?.start?.(); } catch (error) {}
  }

  function patchPathfinder() {
    if (!config.enabled) return false;
    const pf = window.gameClient?.world?.pathfinder;
    if (!pf || typeof pf.findPath !== "function") return false;
    if (state.pathfinder === pf && state.originalFindPath) return true;
    if (state.pathfinder && state.originalFindPath) { try { state.pathfinder.findPath = state.originalFindPath; } catch (error) {} }
    state.pathfinder = pf;
    state.originalFindPath = pf.findPath.bind(pf);
    pf.findPath = function lureModeFindPathGuard(...args) {
      if (!config.enabled) return state.originalFindPath(...args);
      const status = getLureStatus();
      state.lastStatus = status;
      if (status.shouldHoldWalking) {
        const now = Date.now();
        stopCurrentPath();
        if (now - state.lastHoldLogAt > 1500) { state.lastHoldLogAt = now; bot.log?.("lure mode holding path", { monsterCount: status.monsterCount, closestDistance: status.closestDistance, maxDistance: status.maxDistance, countRange: COUNT_RANGE, clearingPack: status.clearingPack }); }
        return null;
      }
      return state.originalFindPath(...args);
    };
    return true;
  }

  function restorePathfinder() { if (state.pathfinder && state.originalFindPath) { try { state.pathfinder.findPath = state.originalFindPath; } catch (error) {} } state.pathfinder = null; state.originalFindPath = null; }

  function updateStatusUi(status = null) {
    const label = document.getElementById("minibia-bot-lure-status");
    if (!label) return;
    const current = status || (config.enabled ? state.lastStatus || getLureStatus() : getOffStatus());
    if (!current.enabled) label.textContent = "Lure: off";
    else if (current.clearingPack) label.textContent = `Lure: clearing ${current.monsterCount} left`;
    else if (current.readyToEngage) label.textContent = `Lure: engaging ${current.monsterCount}/${current.minMonsters}`;
    else if (current.shouldHoldWalking) label.textContent = `Lure: waiting, closest ${current.closestDistance}/${current.maxDistance}`;
    else if (current.monsterCount > 0) label.textContent = `Lure: walking ${current.monsterCount}/${current.minMonsters}`;
    else label.textContent = `Lure: looking 0/${current.minMonsters}`;
  }

  function tick() {
    if (!config.enabled) return getOffStatus();
    patchPathfinder();
    let status = getLureStatus();
    state.lastStatus = status;

    if (state.clearingPack && !status.hasTarget && !status.combatActive && status.monsterCount === 0) {
      state.clearingPack = false;
      status = getLureStatus();
      bot.log?.("lure mode pack cleared");
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
      window.setTimeout(() => { if (!config.enabled) return; pauseCaveForFight(); bot.attack?.triggerAttack?.(); }, 100);
      bot.log?.("lure mode engaging pack", { monsterCount: status.monsterCount, minMonsters: status.minMonsters, countRange: COUNT_RANGE });
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

  function startRuntime() {
    if (!config.enabled || state.timerId != null) return false;
    patchPathfinder();
    tick();
    state.timerId = window.setInterval(() => { try { tick(); } catch (error) { bot.log?.("lure mode tick failed", error?.message || error); } }, TICK_MS);
    return true;
  }

  function stopRuntime() {
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
    state.clearingPack = false;
    state.lastStatus = getOffStatus();
    setAttackSuppressed(false);
    resumeCaveIfNeeded();
    restorePathfinder();
    updateStatusUi(state.lastStatus);
    return true;
  }

  function updateConfig(nextConfig = {}) {
    const hadEnabled = !!config.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) config.enabled = !!nextConfig.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMonsters")) config.minMonsters = intValue(nextConfig.minMonsters, config.minMonsters || 3, 1, 20);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxDistance")) config.maxDistance = intValue(nextConfig.maxDistance, config.maxDistance || 4, 1, COUNT_RANGE);
    persistConfig();
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
    const min = document.getElementById("minibia-bot-lure-min-monsters");
    const max = document.getElementById("minibia-bot-lure-max-distance");
    if (enabled) enabled.checked = !!config.enabled;
    if (min && document.activeElement !== min) min.value = String(intValue(config.minMonsters, 3, 1, 20));
    if (max && document.activeElement !== max) max.value = String(intValue(config.maxDistance, 4, 1, COUNT_RANGE));
  }

  function installLureStyle() {
    let style = document.getElementById("minibia-bot-lure-style");
    if (!style) { style = document.createElement("style"); style.id = "minibia-bot-lure-style"; document.head.appendChild(style); }
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
        <div class="mb-field-grid">
          <label class="mb-field" for="minibia-bot-lure-min-monsters"><span class="mb-field-label">Min Monsters</span><input type="number" id="minibia-bot-lure-min-monsters" min="1" max="20" step="1" /></label>
          <label class="mb-field" for="minibia-bot-lure-max-distance"><span class="mb-field-label">Max Distance</span><input type="number" id="minibia-bot-lure-max-distance" min="1" max="7" step="1" /></label>
        </div>
        <div class="mb-small-note">After Min Monsters is reached, it stays in kill mode until the pack is cleared.</div>
        <div class="mb-small-note" id="minibia-bot-lure-status">Lure: off</div>
      </div>
    `;
    section.querySelector("#minibia-bot-lure-enabled")?.addEventListener("change", (event) => updateConfig({ enabled: event.target.checked }));
    section.querySelector("#minibia-bot-lure-min-monsters")?.addEventListener("input", (event) => updateConfig({ minMonsters: event.target.value }));
    section.querySelector("#minibia-bot-lure-max-distance")?.addEventListener("input", (event) => updateConfig({ maxDistance: event.target.value }));
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
    if (existing) { existing.id = "minibia-bot-lure-section"; existing.className = "mb-section mb-column-section"; existing.removeAttribute("style"); return existing; }
    return makeSection();
  }

  function getFourthColumn() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const body = panel?.querySelector?.(".mb-body");
    if (!panel || !body) return null;
    let column = document.getElementById("minibia-bot-aoe-column");
    if (!column) { column = document.createElement("div"); column.id = "minibia-bot-aoe-column"; column.className = "mb-aoe-column"; body.appendChild(column); }
    return column;
  }

  function injectUi() {
    installLureStyle();
    const section = getOrCreateLureSection();
    const column = getFourthColumn();
    if (column && section.parentElement !== column) column.appendChild(section);
    else if (column && section.nextSibling) column.appendChild(section);
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
      if (correctlyPlaced || attempts >= 120) { window.clearInterval(state.uiTimerId); state.uiTimerId = null; }
    }, 250);
    injectUi();
  }

  function start() { config.enabled = true; persistConfig(); updateUiValues(); return startRuntime(); }
  function stop() { config.enabled = false; persistConfig(); updateUiValues(); return stopRuntime(); }
  function destroy() { stopRuntime(); if (state.uiTimerId != null) window.clearInterval(state.uiTimerId); state.uiTimerId = null; }
  function status() { return { running: config.enabled && state.timerId != null, config: { ...config, countRange: COUNT_RANGE }, lure: config.enabled ? getLureStatus() : getOffStatus(), clearingPack: config.enabled && state.clearingPack, resumeCaveAfterClear: config.enabled && state.resumeCaveAfterClear, suppressingAttack: config.enabled && state.suppressingAttack }; }

  bot.lureMode = { start, stop, status, updateConfig, getLureStatus, config };
  if (config.enabled) startRuntime(); else state.lastStatus = getOffStatus();
  startUiInjector();
  bot.addCleanup?.(destroy);
};