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
  const runeIds = new Set(Array.from({ length: 57 }, (_, index) => 2260 + index));
  const result = {};

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };

  const valuesOf = (raw) => Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw || {}).filter(Boolean);
  const getPlayer = () => window.gameClient?.player || {};
  const getPlayerState = () => getPlayer().state || {};
  const getPosition = (object) => object?.position || object?.pos || object?.tile?.position || {};
  const getName = (object) => String(object?.name || object?.getName?.() || "");
  const getOpenContainers = () => {
    const manager = window.gameClient?.interface?.containerManager || window.gameClient?.containerManager;
    return valuesOf(manager?.containers || manager?.__containers || window.gameClient?.containers || {});
  };
  const getContainerItems = (container) => valuesOf(container?.items || container?.__items || container?.contents || container?.__contents || []);
  const getItemId = (item) => Number(item?.id ?? item?.typeId ?? item?.itemId ?? item?.type?.id);
  const getVisibleCreatures = () => {
    const map = window.gameClient?.map || window.gameClient?.gameMap || {};
    return valuesOf(map.visibleCreatures || map.creatures || window.gameClient?.creatures || []);
  };
  const isPlayerCreature = (creature) => {
    if (!creature || creature === getPlayer()) return false;
    if (creature.isPlayer === true || creature.type === "player" || creature.kind === "player") return true;
    return Boolean(getName(creature)) && Number(creature.id || 0) > 0 && !creature.isMonster;
  };
  const isMonsterCreature = (creature) => Boolean(creature && creature !== getPlayer() && !isPlayerCreature(creature));
  const tileDistance = (a, b) => Math.max(Math.abs(Number(a?.x || 0) - Number(b?.x || 0)), Math.abs(Number(a?.y || 0) - Number(b?.y || 0)));

  function runInventoryMonitor() {
    const containers = getOpenContainers();
    let items = 0, foods = 0, runes = 0, blanks = 0, lowStack = 0;
    containers.forEach((container) => getContainerItems(container).forEach((item) => {
      items += 1;
      const id = getItemId(item);
      const count = Number(item?.count ?? item?.amount ?? 1);
      if (foodIds.has(id)) foods += 1;
      if (runeIds.has(id)) runes += 1;
      if (id === 2260) blanks += 1;
      if (count <= 2) lowStack += 1;
    }));
    Object.assign(result, { containers: containers.length, items, foods, runes, blanks, lowStack });
    setText("perf-inventory", `${containers.length} containers / ${items} items / ${foods} food / ${runes} runes`);
  }

  function runStatusMonitor() {
    const player = getPlayer();
    const state = getPlayerState();
    const conditions = valuesOf(state.conditions || player.conditions || state.icons || player.icons || []);
    const text = conditions.map((condition) => String(condition?.name ?? condition?.type ?? condition)).join(" ");
    const health = Number(state.health ?? player.health ?? 0);
    const maxHealth = Number(state.maxHealth ?? state.healthMax ?? player.maxHealth ?? player.healthMax ?? 0);
    const mana = Number(state.mana ?? player.mana ?? 0);
    const maxMana = Number(state.maxMana ?? state.manaMax ?? player.maxMana ?? player.manaMax ?? 0);
    const capacity = Number(state.capacity ?? player.capacity ?? state.cap ?? player.cap ?? 0);
    Object.assign(result, {
      healthPercent: maxHealth > 0 ? Math.round(health * 100 / maxHealth) : 0,
      manaPercent: maxMana > 0 ? Math.round(mana * 100 / maxMana) : 0,
      capacity,
      paralyzed: /paraly/i.test(text) || state.paralyzed === true || player.paralyzed === true,
      hasted: /haste|speed/i.test(text),
      invisible: /invis/i.test(text),
      shielded: /shield|mana shield/i.test(text),
    });
    setText("perf-status", `HP ${result.healthPercent}% / MP ${result.manaPercent}% / cap ${capacity} / para ${result.paralyzed ? "yes" : "no"}`);
  }

  function runCreatureMonitor() {
    const creatures = getVisibleCreatures();
    const playerPos = getPosition(getPlayer());
    let players = 0, monsters = 0, nearMonsters = 0, targetable = 0;
    creatures.forEach((creature) => {
      if (isPlayerCreature(creature)) players += 1;
      else if (isMonsterCreature(creature)) {
        monsters += 1;
        if (tileDistance(playerPos, getPosition(creature)) <= 7) nearMonsters += 1;
        if (creature?.health !== 0 && creature?.dead !== true) targetable += 1;
      }
    });
    Object.assign(result, { visibleCreatures: creatures.length, visiblePlayers: players, visibleMonsters: monsters, nearMonsters, targetable });
    setText("perf-creatures", `${creatures.length} total / ${players} players / ${monsters} monsters / ${nearMonsters} near`);
  }

  function runAutoAttackExtrasMonitor() {
    const monsters = getVisibleCreatures().filter(isMonsterCreature);
    const playerPos = getPosition(getPlayer());
    const scored = monsters.map((monster, index) => {
      const pos = getPosition(monster);
      const distance = tileDistance(playerPos, pos);
      const health = Number(monster?.healthPercent ?? monster?.health ?? 100);
      const priority = Number(monster?.priority ?? 0);
      const excluded = Boolean(monster?.excluded || monster?.ignore);
      return { monster, score: priority * 1000 - distance * 10 - health - index, distance, excluded };
    }).filter((entry) => !entry.excluded).sort((a, b) => b.score - a.score);
    const best = scored[0];
    Object.assign(result, {
      attackCandidates: scored.length,
      attackBest: best ? getName(best.monster) || "unnamed" : "none",
      keepDistanceDecision: best ? (best.distance < 3 ? "retreat" : best.distance > 5 ? "approach" : "hold") : "idle",
      lureDecision: scored.length >= 3 ? "lure-ready" : "not enough monsters",
      runeRetryDecision: best ? "target valid (use blocked)" : "no target",
    });
    setText("perf-attack", `${result.attackCandidates} candidates / best ${result.attackBest} / ${result.keepDistanceDecision} / ${result.lureDecision}`);
  }

  function runAoeAndGfbMonitor() {
    const monsters = getVisibleCreatures().filter(isMonsterCreature);
    const playerPos = getPosition(getPlayer());
    const px = Number(playerPos.x || 0), py = Number(playerPos.y || 0), pz = Number(playerPos.z || 0);
    let bestHits = 0, tilesChecked = 0, waveHits = 0;
    for (let x = px - 7; x <= px + 7; x += 1) {
      for (let y = py - 5; y <= py + 5; y += 1) {
        tilesChecked += 1;
        let hits = 0;
        monsters.forEach((monster) => {
          const pos = getPosition(monster);
          if (Number(pos.z ?? pz) === pz && Math.abs(Number(pos.x || 9999) - x) <= 3 && Math.abs(Number(pos.y || 9999) - y) <= 3) hits += 1;
        });
        if (hits > bestHits) bestHits = hits;
      }
    }
    monsters.forEach((monster) => {
      const pos = getPosition(monster);
      const dx = Number(pos.x || 0) - px;
      const dy = Number(pos.y || 0) - py;
      if (Math.abs(dx) <= 4 && Math.abs(dy) <= 2) waveHits += 1;
    });
    Object.assign(result, { aoeMonsters: monsters.length, gfbTilesChecked: tilesChecked, gfbBestHits: bestHits, waveHits });
    setText("perf-aoe", `${monsters.length} monsters / ${tilesChecked} GFB tiles / best ${bestHits} / wave ${waveHits}`);
  }

  function runCavebotMonitor() {
    const cave = window.minibiaBot?.cave || window.caveBot || window.cavebot || {};
    const waypoints = valuesOf(cave.waypoints || cave.points || window.minibiaBotWaypoints || []);
    const playerPos = getPosition(getPlayer());
    let nearestDistance = null;
    waypoints.forEach((waypoint) => {
      const distance = tileDistance(playerPos, waypoint?.position || waypoint);
      if (nearestDistance === null || distance < nearestDistance) nearestDistance = distance;
    });
    const actionCount = waypoints.filter((waypoint) => Boolean(waypoint?.action || waypoint?.type)).length;
    Object.assign(result, { waypointCount: waypoints.length, nearestWaypoint: nearestDistance ?? "none", waypointActions: actionCount });
    setText("perf-cave", `${waypoints.length} waypoints / nearest ${result.nearestWaypoint} / ${actionCount} actions / movement blocked`);
  }

  function runChatAlertMonitor() {
    const chat = window.gameClient?.chat || window.gameClient?.interface?.chat || {};
    const messages = valuesOf(chat.messages || chat.history || chat.lines || []);
    let red = 0, gm = 0, damage = 0;
    messages.slice(-100).forEach((message) => {
      const text = String(message?.text ?? message?.message ?? message);
      const color = String(message?.color ?? message?.type ?? "");
      if (/red|error|warning/i.test(color)) red += 1;
      if (/\bgm\b|game master|gamemaster/i.test(text)) gm += 1;
      if (/lose|lost|damage|hitpoints|hp/i.test(text)) damage += 1;
    });
    Object.assign(result, { chatMessages: messages.length, redMessages: red, gmMessages: gm, damageMessages: damage });
    setText("perf-chat", `${messages.length} messages / red ${red} / GM ${gm} / damage ${damage} / alerts blocked`);
  }

  function runPzMiningEquipTalkMonitor() {
    const player = getPlayer();
    const state = getPlayerState();
    const tile = player?.tile || window.gameClient?.map?.getTile?.(getPosition(player)) || {};
    const equipment = state.equipment || player.equipment || {};
    const nearbyTiles = valuesOf(window.gameClient?.map?.visibleTiles || window.gameClient?.map?.tiles || []);
    let mineable = 0;
    nearbyTiles.forEach((entry) => {
      const name = String(entry?.name || entry?.type || entry?.ground?.name || "");
      if (/rock|ore|mine|stone/i.test(name)) mineable += 1;
    });
    Object.assign(result, {
      pz: Boolean(tile?.protectionZone || tile?.isPz || state?.protectionZone || state?.pz),
      mineableTiles: mineable,
      ringEquipped: Boolean(equipment?.ring || equipment?.finger || player?.ring),
      talkQueue: valuesOf(window.minibiaBot?.talkQueue || window.talkQueue || []).length,
    });
    setText("perf-misc", `PZ ${result.pz ? "yes" : "no"} / mineable ${mineable} / ring ${result.ringEquipped ? "yes" : "no"} / talk ${result.talkQueue}`);
  }

  function runPanelMonitor() {
    const panel = document.getElementById(panelId);
    const botPanel = document.getElementById("minibia-bot-panel");
    const nodes = botPanel ? botPanel.querySelectorAll("*").length : 0;
    const visibleRows = botPanel ? Array.from(botPanel.querySelectorAll("div,span,button,input,select")).filter((node) => node.getClientRects().length > 0).length : 0;
    Object.assign(result, { botPanelNodes: nodes, botPanelVisibleRows: visibleRows, perfPanelHeight: panel?.offsetHeight || 0 });
    setText("perf-panel", `${nodes} bot-panel nodes / ${visibleRows} visible / refresh only`);
  }

  function schedule(fn, interval) {
    timers.push(window.setInterval(() => {
      try { fn(); } catch (error) { console.warn(`[PERF TEST] ${fn.name} failed`, error); }
    }, interval));
    try { fn(); } catch (error) { console.warn(`[PERF TEST] ${fn.name} initial run failed`, error); }
  }

  schedule(runInventoryMonitor, 100);
  schedule(runStatusMonitor, 100);
  schedule(runCreatureMonitor, 100);
  schedule(runAutoAttackExtrasMonitor, 100);
  schedule(runAoeAndGfbMonitor, 100);
  schedule(runCavebotMonitor, 100);
  schedule(runChatAlertMonitor, 100);
  schedule(runPzMiningEquipTalkMonitor, 100);
  schedule(runPanelMonitor, 100);

  window.minibiaBot = {
    status: () => ({
      mode: "all-feature-fps-isolation-actions-blocked",
      monitorGroups: 9,
      actualMovement: false,
      actualAttack: false,
      actualItemUse: false,
      actualSpellCast: false,
      actualMouseClick: false,
      actualSpeech: false,
      actualAlert: false,
      actualEquip: false,
      reconnectWatcher: false,
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
  panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;padding:12px 14px;border:2px solid #f4b400;border-radius:8px;background:#151515;color:#fff;font:14px/1.4 Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.45);max-width:460px;max-height:88vh;overflow:auto";
  panel.innerHTML = `
    <div style="font-weight:700">FPS TEST — ALL FEATURE GROUPS</div>
    <div style="margin:3px 0 7px;font-size:12px">9 grouped monitors at 100 ms. Every game action is blocked.</div>
    <div style="font-size:12px"><b>Inventory:</b> <span id="perf-inventory">loading</span></div>
    <div style="font-size:12px"><b>Status/heal/spells:</b> <span id="perf-status">loading</span></div>
    <div style="font-size:12px"><b>Players/monsters/alerts:</b> <span id="perf-creatures">loading</span></div>
    <div style="font-size:12px"><b>Attack extras:</b> <span id="perf-attack">loading</span></div>
    <div style="font-size:12px"><b>AoE/GFB:</b> <span id="perf-aoe">loading</span></div>
    <div style="font-size:12px"><b>Cavebot/actions:</b> <span id="perf-cave">loading</span></div>
    <div style="font-size:12px"><b>Chat/TTS/GM/red text:</b> <span id="perf-chat">loading</span></div>
    <div style="font-size:12px"><b>PZ/mining/ring/talk:</b> <span id="perf-misc">loading</span></div>
    <div style="font-size:12px"><b>Panel/UI refresh:</b> <span id="perf-panel">loading</span></div>
    <hr style="border:0;border-top:1px solid #444;margin:7px 0">
    <div style="font-size:11px">Blocked: movement, attacks, item/rune use, spell casts, clicks, speech, alerts, equipment changes and reconnect.</div>`;
  document.body.appendChild(panel);
  console.log("[PERF TEST] All remaining feature groups loaded. All real actions are blocked.");
})();