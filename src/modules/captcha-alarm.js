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
      .replace(/[‐‑‒–—−]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function alarmEnabled() {
    const status = bot.redTextAlert?.status?.();
    if (status?.config && typeof status.config.enabled === "boolean") return !!status.config.enabled;
    return !!bot.redTextAlert?.config?.enabled;
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.02;
  }

  function containsAntiBotTitle(text) {
    const normalized = normalizeText(text);
    return normalized.includes("anti-bot verification") || normalized.includes("anti bot verification");
  }

  function captchaVisible() {
    const elements = Array.from(document.body?.querySelectorAll?.("*") || []);
    for (const element of elements) {
      if (!isVisibleElement(element)) continue;
      const ownText = normalizeText(
        Array.from(element.childNodes || [])
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent || "")
          .join(" ")
      );
      if (containsAntiBotTitle(ownText)) return true;
    }

    // Fallback for clients that render the title as one larger text block.
    const bodyText = normalizeText(document.body?.innerText || "");
    return containsAntiBotTitle(bodyText);
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
