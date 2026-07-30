(() => {
  const panelId = "minibia-bot-perf-test-panel";

  if (window.minibiaBot?.destroy) {
    try {
      window.minibiaBot.destroy();
    } catch (error) {
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
  let lastVisibleCount = 0;
  let lastVisiblePlayerCount = 0;
  let lastAttackCandidateCount = 0;
  let lastSelectedTargetName = null;
  let lastSquareCount = 0;
  let lastGfbCount = 0;
  let lastWaypointDistance = null;
  let lastPathCandidateCount = 0;
  let lastBestStep = "none";
  let lastHealth = null;
  let lastDamageMessage = null;

  const testWaypointOffset = { x: 6, y: 4 };

  function getPlayerPosition() {
    return window.gameClient?.player?.getPosition?.() || null;
  }

  function getPlayerState() {
    return window.gameClient?.player?.state || null;
  }

  function isWithinVisibleRange(me, pos) {
    if (!me || !pos) return false;
    return Math.abs(pos.x - me.x) <= 8 && Math.abs(pos.y - me.y) <= 6;
  }

  function getVisibleCreatures() {
    const me = getPlayerPosition();
    if (!me) return [];

    const myId = window.gameClient?.player?.id;
    return Object.values(window.gameClient?.world?.activeCreatures || {}).filter((creature) => {
      if (!creature || creature.id === myId) return false;
      return isWithinVisibleRange(me, creature.__position);
    });
  }

  function getVisibleMonstersSameFloor() {
    const me = getPlayerPosition();
    if (!me) return [];
    return getVisibleCreatures().filter(
      (creature) => creature?.type !== 0 && creature?.__position?.z === me.z
    );
  }

  function scanVisibleCreatures() {
    const creatures = getVisibleCreatures();
    lastVisibleCount = creatures.length;
    const countElement = document.getElementById("minibia-bot-perf-visible-count");
    if (countElement) countElement.textContent = String(lastVisibleCount);
    return creatures;
  }

  function getLatestDamageMessage() {
    const channels = window.gameClient?.interface?.channelManager?.channels || [];
    let latest = null;

    for (const channel of channels) {
      const entries = channel?.__contents || [];
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const message = String(entries[index]?.message || "");
        if (/^You lose\s+\d+\s+hitpoints\s+due to an attack by\s+.+?\.$/i.test(message)) {
          latest = message;
          break;
        }
      }
      if (latest) break;
    }

    return latest;
  }

  function runPanicScanner() {
    const me = getPlayerPosition();
    const visibleCreatures = scanVisibleCreatures();

    lastVisiblePlayerCount = visibleCreatures.filter((creature) => {
      const z = Number(creature?.__position?.z);
      return creature?.type === 0 && me && Number.isFinite(z) && Math.abs(z - me.z) <= 1;
    }).length;

    lastHealth = Number(getPlayerState()?.health ?? 0);
    lastDamageMessage = getLatestDamageMessage();

    const playersElement = document.getElementById("minibia-bot-perf-player-count");
    if (playersElement) playersElement.textContent = String(lastVisiblePlayerCount);
  }

  function runAttackMonitor() {
    const me = getPlayerPosition();
    if (!me) {
      lastAttackCandidateCount = 0;
      lastSelectedTargetName = null;
      return;
    }

    const candidates = getVisibleMonstersSameFloor()
      .map((creature) => {
        const pos = creature.__position;
        const dx = Math.abs(pos.x - me.x);
        const dy = Math.abs(pos.y - me.y);
        return {
          creature,
          distance: Math.max(dx, dy),
          name: String(creature.name || "Mob"),
        };
      })
      .sort((left, right) => {
        if (left.distance !== right.distance) return left.distance - right.distance;
        return left.name.localeCompare(right.name);
      });

    lastAttackCandidateCount = candidates.length;
    lastSelectedTargetName = candidates[0]?.name || null;

    const candidateElement = document.getElementById("minibia-bot-perf-attack-count");
    const targetElement = document.getElementById("minibia-bot-perf-target-name");
    if (candidateElement) candidateElement.textContent = String(lastAttackCandidateCount);
    if (targetElement) targetElement.textContent = lastSelectedTargetName || "none";
  }

  function countSquareAround(me, monsters) {
    return monsters.filter((monster) => {
      const pos = monster?.__position;
      if (!pos) return false;
      return Math.abs(pos.x - me.x) <= 1 && Math.abs(pos.y - me.y) <= 1;
    }).length;
  }

  function countBestGfb(monsters) {
    let best = 0;
    for (const center of monsters) {
      const centerPos = center?.__position;
      if (!centerPos) continue;
      let count = 0;
      for (const monster of monsters) {
        const pos = monster?.__position;
        if (!pos) continue;
        if (Math.max(Math.abs(pos.x - centerPos.x), Math.abs(pos.y - centerPos.y)) <= 2) count += 1;
      }
      if (count > best) best = count;
    }
    return best;
  }

  function runAoeScanner() {
    const me = getPlayerPosition();
    if (!me) {
      lastSquareCount = 0;
      lastGfbCount = 0;
      return;
    }

    const monsters = getVisibleMonstersSameFloor();
    lastSquareCount = countSquareAround(me, monsters);
    lastGfbCount = countBestGfb(monsters);

    const squareElement = document.getElementById("minibia-bot-perf-square-count");
    const gfbElement = document.getElementById("minibia-bot-perf-gfb-count");
    if (squareElement) squareElement.textContent = String(lastSquareCount);
    if (gfbElement) gfbElement.textContent = String(lastGfbCount);
  }

  function runCavebotMonitor() {
    const me = getPlayerPosition();
    if (!me) {
      lastWaypointDistance = null;
      lastPathCandidateCount = 0;
      lastBestStep = "none";
      return;
    }

    const target = {
      x: me.x + testWaypointOffset.x,
      y: me.y + testWaypointOffset.y,
      z: me.z,
    };

    lastWaypointDistance = Math.max(Math.abs(target.x - me.x), Math.abs(target.y - me.y));

    const directions = [
      { name: "N", x: 0, y: -1 },
      { name: "NE", x: 1, y: -1 },
      { name: "E", x: 1, y: 0 },
      { name: "SE", x: 1, y: 1 },
      { name: "S", x: 0, y: 1 },
      { name: "SW", x: -1, y: 1 },
      { name: "W", x: -1, y: 0 },
      { name: "NW", x: -1, y: -1 },
    ];

    const occupied = new Set(
      getVisibleCreatures()
        .map((creature) => creature?.__position)
        .filter((pos) => pos && pos.z === me.z)
        .map((pos) => `${pos.x}:${pos.y}`)
    );

    const candidates = directions
      .map((direction) => {
        const x = me.x + direction.x;
        const y = me.y + direction.y;
        return {
          ...direction,
          blocked: occupied.has(`${x}:${y}`),
          distance: Math.max(Math.abs(target.x - x), Math.abs(target.y - y)),
        };
      })
      .filter((step) => !step.blocked)
      .sort((left, right) => left.distance - right.distance);

    lastPathCandidateCount = candidates.length;
    lastBestStep = candidates[0]?.name || "none";

    const distanceElement = document.getElementById("minibia-bot-perf-waypoint-distance");
    const candidatesElement = document.getElementById("minibia-bot-perf-path-count");
    const stepElement = document.getElementById("minibia-bot-perf-best-step");
    if (distanceElement) distanceElement.textContent = String(lastWaypointDistance ?? "none");
    if (candidatesElement) candidatesElement.textContent = String(lastPathCandidateCount);
    if (stepElement) stepElement.textContent = lastBestStep;
  }

  creatureScanTimerId = window.setInterval(scanVisibleCreatures, 250);
  panicScanTimerId = window.setInterval(runPanicScanner, 200);
  attackScanTimerId = window.setInterval(runAttackMonitor, 100);
  aoeScanTimerId = window.setInterval(runAoeScanner, 100);
  cavebotScanTimerId = window.setInterval(runCavebotMonitor, 100);
  scanVisibleCreatures();
  runPanicScanner();
  runAttackMonitor();
  runAoeScanner();
  runCavebotMonitor();

  window.minibiaBot = {
    status: () => ({
      mode: "core-creature-panic-attack-aoe-and-cavebot-monitor-performance-test",
      reconnectWatcher: false,
      visibleCreatureScanner: true,
      panicScanner: true,
      attackMonitor: true,
      aoeScanner: true,
      cavebotMonitor: true,
      creatureScanIntervalMs: 250,
      panicScanIntervalMs: 200,
      attackScanIntervalMs: 100,
      aoeScanIntervalMs: 100,
      cavebotScanIntervalMs: 100,
      visibleCreatureCount: lastVisibleCount,
      visiblePlayerCount: lastVisiblePlayerCount,
      attackCandidateCount: lastAttackCandidateCount,
      selectedTargetName: lastSelectedTargetName,
      squareCount: lastSquareCount,
      gfbCount: lastGfbCount,
      waypointDistance: lastWaypointDistance,
      pathCandidateCount: lastPathCandidateCount,
      bestStep: lastBestStep,
      lastHealth,
      lastDamageMessage,
    }),
    destroy() {
      if (creatureScanTimerId != null) window.clearInterval(creatureScanTimerId);
      if (panicScanTimerId != null) window.clearInterval(panicScanTimerId);
      if (attackScanTimerId != null) window.clearInterval(attackScanTimerId);
      if (aoeScanTimerId != null) window.clearInterval(aoeScanTimerId);
      if (cavebotScanTimerId != null) window.clearInterval(cavebotScanTimerId);
      creatureScanTimerId = null;
      panicScanTimerId = null;
      attackScanTimerId = null;
      aoeScanTimerId = null;
      cavebotScanTimerId = null;
      document.getElementById(panelId)?.remove();
    },
  };

  const panel = document.createElement("div");
  panel.id = panelId;
  panel.style.cssText = [
    "position:fixed",
    "top:12px",
    "right:12px",
    "z-index:2147483647",
    "padding:12px 14px",
    "border:2px solid #f4b400",
    "border-radius:8px",
    "background:#151515",
    "color:#fff",
    "font:14px/1.4 Arial,sans-serif",
    "box-shadow:0 4px 18px rgba(0,0,0,.45)",
  ].join(";");
  panel.innerHTML = `
    <div style="font-weight:700">FPS TEST — CAVEBOT MONITOR</div>
    <div style="margin-top:4px;font-size:12px">Previous scanners remain active. Reconnect watcher is off.</div>
    <div style="margin-top:4px;font-size:12px">Waypoint distance and path-step checks run every 100 ms. It will not move.</div>
    <div style="margin-top:4px;font-size:12px">Visible creatures: <span id="minibia-bot-perf-visible-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Visible players: <span id="minibia-bot-perf-player-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Attack candidates: <span id="minibia-bot-perf-attack-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Selected target: <span id="minibia-bot-perf-target-name">none</span></div>
    <div style="margin-top:4px;font-size:12px">AoE counts — square: <span id="minibia-bot-perf-square-count">0</span>, GFB: <span id="minibia-bot-perf-gfb-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Waypoint distance: <span id="minibia-bot-perf-waypoint-distance">none</span></div>
    <div style="margin-top:4px;font-size:12px">Path candidates: <span id="minibia-bot-perf-path-count">0</span>, best step: <span id="minibia-bot-perf-best-step">none</span></div>
  `;
  document.body.appendChild(panel);

  console.log("[PERF TEST] Cavebot pathing monitor added; no movement commands will be sent.");
})();