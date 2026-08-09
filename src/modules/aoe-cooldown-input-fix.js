window.__minibiaBotBundle = window.__minibiaBotBundle || {};

(function makeAoeCooldownInputsEditable() {
  const bindings = [
    { id: "minibia-bot-auto-attack-aoe-cooldown", key: "cooldownMs" },
    { id: "minibia-bot-gfb-cooldown", key: "gfbCooldownMs" },
    { id: "minibia-bot-energy-wave-cooldown", key: "energyWaveCooldownMs" },
  ];
  const drafts = new Map();
  let activeTimerId = null;
  let startupTimerId = null;

  function getNumber(value) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function save(input, key) {
    const number = getNumber(input.value);
    if (number === null) return;
    try { window.minibiaBot?.attackAoe?.updateConfig?.({ [key]: number }, { silent: true }); } catch (error) {}
  }

  function bind(binding) {
    const input = document.getElementById(binding.id);
    if (!input || input.dataset.aoeCooldownFixInstalled === "true") return false;
    input.dataset.aoeCooldownFixInstalled = "true";
    input.addEventListener("focus", () => drafts.set(binding.id, input.value));
    input.addEventListener("input", () => { drafts.set(binding.id, input.value); save(input, binding.key); });
    input.addEventListener("change", () => { drafts.set(binding.id, input.value); save(input, binding.key); syncActiveTimer(); });
    input.addEventListener("blur", () => { save(input, binding.key); drafts.delete(binding.id); });
    return true;
  }

  function keepFocusedDraftVisible() {
    for (const binding of bindings) {
      const input = document.getElementById(binding.id);
      if (!input || document.activeElement !== input || !drafts.has(binding.id)) continue;
      const draft = drafts.get(binding.id);
      if (input.value !== draft) input.value = draft;
    }
  }

  function removeReloadPanelSection() {
    document.getElementById("minibia-bot-reload")?.closest?.(".mb-actions")?.remove();
  }

  function isAoeEnabled() {
    const module = window.minibiaBot?.attackAoe;
    const status = module?.status?.();
    return !!(status?.running || status?.config?.enabled || module?.config?.enabled);
  }

  function activeTick() {
    if (!isAoeEnabled()) { stopActiveTimer(); return; }
    bindings.forEach(bind);
    keepFocusedDraftVisible();
    removeReloadPanelSection();
  }

  function stopActiveTimer() {
    if (activeTimerId != null) window.clearInterval(activeTimerId);
    activeTimerId = null;
  }

  function syncActiveTimer() {
    if (!isAoeEnabled()) { stopActiveTimer(); return; }
    if (activeTimerId == null) activeTimerId = window.setInterval(activeTick, 250);
    activeTick();
  }

  function bindAoeToggle() {
    const candidates = [
      "minibia-bot-auto-attack-aoe-enabled",
      "minibia-bot-gfb-enabled",
      "minibia-bot-energy-wave-enabled",
    ];
    let found = false;
    for (const id of candidates) {
      const toggle = document.getElementById(id);
      if (!toggle || toggle.dataset.aoeCooldownTimerSync === "true") continue;
      toggle.dataset.aoeCooldownTimerSync = "true";
      toggle.addEventListener("change", () => window.setTimeout(syncActiveTimer, 0));
      found = true;
    }
    return found;
  }

  function setup() {
    const boundAny = bindings.map(bind).some(Boolean);
    bindAoeToggle();
    removeReloadPanelSection();
    syncActiveTimer();
    return boundAny || bindings.some((binding) => document.getElementById(binding.id));
  }

  setup();
  let attempts = 0;
  startupTimerId = window.setInterval(() => {
    attempts += 1;
    if (setup() || attempts >= 40) {
      window.clearInterval(startupTimerId);
      startupTimerId = null;
    }
  }, 250);
})();

