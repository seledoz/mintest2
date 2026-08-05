(() => {
  const SELECT_ID = "minibia-bot-profile-select";
  const LOAD_ID = "minibia-bot-profile-load";
  const STATUS_ID = "minibia-bot-profile-status";
  const PROFILES_KEY = "minibiaBot.profiles.v2";
  const ACTIVE_KEY = "minibiaBot.profiles.active";

  function isLayoutKey(key) {
    const value = String(key || "");
    return value.startsWith("minibiaBot.ui.") ||
      value.includes("panelPosition") ||
      value.includes("panelCollapsed") ||
      value.includes("panelScroll") ||
      value.includes("scrollPosition") ||
      value.includes("sectionOrder") ||
      value.includes("columnOrder");
  }

  function isProfileControlKey(key) {
    return key === PROFILES_KEY ||
      key === "minibiaBot.profiles.v1" ||
      key === ACTIVE_KEY ||
      key === "minibiaBot.github.token";
  }

  function isFeatureSettingKey(key) {
    return String(key || "").startsWith("minibiaBot.") &&
      !isProfileControlKey(key) &&
      !isLayoutKey(key);
  }

  function readProfiles() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(PROFILES_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      throw new Error("Saved profiles could not be read");
    }
  }

  function loadWithoutMovingPanel(name) {
    const profileName = String(name || "").trim();
    const profile = readProfiles()[profileName];
    if (!profile) throw new Error("Profile was not found");

    const keysToRemove = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (isFeatureSettingKey(key)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));

    Object.entries(profile.settings || {}).forEach(([key, value]) => {
      if (isFeatureSettingKey(key) && typeof value === "string") {
        window.localStorage.setItem(key, value);
      }
    });

    window.localStorage.setItem(ACTIVE_KEY, profile.name || profileName);
    if (typeof window.minibiaBotReload === "function") window.minibiaBotReload();
    else window.location.reload();
  }

  function install() {
    const select = document.getElementById(SELECT_ID);
    const loadButton = document.getElementById(LOAD_ID);
    if (!select || !loadButton) return false;
    if (loadButton.dataset.layoutStableProfileLoad === "true") return true;

    loadButton.dataset.layoutStableProfileLoad = "true";
    loadButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const status = document.getElementById(STATUS_ID);
        if (status) status.textContent = `Loading profile: ${select.value}...`;
        loadWithoutMovingPanel(select.value);
      } catch (error) {
        window.alert(error?.message || String(error));
      }
    }, true);
    return true;
  }

  install();
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 600) window.clearInterval(timer);
  }, 100);
})();
