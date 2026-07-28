window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installGmDefaultChatKillSwitch = function installGmDefaultChatKillSwitch(bot) {
  const configStorageKey = "minibiaBot.gmKillSwitch.config";
  const config = Object.assign(
    {
      responderEnabled: false,
      responderMessage: "",
      responderDelayMs: 2000,
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    running: false,
    timerId: null,
    seenEntryKeys: new Set(),
    panelTimerId: null,
    pendingReplyTimerIds: new Set(),
  };

  function persistConfig() {
    config.responderEnabled = !!config.responderEnabled;
    config.responderMessage = String(config.responderMessage || "").trim();
    config.responderDelayMs = 2000;
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function getDefaultChannels() {
    return (window.gameClient?.interface?.channelManager?.channels || []).filter(
      (channel) => normalizeName(channel?.name) === "default"
    );
  }

  function getEntryMessage(entry) {
    return String(entry?.message ?? entry?.text ?? entry?.content ?? "");
  }

  function getEntrySpeaker(entry, message) {
    const directSpeaker =
      entry?.speakerName ??
      entry?.speaker ??
      entry?.name ??
      entry?.author ??
      entry?.senderName ??
      entry?.sender;

    if (typeof directSpeaker === "string" && directSpeaker.trim()) {
      return directSpeaker.trim();
    }

    const saysMatch = message.match(/^(.+?)\s+says:\s*/i);
    return saysMatch?.[1]?.trim() || null;
  }

  function getEntryKey(channel, entry, index) {
    const message = getEntryMessage(entry);
    const time = entry?.__time ?? entry?.time ?? entry?.timestamp ?? "no-time";
    const speaker = getEntrySpeaker(entry, message) || "no-speaker";
    return `${channel?.name || "Default"}|${time}|${speaker}|${message}|${index}`;
  }

  function getCurrentEntries() {
    return getDefaultChannels().flatMap((channel) =>
      (channel?.__contents || []).map((entry, index) => ({
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

  function refreshPanelControls() {
    const killToggle = document.getElementById("minibia-bot-gm-kill-switch-enabled");
    const responderToggle = document.getElementById("minibia-bot-gm-responder-enabled");
    const responderMessage = document.getElementById("minibia-bot-gm-responder-message");

    if (killToggle) killToggle.checked = state.running;
    if (responderToggle) responderToggle.checked = !!config.responderEnabled;
    if (responderMessage && responderMessage !== document.activeElement) {
      responderMessage.value = config.responderMessage;
    }
  }

  function scheduleResponder(speaker, message) {
    const reply = String(config.responderMessage || "").trim();
    if (!config.responderEnabled || !reply) return false;

    const timerId = window.setTimeout(() => {
      state.pendingReplyTimerIds.delete(timerId);
      const sent = bot.sendChat?.(reply);
      bot.log(sent ? "GM responder sent reply" : "GM responder failed to send reply", {
        speaker,
        message,
        reply,
        delayMs: 2000,
      });
    }, 2000);

    state.pendingReplyTimerIds.add(timerId);
    bot.log("GM responder scheduled reply", { speaker, reply, delayMs: 2000 });
    return true;
  }

  function stopAutomationForGmChat(speaker, message) {
    scheduleResponder(speaker, message);
    bot.playAlarm?.();
    bot.log("game master kill switch triggered from Default chat", {
      players: [speaker],
      speaker,
      message,
      source: "default-chat",
    });

    bot.rune?.stop?.();
    bot.eat?.stop?.();
    bot.invisible?.stop?.();
    bot.magicShield?.stop?.();
    bot.cave?.stop?.();
    bot.attack?.stop?.();
    bot.equipRing?.stop?.();

    if (bot.panic?.config) {
      bot.panic.config.unknownPlayerEnabled = false;
      bot.panic.config.healthLossEnabled = false;
      bot.panic.updateConfig?.({
        unknownPlayerEnabled: false,
        healthLossEnabled: false,
      });
      bot.panic.stop?.();
    }

    bot.ui?.refreshPanicStatus?.();
    bot.ui?.refreshRuneStatus?.();
    bot.ui?.refreshAutoEatStatus?.();
    bot.ui?.refreshAutoInvisibleStatus?.();
    bot.ui?.refreshAutoMagicShieldStatus?.();
    bot.ui?.refreshAutoAttackStatus?.();
    bot.ui?.refreshCaveStatus?.();
    bot.ui?.refreshEquipRingStatus?.();

    stop();
    return true;
  }

  function tick() {
    if (!state.running) return;

    const gmNames = new Set((bot.panic?.getGameMasterNames?.() || []).map(normalizeName));

    for (const item of getCurrentEntries()) {
      const key = getEntryKey(item.channel, item.entry, item.index);
      if (state.seenEntryKeys.has(key)) continue;
      state.seenEntryKeys.add(key);

      const speaker = getEntrySpeaker(item.entry, item.message);
      if (!speaker || !gmNames.has(normalizeName(speaker))) continue;

      stopAutomationForGmChat(speaker, item.message);
      return;
    }

    state.timerId = window.setTimeout(tick, Number(bot.panic?.config?.tickMs) || 200);
  }

  function start() {
    if (state.running) return false;
    state.running = true;
    rememberExistingEntries();
    tick();
    refreshPanelControls();
    bot.log("GM Default chat kill switch watcher started");
    return true;
  }

  function stop() {
    if (!state.running && state.timerId == null) {
      refreshPanelControls();
      return false;
    }
    state.running = false;
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    refreshPanelControls();
    bot.log("GM Default chat kill switch watcher stopped");
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
    refreshPanelControls();
    return { ...config };
  }

  function injectPanelControl() {
    const githubSection = document.getElementById("minibia-bot-github-waypoints-section");
    const panel = document.getElementById("minibia-bot-panel");
    if (!panel || !githubSection) return false;

    let section = document.getElementById("minibia-bot-gm-kill-switch-section");
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
          <div class="mb-small-note">Responder delay: 2 seconds</div>
        </div>
      `;
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
    status: () => ({ running: state.running, config: { ...config } }),
    updateResponderConfig,
    injectPanelControl,
  };

  start();

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
    for (const timerId of state.pendingReplyTimerIds) window.clearTimeout(timerId);
    state.pendingReplyTimerIds.clear();
  });
};
