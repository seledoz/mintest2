(() => {
  // Use the SAME wrapper id as the inline fallback. That guarantees the two
  // implementations can never coexist. If the fallback got there first, this
  // module replaces it with the full UI below.
  const SECTION_MARKER_ID = "minibia-bot-rune-hotkey-inline";
  const MANA_INPUT_ID = "minibia-bot-rune-hotbar-mana-cost";
  const MANA_SAVE_ID = "minibia-bot-rune-hotbar-mana-save";

  function removeOtherRuneRows(wrapper) {
    const panel = document.getElementById("minibia-bot-panel");
    if (!panel) return;

    document.getElementById("minibia-bot-rune-settings")?.remove();

    panel.querySelectorAll(".mb-field").forEach((field) => {
      if (wrapper?.contains(field)) return;
      const label = String(field.querySelector?.(".mb-field-label")?.textContent || "")
        .trim()
        .toLowerCase();
      if (label === "rune spell" || label === "rune mana cost" || label === "rune hotbar slot") {
        field.remove();
      }
    });

    document.querySelectorAll("#minibia-bot-rune-spell-words, #minibia-bot-rune-mana-cost").forEach((input) => {
      if (!wrapper?.contains(input)) (input.closest("label") || input).remove();
    });

    // Remove the older dedicated wrapper if one survived from a previous load.
    const oldWrapper = document.getElementById("minibia-bot-rune-hotkey-settings");
    if (oldWrapper && oldWrapper !== wrapper) oldWrapper.remove();
  }

  function install() {
    const bot = window.minibiaBot;
    const runeToggle = document.getElementById("minibia-bot-rune-enabled");
    const stack = runeToggle?.closest?.(".mb-stack");
    if (!bot?.rune || !runeToggle || !stack) return false;

    let wrapper = document.getElementById(SECTION_MARKER_ID);

    // The old fallback used this same wrapper id but accidentally deleted its
    // own mana field. If that broken wrapper exists, replace it completely.
    if (wrapper && !wrapper.querySelector(`#${MANA_SAVE_ID}`)) {
      wrapper.remove();
      wrapper = null;
    }

    if (!wrapper) {
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

      const slotInput = wrapper.querySelector("#minibia-bot-rune-hotbar-slot");
      const manaInput = wrapper.querySelector(`#${MANA_INPUT_ID}`);
      const saveButton = wrapper.querySelector(`#${MANA_SAVE_ID}`);
      const savedLabel = wrapper.querySelector("#minibia-bot-rune-mana-saved");
      const statusLabel = wrapper.querySelector("#minibia-bot-rune-hotkey-status");

      const cfg = bot.rune.status?.()?.config || bot.rune.config || {};
      const normalizeSlot = (value) => Math.min(12, Math.max(1, Math.trunc(Number(value) || 1)));
      slotInput.value = String(normalizeSlot(cfg.runeHotbarSlot));
      manaInput.value = String(Math.max(0, Math.trunc(Number(cfg.runeManaCost) || 0)));
      savedLabel.textContent = `Saved mana cost: ${manaInput.value}`;

      function refreshStatus() {
        const status = bot.rune.status?.();
        const currentCfg = status?.config || bot.rune.config || {};
        const gates = status?.gates || {};
        const mana = Number(status?.stats?.mana?.current ?? 0);

        if (!status?.running) statusLabel.textContent = "Rune Maker: idle";
        else if (!gates.validHotbarSlot) statusLabel.textContent = "Rune Maker: invalid hotbar slot";
        else if (gates.pending) statusLabel.textContent = `Rune Maker: verifying slot ${currentCfg.runeHotbarSlot}`;
        else if (!gates.enoughHp) statusLabel.textContent = "Rune Maker: waiting for HP";
        else if (!gates.enoughMana) statusLabel.textContent = `Rune Maker: mana ${mana}/${currentCfg.runeManaCost}`;
        else if (!gates.cooldownReady) statusLabel.textContent = `Rune Maker: cooldown ${(Number(gates.cooldownRemainingMs || 0) / 1000).toFixed(1)}s`;
        else statusLabel.textContent = `Rune Maker: ready • slot ${currentCfg.runeHotbarSlot}`;
      }

      slotInput.addEventListener("change", () => {
        const value = normalizeSlot(slotInput.value);
        slotInput.value = String(value);
        bot.rune.updateConfig?.({ runeHotbarSlot: value });
        refreshStatus();
      });

      // User owns this field until Save is pressed. No timer writes into it.
      manaInput.addEventListener("input", () => {
        const filtered = String(manaInput.value || "").replace(/\D+/g, "");
        if (manaInput.value !== filtered) manaInput.value = filtered;
      });

      function saveMana() {
        const raw = String(manaInput.value || "").trim();
        if (!/^\d+$/.test(raw)) {
          savedLabel.textContent = "Enter a whole-number mana cost, then press Save.";
          return;
        }
        const value = Math.max(0, Math.trunc(Number(raw)));
        bot.rune.updateConfig?.({ runeManaCost: value });
        manaInput.value = String(value);
        savedLabel.textContent = `Saved mana cost: ${value}`;
        refreshStatus();
      }

      saveButton.addEventListener("click", saveMana);
      manaInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveMana();
          manaInput.blur();
        }
      });

      const statusTimer = window.setInterval(refreshStatus, 250);
      bot.addCleanup?.(() => window.clearInterval(statusTimer));
      refreshStatus();
    }

    removeOtherRuneRows(wrapper);
    return true;
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    install();
    if (attempts >= 120) window.clearInterval(timer);
  }, 250);

  install();
})();
