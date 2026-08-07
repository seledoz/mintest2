window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installRuneModule = function installRuneModule(bot) {
  const configStorageKey = "minibiaBot.rune.config";
  const state = {
    running: false,
    timerId: null,
    watchdogId: null,
    lastTickAt: 0,
    tickInProgress: false,
    lastRuneAt: 0,
    lastAttemptAt: 0,
    pendingAttempt: null,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 100,
      minHpPercent: 50,
      minFoodSeconds: 30,
      runeHotbarSlot: 1,
      runeManaCost: 600,
      runeCooldownMs: 3500,
      runeRetryMs: 500,
      runeConfirmMs: 1200,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 100;

  function persistConfig() {
    delete config.runeSpellWords;
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeHotbarSlot(value = config.runeHotbarSlot) {
    const slot = Math.trunc(Number(value));
    return Number.isFinite(slot) && slot >= 1 && slot <= 12 ? slot : null;
  }

  function readStats() {
    const playerState = bot.getPlayerState();

    const hp = playerState
      ? { current: playerState.health ?? 0, max: playerState.maxHealth ?? 0 }
      : null;

    const mana = playerState
      ? { current: playerState.mana ?? 0, max: playerState.maxMana ?? 0 }
      : null;

    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    let food = null;
    if (foodText) {
      const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
      food = match
        ? {
            text: foodText,
            seconds: Number(match[1]) * 60 + Number(match[2]),
          }
        : { text: foodText, seconds: null };
    }

    return { hp, mana, food };
  }

  function resolvePendingAttempt(now = Date.now()) {
    const pending = state.pendingAttempt;
    if (!pending) return false;

    const manaNow = Number(readStats().mana?.current ?? NaN);
    if (Number.isFinite(manaNow) && manaNow < pending.manaBefore) {
      state.lastRuneAt = pending.attemptedAt;
      state.pendingAttempt = null;
      bot.log("confirmed rune hotkey cast", {
        slot: pending.slot,
        manaBefore: pending.manaBefore,
        manaAfter: manaNow,
      });
      return true;
    }

    if (now - pending.attemptedAt >= Math.max(200, Number(config.runeConfirmMs) || 1200)) {
      state.pendingAttempt = null;
      bot.log("rune hotkey did not register, will retry", {
        slot: pending.slot,
        mana: Number.isFinite(manaNow) ? manaNow : null,
      });
    }

    return false;
  }

  function getGateStatus(now = Date.now()) {
    const { hp, mana } = readStats();
    const slot = normalizeHotbarSlot();

    if (!hp || !mana) {
      return {
        hasStats: false,
        validHotbarSlot: !!slot,
        enoughHp: false,
        enoughMana: false,
        enoughFood: true,
        cooldownReady: false,
        retryReady: false,
        pending: !!state.pendingAttempt,
        cooldownRemainingMs: config.runeCooldownMs,
        canMakeRune: false,
      };
    }

    const hpPercent = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    const enoughHp = hpPercent >= config.minHpPercent;
    const enoughMana = mana.current >= config.runeManaCost;
    const enoughFood = true;
    const cooldownElapsedMs = now - state.lastRuneAt;
    const cooldownRemainingMs = Math.max(0, config.runeCooldownMs - cooldownElapsedMs);
    const cooldownReady = cooldownRemainingMs === 0;
    const retryReady = now - state.lastAttemptAt >= Math.max(100, Number(config.runeRetryMs) || 500);
    const pending = !!state.pendingAttempt;

    return {
      hasStats: true,
      validHotbarSlot: !!slot,
      enoughHp,
      enoughMana,
      enoughFood,
      cooldownReady,
      retryReady,
      pending,
      cooldownRemainingMs,
      canMakeRune: !!slot && enoughHp && enoughMana && cooldownReady && retryReady && !pending,
    };
  }

  function canMakeRune(now = Date.now()) {
    return getGateStatus(now).canMakeRune;
  }

  function tryMakeRune(now = Date.now()) {
    resolvePendingAttempt(now);

    const gateStatus = getGateStatus(now);
    if (!gateStatus.canMakeRune) {
      return false;
    }

    const slot = normalizeHotbarSlot();
    if (!slot) return false;

    const stats = readStats();
    const manaBefore = Number(stats.mana?.current ?? 0);
    const clicked = bot.clickHotbar?.(slot - 1);

    state.lastAttemptAt = now;

    if (!clicked) {
      bot.log("rune hotkey press failed, will retry", { slot, mana: manaBefore });
      return false;
    }

    state.pendingAttempt = {
      attemptedAt: now,
      slot,
      manaBefore,
    };

    bot.log("pressed rune maker hotkey", {
      slot,
      mana: manaBefore,
      requiredMana: config.runeManaCost,
    });
    return true;
  }

  function clearTickTimer() {
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
  }

  function scheduleNextTick() {
    if (!state.running) return;

    clearTickTimer();
    state.timerId = window.setTimeout(() => {
      state.timerId = null;
      tick();
    }, Math.max(25, Number(config.tickMs) || 100));
  }

  function runImmediateTick() {
    if (!state.running) return;

    clearTickTimer();
    tick();
  }

  function handleResume() {
    if (document.hidden) return;
    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) return;
    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) return;
    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function startWatchdog() {
    if (state.watchdogId != null) return;

    state.watchdogId = window.setInterval(() => {
      if (!state.running || state.tickInProgress) return;

      const staleForMs = Date.now() - state.lastTickAt;
      if (state.lastTickAt === 0 || staleForMs >= 2000 || state.timerId == null) {
        bot.log("rune loop watchdog restarting stalled timer", { staleForMs });
        runImmediateTick();
      }
    }, 1000);
  }

  function stopWatchdog() {
    if (state.watchdogId != null) {
      window.clearInterval(state.watchdogId);
      state.watchdogId = null;
    }
  }

  function tick() {
    if (!state.running || state.tickInProgress) return;

    state.tickInProgress = true;
    state.lastTickAt = Date.now();

    try {
      tryMakeRune();
    } catch (error) {
      bot.log("rune tick failed", error?.message || error);
    } finally {
      state.tickInProgress = false;
      state.lastTickAt = Date.now();
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 100;
    config.runeHotbarSlot = normalizeHotbarSlot(config.runeHotbarSlot) || 1;
    persistConfig();

    if (state.running) {
      bot.log("rune maker already running");
      runImmediateTick();
      return false;
    }

    state.running = true;
    state.lastTickAt = Date.now();
    state.lastAttemptAt = 0;
    state.pendingAttempt = null;
    attachResumeListeners();
    startWatchdog();
    bot.log("rune maker started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;
    state.tickInProgress = false;
    state.pendingAttempt = null;

    clearTickTimer();
    stopWatchdog();
    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("rune maker stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      stats: readStats(),
      gates: getGateStatus(),
      lastRuneAt: state.lastRuneAt,
      lastAttemptAt: state.lastAttemptAt,
      pendingAttempt: state.pendingAttempt ? { ...state.pendingAttempt } : null,
      lastTickAt: state.lastTickAt,
      watchdogRunning: state.watchdogId != null,
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    config.tickMs = 100;
    config.runeHotbarSlot = normalizeHotbarSlot(config.runeHotbarSlot) || 1;
    persistConfig();
    bot.log("rune config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.rune = {
    start,
    stop,
    status,
    readStats,
    getGateStatus,
    canMakeRune,
    tryMakeRune,
    config,
    updateConfig,
  };

  bot.startRuneLoop = start;
  bot.stopRuneLoop = stop;
};