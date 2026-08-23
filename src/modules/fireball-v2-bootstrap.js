(() => {
  const bundle = window.__minibiaBotBundle || window.__minibiaBotReloadBundle || {};
  const SECTION_ID = "minibia-bot-fireball-v2-section";

  function getBot() {
    return window.minibiaBot || null;
  }

  function installModule() {
    const bot = getBot();
    if (!bot || typeof bundle.installFireballV2Module !== "function") return null;
    if (!bot.fireballV2?.destroy) bundle.installFireballV2Module(bot);
    return bot.fireballV2 || null;
  }

  function refreshForcedUi() {
    const bot = getBot();
    const module = bot?.fireballV2;
    if (!module) return false;
    const config = module.config || module.status?.()?.config || {};
    const status = module.status?.() || {};

    const enabled = document.getElementById("minibia-bot-fireball-v2-enabled");
    const priority = document.getElementById("minibia-bot-fireball-v2-highest-priority");
    const hotkey = document.getElementById("minibia-bot-fireball-v2-hotkey");
    const monsters = document.getElementById("minibia-bot-fireball-v2-monsters");
    const cooldown = document.getElementById("minibia-bot-fireball-v2-cooldown");
    const label = document.getElementById("minibia-bot-fireball-v2-status");

    if (enabled) enabled.checked = !!status.running;
    if (priority) priority.checked = !!config.highestPriority;
    if (hotkey && document.activeElement !== hotkey) hotkey.value = config.hotbarSlot || "";
    if (monsters && document.activeElement !== monsters) monsters.value = config.minMonsters ?? 4;
    if (cooldown && document.activeElement !== cooldown) cooldown.value = config.cooldownMs ?? 2000;
    if (label) {
      label.textContent = status.running
        ? `Fireball 2.0: biggest group ${status.bestMonsterCount || 0}/${config.minMonsters || 4} • predicted ${status.predictedTargets || 0}${status.priorityReserved ? " PRIORITY" : ""}`
        : "Fireball 2.0: off";
    }
    return true;
  }

  function ensurePanel() {
    const bot = getBot();
    const module = installModule();
    if (!bot || !module) return false;

    const originalSection = document.getElementById("minibia-bot-fireball-section");
    const aoeSection = document.getElementById("minibia-bot-auto-attack-aoe-section");
    if (!originalSection && !aoeSection) return false;

    let section = document.getElementById(SECTION_ID);
    if (!section) {
      section = document.createElement("div");
      section.id = SECTION_ID;
      section.className = "mb-section";
      section.innerHTML = `<div class="mb-label">Fireball 2.0 — Movement Prediction</div><label class="mb-toggle"><input type="checkbox" id="minibia-bot-fireball-v2-enabled" /><span>Enable Fireball 2.0</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-fireball-v2-highest-priority" /><span>Fireball 2.0 Highest Priority</span></label><div class="mb-field-grid"><label class="mb-field"><span class="mb-field-label">Fireball 2.0 Hotkey</span><input type="number" id="minibia-bot-fireball-v2-hotkey" min="1" max="12" placeholder="8" /></label><label class="mb-field"><span class="mb-field-label">Minimum Creatures</span><input type="number" id="minibia-bot-fireball-v2-monsters" min="1" placeholder="4" /></label><label class="mb-field"><span class="mb-field-label">Cooldown MS</span><input type="number" id="minibia-bot-fireball-v2-cooldown" min="0" placeholder="2000" /></label></div><div class="mb-small-note">Same Fireball diamond scan as the original, with movement prediction that leads consistently moving targets.</div><div class="mb-small-note">Prediction falls back to the current tile when movement stops, changes direction, becomes stale, or the predicted tile is invalid.</div><div class="mb-small-note" id="minibia-bot-fireball-v2-status">Fireball 2.0: off</div>`;

      section.querySelector("#minibia-bot-fireball-v2-enabled")?.addEventListener("change", (event) => {
        if (event.target.checked) module.start?.();
        else module.stop?.();
      });
      section.querySelector("#minibia-bot-fireball-v2-highest-priority")?.addEventListener("change", (event) => module.updateConfig?.({ highestPriority: event.target.checked }));
      section.querySelector("#minibia-bot-fireball-v2-hotkey")?.addEventListener("change", (event) => module.updateConfig?.({ hotbarSlot: event.target.value }));
      section.querySelector("#minibia-bot-fireball-v2-monsters")?.addEventListener("change", (event) => module.updateConfig?.({ minMonsters: event.target.value }));
      section.querySelector("#minibia-bot-fireball-v2-cooldown")?.addEventListener("change", (event) => module.updateConfig?.({ cooldownMs: event.target.value }));
    }

    if (originalSection?.parentElement) {
      if (originalSection.nextElementSibling !== section) originalSection.insertAdjacentElement("afterend", section);
    } else if (aoeSection?.querySelector(".mb-stack") && section.parentElement !== aoeSection.querySelector(".mb-stack")) {
      aoeSection.querySelector(".mb-stack").appendChild(section);
    }

    refreshForcedUi();
    return true;
  }

  ensurePanel();
  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    ensurePanel();
    if (attempts >= 120) window.clearInterval(timerId);
  }, 500);

  getBot()?.addCleanup?.(() => window.clearInterval(timerId));
})();
