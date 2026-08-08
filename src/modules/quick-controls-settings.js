window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installQuickControlsSettingsModule = function installQuickControlsSettingsModule(bot) {
  if (!bot || bot.quickControlsSettings?.destroy) return bot?.quickControlsSettings;

  let observer = null;
  const runeV2StorageKey = "minibiaBot.runeV2.config";
  const runeV2State = {
    running: false,
    timerId: null,
    lastActivationAt: 0,
  };
  const runeV2Config = Object.assign(
    {
      spellName: "",
      manaCost: 600,
      hotkey: "1",
      cooldownMs: 3500,
      enabled: false,
    },
    bot.storage.get(runeV2StorageKey, {})
  );

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

  function persistRuneV2Config() {
    bot.storage.set(runeV2StorageKey, { ...runeV2Config });
  }

  function getRuneV2GateStatus(now = Date.now()) {
    const stats = bot.rune?.readStats?.();
    const hp = stats?.hp;
    const mana = stats?.mana;
    if (!hp || !mana) {
      return {
        hasStats: false,
        enoughHp: false,
        enoughMana: false,
        cooldownReady: false,
        cooldownRemainingMs: runeV2Config.cooldownMs,
        canActivate: false,
      };
    }

    const minHpPercent = Number(bot.rune?.config?.minHpPercent ?? 50);
    const hpPercent = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    const enoughHp = hpPercent >= minHpPercent;
    const enoughMana = mana.current >= runeV2Config.manaCost;
    const elapsedMs = now - runeV2State.lastActivationAt;
    const cooldownRemainingMs = Math.max(0, runeV2Config.cooldownMs - elapsedMs);
    const cooldownReady = cooldownRemainingMs === 0;

    return {
      hasStats: true,
      enoughHp,
      enoughMana,
      cooldownReady,
      cooldownRemainingMs,
      canActivate: enoughHp && enoughMana && cooldownReady,
    };
  }

  function tryRuneV2(now = Date.now()) {
    if (!runeV2State.running || !runeV2Config.enabled) return false;

    const gate = getRuneV2GateStatus(now);
    if (!gate.canActivate) return false;

    const slot = Number(normalizeRuneV2Hotkey(runeV2Config.hotkey, "1"));
    const clicked = bot.clickHotbar?.(slot - 1) === true;
    if (!clicked) return false;

    runeV2State.lastActivationAt = Date.now();
    bot.log("rune spell 2.0 hotkey activated", {
      spellName: runeV2Config.spellName,
      manaCost: runeV2Config.manaCost,
      hotkey: slot,
    });
    return true;
  }

  function scheduleRuneV2Tick() {
    if (!runeV2State.running) return;
    if (runeV2State.timerId != null) window.clearTimeout(runeV2State.timerId);
    runeV2State.timerId = window.setTimeout(() => {
      runeV2State.timerId = null;
      try {
        tryRuneV2();
      } catch (error) {
        bot.log("rune spell 2.0 tick failed", error?.message || error);
      } finally {
        scheduleRuneV2Tick();
      }
    }, 100);
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
    if (runeV2State.timerId != null) {
      window.clearTimeout(runeV2State.timerId);
      runeV2State.timerId = null;
    }
    if (options.persistEnabled !== false) {
      runeV2Config.enabled = false;
      persistRuneV2Config();
    }
    bot.log("rune spell 2.0 stopped");
    return true;
  }

  function updateRuneV2Config(nextConfig = {}) {
    const normalized = { ...nextConfig };
    if (Object.prototype.hasOwnProperty.call(normalized, "spellName")) {
      normalized.spellName = String(normalized.spellName || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "manaCost")) {
      normalized.manaCost = clampManaCost(normalized.manaCost, runeV2Config.manaCost ?? 600);
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "hotkey")) {
      normalized.hotkey = normalizeRuneV2Hotkey(normalized.hotkey, runeV2Config.hotkey ?? "1");
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "cooldownMs")) {
      normalized.cooldownMs = Math.max(0, Math.trunc(Number(normalized.cooldownMs) || 0));
    }
    Object.assign(runeV2Config, normalized);
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
    const runeToggle = document.getElementById("minibia-bot-rune-enabled");
    const eatToggle = document.getElementById("minibia-bot-auto-eat-enabled");
    const quickSection = runeToggle?.closest?.(".mb-section") || eatToggle?.closest?.(".mb-section");
    const stack = quickSection?.querySelector?.(".mb-stack");
    if (!stack) return false;

    if (!document.getElementById("minibia-bot-rune-settings")) {
      const runeSettings = document.createElement("div");
      runeSettings.id = "minibia-bot-rune-settings";
      runeSettings.className = "mb-stack";

      const spellInput = document.createElement("input");
      spellInput.type = "text";
      spellInput.id = "minibia-bot-rune-spell-words";
      spellInput.placeholder = "adori vita vis";
      spellInput.value = String(bot.rune?.config?.runeSpellWords || "adori vita vis");
      spellInput.addEventListener("change", () => {
        const runeSpellWords = spellInput.value.trim() || String(bot.rune?.config?.runeSpellWords || "adori vita vis");
        spellInput.value = runeSpellWords;
        bot.rune?.updateConfig?.({ runeSpellWords });
      });

      const manaInput = document.createElement("input");
      manaInput.type = "number";
      manaInput.id = "minibia-bot-rune-mana-cost";
      manaInput.min = "0";
      manaInput.step = "1";
      manaInput.value = String(clampManaCost(bot.rune?.config?.runeManaCost, 600));
      manaInput.addEventListener("change", () => {
        const runeManaCost = clampManaCost(manaInput.value, bot.rune?.config?.runeManaCost ?? 600);
        manaInput.value = String(runeManaCost);
        bot.rune?.updateConfig?.({ runeManaCost });
      });

      runeSettings.append(
        makeField("Rune Spell", spellInput),
        makeField("Rune Mana Cost", manaInput)
      );
      runeToggle?.closest?.("label")?.after(runeSettings);
    }

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

      const spellNameInput = document.createElement("input");
      spellNameInput.type = "text";
      spellNameInput.id = "minibia-bot-rune-v2-spell-name";
      spellNameInput.placeholder = "Spell name";
      spellNameInput.value = runeV2Config.spellName;
      spellNameInput.addEventListener("change", () => {
        const spellName = spellNameInput.value.trim();
        spellNameInput.value = spellName;
        updateRuneV2Config({ spellName });
      });

      const manaInput = document.createElement("input");
      manaInput.type = "number";
      manaInput.id = "minibia-bot-rune-v2-mana-cost";
      manaInput.min = "0";
      manaInput.step = "1";
      manaInput.value = String(clampManaCost(runeV2Config.manaCost, 600));
      manaInput.addEventListener("change", () => {
        const manaCost = clampManaCost(manaInput.value, runeV2Config.manaCost ?? 600);
        manaInput.value = String(manaCost);
        updateRuneV2Config({ manaCost });
      });

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
        makeField("Rune 2.0 Spell Name", spellNameInput),
        makeField("Rune 2.0 Mana Cost", manaInput),
        makeField("Rune 2.0 Hotkey", hotkeyInput)
      );

      const runeSettings = document.getElementById("minibia-bot-rune-settings");
      if (runeSettings) runeSettings.after(runeV2Settings);
      else runeToggle?.closest?.("label")?.after(runeV2Settings);
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

  if (!installControls()) {
    observer = new MutationObserver(() => {
      if (installControls()) observer?.disconnect?.();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (runeV2Config.enabled) startRuneV2();

  bot.addCleanup?.(destroy);
  return bot.quickControlsSettings;
};
