(() => {
  const SECTION_MARKER_ID = "minibia-bot-rune-hotkey-settings";

  function purgeLegacyRuneUi() {
    const wrapper = document.getElementById(SECTION_MARKER_ID);

    // Remove the legacy settings wrapper if an older Quick Controls instance recreated it.
    document.getElementById("minibia-bot-rune-settings")?.remove();

    // Remove any legacy Rune Spell row, regardless of which module injected it.
    document.querySelectorAll("#minibia-bot-panel .mb-field").forEach((field) => {
      if (wrapper?.contains(field)) return;
      const caption = field.querySelector(".mb-field-label");
      const text = String(caption?.textContent || "").trim().toLowerCase();
      if (text === "rune spell") field.remove();
    });

    // Keep exactly one Rune Mana Cost field: the one inside the new hotkey wrapper.
    document.querySelectorAll("#minibia-bot-panel .mb-field").forEach((field) => {
      if (wrapper?.contains(field)) return;
      const caption = field.querySelector(".mb-field-label");
      const text = String(caption?.textContent || "").trim().toLowerCase();
      if (text === "rune mana cost") field.remove();
    });

    // Also remove duplicate legacy inputs by id in case their label markup differs.
    document.querySelectorAll("#minibia-bot-rune-spell-words").forEach((input) => {
      if (!wrapper?.contains(input)) (input.closest("label") || input).remove();
    });
    document.querySelectorAll("#minibia-bot-rune-mana-cost").forEach((input) => {
      if (!wrapper?.contains(input)) (input.closest("label") || input).remove();
    });
  }

  function install() {
    const bot = window.minibiaBot;
    if (!bot?.rune) return false;

    purgeLegacyRuneUi();

    let wrapper = document.getElementById(SECTION_MARKER_ID);
    if (wrapper) {
      purgeLegacyRuneUi();
      return true;
    }

    const runeToggle = document.getElementById("minibia-bot-rune-enabled");
    const stack = runeToggle?.closest?.(".mb-stack");
    if (!runeToggle || !stack) return false;

    wrapper = document.createElement("div");
    wrapper.id = SECTION_MARKER_ID;
    wrapper.className = "mb-stack";
    wrapper.innerHTML = `
      <label class="mb-field">
        <span class="mb-field-label">Rune Hotbar Slot</span>
        <input type="number" id="minibia-bot-rune-hotbar-slot" min="1" max="12" step="1" />
      </label>
      <label class="mb-field">
        <span class="mb-field-label">Rune Mana Cost</span>
        <input type="number" id="minibia-bot-rune-mana-cost" min="0" step="1" />
      </label>
      <div class="mb-small-note" id="minibia-bot-rune-hotkey-status">Rune Maker: idle</div>
    `;

    runeToggle.closest("label")?.insertAdjacentElement("afterend", wrapper);
    purgeLegacyRuneUi();

    const slotInput = wrapper.querySelector("#minibia-bot-rune-hotbar-slot");
    const manaInput = wrapper.querySelector("#minibia-bot-rune-mana-cost");
    const statusLabel = wrapper.querySelector("#minibia-bot-rune-hotkey-status");

    function normalizeSlot(value) {
      return Math.min(12, Math.max(1, Math.trunc(Number(value) || 1)));
    }

    function refresh() {
      purgeLegacyRuneUi();

      const status = bot.rune.status?.();
      const cfg = status?.config || bot.rune.config || {};
      const gates = status?.gates || {};
      const mana = Number(status?.stats?.mana?.current ?? 0);

      slotInput.value = String(normalizeSlot(cfg.runeHotbarSlot));
      manaInput.value = String(Math.max(0, Math.trunc(Number(cfg.runeManaCost) || 0)));

      if (!status?.running) statusLabel.textContent = "Rune Maker: idle";
      else if (!gates.validHotbarSlot) statusLabel.textContent = "Rune Maker: invalid hotbar slot";
      else if (gates.pending) statusLabel.textContent = `Rune Maker: verifying slot ${cfg.runeHotbarSlot}`;
      else if (!gates.enoughHp) statusLabel.textContent = "Rune Maker: waiting for HP";
      else if (!gates.enoughMana) statusLabel.textContent = `Rune Maker: mana ${mana}/${cfg.runeManaCost}`;
      else if (!gates.cooldownReady) statusLabel.textContent = `Rune Maker: cooldown ${(Number(gates.cooldownRemainingMs || 0) / 1000).toFixed(1)}s`;
      else statusLabel.textContent = `Rune Maker: ready • slot ${cfg.runeHotbarSlot}`;
    }

    slotInput.addEventListener("change", () => {
      const runeHotbarSlot = normalizeSlot(slotInput.value);
      slotInput.value = String(runeHotbarSlot);
      bot.rune.updateConfig?.({ runeHotbarSlot });
      refresh();
    });

    manaInput.addEventListener("change", () => {
      const runeManaCost = Math.max(0, Math.trunc(Number(manaInput.value) || 0));
      manaInput.value = String(runeManaCost);
      bot.rune.updateConfig?.({ runeManaCost });
      refresh();
    });

    const timerId = window.setInterval(refresh, 250);
    bot.addCleanup?.(() => window.clearInterval(timerId));
    refresh();
    return true;
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 80) window.clearInterval(timerId);
  }, 250);

  // Keep a lightweight cleanup running briefly to catch late legacy injectors.
  let cleanupAttempts = 0;
  const cleanupTimer = window.setInterval(() => {
    cleanupAttempts += 1;
    purgeLegacyRuneUi();
    if (cleanupAttempts >= 80) window.clearInterval(cleanupTimer);
  }, 250);

  install();
})();