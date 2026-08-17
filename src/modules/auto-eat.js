window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoEatModule = function installAutoEatModule(bot) {
  const configStorageKey = "minibiaBot.eat.config";
  const state = {
    running: false,
    timerId: null,
    lastFoodAt: 0,
    lastTimedEatAt: 0,
    panelObserver: null,
  };

  const config = Object.assign(
    {
      tickMs: 1000,
      eatCooldownMs: 60000,
      eatHotbarSlot: 10,
      timedEatEnabled: false,
      timedEatIntervalMs: 600000,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 1000;
  config.timedEatEnabled = !!config.timedEatEnabled;
  config.timedEatIntervalMs = Math.max(60000, Number(config.timedEatIntervalMs) || 600000);

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeHotbarSlot(slot) {
    const value = Number(slot);
    if (!Number.isFinite(value)) {
      return null;
    }

    const normalized = Math.trunc(value);
    if (normalized < 1 || normalized > 12) {
      return null;
    }

    return normalized;
  }

  function normalizeTimedEatIntervalMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 600000;
    return Math.max(60000, Math.trunc(numeric));
  }

  function readFoodTimer() {
    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    if (!foodText) return null;

    const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
    return match
      ? {
          text: foodText,
          seconds: Number(match[1]) * 60 + Number(match[2]),
        }
      : { text: foodText, seconds: null };
  }

  function isSated() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;

    if (conditions?.has && conditions.SATED != null) {
      return conditions.has(conditions.SATED);
    }

    const food = readFoodTimer();
    if (food?.seconds != null) {
      return food.seconds > 0;
    }

    return true;
  }

  function useFoodHotbar(reason) {
    const slot = normalizeHotbarSlot(config.eatHotbarSlot);
    if (!slot) {
      return false;
    }

    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      const now = Date.now();
      state.lastFoodAt = now;
      state.lastTimedEatAt = now;
      bot.log("used eat hotkey", { slot, reason });
    }
    return clicked;
  }

  function tryEat() {
    if (!config.enabled) {
      return false;
    }

    if (isSated()) {
      return false;
    }

    if (Date.now() - state.lastFoodAt < config.eatCooldownMs) {
      return false;
    }

    return useFoodHotbar("food timer / sated check");
  }

  function tryTimedEat() {
    if (!config.enabled || !config.timedEatEnabled) {
      return false;
    }

    const now = Date.now();
    const intervalMs = normalizeTimedEatIntervalMs(config.timedEatIntervalMs);

    if (!state.lastTimedEatAt) {
      state.lastTimedEatAt = now;
      return false;
    }

    if (now - state.lastTimedEatAt < intervalMs) {
      return false;
    }

    if (now - state.lastFoodAt < config.eatCooldownMs) {
      return false;
    }

    const clicked = useFoodHotbar("timed fallback");
    if (!clicked) {
      // Avoid retrying every one-second tick if the hotbar click is temporarily unavailable.
      state.lastTimedEatAt = now;
    }
    return clicked;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      const ateFromStatus = tryEat();
      if (!ateFromStatus) {
        tryTimedEat();
      }
    } catch (error) {
      bot.log("auto eat tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 1000;
    config.timedEatEnabled = !!config.timedEatEnabled;
    config.timedEatIntervalMs = normalizeTimedEatIntervalMs(config.timedEatIntervalMs);
    if (config.timedEatEnabled && !state.lastTimedEatAt) {
      state.lastTimedEatAt = Date.now();
    }
    persistConfig();

    if (state.running) {
      bot.log("auto eat already running");
      return false;
    }

    state.running = true;
    bot.log("auto eat started", {
      eatCooldownMs: config.eatCooldownMs,
      eatHotbarSlot: config.eatHotbarSlot,
      timedEatEnabled: config.timedEatEnabled,
      timedEatIntervalMs: config.timedEatIntervalMs,
    });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("auto eat stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      lastFoodAt: state.lastFoodAt,
      lastTimedEatAt: state.lastTimedEatAt,
      isSated: isSated(),
    };
  }

  function updateConfig(nextConfig = {}) {
    const previousTimedEatEnabled = !!config.timedEatEnabled;

    if (Object.prototype.hasOwnProperty.call(nextConfig, "eatHotbarSlot")) {
      nextConfig.eatHotbarSlot = normalizeHotbarSlot(nextConfig.eatHotbarSlot) ?? config.eatHotbarSlot;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "eatCooldownMs")) {
      nextConfig.eatCooldownMs = Math.max(0, Number(nextConfig.eatCooldownMs) || 0);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "timedEatEnabled")) {
      nextConfig.timedEatEnabled = !!nextConfig.timedEatEnabled;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "timedEatIntervalMs")) {
      nextConfig.timedEatIntervalMs = normalizeTimedEatIntervalMs(nextConfig.timedEatIntervalMs);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 1000;
    config.timedEatIntervalMs = normalizeTimedEatIntervalMs(config.timedEatIntervalMs);

    if (config.timedEatEnabled && !previousTimedEatEnabled) {
      state.lastTimedEatAt = Date.now();
    }

    persistConfig();
    refreshTimedEatControls();
    bot.log("auto eat config updated", { ...config });
    return { ...config };
  }

  function refreshTimedEatControls() {
    const enabledInput = document.getElementById("minibia-bot-auto-eat-timer-enabled");
    const minutesInput = document.getElementById("minibia-bot-auto-eat-timer-minutes");
    if (enabledInput) enabledInput.checked = !!config.timedEatEnabled;
    if (minutesInput && minutesInput !== document.activeElement) {
      minutesInput.value = String(Math.max(1, Math.round(config.timedEatIntervalMs / 60000)));
      minutesInput.disabled = !config.timedEatEnabled;
    }
  }

  function installTimedEatControls() {
    if (document.getElementById("minibia-bot-auto-eat-timer-enabled")) {
      refreshTimedEatControls();
      return true;
    }

    const autoEatToggle = document.getElementById("minibia-bot-auto-eat-enabled");
    const autoEatLabel = autoEatToggle?.closest?.("label");
    const stack = autoEatLabel?.parentElement;
    if (!autoEatLabel || !stack) return false;

    const timerToggleLabel = document.createElement("label");
    timerToggleLabel.className = "mb-toggle";
    timerToggleLabel.innerHTML = '<input type="checkbox" id="minibia-bot-auto-eat-timer-enabled" /><span>Timed Auto Eat</span>';

    const timerField = document.createElement("label");
    timerField.className = "mb-field";
    timerField.id = "minibia-bot-auto-eat-timer-field";
    timerField.innerHTML = '<span class="mb-field-label">Eat Every (minutes)</span><input type="number" id="minibia-bot-auto-eat-timer-minutes" min="1" step="1" inputmode="numeric" /><span class="mb-small-note">While Auto Eat is enabled, this also presses the food hotkey on this interval. The normal 00:00 check still works.</span>';

    autoEatLabel.insertAdjacentElement("afterend", timerToggleLabel);
    timerToggleLabel.insertAdjacentElement("afterend", timerField);

    const enabledInput = timerToggleLabel.querySelector("#minibia-bot-auto-eat-timer-enabled");
    const minutesInput = timerField.querySelector("#minibia-bot-auto-eat-timer-minutes");

    enabledInput?.addEventListener("change", () => {
      updateConfig({ timedEatEnabled: !!enabledInput.checked });
    });

    const saveMinutes = () => {
      const minutes = Math.max(1, Math.trunc(Number(minutesInput?.value) || 1));
      if (minutesInput) minutesInput.value = String(minutes);
      updateConfig({ timedEatIntervalMs: minutes * 60000 });
    };
    minutesInput?.addEventListener("change", saveMinutes);
    minutesInput?.addEventListener("blur", saveMinutes);

    refreshTimedEatControls();
    return true;
  }

  function watchForPanel() {
    if (installTimedEatControls()) return;
    if (state.panelObserver) return;

    state.panelObserver = new MutationObserver(() => {
      if (!installTimedEatControls()) return;
      state.panelObserver?.disconnect();
      state.panelObserver = null;
    });
    state.panelObserver.observe(document.documentElement, { childList: true, subtree: true });
    bot.addCleanup?.(() => {
      state.panelObserver?.disconnect();
      state.panelObserver = null;
    });
  }

  if (config.enabled) {
    start();
  }

  bot.eat = {
    start,
    stop,
    status,
    updateConfig,
    isSated,
    tryEat,
    tryTimedEat,
    normalizeHotbarSlot,
    config,
  };

  bot.startAutoEat = start;
  bot.stopAutoEat = stop;

  if (bot.rune) {
    bot.rune.startAutoEat = start;
    bot.rune.stopAutoEat = stop;
    bot.rune.tryEat = tryEat;
    bot.rune.isSated = isSated;
  }

  watchForPanel();
};
