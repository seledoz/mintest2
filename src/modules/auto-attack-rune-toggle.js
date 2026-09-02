window.__minibiaBotBundle = window.__minibiaBotBundle || {};

(() => {
  const STORAGE_KEY = "minibiaBot.attack.runeHotkeyToggle";
  const CHECKBOX_ID = "minibia-bot-auto-attack-rune-enabled";

  function readState(bot) {
    const stored = bot?.storage?.get?.(STORAGE_KEY, null);
    if (stored && typeof stored === "object") {
      return {
        enabled: stored.enabled !== false,
        savedSlot: Number.isFinite(Number(stored.savedSlot)) ? Math.trunc(Number(stored.savedSlot)) : null,
      };
    }
    return {
      enabled: true,
      savedSlot: Number.isFinite(Number(bot?.attack?.config?.runeHotbarSlot)) ? Math.trunc(Number(bot.attack.config.runeHotbarSlot)) : null,
    };
  }

  function writeState(bot, state) {
    bot?.storage?.set?.(STORAGE_KEY, {
      enabled: !!state.enabled,
      savedSlot: state.savedSlot || null,
    });
  }

  function normalizeSlot(value) {
    const slot = Math.trunc(Number(value));
    return slot >= 1 && slot <= 12 ? slot : null;
  }

  function installControl(bot) {
    const runeInput = document.getElementById("minibia-bot-auto-attack-rune-hotkey");
    const autoAttackToggle = document.getElementById("minibia-bot-auto-attack-enabled");
    if (!runeInput || !autoAttackToggle || !bot?.attack?.updateConfig) return false;

    const state = readState(bot);
    const configuredSlot = normalizeSlot(bot.attack?.config?.runeHotbarSlot);
    if (configuredSlot) state.savedSlot = configuredSlot;

    let checkbox = document.getElementById(CHECKBOX_ID);
    if (!checkbox) {
      const label = document.createElement("label");
      label.className = "mb-toggle";
      label.innerHTML = `<input type="checkbox" id="${CHECKBOX_ID}" /><span>Enable Rune Hotkey</span>`;
      const runeField = runeInput.closest?.(".mb-field");
      runeField?.insertAdjacentElement("afterend", label);
      checkbox = label.querySelector(`#${CHECKBOX_ID}`);
    }
    if (!checkbox) return false;

    checkbox.checked = !!state.enabled;

    if (state.enabled) {
      const slot = normalizeSlot(runeInput.value) || state.savedSlot;
      if (slot) {
        state.savedSlot = slot;
        runeInput.value = String(slot);
        bot.attack.updateConfig({ runeHotbarSlot: slot });
      }
    } else {
      const slot = normalizeSlot(runeInput.value) || configuredSlot || state.savedSlot;
      if (slot) state.savedSlot = slot;
      bot.attack.updateConfig({ runeHotbarSlot: null });
    }
    writeState(bot, state);

    if (checkbox.dataset.runeToggleBound !== "true") {
      checkbox.dataset.runeToggleBound = "true";
      checkbox.addEventListener("change", () => {
        state.enabled = checkbox.checked;
        const slot = normalizeSlot(runeInput.value) || state.savedSlot;

        if (state.enabled) {
          if (slot) {
            state.savedSlot = slot;
            runeInput.value = String(slot);
            bot.attack.updateConfig({ runeHotbarSlot: slot });
          } else {
            bot.attack.updateConfig({ runeHotbarSlot: null });
          }
        } else {
          if (slot) state.savedSlot = slot;
          bot.attack.updateConfig({ runeHotbarSlot: null });
        }
        writeState(bot, state);
      });
    }

    if (runeInput.dataset.runeToggleBound !== "true") {
      runeInput.dataset.runeToggleBound = "true";
      runeInput.addEventListener("change", () => {
        const slot = normalizeSlot(runeInput.value);
        state.savedSlot = slot;
        if (!state.enabled) {
          window.setTimeout(() => bot.attack.updateConfig({ runeHotbarSlot: null }), 0);
        }
        writeState(bot, state);
      });
    }

    return true;
  }

  function install(bot) {
    if (installControl(bot)) return;
    let attempts = 0;
    const timerId = window.setInterval(() => {
      attempts += 1;
      if (installControl(bot) || attempts >= 40) window.clearInterval(timerId);
    }, 250);
    bot?.addCleanup?.(() => window.clearInterval(timerId));
  }

  const bundle = window.__minibiaBotBundle;
  const originalInstallPanel = bundle.installPanel;
  if (typeof originalInstallPanel === "function" && !originalInstallPanel.__runeToggleWrapped) {
    const wrappedInstallPanel = function wrappedInstallPanel(bot) {
      const result = originalInstallPanel(bot);
      const originalInject = bot?.ui?.inject;
      if (typeof originalInject === "function" && !originalInject.__runeToggleWrapped) {
        const wrappedInject = function wrappedInject(...args) {
          const injectResult = originalInject.apply(this, args);
          install(bot);
          return injectResult;
        };
        wrappedInject.__runeToggleWrapped = true;
        bot.ui.inject = wrappedInject;
      }
      return result;
    };
    wrappedInstallPanel.__runeToggleWrapped = true;
    bundle.installPanel = wrappedInstallPanel;
  }
})();
