window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPlayerUhModule = function installPlayerUhModule(bot) {
  if (!bot || bot.playerUh) return bot?.playerUh || null;

  const configStorageKey = "minibiaBot.playerUh.config";
  const sectionId = "minibia-bot-player-uh-section";
  const state = { running: false, timerId: null, targetTimerId: null, lastAttemptAt: 0, lastUseAt: 0, uiObserver: null };
  const config = Object.assign({
    enabled: false,
    playerName: "",
    hpPercent: 50,
    hotbarSlot: 1,
    scanMs: 100,
    retryMs: 250,
    cooldownMs: 2040,
    targetDelayMs: 100,
  }, bot.storage.get(configStorageKey, {}) || {});

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function normalizeName(value) { return String(value || "").trim().toLowerCase(); }
  function normalizeSlot(value) { const slot = Math.trunc(Number(value)); return Number.isFinite(slot) && slot >= 1 && slot <= 12 ? slot : null; }
  function normalizePercent(value) { return Math.max(1, Math.min(100, Math.trunc(Number(value) || 1))); }

  config.playerName = String(config.playerName || "").trim();
  config.hpPercent = normalizePercent(config.hpPercent);
  config.hotbarSlot = normalizeSlot(config.hotbarSlot) || 1;
  config.scanMs = Math.max(75, Math.trunc(Number(config.scanMs) || 100));
  config.retryMs = Math.max(100, Math.trunc(Number(config.retryMs) || 250));
  config.cooldownMs = Math.max(0, Math.trunc(Number(config.cooldownMs) || 2040));
  config.targetDelayMs = 100;
  config.enabled = !!config.enabled;

  function readHealthPercent(player) {
    const percent = [player?.healthPercent, player?.hpPercent, player?.healthpercentage, player?.state?.healthPercent]
      .find((value) => Number.isFinite(Number(value)));
    if (percent != null) return Math.max(0, Math.min(100, Number(percent)));

    const current = [player?.health, player?.hp, player?.currentHealth, player?.state?.health]
      .find((value) => Number.isFinite(Number(value)));
    const max = [player?.maxHealth, player?.maxHp, player?.maximumHealth, player?.state?.maxHealth]
      .find((value) => Number.isFinite(Number(value)));
    if (current == null || max == null || Number(max) <= 0) return null;
    return Math.max(0, Math.min(100, (Number(current) / Number(max)) * 100));
  }

  function findTarget() {
    const wantedName = normalizeName(config.playerName);
    if (!wantedName) return null;
    return (bot.xray?.getVisiblePlayers?.({ sameFloorOnly: true }) || [])
      .find((player) => normalizeName(player?.name) === wantedName) || null;
  }

  function useRuneOnPlayer(player) {
    if (!player) return false;
    const mouse = window.gameClient?.mouse;
    const targetRef = { which: player, index: 0xFF };
    try {
      if (typeof mouse?.__handleItemUseWith === "function") {
        mouse.__handleItemUseWith(null, targetRef);
        return true;
      }
    } catch (_) {}
    try {
      if (typeof mouse?.__handleThingUse === "function") {
        mouse.__handleThingUse(targetRef);
        return true;
      }
    } catch (_) {}
    try {
      if (typeof mouse?.__handleCreatureClick === "function") {
        mouse.__handleCreatureClick(player);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function finishPendingTarget() {
    state.targetTimerId = null;
    if (!state.running || !config.enabled) return false;

    const refreshedTarget = findTarget();
    const refreshedPercent = readHealthPercent(refreshedTarget);
    if (!refreshedTarget || refreshedPercent == null || refreshedPercent > config.hpPercent) {
      bot.log?.("UH player target invalid after hotkey delay", { playerName: config.playerName, slot: config.hotbarSlot, delayMs: config.targetDelayMs });
      return false;
    }

    const used = useRuneOnPlayer(refreshedTarget);
    if (used) {
      state.lastUseAt = Date.now();
      bot.log?.("used UH rune on player", { player: refreshedTarget.name, hpPercent: Math.round(refreshedPercent), slot: config.hotbarSlot, targetDelayMs: config.targetDelayMs });
    } else {
      bot.log?.("UH player target click failed", { player: refreshedTarget.name, slot: config.hotbarSlot });
    }
    return used;
  }

  function tryHeal(now = Date.now()) {
    if (!state.running || !config.enabled || state.targetTimerId != null) return false;
    const slot = normalizeSlot(config.hotbarSlot);
    if (!slot || now - state.lastUseAt < config.cooldownMs || now - state.lastAttemptAt < config.retryMs) return false;

    const target = findTarget();
    const hpPercent = readHealthPercent(target);
    if (!target || hpPercent == null || hpPercent > config.hpPercent) return false;

    state.lastAttemptAt = now;
    if (!bot.clickHotbar?.(slot - 1)) return false;

    state.targetTimerId = window.setTimeout(finishPendingTarget, config.targetDelayMs);
    bot.logDebug?.("UH player hotkey clicked; waiting to target player", { player: target.name, hpPercent: Math.round(hpPercent), slot, delayMs: config.targetDelayMs });
    return true;
  }

  function tick() {
    if (!state.running || !config.enabled) return;
    try { tryHeal(); }
    catch (error) { bot.log?.("UH player tick failed", error?.message || error); }
    finally {
      if (state.running && config.enabled) state.timerId = window.setTimeout(tick, config.scanMs);
    }
  }

  function syncUi() {
    const toggle = document.getElementById("minibia-bot-player-uh-enabled");
    const name = document.getElementById("minibia-bot-player-uh-name");
    const percent = document.getElementById("minibia-bot-player-uh-percent");
    const hotkey = document.getElementById("minibia-bot-player-uh-hotkey");
    if (toggle) toggle.checked = state.running;
    if (name && document.activeElement !== name) name.value = config.playerName;
    if (percent && document.activeElement !== percent) percent.value = String(config.hpPercent);
    if (hotkey && document.activeElement !== hotkey) hotkey.value = String(config.hotbarSlot);
  }

  function installUi() {
    if (document.getElementById(sectionId)) { syncUi(); return true; }
    const autoHealSection = document.getElementById("minibia-bot-auto-heal-enabled")?.closest?.(".mb-section");
    if (!autoHealSection?.parentElement) return false;

    const section = document.createElement("div");
    section.id = sectionId;
    section.className = "mb-section";
    section.innerHTML = `
      <div class="mb-label">UH Player</div>
      <div class="mb-stack">
        <label class="mb-field"><span class="mb-field-label">Player Name</span><input type="text" id="minibia-bot-player-uh-name" placeholder="Exact player name" /></label>
        <label class="mb-field"><span class="mb-field-label">Heal at HP %</span><input type="number" id="minibia-bot-player-uh-percent" min="1" max="100" /></label>
        <label class="mb-field"><span class="mb-field-label">UH Hotkey</span><input type="number" id="minibia-bot-player-uh-hotkey" min="1" max="12" /></label>
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-player-uh-enabled" /><span>Enable UH Player</span></label>
        <div class="mb-small-note">Exact-name, visible, same-floor players only. Waits 100 ms after the UH hotkey before targeting the player.</div>
      </div>`;
    autoHealSection.insertAdjacentElement("afterend", section);

    const nameInput = section.querySelector("#minibia-bot-player-uh-name");
    const percentInput = section.querySelector("#minibia-bot-player-uh-percent");
    const hotkeyInput = section.querySelector("#minibia-bot-player-uh-hotkey");
    const toggle = section.querySelector("#minibia-bot-player-uh-enabled");
    nameInput?.addEventListener("change", () => updateConfig({ playerName: nameInput.value }));
    percentInput?.addEventListener("change", () => updateConfig({ hpPercent: percentInput.value }));
    hotkeyInput?.addEventListener("change", () => updateConfig({ hotbarSlot: hotkeyInput.value }));
    toggle?.addEventListener("change", () => toggle.checked ? start() : stop());
    syncUi();
    return true;
  }

  function stopUiObserver() { state.uiObserver?.disconnect(); state.uiObserver = null; }
  function ensureUi() {
    if (installUi()) { stopUiObserver(); return true; }
    if (state.uiObserver) return false;
    state.uiObserver = new MutationObserver(() => { if (installUi()) stopUiObserver(); });
    state.uiObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
    return false;
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "playerName")) nextConfig.playerName = String(nextConfig.playerName || "").trim();
    if (Object.prototype.hasOwnProperty.call(nextConfig, "hpPercent")) nextConfig.hpPercent = normalizePercent(nextConfig.hpPercent);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "hotbarSlot")) nextConfig.hotbarSlot = normalizeSlot(nextConfig.hotbarSlot) || config.hotbarSlot;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) nextConfig.enabled = !!nextConfig.enabled;
    Object.assign(config, nextConfig, { targetDelayMs: 100 });
    persistConfig();
    syncUi();
    return { ...config };
  }

  function start(overrides = {}) {
    updateConfig({ ...overrides, enabled: true });
    if (state.running) return false;
    state.running = true;
    ensureUi();
    tick();
    syncUi();
    bot.log?.("UH player started", { ...config });
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (state.targetTimerId != null) { window.clearTimeout(state.targetTimerId); state.targetTimerId = null; }
    stopUiObserver();
    if (options.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    syncUi();
    bot.log?.("UH player stopped");
    return true;
  }

  function status() {
    const target = findTarget();
    return {
      running: state.running,
      config: { ...config },
      target: target ? { name: target.name, hpPercent: readHealthPercent(target), position: target.__position || null } : null,
      lastAttemptAt: state.lastAttemptAt,
      lastUseAt: state.lastUseAt,
      targetPending: state.targetTimerId != null,
    };
  }

  bot.playerUh = { start, stop, status, updateConfig, tryHeal, findTarget, readHealthPercent, config };
  ensureUi();
  if (config.enabled) start();
  bot.addCleanup?.(() => stop({ persistEnabled: false }));
  return bot.playerUh;
};

if (window.minibiaBot) {
  window.__minibiaBotBundle.installPlayerUhModule(window.minibiaBot);
}
