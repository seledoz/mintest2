window.__minibiaBotBundle = window.__minibiaBotBundle || {};

(function removeLegacyGreatFireballAndEnergyWave() {
  const legacyStandaloneStorageKey = "minibiaBot.attackGfb.config";
  const aoeStorageKey = "minibiaBot.attackAoe.config";

  function disableRemovedFeatures() {
    try {
      window.localStorage.removeItem(legacyStandaloneStorageKey);

      const rawValue = window.localStorage.getItem(aoeStorageKey);
      const config = rawValue ? JSON.parse(rawValue) : {};
      config.gfbEnabled = false;
      config.gfbHotbarSlot = null;
      config.energyWaveEnabled = false;
      config.energyWaveHotbarSlot = null;
      window.localStorage.setItem(aoeStorageKey, JSON.stringify(config));

      window.minibiaBot?.attackAoe?.updateConfig?.({
        gfbEnabled: false,
        gfbHotbarSlot: null,
        energyWaveEnabled: false,
        energyWaveHotbarSlot: null,
      }, { silent: true });

      window.minibiaBot?.attackGfb?.stop?.({ persistEnabled: false });
      window.minibiaBot?.attackGfb?.destroy?.();
      if (window.minibiaBot) delete window.minibiaBot.attackGfb;
    } catch (error) {
      console.error("[minibia-bot] failed to disable removed AoE features", error);
    }
  }

  function removeRemovedFeatureUi() {
    const legacyToggle = document.getElementById("minibia-bot-gfb-enabled");
    legacyToggle?.closest?.(".mb-section")?.remove();
    document.getElementById("minibia-bot-gfb-section")?.remove();

    const energyWaveToggle = document.getElementById("minibia-bot-energy-wave-enabled");
    energyWaveToggle?.closest?.(".mb-section")?.remove();
  }

  disableRemovedFeatures();
  removeRemovedFeatureUi();

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    disableRemovedFeatures();
    removeRemovedFeatureUi();
    if (attempts >= 20) window.clearInterval(timerId);
  }, 250);
})();

(async function loadQuickControlsSettings() {
  try {
    const sourceUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/quick-controls-settings.js?t=" + Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    window.eval(`\n//# sourceURL=${sourceUrl}\n${await response.text()}`);

    let attempts = 0;
    const installTimer = window.setInterval(() => {
      attempts += 1;
      const bot = window.minibiaBot;
      const installer = window.__minibiaBotBundle?.installQuickControlsSettingsModule;
      if (bot && typeof installer === "function") {
        installer(bot);
        window.clearInterval(installTimer);
      } else if (attempts >= 40) {
        window.clearInterval(installTimer);
      }
    }, 250);
  } catch (error) {
    console.error("[minibia-bot] failed to load quick control settings", error);
  }
})();

(async function loadPanelLayoutRestore() {
  try {
    const sourceUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/panel-layout-restore.js?t=" + Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    window.eval(`\n//# sourceURL=${sourceUrl}\n${await response.text()}`);
  } catch (error) {
    console.error("[minibia-bot] failed to restore panel layout", error);
  }
})();