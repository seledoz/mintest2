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
  let lastVisibleCount = 0;
  let lastVisiblePlayerCount = 0;
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

  function scanVisibleCreatures() {
    const me = getPlayerPosition();
    if (!me) {
      lastVisibleCount = 0;
      return [];
    }

    const myId = window.gameClient?.player?.id;
    const creatures = Object.values(window.gameClient?.world?.activeCreatures || {}).filter((creature) => {
      if (!creature || creature.id === myId) return false;
      return isWithinVisibleRange(me, creature.__position);
    });

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

    const currentHealth = Number(getPlayerState()?.health ?? 0);
    if (lastHealth == null) lastHealth = currentHealth;
    else lastHealth = currentHealth;

    lastDamageMessage = getLatestDamageMessage();

    const playersElement = document.getElementById("minibia-bot-perf-player-count");
    if (playersElement) playersElement.textContent = String(lastVisiblePlayerCount);
  }

  creatureScanTimerId = window.setInterval(scanVisibleCreatures, 250);
  panicScanTimerId = window.setInterval(runPanicScanner, 200);
  scanVisibleCreatures();
  runPanicScanner();

  window.minibiaBot = {
    status: () => ({
      mode: "core-creature-and-panic-scanner-performance-test",
      reconnectWatcher: false,
      visibleCreatureScanner: true,
      panicScanner: true,
      creatureScanIntervalMs: 250,
      panicScanIntervalMs: 200,
      visibleCreatureCount: lastVisibleCount,
      visiblePlayerCount: lastVisiblePlayerCount,
      lastHealth,
      lastDamageMessage,
    }),
    destroy() {
      if (creatureScanTimerId != null) window.clearInterval(creatureScanTimerId);
      if (panicScanTimerId != null) window.clearInterval(panicScanTimerId);
      creatureScanTimerId = null;
      panicScanTimerId = null;
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
    <div style="font-weight:700">FPS TEST — PANIC SCANNER</div>
    <div style="margin-top:4px;font-size:12px">Reconnect watcher is off. Creature scanning remains active.</div>
    <div style="margin-top:4px;font-size:12px">Panic-style player, health, and damage-message checks run every 200 ms.</div>
    <div style="margin-top:4px;font-size:12px">Visible creatures: <span id="minibia-bot-perf-visible-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Visible players: <span id="minibia-bot-perf-player-count">0</span></div>
  `;
  document.body.appendChild(panel);

  console.log("[PERF TEST] Panic scanner added; reconnect watcher disabled.");
})();