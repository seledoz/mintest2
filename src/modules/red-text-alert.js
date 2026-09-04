window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installRedTextAlertModule = function installRedTextAlertModule(bot) {
  if (!bot || bot.redTextAlert?.destroy) return bot?.redTextAlert;

  const configStorageKey = "minibiaBot.redTextAlert.config";
  const config = Object.assign(
    {
      enabled: false,
      beepIntervalMs: 1000,
      alertDurationMs: 10000,
    },
    bot.storage.get(configStorageKey, {}) || {}
  );

  function positiveInt(value, fallback) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  config.beepIntervalMs = positiveInt(config.beepIntervalMs, 1000);
  config.alertDurationMs = 10000;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  let audioContext = null;
  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume?.().catch?.(() => {});
    return audioContext;
  }

  function beep() {
    const ctx = getAudioContext();
    if (!ctx) return false;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(980, now);
    oscillator.frequency.setValueAtTime(740, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.38);
    return true;
  }

  function ensureUi() {
    const panel = document.getElementById("k9x-panel");
    if (!panel || document.getElementById("k9x-red-text-alert-section")) return;
    const parent = panel.querySelector(".mb-side-column") || panel.querySelector(".mb-main-column") || panel.querySelector(".mb-body") || panel;
    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "k9x-red-text-alert-section";
    section.innerHTML = `<div class="mb-label">Captcha Alarm</div><div class="mb-stack"><label class="mb-toggle"><input type="checkbox" id="k9x-red-text-alert-enabled" /><span>Enable Captcha Alarm</span></label><div class="mb-small-note" id="k9x-red-text-alert-status">Alert: off</div><div class="mb-small-note">Alarms when an Anti-bot Verification popup appears. It does not click or solve it.</div></div>`;
    parent.appendChild(section);
    section.querySelector("#k9x-red-text-alert-enabled")?.addEventListener("change", (event) => {
      config.enabled = !!event.target.checked;
      persistConfig();
      refreshUiValues();
      bot.captchaAlarm?.check?.();
    });
    refreshUiValues();
  }

  function refreshUiValues() {
    const enabled = document.getElementById("k9x-red-text-alert-enabled");
    const label = document.getElementById("k9x-red-text-alert-status");
    if (enabled) enabled.checked = !!config.enabled;
    if (label) label.textContent = config.enabled ? "Alert: watching" : "Alert: off";
  }

  function updateConfig(nextConfig = {}, options = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) config.enabled = !!nextConfig.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "beepIntervalMs")) config.beepIntervalMs = positiveInt(nextConfig.beepIntervalMs, config.beepIntervalMs || 1000);
    config.alertDurationMs = 10000;
    persistConfig();
    if (!options.silent) refreshUiValues();
    return { ...config };
  }

  function start(overrides = {}) {
    updateConfig(Object.assign({}, overrides, { enabled: true }), { silent: true });
    refreshUiValues();
    bot.captchaAlarm?.check?.();
    return true;
  }

  function stop(options = {}) {
    if (options.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }
    refreshUiValues();
    return true;
  }

  function status() {
    const captchaStatus = bot.captchaAlarm?.status?.() || null;
    return {
      running: !!config.enabled,
      config: { ...config },
      mode: config.enabled ? "watching" : "off",
      alertActive: !!captchaStatus?.active,
      remainingMs: 0,
      lastSeenText: captchaStatus?.visible ? "Anti-bot Verification" : "",
      lastSeenAt: captchaStatus?.lastTriggerAt || 0,
      lastBeepAt: 0,
      captchaVisibleNow: !!captchaStatus?.visible,
      captchaCandidateCount: captchaStatus?.visible ? 1 : 0,
      visibleRedTextNow: false,
      visibleRedCount: 0,
      baselineCaptchaCount: 0,
      baselineRedTextCount: 0,
      consoleRootCount: 0,
    };
  }

  function resetSeenMessages() {
    bot.captchaAlarm?.check?.();
  }

  function destroy() {
    document.getElementById("k9x-red-text-alert-section")?.remove();
    if (audioContext && audioContext.state !== "closed") audioContext.close?.().catch?.(() => {});
    audioContext = null;
  }

  bot.redTextAlert = { start, stop, status, updateConfig, beep, resetSeenMessages, destroy, config };
  bot.addCleanup(destroy);

  ensureUi();
  if (!document.getElementById("k9x-red-text-alert-section")) {
    const observer = new MutationObserver(() => {
      ensureUi();
      if (document.getElementById("k9x-red-text-alert-section")) observer.disconnect();
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    bot.addCleanup?.(() => observer.disconnect());
  }

  return bot.redTextAlert;
};
