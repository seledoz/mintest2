window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackPriorityModule = function installAutoAttackPriorityModule(bot) {
  if (!bot || bot.attackPriority?.destroy) return bot?.attackPriority;

  const configStorageKey = "minibiaBot.attackPriority.config";
  const state = { timerId: null, uiTimerId: null, lastSelectedTargetId: null };
  const config = Object.assign({ enabled: true, creatureNames: [], tickMs: 100 }, bot.storage.get(configStorageKey, {}) || {});
  config.enabled = config.enabled !== false;
  config.creatureNames = normalizeNameList(config.creatureNames);
  config.tickMs = Math.max(50, Math.trunc(Number(config.tickMs) || 100));

  function normalizeName(name) { return String(name || "").trim().toLowerCase(); }
  function normalizeDisplayName(name) { return String(name || "").trim(); }
  function normalizeNameList(names) {
    const source = Array.isArray(names) ? names : String(names || "").split(/[\n,]/);
    const seen = new Set();
    const result = [];
    source.forEach((name) => {
      const displayName = normalizeDisplayName(name);
      const normalized = normalizeName(displayName);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(displayName);
    });
    return result;
  }
  function persistConfig() { bot.storage.set(configStorageKey, { ...config, creatureNames: [...config.creatureNames] }); }
  function getCurrentTarget() { return window.gameClient?.player?.__target || null; }
  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) } : null;
  }
  function getTileDistance(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(Number(from.x) - Number(to.x)), Math.abs(Number(from.y) - Number(to.y)));
  }
  function getPriorityIndex(creatureOrName) {
    const name = typeof creatureOrName === "string" ? normalizeName(creatureOrName) : normalizeName(creatureOrName?.name || "");
    if (!name) return -1;
    return config.creatureNames.findIndex((item) => normalizeName(item) === name);
  }
  function getPreferredTarget() {
    if (!config.enabled || !config.creatureNames.length || !bot.attack?.status?.().running || !bot.attack?.config?.enabled) return null;
    const playerPosition = normalizePosition(bot.getPlayerPosition?.());
    const monsters = bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
    return monsters.map((monster) => ({
      monster,
      priority: getPriorityIndex(monster),
      distance: getTileDistance(playerPosition, normalizePosition(monster?.getPosition?.() || monster?.__position)),
    })).filter((entry) => entry.priority >= 0).sort((left, right) => left.priority - right.priority || left.distance - right.distance || Number(left.monster?.id || 0) - Number(right.monster?.id || 0))[0]?.monster || null;
  }
  function selectTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function" || typeof TargetPacket !== "function") return false;
    window.gameClient.player.setTarget(target);
    window.gameClient.send(new TargetPacket(target.id));
    state.lastSelectedTargetId = target.id;
    bot.log("selected priority creature", { id: target.id, name: target.name || "Mob", priority: getPriorityIndex(target) + 1 });
    return true;
  }
  function trySelectPriorityTarget() {
    if (!config.enabled || !bot.attack?.config?.enabled || !bot.attack?.status?.().running) return false;
    const preferredTarget = getPreferredTarget();
    if (!preferredTarget) return false;
    const currentTarget = getCurrentTarget();
    if (!currentTarget) return selectTarget(preferredTarget);
    if (Number(currentTarget.id) === Number(preferredTarget.id)) return false;
    const preferredPriority = getPriorityIndex(preferredTarget);
    const currentPriority = getPriorityIndex(currentTarget);
    if (preferredPriority < 0) return false;
    if (currentPriority >= 0 && preferredPriority >= currentPriority) return false;
    return selectTarget(preferredTarget);
  }

  function stopTimer() {
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
  }
  function shouldRun() { return !!config.enabled && !!bot.attack?.config?.enabled && !!bot.attack?.status?.().running; }
  function syncTimer() {
    if (!shouldRun()) { stopTimer(); return; }
    if (state.timerId == null) state.timerId = window.setInterval(trySelectPriorityTarget, config.tickMs);
  }

  function addName(name) {
    const displayName = normalizeDisplayName(name), normalized = normalizeName(displayName);
    if (!normalized || config.creatureNames.some((item) => normalizeName(item) === normalized)) return false;
    config.creatureNames.push(displayName); persistConfig(); refreshUiValues(); syncTimer(); return true;
  }
  function removeName(name) {
    const normalized = normalizeName(name), before = config.creatureNames.length;
    config.creatureNames = config.creatureNames.filter((item) => normalizeName(item) !== normalized);
    const removed = config.creatureNames.length !== before;
    if (removed) persistConfig(); refreshUiValues(); syncTimer(); return removed;
  }
  function moveName(name, direction) {
    const normalized = normalizeName(name);
    const index = config.creatureNames.findIndex((item) => normalizeName(item) === normalized);
    if (index < 0) return false;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= config.creatureNames.length) return false;
    const nextList = [...config.creatureNames];
    [nextList[index], nextList[nextIndex]] = [nextList[nextIndex], nextList[index]];
    config.creatureNames = nextList; persistConfig(); refreshUiValues(); return true;
  }
  function setNames(names) { config.creatureNames = normalizeNameList(names); persistConfig(); refreshUiValues(); syncTimer(); return [...config.creatureNames]; }
  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) config.enabled = nextConfig.enabled !== false;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "creatureNames")) config.creatureNames = normalizeNameList(nextConfig.creatureNames);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "tickMs")) config.tickMs = Math.max(50, Math.trunc(Number(nextConfig.tickMs) || config.tickMs || 100));
    persistConfig(); refreshUiValues(); syncTimer();
    return { ...config, creatureNames: [...config.creatureNames] };
  }

  function findSideColumnMount(panel) { return panel.querySelector(".mb-side-column") || panel.querySelector(".mb-main-column") || panel.querySelector(".mb-body") || panel; }
  function makeButton(text, title, disabled, handler) {
    const button = document.createElement("button"); button.type = "button"; button.className = "mb-small-button"; button.textContent = text; button.title = title; button.disabled = disabled; button.addEventListener("click", handler); return button;
  }
  function ensureUi() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    if (!panel) return false;
    const existing = document.getElementById("minibia-bot-auto-attack-priority-section");
    const mount = findSideColumnMount(panel);
    if (existing) { if (existing.parentElement !== mount) mount.appendChild(existing); return true; }
    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-auto-attack-priority-section";
    section.innerHTML = `<div class="mb-label">Creature Priority</div><div class="mb-stack"><label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-priority-enabled" /><span>Use creature priority list</span></label><div class="mb-inline"><input type="text" id="minibia-bot-auto-attack-priority-input" placeholder="Creature name" /><button type="button" class="mb-small-button" id="minibia-bot-auto-attack-priority-add">Add</button></div><div class="mb-list" id="minibia-bot-auto-attack-priority-list"></div><div class="mb-small-note">Top creature is targeted first. Unlisted creatures use normal targeting.</div></div>`;
    mount.appendChild(section);
    const enabledInput = section.querySelector("#minibia-bot-auto-attack-priority-enabled");
    const nameInput = section.querySelector("#minibia-bot-auto-attack-priority-input");
    section.querySelector("#minibia-bot-auto-attack-priority-add")?.addEventListener("click", () => { if (addName(nameInput?.value)) nameInput.value = ""; });
    nameInput?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); if (addName(nameInput.value)) nameInput.value = ""; } });
    enabledInput?.addEventListener("change", () => updateConfig({ enabled: enabledInput.checked }));
    refreshUiValues();
    return true;
  }
  function refreshUiValues() {
    const enabledInput = document.getElementById("minibia-bot-auto-attack-priority-enabled");
    const list = document.getElementById("minibia-bot-auto-attack-priority-list");
    if (enabledInput) enabledInput.checked = !!config.enabled;
    if (!list) return;
    list.innerHTML = "";
    if (!config.creatureNames.length) { const empty = document.createElement("div"); empty.className = "mb-small-note"; empty.textContent = "No priority creatures."; list.appendChild(empty); return; }
    config.creatureNames.forEach((name, index) => {
      const row = document.createElement("div"); row.className = "mb-list-row";
      const label = document.createElement("span"); label.textContent = `${index + 1}. ${name}`;
      const controls = document.createElement("div"); controls.className = "mb-inline";
      controls.appendChild(makeButton("↑", `Move ${name} up`, index === 0, () => moveName(name, "up")));
      controls.appendChild(makeButton("↓", `Move ${name} down`, index === config.creatureNames.length - 1, () => moveName(name, "down")));
      controls.appendChild(makeButton("Delete", `Delete ${name}`, false, () => removeName(name)));
      row.appendChild(label); row.appendChild(controls); list.appendChild(row);
    });
  }

  function status() {
    const preferred = shouldRun() ? getPreferredTarget() : null;
    return { config: { ...config, creatureNames: [...config.creatureNames] }, preferredTarget: preferred ? { id: preferred.id, name: preferred.name } : null, lastSelectedTargetId: state.lastSelectedTargetId };
  }
  function destroy() {
    stopTimer();
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
    document.getElementById("minibia-bot-auto-attack-priority-section")?.remove();
  }

  if (bot.attack && !bot.attack.__priorityTimerSyncWrapped) {
    const originalStart = bot.attack.start?.bind(bot.attack);
    const originalStop = bot.attack.stop?.bind(bot.attack);
    if (originalStart) bot.attack.start = (...args) => { const result = originalStart(...args); syncTimer(); return result; };
    if (originalStop) bot.attack.stop = (...args) => { const result = originalStop(...args); stopTimer(); return result; };
    bot.attack.__priorityTimerSyncWrapped = true;
  }

  bot.attackPriority = { status, updateConfig, addName, removeName, moveName, setNames, getPriorityIndex, getPreferredTarget, trySelectPriorityTarget, destroy, config };
  bot.addCleanup(destroy);
  if (!ensureUi()) {
    let attempts = 0;
    state.uiTimerId = window.setInterval(() => {
      attempts += 1;
      if (ensureUi() || attempts >= 40) { window.clearInterval(state.uiTimerId); state.uiTimerId = null; }
    }, 250);
  }
  syncTimer();
  return bot.attackPriority;
};
