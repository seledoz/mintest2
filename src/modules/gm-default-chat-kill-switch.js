window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installGmDefaultChatKillSwitch = function installGmDefaultChatKillSwitch(bot) {
  const configStorageKey = "minibiaBot.gmKillSwitch.config";
  const exactNamesStorageKey = "minibiaBot.gmKillSwitch.exactNames";
  const RESPONDER_DELAY_MS = 2000;
  const RESPONDER_RESET_MS = 15000;
  const GM_PAUSE_MS = 10000;

  const config = Object.assign(
    {
      killSwitchEnabled: false,
      pauseEnabled: false,
      responderEnabled: false,
      responderMessage: "",
      responderDelayMs: RESPONDER_DELAY_MS,
      responderResetMs: RESPONDER_RESET_MS,
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    watcherRunning: false,
    timerId: null,
    panelTimerId: null,
    pendingReplyTimerId: null,
    pauseTimerId: null,
    responderPending: false,
    responderLockedUntil: 0,
    pauseActive: false,
    pauseResumeSnapshot: null,
    visibleGmKey: null,
    seenEntryKeys: new Set(),
  };

  function persistConfig() {
    config.killSwitchEnabled = !!config.killSwitchEnabled;
    config.pauseEnabled = !!config.pauseEnabled;
    config.responderEnabled = !!config.responderEnabled;
    config.responderMessage = String(config.responderMessage || "").trim();
    config.responderDelayMs = RESPONDER_DELAY_MS;
    config.responderResetMs = RESPONDER_RESET_MS;
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizeMessage(message) {
    return String(message || "").replace(/\s+/g, " ").trim();
  }

  function normalizeNameList(value) {
    const source = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
    const seen = new Set();
    const result = [];
    source.forEach((name) => {
      const displayName = String(name || "").trim();
      const normalized = normalizeName(displayName);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(displayName);
    });
    return result;
  }

  function readExactNames() {
    try {
      return normalizeNameList(window.localStorage.getItem(exactNamesStorageKey) || "");
    } catch (_) {
      return [];
    }
  }

  function writeExactNames(names) {
    const normalized = normalizeNameList(names);
    try {
      window.localStorage.setItem(exactNamesStorageKey, normalized.join("\n"));
    } catch (_) {}
    refreshPanelControls();
    return normalized;
  }

  function getConfiguredGameMasterNames() {
    const names = [
      ...readExactNames(),
      ...(bot.panic?.getGameMasterNames?.() || []),
    ];
    return normalizeNameList(names);
  }

  function valueAsName(value) {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    return String(value.name ?? value.playerName ?? value.characterName ?? value.label ?? value.text ?? "").trim();
  }

  function getChannels() {
    const manager = window.gameClient?.interface?.channelManager;
    return Array.from(manager?.channels || manager?.channelList || []);
  }

  function getChannelEntries(channel) {
    return Array.from(channel?.__contents ?? channel?.contents ?? channel?.messages ?? channel?.entries ?? channel?.history ?? []);
  }

  function getEntryMessage(entry) {
    return String(entry?.message ?? entry?.text ?? entry?.content ?? entry?.value ?? entry?.body ?? "");
  }

  function stripChatPrefix(message) {
    return String(message || "").replace(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, "").trim();
  }

  function getEntrySpeaker(entry, message) {
    const direct = entry?.speakerName ?? entry?.speaker ?? entry?.name ?? entry?.author ?? entry?.senderName ?? entry?.sender ?? entry?.playerName ?? entry?.characterName ?? entry?.creature?.name ?? entry?.player?.name;
    const directName = valueAsName(direct);
    if (directName) return directName;

    const text = stripChatPrefix(message);
    const saysMatch = text.match(/^(.+?)\s+says:\s*/i);
    if (saysMatch?.[1]) return saysMatch[1].trim();
    const colonMatch = text.match(/^([^:]{1,40}):\s+.+$/);
    return colonMatch?.[1]?.trim() || null;
  }

  function getEntryBaseKey(channel, entry, speaker, message) {
    const channelName = normalizeName(channel?.name || channel?.title || channel?.label || channel?.type || "chat");
    const id = entry?.id ?? entry?._id ?? entry?.key ?? "";
    const time = entry?.__time ?? entry?.time ?? entry?.timestamp ?? entry?.createdAt ?? "";
    return [channelName, id, time, normalizeName(speaker), normalizeMessage(message)].join("|");
  }

  function getCurrentEntries() {
    const occurrences = new Map();
    const items = [];

    for (const channel of getChannels()) {
      for (const entry of getChannelEntries(channel)) {
        const message = getEntryMessage(entry);
        const speaker = getEntrySpeaker(entry, message);
        const baseKey = getEntryBaseKey(channel, entry, speaker, message);
        const occurrence = (occurrences.get(baseKey) || 0) + 1;
        occurrences.set(baseKey, occurrence);
        items.push({
          channel,
          entry,
          message,
          speaker,
          channelName: String(channel?.name || channel?.title || channel?.label || channel?.type || "chat"),
          key: `${baseKey}|occurrence:${occurrence}`,
        });
      }
    }

    return items;
  }

  function rememberExistingEntries() {
    state.seenEntryKeys.clear();
    for (const item of getCurrentEntries()) state.seenEntryKeys.add(item.key);
  }

  function shouldWatch() {
    return !!config.killSwitchEnabled || !!config.pauseEnabled || !!config.responderEnabled;
  }

  function refreshPanelControls() {
    const killToggle = document.getElementById("minibia-bot-gm-kill-switch-enabled");
    const pauseToggle = document.getElementById("minibia-bot-gm-pause-enabled");
    const responderToggle = document.getElementById("minibia-bot-gm-responder-enabled");
    const responderMessage = document.getElementById("minibia-bot-gm-responder-message");
    const exactNamesInput = document.getElementById("minibia-bot-gm-exact-names");
    if (killToggle) killToggle.checked = !!config.killSwitchEnabled;
    if (pauseToggle) pauseToggle.checked = !!config.pauseEnabled;
    if (responderToggle) responderToggle.checked = !!config.responderEnabled;
    if (responderMessage && responderMessage !== document.activeElement) responderMessage.value = config.responderMessage;
    if (exactNamesInput && exactNamesInput !== document.activeElement) exactNamesInput.value = readExactNames().join("\n");
  }

  function sendReply(reply) {
    const senders = [
      () => bot.sendChat?.(reply),
      () => window.gameClient?.sendChat?.(reply),
      () => window.gameClient?.interface?.channelManager?.sendMessage?.(reply),
      () => window.gameClient?.interface?.channelManager?.say?.(reply),
    ];
    for (const send of senders) {
      try {
        const result = send();
        if (result !== undefined && result !== false) return true;
      } catch (error) {
        bot.log?.("GM responder send method failed", { error: String(error) });
      }
    }
    return false;
  }

  function scheduleResponder(speaker, message) {
    const reply = String(config.responderMessage || "").trim();
    const now = Date.now();
    if (!config.responderEnabled || !reply) return false;
    if (state.responderPending || now < state.responderLockedUntil) return false;

    state.responderPending = true;
    state.pendingReplyTimerId = window.setTimeout(() => {
      state.pendingReplyTimerId = null;
      state.responderPending = false;
      const sent = sendReply(reply);
      state.responderLockedUntil = Date.now() + RESPONDER_RESET_MS;
      bot.log?.(sent ? "GM responder sent one reply" : "GM responder failed to send reply", {
        speaker,
        message,
        reply,
        resetMs: RESPONDER_RESET_MS,
      });
    }, RESPONDER_DELAY_MS);

    bot.log?.("GM responder scheduled one reply", {
      speaker,
      reply,
      delayMs: RESPONDER_DELAY_MS,
      resetMs: RESPONDER_RESET_MS,
    });
    return true;
  }

  function forceStopWalkingOnce() {
    const candidates = [
      [window.gameClient?.player, "stopWalking"],
      [window.gameClient?.player, "stopAutoWalk"],
      [window.gameClient?.world?.pathfinder, "stop"],
      [window.gameClient?.world?.pathfinder, "cancel"],
      [window.gameClient?.world?.pathfinder, "clearPath"],
      [window.gameClient?.world, "stopWalking"],
    ];

    for (const [target, method] of candidates) {
      if (typeof target?.[method] !== "function") continue;
      try {
        target[method]();
        bot.log?.("GM safety forced walking stop", { method });
        return true;
      } catch (error) {
        bot.log?.("GM safety walking stop command failed", { method, error: String(error) });
      }
    }

    bot.log?.("GM safety could not find walking stop command");
    return false;
  }

  function triggerKillSwitch(source, speaker, message = "", details = {}) {
    if (!config.killSwitchEnabled) return false;

    const walkingStopped = forceStopWalkingOnce();
    bot.log?.("game master kill switch triggered", {
      source,
      speaker,
      message,
      walkingStopped,
      ...details,
    });
    bot.cave?.stop?.();
    bot.attack?.stop?.();
    bot.ui?.refreshAutoAttackStatus?.();
    bot.ui?.refreshCaveStatus?.();
    config.killSwitchEnabled = false;
    persistConfig();
    syncWatcher();
    refreshPanelControls();
    return true;
  }

  function resumeGmPause() {
    if (!state.pauseActive) return false;
    const snapshot = state.pauseResumeSnapshot || { cave: false, attack: false };
    state.pauseTimerId = null;
    state.pauseActive = false;
    state.pauseResumeSnapshot = null;

    if (snapshot.cave) bot.cave?.start?.();
    if (snapshot.attack) bot.attack?.start?.();
    bot.ui?.refreshAutoAttackStatus?.();
    bot.ui?.refreshCaveStatus?.();
    bot.log?.("GM pause resumed modules after 10 seconds", snapshot);
    return true;
  }

  function triggerGmPause(source, speaker, message = "", details = {}) {
    if (!config.pauseEnabled || state.pauseActive) return false;

    const snapshot = {
      cave: !!bot.cave?.status?.().running,
      attack: !!bot.attack?.status?.().running,
    };
    const walkingStopped = forceStopWalkingOnce();
    state.pauseActive = true;
    state.pauseResumeSnapshot = snapshot;

    if (snapshot.cave) bot.cave?.stop?.({ persistEnabled: false });
    if (snapshot.attack) bot.attack?.stop?.({ persistEnabled: false });
    bot.ui?.refreshAutoAttackStatus?.();
    bot.ui?.refreshCaveStatus?.();

    state.pauseTimerId = window.setTimeout(resumeGmPause, GM_PAUSE_MS);
    bot.log?.("GM pause triggered", {
      source,
      speaker,
      message,
      walkingStopped,
      pauseMs: GM_PAUSE_MS,
      resumeSnapshot: snapshot,
      ...details,
    });
    return true;
  }

  function handleGameMasterDetection(source, speaker, message = "", details = {}) {
    const responderScheduled = source === "chat" ? scheduleResponder(speaker, message) : false;

    // Kill switch takes precedence when both safety modes are enabled.
    if (config.killSwitchEnabled) {
      return triggerKillSwitch(source, speaker, message, { responderScheduled, ...details });
    }

    if (config.pauseEnabled) {
      const paused = triggerGmPause(source, speaker, message, details);
      if (paused) return true;
    }

    if (source === "chat" && config.responderEnabled) {
      bot.log?.("game master detected by responder", { speaker, message, responderScheduled, ...details });
      return true;
    }

    return false;
  }

  function isConfiguredGameMaster(entry, speaker, gmNames) {
    if (speaker && gmNames.has(normalizeName(speaker))) return true;
    return !!(entry?.isGameMaster || entry?.isGamemaster || entry?.gameMaster || entry?.gamemaster || entry?.speaker?.isGameMaster || entry?.sender?.isGameMaster || entry?.author?.isGameMaster);
  }

  function getVisibleConfiguredGameMaster(gmNames) {
    if (!gmNames.size) return null;
    const players = bot.xray?.getVisiblePlayers?.() || [];
    return players.find((player) => gmNames.has(normalizeName(player?.name))) || null;
  }

  function tick() {
    if (!state.watcherRunning || !shouldWatch()) return;
    const gmNames = new Set(getConfiguredGameMasterNames().map(normalizeName));

    if (config.killSwitchEnabled || config.pauseEnabled) {
      const visibleGm = getVisibleConfiguredGameMaster(gmNames);
      const visibleKey = visibleGm ? normalizeName(visibleGm.name) : null;
      if (!visibleGm) {
        state.visibleGmKey = null;
      } else if (visibleKey && visibleKey !== state.visibleGmKey) {
        state.visibleGmKey = visibleKey;
        handleGameMasterDetection("visible-player", visibleGm.name || "GM", "", {
          position: visibleGm?.getPosition?.() || visibleGm?.__position || null,
        });
        if (!state.watcherRunning || !shouldWatch()) return;
      }
    }

    for (const item of getCurrentEntries()) {
      if (state.seenEntryKeys.has(item.key)) continue;
      state.seenEntryKeys.add(item.key);
      if (!item.speaker || !isConfiguredGameMaster(item.entry, item.speaker, gmNames)) continue;
      handleGameMasterDetection("chat", item.speaker, item.message, { channel: item.channelName });
      if (!state.watcherRunning || !shouldWatch()) return;
    }

    state.timerId = window.setTimeout(tick, 1000);
  }

  function startWatcher() {
    if (!shouldWatch() || state.watcherRunning) return false;
    state.watcherRunning = true;
    rememberExistingEntries();
    tick();
    bot.log?.("GM chat/visible watcher started", { exactNames: readExactNames() });
    return true;
  }

  function stopWatcher() {
    if (!state.watcherRunning && state.timerId == null) return false;
    state.watcherRunning = false;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    state.visibleGmKey = null;
    bot.log?.("GM chat/visible watcher stopped");
    return true;
  }

  function syncWatcher() {
    if (shouldWatch()) startWatcher();
    else stopWatcher();
    refreshPanelControls();
  }

  function start() {
    if (config.killSwitchEnabled) return false;
    config.killSwitchEnabled = true;
    persistConfig();
    syncWatcher();
    return true;
  }

  function stop() {
    if (!config.killSwitchEnabled) return false;
    config.killSwitchEnabled = false;
    persistConfig();
    syncWatcher();
    return true;
  }

  function setPauseEnabled(enabled) {
    const next = !!enabled;
    if (config.pauseEnabled === next) return false;
    config.pauseEnabled = next;
    persistConfig();
    syncWatcher();
    return true;
  }

  function updateResponderConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "responderEnabled")) config.responderEnabled = !!nextConfig.responderEnabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "responderMessage")) config.responderMessage = String(nextConfig.responderMessage || "").trim();
    persistConfig();
    syncWatcher();
    return { ...config };
  }

  function injectPanelControl() {
    const githubSection = document.getElementById("minibia-bot-github-waypoints-section");
    const panel = document.getElementById("minibia-bot-panel");
    if (!panel || !githubSection) return false;

    let section = document.getElementById("minibia-bot-gm-kill-switch-section");
    if (!section || !section.querySelector("#minibia-bot-gm-exact-names") || !section.querySelector("#minibia-bot-gm-pause-enabled") || !section.querySelector("#minibia-bot-gm-responder-message")) {
      section?.remove();
      section = document.createElement("div");
      section.className = "mb-section mb-column-section";
      section.id = "minibia-bot-gm-kill-switch-section";
      section.innerHTML = `
        <div class="mb-label">GM Kill Switch</div>
        <div class="mb-stack">
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gm-kill-switch-enabled" /><span>Enable GM Kill Switch</span></label>
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gm-pause-enabled" /><span>GM Pause</span></label>
          <label class="mb-field" id="minibia-bot-gm-exact-names-field">
            <span class="mb-field-label">Exact GM Name(s)</span>
            <textarea id="minibia-bot-gm-exact-names" placeholder="Enter the exact character name. One per line, or separate with commas."></textarea>
            <span class="mb-small-note">Kill Switch and GM Pause trigger if this exact name appears on screen or sends a chat/private message. Matching ignores capital letters.</span>
          </label>
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gm-responder-enabled" /><span>Enable GM Responder</span></label>
          <label class="mb-field"><span class="mb-field-label">GM Auto Reply</span><textarea id="minibia-bot-gm-responder-message" placeholder="One reply after a GM speaks"></textarea></label>
          <div class="mb-small-note">GM Pause force-stops walking, pauses Cavebot/Auto Attack for 10 seconds, then resumes only what was running. Responder replies once, then resets after 15 seconds.</div>
        </div>
      `;
      githubSection.insertAdjacentElement("afterend", section);
    } else if (githubSection.nextElementSibling !== section) {
      githubSection.insertAdjacentElement("afterend", section);
    }

    const killToggle = section.querySelector("#minibia-bot-gm-kill-switch-enabled");
    const pauseToggle = section.querySelector("#minibia-bot-gm-pause-enabled");
    const responderToggle = section.querySelector("#minibia-bot-gm-responder-enabled");
    const responderMessage = section.querySelector("#minibia-bot-gm-responder-message");
    const exactNamesInput = section.querySelector("#minibia-bot-gm-exact-names");

    if (killToggle && killToggle.dataset.gmBound !== "true") {
      killToggle.dataset.gmBound = "true";
      killToggle.addEventListener("change", () => killToggle.checked ? start() : stop());
    }
    if (pauseToggle && pauseToggle.dataset.gmBound !== "true") {
      pauseToggle.dataset.gmBound = "true";
      pauseToggle.addEventListener("change", () => setPauseEnabled(pauseToggle.checked));
    }
    if (responderToggle && responderToggle.dataset.gmBound !== "true") {
      responderToggle.dataset.gmBound = "true";
      responderToggle.addEventListener("change", () => updateResponderConfig({ responderEnabled: responderToggle.checked }));
    }
    if (responderMessage && responderMessage.dataset.gmBound !== "true") {
      responderMessage.dataset.gmBound = "true";
      const save = () => updateResponderConfig({ responderMessage: responderMessage.value });
      responderMessage.addEventListener("input", save);
      responderMessage.addEventListener("change", save);
      responderMessage.addEventListener("blur", save);
    }
    if (exactNamesInput && exactNamesInput.dataset.gmBound !== "true") {
      exactNamesInput.dataset.gmBound = "true";
      const save = () => writeExactNames(exactNamesInput.value);
      exactNamesInput.addEventListener("input", save);
      exactNamesInput.addEventListener("change", save);
      exactNamesInput.addEventListener("blur", save);
    }

    refreshPanelControls();
    return true;
  }

  persistConfig();
  bot.gmDefaultChatKillSwitch = {
    start,
    stop,
    setPauseEnabled,
    status: () => ({
      running: !!config.killSwitchEnabled,
      pauseEnabled: !!config.pauseEnabled,
      pauseActive: state.pauseActive,
      pauseResumeSnapshot: state.pauseResumeSnapshot ? { ...state.pauseResumeSnapshot } : null,
      watcherRunning: state.watcherRunning,
      responderPending: state.responderPending,
      responderLockedUntil: state.responderLockedUntil,
      exactNames: readExactNames(),
      configuredGameMasterNames: getConfiguredGameMasterNames(),
      config: { ...config },
    }),
    updateResponderConfig,
    getExactNames: readExactNames,
    setExactNames: writeExactNames,
    injectPanelControl,
  };

  syncWatcher();
  let attempts = 0;
  state.panelTimerId = window.setInterval(() => {
    attempts += 1;
    if (injectPanelControl() || attempts >= 120) {
      window.clearInterval(state.panelTimerId);
      state.panelTimerId = null;
    }
  }, 250);

  bot.addCleanup?.(() => {
    if (state.panelTimerId != null) window.clearInterval(state.panelTimerId);
    if (state.timerId != null) window.clearTimeout(state.timerId);
    if (state.pendingReplyTimerId != null) window.clearTimeout(state.pendingReplyTimerId);
    if (state.pauseTimerId != null) window.clearTimeout(state.pauseTimerId);
    state.pendingReplyTimerId = null;
    state.pauseTimerId = null;
    state.responderPending = false;
    state.pauseActive = false;
    state.pauseResumeSnapshot = null;
  });
};