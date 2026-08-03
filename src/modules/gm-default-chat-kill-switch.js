window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installGmDefaultChatKillSwitch = function installGmDefaultChatKillSwitch(bot) {
  const configStorageKey = "minibiaBot.gmKillSwitch.config";
  const RESPONDER_DELAY_MS = 2000;
  const RESPONDER_RESET_MS = 15000;

  const config = Object.assign(
    {
      killSwitchEnabled: true,
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
    responderPending: false,
    responderLockedUntil: 0,
    seenEntryKeys: new Set(),
  };

  function persistConfig() {
    config.killSwitchEnabled = !!config.killSwitchEnabled;
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

  function valueAsName(value) {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    return String(value.name ?? value.playerName ?? value.characterName ?? value.label ?? value.text ?? "").trim();
  }

  function isDefaultChannel(channel) {
    const name = normalizeName(channel?.name ?? channel?.title ?? channel?.label);
    if (!name) return !!channel?.isDefault || channel?.type === "default";
    return name === "default" || name === "default chat" || name.startsWith("default ");
  }

  function getDefaultChannels() {
    const manager = window.gameClient?.interface?.channelManager;
    return Array.from(manager?.channels || manager?.channelList || []).filter(isDefaultChannel);
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
    const channelName = normalizeName(channel?.name || channel?.title || "default");
    const id = entry?.id ?? entry?._id ?? entry?.key ?? "";
    const time = entry?.__time ?? entry?.time ?? entry?.timestamp ?? entry?.createdAt ?? "";
    return [channelName, id, time, normalizeName(speaker), normalizeMessage(message)].join("|");
  }

  function getCurrentEntries() {
    const occurrences = new Map();
    const items = [];

    for (const channel of getDefaultChannels()) {
      for (const entry of getChannelEntries(channel)) {
        const message = getEntryMessage(entry);
        const speaker = getEntrySpeaker(entry, message);
        const baseKey = getEntryBaseKey(channel, entry, speaker, message);
        const occurrence = (occurrences.get(baseKey) || 0) + 1;
        occurrences.set(baseKey, occurrence);
        items.push({ channel, entry, message, speaker, key: `${baseKey}|occurrence:${occurrence}` });
      }
    }

    return items;
  }

  function rememberExistingEntries() {
    state.seenEntryKeys.clear();
    for (const item of getCurrentEntries()) state.seenEntryKeys.add(item.key);
  }

  function shouldWatch() {
    return !!config.killSwitchEnabled || !!config.responderEnabled;
  }

  function refreshPanelControls() {
    const killToggle = document.getElementById("minibia-bot-gm-kill-switch-enabled");
    const responderToggle = document.getElementById("minibia-bot-gm-responder-enabled");
    const responderMessage = document.getElementById("minibia-bot-gm-responder-message");
    if (killToggle) killToggle.checked = !!config.killSwitchEnabled;
    if (responderToggle) responderToggle.checked = !!config.responderEnabled;
    if (responderMessage && responderMessage !== document.activeElement) responderMessage.value = config.responderMessage;
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

  function handleGameMasterChat(speaker, message) {
    const responderScheduled = scheduleResponder(speaker, message);
    if (!config.killSwitchEnabled) {
      bot.log?.("game master detected by responder", { speaker, message, responderScheduled });
      return true;
    }

    bot.log?.("game master kill switch triggered from Default chat", { speaker, message, responderScheduled });
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

  function isConfiguredGameMaster(entry, speaker, gmNames) {
    if (gmNames.has(normalizeName(speaker))) return true;
    return !!(entry?.isGameMaster || entry?.isGamemaster || entry?.gameMaster || entry?.gamemaster || entry?.speaker?.isGameMaster || entry?.sender?.isGameMaster || entry?.author?.isGameMaster);
  }

  function tick() {
    if (!state.watcherRunning || !shouldWatch()) return;
    const gmNames = new Set((bot.panic?.getGameMasterNames?.() || []).map(normalizeName));

    for (const item of getCurrentEntries()) {
      if (state.seenEntryKeys.has(item.key)) continue;
      state.seenEntryKeys.add(item.key);
      if (!item.speaker || !isConfiguredGameMaster(item.entry, item.speaker, gmNames)) continue;
      handleGameMasterChat(item.speaker, item.message);
      if (!state.watcherRunning || !shouldWatch()) return;
    }

    state.timerId = window.setTimeout(tick, 1000);
  }

  function startWatcher() {
    if (state.watcherRunning) return false;
    state.watcherRunning = true;
    rememberExistingEntries();
    tick();
    bot.log?.("GM Default chat watcher started");
    return true;
  }

  function stopWatcher() {
    if (!state.watcherRunning && state.timerId == null) return false;
    state.watcherRunning = false;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    bot.log?.("GM Default chat watcher stopped");
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
    if (!section || !section.querySelector("#minibia-bot-gm-responder-message")) {
      section?.remove();
      section = document.createElement("div");
      section.className = "mb-section mb-column-section";
      section.id = "minibia-bot-gm-kill-switch-section";
      section.innerHTML = `
        <div class="mb-label">GM Kill Switch</div>
        <div class="mb-stack">
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gm-kill-switch-enabled" /><span>Enable GM Kill Switch</span></label>
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gm-responder-enabled" /><span>Enable GM Responder</span></label>
          <label class="mb-field"><span class="mb-field-label">GM Auto Reply</span><textarea id="minibia-bot-gm-responder-message" placeholder="One reply after a GM speaks"></textarea></label>
          <div class="mb-small-note">Replies once, then resets after 15 seconds. The same chat line will not trigger again.</div>
        </div>
      `;
      githubSection.insertAdjacentElement("afterend", section);
    } else if (githubSection.nextElementSibling !== section) {
      githubSection.insertAdjacentElement("afterend", section);
    }

    const killToggle = section.querySelector("#minibia-bot-gm-kill-switch-enabled");
    const responderToggle = section.querySelector("#minibia-bot-gm-responder-enabled");
    const responderMessage = section.querySelector("#minibia-bot-gm-responder-message");

    if (killToggle && killToggle.dataset.gmBound !== "true") {
      killToggle.dataset.gmBound = "true";
      killToggle.addEventListener("change", () => killToggle.checked ? start() : stop());
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

    refreshPanelControls();
    return true;
  }

  persistConfig();
  bot.gmDefaultChatKillSwitch = {
    start,
    stop,
    status: () => ({
      running: !!config.killSwitchEnabled,
      watcherRunning: state.watcherRunning,
      responderPending: state.responderPending,
      responderLockedUntil: state.responderLockedUntil,
      config: { ...config },
    }),
    updateResponderConfig,
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
    state.pendingReplyTimerId = null;
    state.responderPending = false;
  });
};