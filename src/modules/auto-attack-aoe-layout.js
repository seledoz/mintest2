window.__minibiaBotBundle = window.__minibiaBotBundle || {};

// Safe layout helper: retries briefly during startup, then stops.
(function moveAoeIntoFourthColumnSafely() {
  const columnId = "minibia-bot-aoe-column";
  const styleId = "minibia-bot-aoe-column-style";

  function installStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #minibia-bot-panel {
        width: min(98vw, 1260px) !important;
        max-width: calc(100vw - 12px) !important;
      }
      #minibia-bot-panel[data-collapsed="true"] {
        width: 220px !important;
      }
      #minibia-bot-panel .mb-body:not([hidden]) {
        grid-template-columns: minmax(0, 1fr) 280px 240px 280px !important;
      }
      #minibia-bot-panel .mb-aoe-column {
        display: grid !important;
        gap: 10px !important;
        align-content: start !important;
        min-width: 0 !important;
      }
      #minibia-bot-panel #minibia-bot-auto-attack-aoe-section {
        max-height: none !important;
        overflow: visible !important;
      }
      @media (max-width: 760px) {
        #minibia-bot-panel .mb-body:not([hidden]) {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function moveAoeSection() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const body = panel?.querySelector?.(".mb-body");
    const aoeSection = document.getElementById("minibia-bot-auto-attack-aoe-section");
    if (!panel || !body || !aoeSection) return false;

    installStyle();
    let column = document.getElementById(columnId);
    if (!column) {
      column = document.createElement("div");
      column.id = columnId;
      column.className = "mb-aoe-column";
      body.appendChild(column);
    }
    if (aoeSection.parentElement !== column) column.prepend(aoeSection);
    return true;
  }

  let attempts = 0;
  const retryId = window.setInterval(() => {
    attempts += 1;
    if (moveAoeSection() || attempts >= 30) window.clearInterval(retryId);
  }, 1000);
  moveAoeSection();
})();

// The old GFB helper used to run a permanent 250 ms interval even when disabled.
// GFB 2.0 already owns its own timer and starts/stops it with the feature toggle,
// so no separate background combat interval is installed here.

