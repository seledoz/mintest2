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
