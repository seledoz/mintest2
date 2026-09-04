window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaptchaAlarmModule = function installCaptchaAlarmModule(bot) {
  if (!bot || bot.captchaAlarm) return bot?.captchaAlarm || null;

  const state = {
    active: false,
    visible: false,
    observer: null,
    pollTimerId: null,
    beepTimerId: null,
    stopTimerId: null,
    lastTriggerAt: 0,
  };

  const cooldownMs = 5000;
  const alarmDurationMs = 10000;
  const beepIntervalMs = 1000;
  const fallbackPollMs = 2000;

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[‐‑‒–—−]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function alarmEnabled() {
    return !!bot.redTextAlert?.config?.enabled;
  }

  function containsAntiBotTitle(text) {
    const normalized = normalizeText(text);
    return normalized.includes("anti-bot verification") || normalized.includes("anti bot verification");
  }

  function nodeContainsAntiBotTitle(node) {
    if (!node) return false;
    if (node.nodeType === Node.TEXT_NODE) return containsAntiBotTitle(node.textContent || "");
    if (!(node instanceof Element)) return false;

    if (containsAntiBotTitle(node.textContent || "")) return true;

    for (const child of Array.from(node.querySelectorAll?.("*") || [])) {
      if (containsAntiBotTitle(child.textContent || "")) return true;
    }
    return false;
  }

  function fullPageFallbackCheck() {
    return containsAntiBotTitle(document.body?.innerText || document.body?.textContent || "");
  }

  function clearAlarmTimers() {
    if (state.beepTimerId != null) {
      window.clearInterval(state.beepTimerId);
      state.beepTimerId = null;
    }
    if (state.stopTimerId != null) {
      window.clearTimeout(state.stopTimerId);
      state.stopTimerId = null;
    }
  }

  function normalCaptchaBeep() {
    if (typeof bot.redTextAlert?.beep === "function") return bot.redTextAlert.beep();
    return false;
  }

  function playTenSecondAlarm() {
    clearAlarmTimers();
    normalCaptchaBeep();
    state.beepTimerId = window.setInterval(normalCaptchaBeep, beepIntervalMs);
    state.stopTimerId = window.setTimeout(() => {
      clearAlarmTimers();
      bot.log?.("captcha alarm finished", { durationMs: alarmDurationMs });
    }, alarmDurationMs);
  }

  function handleVisibleChange(visible) {
    if (!alarmEnabled()) {
      state.active = false;
      state.visible = false;
      clearAlarmTimers();
      return false;
    }

    state.visible = !!visible;
    const now = Date.now();

    if (state.visible && !state.active && now - state.lastTriggerAt >= cooldownMs) {
      state.active = true;
      state.lastTriggerAt = now;
      playTenSecondAlarm();
      bot.log?.("captcha alarm triggered", {
        type: "anti-bot-verification",
        sound: "normal-captcha-beep",
        durationMs: alarmDurationMs,
      });
      return true;
    }

    if (!state.visible) state.active = false;
    return false;
  }

  function inspectMutation(mutation) {
    if (!alarmEnabled()) return false;

    if (mutation.type === "characterData") {
      return nodeContainsAntiBotTitle(mutation.target) ? handleVisibleChange(true) : false;
    }

    for (const node of mutation.addedNodes || []) {
      if (nodeContainsAntiBotTitle(node)) return handleVisibleChange(true);
    }

    for (const node of mutation.removedNodes || []) {
      if (nodeContainsAntiBotTitle(node)) {
        window.setTimeout(() => handleVisibleChange(fullPageFallbackCheck()), 0);
        break;
      }
    }

    return false;
  }

  function fallbackCheck() {
    if (!alarmEnabled()) {
      handleVisibleChange(false);
      return false;
    }
    return handleVisibleChange(fullPageFallbackCheck());
  }

  function start() {
    if (state.observer || state.pollTimerId) return false;

    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (inspectMutation(mutation)) return;
      }
    });

    state.observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    state.pollTimerId = window.setInterval(fallbackCheck, fallbackPollMs);
    window.setTimeout(fallbackCheck, 0);
    return true;
  }

  function stop() {
    state.observer?.disconnect();
    state.observer = null;
    if (state.pollTimerId != null) {
      window.clearInterval(state.pollTimerId);
      state.pollTimerId = null;
    }
    clearAlarmTimers();
    state.active = false;
    state.visible = false;
  }

  bot.captchaAlarm = {
    start,
    stop,
    check: fallbackCheck,
    status: () => ({
      active: state.active,
      enabled: alarmEnabled(),
      visible: state.visible,
      lastTriggerAt: state.lastTriggerAt,
      alarmDurationMs,
      beepIntervalMs,
      fallbackPollMs,
    }),
  };

  start();
  bot.addCleanup?.(stop);
  return bot.captchaAlarm;
};
