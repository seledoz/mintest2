(() => {
  const STORAGE_KEY = "minibiaBot.lure.config";

  function install() {
    const bot = window.minibiaBot;
    if (!bot?.storage || !bot?.lureMode2RouteProgress) return false;
    if (window.__minibiaLureMode2UiOwnerInstalled) return true;
    window.__minibiaLureMode2UiOwnerInstalled = true;

    function readSaved() {
      return bot.storage.get(STORAGE_KEY, {}) || {};
    }

    function save(next) {
      const merged = { ...readSaved(), ...next };
      bot.storage.set(STORAGE_KEY, merged);
      return merged;
    }

    function syncLegacyConfig(saved) {
      if (!bot.lureMode?.config) return;
      bot.lureMode.config.mode = Number(saved.mode) === 2 ? 2 : 1;
      bot.lureMode.config.enabled = !!saved.enabled;
      if (saved.minMonsters != null) bot.lureMode.config.minMonsters = saved.minMonsters;
      if (saved.maxDistance != null) bot.lureMode.config.maxDistance = saved.maxDistance;
      if (saved.stepDelayMs != null) bot.lureMode.config.stepDelayMs = saved.stepDelayMs;
    }

    function forceUi(saved) {
      const enabled = document.getElementById("minibia-bot-lure-enabled");
      const mode = document.getElementById("minibia-bot-lure-mode");
      if (mode && Number(saved.mode) === 2) mode.value = "2";
      if (enabled && Number(saved.mode) === 2) enabled.checked = !!saved.enabled;
    }

    function activateMode2(enabled) {
      const saved = save({ mode: 2, enabled: !!enabled });
      syncLegacyConfig(saved);
      forceUi(saved);
      if (saved.enabled) bot.lureMode2RouteProgress.start?.();
      else bot.lureMode2RouteProgress.stop?.();
      window.setTimeout(() => forceUi(readSaved()), 0);
      window.setTimeout(() => forceUi(readSaved()), 100);
    }

    // Window capture runs before the older document-level capture listeners.
    // Mode 2 owns its checkbox/mode events so legacy handlers cannot immediately
    // write enabled=false and visually uncheck the control.
    window.addEventListener("change", (event) => {
      const target = event.target;
      const id = target?.id;
      if (id === "minibia-bot-lure-enabled") {
        const mode = Number(document.getElementById("minibia-bot-lure-mode")?.value || readSaved().mode);
        if (mode !== 2) return;
        event.stopImmediatePropagation();
        event.stopPropagation();
        activateMode2(!!target.checked);
        return;
      }

      if (id === "minibia-bot-lure-mode" && Number(target.value) === 2) {
        event.stopImmediatePropagation();
        event.stopPropagation();
        const enabled = !!document.getElementById("minibia-bot-lure-enabled")?.checked;
        activateMode2(enabled);
      }
    }, true);

    // Keep the visible controls matched to the stored Mode 2 state in case an
    // older module performs a late UI refresh.
    const timerId = window.setInterval(() => {
      const saved = readSaved();
      if (Number(saved.mode) === 2) forceUi(saved);
    }, 250);

    bot.addCleanup?.(() => {
      window.clearInterval(timerId);
      window.__minibiaLureMode2UiOwnerInstalled = false;
    });

    forceUi(readSaved());
    return true;
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 100) window.clearInterval(timerId);
  }, 100);
  install();
})();
