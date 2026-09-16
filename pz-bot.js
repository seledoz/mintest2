(() => {
  const repository = "seledoz/mintest2";
  const ref = "main";
  const rawBaseUrl = `https://raw.githubusercontent.com/${repository}/${ref}`;
  const sourceFiles = [
    "src/version.js",
    "src/core.js",
    "src/modules/pz.js",
    "src/modules/xray.js",
    "src/modules/panic.js",
    "src/modules/gm-default-chat-kill-switch.js",
    "src/modules/rune.js",
    "src/modules/heal.js",
    "src/modules/anti-paralyze.js",
    "src/modules/haste-paralyze-monster-range-guard.js",
    "src/modules/damage-tts-alert.js",
    "src/modules/auto-invisible.js",
    "src/modules/auto-magic-shield.js",
    "src/modules/auto-attack-exclude.js",
    "src/modules/auto-attack.js",
    "src/modules/auto-target-v2.js",
    "src/modules/auto-attack-priority.js",
    "src/modules/auto-attack-rune-cooldown.js",
    "src/modules/auto-attack-rune-retry.js",
    "src/modules/auto-attack-block-follow-while-targeted.js",
    "src/modules/auto-attack-aoe.js",
    "src/modules/great-fireball-v2.js",
    "src/modules/fireball.js",
    "src/modules/auto-attack-aoe-layout.js",
    "src/modules/lure-mode.js",
    "src/modules/aoe-cooldown-input-fix.js",
    "src/modules/low-cap-alarm.js",
    "src/modules/mining.js",
    "src/modules/red-text-alert.js",
    "src/modules/cave.js",
    "src/modules/cave-waypoint-tolerance-pathing.js",
    "src/modules/cave-forward-loop.js",
    "src/modules/cave-arrow-keys.js",
    "src/modules/cave-waypoint-actions.js",
    "src/modules/equip-ring.js",
    "src/modules/auto-eat.js",
    "src/modules/talk.js",
    "src/modules/rune-maker-drop.js",
    "src/modules/rune-maker-drop-modern-ids.js",
    "src/modules/quick-controls-settings.js",
    "src/ui/panel.js",
    "src/modules/cave-rope-waypoint-ui.js",
    "src/modules/auto-attack-rune-toggle.js",
    "src/modules/auto-target-v2-panel.js",
    "src/modules/panel-scroll.js",
    "src/modules/github-waypoint-library.js",
    "src/modules/captcha-alarm.js",
    "src/main.js",
    "src/modules/explosion-on-crosshairs.js",
    "src/modules/remove-legacy-great-fireball.js",
    "src/modules/anti-paralyze-toggle-fix.js",
    "src/modules/player-screen-alert.js",
    "src/modules/monster-xray-alarm.js",
    "src/modules/emergency-mana-ring.js",
    "src/modules/auto-attack-keep-distance.js",
    "src/modules/auto-attack-keep-distance-bootstrap.js",
    "src/modules/great-fireball-v2-screen-click-fix.js",
    "src/modules/xray-overlay-floor-mode.js",
    "src/modules/rune-maker-drop-inspector.js",
    "src/modules/github-waypoint-delete-button.js",
    "src/modules/profiles.js",
  ];

  function purgeLegacyCaveWaitDelay() {
    const waitButton = document.getElementById("minibia-bot-cave-wait-add");
    const waitInput = document.getElementById("minibia-bot-cave-wait-minutes");
    const waitStatus = document.getElementById("minibia-bot-cave-wait-status");
    const waitRow = waitButton?.closest?.(".mb-row") || waitInput?.closest?.(".mb-row") || waitStatus?.closest?.(".mb-row");
    if (waitRow) waitRow.remove();
    else { waitButton?.remove(); waitInput?.remove(); waitStatus?.remove(); }
    try { window.minibiaBot?.storage?.set?.("minibiaBot.cave.waitDelays", {}); } catch (_) {}
    try { delete window.__minibiaCaveWaitDelayInstalled; } catch (_) { window.__minibiaCaveWaitDelayInstalled = false; }
    const pathfinder = window.gameClient?.world?.pathfinder;
    if (!pathfinder || typeof pathfinder.findPath !== "function") return;
    let findPath = pathfinder.findPath;
    for (let depth = 0; depth < 8; depth += 1) {
      if (!findPath || findPath.__minibiaLegacyCaveWaitDelayWrapped) break;
      const next = findPath.__minibiaOriginalFindPath;
      if (typeof next !== "function") break;
      findPath = next;
    }
  }

  async function load() {
    const scripts = sourceFiles.map((path) => `${rawBaseUrl}/${path}`);
    for (const src of scripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    }
    purgeLegacyCaveWaitDelay();
  }

  load().catch((error) => console.error("[minibia-bot] loader failed", error));
})();
