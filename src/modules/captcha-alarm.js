(() => {
  const bot = window.minibiaBot;
  if (!bot) return;

  const state = {
    active: false,
    observer: null,
    pollTimerId: null,
    lastTriggerAt: 0,
  };

  const cooldownMs = 5000;
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

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function getCandidateText() {
    const candidates = Array.from(document.querySelectorAll("body *"));
    let combined = "";
    for (const element of candidates) {
      if (!isVisible(element)) continue;
      const text = normalizeText(element.textContent || element.innerText || "");
      if (!text) continue;
      if (strongMarkers.some((marker) => text.includes(marker))) {
        combined += ` ${text}`;
        if (combined.length > 12000) break;
      }
    }
    return normalizeText(combined);
  }

  function captchaVisible() {
    const bodyText = normalizeText(document.body?.innerText || document.body?.textContent || "");
    if (!bodyText) return false;

    const strongMatches = strongMarkers.filter((marker) => bodyText.includes(marker)).length;
    const supportingMatches = supportingMarkers.filter((marker) => bodyText.includes(marker)).length;

    // Require multiple independent strings from the Anti-bot Verification modal so
    // normal game/chat text cannot trigger the alarm accidentally.
    return strongMatches >= 2 || (strongMatches >= 1 && supportingMatches >= 2);
  }

  function check() {
    const visible = captchaVisible();
    const now = Date.now();

    if (visible && !state.active && now - state.lastTriggerAt >= cooldownMs) {
      state.active = true;
      state.lastTriggerAt = now;
      bot.playAlarm?.();
      bot.log?.("captcha alarm triggered", { type: "anti-bot-verification" });
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
    state.active = false;
  }

  bot.captchaAlarm = {
    start,
    stop,
    check,
    status: () => ({ active: state.active, lastTriggerAt: state.lastTriggerAt }),
  };

  start();
  bot.addCleanup?.(stop);
})();
