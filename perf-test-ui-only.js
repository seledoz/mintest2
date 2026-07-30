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

  window.minibiaBot = {
    status: () => ({ mode: "core-without-reconnect-watcher-performance-test" }),
    destroy() {
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
    <div style="font-weight:700">FPS TEST — CORE, WATCHER OFF</div>
    <div style="margin-top:4px;font-size:12px">Reconnect watcher is disabled. Other feature modules and scanners are not loaded.</div>
  `;
  document.body.appendChild(panel);

  console.log("[PERF TEST] Core test loaded with reconnect watcher disabled.");
})();