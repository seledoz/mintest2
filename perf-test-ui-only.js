(() => {
  const repository = "seledoz/mintest2";
  const ref = "main";
  const rawBaseUrl = `https://raw.githubusercontent.com/${repository}/${ref}`;
  const panelId = "minibia-bot-perf-test-panel";

  async function loadSource(path) {
    const response = await fetch(`${rawBaseUrl}/${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
    const code = await response.text();
    window.eval(`\n//# sourceURL=${rawBaseUrl}/${path}\n${code}`);
  }

  async function run() {
    if (window.minibiaBot?.destroy) {
      try {
        window.minibiaBot.destroy();
      } catch (error) {
        console.warn("[PERF TEST] Previous bot cleanup failed", error);
      }
    }

    document.getElementById("minibia-bot-panel")?.remove();
    document.getElementById(panelId)?.remove();

    window.__minibiaBotBundle = {};
    await loadSource("src/version.js");
    await loadSource("src/core.js");

    const bot = window.__minibiaBotBundle.createBot();
    bot.status = () => ({ mode: "ui-only-performance-test" });
    window.minibiaBot = bot;

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
      "box-shadow:0 4px 18px rgba(0,0,0,.45)"
    ].join(";");
    panel.innerHTML = `
      <div style="font-weight:700">FPS TEST — UI ONLY</div>
      <div style="margin-top:4px;font-size:12px">No bot modules or scanners are running.</div>
    `;
    document.body.appendChild(panel);

    bot.addCleanup?.(() => panel.remove());
    console.log("[PERF TEST] UI-only mode loaded. No feature modules installed.");
    delete window.__minibiaBotBundle;
  }

  run().catch((error) => {
    console.error("[PERF TEST] Failed to load", error);
    alert(`FPS performance test failed: ${error.message || error}`);
  });
})();
