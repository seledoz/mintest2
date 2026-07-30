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

  const reconnectButtonSelectors = [
    "button",
    '[role="button"]',
    'input[type="button"]',
    'input[type="submit"]',
    "a",
    ".button",
    ".btn",
  ];

  let reconnectObserver = null;
  let reconnectPollTimerId = null;
  let lastReconnectClickAt = 0;

  function normalizeUiText(text) {
    return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function getElementUiText(element) {
    if (!(element instanceof Element)) return "";
    return normalizeUiText(
      element.textContent ||
      element.innerText ||
      element.getAttribute("value") ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    );
  }

  function findReconnectElement() {
    for (const selector of reconnectButtonSelectors) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (isVisibleElement(candidate) && getElementUiText(candidate) === "reconnect") {
          return candidate;
        }
      }
    }
    return null;
  }

  function runReconnectCheck() {
    try {
      const now = Date.now();
      if (now - lastReconnectClickAt < 3000) return;
      const reconnectElement = findReconnectElement();
      if (!reconnectElement) return;
      reconnectElement.click();
      lastReconnectClickAt = now;
      console.log("[PERF TEST] clicked reconnect");
    } catch (error) {
      console.error("[PERF TEST] reconnect watcher failed", error);
    }
  }

  reconnectObserver = new MutationObserver(runReconnectCheck);
  reconnectObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "value"],
  });
  reconnectPollTimerId = window.setInterval(runReconnectCheck, 2000);
  runReconnectCheck();

  window.minibiaBot = {
    status: () => ({ mode: "core-reconnect-watcher-performance-test" }),
    destroy() {
      reconnectObserver?.disconnect();
      reconnectObserver = null;
      if (reconnectPollTimerId) window.clearInterval(reconnectPollTimerId);
      reconnectPollTimerId = null;
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
    <div style="font-weight:700">FPS TEST — CORE WATCHER + UI</div>
    <div style="margin-top:4px;font-size:12px">Reconnect watcher is running. Other feature modules and scanners are not loaded.</div>
  `;
  document.body.appendChild(panel);

  console.log("[PERF TEST] Core reconnect watcher + UI loaded.");
})();