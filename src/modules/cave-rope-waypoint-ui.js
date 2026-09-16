(() => {
  const bundle = window.__minibiaBotBundle = window.__minibiaBotBundle || {};
  const originalInstallPanel = bundle.installPanel;
  if (typeof originalInstallPanel !== "function") return;

  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const ropeAction = "rope";
  const rope2Action = "rope2";
  const rope2ButtonId = "minibia-bot-cave-add-rope2";

  function normalizePresetName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || "Default";
  }

  function getThingDefinition(itemId) {
    if (!itemId) return null;
    return window.gameClient?.itemDefinitionsByCid?.[itemId] || window.gameClient?.itemDefinitionsBySid?.[itemId] || window.gameClient?.itemDefinitions?.[itemId] || null;
  }

  function getThingName(thing) {
    const definition = getThingDefinition(thing?.id);
    return String(definition?.properties?.name || thing?.name || "").trim().toLowerCase();
  }

  function getTileThings(tile) {
    if (!tile) return [];
    const things = [];
    if (tile.id) things.push(tile);
    if (Array.isArray(tile.items)) tile.items.forEach((item) => item && things.push(item));
    return things;
  }

  function isRopeHoleTile(tile) {
    return getTileThings(tile).some((thing) => {
      const name = getThingName(thing);
      return name.includes("hole") || name.includes("rope spot");
    });
  }

  function botPlayerPosition() {
    const value = bot?.getPlayerPosition?.();
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function findCurrentTile() {
    const position = botPlayerPosition();
    if (!position) return null;
    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      if (!Array.isArray(chunk?.tiles)) continue;
      for (const tile of chunk.tiles) {
        const p = tile?.__position;
        if (p && Number(p.x) === position.x && Number(p.y) === position.y && Number(p.z) === position.z) return tile;
      }
    }
    return null;
  }

  function setLastWaypointAction(action) {
    const route = bot.cave?.getRoute?.() || [];
    if (!route.length) return false;
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
    const addButton = panel?.querySelector("#minibia-bot-cave-add");
    if (!panel || !addButton || panel.querySelector(`#${rope2ButtonId}`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = rope2ButtonId;
    button.textContent = "Add Rope Waypoint 2.0";
    button.title = "Add a waypoint at the current position. Rope Waypoint 2.0 uses only that exact X/Y coordinate.";
    button.addEventListener("click", () => {
      const position = botPlayerPosition();
      if (!position) return;
      bot.cave?.addCurrentPosition?.();
      if (!setLastWaypointAction(rope2Action)) return;
      bot.log?.("cave Rope Waypoint 2.0 added", { waypoint: position });
      bot.ui?.refreshCaveStatus?.();
      bot.ui?.refreshCaveClosestStatus?.();
    });
    addButton.insertAdjacentElement("afterend", button);
  }

  function addRope2ToActionSelects(panel) {
    panel.querySelectorAll("select").forEach((select) => {
      const values = Array.from(select.options).map((option) => option.value);
      if (!values.includes("walk") || (!values.includes("rope") && !values.includes("shovel"))) return;
      if (!values.includes(rope2Action)) {
        const option = document.createElement("option");
        option.value = rope2Action;
        option.textContent = "Rope Waypoint 2.0";
        select.appendChild(option);
      }
    });
  }

  function injectRope2Ui() {
    const panel = document.getElementById("minibia-bot-panel");
    if (!panel) return;
    addRope2Button(panel);
    addRope2ToActionSelects(panel);
  }

  bundle.installPanel = function installPanelWithRopeWaypoint(botInstance) {
    bot = botInstance;
    originalInstallPanel(botInstance);
    injectRope2Ui();
    const timerId = window.setInterval(injectRope2Ui, 500);
    const originalInject = botInstance.ui?.inject;
    if (typeof originalInject === "function") {
      botInstance.ui.inject = function injectPanelWithRopeWaypoint(...args) {
        const result = originalInject.apply(this, args);
        window.setTimeout(injectRope2Ui, 0);
        return result;
      };
    }
    botInstance.addCleanup?.(() => {
      window.clearInterval(timerId);
      if (typeof originalInject === "function") botInstance.ui.inject = originalInject;
      document.getElementById(rope2ButtonId)?.remove();
    });
  };

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
