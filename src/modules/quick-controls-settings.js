window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installQuickControlsSettingsModule = function installQuickControlsSettingsModule(bot) {
  if (!bot || bot.quickControlsSettings?.destroy) return bot?.quickControlsSettings;

  let observer = null;

  function clampHotbarSlot(value, fallback = 10) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 1 && numeric <= 12 ? numeric : fallback;
  }

  function makeField(labelText, input) {
    const label = document.createElement("label");
    label.className = "mb-field";
    const caption = document.createElement("span");
    caption.className = "mb-field-label";
    caption.textContent = labelText;
    label.append(caption, input);
    return label;
  }

  function removeLegacyRuneControls() {
    document.getElementById("minibia-bot-rune-settings")?.remove();
    document.getElementById("minibia-bot-rune-spell-words")?.closest?.("label")?.remove();

    const legacyManaInputs = Array.from(document.querySelectorAll("#minibia-bot-rune-mana-cost"));
    if (legacyManaInputs.length > 1) {
      legacyManaInputs.slice(0, -1).forEach((input) => input.closest?.("label")?.remove());
    }
  }

  function installControls() {
    removeLegacyRuneControls();

    const eatToggle = document.getElementById("minibia-bot-auto-eat-enabled");
    const quickSection = eatToggle?.closest?.(".mb-section");
    const stack = quickSection?.querySelector?.(".mb-stack");
    if (!stack) return false;

    if (!document.getElementById("minibia-bot-auto-eat-settings")) {
      const eatSettings = document.createElement("div");
      eatSettings.id = "minibia-bot-auto-eat-settings";
      eatSettings.className = "mb-stack";

      const hotkeyInput = document.createElement("input");
      hotkeyInput.type = "number";
      hotkeyInput.id = "minibia-bot-auto-eat-hotkey";
      hotkeyInput.min = "1";
      hotkeyInput.max = "12";
      hotkeyInput.step = "1";
      hotkeyInput.value = String(clampHotbarSlot(bot.eat?.config?.eatHotbarSlot, 10));
      hotkeyInput.addEventListener("change", () => {
        const eatHotbarSlot = clampHotbarSlot(hotkeyInput.value, bot.eat?.config?.eatHotbarSlot ?? 10);
        hotkeyInput.value = String(eatHotbarSlot);
        bot.eat?.updateConfig?.({ eatHotbarSlot });
      });

      eatSettings.append(makeField("Food Hotkey", hotkeyInput));
      eatToggle?.closest?.("label")?.after(eatSettings);
    }

    return true;
  }

  function destroy() {
    observer?.disconnect?.();
    observer = null;
    document.getElementById("minibia-bot-rune-settings")?.remove();
    document.getElementById("minibia-bot-auto-eat-settings")?.remove();
  }

  bot.quickControlsSettings = { installControls, destroy };

  if (!installControls()) {
    observer = new MutationObserver(() => {
      removeLegacyRuneControls();
      if (installControls()) observer?.disconnect?.();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  bot.addCleanup?.(destroy);
  return bot.quickControlsSettings;
};
