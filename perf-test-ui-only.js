(() => {
  const repository = "seledoz/mintest2";
  const ref = "main";
  const rawBaseUrl = `https://raw.githubusercontent.com/${repository}/${ref}`;
  const storageKey = "minibia-fps-disabled-feature";
  const controlId = "minibia-fps-isolation-controls";

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
    "src/modules/auto-attack-priority.js",
    "src/modules/auto-attack-rune-cooldown.js",
    "src/modules/auto-attack-rune-retry.js",
    "src/modules/auto-attack-block-follow-while-targeted.js",
    "src/modules/auto-attack-aoe.js",
    "src/modules/great-fireball-v2.js",
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
    "src/ui/panel.js",
    "src/modules/panel-scroll.js",
    "src/modules/github-waypoint-library.js",
    "src/main.js",
    "src/modules/remove-legacy-great-fireball.js",
    "src/modules/anti-paralyze-toggle-fix.js",
    "src/modules/player-screen-alert.js",
    "src/modules/auto-attack-keep-distance.js",
    "src/modules/auto-attack-keep-distance-bootstrap.js",
    "src/modules/great-fireball-v2-screen-click-fix.js",
    "src/modules/xray-overlay-floor-mode.js",
    "src/modules/rune-maker-drop-inspector.js",
  ];

  const featureGroups = {
    none: { label: "Nothing disabled — full bot", files: [] },
    pz: { label: "PZ monitor", files: ["src/modules/pz.js"] },
    xray: { label: "X-Ray", files: ["src/modules/xray.js", "src/modules/xray-overlay-floor-mode.js"] },
    panic: { label: "Panic runner", files: ["src/modules/panic.js"] },
    gm: { label: "GM kill switch", files: ["src/modules/gm-default-chat-kill-switch.js"] },
    rune: { label: "Rune targeting/use", files: ["src/modules/rune.js"] },
    heal: { label: "Auto heal", files: ["src/modules/heal.js"] },
    antiParalyze: { label: "Anti-paralyze", files: ["src/modules/anti-paralyze.js", "src/modules/haste-paralyze-monster-range-guard.js", "src/modules/anti-paralyze-toggle-fix.js"] },
    damageTts: { label: "Damage TTS alert", files: ["src/modules/damage-tts-alert.js"] },
    invisible: { label: "Auto invisible", files: ["src/modules/auto-invisible.js"] },
    shield: { label: "Auto magic shield", files: ["src/modules/auto-magic-shield.js"] },
    autoAttack: { label: "Auto attack and all submodules", files: ["src/modules/auto-attack-exclude.js", "src/modules/auto-attack.js", "src/modules/auto-attack-priority.js", "src/modules/auto-attack-rune-cooldown.js", "src/modules/auto-attack-rune-retry.js", "src/modules/auto-attack-block-follow-while-targeted.js", "src/modules/auto-attack-keep-distance.js", "src/modules/auto-attack-keep-distance-bootstrap.js"] },
    aoe: { label: "AoE / Energy Wave", files: ["src/modules/auto-attack-aoe.js", "src/modules/auto-attack-aoe-layout.js", "src/modules/aoe-cooldown-input-fix.js"] },
    gfb: { label: "Great Fireball", files: ["src/modules/great-fireball-v2.js", "src/modules/great-fireball-v2-screen-click-fix.js", "src/modules/remove-legacy-great-fireball.js"] },
    lure: { label: "Lure mode", files: ["src/modules/lure-mode.js"] },
    lowCap: { label: "Low capacity alarm", files: ["src/modules/low-cap-alarm.js"] },
    mining: { label: "Mining", files: ["src/modules/mining.js"] },
    redText: { label: "Red-text alert", files: ["src/modules/red-text-alert.js"] },
    cave: { label: "Cavebot and waypoint modules", files: ["src/modules/cave.js", "src/modules/cave-waypoint-tolerance-pathing.js", "src/modules/cave-forward-loop.js", "src/modules/cave-arrow-keys.js", "src/modules/cave-waypoint-actions.js", "src/modules/github-waypoint-library.js"] },
    ring: { label: "Equip ring", files: ["src/modules/equip-ring.js"] },
    eat: { label: "Auto eat", files: ["src/modules/auto-eat.js"] },
    talk: { label: "Talk system", files: ["src/modules/talk.js"] },
    runeMaker: { label: "Rune Maker / Rune Drop", files: ["src/modules/rune-maker-drop.js", "src/modules/rune-maker-drop-modern-ids.js", "src/modules/rune-maker-drop-inspector.js"] },
    playerAlert: { label: "Player Screen Alert", files: ["src/modules/player-screen-alert.js"] },
    panelScroll: { label: "Panel scrolling helper", files: ["src/modules/panel-scroll.js"] },
    panelRefresh: { label: "Panel background refresh timers", files: [] },
  };

  let selectedFeature = localStorage.getItem(storageKey) || "none";
  if (!featureGroups[selectedFeature]) selectedFeature = "none";

  function installUiCompatibilityShim() {
    if (document.__minNewUiCompatibilityShimInstalled) return;
    const originalGetElementById = document.getElementById.bind(document);
    document.getElementById = function getElementByIdWithMinNewCompat(id) {
      if (id === "k9x-panel") return originalGetElementById("minibia-bot-panel") || originalGetElementById(id);
      return originalGetElementById(id);
    };
    document.__minNewUiCompatibilityShimInstalled = true;
  }

  function patchPanelRefreshTimers(code) {
    if (selectedFeature !== "panelRefresh") return code;
    return code
      .replace(/window\.setInterval\(refreshVisibleCreatures,[^;]+;/g, "0;")
      .replace(/window\.setInterval\(refreshTalkStatus,[^;]+;/g, "0;")
      .replace(/const caveStatusTimerId = window\.setInterval\([\s\S]*?\n\s*\},\s*1000\);/, "const caveStatusTimerId = 0;");
  }

  function shouldSkip(path) {
    return featureGroups[selectedFeature].files.includes(path);
  }

  async function loadSourceFile(path) {
    if (shouldSkip(path)) {
      console.log(`[FPS ISOLATION] Disabled: ${path}`);
      return;
    }

    const response = await fetch(`${rawBaseUrl}/${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load ${path}: HTTP ${response.status}`);

    let code = await response.text();
    if (path === "src/ui/panel.js") code = patchPanelRefreshTimers(code);
    if (path === "src/version.js") {
      code = code
        .replaceAll("%%BRANCH%%", ref)
        .replaceAll("%%COMMIT%%", `fps-disable-${selectedFeature}`)
        .replaceAll("%%DATE%%", new Date().toISOString());
    }

    try {
      (0, eval)(`${code}\n//# sourceURL=${rawBaseUrl}/${path}`);
    } catch (error) {
      console.warn(`[FPS ISOLATION] ${path} failed after disabling ${selectedFeature}`, error);
    }
  }

  function createControls() {
    document.getElementById(controlId)?.remove();
    const box = document.createElement("div");
    box.id = controlId;
    box.style.cssText = "position:fixed;left:12px;top:12px;z-index:2147483647;width:290px;padding:10px;border:2px solid #ffb300;border-radius:8px;background:#151515;color:#fff;font:12px Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5)";

    const options = Object.entries(featureGroups)
      .map(([key, group]) => `<option value="${key}"${key === selectedFeature ? " selected" : ""}>${group.label}</option>`)
      .join("");

    box.innerHTML = `
      <div style="font-size:14px;font-weight:700">FPS FEATURE ISOLATION</div>
      <div style="margin:5px 0 7px;color:#ffd36a">Actual full bot and full panel are loaded.</div>
      <label style="display:block;margin-bottom:4px">Disable one feature:</label>
      <select id="minibia-fps-feature-select" style="width:100%;padding:5px;background:#252525;color:#fff;border:1px solid #666">${options}</select>
      <button id="minibia-fps-apply" style="width:100%;margin-top:7px;padding:6px;font-weight:700">Apply and reload bot</button>
      <div style="margin-top:7px">Currently disabled: <b id="minibia-fps-current">${featureGroups[selectedFeature].label}</b></div>
      <div style="margin-top:5px;color:#bbb">Test the same fight or spell, then choose the next feature. Use “Nothing disabled” for the baseline.</div>`;

    document.body.appendChild(box);
    document.getElementById("minibia-fps-apply")?.addEventListener("click", () => {
      const select = document.getElementById("minibia-fps-feature-select");
      localStorage.setItem(storageKey, select?.value || "none");
      window.__minibiaFpsIsolationLoad?.();
    });
  }

  async function load() {
    selectedFeature = localStorage.getItem(storageKey) || "none";
    if (!featureGroups[selectedFeature]) selectedFeature = "none";

    document.getElementById(controlId)?.remove();
    if (window.minibiaBot?.destroy) {
      try { window.minibiaBot.destroy(); } catch (error) {
        console.warn("[FPS ISOLATION] Existing bot cleanup failed", error);
      }
    }
    document.getElementById("minibia-bot-panel")?.remove();

    installUiCompatibilityShim();
    delete window.__minibiaBotBundle;
    window.__minibiaBotBundle = {};

    for (const path of sourceFiles) await loadSourceFile(path);

    createControls();
    window.minibiaFpsIsolation = {
      disabledFeature: selectedFeature,
      disabledFiles: [...featureGroups[selectedFeature].files],
      reload: load,
      reset() {
        localStorage.setItem(storageKey, "none");
        return load();
      },
    };
    console.log(`[FPS ISOLATION] Full bot loaded. Disabled feature: ${featureGroups[selectedFeature].label}`);
  }

  window.__minibiaFpsIsolationLoad = load;
  load().catch((error) => console.error("[FPS ISOLATION] Loader failed", error));
})();