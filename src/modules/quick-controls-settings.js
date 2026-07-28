window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installQuickControlsSettingsModule = function installQuickControlsSettingsModule(bot) {
  if (!bot || bot.quickControlsSettings?.destroy) return bot?.quickControlsSettings;

  let observer = null;

  function clampHotbarSlot(value, fallback = 10) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 1 && numeric <= 12 ? numeric : fallback;
  }

  function clampManaCost(value, fallback = 600) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
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

  function installControls() {
    const runeToggle = document.getElementById("minibia-bot-rune-enabled");
    const eatToggle = document.getElementById("minibia-bot-auto-eat-enabled");
    const quickSection = runeToggle?.closest?.(".mb-section") || eatToggle?.closest?.(".mb-section");
    const stack = quickSection?.querySelector?.(".mb-stack");
    if (!stack) return false;

    if (!document.getElementById("minibia-bot-rune-settings")) {
      const runeSettings = document.createElement("div");
      runeSettings.id = "minibia-bot-rune-settings";
      runeSettings.className = "mb-stack";

      const spellInput = document.createElement("input");
      spellInput.type = "text";
      spellInput.id = "minibia-bot-rune-spell-words";
      spellInput.placeholder = "adori vita vis";
      spellInput.value = String(bot.rune?.config?.runeSpellWords || "adori vita vis");
      spellInput.addEventListener("change", () => {
        const runeSpellWords = spellInput.value.trim() || String(bot.rune?.config?.runeSpellWords || "adori vita vis");
        spellInput.value = runeSpellWords;
        bot.rune?.updateConfig?.({ runeSpellWords });
      });

      const manaInput = document.createElement("input");
      manaInput.type = "number";
      manaInput.id = "minibia-bot-rune-mana-cost";
      manaInput.min = "0";
      manaInput.step = "1";
      manaInput.value = String(clampManaCost(bot.rune?.config?.runeManaCost, 600));
      manaInput.addEventListener("change", () => {
        const runeManaCost = clampManaCost(manaInput.value, bot.rune?.config?.runeManaCost ?? 600);
        manaInput.value = String(runeManaCost);
        bot.rune?.updateConfig?.({ runeManaCost });
      });

      runeSettings.append(
        makeField("Rune Spell", spellInput),
        makeField("Rune Mana Cost", manaInput)
      );
      runeToggle?.closest?.("label")?.after(runeSettings);
    }

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
      if (installControls()) observer?.disconnect?.();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  bot.addCleanup?.(destroy);
  return bot.quickControlsSettings;
};
