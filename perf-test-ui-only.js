(() => {
  const panelId = "minibia-bot-perf-test-panel";

  if (window.minibiaBot?.destroy) {
    try { window.minibiaBot.destroy(); } catch (error) {
      console.warn("[PERF TEST] Previous cleanup failed", error);
    }
  }
  document.getElementById("minibia-bot-panel")?.remove();
  document.getElementById(panelId)?.remove();

  const timers = [];
  const foodIds = new Set([2666,2667,2668,2669,2670,2671,2672,2673,2674,2675,2676,2677,2678,2679,2680,2681,2682,2683,2684,2685,2686,2687,2688,2689,2690,2691,2695,2696]);
  const runeIds = new Set([2260,2261,2262,2263,2264,2265,2266,2267,2268,2269,2270,2271,2272,2273,2274,2275,2276,2277,2278,2279,2280,2281,2282,2283,2284,2285,2286,2287,2288,2289,2290,2291,2292,2293,2294,2295,2296,2297,2298,2299,2300,2301,2302,2303,2304,2305,2306,2307,2308,2309,2310,2311,2312,2313,2314,2315,2316]);

  const result = {
    foodContainers: 0,
    foodItems: 0,
    autoEatDecision: "none",
    paralyzed: false,
    antiParalyzeDecision: "none",
    invisibleDecision: "none",
    magicShieldDecision: "none",
    runeContainers: 0,
    runeItems: 0,
    blankRunes: 0,
    runeDecision: "none",
    visiblePlayers: 0,
    playerAlertDecision: "none",
    gfbCreatures: 0,
    gfbTilesChecked: 0,
    gfbBestHits: 0,
    gfbDecision: "none",
  };

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };

  function getPlayer() {
    return window.gameClient?.player || {};
  }

  function getPlayerState() {
    return getPlayer().state || {};
  }

  function getOpenContainers() {
    const manager = window.gameClient?.interface?.containerManager || window.gameClient?.containerManager;
    const raw = manager?.containers || manager?.__containers || window.gameClient?.containers || {};
    return Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw || {}).filter(Boolean);
  }

  function getContainerItems(container) {
    const raw = container?.items || container?.__items || container?.contents || container?.__contents || [];
    return Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw || {}).filter(Boolean);
  }

  function getItemId(item) {
    return Number(item?.id ?? item?.typeId ?? item?.itemId ?? item?.type?.id);
  }

  function getVisibleCreatures() {
    const map = window.gameClient?.map || window.gameClient?.gameMap || {};
    const raw = map.visibleCreatures || map.creatures || window.gameClient?.creatures || [];
    return Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw || {}).filter(Boolean);
  }

  function creaturePosition(creature) {
    return creature?.position || creature?.pos || creature?.tile?.position || {};
  }

  function creatureName(creature) {
    return String(creature?.name || creature?.getName?.() || "");
  }

  function isPlayerCreature(creature) {
    if (creature === getPlayer()) return false;
    if (creature?.isPlayer === true || creature?.type === "player" || creature?.kind === "player") return true;
    return Boolean(creatureName(creature)) && Number(creature?.id || 0) > 0 && !creature?.isMonster;
  }

  function runAutoEatMonitor() {
    const containers = getOpenContainers();
    let foodCount = 0;
    containers.forEach((container) => {
      getContainerItems(container).forEach((item) => {
        if (foodIds.has(getItemId(item))) foodCount += 1;
      });
    });
    result.foodContainers = containers.length;
    result.foodItems = foodCount;
    result.autoEatDecision = foodCount > 0 ? "food available" : "no food found";
    setText("minibia-bot-perf-food-containers", result.foodContainers);
    setText("minibia-bot-perf-food-count", result.foodItems);
    setText("minibia-bot-perf-auto-eat-decision", result.autoEatDecision);
  }

  function detectParalyzed() {
    const player = getPlayer();
    const state = getPlayerState();
    if ([state.paralyzed, state.isParalyzed, player.paralyzed, player.isParalyzed].some((value) => value === true)) return true;
    const conditions = state.conditions || player.conditions || state.icons || player.icons || [];
    const values = Array.isArray(conditions) ? conditions : Object.values(conditions || {});
    return values.some((value) => /paraly/i.test(String(value?.name ?? value?.type ?? value)));
  }

  function runAntiParalyzeMonitor() {
    result.paralyzed = detectParalyzed();
    result.antiParalyzeDecision = result.paralyzed ? "eligible (safety off)" : "not paralyzed";
    setText("minibia-bot-perf-paralyzed", result.paralyzed ? "yes" : "no");
    setText("minibia-bot-perf-anti-paralyze-decision", result.antiParalyzeDecision);
  }

  function runDefensiveSpellMonitor() {
    const state = getPlayerState();
    const player = getPlayer();
    const health = Number(state.health ?? player.health ?? 0);
    const maxHealth = Number(state.maxHealth ?? state.healthMax ?? player.maxHealth ?? player.healthMax ?? 0);
    const healthPercent = maxHealth > 0 ? Math.round((health / maxHealth) * 100) : null;
    result.invisibleDecision = "eligible (safety off)";
    result.magicShieldDecision = healthPercent !== null && healthPercent <= 70 ? "eligible" : "not needed";
    setText("minibia-bot-perf-invisible-decision", result.invisibleDecision);
    setText("minibia-bot-perf-shield-decision", result.magicShieldDecision);
  }

  // Mirrors the expensive part of rune maker/drop: repeated full container/item scans.
  function runRuneMonitor() {
    const containers = getOpenContainers();
    let runeCount = 0;
    let blankCount = 0;
    containers.forEach((container) => {
      getContainerItems(container).forEach((item) => {
        const id = getItemId(item);
        if (runeIds.has(id)) runeCount += 1;
        if (id === 2260) blankCount += 1;
      });
    });
    result.runeContainers = containers.length;
    result.runeItems = runeCount;
    result.blankRunes = blankCount;
    result.runeDecision = blankCount > 0 ? "blank rune available" : runeCount > 0 ? "made rune found" : "no runes found";
    setText("minibia-bot-perf-rune-containers", result.runeContainers);
    setText("minibia-bot-perf-rune-count", result.runeItems);
    setText("minibia-bot-perf-blank-runes", result.blankRunes);
    setText("minibia-bot-perf-rune-decision", result.runeDecision);
  }

  // Mirrors player-screen alert scanning without sound, notification, or action.
  function runPlayerScreenAlertMonitor() {
    const creatures = getVisibleCreatures();
    let players = 0;
    creatures.forEach((creature) => {
      if (isPlayerCreature(creature)) players += 1;
    });
    result.visiblePlayers = players;
    result.playerAlertDecision = players > 0 ? "player detected (alert blocked)" : "clear";
    setText("minibia-bot-perf-visible-players", result.visiblePlayers);
    setText("minibia-bot-perf-player-alert", result.playerAlertDecision);
  }

  // Exercises GFB target-position calculation only. No mouse event, item use, or cast is sent.
  function runGfbPathMonitor() {
    const creatures = getVisibleCreatures();
    const playerPos = creaturePosition(getPlayer());
    const px = Number(playerPos.x ?? 0);
    const py = Number(playerPos.y ?? 0);
    const pz = Number(playerPos.z ?? 0);
    const monsters = creatures.filter((creature) => {
      if (creature === getPlayer() || isPlayerCreature(creature)) return false;
      const pos = creaturePosition(creature);
      return Number(pos.z ?? pz) === pz;
    });

    let bestHits = 0;
    let tilesChecked = 0;
    for (let x = px - 7; x <= px + 7; x += 1) {
      for (let y = py - 5; y <= py + 5; y += 1) {
        tilesChecked += 1;
        let hits = 0;
        monsters.forEach((monster) => {
          const pos = creaturePosition(monster);
          const dx = Math.abs(Number(pos.x ?? 9999) - x);
          const dy = Math.abs(Number(pos.y ?? 9999) - y);
          if (dx <= 3 && dy <= 3) hits += 1;
        });
        if (hits > bestHits) bestHits = hits;
      }
    }

    result.gfbCreatures = monsters.length;
    result.gfbTilesChecked = tilesChecked;
    result.gfbBestHits = bestHits;
    result.gfbDecision = bestHits > 0 ? `best tile hits ${bestHits} (cast blocked)` : "no target tile";
    setText("minibia-bot-perf-gfb-creatures", result.gfbCreatures);
    setText("minibia-bot-perf-gfb-tiles", result.gfbTilesChecked);
    setText("minibia-bot-perf-gfb-hits", result.gfbBestHits);
    setText("minibia-bot-perf-gfb-decision", result.gfbDecision);
  }

  function schedule(fn, interval) {
    timers.push(window.setInterval(fn, interval));
    fn();
  }

  schedule(runAutoEatMonitor, 100);
  schedule(runAntiParalyzeMonitor, 100);
  schedule(runDefensiveSpellMonitor, 100);
  schedule(runRuneMonitor, 100);
  schedule(runPlayerScreenAlertMonitor, 100);
  schedule(runGfbPathMonitor, 100);

  window.minibiaBot = {
    status: () => ({
      mode: "six-feature-fps-test-no-actions",
      reconnectWatcher: false,
      autoEatMonitor: true,
      antiParalyzeMonitor: true,
      defensiveSpellMonitor: true,
      runeMonitor: true,
      playerScreenAlertMonitor: true,
      gfbPathMonitor: true,
      actualRuneUse: false,
      actualAlert: false,
      actualGfbClickOrCast: false,
      ...result,
    }),
    destroy() {
      timers.forEach((timerId) => window.clearInterval(timerId));
      timers.length = 0;
      document.getElementById(panelId)?.remove();
    },
  };

  const panel = document.createElement("div");
  panel.id = panelId;
  panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;padding:12px 14px;border:2px solid #f4b400;border-radius:8px;background:#151515;color:#fff;font:14px/1.4 Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.45);max-width:430px;max-height:85vh;overflow:auto";
  panel.innerHTML = `
    <div style="font-weight:700">FPS TEST — 6 MONITORS, ACTIONS BLOCKED</div>
    <div style="margin-top:4px;font-size:12px">Nothing is used, clicked, cast, spoken, or alerted.</div>
    <hr style="border:0;border-top:1px solid #444;margin:7px 0">
    <div style="font-size:12px">Auto-eat containers: <span id="minibia-bot-perf-food-containers">0</span>; food: <span id="minibia-bot-perf-food-count">0</span></div>
    <div style="font-size:12px">Auto-eat: <span id="minibia-bot-perf-auto-eat-decision">none</span></div>
    <div style="font-size:12px">Paralyzed: <span id="minibia-bot-perf-paralyzed">no</span>; anti-paralyze: <span id="minibia-bot-perf-anti-paralyze-decision">none</span></div>
    <div style="font-size:12px">Invisible: <span id="minibia-bot-perf-invisible-decision">none</span>; shield: <span id="minibia-bot-perf-shield-decision">none</span></div>
    <hr style="border:0;border-top:1px solid #444;margin:7px 0">
    <div style="font-size:12px">Rune containers: <span id="minibia-bot-perf-rune-containers">0</span>; rune items: <span id="minibia-bot-perf-rune-count">0</span>; blanks: <span id="minibia-bot-perf-blank-runes">0</span></div>
    <div style="font-size:12px">Rune maker/drop: <span id="minibia-bot-perf-rune-decision">none</span></div>
    <div style="font-size:12px">Visible players: <span id="minibia-bot-perf-visible-players">0</span>; alert: <span id="minibia-bot-perf-player-alert">none</span></div>
    <div style="font-size:12px">GFB creatures: <span id="minibia-bot-perf-gfb-creatures">0</span>; tiles checked: <span id="minibia-bot-perf-gfb-tiles">0</span>; best hits: <span id="minibia-bot-perf-gfb-hits">0</span></div>
    <div style="font-size:12px">GFB path: <span id="minibia-bot-perf-gfb-decision">none</span></div>`;
  document.body.appendChild(panel);
  console.log("[PERF TEST] Six-feature test loaded. Rune use, alerts, clicks, and casts are blocked.");
})();