window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installGmDefaultChatKillSwitch = function installGmDefaultChatKillSwitch(bot) {
  const configStorageKey = "minibiaBot.gmKillSwitch.config";
  const config = Object.assign(
    {
      killSwitchEnabled: true,
      responderEnabled: false,
      responderMessage: "",
      responderDelayMs: 2000,
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    watcherRunning: false,
    timerId: null,
    seenEntryKeys: new Set(),
    panelTimerId: null,
    pendingReplyTimerIds: new Set(),
    responderPending: false,
    responderNextAvailableAt: 0,
  };

  function persistConfig() {
    config.killSwitchEnabled = !!config.killSwitchEnabled;
    config.responderEnabled = !!config.responderEnabled;
    config.responderMessage = String(config.responderMessage || "").trim();
    config.responderDelayMs = 2000;
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function valueAsName(value) {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    return String(
      value.name ??
      value.playerName ??
      value.characterName ??
      value.label ??
      value.text ??
      ""
    ).trim();
  }

  function isDefaultChannel(channel) {
    const name = normalizeName(channel?.name ?? channel?.title ?? channel?.label);
    if (!name) return !!channel?.isDefault || channel?.type === "default";
    return name === "default" || name === "default chat" || name.startsWith("default ");
  }

  function getDefaultChannels() {
    const manager = window.gameClient?.interface?.channelManager;
    const channels = manager?.channels || manager?.channelList || [];
    return Array.from(channels || []).filter(isDefaultChannel);
  }

  function getChannelEntries(channel) {
    const entries =
      channel?.__contents ??
      channel?.contents ??
      channel?.messages ??
      channel?.entries ??
      channel?.history ??
      [];
    return Array.from(entries || []);
  }

  function getEntryMessage(entry) {
    return String(
      entry?.message ??
      entry?.text ??
      entry?.content ??
      entry?.value ??
      entry?.body ??
      ""
    );
  }

  function stripChatPrefix(message) {
    return String(message || "")
      .replace(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, "")
      .trim();
  }

  function getEntrySpeaker(entry, message) {
    const directSpeaker =
      entry?.speakerName ??
      entry?.speaker ??
      entry?.name ??
      entry?.author ??
      entry?.senderName ??
      entry?.sender ??
      entry?.playerName ??
      entry?.characterName ??
      entry?.creature?.name ??
      entry?.player?.name;

    const directName = valueAsName(directSpeaker);
    if (directName) return directName;

    const text = stripChatPrefix(message);
    const saysMatch = text.match(/^(.+?)\s+says:\s*/i);
    if (saysMatch?.[1]) return saysMatch[1].trim();

    const colonMatch = text.match(/^([^:]{1,40}):\s+.+$/);
    return colonMatch?.[1]?.trim() || null;
  }

  function getEntryKey(channel, entry, index) {
    const message = getEntryMessage(entry);
    const time = entry?.__time ?? entry?.time ?? entry?.timestamp ?? entry?.createdAt ?? "no-time";
    const speaker = getEntrySpeaker(entry, message) || "no-speaker";
    const id = entry?.id ?? entry?._id ?? entry?.key ?? "no-id";
    return `${channel?.name || channel?.title || "Default"}|${id}|${time}|${speaker}|${message}|${index}`;
  }

  function getCurrentEntries() {
    return getDefaultChannels().flatMap((channel) =>
      getChannelEntries(channel).map((entry, index) => ({
        channel,
        entry,
        index,
        message: getEntryMessage(entry),
      }))
    );
  }

  function rememberExistingEntries() {
    state.seenEntryKeys.clear();
    for (const item of getCurrentEntries()) {
      state.seenEntryKeys.add(getEntryKey(item.channel, item.entry, item.index));
    }
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
    if (responderMessage && responderMessage !== document.activeElement) {
      responderMessage.value = config.responderMessage;
    }
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
        bot.log("GM responder send method failed", { error: String(error) });
      }
    }

    return false;
  }

  function scheduleResponder(speaker, message) {
    const reply = String(config.responderMessage || "").trim();
    if (!config.responderEnabled || !reply || state.responderPending) return false;

    const now = Date.now();
    const cooldownDelay = Math.max(0, state.responderNextAvailableAt - now);
    const delayMs = Math.max(2000, cooldownDelay);
    state.responderPending = true;

    const timerId = window.setTimeout(() => {
      state.pendingReplyTimerIds.delete(timerId);
      state.responderPending = false;
      const sent = sendReply(reply);
      if (sent) state.responderNextAvailableAt = Date.now() + 5000;
      bot.log(sent ? "GM responder sent reply" : "GM responder failed to send reply", {
        speaker,
        message,
        reply,
        delayMs,
        cooldownMs: 5000,
      });
    }, delayMs);

    state.pendingReplyTimerIds.add(timerId);
    bot.log("GM responder scheduled reply", { speaker, reply, delayMs, cooldownMs: 5000 });
    return true;
  }

  function handleGameMasterChat(speaker, message) {
    const responderScheduled = scheduleResponder(speaker, message);

    if (!config.killSwitchEnabled) {
      bot.log("game master detected by responder", {
        players: [speaker],
        speaker,
        message,
        source: "default-chat",
        responderScheduled,
      });
      return true;
    }

    bot.log("game master kill switch triggered from Default chat", {
      players: [speaker],
      speaker,
      message,
      source: "default-chat",
      responderScheduled,
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

  function isConfiguredGameMaster(entry, speaker, gmNames) {
    if (gmNames.has(normalizeName(speaker))) return true;
    return !!(
      entry?.isGameMaster ||
      entry?.isGamemaster ||
      entry?.gameMaster ||
      entry?.gamemaster ||
      entry?.speaker?.isGameMaster ||
      entry?.sender?.isGameMaster ||
      entry?.author?.isGameMaster
    );
  }

  function tick() {
    if (!state.watcherRunning || !shouldWatch()) return;

    const gmNames = new Set((bot.panic?.getGameMasterNames?.() || []).map(normalizeName));

    for (const item of getCurrentEntries()) {
      const key = getEntryKey(item.channel, item.entry, item.index);
      if (state.seenEntryKeys.has(key)) continue;
      state.seenEntryKeys.add(key);

      const speaker = getEntrySpeaker(item.entry, item.message);
      if (!speaker || !isConfiguredGameMaster(item.entry, speaker, gmNames)) continue;

      handleGameMasterChat(speaker, item.message);
      if (!state.watcherRunning || !shouldWatch()) return;
    }

    state.timerId = window.setTimeout(tick, 1000);
  }

  function startWatcher() {
    if (state.watcherRunning) return false;
    state.watcherRunning = true;
    rememberExistingEntries();
    tick();
    bot.log("GM Default chat watcher started");
    return true;
  }

  function stopWatcher() {
    if (!state.watcherRunning && state.timerId == null) return false;
    state.watcherRunning = false;
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    bot.log("GM Default chat watcher stopped");
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
    bot.log("GM kill switch enabled");
    return true;
  }

  function stop() {
    if (!config.killSwitchEnabled) {
      refreshPanelControls();
      return false;
    }
    config.killSwitchEnabled = false;
    persistConfig();
    syncWatcher();
    bot.log("GM kill switch disabled");
    return true;
  }

  function updateResponderConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "responderEnabled")) {
      config.responderEnabled = !!nextConfig.responderEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "responderMessage")) {
      config.responderMessage = String(nextConfig.responderMessage || "").trim();
    }
    persistConfig();
    syncWatcher();
    return { ...config };
  }

  function injectPanelControl() {
    const githubSection = document.getElementById("minibia-bot-github-waypoints-section");
    const panel = document.getElementById("minibia-bot-panel");
    if (!panel || !githubSection) return false;

    let section = document.getElementById("minibia-bot-gm-kill-switch-section");
    const sectionIsIncomplete = section && (
      !section.querySelector("#minibia-bot-gm-kill-switch-enabled") ||
      !section.querySelector("#minibia-bot-gm-responder-enabled") ||
      !section.querySelector("#minibia-bot-gm-responder-message")
    );

    if (sectionIsIncomplete) {
      section.remove();
      section = null;
    }

    if (!section) {
      section = document.createElement("div");
      section.className = "mb-section mb-column-section";
      section.id = "minibia-bot-gm-kill-switch-section";
      section.innerHTML = `
        <div class="mb-label">GM Kill Switch</div>
        <div class="mb-stack">
          <label class="mb-toggle">
            <input type="checkbox" id="minibia-bot-gm-kill-switch-enabled" />
            <span>Enable GM Kill Switch</span>
          </label>
          <label class="mb-toggle">
            <input type="checkbox" id="minibia-bot-gm-responder-enabled" />
            <span>Enable GM Responder</span>
          </label>
          <label class="mb-field">
            <span class="mb-field-label">GM Auto Reply</span>
            <textarea id="minibia-bot-gm-responder-message" placeholder="Message sent 2 seconds after a GM speaks"></textarea>
          </label>
          <div class="mb-small-note">First reply: 2 seconds • following replies: at least 5 seconds apart</div>
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
      killToggle.addEventListener("change", () => {
        if (killToggle.checked) start();
        else stop();
        refreshPanelControls();
      });
    }

    if (responderToggle && responderToggle.dataset.gmBound !== "true") {
      responderToggle.dataset.gmBound = "true";
      responderToggle.addEventListener("change", () => {
        updateResponderConfig({ responderEnabled: responderToggle.checked });
      });
    }

    if (responderMessage && responderMessage.dataset.gmBound !== "true") {
      responderMessage.dataset.gmBound = "true";
      const saveMessage = () => updateResponderConfig({ responderMessage: responderMessage.value });
      responderMessage.addEventListener("input", saveMessage);
      responderMessage.addEventListener("change", saveMessage);
      responderMessage.addEventListener("blur", saveMessage);
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
      responderNextAvailableAt: state.responderNextAvailableAt,
      config: { ...config },
    }),
    updateResponderConfig,
    injectPanelControl,
  };

  syncWatcher();

  let panelAttempts = 0;
  state.panelTimerId = window.setInterval(() => {
    panelAttempts += 1;
    if (injectPanelControl() || panelAttempts >= 120) {
      window.clearInterval(state.panelTimerId);
      state.panelTimerId = null;
    }
  }, 250);

  bot.addCleanup?.(() => {
    if (state.panelTimerId != null) window.clearInterval(state.panelTimerId);
    if (state.timerId != null) window.clearTimeout(state.timerId);
    for (const timerId of state.pendingReplyTimerIds) window.clearTimeout(timerId);
    state.pendingReplyTimerIds.clear();
    state.responderPending = false;
  });
};