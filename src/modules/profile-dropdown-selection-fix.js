(() => {
  const SELECT_ID = "minibia-bot-profile-select";
  const LOAD_ID = "minibia-bot-profile-load";
  const STATUS_ID = "minibia-bot-profile-status";
  const PROFILES_KEY = "minibiaBot.profiles.v2";
  const ACTIVE_KEY = "minibiaBot.profiles.active";
  const FULL_LOADER_URL = "https://raw.githubusercontent.com/seledoz/mintest2/main/pz-bot.js";

  function isProtectedKey(key) {
    const value = String(key || "");
    const lower = value.toLowerCase();

    return value === PROFILES_KEY ||
      value === "minibiaBot.profiles.v1" ||
      value === ACTIVE_KEY ||
      value === "minibiaBot.github.token" ||
      lower.startsWith("minibiabot.ui.") ||
      lower.includes("panel") ||
      lower.includes("layout") ||
      lower.includes("columnorder") ||
      lower.includes("sectionorder") ||
      lower.includes("scroll") ||
      lower.includes("collapsed") ||
      lower.includes("position") ||
      lower.includes("laststatus") ||
      lower.includes("runtime");
  }

  function isFeatureSettingKey(key) {
    return String(key || "").startsWith("minibiaBot.") && !isProtectedKey(key);
  }

  function readProfiles() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(PROFILES_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      throw new Error("Saved profiles could not be read");
    }
  }

  function updateSelectionStatus(select) {
    const selected = String(select?.value || "").trim();
    const disabled = !selected;

    ["save", "load", "delete"].forEach((action) => {
      const button = document.getElementById(`minibia-bot-profile-${action}`);
      if (button) button.disabled = disabled;
    });

    const status = document.getElementById(STATUS_ID);
    const active = window.localStorage.getItem(ACTIVE_KEY) || "";
    if (status) {
      status.textContent = selected
        ? selected === active
          ? `Active profile: ${selected}`
          : `Selected profile: ${selected} — press Load to activate`
        : "Select a profile, then Load or Save.";
    }
  }

  function applyProfileNonDestructively(profile) {
    Object.entries(profile?.settings || {}).forEach(([key, value]) => {
      if (isFeatureSettingKey(key) && typeof value === "string") {
        window.localStorage.setItem(key, value);
      }
    });
  }

  async function runFullBotReload() {
    const response = await fetch(`${FULL_LOADER_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Full bot reload failed: HTTP ${response.status}`);
    const code = await response.text();
    (0, eval)(`${code}\n//# sourceURL=${FULL_LOADER_URL}`);
  }

  async function loadSelectedProfile(select, button) {
    const profileName = String(select?.value || "").trim();
    const profile = readProfiles()[profileName];
    if (!profile) throw new Error("Profile was not found");

    const status = document.getElementById(STATUS_ID);
    if (status) status.textContent = `Loading profile: ${profileName}...`;
    if (button) button.disabled = true;

    applyProfileNonDestructively(profile);
    window.localStorage.setItem(ACTIVE_KEY, profile.name || profileName);
    await runFullBotReload();
  }

  function installFix() {
    const select = document.getElementById(SELECT_ID);
    const oldLoadButton = document.getElementById(LOAD_ID);
    if (!select || !oldLoadButton) return false;

    if (select.dataset.profileSelectionFix !== "true") {
      select.dataset.profileSelectionFix = "true";
      select.addEventListener("change", (event) => {
        event.stopImmediatePropagation();
        updateSelectionStatus(select);
      }, true);
    }

    if (oldLoadButton.dataset.fullProfileReload !== "true") {
      // Replace the button node to remove every older destructive Load handler.
      const loadButton = oldLoadButton.cloneNode(true);
      loadButton.dataset.fullProfileReload = "true";
      oldLoadButton.replaceWith(loadButton);

      loadButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          await loadSelectedProfile(select, loadButton);
        } catch (error) {
          loadButton.disabled = false;
          window.alert(error?.message || String(error));
          updateSelectionStatus(select);
        }
      }, true);
    }

    updateSelectionStatus(select);
    return true;
  }

  if (window.__minNewProfileLoadObserver) {
    try { window.__minNewProfileLoadObserver.disconnect(); } catch (error) {}
  }

  installFix();
  const observer = new MutationObserver(() => installFix());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.__minNewProfileLoadObserver = observer;
})();
