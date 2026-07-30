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
  let lastVisibleCount = 0;
  let lastVisiblePlayerCount = 0;
  let lastAttackCandidateCount = 0;
  let lastSelectedTargetName = null;
  let lastHealth = null;
  let lastDamageMessage = null;

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

    const candidates = getVisibleCreatures()
      .filter((creature) => creature?.type !== 0 && creature?.__position?.z === me.z)
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

  creatureScanTimerId = window.setInterval(scanVisibleCreatures, 250);
  panicScanTimerId = window.setInterval(runPanicScanner, 200);
  attackScanTimerId = window.setInterval(runAttackMonitor, 100);
  scanVisibleCreatures();
  runPanicScanner();
  runAttackMonitor();

  window.minibiaBot = {
    status: () => ({
      mode: "core-creature-panic-and-attack-monitor-performance-test",
      reconnectWatcher: false,
      visibleCreatureScanner: true,
      panicScanner: true,
      attackMonitor: true,
      creatureScanIntervalMs: 250,
      panicScanIntervalMs: 200,
      attackScanIntervalMs: 100,
      visibleCreatureCount: lastVisibleCount,
      visiblePlayerCount: lastVisiblePlayerCount,
      attackCandidateCount: lastAttackCandidateCount,
      selectedTargetName: lastSelectedTargetName,
      lastHealth,
      lastDamageMessage,
    }),
    destroy() {
      if (creatureScanTimerId != null) window.clearInterval(creatureScanTimerId);
      if (panicScanTimerId != null) window.clearInterval(panicScanTimerId);
      if (attackScanTimerId != null) window.clearInterval(attackScanTimerId);
      creatureScanTimerId = null;
      panicScanTimerId = null;
      attackScanTimerId = null;
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
    <div style="font-weight:700">FPS TEST — ATTACK MONITOR</div>
    <div style="margin-top:4px;font-size:12px">Reconnect watcher is off. Creature and panic scanners remain active.</div>
    <div style="margin-top:4px;font-size:12px">Auto-attack-style target scanning runs every 100 ms, but it will not attack.</div>
    <div style="margin-top:4px;font-size:12px">Visible creatures: <span id="minibia-bot-perf-visible-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Visible players: <span id="minibia-bot-perf-player-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Attack candidates: <span id="minibia-bot-perf-attack-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Selected target: <span id="minibia-bot-perf-target-name">none</span></div>
  `;
  document.body.appendChild(panel);

  console.log("[PERF TEST] Auto-attack monitor added; no attacks will be sent.");
})();