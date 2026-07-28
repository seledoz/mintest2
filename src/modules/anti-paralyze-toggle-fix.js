(() => {
  let lastRopeFallbackAt = 0;

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function getThingDefinition(itemId) {
    if (!itemId) return null;
    return window.gameClient?.itemDefinitionsByCid?.[itemId] ||
      window.gameClient?.itemDefinitionsBySid?.[itemId] ||
      window.gameClient?.itemDefinitions?.[itemId] ||
      null;
  }

  function getThingName(thing) {
    const definition = getThingDefinition(thing?.id);
    return String(definition?.properties?.name || thing?.name || "").trim().toLowerCase();
  }

  function findRopeSource() {
    const isRope = (item) => /\brope\b/i.test(getThingName(item));
    const equipment = window.gameClient?.player?.equipment;
    if (equipment?.slots) {
      for (let index = 0; index < equipment.slots.length; index += 1) {
        const item = equipment.getSlotItem?.(index);
        if (isRope(item)) return { which: equipment, index };
      }
    }

    const containers = Array.from(window.gameClient?.player?.__openedContainers || []);
    for (const container of containers) {
      const slots = container?.slots || [];
      for (let index = 0; index < slots.length; index += 1) {
        const item = container.getSlotItem?.(index);
        if (isRope(item)) return { which: container, index };
      }
    }
    return null;
  }

  function installLearnedRopeFallback(bot) {
    if (!bot?.cave || bot.cave.__learnedRopeFallbackInstalled) return !!bot?.cave;
    bot.cave.__learnedRopeFallbackInstalled = true;

    const timerId = window.setInterval(() => {
      const status = bot.cave?.status?.();
      const player = normalizePosition(bot.getPlayerPosition?.());
      const waypoint = normalizePosition(status?.currentWaypoint);
      if (!status?.running || !player || !waypoint || waypoint.z >= player.z) return;
      if (Date.now() - lastRopeFallbackAt < 1200) return;

      const transitions = Array.isArray(status.transitions) ? status.transitions : [];
      const transition = transitions
        .filter((entry) => Number(entry?.from?.z) === player.z && Number(entry?.to?.z) === waypoint.z)
        .sort((left, right) => {
          const leftDistance = Math.abs(Number(left.from.x) - player.x) + Math.abs(Number(left.from.y) - player.y);
          const rightDistance = Math.abs(Number(right.from.x) - player.x) + Math.abs(Number(right.from.y) - player.y);
          return leftDistance - rightDistance;
        })[0];
      const source = normalizePosition(transition?.from);
      if (!source) return;

      const dx = Math.abs(source.x - player.x);
      const dy = Math.abs(source.y - player.y);
      if (dx > 1 || dy > 1) {
        try {
          window.gameClient?.world?.pathfinder?.findPath?.(
            new Position(player.x, player.y, player.z),
            new Position(source.x, source.y, source.z)
          );
        } catch (_) {}
        return;
      }

      const tile = window.gameClient?.world?.getTileFromWorldPosition?.(
        new Position(source.x, source.y, source.z)
      );
      const rope = findRopeSource();
      if (!tile || !rope) return;

      window.gameClient?.mouse?.__handleItemUseWith?.(
        { which: rope.which, index: rope.index },
        { which: tile, index: 0xFF }
      );
      lastRopeFallbackAt = Date.now();
      bot.log?.("cave used learned rope transition fallback", { source, waypoint });
    }, 250);

    bot.addCleanup?.(() => window.clearInterval(timerId));
    return true;
  }

  function installCaveWaypointCompatibility(bot) {
    if (!bot?.cave) return false;

    if (typeof bot.cave.addCurrentPosition !== "function" && typeof bot.cave.addWaypointCurrentSpot === "function") {
      bot.cave.addCurrentPosition = (...args) => bot.cave.addWaypointCurrentSpot(...args);
    }

    if (typeof bot.cave.clearRoute !== "function" && typeof bot.cave.clearWaypoints === "function") {
      bot.cave.clearRoute = (...args) => bot.cave.clearWaypoints(...args);
    }

    installLearnedRopeFallback(bot);
    return typeof bot.cave.addCurrentPosition === "function";
  }

  function install() {
    const bot = window.minibiaBot;
    installCaveWaypointCompatibility(bot);

    const toggle = document.getElementById("minibia-bot-anti-paralyze-enabled");
    const spellInput = document.getElementById("minibia-bot-anti-paralyze-spell");
    if (!bot?.antiParalyze || !toggle || !spellInput) return false;
    if (toggle.dataset.antiParalyzeToggleFix === "true") return true;

    toggle.dataset.antiParalyzeToggleFix = "true";

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const shouldEnable = !bot.antiParalyze.status().running;
      const spellWords = String(spellInput.value || "").trim();

      if (shouldEnable) {
        bot.antiParalyze.start({ spellWords });
      } else {
        bot.antiParalyze.stop();
      }

      toggle.checked = !!bot.antiParalyze.status().running;
    }, true);

    return true;
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 80) window.clearInterval(timerId);
  }, 100);
})();