window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installQuickControlsSettingsModule = function installQuickControlsSettingsModule(bot) {
  if (!bot || bot.quickControlsSettings?.destroy) return bot?.quickControlsSettings;

  let observer = null;
  const runeV2StorageKey = "minibiaBot.runeV2.config";
  const runeV2State = { running: false, timerId: null, lastActivationAt: 0, nextManaThreshold: null };
  const runeV2StoredConfig = bot.storage.get(runeV2StorageKey, {}) || {};
  const runeV2LegacyManaCost = clampManaCost(runeV2StoredConfig.manaCost, 600);
  const runeV2Config = Object.assign({ minManaCost: 600, maxManaCost: 600, hotkey: "1", cooldownMs: 2100, enabled: false }, runeV2StoredConfig);
  if (!Object.prototype.hasOwnProperty.call(runeV2StoredConfig, "minManaCost")) runeV2Config.minManaCost = runeV2LegacyManaCost;
  if (!Object.prototype.hasOwnProperty.call(runeV2StoredConfig, "maxManaCost")) runeV2Config.maxManaCost = runeV2LegacyManaCost;
  delete runeV2Config.manaCost;

  // A saved profile can restore enabled=true before the Rune 2.0 checkbox is
  // installed. Do not auto-start from persisted config alone; the checkbox
  // change handler is the source of truth for starting/stopping the runtime.
  const runeV2SavedEnabled = runeV2Config.enabled === true;
  runeV2Config.enabled = false;

  delete runeV2Config.spellName;

  function removeLegacyRuneMakerUi() {
    document.getElementById("minibia-bot-rune-settings")?.remove();
    document.getElementById("minibia-bot-rune-enabled")?.closest?.("label")?.remove();
    document.getElementById("minibia-bot-rune-v2-spell-name")?.closest?.("label")?.remove();
    document.getElementById("minibia-bot-rune-v2-spell-name")?.remove?.();

    document.querySelectorAll("#minibia-bot-rune-v2-settings .mb-field").forEach((field) => {
      const label = String(field.querySelector?.(".mb-field-label")?.textContent || "")
        .trim()
        .toLowerCase();
      if (label === "rune 2.0 spell name" || label === "spell name") field.remove();
    });
  }

  function disableLegacyRuneMaker() {
    try {
      bot.rune?.stop?.();
      bot.rune?.updateConfig?.({ enabled: false });
    } catch (error) {
      bot.log?.("failed to disable legacy rune maker", error?.message || error);
    }
  }

  function clampHotbarSlot(value, fallback = 10) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 1 && numeric <= 12 ? numeric : fallback;
  }

  function clampManaCost(value, fallback = 600) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
  }

  function normalizeRuneV2Hotkey(value, fallback = "1") {
    const text = String(value ?? "").trim().toUpperCase();
    const match = text.match(/^F?(1[0-2]|[1-9])$/);
    if (match) return match[1];

    const fallbackText = String(fallback ?? "1").trim().toUpperCase();
    const fallbackMatch = fallbackText.match(/^F?(1[0-2]|[1-9])$/);
    return fallbackMatch ? fallbackMatch[1] : "1";
  }

  function normalizeRuneV2ManaRange(minValue, maxValue) {
    const minManaCost = clampManaCost(minValue, runeV2Config.minManaCost ?? 600);
    const maxManaCost = Math.max(minManaCost, clampManaCost(maxValue, runeV2Config.maxManaCost ?? minManaCost));
    return { minManaCost, maxManaCost };
  }
  function chooseNextRuneV2ManaThreshold() {
    const range = normalizeRuneV2ManaRange(runeV2Config.minManaCost, runeV2Config.maxManaCost);
    runeV2State.nextManaThreshold = range.minManaCost + Math.floor(Math.random() * (range.maxManaCost - range.minManaCost + 1));
    return runeV2State.nextManaThreshold;
  }
  function persistRuneV2Config() {
    delete runeV2Config.manaCost;
    bot.storage.set(runeV2StorageKey, { ...runeV2Config });
  }
  chooseNextRuneV2ManaThreshold();

  function getRuneV2GateStatus(now = Date.now()) {
    const stats = bot.rune?.readStats?.();
    const mana = stats?.mana;
    const nearbyMonsters = bot.hasteParalyzeMonsterRangeGuard?.getMonstersWithinRange?.(4) || [];
    const monsterSafe = nearbyMonsters.length === 0;
    if (runeV2State.nextManaThreshold == null) chooseNextRuneV2ManaThreshold();
    if (!mana) {
      return { hasStats: false, enoughHp: true, enoughMana: false, manaThreshold: runeV2State.nextManaThreshold,
        minManaCost: runeV2Config.minManaCost, maxManaCost: runeV2Config.maxManaCost,
        cooldownReady: false, cooldownRemainingMs: runeV2Config.cooldownMs, monsterSafe,
        nearbyMonsterCount: nearbyMonsters.length, canActivate: false };
    }
    const enoughMana = mana.current >= runeV2State.nextManaThreshold;
    const elapsedMs = now - runeV2State.lastActivationAt;
    const cooldownRemainingMs = Math.max(0, runeV2Config.cooldownMs - elapsedMs);
    const cooldownReady = cooldownRemainingMs === 0;

    return {
      hasStats: true,
      enoughHp: true,
      enoughMana,
      manaThreshold: runeV2State.nextManaThreshold,
      minManaCost: runeV2Config.minManaCost,
      maxManaCost: runeV2Config.maxManaCost,
      cooldownReady,
      cooldownRemainingMs,
      monsterSafe,
      nearbyMonsterCount: nearbyMonsters.length,
      canActivate: enoughMana && cooldownReady && monsterSafe,
    };
  }

  function tryRuneV2(now = Date.now()) {
    if (!runeV2State.running || !runeV2Config.enabled) return false;
    const gate = getRuneV2GateStatus(now);
    if (!gate.canActivate) return false;

    const slot = Number(normalizeRuneV2Hotkey(runeV2Config.hotkey, "1"));
    const clicked = bot.clickHotbar?.(slot - 1) === true;
    if (!clicked) return false;

    const usedManaThreshold = runeV2State.nextManaThreshold;
    runeV2State.lastActivationAt = Date.now();
    const nextManaThreshold = chooseNextRuneV2ManaThreshold();
    bot.log("rune spell 2.0 hotkey activated", { manaThreshold: usedManaThreshold, nextManaThreshold, hotkey: slot });
    return true;
  }

  function scheduleRuneV2Tick() {
    if (!runeV2State.running || !runeV2Config.enabled) return;
    if (runeV2State.timerId != null) window.clearTimeout(runeV2State.timerId);
    runeV2State.timerId = window.setTimeout(() => {
      runeV2State.timerId = null;
      if (!runeV2State.running || !runeV2Config.enabled) return;
      try {
        tryRuneV2();
      } catch (error) {
        bot.log("rune spell 2.0 tick failed", error?.message || error);
      } finally {
        scheduleRuneV2Tick();
      }
    }, 200);
  }

  function startRuneV2(overrides = {}) {
    updateRuneV2Config({ ...overrides, enabled: true });
    if (runeV2State.running) return false;
    runeV2State.running = true;
    scheduleRuneV2Tick();
    bot.log("rune spell 2.0 started", { ...runeV2Config });
    return true;
  }

  function stopRuneV2(options = {}) {
    runeV2State.running = false;
    runeV2Config.enabled = false;
    if (runeV2State.timerId != null) {
      window.clearTimeout(runeV2State.timerId);
      runeV2State.timerId = null;
    }
    if (options.persistEnabled !== false) {
      persistRuneV2Config();
    }
    bot.log("rune spell 2.0 stopped");
    return true;
  }

  function updateRuneV2Config(nextConfig = {}) {
    const normalized = { ...nextConfig };
    delete normalized.spellName;
    delete normalized.manaCost;
    const hasMinMana = Object.prototype.hasOwnProperty.call(normalized, "minManaCost");
    const hasMaxMana = Object.prototype.hasOwnProperty.call(normalized, "maxManaCost");
    if (hasMinMana || hasMaxMana) {
      const range = normalizeRuneV2ManaRange(hasMinMana ? normalized.minManaCost : runeV2Config.minManaCost,
        hasMaxMana ? normalized.maxManaCost : runeV2Config.maxManaCost);
      normalized.minManaCost = range.minManaCost;
      normalized.maxManaCost = range.maxManaCost;
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "hotkey")) {
      normalized.hotkey = normalizeRuneV2Hotkey(normalized.hotkey, runeV2Config.hotkey ?? "1");
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "cooldownMs")) {
      normalized.cooldownMs = Math.max(0, Math.trunc(Number(normalized.cooldownMs) || 0));
    }
    Object.assign(runeV2Config, normalized);
    delete runeV2Config.spellName;
    delete runeV2Config.manaCost;
    if (hasMinMana || hasMaxMana) chooseNextRuneV2ManaThreshold();
    persistRuneV2Config();
    return { ...runeV2Config };
  }

  bot.runeV2 = {
    start: startRuneV2,
    stop: stopRuneV2,
    tryActivate: tryRuneV2,
    getGateStatus: getRuneV2GateStatus,
    updateConfig: updateRuneV2Config,
    status: () => ({
      running: runeV2State.running,
      config: { ...runeV2Config },
      gates: getRuneV2GateStatus(),
      lastActivationAt: runeV2State.lastActivationAt,
    }),
    config: runeV2Config,
  };

  function makeField(labelText, input) {
    const label = document.createElement("label");
    label.className = "mb-field";
    const caption = document.createElement("span");
    caption.className = "mb-field-label";
    caption.textContent = labelText;
    label.append(caption, input);
    return label;
  }

  function installControls() {
    disableLegacyRuneMaker();
    removeLegacyRuneMakerUi();

    const eatToggle = document.getElementById("minibia-bot-auto-eat-enabled");
    const quickSection = eatToggle?.closest?.(".mb-section");
    const stack = quickSection?.querySelector?.(".mb-stack");
    if (!stack) return false;

    if (!document.getElementById("minibia-bot-rune-v2-settings")) {
      const runeV2Settings = document.createElement("div");
      runeV2Settings.id = "minibia-bot-rune-v2-settings";
      runeV2Settings.className = "mb-stack";

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "mb-toggle";
      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.id = "minibia-bot-rune-v2-enabled";
      toggleInput.checked = !!runeV2State.running;
      const toggleText = document.createElement("span");
      toggleText.textContent = "Enable Rune Spell 2.0";
      toggleLabel.append(toggleInput, toggleText);

      const minManaInput = document.createElement("input");
      minManaInput.type = "number"; minManaInput.id = "minibia-bot-rune-v2-min-mana-cost";
      minManaInput.min = "0"; minManaInput.step = "1";
      minManaInput.value = String(clampManaCost(runeV2Config.minManaCost, 600));
      const maxManaInput = document.createElement("input");
      maxManaInput.type = "number"; maxManaInput.id = "minibia-bot-rune-v2-max-mana-cost";
      maxManaInput.min = "0"; maxManaInput.step = "1";
      maxManaInput.value = String(clampManaCost(runeV2Config.maxManaCost, 600));
      function updateManaRangeFromInputs() {
        const range = normalizeRuneV2ManaRange(minManaInput.value, maxManaInput.value);
        minManaInput.value = String(range.minManaCost); maxManaInput.value = String(range.maxManaCost);
        updateRuneV2Config(range);
      }
      minManaInput.addEventListener("change", updateManaRangeFromInputs);
      maxManaInput.addEventListener("change", updateManaRangeFromInputs);

      const hotkeyInput = document.createElement("input");
      hotkeyInput.type = "text";
      hotkeyInput.id = "minibia-bot-rune-v2-hotkey";
      hotkeyInput.placeholder = "1-12 or F1-F12";
      hotkeyInput.value = String(runeV2Config.hotkey || "1");
      hotkeyInput.addEventListener("change", () => {
        const hotkey = normalizeRuneV2Hotkey(hotkeyInput.value, runeV2Config.hotkey ?? "1");
        hotkeyInput.value = hotkey;
        updateRuneV2Config({ hotkey });
      });

      toggleInput.addEventListener("change", () => {
        if (toggleInput.checked) startRuneV2();
        else stopRuneV2();
        toggleInput.checked = runeV2State.running;
      });

      runeV2Settings.append(
        toggleLabel,
        makeField("Rune 2.0 Minimum Mana", minManaInput),
        makeField("Rune 2.0 Maximum Mana", maxManaInput),
        makeField("Rune 2.0 Hotkey", hotkeyInput)
      );
      stack.prepend(runeV2Settings);

      // Preserve compatibility for a normal reload when Rune 2.0 was actually
      // enabled, but only after the checkbox exists so runtime and UI agree.
      if (runeV2SavedEnabled) {
        toggleInput.checked = true;
        toggleInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    if (!document.getElementById("minibia-bot-auto-eat-settings")) {
      const eatSettings = document.createElement("div");
      eatSettings.id = "minibia-bot-auto-eat-settings";
      eatSettings.className = "mb-stack";

      const hotkeyInput = document.createElement("input");
      hotkeyInput.type = "number";
      hotkeyInput.id = "minibia-bot-auto-eat-hotkey";
      hotkeyInput.min = "1";
      hotkeyInput.max = "12";
      hotkeyInput.step = "1";
      hotkeyInput.value = String(clampHotbarSlot(bot.eat?.config?.eatHotbarSlot, 10));
      hotkeyInput.addEventListener("change", () => {
        const eatHotbarSlot = clampHotbarSlot(hotkeyInput.value, bot.eat?.config?.eatHotbarSlot ?? 10);
        hotkeyInput.value = String(eatHotbarSlot);
        bot.eat?.updateConfig?.({ eatHotbarSlot });
      });

      eatSettings.append(makeField("Food Hotkey", hotkeyInput));
      eatToggle?.closest?.("label")?.after(eatSettings);
    }

    removeLegacyRuneMakerUi();
    return true;
  }

  function destroy() {
    observer?.disconnect?.();
    observer = null;
    stopRuneV2({ persistEnabled: false });
    document.getElementById("minibia-bot-rune-settings")?.remove();
    document.getElementById("minibia-bot-rune-v2-settings")?.remove();
    document.getElementById("minibia-bot-auto-eat-settings")?.remove();
  }

  bot.quickControlsSettings = { installControls, destroy };

  disableLegacyRuneMaker();
  removeLegacyRuneMakerUi();

  if (!installControls()) {
    observer = new MutationObserver(() => {
      disableLegacyRuneMaker();
      removeLegacyRuneMakerUi();
      if (installControls()) observer?.disconnect?.();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  bot.addCleanup?.(destroy);
  return bot.quickControlsSettings;
};
