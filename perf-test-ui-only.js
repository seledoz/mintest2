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

  const createBot = window.__minibiaBotBundle?.createBot;
  if (typeof createBot !== "function") {
    throw new Error("[PERF TEST] Core module was not loaded.");
  }

  window.minibiaBot = createBot();
  window.minibiaBot.status = () => ({ mode: "core-plus-ui-performance-test" });

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
    <div style="font-weight:700">FPS TEST — CORE + UI</div>
    <div style="margin-top:4px;font-size:12px">Core is running. Feature modules and scanners are not loaded.</div>
  `;
  document.body.appendChild(panel);

  const originalDestroy = window.minibiaBot.destroy.bind(window.minibiaBot);
  window.minibiaBot.destroy = function destroyPerfTest() {
    document.getElementById(panelId)?.remove();
    originalDestroy();
  };

  console.log("[PERF TEST] Core + UI stage loaded. No feature modules or scanners installed.");
})();