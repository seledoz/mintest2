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
  const strongMarkers = [
    "anti-bot verification",
    "watch the symbols light up",
    "repeat the order",
  ];
  const supportingMarkers = [
    "show again",
    "time left",
    "delay 30s",
  ];

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function captchaVisible() {
    const bodyText = normalizeText(document.body?.innerText || document.body?.textContent || "");
    if (!bodyText) return false;

    const strongMatches = strongMarkers.filter((marker) => bodyText.includes(marker)).length;
    const supportingMatches = supportingMarkers.filter((marker) => bodyText.includes(marker)).length;
    return strongMatches >= 2 || (strongMatches >= 1 && supportingMatches >= 2);
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

  function playTenSecondAlarm() {
    clearAlarmTimers();

    // Use the exact same existing alarm/beep function as the older alerts.
    bot.playAlarm?.();
    state.beepTimerId = window.setInterval(() => bot.playAlarm?.(), beepIntervalMs);
    state.stopTimerId = window.setTimeout(() => {
      clearAlarmTimers();
      bot.log?.("captcha alarm finished", { durationMs: alarmDurationMs });
    }, alarmDurationMs);
  }

  function check() {
    const visible = captchaVisible();
    const now = Date.now();

    if (visible && !state.active && now - state.lastTriggerAt >= cooldownMs) {
      state.active = true;
      state.lastTriggerAt = now;
      playTenSecondAlarm();
      bot.log?.("captcha alarm triggered", {
        type: "anti-bot-verification",
        durationMs: alarmDurationMs,
      });
      return true;
    }

    if (!visible) state.active = false;
    return false;
  }

  function start() {
    if (state.observer || state.pollTimerId) return false;

    state.observer = new MutationObserver(() => check());
    state.observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });

    state.pollTimerId = window.setInterval(check, 1000);
    check();
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
      lastTriggerAt: state.lastTriggerAt,
      alarmDurationMs,
      beepIntervalMs,
    }),
  };

  start();
  bot.addCleanup?.(stop);
  return bot.captchaAlarm;
};
