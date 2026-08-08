window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installRuneV3KeyboardModule = function installRuneV3KeyboardModule(bot) {
  if (!bot || bot.runeV3?.destroy) return bot?.runeV3;

  const storageKey = "minibiaBot.runeV3.config";
  const state = {
    running: false,
    timerId: null,
    lastActivationAt: 0,
  };
  const config = Object.assign(
    {
      manaCost: 600,
      hotkey: "F1",
      shift: false,
      cooldownMs: 3500,
      enabled: false,
    },
    bot.storage.get(storageKey, {})
  );

  function normalizeHotkey(value, fallback = "F1") {
    const text = String(value ?? "").trim().toUpperCase();
    const match = text.match(/^F(1[0-2]|[1-9])$/);
    if (match) return `F${match[1]}`;
    const fallbackText = String(fallback ?? "F1").trim().toUpperCase();
    const fallbackMatch = fallbackText.match(/^F(1[0-2]|[1-9])$/);
    return fallbackMatch ? `F${fallbackMatch[1]}` : "F1";
  }

  function clampManaCost(value, fallback = 600) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
  }

  function persistConfig() {
    bot.storage.set(storageKey, { ...config });
  }

  function getGateStatus(now = Date.now()) {
    const stats = bot.rune?.readStats?.();
    const hp = stats?.hp;
    const mana = stats?.mana;
    const nearbyMonsters = bot.hasteParalyzeMonsterRangeGuard?.getMonstersWithinRange?.(4) || [];
    const monsterSafe = nearbyMonsters.length === 0;

    if (!hp || !mana) {
      return {
        hasStats: false,
        enoughHp: false,
        enoughMana: false,
        cooldownReady: false,
        cooldownRemainingMs: config.cooldownMs,
        monsterSafe,
        nearbyMonsterCount: nearbyMonsters.length,
        canActivate: false,
      };
    }

    const minHpPercent = Number(bot.rune?.config?.minHpPercent ?? 50);
    const hpPercent = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    const enoughHp = hpPercent >= minHpPercent;
    const enoughMana = mana.current >= config.manaCost;
    const elapsedMs = now - state.lastActivationAt;
    const cooldownRemainingMs = Math.max(0, config.cooldownMs - elapsedMs);
    const cooldownReady = cooldownRemainingMs === 0;

    return {
      hasStats: true,
      enoughHp,
      enoughMana,
      cooldownReady,
      cooldownRemainingMs,
      monsterSafe,
      nearbyMonsterCount: nearbyMonsters.length,
      canActivate: enoughHp && enoughMana && cooldownReady && monsterSafe,
    };
  }

  function dispatchFunctionKey() {
    const key = normalizeHotkey(config.hotkey, "F1");
    const target = document.activeElement || document.body || document.documentElement;
    const eventInit = {
      key,
      code: key,
      shiftKey: !!config.shift,
      bubbles: true,
      cancelable: true,
      composed: true,
    };

    target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    document.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    window.dispatchEvent(new KeyboardEvent("keydown", eventInit));

    window.setTimeout(() => {
      target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      document.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      window.dispatchEvent(new KeyboardEvent("keyup", eventInit));
    }, 40);

    return true;
  }

  function tryActivate(now = Date.now()) {
    if (!state.running || !config.enabled) return false;
    const gate = getGateStatus(now);
    if (!gate.canActivate) return false;

    if (!dispatchFunctionKey()) return false;

    state.lastActivationAt = Date.now();
    bot.log?.("rune spell 3.0 keyboard hotkey activated", {
      hotkey: normalizeHotkey(config.hotkey, "F1"),
      shift: !!config.shift,
      manaCost: config.manaCost,
    });
    return true;
  }

  function scheduleTick() {
    if (!state.running) return;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = window.setTimeout(() => {
      state.timerId = null;
      try {
        tryActivate();
      } catch (error) {
        bot.log?.("rune spell 3.0 tick failed", error?.message || error);
      } finally {
        scheduleTick();
      }
    }, 100);
  }

  function updateConfig(nextConfig = {}) {
    const normalized = { ...nextConfig };
    if (Object.prototype.hasOwnProperty.call(normalized, "manaCost")) {
      normalized.manaCost = clampManaCost(normalized.manaCost, config.manaCost ?? 600);
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "hotkey")) {
      normalized.hotkey = normalizeHotkey(normalized.hotkey, config.hotkey ?? "F1");
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "shift")) {
      normalized.shift = !!normalized.shift;
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "cooldownMs")) {
      normalized.cooldownMs = Math.max(0, Math.trunc(Number(normalized.cooldownMs) || 0));
    }
    Object.assign(config, normalized);
    persistConfig();
    return { ...config };
  }

  function start(overrides = {}) {
    updateConfig({ ...overrides, enabled: true });
    if (state.running) return false;
    state.running = true;
    scheduleTick();
    bot.log?.("rune spell 3.0 started", { ...config });
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    if (options.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }
    bot.log?.("rune spell 3.0 stopped");
    return true;
  }

  function installControls() {
    if (document.getElementById("minibia-bot-rune-v3-settings")) return true;
    const runeV2Settings = document.getElementById("minibia-bot-rune-v2-settings");
    const stack = runeV2Settings?.parentElement;
    if (!stack) return false;

    const settings = document.createElement("div");
    settings.id = "minibia-bot-rune-v3-settings";
    settings.className = "mb-stack";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "mb-toggle";
    const toggleInput = document.createElement("input");
    toggleInput.type = "checkbox";
    toggleInput.id = "minibia-bot-rune-v3-enabled";
    toggleInput.checked = !!state.running;
    const toggleText = document.createElement("span");
    toggleText.textContent = "Enable Rune Spell 3.0";
    toggleLabel.append(toggleInput, toggleText);

    const manaLabel = document.createElement("label");
    manaLabel.className = "mb-field";
    const manaCaption = document.createElement("span");
    manaCaption.className = "mb-field-label";
    manaCaption.textContent = "Rune 3.0 Mana Cost";
    const manaInput = document.createElement("input");
    manaInput.type = "number";
    manaInput.min = "0";
    manaInput.step = "1";
    manaInput.value = String(clampManaCost(config.manaCost, 600));
    manaLabel.append(manaCaption, manaInput);

    const hotkeyLabel = document.createElement("label");
    hotkeyLabel.className = "mb-field";
    const hotkeyCaption = document.createElement("span");
    hotkeyCaption.className = "mb-field-label";
    hotkeyCaption.textContent = "Rune 3.0 Hotkey";
    const hotkeySelect = document.createElement("select");
    hotkeySelect.id = "minibia-bot-rune-v3-hotkey";
    for (let index = 1; index <= 12; index += 1) {
      const option = document.createElement("option");
      option.value = `F${index}`;
      option.textContent = `F${index}`;
      hotkeySelect.appendChild(option);
    }
    hotkeySelect.value = normalizeHotkey(config.hotkey, "F1");
    hotkeyLabel.append(hotkeyCaption, hotkeySelect);

    const shiftLabel = document.createElement("label");
    shiftLabel.className = "mb-toggle";
    const shiftInput = document.createElement("input");
    shiftInput.type = "checkbox";
    shiftInput.id = "minibia-bot-rune-v3-shift";
    shiftInput.checked = !!config.shift;
    const shiftText = document.createElement("span");
    shiftText.textContent = "Shift";
    shiftLabel.append(shiftInput, shiftText);

    toggleInput.addEventListener("change", () => {
      if (toggleInput.checked) start();
      else stop();
      toggleInput.checked = state.running;
    });
    manaInput.addEventListener("change", () => {
      const manaCost = clampManaCost(manaInput.value, config.manaCost ?? 600);
      manaInput.value = String(manaCost);
      updateConfig({ manaCost });
    });
    hotkeySelect.addEventListener("change", () => updateConfig({ hotkey: hotkeySelect.value }));
    shiftInput.addEventListener("change", () => updateConfig({ shift: shiftInput.checked }));

    settings.append(toggleLabel, manaLabel, hotkeyLabel, shiftLabel);
    runeV2Settings.insertAdjacentElement("afterend", settings);
    return true;
  }

  let uiTimerId = null;
  if (!installControls()) {
    uiTimerId = window.setInterval(() => {
      if (installControls()) {
        window.clearInterval(uiTimerId);
        uiTimerId = null;
      }
    }, 250);
  }

  function destroy() {
    stop({ persistEnabled: false });
    if (uiTimerId != null) window.clearInterval(uiTimerId);
    uiTimerId = null;
    document.getElementById("minibia-bot-rune-v3-settings")?.remove();
  }

  bot.runeV3 = {
    start,
    stop,
    tryActivate,
    getGateStatus,
    updateConfig,
    status: () => ({
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      lastActivationAt: state.lastActivationAt,
    }),
    config,
    destroy,
  };

  if (config.enabled) start();
  bot.addCleanup?.(destroy);
  return bot.runeV3;
};
