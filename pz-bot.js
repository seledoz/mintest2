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

  function installUiCompatibilityShim() {
    if (document.__minNewUiCompatibilityShimInstalled) return;
    const originalGetElementById = document.getElementById.bind(document);
    document.getElementById = function getElementByIdWithMinNewCompat(id) {
      if (id === "k9x-panel") return originalGetElementById("minibia-bot-panel") || originalGetElementById(id);
      return originalGetElementById(id);
    };
    document.__minNewUiCompatibilityShimInstalled = true;
  }

  function blankPanelTitle() {
    const title = document.querySelector("#minibia-bot-panel .mb-title");
    if (title) {
      title.textContent = "";
      title.setAttribute("title", "");
      title.style.fontSize = "0";
      title.style.minHeight = "16px";
      title.style.flex = "1 1 auto";
    }
  }

  function syncCollapseButtons() {
    const panel = document.getElementById("minibia-bot-panel");
    if (!panel) return;

    const collapsed = panel.dataset.collapsed === "true";
    panel.querySelectorAll("#minibia-bot-collapse, #minibia-bot-collapse-left").forEach((button) => {
      button.textContent = collapsed ? "+" : "−";
      button.setAttribute("aria-label", collapsed ? "Maximize panel" : "Minimize panel");
      button.setAttribute("title", collapsed ? "Maximize" : "Minimize");
    });
  }

  function ensureLeftCollapseButton() {
    const panel = document.getElementById("minibia-bot-panel");
    const titlebar = panel?.querySelector?.(".mb-titlebar");
    const rightButton = panel?.querySelector?.("#minibia-bot-collapse");
    if (!panel || !titlebar || !rightButton) return;

    let leftButton = panel.querySelector("#minibia-bot-collapse-left");
    if (!leftButton) {
      leftButton = rightButton.cloneNode(true);
      leftButton.id = "minibia-bot-collapse-left";
      titlebar.prepend(leftButton);
      leftButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        rightButton.click();
        window.setTimeout(syncCollapseButtons, 0);
      });
    }

    if (!document.__minNewCollapseButtonSyncInstalled) {
      document.__minNewCollapseButtonSyncInstalled = true;
      document.addEventListener("click", (event) => {
        if (event.target?.closest?.("#minibia-bot-collapse")) {
          window.setTimeout(syncCollapseButtons, 0);
        }
      });
    }

    syncCollapseButtons();
  }

  function removePanelDebugSection() {
    const debugToggle = document.getElementById("minibia-bot-debug-enabled");
    const debugSection = debugToggle?.closest?.(".mb-section");
    if (debugSection) {
      debugSection.remove();
      return;
    }

    const labels = Array.from(document.querySelectorAll("#minibia-bot-panel .mb-label"));
    const debugLabel = labels.find((label) => String(label.textContent || "").trim().toLowerCase() === "debug");
    debugLabel?.closest?.(".mb-section")?.remove();
  }

  function removePanicRunnerSection() {
    const setHomeButton = document.getElementById("minibia-bot-set-home");
    const panicSection = setHomeButton?.closest?.(".mb-section");
    if (panicSection) {
      panicSection.remove();
      return;
    }

    document.getElementById("minibia-bot-home")?.closest?.(".mb-section")?.remove();
    document.getElementById("minibia-bot-panic-unknown")?.closest?.(".mb-section")?.remove();
    document.getElementById("minibia-bot-panic-health")?.closest?.(".mb-section")?.remove();
    document.getElementById("minibia-bot-panic-return")?.closest?.(".mb-section")?.remove();
  }

  function keepPanelTitleBlank() {
    blankPanelTitle();
    ensureLeftCollapseButton();
    removePanelDebugSection();
    removePanicRunnerSection();
    let attempts = 0;
    const timerId = window.setInterval(() => {
      blankPanelTitle();
      ensureLeftCollapseButton();
      removePanelDebugSection();
      removePanicRunnerSection();
      attempts += 1;
      if (attempts >= 20) window.clearInterval(timerId);
    }, 250);
  }

  function addSafeUiPerformanceOptimizations(code, path) {
    if (path === "src/core.js") {
      code = code.replace(
        "  startReconnectWatcher();",
        "  // Reconnect watcher temporarily disabled for FPS testing."
      );
    }

    if (path === "src/modules/auto-attack.js") {
      code = code
        .replace("      maxTargetDistanceX: 7,", "      maxTargetDistanceX: 5,")
        .replace(
          "    return dx <= maxTargetDistanceX && dy <= maxTargetDistanceY;",
          "    return dx <= Math.min(5, maxTargetDistanceX) && dy <= Math.min(5, maxTargetDistanceY) && Math.max(dx, dy) <= 5;"
        );
    }

    if (path === "src/modules/lure-mode.js") {
      code = code
        .replace(
          "    nextMode2StepAt: 0,\n",
          "    nextMode2StepAt: 0,\n    mode2StepStartPosition: null,\n    mode2WaitingForStep: false,\n"
        )
        .replace(
          `      if (status.mode === 2 && status.luring) {\n        state.nextMode2StepAt = Date.now() + status.stepDelayMs;\n        return limitPathToOneStep(path);\n      }`,
          `      if (status.mode === 2 && status.luring) {\n        const startPosition = playerPos();\n        state.mode2StepStartPosition = startPosition;\n        state.mode2WaitingForStep = !!startPosition;\n        return limitPathToOneStep(path);\n      }`
        )
        .replace(
          `    state.lastStatus = status;\n\n    if (state.clearingPack`,
          `    state.lastStatus = status;\n\n    if (status.mode === 2 && status.luring && state.mode2WaitingForStep) {\n      const currentPosition = playerPos();\n      const startPosition = state.mode2StepStartPosition;\n      if (currentPosition && startPosition && dist(currentPosition, startPosition) >= 1) {\n        stopCurrentPath();\n        state.nextMode2StepAt = Date.now() + status.stepDelayMs;\n        state.mode2WaitingForStep = false;\n        state.mode2StepStartPosition = null;\n        status = getLureStatus();\n        state.lastStatus = status;\n        bot.log?.(\"lure mode 2 completed paced step\", {\n          stepDelayMs: status.stepDelayMs,\n          nextStepAt: state.nextMode2StepAt,\n          farthestDistance: status.farthestDistance,\n          maxDistance: status.maxDistance,\n        });\n      }\n    }\n\n    if (state.clearingPack`
        )
        .replace(
          `    state.nextMode2StepAt = 0;\n    patchPathfinder();`,
          `    state.nextMode2StepAt = 0;\n    state.mode2StepStartPosition = null;\n    state.mode2WaitingForStep = false;\n    patchPathfinder();`
        )
        .replace(
          `    state.nextMode2StepAt = 0;\n    state.lastStatus = getOffStatus();`,
          `    state.nextMode2StepAt = 0;\n    state.mode2StepStartPosition = null;\n    state.mode2WaitingForStep = false;\n    state.lastStatus = getOffStatus();`
        )
        .replace(
          `      state.nextMode2StepAt = 0;\n    }`,
          `      state.nextMode2StepAt = 0;\n      state.mode2StepStartPosition = null;\n      state.mode2WaitingForStep = false;\n    }`
        );
    }

    if (path === "src/ui/panel.js") {
      code = code.replace(
        `  function refreshVisibleCreatures() {\n    const list = document.getElementById("minibia-bot-visible-creatures-list");\n    if (!list) return;`,
        `  function refreshVisibleCreatures() {\n    const list = document.getElementById("minibia-bot-visible-creatures-list");\n    if (!list || isPanelCollapsed()) return;`
      );
      code = code.replace(
        `    const visibleCreaturesTimerId = window.setInterval(refreshVisibleCreatures, 1000);`,
        `    const visibleCreaturesTimerId = window.setInterval(() => {\n      if (!isPanelCollapsed()) refreshVisibleCreatures();\n    }, 1000);`
      );
      code = code.replace(
        `    const talkStatusTimerId = window.setInterval(refreshTalkStatus, 1000);`,
        `    const talkStatusTimerId = window.setInterval(() => {\n      if (!isPanelCollapsed()) refreshTalkStatus();\n    }, 1000);`
      );
      code = code.replace(
        `    const caveStatusTimerId = window.setInterval(() => {\n      refreshCaveStatus();`,
        `    const caveStatusTimerId = window.setInterval(() => {\n      if (isPanelCollapsed()) return;\n      refreshCaveStatus();`
      );
    }

    return code;
  }

  async function loadSourceFile(path) {
    const response = await fetch(`${rawBaseUrl}/${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load ${path}: HTTP ${response.status}`);

    let code = await response.text();
    code = addSafeUiPerformanceOptimizations(code, path);
    if (path === "src/version.js") {
      code = code
        .replaceAll("%%BRANCH%%", ref)
        .replaceAll("%%COMMIT%%", "source-loader")
        .replaceAll("%%DATE%%", new Date().toISOString());
    }

    const sourceUrl = `${rawBaseUrl}/${path}`;
    try {
      (0, eval)(`${code}\n//# sourceURL=${sourceUrl}`);
    } catch (error) {
      console.error(`[minibia-bot] Failed to evaluate ${path}`, error);
      throw error;
    }
  }

  async function load() {
    if (window.minibiaBot?.destroy) {
      try {
        window.minibiaBot.destroy();
      } catch (error) {
        console.warn("[minibia-bot] Existing bot cleanup failed", error);
      }
    }

    installUiCompatibilityShim();
    delete window.__minibiaBotBundle;
    window.__minibiaBotBundle = {};

    for (const path of sourceFiles) {
      await loadSourceFile(path);
    }

    keepPanelTitleBlank();
    console.log(`[minibia-bot] Loaded source files from ${repository}@${ref}`);
  }

  load().catch((error) => {
    console.error("[minibia-bot] Source loader failed", error);
  });
})();
