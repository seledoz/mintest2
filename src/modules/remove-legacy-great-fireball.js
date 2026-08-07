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
        try { bot.quickControlsSettings?.destroy?.(); } catch (_) {}
        if (bot.quickControlsSettings) delete bot.quickControlsSettings;
        document.getElementById("minibia-bot-rune-settings")?.remove();
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

(async function loadGithubWaypointAuthFix() {
  try {
    const sourceUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/github-waypoint-auth-fix.js?t=" + Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    window.eval(`\n//# sourceURL=${sourceUrl}\n${await response.text()}`);
  } catch (error) {
    console.error("[minibia-bot] failed to load GitHub waypoint auth fix", error);
  }
})();

(async function loadLureMode2Replacement() {
  try {
    const sourceUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/lure-mode2-replacement.js?t=" + Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    window.eval(`\n//# sourceURL=${sourceUrl}\n${await response.text()}`);
  } catch (error) {
    console.error("[minibia-bot] failed to load lure mode 2 replacement", error);
  }
})();

(async function loadLureMode2RouteProgress() {
  try {
    const sourceUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/lure-mode2-route-progress.js?t=" + Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    window.eval(`\n//# sourceURL=${sourceUrl}\n${await response.text()}`);
  } catch (error) {
    console.error("[minibia-bot] failed to load lure mode 2 route progress", error);
  }
})();

(async function loadLureMode2UiOwner() {
  try {
    const sourceUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/lure-mode2-ui-owner.js?t=" + Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    window.eval(`\n//# sourceURL=${sourceUrl}\n${await response.text()}`);
  } catch (error) {
    console.error("[minibia-bot] failed to load lure mode 2 UI owner", error);
  }
})();

(async function loadLureMode2AstarRoute() {
  try {
    const sourceUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/lure-mode2-astar-route.js?t=" + Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    window.eval(`\n//# sourceURL=${sourceUrl}\n${await response.text()}`);
  } catch (error) {
    console.error("[minibia-bot] failed to load lure mode 2 A* route controller", error);
  }
})();

(async function loadLureMode2PauseBreakIntegration() {
  try {
    const sourceUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/lure-mode2-pause-break-integration.js?t=" + Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    window.eval(`\n//# sourceURL=${sourceUrl}\n${await response.text()}`);
  } catch (error) {
    console.error("[minibia-bot] failed to load lure mode 2 Pause/Break integration", error);
  }
})();

(async function loadHotbarRuneMaker() {
  try {
    const runeUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/rune.js?t=" + Date.now();
    const runeResponse = await fetch(runeUrl, { cache: "no-store" });
    if (!runeResponse.ok) throw new Error(`HTTP ${runeResponse.status}`);
    window.eval(`\n//# sourceURL=${runeUrl}\n${await runeResponse.text()}`);

    let attempts = 0;
    const installTimer = window.setInterval(() => {
      attempts += 1;
      const bot = window.minibiaBot;
      const installer = window.__minibiaBotBundle?.installRuneModule;
      if (bot && typeof installer === "function") {
        const wasRunning = !!bot.rune?.status?.().running;
        try { bot.rune?.stop?.({ persistEnabled: false }); } catch (_) {}
        installer(bot);
        if (wasRunning && !bot.rune?.status?.().running) bot.rune?.start?.();
        window.clearInterval(installTimer);
      } else if (attempts >= 40) {
        window.clearInterval(installTimer);
      }
    }, 250);
  } catch (error) {
    console.error("[minibia-bot] failed to load hotbar Rune Maker", error);
  }
})();

(async function loadRuneHotkeyUi() {
  try {
    const sourceUrl = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/rune-hotkey-ui.js?t=" + Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    window.eval(`\n//# sourceURL=${sourceUrl}\n${await response.text()}`);
  } catch (error) {
    console.error("[minibia-bot] failed to load Rune Maker hotkey UI", error);
  }
})();
