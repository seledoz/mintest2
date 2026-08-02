(() => {
  const MODERN_BLANK_RUNE_ID = 3147;
  const MODERN_RUNE_ID_MIN = 3148;
  const MODERN_RUNE_ID_MAX = 3200;

  function getItem(container, slot) {
    try {
      return container?.peekItem?.(slot) ||
        container?.getSlotItem?.(slot) ||
        container?.slots?.[slot]?.item ||
        container?.slots?.[slot] ||
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
          : typeof opened[Symbol.iterator] === "function"
            ? Array.from(opened)
            : Object.values(opened);
      values.forEach(add);
    }

    return containers;
  }

  function ensureContainerCompatibility(container) {
    if (!container || typeof container.getSlotItem === "function" || typeof container.peekItem !== "function") return;
    try {
      container.getSlotItem = (slot) => container.peekItem(slot);
    } catch (_) {}
  }

  function markModernRunes() {
    for (const container of getContainers()) {
      ensureContainerCompatibility(container);
      const slotCount = Number(
        container?.slots?.length ??
        container?.size ??
        container?.capacity ??
        container?.slotCount ??
        container?.getSize?.() ??
        40
      );

      for (let slot = 0; slot < slotCount; slot += 1) {
        const item = getItem(container, slot);
        const id = Number(
          item?.getId?.() ??
          item?.getID?.() ??
          item?.id ??
          item?.itemId ??
          item?.itemID ??
          item?.type?.id ??
          item?.data?.id
        );
        if (!item || !Number.isFinite(id)) continue;

        if (id === MODERN_BLANK_RUNE_ID) {
          try { item.name = "blank rune"; } catch (_) {}
        } else if (id >= MODERN_RUNE_ID_MIN && id <= MODERN_RUNE_ID_MAX) {
          try { item.name = item.name || "rune"; } catch (_) {}
        }
      }
    }
  }

  markModernRunes();
  const timerId = window.setInterval(markModernRunes, 500);

  let cleanupAttempts = 0;
  const cleanupTimerId = window.setInterval(() => {
    cleanupAttempts += 1;
    const bot = window.minibiaBot;
    if (!bot?.addCleanup) {
      if (cleanupAttempts >= 40) window.clearInterval(cleanupTimerId);
      return;
    }
    window.clearInterval(cleanupTimerId);
    bot.addCleanup(() => window.clearInterval(timerId));
  }, 250);

  console.log("[minibia-bot] Rune Maker Drop container compatibility enabled", {
    blankRune: MODERN_BLANK_RUNE_ID,
    runeRange: [MODERN_RUNE_ID_MIN, MODERN_RUNE_ID_MAX],
  });
})();