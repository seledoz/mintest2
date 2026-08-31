window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installEmergencyManaRingModule = function installEmergencyManaRingModule(bot) {
  if (!bot || bot.emergencyManaRing) return bot?.emergencyManaRing || null;

  const configStorageKey = "minibiaBot.emergencyManaRing.config";
  const RING_SLOT = 8;
  const scanIntervalMs = 100;
  const manaRingName = "mana ring";

  const state = {
    running: false,
    timerId: null,
    uiTimerId: null,
    lowHpLatched: false,
    equipRingWasRunning: false,
    equipRingSuppressed: false,
    lastEquipAt: 0,
    lastHp: null,
    lastStatus: "Status: off",
  };

  const config = Object.assign(
    {
      enabled: false,
      hpThreshold: 250,
    },
    bot.storage.get(configStorageKey, {}) || {}
  );
  config.hpThreshold = Math.max(0, Math.trunc(Number(config.hpThreshold) || 0));

  function persistConfig() {
    bot.storage.set(configStorageKey, {
      enabled: !!config.enabled,
      hpThreshold: config.hpThreshold,
    });
  }

  function normalizeName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getPlayerHp() {
    const snapshot = bot.getPlayerSnapshot?.();
    const hp = Number(snapshot?.health);
    return Number.isFinite(hp) ? hp : null;
  }

  function getEquipment() {
    return window.gameClient?.player?.equipment || null;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDefinition(item) {
    if (!item) return null;
    const cid = item.cid ?? item.id;
    const sid = item.sid ?? item.id;
    return (
      window.gameClient?.itemDefinitionsByCid?.[cid] ||
      window.gameClient?.itemDefinitionsBySid?.[sid] ||
      window.gameClient?.itemDefinitions?.[item.id] ||
      window.gameClient?.itemDefinitions?.[cid] ||
      window.gameClient?.itemDefinitions?.[sid] ||
      null
    );
  }

  function getItemName(item) {
    const definition = getItemDefinition(item);
    return definition?.properties?.name || item?.name || "";
  }

  function isManaRing(item) {
    const name = normalizeName(getItemName(item));
    return name === manaRingName || name.includes(manaRingName);
  }

  function getEquippedItem() {
    return getEquipment()?.getSlotItem?.(RING_SLOT) || null;
  }

  function isManaRingEquipped() {
    return isManaRing(getEquippedItem());
  }

  function findManaRingSource() {
    for (const container of getOpenContainers()) {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const item = container.getSlotItem?.(slotIndex);
        if (!isManaRing(item)) continue;
        const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
        return { container, slotIndex, item, count, name: getItemName(item) };
      }
    }
    return null;
  }

  function getEquipRingModule() {
    return bot.equipRing || bot.ring || null;
  }

  function suppressNormalEquipRing() {
    if (state.equipRingSuppressed) return;
    const ringModule = getEquipRingModule();
    const running = !!ringModule?.status?.().running;
    state.equipRingWasRunning = running;
    if (running) ringModule.stop?.({ persistEnabled: false });
    state.equipRingSuppressed = true;
    bot.log?.("emergency mana ring took priority over equip ring", { equipRingWasRunning: running });
  }

  function releaseNormalEquipRing() {
    if (!state.equipRingSuppressed) return;
    const shouldResume = state.equipRingWasRunning;
    state.equipRingSuppressed = false;
    state.equipRingWasRunning = false;
    if (shouldResume) getEquipRingModule()?.start?.();
    bot.log?.("emergency mana ring released equip ring priority", { resumed: shouldResume });
  }

  function equipManaRing() {
    const equipment = getEquipment();
    const source = findManaRingSource();
    if (!equipment || !source) return false;

    const from = { which: source.container, index: source.slotIndex };
    const to = { which: equipment, index: RING_SLOT };
    window.gameClient.send(new ItemMovePacket(from, to, source.count || 1));
    state.lastEquipAt = Date.now();
    state.lowHpLatched = true;
    bot.log?.("emergency mana ring equipped", {
      hp: state.lastHp,
      hpThreshold: config.hpThreshold,
      name: source.name,
      fromContainerId: source.container?.__containerId ?? null,
      fromSlot: source.slotIndex,
    });
    return true;
  }

  function updateStatus() {
    const label = document.getElementById("minibia-bot-emergency-mana-ring-status");
    if (!label) return;
    if (!config.enabled) state.lastStatus = "Status: off";
    else if (state.lastHp == null) state.lastStatus = "Status: waiting for HP data";
    else if (state.lastHp > config.hpThreshold) state.lastStatus = `Status: armed — HP ${state.lastHp}/${config.hpThreshold}`;
    else if (state.lowHpLatched) state.lastStatus = `Status: triggered — HP ${state.lastHp}/${config.hpThreshold}`;
    else if (!findManaRingSource() && !isManaRingEquipped()) state.lastStatus = `Status: low HP — Mana Ring not found`;
    else state.lastStatus = `Status: low HP — equipping Mana Ring`;
    label.textContent = state.lastStatus;
  }

  function check() {
    if (!config.enabled) return false;
    const hp = getPlayerHp();
    state.lastHp = hp;
    if (hp == null || hp <= 0) {
      updateStatus();
      return false;
    }

    if (hp > config.hpThreshold) {
      state.lowHpLatched = false;
      releaseNormalEquipRing();
      updateStatus();
      return false;
    }

    suppressNormalEquipRing();

    if (state.lowHpLatched) {
      updateStatus();
      return false;
    }

    if (isManaRingEquipped()) {
      state.lowHpLatched = true;
      updateStatus();
      return true;
    }

    const equipped = equipManaRing();
    updateStatus();
    return equipped;
  }

  function tick() {
    if (!state.running || !config.enabled) return;
    try {
      check();
    } catch (error) {
      bot.log?.("emergency mana ring tick failed", error?.message || error);
    } finally {
      if (state.running && config.enabled) state.timerId = window.setTimeout(tick, scanIntervalMs);
    }
  }

  function syncUi() {
    const toggle = document.getElementById("minibia-bot-emergency-mana-ring-enabled");
    const threshold = document.getElementById("minibia-bot-emergency-mana-ring-hp");
    if (toggle) toggle.checked = !!config.enabled;
    if (threshold && document.activeElement !== threshold) threshold.value = String(config.hpThreshold);
    updateStatus();
  }

  function start() {
    config.enabled = true;
    persistConfig();
    syncUi();
    if (state.running) return false;
    state.running = true;
    state.lowHpLatched = false;
    bot.log?.("emergency mana ring started", { hpThreshold: config.hpThreshold });
    tick();
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    releaseNormalEquipRing();
    state.lowHpLatched = false;
    state.lastHp = getPlayerHp();
    config.enabled = false;
    if (options.persistEnabled !== false) persistConfig();
    syncUi();
    bot.log?.("emergency mana ring stopped");
    return true;
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "hpThreshold")) {
      nextConfig.hpThreshold = Math.max(0, Math.trunc(Number(nextConfig.hpThreshold) || 0));
    }
    Object.assign(config, nextConfig);
    persistConfig();
    if (config.enabled) check();
    syncUi();
    return { ...config };
  }

  function injectPanelSection() {
    const existing = document.getElementById("minibia-bot-emergency-mana-ring-section");
    if (existing) {
      syncUi();
      return true;
    }

    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const targetColumn = panel?.querySelector?.(".mb-cave-column") || panel?.querySelector?.(".mb-main-column") || panel?.querySelector?.(".mb-body") || panel;
    if (!targetColumn) return false;

    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-emergency-mana-ring-section";
    section.innerHTML = `
      <div class="mb-label">Emergency Mana Ring</div>
      <div class="mb-stack">
        <label class="mb-field">
          <span class="mb-field-label">Equip at HP or below</span>
          <input type="number" id="minibia-bot-emergency-mana-ring-hp" min="0" step="1" />
        </label>
        <label class="mb-toggle">
          <input type="checkbox" id="minibia-bot-emergency-mana-ring-enabled" />
          <span>Enable Emergency Mana Ring</span>
        </label>
        <div class="mb-small-note">Higher priority than Equip Ring. Equips a Mana Ring directly over the current ring and leaves it equipped until you remove it.</div>
        <div class="mb-small-note" id="minibia-bot-emergency-mana-ring-status">Status: off</div>
      </div>`;
    targetColumn.appendChild(section);

    const toggle = section.querySelector("#minibia-bot-emergency-mana-ring-enabled");
    const threshold = section.querySelector("#minibia-bot-emergency-mana-ring-hp");
    toggle.checked = !!config.enabled;
    threshold.value = String(config.hpThreshold);

    toggle.addEventListener("change", () => {
      if (toggle.checked) start();
      else stop();
    });
    threshold.addEventListener("change", () => updateConfig({ hpThreshold: threshold.value }));

    syncUi();
    return true;
  }

  function watchForPanel() {
    if (injectPanelSection()) return;
    let attempts = 0;
    state.uiTimerId = window.setInterval(() => {
      attempts += 1;
      if (injectPanelSection() || attempts >= 40) {
        window.clearInterval(state.uiTimerId);
        state.uiTimerId = null;
      }
    }, 250);
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      hp: state.lastHp,
      lowHpLatched: state.lowHpLatched,
      manaRingEquipped: isManaRingEquipped(),
      manaRingAvailable: !!findManaRingSource(),
      equipRingSuppressed: state.equipRingSuppressed,
      lastEquipAt: state.lastEquipAt,
      scanIntervalMs,
    };
  }

  bot.emergencyManaRing = {
    start,
    stop,
    status,
    updateConfig,
    check,
    equipManaRing,
    findManaRingSource,
    isManaRingEquipped,
    config,
  };

  bot.addCleanup?.(() => {
    if (state.timerId != null) window.clearTimeout(state.timerId);
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    releaseNormalEquipRing();
    state.running = false;
  });

  watchForPanel();
  if (config.enabled) start();
  return bot.emergencyManaRing;
};

if (window.minibiaBot) {
  window.__minibiaBotBundle.installEmergencyManaRingModule(window.minibiaBot);
}
