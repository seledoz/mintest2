window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackStickyTargetModule = function installAutoAttackStickyTargetModule(bot) {
  if (!bot?.attack || bot.attackStickyTarget) return bot?.attackStickyTarget;

  const storageKey = "minibiaBot.attackStickyTarget.config";
  const saved = bot.storage.get(storageKey, {}) || {};
  const config = { enabled: saved.enabled === true };
  const state = { timerId: null, lastTargetId: null, lastPriorityTargetId: null, uiTimerId: null };

  function persist() { bot.storage.set(storageKey, { enabled: config.enabled }); }
  function getCurrentTarget() { return window.gameClient?.player?.__target || null; }
  function getVisibleMonsterById(id) {
    if (id == null) return null;
    return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []).find((monster) => Number(monster?.id) === Number(id)) || null;
  }
  function getPriorityIndex(monster) {
    return typeof bot.attackPriority?.getPriorityIndex === "function" ? bot.attackPriority.getPriorityIndex(monster) : -1;
  }
  function selectTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function" || typeof TargetPacket !== "function") return false;
    window.gameClient.player.setTarget(target);
    window.gameClient.send(new TargetPacket(target.id));
    return true;
  }
  function rememberCurrentTarget() {
    const current = getCurrentTarget();
    if (current?.id != null) state.lastTargetId = current.id;
    return current;
  }
  function restoreStickyTarget() {
    if (!config.enabled || !bot.attack?.status?.().running || state.lastTargetId == null) return false;
    const current = getCurrentTarget();
    if (current && Number(current.id) === Number(state.lastTargetId)) return false;
    const target = getVisibleMonsterById(state.lastTargetId);
    if (!target) { state.lastTargetId = null; return false; }
    return selectTarget(target);
  }
  function syncPriorityOverride() {
    if (!config.enabled || !bot.attack?.status?.().running) return false;
    const current = getCurrentTarget();
    if (!current) return restoreStickyTarget();
    if (state.lastTargetId == null) { state.lastTargetId = current.id; return false; }
    if (Number(current.id) === Number(state.lastTargetId)) return false;

    const currentPriority = getPriorityIndex(current);
    const stickyTarget = getVisibleMonsterById(state.lastTargetId);
    const stickyPriority = getPriorityIndex(stickyTarget);

    // Creature Priority may override Sticky Target only with a strictly higher
    // priority rank. Highest HP alone never replaces the sticky target.
    if (currentPriority >= 0 && (stickyPriority < 0 || currentPriority < stickyPriority)) {
      state.lastTargetId = current.id;
      state.lastPriorityTargetId = current.id;
      return false;
    }
    return restoreStickyTarget();
  }
  function stopTimer() { if (state.timerId != null) window.clearInterval(state.timerId); state.timerId = null; }
  function syncTimer() {
    if (!config.enabled || !bot.attack?.status?.().running) { stopTimer(); return; }
    if (state.timerId == null) state.timerId = window.setInterval(syncPriorityOverride, 100);
  }
  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) {
      config.enabled = nextConfig.enabled === true;
      if (!config.enabled) { state.lastTargetId = null; state.lastPriorityTargetId = null; }
      else rememberCurrentTarget();
    }
    persist(); syncTimer(); refreshUi(); return { ...config };
  }
  function ensureUi() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const attackToggle = panel?.querySelector?.("#minibia-bot-auto-attack-enabled");
    const stack = attackToggle?.closest?.(".mb-stack");
    if (!stack) return false;
    if (document.getElementById("minibia-bot-auto-attack-sticky-target")) return true;
    const label = document.createElement("label");
    label.className = "mb-toggle";
    label.id = "minibia-bot-auto-attack-sticky-target-row";
    label.innerHTML = '<input type="checkbox" id="minibia-bot-auto-attack-sticky-target" /><span>Sticky Target</span>';
    stack.appendChild(label);
    const input = label.querySelector("#minibia-bot-auto-attack-sticky-target");
    input?.addEventListener("change", () => updateConfig({ enabled: !!input.checked }));
    refreshUi();
    return true;
  }
  function refreshUi() {
    const input = document.getElementById("minibia-bot-auto-attack-sticky-target");
    if (input) input.checked = config.enabled === true;
  }

  const originalStart = typeof bot.attack.start === "function" ? bot.attack.start.bind(bot.attack) : null;
  const originalStop = typeof bot.attack.stop === "function" ? bot.attack.stop.bind(bot.attack) : null;
  const originalTryAttack = typeof bot.attack.tryAttack === "function" ? bot.attack.tryAttack.bind(bot.attack) : null;
  if (originalStart) bot.attack.start = (...args) => { const result = originalStart(...args); if (config.enabled) rememberCurrentTarget(); syncTimer(); return result; };
  if (originalStop) bot.attack.stop = (...args) => { const result = originalStop(...args); stopTimer(); if (!config.enabled) state.lastTargetId = null; return result; };
  if (originalTryAttack) bot.attack.tryAttack = (...args) => { if (config.enabled) rememberCurrentTarget(); const result = originalTryAttack(...args); if (config.enabled) { if (state.lastTargetId == null) rememberCurrentTarget(); restoreStickyTarget(); } return result; };

  bot.attackStickyTarget = {
    config,
    status: () => ({ config: { ...config }, lastTargetId: state.lastTargetId, timerRunning: state.timerId != null }),
    updateConfig,
    ensureUi,
    destroy: () => { stopTimer(); if (state.uiTimerId != null) window.clearInterval(state.uiTimerId); state.uiTimerId = null; document.getElementById("minibia-bot-auto-attack-sticky-target-row")?.remove(); },
  };
  bot.addCleanup(bot.attackStickyTarget.destroy);

  if (!ensureUi()) {
    let attempts = 0;
    state.uiTimerId = window.setInterval(() => { attempts += 1; if (ensureUi() || attempts >= 40) { window.clearInterval(state.uiTimerId); state.uiTimerId = null; } }, 250);
  }
  syncTimer();
  return bot.attackStickyTarget;
};

// pz-bot loads this file immediately after main.js, so the bot already exists.
if (window.minibiaBot && window.__minibiaBotBundle.installAutoAttackStickyTargetModule) {
  window.__minibiaBotBundle.installAutoAttackStickyTargetModule(window.minibiaBot);
}
