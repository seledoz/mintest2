(() => {
  const bundle = window.__minibiaBotBundle = window.__minibiaBotBundle || {};
  const originalInstallPanel = bundle.installPanel;
  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const rope2Action = "rope2";
  const rope2ButtonId = "minibia-bot-cave-add-rope2";

  function normalizePresetName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || "Default";
  }

  function botPlayerPosition() {
    const value = window.minibiaBot?.getPlayerPosition?.();
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (![x, y, z].every(Number.isFinite)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function getPanel() {
    return document.getElementById("minibia-bot-panel") || document.querySelector("#minibia-bot-panel, .minibia-bot-panel");
  }

  function findAddWaypointButton(panel) {
    const byId = panel?.querySelector?.("#minibia-bot-cave-add");
    if (byId) return byId;
    return Array.from(panel?.querySelectorAll?.("button") || []).find((button) => {
      const text = String(button.textContent || "").trim().toLowerCase();
      return text === "add waypoint" || text === "add way point" || text.includes("add waypoint");
    }) || null;
  }

  function setLastWaypointAction(action) {
    const bot = window.minibiaBot;
    const route = bot?.cave?.getRoute?.() || [];
    if (!route.length || !bot?.storage) return false;
    const name = normalizePresetName(bot.cave?.getActivePresetName?.());
    const all = bot.storage.get(actionStorageKey, {});
    const next = all && typeof all === "object" && !Array.isArray(all) ? all : {};
    const actions = Array.isArray(next[name]) ? next[name].slice() : [];
    while (actions.length < route.length) actions.push("walk");
    actions[route.length - 1] = action;
    next[name] = actions.slice(0, route.length);
    bot.storage.set(actionStorageKey, next);
    return true;
  }

  function addRope2Button(panel) {
    const addButton = findAddWaypointButton(panel);
    if (!panel || !addButton || panel.querySelector(`#${rope2ButtonId}`)) return false;
    const button = document.createElement("button");
    button.type = "button";
    button.id = rope2ButtonId;
    button.textContent = "Add Rope Waypoint 2.0";
    button.title = "Adds a waypoint at the current position. Rope Waypoint 2.0 uses only that exact X/Y coordinate.";
    button.addEventListener("click", () => {
      const bot = window.minibiaBot;
      const before = (bot?.cave?.getRoute?.() || []).length;
      if (!bot?.cave?.addCurrentPosition) return;
      bot.cave.addCurrentPosition();
      const route = bot.cave.getRoute?.() || [];
      if (route.length <= before) return;
      if (!setLastWaypointAction(rope2Action)) return;
      bot.log?.("cave Rope Waypoint 2.0 added", { waypoint: route[route.length - 1] });
      bot.ui?.refreshCaveStatus?.();
      bot.ui?.refreshCaveClosestStatus?.();
    });
    addButton.insertAdjacentElement("afterend", button);
    return true;
  }

  function addRope2ToActionSelects(panel) {
    panel?.querySelectorAll?.("select")?.forEach((select) => {
      const values = Array.from(select.options).map((option) => option.value);
      if (!values.includes("walk") || (!values.includes("rope") && !values.includes("shovel"))) return;
      if (values.includes(rope2Action)) return;
      const option = document.createElement("option");
      option.value = rope2Action;
      option.textContent = "Rope Waypoint 2.0";
      select.appendChild(option);
    });
  }

  function injectRope2Ui() {
    const panel = getPanel();
    if (!panel) return false;
    const added = addRope2Button(panel);
    addRope2ToActionSelects(panel);
    return added;
  }

  function installPanelWrapper() {
    if (typeof originalInstallPanel !== "function" || bundle.installPanel !== originalInstallPanel) return;
    bundle.installPanel = function installPanelWithRopeWaypoint2(bot) {
      originalInstallPanel(bot);
      window.setTimeout(injectRope2Ui, 0);
    };
  }

  installPanelWrapper();

  // Do not depend on the CaveBot panel lifecycle. The panel can be created/rebuilt
  // after main.js runs, so keep looking for the real Add Waypoint control.
  let attempts = 0;
  const timerId = window.setInterval(() => {
    installPanelWrapper();
    if (injectRope2Ui() || ++attempts >= 240) window.clearInterval(timerId);
  }, 250);

  const observer = new MutationObserver(() => injectRope2Ui());
  try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch (_) {}
  window.setTimeout(() => { try { observer.disconnect(); } catch (_) {} }, 60000);

  const rope2Source = "https://raw.githubusercontent.com/seledoz/mintest2/main/src/modules/cave-rope-waypoint-2.js";
  if (!window.__minibiaRopeWaypoint2Loader) {
    window.__minibiaRopeWaypoint2Loader = true;
    const script = document.createElement("script");
    script.src = `${rope2Source}?t=${Date.now()}`;
    script.async = true;
    script.onerror = () => console.error("[minibia-bot] Failed to load Rope Waypoint 2.0");
    document.head.appendChild(script);
  }
})();
