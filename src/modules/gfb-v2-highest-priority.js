window.__minibiaBotBundle = window.__minibiaBotBundle || {};

(function installGfbV2HighestPriorityCompatibility() {
  const storageKey = "minibiaBot.greatFireballV2.highestPriority";
  const checkboxId = "minibia-bot-gfb-v2-highest-priority";
  const noteId = "minibia-bot-gfb-v2-highest-priority-note";
  let installedBot = null;
  let originalClickHotbar = null;

  function loadEnabled() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
      return !!saved.enabled;
    } catch (_) {
      return false;
    }
  }

  function saveEnabled(enabled) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ enabled: !!enabled }));
    } catch (_) {}
  }

  function getSquare2Slot() {
    try {
      const saved = JSON.parse(window.localStorage.getItem("minibiaBot.attackAoe.square2.config") || "{}");
      const slot = Math.trunc(Number(saved.hotbarSlot));
      return Number.isFinite(slot) && slot >= 1 && slot <= 12 ? slot : null;
    } catch (_) {
      return null;
    }
  }

  function shouldReservePriority() {
    const bot = window.minibiaBot;
    const gfb = bot?.greatFireballV2;
    if (!bot || !gfb || !loadEnabled()) return false;
    let status = null;
    try { status = gfb.status?.() || null; } catch (_) { return false; }
    const config = status?.config || gfb.config || {};
    if (!status?.running || !config.enabled || !Number(config.hotbarSlot)) return false;
    return Number(status.bestMonsterCount || 0) >= Math.max(1, Number(config.minMonsters) || 4);
  }

  function getBlockedSlots(bot) {
    const slots = new Set();
    const add = (value) => {
      const slot = Math.trunc(Number(value));
      if (Number.isFinite(slot) && slot >= 1 && slot <= 12) slots.add(slot);
    };
    add(bot?.attack?.config?.runeHotbarSlot);
    add(bot?.attackAoe?.config?.spellHotbarSlot);
    add(getSquare2Slot());
    return slots;
  }

  function patchClickHotbar(bot) {
    if (!bot?.clickHotbar || bot.__gfbV2HighestPriorityClickPatched) return false;
    originalClickHotbar = bot.clickHotbar.bind(bot);
    bot.clickHotbar = function clickHotbarWithGfbPriority(index, ...args) {
      const attemptedSlot = Math.trunc(Number(index)) + 1;
      if (shouldReservePriority()) {
        const gfbSlot = Math.trunc(Number(bot.greatFireballV2?.config?.hotbarSlot));
        const blockedSlots = getBlockedSlots(bot);
        if (blockedSlots.has(attemptedSlot) && attemptedSlot !== gfbSlot) {
          bot.logDebug?.("blocked lower-priority cast for GFB 2.0", { slot: attemptedSlot, gfbSlot });
          return false;
        }
      }
      return originalClickHotbar(index, ...args);
    };
    bot.__gfbV2HighestPriorityClickPatched = true;
    return true;
  }

  function ensureUi(bot) {
    const enabledToggle = document.getElementById("minibia-bot-gfb-v2-enabled");
    const section = enabledToggle?.closest?.(".mb-section") || document.getElementById("minibia-bot-gfb-v2-section");
    if (!section) return false;

    let checkbox = document.getElementById(checkboxId);
    if (!checkbox) {
      const label = document.createElement("label");
      label.className = "mb-toggle";
      label.innerHTML = `<input type="checkbox" id="${checkboxId}" /><span>GFB Highest Priority</span>`;
      const enabledLabel = enabledToggle?.closest?.("label.mb-toggle") || enabledToggle?.parentElement;
      if (enabledLabel?.parentElement) enabledLabel.insertAdjacentElement("afterend", label);
      else section.prepend(label);
      checkbox = label.querySelector(`#${checkboxId}`);
      checkbox?.addEventListener("change", () => {
        saveEnabled(checkbox.checked);
        refreshUi();
      });
    }

    if (!document.getElementById(noteId)) {
      const note = document.createElement("div");
      note.className = "mb-small-note";
      note.id = noteId;
      note.textContent = "Highest Priority blocks the other two AoE hotkeys and the auto-attack rune while GFB 2.0 has enough creatures to cast, including while GFB is cooling down.";
      checkbox?.closest?.("label")?.insertAdjacentElement("afterend", note);
    }

    refreshUi();
    return true;
  }

  function refreshUi() {
    const checkbox = document.getElementById(checkboxId);
    if (checkbox) checkbox.checked = loadEnabled();
    const note = document.getElementById(noteId);
    if (note) note.dataset.priorityReserved = shouldReservePriority() ? "true" : "false";
  }

  function install() {
    const bot = window.minibiaBot;
    if (!bot?.greatFireballV2) return false;
    installedBot = bot;
    bot.greatFireballV2.shouldReservePriority = shouldReservePriority;
    patchClickHotbar(bot);
    ensureUi(bot);
    return true;
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    const ready = install();
    if (ready) refreshUi();
    if (attempts >= 80) window.clearInterval(timerId);
  }, 250);

  install();
})();
