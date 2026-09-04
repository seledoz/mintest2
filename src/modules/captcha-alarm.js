window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaptchaAlarmModule = function installCaptchaAlarmModule(bot) {
  if (!bot || bot.captchaAlarm) return bot?.captchaAlarm || null;

  const state = {
    active: false,
    visible: false,
    observer: null,
    beepTimerId: null,
    stopTimerId: null,
    clearCheckTimerId: null,
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
    return !!bot.redTextAlert?.config?.enabled;
  }

  function containsAntiBotTitle(text) {
    const normalized = normalizeText(text);
    return normalized.includes("anti-bot verification") || normalized.includes("anti bot verification");
  }

  function isActuallyVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;

    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    let current = element;
    while (current && current instanceof Element) {
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) <= 0.02) return false;
      if (current === document.body || current === document.documentElement) break;
      current = current.parentElement;
    }

    return true;
  }

  function matchingVisibleTextNode(root) {
    if (!root) return null;

    if (root.nodeType === Node.TEXT_NODE) {
      if (!containsAntiBotTitle(root.textContent || "")) return null;
      const parent = root.parentElement;
      return isActuallyVisible(parent) ? root : null;
    }

    if (!(root instanceof Element) && root !== document) return null;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (containsAntiBotTitle(node.textContent || "") && isActuallyVisible(node.parentElement)) return node;
      node = walker.nextNode();
    }
    return null;
  }

  function subtreeContainsTitleText(root) {
    if (!root) return false;
    if (root.nodeType === Node.TEXT_NODE) return containsAntiBotTitle(root.textContent || "");
    if (!(root instanceof Element) && root !== document) return false;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (containsAntiBotTitle(node.textContent || "")) return true;
      node = walker.nextNode();
    }
    return false;
  }

  function currentVisibleCaptcha() {
    return !!matchingVisibleTextNode(document.body || document.documentElement);
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

  function scheduleClearCheck() {
    if (state.clearCheckTimerId != null) return;
    state.clearCheckTimerId = window.setTimeout(() => {
      state.clearCheckTimerId = null;
      handleVisibleChange(currentVisibleCaptcha());
    }, 0);
  }

  function inspectMutation(mutation) {
    if (!alarmEnabled()) return false;

    if (mutation.type === "characterData") {
      if (matchingVisibleTextNode(mutation.target)) return handleVisibleChange(true);
      return false;
    }

    for (const node of mutation.addedNodes || []) {
      if (matchingVisibleTextNode(node)) return handleVisibleChange(true);
    }

    for (const node of mutation.removedNodes || []) {
      if (subtreeContainsTitleText(node)) {
        scheduleClearCheck();
        break;
      }
    }

    return false;
  }

  function check() {
    if (!alarmEnabled()) return handleVisibleChange(false);
    return handleVisibleChange(currentVisibleCaptcha());
  }

  function start() {
    if (state.observer) return false;

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

    window.setTimeout(check, 0);
    return true;
  }

  function stop() {
    state.observer?.disconnect();
    state.observer = null;
    if (state.clearCheckTimerId != null) {
      window.clearTimeout(state.clearCheckTimerId);
      state.clearCheckTimerId = null;
    }
    clearAlarmTimers();
    state.active = false;
    state.visible = false;
  }

  bot.captchaAlarm = {
    start,
    stop,
    check,
    status: () => ({
      active: state.active,
      enabled: alarmEnabled(),
      visible: state.visible,
      lastTriggerAt: state.lastTriggerAt,
      alarmDurationMs,
      beepIntervalMs,
      polling: false,
    }),
  };

  start();
  bot.addCleanup?.(stop);
  return bot.captchaAlarm;
};
