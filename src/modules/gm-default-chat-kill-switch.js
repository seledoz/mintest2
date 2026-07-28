window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installGmDefaultChatKillSwitch = function installGmDefaultChatKillSwitch(bot) {
  const state = {
    running: false,
    timerId: null,
    seenEntryKeys: new Set(),
    panelTimerId: null,
  };

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

  function refreshPanelToggle() {
    const toggle = document.getElementById("minibia-bot-gm-kill-switch-enabled");
    if (toggle) toggle.checked = state.running;
  }

  function stopAutomationForGmChat(speaker, message) {
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
    refreshPanelToggle();
    bot.log("GM Default chat kill switch watcher started");
    return true;
  }

  function stop() {
    if (!state.running && state.timerId == null) {
      refreshPanelToggle();
      return false;
    }
    state.running = false;
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    refreshPanelToggle();
    bot.log("GM Default chat kill switch watcher stopped");
    return true;
  }

  function injectPanelControl() {
    if (document.getElementById("minibia-bot-gm-kill-switch-enabled")) {
      refreshPanelToggle();
      return true;
    }

    const panel = document.getElementById("minibia-bot-panel");
    if (!panel) return false;

    const quickControlsLabel = Array.from(panel.querySelectorAll(".mb-label")).find(
      (label) => String(label.textContent || "").trim().toLowerCase() === "quick controls"
    );
    const stack = quickControlsLabel?.closest?.(".mb-section")?.querySelector?.(".mb-stack");
    if (!stack) return false;

    const label = document.createElement("label");
    label.className = "mb-toggle";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.id = "minibia-bot-gm-kill-switch-enabled";
    toggle.checked = state.running;

    const text = document.createElement("span");
    text.textContent = "Enable GM Kill Switch";

    toggle.addEventListener("change", () => {
      if (toggle.checked) start();
      else stop();
      toggle.checked = state.running;
    });

    label.append(toggle, text);
    stack.appendChild(label);
    return true;
  }

  bot.gmDefaultChatKillSwitch = {
    start,
    stop,
    status: () => ({ running: state.running }),
    injectPanelControl,
  };

  start();

  let panelAttempts = 0;
  state.panelTimerId = window.setInterval(() => {
    panelAttempts += 1;
    if (injectPanelControl() || panelAttempts >= 80) {
      window.clearInterval(state.panelTimerId);
      state.panelTimerId = null;
    }
  }, 100);

  bot.addCleanup?.(() => {
    if (state.panelTimerId != null) window.clearInterval(state.panelTimerId);
  });
};