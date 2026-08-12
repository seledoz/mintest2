(() => {
  const bundle = window.__minibiaBotBundle || window.__minibiaBotReloadBundle || {};
  const persistedEnabledModules = [
    ["rune", "minibiaBot.rune.config"],
    ["runeV2", "minibiaBot.runeV2.config"],
    ["runeV3", "minibiaBot.runeV3.config"],
    ["heal", "minibiaBot.heal.config"],
    ["antiParalyze", "minibiaBot.antiParalyzeV2.config"],
    ["damageTtsAlert", "minibiaBot.damageTtsAlert.config"],
    ["invisible", "minibiaBot.invisible.config"],
    ["magicShield", "minibiaBot.magicShield.config"],
    ["attack", "minibiaBot.attack.config"],
    ["attackAoe", "minibiaBot.attackAoe.config"],
    ["greatFireballV2", "minibiaBot.greatFireballV2.config"],
    ["lureMode", "minibiaBot.lure.config"],
    ["attackExclude", "minibiaBot.attackExclude.config"],
    ["attackPriority", "minibiaBot.attackPriority.config"],
    ["redTextAlert", "minibiaBot.redTextAlert.config"],
    ["cave", "minibiaBot.cave.config"],
    ["caveForwardLoop", "minibiaBot.caveForwardLoop.config"],
    ["equipRing", "minibiaBot.equipRing.config"],
    ["mining", "minibiaBot.mining.config"],
    ["eat", "minibiaBot.eat.config"],
    ["talk", "minibiaBot.talk.config"],
    ["runeMakerDrop", "minibiaBot.runeMakerDrop.config"],
    ["maxLight", "minibiaBot.maxLight.config"],
  ];

  function getPersistedEnabledSnapshot(bot) {
    const snapshot = {};
    const status = typeof bot?.status === "function" ? bot.status() : null;
    persistedEnabledModules.forEach(([moduleName]) => {
      const enabled = status?.[moduleName]?.config?.enabled;
      if (typeof enabled === "boolean") snapshot[moduleName] = enabled;
    });
    return snapshot;
  }

  function restorePersistedEnabledSnapshot(snapshot) {
    persistedEnabledModules.forEach(([moduleName, storageKey]) => {
      if (typeof snapshot?.[moduleName] !== "boolean") return;
      try {
        const rawValue = window.localStorage.getItem(storageKey);
        const config = rawValue ? JSON.parse(rawValue) : {};
        config.enabled = snapshot[moduleName];
        window.localStorage.setItem(storageKey, JSON.stringify(config));
      } catch (error) {
        console.error("[minibia-bot] failed to restore persisted enabled state", { module: moduleName, error });
      }
    });
  }

  function forceAttackAndCaveDisabled() {
    ["minibiaBot.attack.config", "minibiaBot.cave.config"].forEach((storageKey) => {
      try {
        const rawValue = window.localStorage.getItem(storageKey);
        const config = rawValue ? JSON.parse(rawValue) : {};
        config.enabled = false;
        window.localStorage.setItem(storageKey, JSON.stringify(config));
      } catch (error) {
        console.error("[minibia-bot] failed to disable startup module", { storageKey, error });
      }
    });
  }

  function removePanelDebugSection() {
    const debugToggle = document.getElementById("minibia-bot-debug-enabled");
    const debugSection = debugToggle?.closest?.(".mb-section");
    if (debugSection) {
      debugSection.remove();
      return true;
    }

    const labels = Array.from(document.querySelectorAll("#minibia-bot-panel .mb-label"));
    const debugLabel = labels.find((label) => String(label.textContent || "").trim().toLowerCase() === "debug");
    debugLabel?.closest?.(".mb-section")?.remove();
    return !!debugLabel;
  }

  function installGmKillSwitchBelowGithub(bot) {
    let attempts = 0;
    const placeControl = () => {
      const githubSection = document.getElementById("minibia-bot-github-waypoints-section");
      if (!githubSection) return false;

      document.getElementById("minibia-bot-gm-kill-switch-section")?.remove();
      document.getElementById("minibia-bot-gm-kill-switch-enabled")?.closest?.("label")?.remove();

      const section = document.createElement("div");
      section.className = "mb-section mb-column-section";
      section.id = "minibia-bot-gm-kill-switch-section";
      section.innerHTML = `
        <div class="mb-label">GM Kill Switch</div>
        <div class="mb-stack">
          <label class="mb-toggle">
            <input type="checkbox" id="minibia-bot-gm-kill-switch-enabled" />
            <span>Enable GM Kill Switch</span>
          </label>
          <label class="mb-field" id="minibia-bot-gm-exact-names-field">
            <span class="mb-field-label">Exact GM Name(s)</span>
            <textarea id="minibia-bot-gm-exact-names" placeholder="Enter the exact character name. One per line, or separate with commas."></textarea>
            <span class="mb-small-note">Matching ignores capital letters but otherwise uses the full entered name.</span>
          </label>
          <label class="mb-toggle">
            <input type="checkbox" id="minibia-bot-gm-responder-enabled" />
            <span>Enable GM Responder</span>
          </label>
          <label class="mb-field">
            <span class="mb-field-label">GM Auto Reply</span>
            <textarea id="minibia-bot-gm-responder-message" placeholder="One reply after a GM speaks"></textarea>
          </label>
          <div class="mb-small-note">Replies once, then resets after 15 seconds. The same chat line will not trigger again.</div>
        </div>
      `;

      githubSection.insertAdjacentElement("afterend", section);
      const killToggle = section.querySelector("#minibia-bot-gm-kill-switch-enabled");
      const responderToggle = section.querySelector("#minibia-bot-gm-responder-enabled");
      const responderMessage = section.querySelector("#minibia-bot-gm-responder-message");
      const exactNamesInput = section.querySelector("#minibia-bot-gm-exact-names");
      const exactNamesStorageKey = "minibiaBot.gmKillSwitch.exactNames";

      const loadExactNames = () => {
        try {
          return String(window.localStorage.getItem(exactNamesStorageKey) || "");
        } catch (_) {
          return "";
        }
      };
      const saveExactNames = () => {
        try {
          window.localStorage.setItem(exactNamesStorageKey, String(exactNamesInput?.value || ""));
        } catch (_) {}
      };

      if (exactNamesInput) exactNamesInput.value = loadExactNames();

      const refresh = () => {
        const status = bot.gmDefaultChatKillSwitch?.status?.() || {};
        if (killToggle) killToggle.checked = !!status.running;
        if (responderToggle) responderToggle.checked = !!status.config?.responderEnabled;
        if (responderMessage && responderMessage !== document.activeElement) {
          responderMessage.value = status.config?.responderMessage || "";
        }
      };

      killToggle?.addEventListener("change", () => {
        if (killToggle.checked) bot.gmDefaultChatKillSwitch?.start?.();
        else bot.gmDefaultChatKillSwitch?.stop?.();
        refresh();
      });
      responderToggle?.addEventListener("change", () => {
        bot.gmDefaultChatKillSwitch?.updateResponderConfig?.({ responderEnabled: responderToggle.checked });
        refresh();
      });
      const saveResponder = () => {
        bot.gmDefaultChatKillSwitch?.updateResponderConfig?.({ responderMessage: responderMessage?.value || "" });
      };
      responderMessage?.addEventListener("input", saveResponder);
      responderMessage?.addEventListener("change", saveResponder);
      responderMessage?.addEventListener("blur", saveResponder);
      exactNamesInput?.addEventListener("input", saveExactNames);
      exactNamesInput?.addEventListener("change", saveExactNames);
      exactNamesInput?.addEventListener("blur", saveExactNames);

      refresh();
      return true;
    };

    if (placeControl()) return;
    const timerId = window.setInterval(() => {
      attempts += 1;
      if (placeControl() || attempts >= 80) window.clearInterval(timerId);
    }, 250);
    bot.addCleanup?.(() => window.clearInterval(timerId));
  }

  function installPauseBreakToggle(bot) {
    let paused = false;
    let resumeSnapshot = { cave: false, attack: false, greatFireballV2: false, lureMode: false };

    function isTypingTarget(target) {
      if (!(target instanceof Element)) return false;
      if (target.closest("input, textarea, select, [contenteditable=\"true\"]")) return true;
      return false;
    }

    function updatePanelState() {
      const panel = document.getElementById("minibia-bot-panel");
      if (!panel) return;
      panel.dataset.pauseBreakPaused = paused ? "true" : "false";
      panel.style.outline = paused ? "3px solid #d93025" : "";
      panel.title = paused ? "PAUSED — press Pause/Break to resume Cavebot, Auto Attack, GFB, and Lure Mode" : "";
    }

    function pause() {
      if (paused) return false;

      resumeSnapshot = {
        cave: !!bot.cave?.status?.().running,
        attack: !!bot.attack?.status?.().running,
        greatFireballV2: !!bot.greatFireballV2?.status?.().running,
        lureMode: !!bot.lureMode?.status?.().running,
      };

      if (resumeSnapshot.lureMode) bot.lureMode.stop({ persistEnabled: false });
      if (resumeSnapshot.greatFireballV2) bot.greatFireballV2.stop({ persistEnabled: false });
      if (resumeSnapshot.attack) bot.attack.stop({ persistEnabled: false });
      if (resumeSnapshot.cave || bot.cave?.status?.().running) {
        bot.cave.stop({ persistEnabled: false });
      }

      paused = true;
      updatePanelState();
      bot.log("Pause/Break paused Cavebot, Auto Attack, GFB, and Lure Mode", { ...resumeSnapshot });
      return true;
    }

    function resume() {
      if (!paused) return false;
      const snapshot = { ...resumeSnapshot };
      paused = false;
      resumeSnapshot = { cave: false, attack: false, greatFireballV2: false, lureMode: false };
      if (snapshot.cave) bot.cave?.start?.();
      if (snapshot.attack) bot.attack?.start?.();
      if (snapshot.greatFireballV2) bot.greatFireballV2?.start?.();
      if (snapshot.lureMode) bot.lureMode?.start?.();
      updatePanelState();
      bot.log("Pause/Break resumed Cavebot, Auto Attack, GFB, and Lure Mode", snapshot);
      return true;
    }

    function toggle() {
      return paused ? resume() : pause();
    }

    function onKeyDown(event) {
      const isPauseBreak = event.key === "Pause" || event.code === "Pause" || event.keyCode === 19;
      if (!isPauseBreak || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }

    document.addEventListener("keydown", onKeyDown, true);
    bot.addCleanup(() => document.removeEventListener("keydown", onKeyDown, true));
    bot.pauseBreak = {
      pause,
      resume,
      toggle,
      status: () => ({ paused, resumeSnapshot: { ...resumeSnapshot } }),
    };
    updatePanelState();
  }

  function installLureCaveProgressPreserver(bot) {
    if (!bot?.cave?.start || !bot?.cave?.stop || !bot?.cave?.status || !bot?.cave?.setCurrentIndex) return null;

    const originalStart = bot.cave.start.bind(bot.cave);
    const originalStop = bot.cave.stop.bind(bot.cave);
    const state = { pending: null, restoreCount: 0, lastRestoreAt: 0 };

    function getLureMode() {
      const lureStatus = bot.lureMode?.status?.() || null;
      return Number(lureStatus?.config?.mode) === 2 ? 2 : 1;
    }

    function lureOwnsCave() {
      const lureStatus = bot.lureMode?.status?.() || null;
      if (!lureStatus?.running) return false;
      const mode = getLureMode();
      if (mode === 2) return !!lureStatus?.mode2?.active;
      return !!lureStatus?.clearingPack;
    }

    function snapshotProgress() {
      const caveStatus = bot.cave.status();
      const routeLength = Array.isArray(caveStatus?.route) ? caveStatus.route.length : 0;
      if (!caveStatus?.running || routeLength <= 0) return null;
      return {
        currentIndex: Math.max(0, Math.min(routeLength - 1, Math.trunc(Number(caveStatus.currentIndex) || 0))),
        direction: Number(caveStatus.direction) < 0 ? -1 : 1,
        routeLength,
        waypoint: caveStatus.currentWaypoint ? { ...caveStatus.currentWaypoint } : null,
        capturedAt: Date.now(),
      };
    }

    function stopCurrentMovement() {
      const targets = [
        window.gameClient?.world?.pathfinder,
        window.gameClient?.player,
        window.gameClient?.world,
      ].filter(Boolean);
      ["stop", "cancel", "clear", "clearPath", "stopWalking", "cancelWalking", "stopAutoWalk", "reset"].forEach((name) => {
        targets.forEach((target) => {
          if (typeof target?.[name] !== "function") return;
          try { target[name](); } catch (error) {}
        });
      });
    }

    bot.cave.stop = function lureAwareCaveStop(options = {}) {
      if (lureOwnsCave()) {
        const snapshot = snapshotProgress();
        if (snapshot) {
          state.pending = snapshot;
          bot.log?.("lure preserved cave waypoint before takeover", {
            index: snapshot.currentIndex + 1,
            direction: snapshot.direction,
            routeLength: snapshot.routeLength,
            waypoint: snapshot.waypoint,
          });
        }

        if (getLureMode() === 1 && bot.cave.status()?.running) {
          stopCurrentMovement();
          return true;
        }
      }
      return originalStop(options);
    };

    bot.cave.start = function lureAwareCaveStart(...args) {
      const pending = state.pending ? { ...state.pending } : null;
      const alreadyRunning = !!bot.cave.status()?.running;
      const result = alreadyRunning ? true : originalStart(...args);
      if (!pending || !bot.cave.status()?.running) return result;

      const currentStatus = bot.cave.status();
      const routeLength = Array.isArray(currentStatus?.route) ? currentStatus.route.length : 0;
      if (!routeLength) {
        state.pending = null;
        return result;
      }

      const restoreIndex = Math.max(0, Math.min(routeLength - 1, pending.currentIndex));
      bot.cave.setCurrentIndex(restoreIndex);

      const restoredStatus = bot.cave.status();
      const restoredWaypoint = restoredStatus?.currentWaypoint || null;
      stopCurrentMovement();

      if (restoredWaypoint) {
        try { bot.cave.goToWaypoint?.(restoredWaypoint); } catch (error) {}
      }

      state.pending = null;
      state.restoreCount += 1;
      state.lastRestoreAt = Date.now();
      bot.log?.("lure restored cave waypoint after takeover", {
        index: restoreIndex + 1,
        directionBeforeLure: pending.direction,
        routeLength,
        waypoint: restoredWaypoint,
      });
      return result;
    };

    bot.lureCaveProgressPreserver = {
      status: () => ({
        pending: state.pending ? { ...state.pending } : null,
        restoreCount: state.restoreCount,
        lastRestoreAt: state.lastRestoreAt,
      }),
    };
    return bot.lureCaveProgressPreserver;
  }

  function boot(currentBundle = bundle) {
    const previousEnabledSnapshot = getPersistedEnabledSnapshot(window.minibiaBot);
    if (window.minibiaBot?.destroy) window.minibiaBot.destroy();
    restorePersistedEnabledSnapshot(previousEnabledSnapshot);
    forceAttackAndCaveDisabled();

    const bot = currentBundle.createBot();
    currentBundle.installPzModule(bot);
    currentBundle.installXrayModule(bot);
    currentBundle.installPanicModule(bot);
    currentBundle.installGmDefaultChatKillSwitch?.(bot);
    currentBundle.installRuneModule(bot);
    currentBundle.installHealModule(bot);
    currentBundle.installAntiParalyzeModule?.(bot);
    currentBundle.installHasteParalyzeMonsterRangeGuard?.(bot);
    currentBundle.installDamageTtsAlertModule?.(bot);
    currentBundle.installAutoInvisibleModule(bot);
    currentBundle.installAutoMagicShieldModule(bot);
    currentBundle.installAutoAttackModule(bot);
    bot.attack?.updateConfig?.({
      enabled: false,
      maxTargetDistanceX: 7,
      maxTargetDistanceY: 5,
      runeCooldownMs: 2000,
    });
    bot.attack?.stop?.();
    currentBundle.installAutoAttackExcludeModule?.(bot);
    currentBundle.installAutoAttackAoeModule?.(bot);
    currentBundle.installRedTextAlertModule?.(bot);
    currentBundle.installCaveModule(bot);
    bot.cave?.updateConfig?.({ enabled: false });
    bot.cave?.stop?.();
    currentBundle.installCaveForwardLoopModule?.(bot);
    currentBundle.installCaveArrowKeysModule?.(bot);
    currentBundle.installEquipRingModule(bot);
    currentBundle.installMiningModule?.(bot);
    currentBundle.installAutoEatModule(bot);
    currentBundle.installTalkModule(bot);
    currentBundle.installMaxLightModule?.(bot);
    currentBundle.installPanel(bot);
    currentBundle.installCaveWaypointActionsModule?.(bot);

    bot.ui.inject();
    currentBundle.installQuickControlsSettingsModule?.(bot);
    currentBundle.installRuneV3KeyboardModule?.(bot);
    bot.gmDefaultChatKillSwitch?.injectPanelControl?.();
    bot.maxLight?.injectControls?.();
    installPauseBreakToggle(bot);
    currentBundle.installRuneMakerDropModule?.(bot);
    currentBundle.installAutoAttackPriorityModule?.(bot);
    currentBundle.installGreatFireballV2Module?.(bot);
    currentBundle.installLureModeModule?.(bot);
    installLureCaveProgressPreserver(bot);
    currentBundle.installGithubWaypointLibraryModule?.(bot);
    installGmKillSwitchBelowGithub(bot);
    removePanelDebugSection();
    window.setTimeout(removePanelDebugSection, 0);
    bot.caveArrowKeys?.ensureDropdownOption?.();
    document.getElementById("minibia-bot-waypoint-profiles-section")?.remove();
    bot.start = (...args) => bot.rune.start(...args);
    bot.stop = (...args) => bot.rune.stop(...args);
    bot.reload = () => window.minibiaBotReload?.();
    bot.status = () => ({
      version: bot.version.number,
      branch: bot.version.branch,
      commit: bot.version.commit,
      pz: { home: bot.pz.getHomePz() },
      xray: bot.xray.status(),
      panic: bot.panic.status(),
      gmDefaultChatKillSwitch: bot.gmDefaultChatKillSwitch?.status?.() || null,
      rune: bot.rune.status(),
      runeV2: bot.runeV2?.status?.() || null,
      runeV3: bot.runeV3?.status?.() || null,
      heal: bot.heal.status(),
      antiParalyze: bot.antiParalyze?.status?.() || null,
      damageTtsAlert: bot.damageTtsAlert?.status?.() || null,
      invisible: bot.invisible.status(),
      magicShield: bot.magicShield.status(),
      attack: bot.attack.status(),
      attackExclude: bot.attackExclude?.status?.() || null,
      attackPriority: bot.attackPriority?.status?.() || null,
      attackAoe: bot.attackAoe?.status?.() || null,
      greatFireballV2: bot.greatFireballV2?.status?.() || null,
      lureMode: bot.lureMode?.status?.() || null,
      redTextAlert: bot.redTextAlert?.status?.() || null,
      cave: bot.cave.status(),
      caveForwardLoop: bot.caveForwardLoop?.status?.() || null,
      caveArrowKeys: bot.caveArrowKeys?.status?.() || null,
      githubWaypointLibrary: bot.githubWaypointLibrary ? { path: bot.githubWaypointLibrary.path } : null,
      equipRing: bot.ring?.status?.() || bot.equipRing?.status?.() || null,
      mining: bot.mining?.status?.() || null,
      eat: bot.eat.status(),
      talk: bot.talk.status(),
      runeMakerDrop: bot.runeMakerDrop?.status?.() || null,
      maxLight: bot.maxLight?.status?.() || null,
      pauseBreak: bot.pauseBreak?.status?.() || null,
      lureCaveProgressPreserver: bot.lureCaveProgressPreserver?.status?.() || null,
    });

    window.minibiaBot = bot;
    window.pzBot = bot.pz;
    console.log("[minibia-bot] ready", {
      version: bot.version.number,
      branch: bot.version.branch,
      commit: bot.version.commit,
      buildDate: bot.version.date,
      modules: ["pz", "xray", "panic", "gmDefaultChatKillSwitch", "rune", "runeV2", "runeV3", "heal", "antiParalyze", "damageTtsAlert", "invisible", "magicShield", "attack", "attackExclude", "attackPriority", "attackAoe", "greatFireballV2", "lureMode", "redTextAlert", "cave", "caveForwardLoop", "caveArrowKeys", "caveWaypointActions", "githubWaypointLibrary", "equipRing", "mining", "eat", "talk", "runeMakerDrop", "maxLight", "pauseBreak", "ui"],
    });
    console.log("minibiaBot.reload()");
    console.log("minibiaBot.attackExclude.addName(\"monster name\")");
    console.log("minibiaBot.attackExclude.removeName(\"monster name\")");
    console.log("minibiaBot.attackPriority.addName(\"dragon lord\")");
    console.log("minibiaBot.attackPriority.moveName(\"dragon lord\", \"up\")");
    console.log("minibiaBot.attackPriority.removeName(\"dragon lord\")");
    console.log("minibiaBot.attackAoe.start({ spellHotbarSlot: 5, minMonsters: 3, squareRange: 3 })");
    console.log("minibiaBot.attackAoe.stop()");
    console.log("minibiaBot.greatFireballV2.start({ hotbarSlot: 8, minMonsters: 4 })");
    console.log("minibiaBot.greatFireballV2.stop()");
    console.log("minibiaBot.lureMode.updateConfig({ enabled: true, minMonsters: 3, maxDistance: 4 })");
    console.log("minibiaBot.redTextAlert.start()");
    console.log("minibiaBot.redTextAlert.stop()");
    console.log("minibiaBot.cave.start()");
    console.log("minibiaBot.cave.stop()");
    console.log("minibiaBot.damageTtsAlert.start()");
    console.log("minibiaBot.damageTtsAlert.stop()");
    console.log("minibiaBot.mining.start()");
    console.log("minibiaBot.mining.stop()");
    console.log("minibiaBot.runeV3.start({ hotkey: \"F1\", shift: false })");
    console.log("minibiaBot.runeV3.stop()");
  }

  window.__minibiaBotBoot = boot;
  boot();
})();