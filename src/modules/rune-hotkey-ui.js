(() => {
  const SECTION_MARKER_ID = "minibia-bot-rune-hotkey-settings";
  const MANA_INPUT_ID = "minibia-bot-rune-hotbar-mana-cost";
  const MANA_SAVE_ID = "minibia-bot-rune-hotbar-mana-save";

  function purgeLegacyRuneUi() {
    const wrapper = document.getElementById(SECTION_MARKER_ID);

    document.getElementById("minibia-bot-rune-settings")?.remove();

    document.querySelectorAll("#minibia-bot-panel .mb-field").forEach((field) => {
      if (wrapper?.contains(field)) return;
      const caption = field.querySelector(".mb-field-label");
      const text = String(caption?.textContent || "").trim().toLowerCase();
      if (text === "rune spell" || text === "rune mana cost") field.remove();
    });

    document.querySelectorAll("#minibia-bot-rune-spell-words").forEach((input) => {
      if (!wrapper?.contains(input)) (input.closest("label") || input).remove();
    });

    document.querySelectorAll("#minibia-bot-rune-mana-cost").forEach((input) => {
      (input.closest("label") || input).remove();
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
      <div class="mb-field">
        <span class="mb-field-label">Rune Mana Cost</span>
        <div class="mb-row">
          <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" id="${MANA_INPUT_ID}" />
          <button type="button" id="${MANA_SAVE_ID}">Save</button>
        </div>
      </div>
      <div class="mb-small-note" id="minibia-bot-rune-mana-saved"></div>
      <div class="mb-small-note" id="minibia-bot-rune-hotkey-status">Rune Maker: idle</div>
    `;

    runeToggle.closest("label")?.insertAdjacentElement("afterend", wrapper);
    purgeLegacyRuneUi();

    const slotInput = wrapper.querySelector("#minibia-bot-rune-hotbar-slot");
    const manaInput = wrapper.querySelector(`#${MANA_INPUT_ID}`);
    const manaSaveButton = wrapper.querySelector(`#${MANA_SAVE_ID}`);
    const manaSavedLabel = wrapper.querySelector("#minibia-bot-rune-mana-saved");
    const statusLabel = wrapper.querySelector("#minibia-bot-rune-hotkey-status");

    function normalizeSlot(value) {
      return Math.min(12, Math.max(1, Math.trunc(Number(value) || 1)));
    }

    function currentConfig() {
      return bot.rune.status?.()?.config || bot.rune.config || {};
    }

    const initialConfig = currentConfig();
    slotInput.value = String(normalizeSlot(initialConfig.runeHotbarSlot));
    manaInput.value = String(Math.max(0, Math.trunc(Number(initialConfig.runeManaCost) || 0)));
    manaSavedLabel.textContent = `Saved mana cost: ${Math.max(0, Math.trunc(Number(initialConfig.runeManaCost) || 0))}`;

    function refreshStatus() {
      purgeLegacyRuneUi();

      const status = bot.rune.status?.();
      const cfg = status?.config || bot.rune.config || {};
      const gates = status?.gates || {};
      const mana = Number(status?.stats?.mana?.current ?? 0);

      if (!status?.running) statusLabel.textContent = "Rune Maker: idle";
      else if (!gates.validHotbarSlot) statusLabel.textContent = "Rune Maker: invalid hotbar slot";
      else if (gates.pending) statusLabel.textContent = `Rune Maker: verifying slot ${cfg.runeHotbarSlot}`;
      else if (!gates.enoughHp) statusLabel.textContent = "Rune Maker: waiting for HP";
      else if (!gates.enoughMana) statusLabel.textContent = `Rune Maker: mana ${mana}/${cfg.runeManaCost}`;
      else if (!gates.cooldownReady) statusLabel.textContent = `Rune Maker: cooldown ${(Number(gates.cooldownRemainingMs || 0) / 1000).toFixed(1)}s`;
      else statusLabel.textContent = `Rune Maker: ready • slot ${cfg.runeHotbarSlot}`;
    }

    function saveManaCost() {
      const raw = String(manaInput.value ?? "").trim();
      if (!/^\d+$/.test(raw)) {
        manaSavedLabel.textContent = "Enter a whole-number mana cost, then tap Save.";
        return false;
      }

      const runeManaCost = Math.max(0, Math.trunc(Number(raw)));
      bot.rune.updateConfig?.({ runeManaCost });
      manaInput.value = String(runeManaCost);
      manaSavedLabel.textContent = `Saved mana cost: ${runeManaCost}`;
      refreshStatus();
      return true;
    }

    slotInput.addEventListener("change", () => {
      const runeHotbarSlot = normalizeSlot(slotInput.value);
      slotInput.value = String(runeHotbarSlot);
      bot.rune.updateConfig?.({ runeHotbarSlot });
      refreshStatus();
    });

    // Never mutate manaInput from a timer/change/blur handler. The user owns its
    // text until Save is explicitly pressed, which works reliably on mobile too.
    manaInput.addEventListener("input", () => {
      const filtered = String(manaInput.value || "").replace(/\D+/g, "");
      if (manaInput.value !== filtered) manaInput.value = filtered;
    });

    manaSaveButton.addEventListener("click", saveManaCost);
    manaInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveManaCost();
        manaInput.blur();
      }
    });

    const timerId = window.setInterval(refreshStatus, 250);
    bot.addCleanup?.(() => window.clearInterval(timerId));
    refreshStatus();
    return true;
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 80) window.clearInterval(timerId);
  }, 250);

  let cleanupAttempts = 0;
  const cleanupTimer = window.setInterval(() => {
    cleanupAttempts += 1;
    purgeLegacyRuneUi();
    if (cleanupAttempts >= 80) window.clearInterval(cleanupTimer);
  }, 250);

  install();
})();
