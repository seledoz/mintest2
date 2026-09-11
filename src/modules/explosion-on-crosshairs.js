window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installExplosionOnCrosshairsModule = function installExplosionOnCrosshairsModule(bot) {
  if (!bot || bot.explosionOnCrosshairs?.destroy) return bot?.explosionOnCrosshairs;
  const configStorageKey = "minibiaBot.explosionOnCrosshairs.config";
  const sectionId = "minibia-bot-explosion-crosshairs-section";
  const state = { running: false, timerId: null, uiTimerId: null, uiStartupTimerId: null, lastCastAt: 0, lastMonsterCount: 0, lastTargetName: "", lastTargetPosition: null, currentBest: null };
  const config = Object.assign({ enabled: false, highestPriority: false, hotbarSlot: null, minMonsters: 1, cooldownMs: 2000, scanMs: 250, maxRange: 7, respectTargetFilters: true }, bot.storage.get(configStorageKey, {}) || {});
  const slot = (v) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null; };
  const pos = (v) => { const r = v?.getPosition?.() || v?.__position || v?.position || v; if (!r) return null; const x = Number(r.x), y = Number(r.y), z = Number(r.z); return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) } : null; };
  const dist = (a, b) => !a || !b || a.z !== b.z ? Infinity : Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const key = (p) => p ? `${p.x},${p.y},${p.z}` : "";
  const norm = (v) => String(v || "").trim().toLowerCase();
  const positive = (v, f) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? n : f; };
  const nonnegative = (v, f) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n >= 0 ? n : f; };
  const persist = () => bot.storage.set(configStorageKey, { ...config });
  config.enabled = !!config.enabled;
  config.highestPriority = !!config.highestPriority;
  config.hotbarSlot = slot(config.hotbarSlot);
  config.minMonsters = positive(config.minMonsters, 1);
  config.cooldownMs = nonnegative(config.cooldownMs, 2000);
  config.scanMs = Math.max(250, positive(config.scanMs, 250));
  config.maxRange = Math.min(7, positive(config.maxRange, 7));
  config.respectTargetFilters = config.respectTargetFilters !== false;

  function filters(monster) {
    if (!config.respectTargetFilters) return true;
    const c = bot.attack?.config || {};
    const mode = ["include", "exclude"].includes(c.targetFilterMode) ? c.targetFilterMode : "all";
    const name = norm(monster?.name || "Mob");
    const inc = new Set((c.includedCreatureNames || []).map(norm));
    const exc = new Set((c.excludedCreatureNames || []).map(norm));
    if (exc.has(name)) return false;
    return mode !== "include" || !inc.size || inc.has(name);
  }
  function monsters() { return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []).filter(filters); }
  function tiles(center) {
    if (!center) return [];
    return [
      { x: center.x, y: center.y - 1, z: center.z },
      { x: center.x - 1, y: center.y, z: center.z },
      { x: center.x, y: center.y, z: center.z },
      { x: center.x + 1, y: center.y, z: center.z },
      { x: center.x, y: center.y + 1, z: center.z }
    ];
  }
  function tileAt(p) {
    try {
      const wp = typeof Position === "function" ? new Position(p.x, p.y, p.z) : p;
      return window.gameClient?.world?.getTileFromWorldPosition?.(wp) || null;
    } catch (_) { return null; }
  }
  function evaluate(center, list) {
    const keys = new Set(tiles(center).map(key));
    const hit = list.filter(m => { const p = pos(m); return p && p.z === center.z && keys.has(key(p)); });
    return { position: center, count: hit.length, monsters: hit, target: hit[0] || null };
  }
  function bestCandidate() {
    const player = pos(bot.getPlayerPosition?.());
    if (!player) return null;
    const list = monsters().filter(m => { const p = pos(m); return p && p.z === player.z && dist(player, p) <= config.maxRange; });
    if (!list.length) return null;
    const candidates = new Map();
    list.forEach(m => {
      const p = pos(m);
      if (!p) return;
      tiles({ x: 0, y: 0, z: p.z }).forEach(o => {
        const c = { x: p.x - o.x, y: p.y - o.y, z: p.z };
        if (dist(player, c) <= config.maxRange && tileAt(c)) candidates.set(key(c), c);
      });
    });
    const evals = [...candidates.values()].map(c => ({ ...evaluate(c, list), occupiedByMonster: list.some(m => key(pos(m)) === key(c)) }));
    evals.sort((a, b) => b.count - a.count || Number(b.occupiedByMonster) - Number(a.occupiedByMonster) || dist(player, a.position) - dist(player, b.position));
    return evals[0] || null;
  }
  function reservePriority() {
    if (!state.running || !config.enabled || !config.highestPriority || !slot(config.hotbarSlot)) return false;
    const b = state.currentBest || bestCandidate();
    return !!b && b.count >= config.minMonsters;
  }
  function blockedSlots() {
    const s = new Set();
    [bot.attack?.config?.runeHotbarSlot, bot.attackAoe?.config?.spellHotbarSlot, bot.greatFireballV2?.config?.hotbarSlot, bot.fireball?.config?.hotbarSlot].forEach(v => { const n = slot(v); if (n) s.add(n); });
    try { const c = JSON.parse(window.localStorage.getItem("minibiaBot.attackAoe.square2.config") || "{}"); const n = slot(c.hotbarSlot); if (n) s.add(n); } catch (_) {}
    return s;
  }
  function patchPriority() {
    if (!bot.clickHotbar || bot.__explosionCrosshairsPriorityPatched) return;
    const original = bot.clickHotbar.bind(bot);
    bot.clickHotbar = (index, ...args) => {
      const attempted = Math.trunc(Number(index)) + 1;
      const own = slot(config.hotbarSlot);
      if (reservePriority() && attempted !== own && blockedSlots().has(attempted)) return false;
      return original(index, ...args);
    };
    bot.__explosionCrosshairsPriorityPatched = true;
  }

  // Explosion must use the actual on-screen mouse path. Do not modify Fireball;
  // this is a self-contained copy of the screen-click sequence it relies on.
  function getGameCanvas() {
    return Array.from(document.querySelectorAll("canvas"))
      .map(canvas => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 200 && rect.height >= 150)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height))[0] || null;
  }
  function dispatchScreenClick(canvas, clientX, clientY) {
    const common = { bubbles: true, cancelable: true, composed: true, clientX, clientY, screenX: clientX, screenY: clientY, button: 0, buttons: 1, detail: 1, view: window };
    try {
      if (typeof PointerEvent === "function") {
        canvas.dispatchEvent(new PointerEvent("pointermove", { ...common, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        canvas.dispatchEvent(new PointerEvent("pointerdown", { ...common, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        canvas.dispatchEvent(new PointerEvent("pointerup", { ...common, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }
      canvas.dispatchEvent(new MouseEvent("mousemove", common));
      canvas.dispatchEvent(new MouseEvent("mousedown", common));
      canvas.dispatchEvent(new MouseEvent("mouseup", { ...common, buttons: 0 }));
      canvas.dispatchEvent(new MouseEvent("click", { ...common, buttons: 0 }));
      return true;
    } catch (_) { return false; }
  }
  function clickTarget(best) {
    const player = pos(bot.getPlayerPosition?.());
    const target = pos(best?.position);
    const canvasInfo = getGameCanvas();
    if (!player || !target || !canvasInfo || target.z !== player.z) return false;
    const { canvas, rect } = canvasInfo;
    const tileWidth = rect.width / 17;
    const tileHeight = rect.height / 13;
    const clientX = rect.left + ((target.x - player.x + 8.5) * tileWidth);
    const clientY = rect.top + ((target.y - player.y + 6.5) * tileHeight);
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
    return dispatchScreenClick(canvas, clientX, clientY);
  }
  function fire(best) {
    const s = slot(config.hotbarSlot);
    if (!s || !best?.position || !bot.clickHotbar(s - 1)) return false;
    // Give the client a short moment to enter crosshair mode, then perform the
    // real screen click on the calculated explosion center.
    const clicked = clickTarget(best);
    if (!clicked) {
      bot.log("Explosion on Crosshairs could not click crosshair target", { position: best.position, target: best.target?.name || "Mob" });
      return false;
    }
    return true;
  }
  function canCast(now = Date.now(), b = state.currentBest) {
    return state.running && config.enabled && !!slot(config.hotbarSlot) && now - state.lastCastAt >= config.cooldownMs && !!b && b.count >= config.minMonsters;
  }
  function trigger(now = Date.now()) {
    if (!state.running || !config.enabled) return false;
    const b = state.currentBest || bestCandidate();
    state.currentBest = b;
    if (!canCast(now, b)) return false;
    const fired = fire(b);
    if (fired) {
      state.lastCastAt = now;
      state.lastMonsterCount = b.count;
      state.lastTargetName = b.target?.name || "Mob";
      state.lastTargetPosition = b.position;
      bot.log("used Explosion on Crosshairs", { slot: config.hotbarSlot, monsterCount: b.count, target: state.lastTargetName, position: b.position, minimum: config.minMonsters, shape: "1-3-1", maxDistance: config.maxRange });
    }
    refreshUi();
    return fired;
  }
  function tick() {
    if (!state.running || !config.enabled) return;
    try { state.currentBest = bestCandidate(); trigger(); } catch (e) { bot.log("explosion on crosshairs tick failed", e?.message || e); }
    if (state.running && config.enabled) state.timerId = window.setTimeout(tick, config.scanMs);
  }
  function stopUi() { if (state.uiTimerId != null) window.clearInterval(state.uiTimerId); state.uiTimerId = null; }
  function startUi() { if (state.uiTimerId == null && state.running && config.enabled) state.uiTimerId = window.setInterval(refreshUi, 1000); }
  function stopStartup() { if (state.uiStartupTimerId != null) window.clearInterval(state.uiStartupTimerId); state.uiStartupTimerId = null; }
  function ensureUiStartup() {
    if (document.getElementById(sectionId)) return true;
    ensureUi();
    if (document.getElementById(sectionId)) return true;
    if (state.uiStartupTimerId != null) return false;
    let tries = 0;
    state.uiStartupTimerId = window.setInterval(() => { tries++; ensureUi(); if (document.getElementById(sectionId) || tries >= 40) stopStartup(); }, 250);
    return false;
  }
  function start(overrides = {}) {
    updateConfig({ ...overrides, enabled: true }, { silent: true });
    if (state.running) { startUi(); return false; }
    state.running = true;
    state.currentBest = null;
    ensureUiStartup();
    tick();
    startUi();
    refreshUi();
    return true;
  }
  function stop(options = {}) {
    state.running = false;
    state.currentBest = null;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    stopUi();
    stopStartup();
    if (options.persistEnabled !== false) { config.enabled = false; persist(); }
    refreshUi();
    return true;
  }
  function updateConfig(next = {}, options = {}) {
    if ("enabled" in next) next.enabled = !!next.enabled;
    if ("highestPriority" in next) next.highestPriority = !!next.highestPriority;
    if ("hotbarSlot" in next) next.hotbarSlot = slot(next.hotbarSlot);
    if ("minMonsters" in next) next.minMonsters = positive(next.minMonsters, config.minMonsters);
    if ("cooldownMs" in next) next.cooldownMs = nonnegative(next.cooldownMs, config.cooldownMs);
    if ("scanMs" in next) next.scanMs = Math.max(250, positive(next.scanMs, config.scanMs));
    if ("maxRange" in next) next.maxRange = Math.min(7, positive(next.maxRange, config.maxRange));
    if ("respectTargetFilters" in next) next.respectTargetFilters = next.respectTargetFilters !== false;
    Object.assign(config, next);
    persist();
    if (!config.enabled) { state.currentBest = null; stopUi(); }
    else if (state.running) startUi();
    if (!options.silent) refreshUi();
    return { ...config };
  }
  function status() {
    const b = state.running && config.enabled ? (state.currentBest || bestCandidate()) : null;
    return { running: state.running, config: { ...config }, bestMonsterCount: b?.count || 0, bestTargetName: b?.target?.name || "", bestTargetPosition: b?.position || null, lastMonsterCount: state.lastMonsterCount, lastTargetName: state.lastTargetName, lastTargetPosition: state.lastTargetPosition, priorityReserved: reservePriority(), ready: canCast(Date.now(), b) };
  }
  function ensureUi() {
    if (document.getElementById(sectionId)) { refreshUi(); return true; }
    const anchor = document.getElementById("minibia-bot-fireball-section") || document.getElementById("minibia-bot-gfb-v2-section") || document.getElementById("minibia-bot-auto-attack-aoe-section");
    if (!anchor) return false;
    const section = document.createElement("div");
    section.id = sectionId;
    section.className = "mb-section";
    section.innerHTML = `<div class="mb-label">Explosion on Crosshairs</div><label class="mb-toggle"><input type="checkbox" id="minibia-bot-explosion-crosshairs-enabled" /><span>Enable Explosion on Crosshairs</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-explosion-crosshairs-highest-priority" /><span>Explosion Highest Priority</span></label><div class="mb-field-grid"><label class="mb-field"><span class="mb-field-label">Explosion Hotkey</span><input type="number" id="minibia-bot-explosion-crosshairs-hotkey" min="1" max="12" /></label><label class="mb-field"><span class="mb-field-label">Minimum Creatures</span><input type="number" id="minibia-bot-explosion-crosshairs-monsters" min="1" /></label><label class="mb-field"><span class="mb-field-label">Cooldown MS</span><input type="number" id="minibia-bot-explosion-crosshairs-cooldown" min="0" /></label><label class="mb-field"><span class="mb-field-label">Max Distance (squares)</span><input type="number" id="minibia-bot-explosion-crosshairs-range" min="1" max="7" /></label></div><div class="mb-small-note">Uses the 1 / 3 / 1 plus-shaped Explosion pattern. Set the hotkey to Use with Crosshairs.</div><div class="mb-small-note">Max Distance is the distance from your character to the explosion center: 1 = adjacent, 2 = up to two squares away, etc.</div><div class="mb-small-note" id="minibia-bot-explosion-crosshairs-status">Explosion: off</div>`;
    anchor.insertAdjacentElement("afterend", section);
    const q = id => section.querySelector(id), e = q("#minibia-bot-explosion-crosshairs-enabled"), p = q("#minibia-bot-explosion-crosshairs-highest-priority"), h = q("#minibia-bot-explosion-crosshairs-hotkey"), m = q("#minibia-bot-explosion-crosshairs-monsters"), c = q("#minibia-bot-explosion-crosshairs-cooldown"), r = q("#minibia-bot-explosion-crosshairs-range");
    e.checked = !!config.enabled; p.checked = !!config.highestPriority; h.value = config.hotbarSlot || ""; m.value = config.minMonsters; c.value = config.cooldownMs; r.value = config.maxRange;
    e.addEventListener("change", () => e.checked ? start() : stop());
    p.addEventListener("change", () => updateConfig({ highestPriority: p.checked }));
    h.addEventListener("change", () => updateConfig({ hotbarSlot: h.value }));
    m.addEventListener("change", () => updateConfig({ minMonsters: m.value }));
    c.addEventListener("change", () => updateConfig({ cooldownMs: c.value }));
    r.addEventListener("change", () => updateConfig({ maxRange: r.value }));
    refreshUi();
    return true;
  }
  function refreshUi() {
    const s = document.getElementById(sectionId);
    if (!s) return;
    const q = id => s.querySelector(id), e = q("#minibia-bot-explosion-crosshairs-enabled"), p = q("#minibia-bot-explosion-crosshairs-highest-priority"), h = q("#minibia-bot-explosion-crosshairs-hotkey"), m = q("#minibia-bot-explosion-crosshairs-monsters"), c = q("#minibia-bot-explosion-crosshairs-cooldown"), r = q("#minibia-bot-explosion-crosshairs-range"), st = q("#minibia-bot-explosion-crosshairs-status");
    if (e) e.checked = !!config.enabled; if (p) p.checked = !!config.highestPriority; if (h && document.activeElement !== h) h.value = config.hotbarSlot || ""; if (m && document.activeElement !== m) m.value = config.minMonsters; if (c && document.activeElement !== c) c.value = config.cooldownMs; if (r && document.activeElement !== r) r.value = config.maxRange;
    if (st) { const b = state.currentBest; st.textContent = config.enabled ? `Explosion: ${state.running ? "running" : "ready"} | best group ${b?.count || 0} | range ${config.maxRange}` : "Explosion: off"; }
  }
  patchPriority();
  bot.explosionOnCrosshairs = { start, stop, updateConfig, status, ensureUi, refreshUi, getExplosionTiles: tiles, destroy: () => stop() };
  ensureUiStartup();
  if (config.enabled) start();
  return bot.explosionOnCrosshairs;
};

if (window.minibiaBot && window.__minibiaBotBundle.installExplosionOnCrosshairsModule) window.__minibiaBotBundle.installExplosionOnCrosshairsModule(window.minibiaBot);

if (!window.minibiaBot?.explosionOnCrosshairs) {
  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    const bot = window.minibiaBot;
    const installer = window.__minibiaBotBundle?.installExplosionOnCrosshairsModule;
    if (bot && installer && !bot.explosionOnCrosshairs) {
      installer(bot);
      if (bot.explosionOnCrosshairs) window.clearInterval(timerId);
    }
    if (attempts >= 40 || bot?.explosionOnCrosshairs) window.clearInterval(timerId);
  }, 250);
}