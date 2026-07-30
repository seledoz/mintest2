(() => {
  const panelId = "minibia-bot-perf-test-panel";

  if (window.minibiaBot?.destroy) {
    try { window.minibiaBot.destroy(); } catch (error) {
      console.warn("[PERF TEST] Previous bot cleanup failed", error);
    }
  }

  document.getElementById("minibia-bot-panel")?.remove();
  document.getElementById(panelId)?.remove();

  let creatureScanTimerId = null;
  let panicScanTimerId = null;
  let attackScanTimerId = null;
  let aoeScanTimerId = null;
  let cavebotScanTimerId = null;
  let healingScanTimerId = null;
  let xrayScanTimerId = null;
  let gfbScanTimerId = null;

  let lastVisibleCount = 0;
  let lastVisiblePlayerCount = 0;
  let lastAttackCandidateCount = 0;
  let lastSelectedTargetName = null;
  let lastSquareCount = 0;
  let lastWaypointDistance = null;
  let lastPathCandidateCount = 0;
  let lastBestStep = "none";
  let lastHealth = null;
  let lastMana = null;
  let lastHealthPercent = null;
  let lastManaPercent = null;
  let lastHealingDecision = "none";
  let lastDamageMessage = null;
  let lastXrayTotal = 0;
  let lastXraySameFloor = 0;
  let lastXrayOtherFloors = 0;
  let lastXrayPlayers = 0;
  let lastXrayMonsters = 0;
  let lastGfbCandidateCount = 0;
  let lastBestGfbCount = 0;
  let lastBestGfbTargetName = "none";
  let lastBestGfbPosition = "none";

  const testWaypointOffset = { x: 6, y: 4 };

  function getPlayerPosition() {
    return window.gameClient?.player?.getPosition?.() || null;
  }

  function getPlayerState() {
    return window.gameClient?.player?.state || null;
  }

  function getCreaturePosition(creature) {
    return creature?.getPosition?.() || creature?.__position || creature?.position || null;
  }

  function isWithinVisibleRange(me, pos) {
    if (!me || !pos) return false;
    return Math.abs(pos.x - me.x) <= 8 && Math.abs(pos.y - me.y) <= 6;
  }

  function getAllActiveCreatures() {
    return Object.values(window.gameClient?.world?.activeCreatures || {}).filter(Boolean);
  }

  function getVisibleCreatures() {
    const me = getPlayerPosition();
    if (!me) return [];
    const myId = window.gameClient?.player?.id;
    return getAllActiveCreatures().filter((creature) => {
      if (creature.id === myId) return false;
      return isWithinVisibleRange(me, getCreaturePosition(creature));
    });
  }

  function getVisibleMonstersSameFloor() {
    const me = getPlayerPosition();
    if (!me) return [];
    return getVisibleCreatures().filter((creature) => {
      const pos = getCreaturePosition(creature);
      return creature?.type !== 0 && pos?.z === me.z;
    });
  }

  function scanVisibleCreatures() {
    const creatures = getVisibleCreatures();
    lastVisibleCount = creatures.length;
    const element = document.getElementById("minibia-bot-perf-visible-count");
    if (element) element.textContent = String(lastVisibleCount);
    return creatures;
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
    const visibleCreatures = scanVisibleCreatures();
    lastVisiblePlayerCount = visibleCreatures.filter((creature) => {
      const z = Number(getCreaturePosition(creature)?.z);
      return creature?.type === 0 && me && Number.isFinite(z) && Math.abs(z - me.z) <= 1;
    }).length;
    lastHealth = Number(getPlayerState()?.health ?? 0);
    lastDamageMessage = getLatestDamageMessage();
    const element = document.getElementById("minibia-bot-perf-player-count");
    if (element) element.textContent = String(lastVisiblePlayerCount);
  }

  function runAttackMonitor() {
    const me = getPlayerPosition();
    if (!me) {
      lastAttackCandidateCount = 0;
      lastSelectedTargetName = null;
      return;
    }
    const candidates = getVisibleMonstersSameFloor().map((creature) => {
      const pos = getCreaturePosition(creature);
      return {
        creature,
        distance: Math.max(Math.abs(pos.x - me.x), Math.abs(pos.y - me.y)),
        name: String(creature.name || "Mob"),
      };
    }).sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name));
    lastAttackCandidateCount = candidates.length;
    lastSelectedTargetName = candidates[0]?.name || null;
    const countElement = document.getElementById("minibia-bot-perf-attack-count");
    const targetElement = document.getElementById("minibia-bot-perf-target-name");
    if (countElement) countElement.textContent = String(lastAttackCandidateCount);
    if (targetElement) targetElement.textContent = lastSelectedTargetName || "none";
  }

  function runAoeScanner() {
    const me = getPlayerPosition();
    if (!me) {
      lastSquareCount = 0;
      return;
    }
    lastSquareCount = getVisibleMonstersSameFloor().filter((monster) => {
      const pos = getCreaturePosition(monster);
      return pos && Math.abs(pos.x - me.x) <= 1 && Math.abs(pos.y - me.y) <= 1;
    }).length;
    const element = document.getElementById("minibia-bot-perf-square-count");
    if (element) element.textContent = String(lastSquareCount);
  }

  function runCavebotMonitor() {
    const me = getPlayerPosition();
    if (!me) {
      lastWaypointDistance = null;
      lastPathCandidateCount = 0;
      lastBestStep = "none";
      return;
    }
    const target = { x: me.x + testWaypointOffset.x, y: me.y + testWaypointOffset.y, z: me.z };
    lastWaypointDistance = Math.max(Math.abs(target.x - me.x), Math.abs(target.y - me.y));
    const directions = [
      { name: "N", x: 0, y: -1 }, { name: "NE", x: 1, y: -1 },
      { name: "E", x: 1, y: 0 }, { name: "SE", x: 1, y: 1 },
      { name: "S", x: 0, y: 1 }, { name: "SW", x: -1, y: 1 },
      { name: "W", x: -1, y: 0 }, { name: "NW", x: -1, y: -1 },
    ];
    const occupied = new Set(getVisibleCreatures().map(getCreaturePosition).filter((pos) => pos?.z === me.z).map((pos) => `${pos.x}:${pos.y}`));
    const candidates = directions.map((direction) => {
      const x = me.x + direction.x;
      const y = me.y + direction.y;
      return { ...direction, blocked: occupied.has(`${x}:${y}`), distance: Math.max(Math.abs(target.x - x), Math.abs(target.y - y)) };
    }).filter((step) => !step.blocked).sort((left, right) => left.distance - right.distance);
    lastPathCandidateCount = candidates.length;
    lastBestStep = candidates[0]?.name || "none";
    const distanceElement = document.getElementById("minibia-bot-perf-waypoint-distance");
    const candidatesElement = document.getElementById("minibia-bot-perf-path-count");
    const stepElement = document.getElementById("minibia-bot-perf-best-step");
    if (distanceElement) distanceElement.textContent = String(lastWaypointDistance ?? "none");
    if (candidatesElement) candidatesElement.textContent = String(lastPathCandidateCount);
    if (stepElement) stepElement.textContent = lastBestStep;
  }

  function readNumber(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return 0;
  }

  function runHealingMonitor() {
    const state = getPlayerState() || {};
    const player = window.gameClient?.player || {};
    const health = readNumber(state.health, player.health);
    const maxHealth = readNumber(state.maxHealth, state.healthMax, player.maxHealth, player.healthMax);
    const mana = readNumber(state.mana, player.mana);
    const maxMana = readNumber(state.maxMana, state.manaMax, player.maxMana, player.manaMax);
    lastHealth = health;
    lastMana = mana;
    lastHealthPercent = maxHealth > 0 ? Math.round((health / maxHealth) * 100) : null;
    lastManaPercent = maxMana > 0 ? Math.round((mana / maxMana) * 100) : null;
    if (lastHealthPercent !== null && lastHealthPercent <= 40) lastHealingDecision = "emergency heal";
    else if (lastHealthPercent !== null && lastHealthPercent <= 70) lastHealingDecision = "regular heal";
    else if (lastManaPercent !== null && lastManaPercent <= 35) lastHealingDecision = "drink mana fluid";
    else lastHealingDecision = "none";
    const healthElement = document.getElementById("minibia-bot-perf-health");
    const manaElement = document.getElementById("minibia-bot-perf-mana");
    const decisionElement = document.getElementById("minibia-bot-perf-heal-decision");
    if (healthElement) healthElement.textContent = lastHealthPercent === null ? String(health) : `${lastHealthPercent}%`;
    if (manaElement) manaElement.textContent = lastManaPercent === null ? String(mana) : `${lastManaPercent}%`;
    if (decisionElement) decisionElement.textContent = lastHealingDecision;
  }

  function runXrayMonitor() {
    const me = getPlayerPosition();
    const myId = window.gameClient?.player?.id;
    const creatures = getAllActiveCreatures().filter((creature) => creature.id !== myId && getCreaturePosition(creature));
    lastXrayTotal = creatures.length;
    lastXraySameFloor = me ? creatures.filter((creature) => getCreaturePosition(creature)?.z === me.z).length : 0;
    lastXrayOtherFloors = lastXrayTotal - lastXraySameFloor;
    lastXrayPlayers = creatures.filter((creature) => creature?.type === 0).length;
    lastXrayMonsters = lastXrayTotal - lastXrayPlayers;
    const values = {
      "minibia-bot-perf-xray-total": lastXrayTotal,
      "minibia-bot-perf-xray-same-floor": lastXraySameFloor,
      "minibia-bot-perf-xray-other-floors": lastXrayOtherFloors,
      "minibia-bot-perf-xray-players": lastXrayPlayers,
      "minibia-bot-perf-xray-monsters": lastXrayMonsters,
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
  }

  function getGfbTiles(center) {
    if (!center) return [];
    const rowWidths = [1, 5, 5, 7, 5, 5, 1];
    const tiles = [];
    rowWidths.forEach((width, row) => {
      const half = Math.floor(width / 2);
      for (let xOffset = -half; xOffset <= half; xOffset += 1) {
        tiles.push({ x: center.x + xOffset, y: center.y + row - 3, z: center.z });
      }
    });
    return tiles;
  }

  function runGfbMonitor() {
    const me = getPlayerPosition();
    if (!me) {
      lastGfbCandidateCount = 0;
      lastBestGfbCount = 0;
      lastBestGfbTargetName = "none";
      lastBestGfbPosition = "none";
      return;
    }
    const monsters = getVisibleMonstersSameFloor().filter((monster) => {
      const pos = getCreaturePosition(monster);
      return pos && Math.max(Math.abs(pos.x - me.x), Math.abs(pos.y - me.y)) <= 7;
    });
    const candidates = new Map();
    monsters.forEach((monster) => {
      const pos = getCreaturePosition(monster);
      if (pos) candidates.set(`${pos.x}:${pos.y}:${pos.z}`, { position: pos, target: monster });
    });
    lastGfbCandidateCount = candidates.size;
    const evaluations = Array.from(candidates.values()).map((candidate) => {
      const tileKeys = new Set(getGfbTiles(candidate.position).map((pos) => `${pos.x}:${pos.y}:${pos.z}`));
      const count = monsters.filter((monster) => {
        const pos = getCreaturePosition(monster);
        return pos && tileKeys.has(`${pos.x}:${pos.y}:${pos.z}`);
      }).length;
      return { ...candidate, count };
    }).sort((left, right) => right.count - left.count || Math.max(Math.abs(left.position.x - me.x), Math.abs(left.position.y - me.y)) - Math.max(Math.abs(right.position.x - me.x), Math.abs(right.position.y - me.y)));
    const best = evaluations[0] || null;
    lastBestGfbCount = best?.count || 0;
    lastBestGfbTargetName = best?.target?.name || "none";
    lastBestGfbPosition = best ? `${best.position.x},${best.position.y},${best.position.z}` : "none";
    const countElement = document.getElementById("minibia-bot-perf-gfb-candidates");
    const bestElement = document.getElementById("minibia-bot-perf-gfb-best-count");
    const targetElement = document.getElementById("minibia-bot-perf-gfb-target");
    const positionElement = document.getElementById("minibia-bot-perf-gfb-position");
    if (countElement) countElement.textContent = String(lastGfbCandidateCount);
    if (bestElement) bestElement.textContent = String(lastBestGfbCount);
    if (targetElement) targetElement.textContent = lastBestGfbTargetName;
    if (positionElement) positionElement.textContent = lastBestGfbPosition;
  }

  creatureScanTimerId = window.setInterval(scanVisibleCreatures, 250);
  panicScanTimerId = window.setInterval(runPanicScanner, 200);
  attackScanTimerId = window.setInterval(runAttackMonitor, 100);
  aoeScanTimerId = window.setInterval(runAoeScanner, 100);
  cavebotScanTimerId = window.setInterval(runCavebotMonitor, 100);
  healingScanTimerId = window.setInterval(runHealingMonitor, 100);
  xrayScanTimerId = window.setInterval(runXrayMonitor, 100);
  gfbScanTimerId = window.setInterval(runGfbMonitor, 100);

  scanVisibleCreatures();
  runPanicScanner();
  runAttackMonitor();
  runAoeScanner();
  runCavebotMonitor();
  runHealingMonitor();
  runXrayMonitor();
  runGfbMonitor();

  window.minibiaBot = {
    status: () => ({
      mode: "core-creature-panic-attack-aoe-cavebot-healing-xray-and-gfb-monitor-performance-test",
      reconnectWatcher: false,
      visibleCreatureScanner: true,
      panicScanner: true,
      attackMonitor: true,
      aoeScanner: true,
      cavebotMonitor: true,
      healingMonitor: true,
      xrayMonitor: true,
      gfbMonitor: true,
      gfbScanIntervalMs: 100,
      visibleCreatureCount: lastVisibleCount,
      visiblePlayerCount: lastVisiblePlayerCount,
      attackCandidateCount: lastAttackCandidateCount,
      selectedTargetName: lastSelectedTargetName,
      squareCount: lastSquareCount,
      waypointDistance: lastWaypointDistance,
      pathCandidateCount: lastPathCandidateCount,
      bestStep: lastBestStep,
      health: lastHealth,
      mana: lastMana,
      healthPercent: lastHealthPercent,
      manaPercent: lastManaPercent,
      healingDecision: lastHealingDecision,
      xrayTotal: lastXrayTotal,
      xraySameFloor: lastXraySameFloor,
      xrayOtherFloors: lastXrayOtherFloors,
      xrayPlayers: lastXrayPlayers,
      xrayMonsters: lastXrayMonsters,
      gfbCandidateCount: lastGfbCandidateCount,
      bestGfbCount: lastBestGfbCount,
      bestGfbTargetName: lastBestGfbTargetName,
      bestGfbPosition: lastBestGfbPosition,
      lastDamageMessage,
    }),
    destroy() {
      [creatureScanTimerId, panicScanTimerId, attackScanTimerId, aoeScanTimerId, cavebotScanTimerId, healingScanTimerId, xrayScanTimerId, gfbScanTimerId]
        .forEach((timerId) => { if (timerId != null) window.clearInterval(timerId); });
      creatureScanTimerId = panicScanTimerId = attackScanTimerId = aoeScanTimerId = null;
      cavebotScanTimerId = healingScanTimerId = xrayScanTimerId = gfbScanTimerId = null;
      document.getElementById(panelId)?.remove();
    },
  };

  const panel = document.createElement("div");
  panel.id = panelId;
  panel.style.cssText = [
    "position:fixed", "top:12px", "right:12px", "z-index:2147483647",
    "padding:12px 14px", "border:2px solid #f4b400", "border-radius:8px",
    "background:#151515", "color:#fff", "font:14px/1.4 Arial,sans-serif",
    "box-shadow:0 4px 18px rgba(0,0,0,.45)", "max-width:360px",
  ].join(";");
  panel.innerHTML = `
    <div style="font-weight:700">FPS TEST — GFB TARGETING MONITOR</div>
    <div style="margin-top:4px;font-size:12px">Previous scanners remain active. Reconnect watcher is off.</div>
    <div style="margin-top:4px;font-size:12px">GFB 1-5-5-7-5-5-1 targeting calculations run every 100 ms. No hotkey is pressed and nothing is cast.</div>
    <div style="margin-top:4px;font-size:12px">Visible creatures: <span id="minibia-bot-perf-visible-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Visible players: <span id="minibia-bot-perf-player-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Attack candidates: <span id="minibia-bot-perf-attack-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Selected target: <span id="minibia-bot-perf-target-name">none</span></div>
    <div style="margin-top:4px;font-size:12px">Square AoE count: <span id="minibia-bot-perf-square-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Waypoint distance: <span id="minibia-bot-perf-waypoint-distance">none</span></div>
    <div style="margin-top:4px;font-size:12px">Path candidates: <span id="minibia-bot-perf-path-count">0</span>, best step: <span id="minibia-bot-perf-best-step">none</span></div>
    <div style="margin-top:4px;font-size:12px">Health: <span id="minibia-bot-perf-health">0</span>, mana: <span id="minibia-bot-perf-mana">0</span></div>
    <div style="margin-top:4px;font-size:12px">Healing decision: <span id="minibia-bot-perf-heal-decision">none</span></div>
    <div style="margin-top:4px;font-size:12px">X-ray total: <span id="minibia-bot-perf-xray-total">0</span>; same floor: <span id="minibia-bot-perf-xray-same-floor">0</span>; other floors: <span id="minibia-bot-perf-xray-other-floors">0</span></div>
    <div style="margin-top:4px;font-size:12px">X-ray players: <span id="minibia-bot-perf-xray-players">0</span>; monsters: <span id="minibia-bot-perf-xray-monsters">0</span></div>
    <div style="margin-top:4px;font-size:12px">GFB candidates: <span id="minibia-bot-perf-gfb-candidates">0</span></div>
    <div style="margin-top:4px;font-size:12px">Best GFB hits: <span id="minibia-bot-perf-gfb-best-count">0</span>; target: <span id="minibia-bot-perf-gfb-target">none</span></div>
    <div style="margin-top:4px;font-size:12px">Best GFB position: <span id="minibia-bot-perf-gfb-position">none</span></div>
  `;
  document.body.appendChild(panel);

  console.log("[PERF TEST] GFB targeting monitor added; no hotkey presses, clicks, items, or spells are used.");
})();