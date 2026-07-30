(() => {
  const panelId = "minibia-bot-perf-test-panel";

  if (window.minibiaBot?.destroy) {
    try { window.minibiaBot.destroy(); } catch (error) {
      console.warn("[PERF TEST] Previous bot cleanup failed", error);
    }
  }
  document.getElementById("minibia-bot-panel")?.remove();
  document.getElementById(panelId)?.remove();

  const timers = [];
  const state = {
    visibleCreatures: 0,
    visiblePlayers: 0,
    attackCandidates: 0,
    selectedTarget: "none",
    squareCount: 0,
    gfbCount: 0,
    waypointDistance: null,
    pathCandidates: 0,
    bestStep: "none",
    health: null,
    mana: null,
    healthPercent: null,
    manaPercent: null,
    healingDecision: "none",
    lastDamageMessage: null,
    xrayScannedCreatures: 0,
    xraySameFloor: 0,
    xrayOtherFloors: 0,
    xrayPlayers: 0,
    xrayMonsters: 0,
  };

  const testWaypointOffset = { x: 6, y: 4 };

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  function getPlayerPosition() {
    return window.gameClient?.player?.getPosition?.() || null;
  }

  function getPlayerState() {
    return window.gameClient?.player?.state || null;
  }

  function getActiveCreatures() {
    return Object.values(window.gameClient?.world?.activeCreatures || {});
  }

  function isWithinVisibleRange(me, pos) {
    return !!me && !!pos && Math.abs(pos.x - me.x) <= 8 && Math.abs(pos.y - me.y) <= 6;
  }

  function getVisibleCreatures() {
    const me = getPlayerPosition();
    if (!me) return [];
    const myId = window.gameClient?.player?.id;
    return getActiveCreatures().filter((creature) =>
      creature && creature.id !== myId && isWithinVisibleRange(me, creature.__position)
    );
  }

  function getVisibleMonstersSameFloor() {
    const me = getPlayerPosition();
    if (!me) return [];
    return getVisibleCreatures().filter((creature) => creature?.type !== 0 && creature?.__position?.z === me.z);
  }

  function scanVisibleCreatures() {
    state.visibleCreatures = getVisibleCreatures().length;
    setText("minibia-bot-perf-visible-count", state.visibleCreatures);
  }

  function getLatestDamageMessage() {
    const channels = window.gameClient?.interface?.channelManager?.channels || [];
    for (const channel of channels) {
      const entries = channel?.__contents || [];
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const message = String(entries[index]?.message || "");
        if (/^You lose\s+\d+\s+hitpoints\s+due to an attack by\s+.+?\.$/i.test(message)) return message;
      }
    }
    return null;
  }

  function runPanicScanner() {
    const me = getPlayerPosition();
    const visible = getVisibleCreatures();
    state.visiblePlayers = visible.filter((creature) => {
      const z = Number(creature?.__position?.z);
      return creature?.type === 0 && me && Number.isFinite(z) && Math.abs(z - me.z) <= 1;
    }).length;
    state.lastDamageMessage = getLatestDamageMessage();
    setText("minibia-bot-perf-player-count", state.visiblePlayers);
  }

  function runAttackMonitor() {
    const me = getPlayerPosition();
    if (!me) return;
    const candidates = getVisibleMonstersSameFloor().map((creature) => {
      const pos = creature.__position;
      return {
        name: String(creature.name || "Mob"),
        distance: Math.max(Math.abs(pos.x - me.x), Math.abs(pos.y - me.y)),
      };
    }).sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
    state.attackCandidates = candidates.length;
    state.selectedTarget = candidates[0]?.name || "none";
    setText("minibia-bot-perf-attack-count", state.attackCandidates);
    setText("minibia-bot-perf-target-name", state.selectedTarget);
  }

  function runAoeScanner() {
    const me = getPlayerPosition();
    if (!me) return;
    const monsters = getVisibleMonstersSameFloor();
    state.squareCount = monsters.filter((monster) => {
      const pos = monster?.__position;
      return pos && Math.abs(pos.x - me.x) <= 1 && Math.abs(pos.y - me.y) <= 1;
    }).length;
    let best = 0;
    for (const center of monsters) {
      const centerPos = center?.__position;
      if (!centerPos) continue;
      const count = monsters.filter((monster) => {
        const pos = monster?.__position;
        return pos && Math.max(Math.abs(pos.x - centerPos.x), Math.abs(pos.y - centerPos.y)) <= 2;
      }).length;
      if (count > best) best = count;
    }
    state.gfbCount = best;
    setText("minibia-bot-perf-square-count", state.squareCount);
    setText("minibia-bot-perf-gfb-count", state.gfbCount);
  }

  function runCavebotMonitor() {
    const me = getPlayerPosition();
    if (!me) return;
    const target = { x: me.x + testWaypointOffset.x, y: me.y + testWaypointOffset.y, z: me.z };
    state.waypointDistance = Math.max(Math.abs(target.x - me.x), Math.abs(target.y - me.y));
    const directions = [
      ["N", 0, -1], ["NE", 1, -1], ["E", 1, 0], ["SE", 1, 1],
      ["S", 0, 1], ["SW", -1, 1], ["W", -1, 0], ["NW", -1, -1],
    ];
    const occupied = new Set(getVisibleCreatures().map((c) => c?.__position)
      .filter((p) => p && p.z === me.z).map((p) => `${p.x}:${p.y}`));
    const candidates = directions.map(([name, dx, dy]) => ({
      name,
      blocked: occupied.has(`${me.x + dx}:${me.y + dy}`),
      distance: Math.max(Math.abs(target.x - (me.x + dx)), Math.abs(target.y - (me.y + dy))),
    })).filter((step) => !step.blocked).sort((a, b) => a.distance - b.distance);
    state.pathCandidates = candidates.length;
    state.bestStep = candidates[0]?.name || "none";
    setText("minibia-bot-perf-waypoint-distance", state.waypointDistance ?? "none");
    setText("minibia-bot-perf-path-count", state.pathCandidates);
    setText("minibia-bot-perf-best-step", state.bestStep);
  }

  function numberFrom(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return 0;
  }

  function runHealingMonitor() {
    const playerState = getPlayerState() || {};
    const player = window.gameClient?.player || {};
    const maxHealth = numberFrom(playerState.maxHealth, playerState.healthMax, player.maxHealth, player.healthMax);
    const maxMana = numberFrom(playerState.maxMana, playerState.manaMax, player.maxMana, player.manaMax);
    state.health = numberFrom(playerState.health, player.health);
    state.mana = numberFrom(playerState.mana, player.mana);
    state.healthPercent = maxHealth > 0 ? Math.round((state.health / maxHealth) * 100) : null;
    state.manaPercent = maxMana > 0 ? Math.round((state.mana / maxMana) * 100) : null;
    state.healingDecision = state.healthPercent !== null && state.healthPercent <= 40 ? "emergency heal"
      : state.healthPercent !== null && state.healthPercent <= 70 ? "regular heal"
      : state.manaPercent !== null && state.manaPercent <= 35 ? "drink mana fluid" : "none";
    setText("minibia-bot-perf-health", state.healthPercent === null ? state.health : `${state.healthPercent}%`);
    setText("minibia-bot-perf-mana", state.manaPercent === null ? state.mana : `${state.manaPercent}%`);
    setText("minibia-bot-perf-heal-decision", state.healingDecision);
  }

  function runXrayMonitor() {
    const me = getPlayerPosition();
    const myId = window.gameClient?.player?.id;
    const scanned = getActiveCreatures().filter((creature) => creature && creature.id !== myId && creature.__position);
    state.xrayScannedCreatures = scanned.length;
    state.xraySameFloor = me ? scanned.filter((creature) => creature.__position.z === me.z).length : 0;
    state.xrayOtherFloors = me ? scanned.filter((creature) => creature.__position.z !== me.z).length : 0;
    state.xrayPlayers = scanned.filter((creature) => creature.type === 0).length;
    state.xrayMonsters = scanned.filter((creature) => creature.type !== 0).length;
    setText("minibia-bot-perf-xray-total", state.xrayScannedCreatures);
    setText("minibia-bot-perf-xray-same", state.xraySameFloor);
    setText("minibia-bot-perf-xray-other", state.xrayOtherFloors);
    setText("minibia-bot-perf-xray-types", `${state.xrayPlayers} players / ${state.xrayMonsters} monsters`);
  }

  function every(callback, interval) {
    timers.push(window.setInterval(callback, interval));
    callback();
  }

  every(scanVisibleCreatures, 250);
  every(runPanicScanner, 200);
  every(runAttackMonitor, 100);
  every(runAoeScanner, 100);
  every(runCavebotMonitor, 100);
  every(runHealingMonitor, 100);
  every(runXrayMonitor, 100);

  window.minibiaBot = {
    status: () => ({
      mode: "core-creature-panic-attack-aoe-cavebot-healing-and-xray-monitor-performance-test",
      reconnectWatcher: false,
      xrayMonitor: true,
      xrayScanIntervalMs: 100,
      ...state,
    }),
    destroy() {
      timers.forEach((timerId) => window.clearInterval(timerId));
      timers.length = 0;
      document.getElementById(panelId)?.remove();
    },
  };

  const panel = document.createElement("div");
  panel.id = panelId;
  panel.style.cssText = [
    "position:fixed", "top:12px", "right:12px", "z-index:2147483647",
    "padding:12px 14px", "border:2px solid #f4b400", "border-radius:8px",
    "background:#151515", "color:#fff", "font:14px/1.4 Arial,sans-serif",
    "box-shadow:0 4px 18px rgba(0,0,0,.45)", "max-height:90vh", "overflow:auto",
  ].join(";");
  panel.innerHTML = `
    <div style="font-weight:700">FPS TEST — X-RAY MONITOR</div>
    <div style="margin-top:4px;font-size:12px">Previous scanners remain active. Reconnect watcher is off.</div>
    <div style="margin-top:4px;font-size:12px">X-ray creature/floor classification runs every 100 ms. No overlay is drawn.</div>
    <div style="margin-top:4px;font-size:12px">Visible creatures: <span id="minibia-bot-perf-visible-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Visible players: <span id="minibia-bot-perf-player-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Attack candidates: <span id="minibia-bot-perf-attack-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Selected target: <span id="minibia-bot-perf-target-name">none</span></div>
    <div style="margin-top:4px;font-size:12px">AoE — square: <span id="minibia-bot-perf-square-count">0</span>, GFB: <span id="minibia-bot-perf-gfb-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Waypoint distance: <span id="minibia-bot-perf-waypoint-distance">none</span></div>
    <div style="margin-top:4px;font-size:12px">Path candidates: <span id="minibia-bot-perf-path-count">0</span>, best: <span id="minibia-bot-perf-best-step">none</span></div>
    <div style="margin-top:4px;font-size:12px">Health: <span id="minibia-bot-perf-health">0</span>, mana: <span id="minibia-bot-perf-mana">0</span></div>
    <div style="margin-top:4px;font-size:12px">Healing decision: <span id="minibia-bot-perf-heal-decision">none</span></div>
    <div style="margin-top:6px;font-size:12px">X-ray scanned: <span id="minibia-bot-perf-xray-total">0</span></div>
    <div style="margin-top:4px;font-size:12px">Same floor: <span id="minibia-bot-perf-xray-same">0</span>, other floors: <span id="minibia-bot-perf-xray-other">0</span></div>
    <div style="margin-top:4px;font-size:12px">Types: <span id="minibia-bot-perf-xray-types">0 players / 0 monsters</span></div>
  `;
  document.body.appendChild(panel);
  runXrayMonitor();

  console.log("[PERF TEST] X-ray scan monitor added; no overlay elements will be drawn.");
})();