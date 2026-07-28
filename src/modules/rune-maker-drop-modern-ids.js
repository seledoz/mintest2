(() => {
  const MODERN_BLANK_RUNE_ID = 3147;
  const MODERN_RUNE_ID_MIN = 3148;
  const MODERN_RUNE_ID_MAX = 3200;
  const SCAN_MS = 500;

  let scanTimerId = null;
  let attachedBot = null;

  function getItem(container, slot) {
    try {
      return container?.peekItem?.(slot) ||
        container?.getSlotItem?.(slot) ||
        container?.slots?.[slot]?.item ||
        null;
    } catch (_) {
      return null;
    }
  }

  function getContainers() {
    const player = window.gameClient?.player;
    const containers = [];
    const seen = new Set();
    const add = (container) => {
      if (!container || seen.has(container)) return;
      seen.add(container);
      containers.push(container);
    };

    if (typeof player?.getContainer === "function") {
      for (let index = 0; index < 256; index += 1) {
        try { add(player.getContainer(index)); } catch (_) {}
      }
    }

    const opened = player?.__openedContainers || player?.openedContainers;
    if (opened) {
      const values = Array.isArray(opened)
        ? opened
        : typeof opened.values === "function"
          ? Array.from(opened.values())
          : Object.values(opened);
      values.forEach(add);
    }

    return containers;
  }

  function markModernRunes() {
    for (const container of getContainers()) {
      const slotCount = Number(container?.slots?.length ?? container?.size ?? 0);
      for (let slot = 0; slot < slotCount; slot += 1) {
        const item = getItem(container, slot);
        const id = Number(item?.id);
        if (!item || !Number.isFinite(id)) continue;

        if (id === MODERN_BLANK_RUNE_ID) {
          item.name = "blank rune";
        } else if (id >= MODERN_RUNE_ID_MIN && id <= MODERN_RUNE_ID_MAX) {
          item.name = item.name || "rune";
        }
      }
    }
  }

  function scannerEnabled() {
    return !!attachedBot?.runeMakerDrop?.config?.enabled;
  }

  function stopScanner() {
    if (scanTimerId != null) window.clearTimeout(scanTimerId);
    scanTimerId = null;
  }

  function scheduleScanner() {
    if (!scannerEnabled() || scanTimerId != null) return;
    scanTimerId = window.setTimeout(() => {
      scanTimerId = null;
      if (!scannerEnabled()) return;
      markModernRunes();
      scheduleScanner();
    }, SCAN_MS);
  }

  function syncScanner() {
    if (scannerEnabled()) {
      markModernRunes();
      scheduleScanner();
    } else {
      stopScanner();
    }
  }

  function attach() {
    const bot = window.minibiaBot;
    const runeDrop = bot?.runeMakerDrop;
    if (!bot || !runeDrop) return false;
    if (runeDrop.__disabledTimerOptimizationInstalled) {
      attachedBot = bot;
      syncScanner();
      return true;
    }

    attachedBot = bot;
    runeDrop.__disabledTimerOptimizationInstalled = true;

    const originalStart = runeDrop.start?.bind(runeDrop);
    const originalStop = runeDrop.stop?.bind(runeDrop);
    const originalUpdateConfig = runeDrop.updateConfig?.bind(runeDrop);

    runeDrop.start = (...args) => {
      const result = originalStart?.(...args);
      syncScanner();
      return result;
    };

    runeDrop.stop = (...args) => {
      const result = originalStop?.(...args);
      stopScanner();
      return result;
    };

    runeDrop.updateConfig = (...args) => {
      const result = originalUpdateConfig?.(...args);
      syncScanner();
      return result;
    };

    // The original module starts a 500 ms UI/capacity loop even while disabled.
    // Stop that loop once after installation; the checkbox still calls start().
    if (!runeDrop.config?.enabled) {
      originalStop?.({ persistEnabled: false });
    }

    syncScanner();
    bot.addCleanup?.(() => stopScanner());
    return true;
  }

  let attempts = 0;
  const attachTimerId = window.setInterval(() => {
    attempts += 1;
    if (attach() || attempts >= 40) window.clearInterval(attachTimerId);
  }, 250);
  attach();

  console.log("[minibia-bot] rune scanners sleep while Rune Maker Drop is disabled", {
    blankRune: MODERN_BLANK_RUNE_ID,
    runeRange: [MODERN_RUNE_ID_MIN, MODERN_RUNE_ID_MAX],
  });
})();