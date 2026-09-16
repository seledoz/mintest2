(() => {
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

  function findCurrentTile(bot) {
    const position = bot?.getPlayerPosition?.();
    if (!position) return null;
    const x = Math.trunc(Number(position.x));
    const y = Math.trunc(Number(position.y));
    const z = Math.trunc(Number(position.z));
    if (![x, y, z].every(Number.isFinite)) return null;

    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      if (!Array.isArray(chunk?.tiles)) continue;
      for (const tile of chunk.tiles) {
        const p = tile?.__position;
        if (!p) continue;
        if (Number(p.x) === x && Number(p.y) === y && Number(p.z) === z) return tile;
      }
    }
    return null;
  }

  function markLastWaypointAsRope(bot) {
    const route = bot?.cave?.getRoute?.() || [];
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

  function injectRopeWaypointButton(bot) {
    const panel = document.getElementById("minibia-bot-panel");
    const addButton = panel?.querySelector("#minibia-bot-cave-add");
    if (!panel || !addButton || panel.querySelector("#minibia-bot-cave-add-rope")) return !!panel;

    const ropeButton = document.createElement("button");
    ropeButton.type = "button";
    ropeButton.id = "minibia-bot-cave-add-rope";
    ropeButton.textContent = "Add Rope Waypoint";
    ropeButton.title = "Stand directly on the rope hole, then add this waypoint.";
    ropeButton.addEventListener("click", () => {
      const tile = findCurrentTile(bot);
      if (!tile || !isRopeHoleTile(tile)) {
        bot.log?.("cave rope waypoint not added: stand directly on a rope hole", {});
        window.alert("Stand directly on the rope hole before adding a Rope Waypoint.");
        return;
      }

      bot.cave?.addCurrentPosition?.();
      if (!markLastWaypointAsRope(bot)) return;
      bot.log?.("cave rope waypoint added", { waypoint: bot.getPlayerPosition?.() });
      bot.ui?.refreshCaveStatus?.();
      bot.ui?.refreshCaveClosestStatus?.();
    });

    addButton.insertAdjacentElement("afterend", ropeButton);
    return true;
  }

  // Expose a direct installer so main.js can use it after the panel exists.
  window.__minibiaInstallRopeWaypointButton = injectRopeWaypointButton;

  // main.js creates the panel after this source file is loaded. Poll briefly so
  // the button is installed after the real Cavebot panel is actually present.
  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    const bot = window.minibiaBot;
    if (bot && injectRopeWaypointButton(bot)) {
      window.clearInterval(timerId);
      bot.addCleanup?.(() => window.clearInterval(timerId));
      return;
    }
    if (attempts >= 80) window.clearInterval(timerId);
  }, 250);
})();
