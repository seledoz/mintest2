(() => {
  const STYLE_ID = "minibia-bot-panel-layout-restore-style";
  const COLUMN_ID = "minibia-bot-aoe-column";
  const LURE_ID = "minibia-bot-lure-section";

  function installStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      #minibia-bot-panel { width: min(98vw, 1260px) !important; max-width: calc(100vw - 12px) !important; }
      #minibia-bot-panel[data-collapsed="true"] { width: 220px !important; }
      #minibia-bot-panel .mb-body:not([hidden]) { grid-template-columns: minmax(0, 1fr) 280px 240px 280px !important; }
      #minibia-bot-panel .mb-aoe-column { display: grid !important; gap: 10px !important; align-content: start !important; min-width: 0 !important; }
      #minibia-bot-panel #minibia-bot-auto-attack-aoe-section { max-height: none !important; overflow: visible !important; }
      #minibia-bot-lure-section .mb-field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      @media (max-width: 760px) { #minibia-bot-panel .mb-body:not([hidden]) { grid-template-columns: 1fr !important; } }
    `;
  }

  function getFourthColumn() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const body = panel?.querySelector?.(".mb-body");
    if (!panel || !body) return null;
    let column = document.getElementById(COLUMN_ID);
    if (!column) {
      column = document.createElement("div");
      column.id = COLUMN_ID;
      column.className = "mb-aoe-column";
      body.appendChild(column);
    }
    return column;
  }

  function makeLureSection(bot) {
    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = LURE_ID;
    section.innerHTML = `
      <div class="mb-label">Lure Mode</div>
      <div class="mb-stack">
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-lure-enabled" /><span>Enable Lure Mode</span></label>
        <label class="mb-field" for="minibia-bot-lure-mode"><span class="mb-field-label">Mode</span>
          <select id="minibia-bot-lure-mode">
            <option value="1">Lure Mode 1 (Current)</option>
            <option value="2">Lure Mode 2 (Paced)</option>
          </select>
        </label>
        <div class="mb-field-grid">
          <label class="mb-field" for="minibia-bot-lure-min-monsters"><span class="mb-field-label">Min Monsters</span><input type="number" id="minibia-bot-lure-min-monsters" min="1" max="20" step="1" /></label>
          <label class="mb-field" for="minibia-bot-lure-max-distance"><span class="mb-field-label">Max Distance</span><input type="number" id="minibia-bot-lure-max-distance" min="1" max="7" step="1" /></label>
          <label class="mb-field" for="minibia-bot-lure-step-delay"><span class="mb-field-label">Mode 2 Step Delay (ms)</span><input type="number" id="minibia-bot-lure-step-delay" min="100" max="2000" step="50" /></label>
        </div>
        <div class="mb-small-note">Mode 1 is unchanged. Mode 2 waits until every tracked monster is within Max Distance, then allows one path step and checks the pack again.</div>
        <div class="mb-small-note">After Min Monsters is reached, both modes stay in kill mode until the pack is cleared.</div>
        <div class="mb-small-note" id="minibia-bot-lure-status">Lure 1: off</div>
      </div>
    `;

    const update = (patch) => bot?.lureMode?.updateConfig?.(patch);
    section.querySelector("#minibia-bot-lure-enabled")?.addEventListener("change", (event) => update({ enabled: event.target.checked }));
    section.querySelector("#minibia-bot-lure-mode")?.addEventListener("change", (event) => update({ mode: Number(event.target.value) }));
    section.querySelector("#minibia-bot-lure-min-monsters")?.addEventListener("change", (event) => update({ minMonsters: Number(event.target.value) }));
    section.querySelector("#minibia-bot-lure-max-distance")?.addEventListener("change", (event) => update({ maxDistance: Number(event.target.value) }));
    section.querySelector("#minibia-bot-lure-step-delay")?.addEventListener("change", (event) => update({ stepDelayMs: Number(event.target.value) }));
    return section;
  }

  function refreshLureUi(bot) {
    const config = bot?.lureMode?.config || bot?.lureMode?.status?.()?.config || {};
    const status = bot?.lureMode?.status?.() || {};
    const lure = status?.lure || status;
    const enabled = document.getElementById("minibia-bot-lure-enabled");
    const mode = document.getElementById("minibia-bot-lure-mode");
    const min = document.getElementById("minibia-bot-lure-min-monsters");
    const max = document.getElementById("minibia-bot-lure-max-distance");
    const delay = document.getElementById("minibia-bot-lure-step-delay");
    const label = document.getElementById("minibia-bot-lure-status");
    if (enabled) enabled.checked = !!config.enabled;
    if (mode && document.activeElement !== mode) mode.value = String(Number(config.mode) === 2 ? 2 : 1);
    if (min && document.activeElement !== min) min.value = String(config.minMonsters ?? 3);
    if (max && document.activeElement !== max) max.value = String(config.maxDistance ?? 4);
    if (delay && document.activeElement !== delay) delay.value = String(config.stepDelayMs ?? 450);
    if (label) {
      const currentMode = Number(config.mode) === 2 ? 2 : 1;
      const monsterCount = Number(lure?.monsterCount || 0);
      const minimum = Number(config.minMonsters || 3);
      if (!config.enabled) label.textContent = `Lure ${currentMode}: off`;
      else if (lure?.clearingPack) label.textContent = `Lure ${currentMode}: clearing ${monsterCount} left`;
      else if (lure?.readyToEngage) label.textContent = `Lure ${currentMode}: engaging ${monsterCount}/${minimum}`;
      else if (lure?.shouldHoldWalking) label.textContent = `Lure ${currentMode}: waiting`;
      else if (monsterCount > 0) label.textContent = `Lure ${currentMode}: walking ${monsterCount}/${minimum}`;
      else label.textContent = `Lure ${currentMode}: looking 0/${minimum}`;
    }
  }

  function enforceBottomSectionOrder() {
    const github = document.getElementById("minibia-bot-github-waypoints-section");
    const gm = document.getElementById("minibia-bot-gm-kill-switch-section");
    const mining = document.getElementById("minibia-bot-mining-section");
    if (!github) return;

    const column = github.parentElement;
    if (!column) return;

    if (gm) {
      if (gm.parentElement !== column || github.nextElementSibling !== gm) {
        github.insertAdjacentElement("afterend", gm);
      }
    }

    if (mining) {
      const anchor = gm && gm.parentElement === column ? gm : github;
      if (mining.parentElement !== column || anchor.nextElementSibling !== mining) {
        anchor.insertAdjacentElement("afterend", mining);
      }
    }
  }

  function restoreLayout() {
    enforceBottomSectionOrder();

    const bot = window.minibiaBot;
    const column = getFourthColumn();
    if (!bot || !column) return false;
    installStyle();

    const aoe = document.getElementById("minibia-bot-auto-attack-aoe-section");
    if (aoe && aoe.parentElement !== column) column.prepend(aoe);

    let lure = document.getElementById(LURE_ID);
    if (!lure) lure = makeLureSection(bot);
    if (lure.parentElement !== column) column.appendChild(lure);
    refreshLureUi(bot);
    enforceBottomSectionOrder();
    return true;
  }

  restoreLayout();
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    restoreLayout();
    if (attempts >= 120) window.clearInterval(timer);
  }, 250);
})();