window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaptchaAlarmModule = function installCaptchaAlarmModule(bot) {
  if (!bot || bot.captchaAlarm) return bot?.captchaAlarm || null;

  const state = {
    active: false,
    observer: null,
    pollTimerId: null,
    beepTimerId: null,
    stopTimerId: null,
    lastTriggerAt: 0,
  };

  const cooldownMs = 5000;
  const alarmDurationMs = 10000;
  const beepIntervalMs = 1000;

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function alarmEnabled() {
    const status = bot.redTextAlert?.status?.();
    if (status?.config && typeof status.config.enabled === "boolean") return !!status.config.enabled;
    return !!bot.redTextAlert?.config?.enabled;
  }

  function captchaVisible() {
    const bodyText = normalizeText(document.body?.innerText || document.body?.textContent || "");
    if (!bodyText) return false;

    const hasTitle = bodyText.includes("anti-bot verification");
    const hasPatternPrompt =
      bodyText.includes("watch the symbols light up") ||
      bodyText.includes("repeat the order");
    const hasVerificationControls =
      bodyText.includes("time left") &&
      (bodyText.includes("show again") || bodyText.includes("delay 30s") || bodyText.includes("delay"));

    return hasTitle || hasPatternPrompt || hasVerificationControls;
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

  function check() {
    if (!alarmEnabled()) {
      state.active = false;
      clearAlarmTimers();
      return false;
    }

    const visible = captchaVisible();
    const now = Date.now();

    if (visible && !state.active && now - state.lastTriggerAt >= cooldownMs) {
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

    if (!visible) state.active = false;
    return false;
  }

  function start() {
    if (state.observer || state.pollTimerId) return false;

    state.observer = new MutationObserver(check);
    state.observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });

    state.pollTimerId = window.setInterval(check, 500);
    window.setTimeout(check, 0);
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
  }

  bot.captchaAlarm = {
    start,
    stop,
    check,
    status: () => ({
      active: state.active,
      enabled: alarmEnabled(),
      visible: captchaVisible(),
      lastTriggerAt: state.lastTriggerAt,
      alarmDurationMs,
      beepIntervalMs,
    }),
  };

  start();
  bot.addCleanup?.(stop);
  return bot.captchaAlarm;
};
