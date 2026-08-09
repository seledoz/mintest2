(() => {
  const storageKey = "minibiaBot.xray.overlayFloorMode";
  const controlId = "minibia-bot-xray-floor-mode-control";
  const selectId = "minibia-bot-xray-floor-mode-select";
  const legacySelectId = "minibia-bot-xray-floor-select";
  const overlayId = "minibia-bot-xray-overlay";
  const statusId = "minibia-bot-xray-overlay-status";
  const validModes = new Set(["all", "current", "current-plus-minus-one"]);
  let mode = readMode();
  let overlayObserver = null;
  let observedOverlay = null;
  let activeTimerId = null;
  let startupTimerId = null;

  function readMode() {
    try { const value = window.localStorage.getItem(storageKey); return validModes.has(value) ? value : "all"; } catch (_) { return "all"; }
  }
  function saveMode(nextMode) {
    mode = validModes.has(nextMode) ? nextMode : "all";
    try { window.localStorage.setItem(storageKey, mode); } catch (_) {}
  }
  function markerFloorOffset(marker) {
    const match = String(marker?.textContent || "").match(/\(([+-]?\d+)\)/);
    const offset = match ? Number(match[1]) : 0;
    return Number.isFinite(offset) ? offset : 0;
  }
  function shouldShowMarker(offset) {
    if (mode === "all") return true;
    if (mode === "current") return offset === 0;
    return Math.abs(offset) <= 1;
  }
  function isOverlayEnabled() { return !!window.minibiaBot?.xray?.status?.().config?.overlayEnabled; }
  function applyMarkerFilter() {
    if (!isOverlayEnabled()) return false;
    const overlay = document.getElementById(overlayId);
    if (!overlay) return false;
    overlay.querySelectorAll(".mb-xray-marker").forEach((marker) => { marker.style.display = shouldShowMarker(markerFloorOffset(marker)) ? "" : "none"; });
    return true;
  }
  function stopOverlayObserver() {
    overlayObserver?.disconnect?.();
    overlayObserver = null;
    observedOverlay = null;
  }
  function watchOverlay() {
    if (!isOverlayEnabled()) { stopOverlayObserver(); return; }
    const overlay = document.getElementById(overlayId);
    if (!overlay || overlay === observedOverlay) return;
    stopOverlayObserver();
    observedOverlay = overlay;
    overlayObserver = new MutationObserver(applyMarkerFilter);
    overlayObserver.observe(overlay, { childList: true, subtree: true, characterData: true });
    applyMarkerFilter();
  }
  function updateStatusText() {
    const label = document.getElementById(statusId);
    if (!label) return;
    const modeLabel = mode === "all" ? "all floors" : mode === "current" ? "current floor" : "current floor ±1";
    label.textContent = `${isOverlayEnabled() ? "Overlay: on" : "Overlay: off"} • ${modeLabel}`;
  }
  function installControl() {
    const status = document.getElementById(statusId);
    const xraySection = status?.closest?.(".mb-section");
    if (!status || !xraySection) return false;
    const legacyField = document.getElementById(legacySelectId)?.closest?.(".mb-field");
    if (legacyField) legacyField.style.display = "none";
    let control = document.getElementById(controlId);
    if (!control) {
      control = document.createElement("label");
      control.id = controlId;
      control.className = "mb-field";
      control.innerHTML = `<span class="mb-field-label">Overlay Floor Mode</span><select id="${selectId}"><option value="all">All Floors</option><option value="current">Current Floor</option><option value="current-plus-minus-one">Current Floor ±1</option></select>`;
      status.insertAdjacentElement("afterend", control);
      control.querySelector(`#${selectId}`)?.addEventListener("change", (event) => {
        saveMode(event.target.value);
        window.minibiaBot?.xray?.setSelectedFloor?.(null);
        if (isOverlayEnabled()) applyMarkerFilter();
        updateStatusText();
      });
    }
    const select = document.getElementById(selectId);
    if (select && select.value !== mode) select.value = mode;
    window.minibiaBot?.xray?.setSelectedFloor?.(null);
    updateStatusText();
    return true;
  }
  function stopActiveTimer() {
    if (activeTimerId != null) window.clearInterval(activeTimerId);
    activeTimerId = null;
    stopOverlayObserver();
  }
  function activeTick() {
    if (!isOverlayEnabled()) { stopActiveTimer(); updateStatusText(); return; }
    watchOverlay();
    applyMarkerFilter();
    updateStatusText();
  }
  function syncActiveState() {
    if (!isOverlayEnabled()) { stopActiveTimer(); updateStatusText(); return; }
    if (activeTimerId == null) activeTimerId = window.setInterval(activeTick, 250);
    activeTick();
  }
  function wrapOverlayToggle() {
    const xray = window.minibiaBot?.xray;
    if (!xray?.setOverlayEnabled || xray.__floorModeTimerWrapped) return !!xray;
    const original = xray.setOverlayEnabled.bind(xray);
    xray.setOverlayEnabled = (...args) => { const result = original(...args); window.setTimeout(syncActiveState, 0); return result; };
    xray.__floorModeTimerWrapped = true;
    return true;
  }
  function setup() {
    const ready = installControl();
    wrapOverlayToggle();
    syncActiveState();
    return ready;
  }

  setup();
  if (!document.getElementById(controlId)) {
    let attempts = 0;
    startupTimerId = window.setInterval(() => {
      attempts += 1;
      if (setup() || attempts >= 40) { window.clearInterval(startupTimerId); startupTimerId = null; }
    }, 250);
  }
  window.addEventListener("beforeunload", () => {
    if (startupTimerId != null) window.clearInterval(startupTimerId);
    stopActiveTimer();
  }, { once: true });
})();

