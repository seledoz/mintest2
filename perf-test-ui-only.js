(() => {
  const panelId = "minibia-bot-perf-test-panel";

  if (window.minibiaBot?.destroy) {
    try { window.minibiaBot.destroy(); } catch (error) {
      console.warn("[PERF TEST] Previous cleanup failed", error);
    }
  }
  document.getElementById("minibia-bot-panel")?.remove();
  document.getElementById(panelId)?.remove();

  const timers = [];
  const foodIds = new Set([2666,2667,2668,2669,2670,2671,2672,2673,2674,2675,2676,2677,2678,2679,2680,2681,2682,2683,2684,2685,2686,2687,2688,2689,2690,2691,2695,2696]);
  const result = {
    foodContainers: 0,
    foodItems: 0,
    autoEatDecision: "none",
    paralyzed: false,
    antiParalyzeDecision: "none",
    invisibleDecision: "none",
    magicShieldDecision: "none",
  };

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };

  function getPlayer() {
    return window.gameClient?.player || {};
  }

  function getPlayerState() {
    return getPlayer().state || {};
  }

  function getOpenContainers() {
    const manager = window.gameClient?.interface?.containerManager || window.gameClient?.containerManager;
    const raw = manager?.containers || manager?.__containers || window.gameClient?.containers || {};
    return Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw || {}).filter(Boolean);
  }

  function getContainerItems(container) {
    const raw = container?.items || container?.__items || container?.contents || container?.__contents || [];
    return Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw || {}).filter(Boolean);
  }

  function getItemId(item) {
    return Number(item?.id ?? item?.typeId ?? item?.itemId ?? item?.type?.id);
  }

  function runAutoEatMonitor() {
    const containers = getOpenContainers();
    let foodCount = 0;
    containers.forEach((container) => {
      getContainerItems(container).forEach((item) => {
        if (foodIds.has(getItemId(item))) foodCount += 1;
      });
    });
    result.foodContainers = containers.length;
    result.foodItems = foodCount;
    result.autoEatDecision = foodCount > 0 ? "food available" : "no food found";
    setText("minibia-bot-perf-food-containers", result.foodContainers);
    setText("minibia-bot-perf-food-count", result.foodItems);
    setText("minibia-bot-perf-auto-eat-decision", result.autoEatDecision);
  }

  function detectParalyzed() {
    const player = getPlayer();
    const state = getPlayerState();
    if ([state.paralyzed, state.isParalyzed, player.paralyzed, player.isParalyzed].some((value) => value === true)) return true;
    const conditions = state.conditions || player.conditions || state.icons || player.icons || [];
    const values = Array.isArray(conditions) ? conditions : Object.values(conditions || {});
    return values.some((value) => /paraly/i.test(String(value?.name ?? value?.type ?? value)));
  }

  // FPS test only: nearby-monster safety scanning is intentionally removed.
  function runAntiParalyzeMonitor() {
    result.paralyzed = detectParalyzed();
    result.antiParalyzeDecision = result.paralyzed ? "eligible (safety off)" : "not paralyzed";
    setText("minibia-bot-perf-paralyzed", result.paralyzed ? "yes" : "no");
    setText("minibia-bot-perf-anti-paralyze-decision", result.antiParalyzeDecision);
  }

  // FPS test only: visible-player and active-target safety scanning is intentionally removed.
  function runDefensiveSpellMonitor() {
    const state = getPlayerState();
    const player = getPlayer();
    const health = Number(state.health ?? player.health ?? 0);
    const maxHealth = Number(state.maxHealth ?? state.healthMax ?? player.maxHealth ?? player.healthMax ?? 0);
    const healthPercent = maxHealth > 0 ? Math.round((health / maxHealth) * 100) : null;
    result.invisibleDecision = "eligible (safety off)";
    result.magicShieldDecision = healthPercent !== null && healthPercent <= 70 ? "eligible" : "not needed";
    setText("minibia-bot-perf-invisible-decision", result.invisibleDecision);
    setText("minibia-bot-perf-shield-decision", result.magicShieldDecision);
  }

  function schedule(fn, interval) {
    timers.push(window.setInterval(fn, interval));
    fn();
  }

  schedule(runAutoEatMonitor, 100);
  schedule(runAntiParalyzeMonitor, 100);
  schedule(runDefensiveSpellMonitor, 100);

  window.minibiaBot = {
    status: () => ({
      mode: "three-feature-fps-test-safety-scanners-off",
      reconnectWatcher: false,
      autoEatMonitor: true,
      antiParalyzeMonitor: true,
      defensiveSpellMonitor: true,
      nearbyMonsterSafetyScanner: false,
      invisiblePlayerSafetyScanner: false,
      invisibleTargetSafetyScanner: false,
      ...result,
    }),
    destroy() {
      timers.forEach((timerId) => window.clearInterval(timerId));
      timers.length = 0;
      document.getElementById(panelId)?.remove();
    },
  };

  const panel = document.createElement("div");
  panel.id = panelId;
  panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483647;padding:12px 14px;border:2px solid #f4b400;border-radius:8px;background:#151515;color:#fff;font:14px/1.4 Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.45);max-width:390px";
  panel.innerHTML = `
    <div style="font-weight:700">FPS TEST — SAFETY SCANNERS OFF</div>
    <div style="margin-top:4px;font-size:12px">Only the 3 new feature monitors are running. Nothing is used or cast.</div>
    <div style="margin-top:4px;font-size:12px">Auto-eat containers: <span id="minibia-bot-perf-food-containers">0</span>; food items: <span id="minibia-bot-perf-food-count">0</span></div>
    <div style="margin-top:4px;font-size:12px">Auto-eat decision: <span id="minibia-bot-perf-auto-eat-decision">none</span></div>
    <div style="margin-top:4px;font-size:12px">Paralyzed: <span id="minibia-bot-perf-paralyzed">no</span>; anti-paralyze: <span id="minibia-bot-perf-anti-paralyze-decision">none</span></div>
    <div style="margin-top:4px;font-size:12px">Auto invisible: <span id="minibia-bot-perf-invisible-decision">none</span>; magic shield: <span id="minibia-bot-perf-shield-decision">none</span></div>`;
  document.body.appendChild(panel);
  console.log("[PERF TEST] Three-feature test loaded with safety scanners disabled.");
})();