(function configureCaptchaAlarmTiming() {
  const desiredConfig = { beepIntervalMs: 3000, alertDurationMs: 30000 };

  function applyTiming() {
    try {
      const alertModule = window.minibiaBot?.redTextAlert;
      if (!alertModule?.updateConfig) return false;
      alertModule.updateConfig(desiredConfig, { silent: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  let attempts = 0;
  const retryId = window.setInterval(() => {
    attempts += 1;
    if (applyTiming() || attempts >= 30) window.clearInterval(retryId);
  }, 1000);
  applyTiming();
})();

(function makeSquareCooldownEditable() {
  const inputId = "minibia-bot-auto-attack-aoe-cooldown";
  let editing = false;
  let draftValue = "";

  function saveCooldown(value) {
    const cooldownMs = Math.max(0, Math.trunc(Number(value)));
    if (!Number.isFinite(cooldownMs)) return false;
    try {
      window.minibiaBot?.attackAoe?.updateConfig?.({ cooldownMs });
      return true;
    } catch (_) {
      return false;
    }
  }

  function attach() {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.squareCooldownEditableInstalled === "true") return false;
    input.dataset.squareCooldownEditableInstalled = "true";
    input.removeAttribute("readonly");
    input.disabled = false;
    input.addEventListener("focus", () => {
      editing = true;
      draftValue = input.value;
    });
    input.addEventListener("input", () => {
      editing = true;
      draftValue = input.value;
      saveCooldown(draftValue);
    });
    input.addEventListener("change", () => {
      draftValue = input.value;
      saveCooldown(draftValue);
    });
    input.addEventListener("blur", () => {
      saveCooldown(input.value);
      editing = false;
    });
    return true;
  }

  let attempts = 0;
  const retryId = window.setInterval(() => {
    attempts += 1;
    const input = document.getElementById(inputId);
    attach();
    if (editing && input && document.activeElement === input && input.value !== draftValue) {
      input.value = draftValue;
    }
    if (attempts >= 40 && !editing) window.clearInterval(retryId);
  }, 250);
})();

(function forceNormalAutoAttackRangeSix() {
  const storageKey = "minibiaBot.attack.config";

  function applySix() {
    try {
      const rawValue = window.localStorage.getItem(storageKey);
      const config = rawValue ? JSON.parse(rawValue) : {};
      if (config.maxTargetDistance !== 6) {
        config.maxTargetDistance = 6;
        window.localStorage.setItem(storageKey, JSON.stringify(config));
      }
      const attackConfig = window.minibiaBot?.attack?.config;
      if (attackConfig && attackConfig.maxTargetDistance !== 6) attackConfig.maxTargetDistance = 6;
    } catch (_) {}
  }

  applySix();
  window.setTimeout(applySix, 500);
})();

// Adds a second square hotkey as a lower-priority fallback.
// Square Hotkey #1 gets an authoritative cast attempt before #2. If #1 is
// cooling down, Square Hotkey #2 may cast if its own conditions are met.
(function installSecondSquareHotkey() {
  const storageKey = "minibiaBot.attackAoe.square2.config";
  const sectionId = "minibia-bot-auto-attack-aoe-square2-section";
  const defaults = {
    hotbarSlot: null,
    minMonsters: 2,
    squareRange: 3,
    cooldownMs: 2000,
  };
  const state = {
    lastHotkeyAt: 0,
    lastMonsterCount: 0,
    timerId: null,
    uiRetryTimerId: null,
    syncTimerId: null,
  };

  function normalizeSlot(value) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number >= 1 && number <= 12 ? number : null;
  }

  function positiveInt(value, fallback) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function nonNegativeInt(value, fallback) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function loadConfig() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
      return {
        hotbarSlot: normalizeSlot(saved.hotbarSlot),
        minMonsters: positiveInt(saved.minMonsters, defaults.minMonsters),
        squareRange: positiveInt(saved.squareRange, defaults.squareRange),
        cooldownMs: nonNegativeInt(saved.cooldownMs, defaults.cooldownMs),
      };
    } catch (_) {
      return { ...defaults };
    }
  }

  const config = loadConfig();

  function persistConfig() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(config));
    } catch (_) {}
  }

  function getPosition(value) {
    const raw = value?.getPosition?.() || value?.__position || value?.position || value;
    if (!raw) return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    const z = Number(raw.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }
      : null;
  }

  function tileDistance(left, right) {
    if (!left || !right || left.z !== right.z) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
  }

  function normalizeName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function passesTargetFilters(monster, primaryConfig) {
    if (primaryConfig?.respectTargetFilters === false) return true;
    const attackConfig = window.minibiaBot?.attack?.config || {};
    const mode = attackConfig.targetFilterMode === "include" || attackConfig.targetFilterMode === "exclude"
      ? attackConfig.targetFilterMode
      : "all";
    const name = normalizeName(monster?.name || "Mob");
    const included = new Set((attackConfig.includedCreatureNames || []).map(normalizeName));
    const excluded = new Set((attackConfig.excludedCreatureNames || []).map(normalizeName));
    if (mode === "include") return (!included.size || included.has(name)) && !excluded.has(name);
    return !excluded.has(name);
  }

  function countMonsters(range, primaryConfig) {
    const bot = window.minibiaBot;
    const playerPosition = getPosition(bot?.getPlayerPosition?.());
    if (!bot || !playerPosition) return 0;
    return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [])
      .filter((monster) => passesTargetFilters(monster, primaryConfig))
      .filter((monster) => tileDistance(playerPosition, getPosition(monster)) <= range)
      .length;
  }

  function getPrimaryStatus() {
    try {
      return window.minibiaBot?.attackAoe?.status?.() || null;
    } catch (_) {
      return null;
    }
  }

  function primarySquareConditionsMet(status) {
    const primaryConfig = status?.config || {};
    if (!status?.running || !primaryConfig.enabled || !normalizeSlot(primaryConfig.spellHotbarSlot)) return false;
    if (primaryConfig.requireAutoAttackRunning !== false && !window.minibiaBot?.attack?.status?.().running) return false;
    const primaryCount = countMonsters(positiveInt(primaryConfig.squareRange, 3), primaryConfig);
    return primaryCount >= positiveInt(primaryConfig.minMonsters, 3);
  }

  function primarySquareIsReady(status) {
    return primarySquareConditionsMet(status) && status?.ready === true;
  }

  function secondConditionsMet(now = Date.now(), status = getPrimaryStatus()) {
    const bot = window.minibiaBot;
    const primaryConfig = status?.config || {};
    if (!bot || !status?.running || !primaryConfig.enabled || !normalizeSlot(config.hotbarSlot)) return false;
    if (primaryConfig.requireAutoAttackRunning !== false && !bot.attack?.status?.().running) return false;
    if (bot.attackAoe?.shouldReservePriority?.()) return false;
    if (now - state.lastHotkeyAt < nonNegativeInt(config.cooldownMs, 2000)) return false;
    return countMonsters(positiveInt(config.squareRange, 3), primaryConfig) >= positiveInt(config.minMonsters, 2);
  }

  function canCastSecond(now = Date.now()) {
    const status = getPrimaryStatus();
    if (!secondConditionsMet(now, status)) return false;
    if (primarySquareIsReady(status)) return false;
    return true;
  }

  function triggerSecond(now = Date.now()) {
    const bot = window.minibiaBot;
    const status = getPrimaryStatus();
    if (!secondConditionsMet(now, status)) return false;

    // Strict priority handoff: if #1 meets its monster/range conditions, let the
    // primary module make the authoritative cooldown check and cast attempt first.
    // Only when that attempt returns false (for example #1 is cooling down) may #2 fire.
    if (primarySquareConditionsMet(status)) {
      const primaryCast = bot?.attackAoe?.triggerSquareSpell?.(now);
      if (primaryCast) {
        refreshUi();
        return false;
      }
    }

    const primaryConfig = status?.config || {};
    const slot = normalizeSlot(config.hotbarSlot);
    const monsterCount = countMonsters(positiveInt(config.squareRange, 3), primaryConfig);
    const clicked = bot?.clickHotbar?.(slot - 1);
    if (clicked) {
      state.lastHotkeyAt = now;
      state.lastMonsterCount = monsterCount;
      bot.log?.("used square hotkey #2", {
        slot,
        monsterCount,
        squareRange: config.squareRange,
        priority: 2,
      });
    }
    refreshUi();
    return !!clicked;
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "hotbarSlot")) config.hotbarSlot = normalizeSlot(nextConfig.hotbarSlot);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMonsters")) config.minMonsters = positiveInt(nextConfig.minMonsters, config.minMonsters || 2);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "squareRange")) config.squareRange = positiveInt(nextConfig.squareRange, config.squareRange || 3);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "cooldownMs")) config.cooldownMs = nonNegativeInt(nextConfig.cooldownMs, config.cooldownMs || 2000);
    persistConfig();
    refreshUi();
  }

  function ensureUi() {
    if (document.getElementById(sectionId)) return true;
    const mainSection = document.getElementById("minibia-bot-auto-attack-aoe-section");
    const firstGrid = mainSection?.querySelector?.(".mb-field-grid");
    if (!mainSection || !firstGrid) return false;

    const section = document.createElement("div");
    section.id = sectionId;
    section.className = "mb-section";
    section.innerHTML = `
      <div class="mb-label">Square Hotkey #2 (Lower Priority)</div>
      <div class="mb-field-grid">
        <label class="mb-field"><span class="mb-field-label">Square Hotkey #2</span><input type="number" id="minibia-bot-auto-attack-aoe-hotkey-2" min="1" max="12" placeholder="6" /></label>
        <label class="mb-field"><span class="mb-field-label">Square #2 Min Monsters</span><input type="number" id="minibia-bot-auto-attack-aoe-monsters-2" min="1" placeholder="2" /></label>
        <label class="mb-field"><span class="mb-field-label">Square #2 Range</span><input type="number" id="minibia-bot-auto-attack-aoe-range-2" min="1" placeholder="3" /></label>
        <label class="mb-field"><span class="mb-field-label">Square #2 Cooldown MS</span><input type="number" id="minibia-bot-auto-attack-aoe-cooldown-2" min="0" placeholder="2000" /></label>
      </div>
      <div class="mb-small-note" id="minibia-bot-auto-attack-aoe-status-2">Square #2: off</div>`;

    firstGrid.insertAdjacentElement("afterend", section);

    section.querySelector("#minibia-bot-auto-attack-aoe-hotkey-2")?.addEventListener("change", (event) => updateConfig({ hotbarSlot: event.target.value }));
    section.querySelector("#minibia-bot-auto-attack-aoe-monsters-2")?.addEventListener("change", (event) => updateConfig({ minMonsters: event.target.value }));
    section.querySelector("#minibia-bot-auto-attack-aoe-range-2")?.addEventListener("change", (event) => updateConfig({ squareRange: event.target.value }));
    section.querySelector("#minibia-bot-auto-attack-aoe-cooldown-2")?.addEventListener("change", (event) => updateConfig({ cooldownMs: event.target.value }));
    refreshUi();
    return true;
  }

  function refreshUi() {
    const hotkey = document.getElementById("minibia-bot-auto-attack-aoe-hotkey-2");
    const monsters = document.getElementById("minibia-bot-auto-attack-aoe-monsters-2");
    const range = document.getElementById("minibia-bot-auto-attack-aoe-range-2");
    const cooldown = document.getElementById("minibia-bot-auto-attack-aoe-cooldown-2");
    const label = document.getElementById("minibia-bot-auto-attack-aoe-status-2");
    if (hotkey && document.activeElement !== hotkey) hotkey.value = config.hotbarSlot || "";
    if (monsters && document.activeElement !== monsters) monsters.value = config.minMonsters;
    if (range && document.activeElement !== range) range.value = config.squareRange;
    if (cooldown && document.activeElement !== cooldown) cooldown.value = config.cooldownMs;

    if (label) {
      const status = getPrimaryStatus();
      const primaryConfig = status?.config || {};
      if (!status?.running || !primaryConfig.enabled) {
        label.textContent = "Square #2: off";
        return;
      }
      const count = countMonsters(positiveInt(config.squareRange, 3), primaryConfig);
      if (primarySquareIsReady(status)) label.textContent = `Square #2: waiting — #1 ready (${count}/${config.minMonsters})`;
      else label.textContent = `Square #2: watching (${count}/${config.minMonsters})`;
    }
  }

  function primaryAoeEnabled() {
    const status = getPrimaryStatus();
    return !!status?.running && !!status?.config?.enabled;
  }

  function stopTimer() {
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function tickSecondSquare() {
    if (!primaryAoeEnabled()) {
      stopTimer();
      refreshUi();
      return;
    }
    try { triggerSecond(); }
    catch (error) { window.minibiaBot?.log?.("square hotkey #2 tick failed", error?.message || error); }
    refreshUi();
  }

  function syncTimer() {
    if (!primaryAoeEnabled()) {
      stopTimer();
      refreshUi();
      return;
    }
    if (state.timerId == null) state.timerId = window.setInterval(tickSecondSquare, 250);
  }

  function installUiOnce() {
    if (ensureUi()) return;
    let attempts = 0;
    state.uiRetryTimerId = window.setInterval(() => {
      attempts += 1;
      if (ensureUi() || attempts >= 40) {
        window.clearInterval(state.uiRetryTimerId);
        state.uiRetryTimerId = null;
      }
    }, 250);
  }

  window.minibiaSquareHotkey2 = {
    config,
    updateConfig,
    trigger: triggerSecond,
    syncTimer,
    status: () => ({
      config: { ...config },
      lastMonsterCount: state.lastMonsterCount,
      ready: canCastSecond(Date.now()),
      timerRunning: state.timerId != null,
    }),
  };

  installUiOnce();
  syncTimer();

  // Lightweight state synchronization only; no creature/world scan occurs here.
  // This allows Square #2 to start/stop with the primary AoE toggle without leaving
  // its 250 ms combat scanner alive while AoE is disabled.
  state.syncTimerId = window.setInterval(syncTimer, 1000);
})();