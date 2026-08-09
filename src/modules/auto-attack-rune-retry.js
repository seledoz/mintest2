(() => {
  const retryMs = 100;
  const globalKey = "__minibiaAutoAttackRuneRetry";

  const previous = window[globalKey];
  if (previous?.timerId != null) window.clearInterval(previous.timerId);
  previous?.restore?.();

  const state = { timerId: null, attack: null, restore: null };

  function hasRuneHotkey(attack) {
    return !!attack?.normalizeHotbarSlot?.(attack.config?.runeHotbarSlot);
  }

  function isAttackActive(attack) {
    if (!attack || attack !== window.minibiaBot?.attack) return false;
    const status = attack.status?.();
    return !!status?.running && !!status?.config?.enabled && hasRuneHotkey(attack);
  }

  function stopTimer() {
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function tick() {
    try {
      const attack = window.minibiaBot?.attack || null;
      if (!isAttackActive(attack)) {
        stopTimer();
        return;
      }
      if (attack.getCurrentTarget?.()) attack.triggerRune?.(Date.now());
    } catch (error) {
      window.minibiaBot?.log?.("auto attack rune retry failed", error?.message || error);
    }
  }

  function syncTimer() {
    const attack = window.minibiaBot?.attack || null;
    state.attack = attack;
    if (!isAttackActive(attack)) {
      stopTimer();
      return;
    }
    if (state.timerId == null) state.timerId = window.setInterval(tick, retryMs);
  }

  function install() {
    const attack = window.minibiaBot?.attack;
    if (!attack || attack.__runeRetryTimerWrapped) return !!attack;

    const originalStart = attack.start?.bind(attack);
    const originalStop = attack.stop?.bind(attack);
    const originalUpdateConfig = attack.updateConfig?.bind(attack);

    if (originalStart) attack.start = (...args) => {
      const result = originalStart(...args);
      syncTimer();
      return result;
    };
    if (originalStop) attack.stop = (...args) => {
      const result = originalStop(...args);
      stopTimer();
      return result;
    };
    if (originalUpdateConfig) attack.updateConfig = (...args) => {
      const result = originalUpdateConfig(...args);
      syncTimer();
      return result;
    };

    attack.__runeRetryTimerWrapped = true;
    state.restore = () => {
      stopTimer();
      if (originalStart) attack.start = originalStart;
      if (originalStop) attack.stop = originalStop;
      if (originalUpdateConfig) attack.updateConfig = originalUpdateConfig;
      delete attack.__runeRetryTimerWrapped;
    };
    syncTimer();
    return true;
  }

  install();
  if (!state.attack) {
    let attempts = 0;
    const startupId = window.setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) window.clearInterval(startupId);
    }, 100);
  }

  window[globalKey] = state;
})();
