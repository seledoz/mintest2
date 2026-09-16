(() => {
  const bundle = window.__minibiaBotBundle = window.__minibiaBotBundle || {};
  const originalInstallPanel = bundle.installPanel;
  if (typeof originalInstallPanel !== "function") return;

  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const ropeAction = "rope";

  function normalizePresetName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || "Default";
  }

  function getThingDefinition(itemId) {
    if (!itemId) return null;
    return (
      window.gameClient?.itemDefinitionsByCid?.[itemId] ||
      window.gameClient?.itemDefinitionsBySid?.[itemId] ||
      window.gameClient?.itemDefinitions?.[itemId] ||
      null
    );
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

  function findCurrentTile() {
    const position = botPlayerPosition();
    if (!position) return null;
    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      if (!Array.isArray(chunk?.tiles)) continue;
      for (const tile of chunk.tiles) {
        const p = tile?.__position;
        if (!p) continue;
        if (Number(p.x) === position.x && Number(p.y) === position.y && Number(p.z) === position.z) return tile;
      }
    }
    return null;
  }

  function botPlayerPosition() {
    const value = bot?.getPlayerPosition?.();
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function markLastWaypointAsRope() {
    const route = bot.cave?.getRoute?.() || [];
    if (!route.length) return false;
    const presetName = normalizePresetName(bot.cave?.getActivePresetName?.());
    const allActions = bot.storage.get(actionStorageKey, {});
    const next = allActions && typeof allActions === "object" && !Array.isArray(allActions) ? allActions : {};
    const actions = Array.isArray(next[presetName]) ? next[presetName].slice() : [];
    while (actions.length < route.length) actions.push("walk");
    actions[route.length - 1] = ropeAction;
    next[presetName] = actions.slice(0, route.length);
    bot.storage.set(actionStorageKey, next);
    return true;
  }

  bundle.installPanel = function installPanelWithRopeWaypoint(bot) {
    originalInstallPanel(bot);

    const originalInject = bot.ui?.inject;
    if (typeof originalInject !== "function") return;

    bot.ui.inject = function injectPanelWithRopeWaypoint(...args) {
      const result = originalInject.apply(this, args);
      const panel = document.getElementById("minibia-bot-panel");
      const addButton = panel?.querySelector("#minibia-bot-cave-add");
      if (!panel || !addButton || panel.querySelector("#minibia-bot-cave-add-rope")) return result;

      const ropeButton = document.createElement("button");
      ropeButton.type = "button";
      ropeButton.id = "minibia-bot-cave-add-rope";
      ropeButton.textContent = "Add Rope Waypoint";
      ropeButton.title = "Stand directly on the rope hole, then add this waypoint.";
      ropeButton.addEventListener("click", () => {
        const tile = findCurrentTile();
        if (!tile || !isRopeHoleTile(tile)) {
          bot.log?.("cave rope waypoint not added: stand directly on a rope hole", {});
          window.alert("Stand directly on the rope hole before adding a Rope Waypoint.");
          return;
        }

        bot.cave?.addCurrentPosition?.();
        markLastWaypointAsRope();
        bot.log?.("cave rope waypoint added", { waypoint: botPlayerPosition() });
        bot.ui?.refreshCaveStatus?.();
        bot.ui?.refreshCaveClosestStatus?.();
      });

      addButton.insertAdjacentElement("afterend", ropeButton);
      return result;
    };

    bot.addCleanup?.(() => {
      bot.ui.inject = originalInject;
      document.getElementById("minibia-bot-cave-add-rope")?.remove();
    });
  };

  // Load the new Rope Waypoint 2.0 as a separate module so the saved normal
  // Rope Waypoint UI/behavior remains isolated from the new exact-coordinate action.
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