(function addSquareHotkey2Toggle() {
  const enabledStorageKey = "minibiaBot.attackAoe.square2.enabled";
  const savedSlotStorageKey = "minibiaBot.attackAoe.square2.savedSlot";
  const toggleId = "minibia-bot-auto-attack-aoe-enabled-2";
  let observedStatusLabel = null;
  let statusObserver = null;
  let activeTimerId = null;
  let startupTimerId = null;

  function readEnabled() {
    try { return window.localStorage.getItem(enabledStorageKey) === "true"; } catch (_) { return false; }
  }
  function saveEnabled(enabled) { try { window.localStorage.setItem(enabledStorageKey, String(!!enabled)); } catch (_) {} }
  function normalizeSlot(value) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number >= 1 && number <= 12 ? number : null;
  }
  function readSavedSlot() { try { return normalizeSlot(window.localStorage.getItem(savedSlotStorageKey)); } catch (_) { return null; } }
  function saveSlot(slot) {
    const normalized = normalizeSlot(slot);
    if (!normalized) return;
    try { window.localStorage.setItem(savedSlotStorageKey, String(normalized)); } catch (_) {}
  }
  function getModule() { return window.minibiaSquareHotkey2 || null; }

  function applyEnabledState(enabled) {
    const module = getModule();
    if (!module?.config || !module?.updateConfig) return false;
    const currentSlot = normalizeSlot(module.config.hotbarSlot);
    if (enabled) {
      const restoredSlot = currentSlot || readSavedSlot();
      if (restoredSlot && currentSlot !== restoredSlot) module.updateConfig({ hotbarSlot: restoredSlot });
    } else {
      if (currentSlot) saveSlot(currentSlot);
      if (module.config.hotbarSlot !== null) module.updateConfig({ hotbarSlot: null });
    }
    return true;
  }

  function stopStatusObserver() {
    statusObserver?.disconnect();
    statusObserver = null;
    observedStatusLabel = null;
  }

  function ensureStatusObserver() {
    if (!readEnabled()) { stopStatusObserver(); return; }
    const statusLabel = document.getElementById("minibia-bot-auto-attack-aoe-status-2");
    if (!statusLabel || statusLabel === observedStatusLabel) return;
    stopStatusObserver();
    observedStatusLabel = statusLabel;
    statusObserver = new MutationObserver(() => {});
    statusObserver.observe(statusLabel, { childList: true, characterData: true, subtree: true });
  }

  function refreshToggle() {
    const enabled = readEnabled();
    const input = document.getElementById(toggleId);
    if (input && input.checked !== enabled) input.checked = enabled;
    if (enabled) ensureStatusObserver(); else stopStatusObserver();
    if (!enabled) {
      const statusLabel = document.getElementById("minibia-bot-auto-attack-aoe-status-2");
      if (statusLabel && statusLabel.textContent !== "Square #2: off") statusLabel.textContent = "Square #2: off";
    }
  }

  function activeTick() {
    if (!readEnabled()) { stopActiveTimer(); return; }
    const module = getModule();
    if (module?.config) {
      const currentSlot = normalizeSlot(module.config.hotbarSlot);
      if (currentSlot) saveSlot(currentSlot);
      applyEnabledState(true);
    }
    refreshToggle();
  }

  function stopActiveTimer() {
    if (activeTimerId != null) window.clearInterval(activeTimerId);
    activeTimerId = null;
    stopStatusObserver();
  }

  function syncActiveTimer() {
    if (!readEnabled()) { stopActiveTimer(); refreshToggle(); return; }
    if (activeTimerId == null) activeTimerId = window.setInterval(activeTick, 250);
    activeTick();
  }

  function setEnabled(enabled) {
    saveEnabled(enabled);
    applyEnabledState(enabled);
    syncActiveTimer();
    refreshToggle();
  }

  function ensureToggle() {
    if (document.getElementById(toggleId)) return true;
    const section = document.getElementById("minibia-bot-auto-attack-aoe-square2-section");
    const label = section?.querySelector?.(".mb-label");
    if (!section || !label) return false;
    const toggle = document.createElement("label");
    toggle.className = "mb-toggle";
    toggle.innerHTML = `<input type="checkbox" id="${toggleId}" /><span>Enable Square Hotkey #2</span>`;
    label.insertAdjacentElement("afterend", toggle);
    toggle.querySelector("input")?.addEventListener("change", (event) => setEnabled(event.target.checked));
    refreshToggle();
    return true;
  }

  ensureToggle();
  syncActiveTimer();
  let attempts = 0;
  startupTimerId = window.setInterval(() => {
    attempts += 1;
    if (ensureToggle() || attempts >= 40) {
      window.clearInterval(startupTimerId);
      startupTimerId = null;
      syncActiveTimer();
    }
  }, 250);
})();