(() => {
  const storageKey = "minibiaBot.gmKillSwitch.exactNames";
  const inputId = "minibia-bot-gm-exact-names";
  const fieldId = "minibia-bot-gm-exact-names-field";
  let originalGetGameMasterNames = null;

  function cleanName(value) { return String(value || "").trim(); }
  function normalizeName(value) { return cleanName(value).toLowerCase(); }
  function parseNames(value) {
    const seen = new Set();
    return String(value || "").split(/[\n,;]+/).map(cleanName).filter((name) => {
      const normalized = normalizeName(name);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized); return true;
    });
  }
  function loadNames() { try { return parseNames(window.localStorage.getItem(storageKey) || ""); } catch (_) { return []; } }
  let exactNames = loadNames();
  function saveNames(value) {
    exactNames = parseNames(value);
    try { window.localStorage.setItem(storageKey, exactNames.join("\n")); } catch (_) {}
    return [...exactNames];
  }
  function patchNameProvider() {
    const panic = window.minibiaBot?.panic;
    if (!panic) return false;
    if (panic.__exactGmNamesInstalled) return true;
    originalGetGameMasterNames = typeof panic.getGameMasterNames === "function" ? panic.getGameMasterNames.bind(panic) : () => [];
    panic.getGameMasterNames = () => {
      let existing = [];
      try { existing = originalGetGameMasterNames() || []; } catch (_) {}
      const merged = new Map();
      [...existing, ...exactNames].forEach((name) => {
        const cleaned = cleanName(name), normalized = normalizeName(cleaned);
        if (normalized && !merged.has(normalized)) merged.set(normalized, cleaned);
      });
      return [...merged.values()];
    };
    panic.__exactGmNamesInstalled = true;
    return true;
  }
  function installField() {
    const section = document.getElementById("minibia-bot-gm-kill-switch-section");
    const stack = section?.querySelector?.(".mb-stack");
    if (!section || !stack) return false;
    let field = document.getElementById(fieldId);
    if (!field) {
      field = document.createElement("label");
      field.id = fieldId;
      field.className = "mb-field";
      field.innerHTML = `<span class="mb-field-label">Exact GM Name(s)</span><textarea id="${inputId}" placeholder="Enter the exact character name. One per line, or separate with commas."></textarea><span class="mb-small-note">Matching ignores capital letters but otherwise uses the full entered name.</span>`;
      const responderToggle = document.getElementById("minibia-bot-gm-responder-enabled")?.closest?.("label");
      if (responderToggle) responderToggle.insertAdjacentElement("beforebegin", field); else stack.appendChild(field);
    }
    const input = document.getElementById(inputId);
    if (!input) return false;
    if (document.activeElement !== input) input.value = exactNames.join("\n");
    if (input.dataset.exactGmNamesBound !== "true") {
      input.dataset.exactGmNamesBound = "true";
      const save = () => saveNames(input.value);
      input.addEventListener("input", save); input.addEventListener("change", save); input.addEventListener("blur", save);
    }
    return true;
  }

  patchNameProvider();
  if (!installField()) {
    let attempts = 0;
    const timerId = window.setInterval(() => {
      attempts += 1;
      const patched = patchNameProvider();
      const installed = installField();
      if ((patched && installed) || attempts >= 80) window.clearInterval(timerId);
    }, 250);
  }
})();
