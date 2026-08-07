(() => {
  const SECTION_ID = "minibia-bot-rune-hotkey-settings";
  const FALLBACK_ID = "minibia-bot-rune-hotkey-inline";
  const MANA_INPUT_ID = "minibia-bot-rune-hotbar-mana-cost";
  const MANA_SAVE_ID = "minibia-bot-rune-hotbar-mana-save";

  function ensureFallbackSentinel() {
    const existing = document.getElementById(FALLBACK_ID);
    if (existing && existing.dataset.runeUiSentinel === "true") return;
    if (existing) existing.remove();
    const sentinel = document.createElement("span");
    sentinel.id = FALLBACK_ID;
    sentinel.dataset.runeUiSentinel = "true";
    sentinel.hidden = true;
    document.documentElement.appendChild(sentinel);
  }

  function purgeDuplicates() {
    ensureFallbackSentinel();
    document.getElementById("minibia-bot-rune-settings")?.remove();

    const main = document.getElementById(SECTION_ID);
    document.querySelectorAll("#minibia-bot-panel .mb-field").forEach((field) => {
      if (main?.contains(field)) return;
      const label = String(field.querySelector(".mb-field-label")?.textContent || "").trim().toLowerCase();
      if (label === "rune spell" || label === "rune mana cost" || label === "rune hotbar slot") field.remove();
    });

    document.querySelectorAll("#minibia-bot-rune-spell-words, #minibia-bot-rune-mana-cost, #minibia-bot-rune-inline-slot, #minibia-bot-rune-inline-mana, #minibia-bot-rune-inline-save, #minibia-bot-rune-inline-saved").forEach((node) => {
      if (!main?.contains(node)) (node.closest("label") || node.closest(".mb-field") || node).remove();
    });
  }

  function install() {
    const bot = window.minibiaBot;
    const toggle = document.getElementById("minibia-bot-rune-enabled");
    const stack = toggle?.closest?.(".mb-stack");
    if (!bot?.rune || !toggle || !stack) return false;

    purgeDuplicates();

    let wrapper = document.getElementById(SECTION_ID);
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = SECTION_ID;
      wrapper.className = "mb-stack";
      wrapper.innerHTML = `
        <label class="mb-field">
          <span class="mb-field-label">Rune Hotbar Slot</span>
          <input type="number" id="minibia-bot-rune-hotbar-slot" min="1" max="12" step="1" />
        </label>
        <div class="mb-field">
          <span class="mb-field-label">Rune Mana Cost</span>
          <div class="mb-row">
            <input type="text" inputmode="numeric" autocomplete="off" id="${MANA_INPUT_ID}" />
            <button type="button" id="${MANA_SAVE_ID}">Save</button>
          </div>
        </div>
        <div class="mb-small-note" id="minibia-bot-rune-mana-saved"></div>
        <div class="mb-small-note" id="minibia-bot-rune-hotkey-status">Rune Maker: idle</div>
      `;
      toggle.closest("label")?.insertAdjacentElement("afterend", wrapper);

      const slotInput = wrapper.querySelector("#minibia-bot-rune-hotbar-slot");
      const manaInput = wrapper.querySelector(`#${MANA_INPUT_ID}`);
      const saveButton = wrapper.querySelector(`#${MANA_SAVE_ID}`);
      const savedLabel = wrapper.querySelector("#minibia-bot-rune-mana-saved");
      const cfg = bot.rune.status?.()?.config || bot.rune.config || {};

      const normalizeSlot = (value) => Math.min(12, Math.max(1, Math.trunc(Number(value) || 1)));
      slotInput.value = String(normalizeSlot(cfg.runeHotbarSlot));
      manaInput.value = String(Math.max(0, Math.trunc(Number(cfg.runeManaCost) || 0)));
      savedLabel.textContent = `Saved mana cost: ${manaInput.value}`;

      slotInput.addEventListener("change", () => {
        const value = normalizeSlot(slotInput.value);
        slotInput.value = String(value);
        bot.rune.updateConfig?.({ runeHotbarSlot: value });
      });

      manaInput.addEventListener("input", () => {
        manaInput.value = String(manaInput.value || "").replace(/\D+/g, "");
      });

      const saveMana = () => {
        const raw = String(manaInput.value || "").trim();
        if (!/^\d+$/.test(raw)) {
          savedLabel.textContent = "Enter a whole-number mana cost.";
          return;
        }
        const value = Math.max(0, Math.trunc(Number(raw)));
        bot.rune.updateConfig?.({ runeManaCost: value });
        manaInput.value = String(value);
        savedLabel.textContent = `Saved mana cost: ${value}`;
      };

      saveButton.addEventListener("click", saveMana);
      manaInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveMana();
          manaInput.blur();
        }
      });
    }

    purgeDuplicates();
    return true;
  }

  function refreshStatus() {
    purgeDuplicates();
    const bot = window.minibiaBot;
    const label = document.getElementById("minibia-bot-rune-hotkey-status");
    if (!bot?.rune || !label) return;
    const status = bot.rune.status?.();
    const cfg = status?.config || bot.rune.config || {};
    const gates = status?.gates || {};
    const mana = Number(status?.stats?.mana?.current ?? 0);
    if (!status?.running) label.textContent = "Rune Maker: idle";
    else if (!gates.validHotbarSlot) label.textContent = "Rune Maker: invalid hotbar slot";
    else if (gates.pending) label.textContent = `Rune Maker: verifying slot ${cfg.runeHotbarSlot}`;
    else if (!gates.enoughHp) label.textContent = "Rune Maker: waiting for HP";
    else if (!gates.enoughMana) label.textContent = `Rune Maker: mana ${mana}/${cfg.runeManaCost}`;
    else if (!gates.cooldownReady) label.textContent = `Rune Maker: cooldown ${(Number(gates.cooldownRemainingMs || 0) / 1000).toFixed(1)}s`;
    else label.textContent = `Rune Maker: ready • slot ${cfg.runeHotbarSlot}`;
  }

  let attempts = 0;
  const installTimer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 80) window.clearInterval(installTimer);
  }, 250);

  const cleanupTimer = window.setInterval(() => {
    install();
    refreshStatus();
  }, 250);

  window.setTimeout(() => window.clearInterval(cleanupTimer), 30000);
  install();
  refreshStatus();
})();
