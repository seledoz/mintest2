window.__minibiaBotBundle = window.__minibiaBotBundle || {};

// Safe layout helper: retries briefly during startup, then stops.
(function moveAoeIntoFourthColumnSafely() {
  const columnId = "minibia-bot-aoe-column";
  const styleId = "minibia-bot-aoe-column-style";

  function installStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #minibia-bot-panel {
        width: min(98vw, 1260px) !important;
        max-width: calc(100vw - 12px) !important;
      }
      #minibia-bot-panel[data-collapsed="true"] {
        width: 220px !important;
      }
      #minibia-bot-panel .mb-body:not([hidden]) {
        grid-template-columns: minmax(0, 1fr) 280px 240px 280px !important;
      }
      #minibia-bot-panel .mb-aoe-column {
        display: grid !important;
        gap: 10px !important;
        align-content: start !important;
        min-width: 0 !important;
      }
      #minibia-bot-panel #minibia-bot-auto-attack-aoe-section {
        max-height: none !important;
        overflow: visible !important;
      }
      @media (max-width: 760px) {
        #minibia-bot-panel .mb-body:not([hidden]) {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function moveAoeSection() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const body = panel?.querySelector?.(".mb-body");
    const aoeSection = document.getElementById("minibia-bot-auto-attack-aoe-section");
    if (!panel || !body || !aoeSection) return false;

    installStyle();
    let column = document.getElementById(columnId);
    if (!column) {
      column = document.createElement("div");
      column.id = columnId;
      column.className = "mb-aoe-column";
      body.appendChild(column);
    }
    if (aoeSection.parentElement !== column) column.prepend(aoeSection);
    return true;
  }

  let attempts = 0;
  const retryId = window.setInterval(() => {
    attempts += 1;
    if (moveAoeSection() || attempts >= 30) window.clearInterval(retryId);
  }, 1000);
  moveAoeSection();
})();

// The old GFB helper used to run a permanent 250 ms interval even when disabled.
// GFB 2.0 already owns its own timer and starts/stops it with the feature toggle,
// so no separate background combat interval is installed here.

(function configureCaptchaAlarmTiming() {
  const desiredConfig = { beepIntervalMs: 3000, alertDurationMs: 30000 };

  function applyTiming() {
    try {
      const alertModule = window.minibiaBot?.redTextAlert;
      if (!alertModule?.updateConfig) return false;
      alertModule.updateConfig(desiredConfig, { silent: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  let attempts = 0;
  const retryId = window.setInterval(() => {
    attempts += 1;
    if (applyTiming() || attempts >= 30) window.clearInterval(retryId);
  }, 1000);
  applyTiming();
})();

(function makeSquareCooldownEditable() {
  const inputId = "minibia-bot-auto-attack-aoe-cooldown";
  let editing = false;
  let draftValue = "";

  function saveCooldown(value) {
    const cooldownMs = Math.max(0, Math.trunc(Number(value)));
    if (!Number.isFinite(cooldownMs)) return false;
    try {
      window.minibiaBot?.attackAoe?.updateConfig?.({ cooldownMs });
      return true;
    } catch (_) {
      return false;
    }
  }

  function attach() {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.squareCooldownEditableInstalled === "true") return false;
    input.dataset.squareCooldownEditableInstalled = "true";
    input.removeAttribute("readonly");
    input.disabled = false;
    input.addEventListener("focus", () => {
      editing = true;
      draftValue = input.value;
    });
    input.addEventListener("input", () => {
      editing = true;
      draftValue = input.value;
      saveCooldown(draftValue);
    });
    input.addEventListener("change", () => {
      draftValue = input.value;
      saveCooldown(draftValue);
    });
    input.addEventListener("blur", () => {
      saveCooldown(input.value);
      editing = false;
    });
    return true;
  }

  let attempts = 0;
  const retryId = window.setInterval(() => {
    attempts += 1;
    const input = document.getElementById(inputId);
    attach();
    if (editing && input && document.activeElement === input && input.value !== draftValue) {
      input.value = draftValue;
    }
    if (attempts >= 40 && !editing) window.clearInterval(retryId);
  }, 250);
})();

(function forceNormalAutoAttackRangeSix() {
  const storageKey = "minibiaBot.attack.config";

  function applySix() {
    try {
      const rawValue = window.localStorage.getItem(storageKey);
      const config = rawValue ? JSON.parse(rawValue) : {};
      if (config.maxTargetDistance !== 6) {
        config.maxTargetDistance = 6;
        window.localStorage.setItem(storageKey, JSON.stringify(config));
      }
      const attackConfig = window.minibiaBot?.attack?.config;
      if (attackConfig && attackConfig.maxTargetDistance !== 6) attackConfig.maxTargetDistance = 6;
    } catch (_) {}
  }

  applySix();
  window.setTimeout(applySix, 500);
})();