(() => {
  const SELECT_ID = "minibia-bot-profile-select";
  const LOAD_ID = "minibia-bot-profile-load";
  const STATUS_ID = "minibia-bot-profile-status";
  const PROFILES_KEY = "minibiaBot.profiles.v2";
  const ACTIVE_KEY = "minibiaBot.profiles.active";

  function isLayoutOrRuntimeKey(key) {
    const value = String(key || "").toLowerCase();
    return (
      value === PROFILES_KEY.toLowerCase() ||
      value === "minibiabot.profiles.v1" ||
      value === ACTIVE_KEY.toLowerCase() ||
      value === "minibiabot.github.token" ||
      value.includes("minibiabot.ui") ||
      value.includes("panel") ||
      value.includes("layout") ||
      value.includes("position") ||
      value.includes("scroll") ||
      value.includes("collapse") ||
      value.includes("column") ||
      value.includes("sectionorder") ||
      value.includes("moduleorder") ||
      value.includes("laststatus")
    );
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

  function loadProfileNonDestructively(name) {
    const profileName = String(name || "").trim();
    const profile = readProfiles()[profileName];
    if (!profile) throw new Error("Profile was not found");

    // Never remove current settings. Removing missing keys resets modules to
    // defaults, makes hidden/legacy sections reappear, and changes the panel.
    // Only overwrite feature values explicitly saved in the selected profile.
    Object.entries(profile.settings || {}).forEach(([key, value]) => {
      if (isLayoutOrRuntimeKey(key)) return;
      if (typeof value === "string") window.localStorage.setItem(key, value);
    });

    window.localStorage.setItem(ACTIVE_KEY, profile.name || profileName);
    if (typeof window.minibiaBotReload === "function") window.minibiaBotReload();
    else window.location.reload();
  }

  function installFix() {
    const select = document.getElementById(SELECT_ID);
    const loadButton = document.getElementById(LOAD_ID);
    if (!select || !loadButton) return false;

    if (select.dataset.profileSelectionFix !== "true") {
      select.dataset.profileSelectionFix = "true";
      select.addEventListener("change", (event) => {
        event.stopImmediatePropagation();
        updateSelectionStatus(select);
      }, true);
    }

    if (loadButton.dataset.profileSafeLoadFix !== "true") {
      loadButton.dataset.profileSafeLoadFix = "true";
      loadButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          const status = document.getElementById(STATUS_ID);
          if (status) status.textContent = `Loading profile: ${select.value}...`;
          loadProfileNonDestructively(select.value);
        } catch (error) {
          window.alert(error?.message || String(error));
          console.error("[minibia-bot] safe profile load failed", error);
        }
      }, true);
    }

    return true;
  }

  installFix();
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (installFix() || attempts >= 600) window.clearInterval(timer);
  }, 100);
})();
