window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installMaxLightModule = function installMaxLightModule(bot) {
  const configStorageKey = "minibiaBot.maxLight.config";
  const controlsId = "minibia-bot-max-light-section";
  const config = Object.assign(
    {
      enabled: false,
      level: 255,
      color: 215,
    },
    bot.storage.get(configStorageKey, {})
  );

  let timerId = null;
  let originalLight = null;
  let lastAppliedTarget = null;
  const originalCanvasFilters = new Map();

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getPlayer() {
    return window.gameClient?.player || window.gameClient?.world?.player || null;
  }

  function getGameCanvases() {
    return Array.from(document.querySelectorAll("canvas"))
      .filter((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return rect.width >= 200 && rect.height >= 150;
      });
  }

  function cloneLight(light) {
    if (!light || typeof light !== "object") return null;
    return {
      level: Number(light.level ?? light.intensity ?? light.amount ?? 0),
      color: Number(light.color ?? light.colour ?? 215),
    };
  }

  function captureOriginalLight(player) {
    if (originalLight || !player) return;
    originalLight = cloneLight(player.light || player.__light || player.state?.light);
  }

  function callLightSetter(player, level, color) {
    const setterEntries = [
      [player?.setLight, player],
      [player?.updateLight, player],
      [player?.setCreatureLight, player],
      [window.gameClient?.setPlayerLight, window.gameClient],
      [window.gameClient?.world?.setCreatureLight, window.gameClient?.world],
    ].filter(([setter]) => typeof setter === "function");

    for (const [setter, context] of setterEntries) {
      try {
        setter.call(context, { level, color });
        return true;
      } catch (firstError) {
        try {
          setter.call(context, level, color);
          return true;
        } catch (secondError) {}
      }
    }

    return false;
  }

  function assignLightObject(target, level, color) {
    if (!target || typeof target !== "object") return false;

    let changed = false;
    const keys = ["light", "__light"];
    keys.forEach((key) => {
      if (target[key] && typeof target[key] === "object") {
        if ("level" in target[key] || !("intensity" in target[key])) target[key].level = level;
        if ("intensity" in target[key]) target[key].intensity = level;
        if ("amount" in target[key]) target[key].amount = level;
        if ("color" in target[key] || !("colour" in target[key])) target[key].color = color;
        if ("colour" in target[key]) target[key].colour = color;
        changed = true;
      }
    });

    if (target.state?.light && typeof target.state.light === "object") {
      target.state.light.level = level;
      target.state.light.color = color;
      changed = true;
    }

    return changed;
  }

  function applyRendererLightFallback() {
    const canvases = getGameCanvases();
    if (!canvases.length) return false;

    canvases.forEach((canvas) => {
      if (!originalCanvasFilters.has(canvas)) {
        originalCanvasFilters.set(canvas, canvas.style.filter || "");
      }

      const originalFilter = originalCanvasFilters.get(canvas) || "";
      const withoutOldFallback = originalFilter
        .replace(/\s*brightness\([^)]*\)/gi, "")
        .replace(/\s*saturate\([^)]*\)/gi, "")
        .trim();
      canvas.style.filter = `${withoutOldFallback} brightness(1.6) saturate(1.08)`.trim();
    });

    return true;
  }

  function restoreRendererLightFallback() {
    for (const [canvas, filter] of originalCanvasFilters.entries()) {
      if (canvas?.isConnected) canvas.style.filter = filter;
    }
    originalCanvasFilters.clear();
  }

  function applyGameLight() {
    if (!config.enabled) return false;

    const player = getPlayer();
    const level = Math.max(1, Math.min(255, Number(config.level) || 255));
    const color = Math.max(0, Math.min(255, Number(config.color) || 215));
    let nativeApplied = false;

    if (player) {
      captureOriginalLight(player);
      const setterApplied = callLightSetter(player, level, color);
      const objectApplied = assignLightObject(player, level, color);
      lastAppliedTarget = player;
      nativeApplied = setterApplied || objectApplied;
    }

    const rendererApplied = applyRendererLightFallback();
    return nativeApplied || rendererApplied;
  }

  function restoreOriginalLight() {
    const player = lastAppliedTarget || getPlayer();
    let restored = false;

    if (player && originalLight) {
      callLightSetter(player, originalLight.level, originalLight.color);
      assignLightObject(player, originalLight.level, originalLight.color);
      restored = true;
    }

    restoreRendererLightFallback();
    originalLight = null;
    lastAppliedTarget = null;
    return restored;
  }

  function refreshControls() {
    const toggle = document.getElementById("minibia-bot-max-light-enabled");
    if (toggle) toggle.checked = !!config.enabled;
  }

  function startTimer() {
    if (timerId != null) return;
    applyGameLight();
    timerId = window.setInterval(applyGameLight, 250);
  }

  function stopTimer() {
    if (timerId == null) return;
    window.clearInterval(timerId);
    timerId = null;
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    config.enabled = !!config.enabled;
    config.level = Math.max(1, Math.min(255, Number(config.level) || 255));
    config.color = Math.max(0, Math.min(255, Number(config.color) || 215));
    persistConfig();

    if (config.enabled) {
      startTimer();
      applyGameLight();
    } else {
      stopTimer();
      restoreOriginalLight();
    }

    refreshControls();
    return { ...config };
  }

  function start() {
    return updateConfig({ enabled: true });
  }

  function stop() {
    return updateConfig({ enabled: false });
  }

  function toggle() {
    return updateConfig({ enabled: !config.enabled });
  }

  function injectControls() {
    if (document.getElementById(controlsId)) {
      refreshControls();
      return true;
    }

    const mainColumn = document.querySelector("#minibia-bot-panel .mb-main-column");
    if (!mainColumn) return false;

    const section = document.createElement("div");
    section.id = controlsId;
    section.className = "mb-section mb-column-section";
    section.innerHTML = `
      <div class="mb-label">Game Light</div>
      <div class="mb-stack">
        <label class="mb-toggle">
          <input type="checkbox" id="minibia-bot-max-light-enabled" />
          <span>Auto Light</span>
        </label>
        <div class="mb-small-note">Keeps the game view bright and retries the native player-light method.</div>
      </div>
    `;

    mainColumn.appendChild(section);
    section.querySelector("#minibia-bot-max-light-enabled")?.addEventListener("change", (event) => {
      updateConfig({ enabled: !!event.target.checked });
    });

    refreshControls();
    return true;
  }

  const controlsTimerId = window.setInterval(injectControls, 500);

  bot.addCleanup(() => {
    window.clearInterval(controlsTimerId);
    stopTimer();
    restoreOriginalLight();
    document.getElementById(controlsId)?.remove();
  });

  bot.maxLight = {
    start,
    stop,
    toggle,
    updateConfig,
    injectControls,
    config,
    status: () => ({ running: !!config.enabled, config: { ...config } }),
  };

  if (config.enabled) startTimer();
  window.setTimeout(injectControls, 0);
};