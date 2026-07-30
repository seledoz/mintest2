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

  let scanTimerId = null;
  let lastVisibleCount = 0;

  function getPlayerPosition() {
    return window.gameClient?.player?.getPosition?.() || null;
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

  scanTimerId = window.setInterval(scanVisibleCreatures, 250);
  scanVisibleCreatures();

  window.minibiaBot = {
    status: () => ({
      mode: "core-visible-creature-scanner-performance-test",
      reconnectWatcher: false,
      visibleCreatureScanner: true,
      scanIntervalMs: 250,
      visibleCreatureCount: lastVisibleCount,
    }),
    destroy() {
      if (scanTimerId != null) window.clearInterval(scanTimerId);
      scanTimerId = null;
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
    <div style="font-weight:700">FPS TEST — CREATURE SCANNER</div>
    <div style="margin-top:4px;font-size:12px">Reconnect watcher is off. Visible creatures are scanned every 250 ms.</div>
    <div style="margin-top:4px;font-size:12px">Visible creatures: <span id="minibia-bot-perf-visible-count">0</span></div>
  `;
  document.body.appendChild(panel);

  console.log("[PERF TEST] Visible creature scanner loaded; reconnect watcher disabled.");
})();