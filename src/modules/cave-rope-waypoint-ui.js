(() => {
  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const ropeAction = "rope";

  function normalizePresetName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || "Default";
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
    ropeButton.title = "Add a rope waypoint at your current position.";
    ropeButton.addEventListener("click", () => {
      // A Rope Waypoint is a waypoint action, not a hole-detection tool.
      // Add the player's current position first, then mark that waypoint as rope.
      const beforeLength = (bot?.cave?.getRoute?.() || []).length;
      bot.cave?.addCurrentPosition?.();
      const afterRoute = bot?.cave?.getRoute?.() || [];

      if (afterRoute.length <= beforeLength) {
        bot.log?.("cave rope waypoint not added: current position could not be added", {});
        return;
      }

      if (!markLastWaypointAsRope(bot)) return;
      bot.log?.("cave rope waypoint added", { waypoint: bot.getPlayerPosition?.() });
      bot.ui?.refreshCaveStatus?.();
      bot.ui?.refreshCaveClosestStatus?.();
    });

    addButton.insertAdjacentElement("afterend", ropeButton);
    return true;
  }

  window.__minibiaInstallRopeWaypointButton = injectRopeWaypointButton;

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
