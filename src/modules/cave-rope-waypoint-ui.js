(() => {
  const bundle = window.__minibiaBotBundle = window.__minibiaBotBundle || {};
  const originalInstallPanel = bundle.installPanel;
  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const rope2Action = "rope2";
  const rope3Action = "rope3";
  const rope2ButtonId = "minibia-bot-cave-add-rope2";
  const rope3ButtonId = "minibia-bot-cave-add-rope3";
  const rope3ConfigKey = "minibiaBot.cave.ropeWaypoint3.config";

  function normalizePresetName(value) { const normalized = String(value || "").trim().replace(/\s+/g, " "); return normalized || "Default"; }
  function botPlayerPosition() { const value = window.minibiaBot?.getPlayerPosition?.(); if (!value) return null; const x = Number(value.x), y = Number(value.y), z = Number(value.z); if (![x, y, z].every(Number.isFinite)) return null; return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }; }
  function getPanel() { return document.getElementById("minibia-bot-panel") || document.querySelector("#minibia-bot-panel, .minibia-bot-panel"); }
  function findAddWaypointButton(panel) { const byId = panel?.querySelector?.("#minibia-bot-cave-add"); if (byId) return byId; return Array.from(panel?.querySelectorAll?.("button") || []).find((button) => { const text = String(button.textContent || "").trim().toLowerCase(); return text === "add waypoint" || text === "add way point" || text.includes("add waypoint"); }) || null; }
  function setLastWaypointAction(action) { const bot = window.minibiaBot; const route = bot?.cave?.getRoute?.() || []; if (!route.length || !bot?.storage) return false; const name = normalizePresetName(bot.cave?.getActivePresetName?.()); const all = bot.storage.get(actionStorageKey, {}); const next = all && typeof all === "object" && !Array.isArray(all) ? all : {}; const actions = Array.isArray(next[name]) ? next[name].slice() : []; while (actions.length < route.length) actions.push("walk"); actions[route.length - 1] = action; next[name] = actions.slice(0, route.length); bot.storage.set(actionStorageKey, next); return true; }
  function addWaypointForAction(bot, action, logName) { const before = (bot?.cave?.getRoute?.() || []).length; if (!bot?.cave?.addCurrentPosition) return false; bot.cave.addCurrentPosition(); const route = bot.cave.getRoute?.() || []; if (route.length <= before) return false; if (!setLastWaypointAction(action)) return false; bot.log?.(`${logName} added`, { waypoint: route[route.length - 1] }); bot.ui?.refreshCaveStatus?.(); bot.ui?.refreshCaveClosestStatus?.(); return true; }

  function addRope2Button(panel) {
    const addButton = findAddWaypointButton(panel); if (!panel || !addButton || panel.querySelector(`#${rope2ButtonId}`)) return false;
    const button = document.createElement("button"); button.type = "button"; button.id = rope2ButtonId; button.textContent = "Add Rope Waypoint 2.0"; button.title = "Adds a waypoint at the current position. Rope Waypoint 2.0 uses only that exact X/Y coordinate.";
    button.addEventListener("click", () => addWaypointForAction(window.minibiaBot, rope2Action, "cave Rope Waypoint 2.0")); addButton.insertAdjacentElement("afterend", button); return true;
  }

  function getRope3HotbarSlot(bot) { const raw = bot?.storage?.get?.(rope3ConfigKey, {}); const slot = Math.trunc(Number(raw?.hotbarSlot)); return Number.isFinite(slot) && slot >= 1 && slot <= 12 ? slot : null; }
  function saveRope3HotbarSlot(bot, value) { const slot = Math.trunc(Number(value)); const normalized = Number.isFinite(slot) && slot >= 1 && slot <= 12 ? slot : null; bot.storage.set(rope3ConfigKey, { hotbarSlot: normalized }); return normalized; }

  function addRope3Button(panel) {
    const addButton = findAddWaypointButton(panel); if (!panel || !addButton || panel.querySelector(`#${rope3ButtonId}`)) return false;
    const button = document.createElement("button"); button.type = "button"; button.id = rope3ButtonId; button.textContent = "Add Rope Waypoint 3.0"; button.title = "Adds a waypoint at the current position. Rope 3.0 clicks the configured rope hotbar slot, waits 100 ms, then clicks the exact waypoint coordinates.";
    button.addEventListener("click", () => addWaypointForAction(window.minibiaBot, rope3Action, "cave Rope Waypoint 3.0")); addButton.insertAdjacentElement("afterend", button); return true;
  }

  function addRope3Settings(panel) {
    if (!panel || panel.querySelector("#minibia-bot-rope3-hotkey")) return false;
    const addButton = panel.querySelector(`#${rope3ButtonId}`) || findAddWaypointButton(panel); if (!addButton) return false;
    const wrapper = document.createElement("div"); wrapper.id = "minibia-bot-rope3-settings"; wrapper.className = "mb-field";
    wrapper.innerHTML = `<label class="mb-field"><span class="mb-field-label">Rope 3.0 Hotkey (Hotbar 1-12)</span><input type="number" id="minibia-bot-rope3-hotkey" min="1" max="12" step="1" placeholder="1" /></label><div class="mb-small-note">Rope 3.0 clicks this rope hotbar slot, waits exactly 100 ms, then clicks the exact rope-hole waypoint coordinates.</div>`;
    const input = wrapper.querySelector("#minibia-bot-rope3-hotkey"); const bot = window.minibiaBot; const saved = getRope3HotbarSlot(bot); if (saved) input.value = String(saved);
    input.addEventListener("change", () => { const value = saveRope3HotbarSlot(bot, input.value); input.value = value ? String(value) : ""; });
    addButton.insertAdjacentElement("afterend", wrapper); return true;
  }

  function addRope2ToActionSelects(panel) {
    panel?.querySelectorAll?.("select")?.forEach((select) => {
      const values = Array.from(select.options).map((option) => option.value); if (!values.includes("walk") || (!values.includes("rope") && !values.includes("shovel"))) return;
      if (!values.includes(rope2Action)) { const option = document.createElement("option"); option.value = rope2Action; option.textContent = "Rope Waypoint 2.0"; select.appendChild(option); }
      if (!Array.from(select.options).some((option) => option.value === rope3Action)) { const option = document.createElement("option"); option.value = rope3Action; option.textContent = "Rope Waypoint 3.0"; select.appendChild(option); }
    });
  }

  function injectRopeUi() { const panel = getPanel(); if (!panel) return false; const added2 = addRope2Button(panel); const added3 = addRope3Button(panel); addRope3Settings(panel); addRope2ToActionSelects(panel); return added2 || added3; }
  function installPanelWrapper() { if (typeof originalInstallPanel !== "function" || bundle.installPanel !== originalInstallPanel) return; bundle.installPanel = function installPanelWithRopeWaypoints(bot) { originalInstallPanel(bot); window.setTimeout(injectRopeUi, 0); }; }
  installPanelWrapper();

  let attempts = 0; const timerId = window.setInterval(() => { installPanelWrapper(); if (injectRopeUi() || ++attempts >= 240) window.clearInterval(timerId); }, 250);
  const observer = new MutationObserver(() => injectRopeUi()); try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {} window.setTimeout(() => { try { observer.disconnect(); } catch (_) {} }, 60000);

  const rope2Source = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/cave-rope-waypoint-2.js";
  if (!window.__minibiaRopeWaypoint2Loader) { window.__minibiaRopeWaypoint2Loader = true; const script = document.createElement("script"); script.src = `${rope2Source}?t=${Date.now()}`; script.async = true; script.onerror = () => console.error("[minibia-bot] Failed to load Rope Waypoint 2.0"); document.head.appendChild(script); }

  const rope3Source = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/cave-rope-waypoint-3.js";
  if (!window.__minibiaRopeWaypoint3Loader) { window.__minibiaRopeWaypoint3Loader = true; const script = document.createElement("script"); script.src = `${rope3Source}?t=${Date.now()}`; script.async = true; script.onerror = () => console.error("[minibia-bot] Failed to load Rope Waypoint 3.0"); document.head.appendChild(script); }
})();
