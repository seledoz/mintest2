(() => {
  const SECTION_ID = "minibia-bot-profiles-section";
  const PROFILES_KEY = "minibiaBot.profiles.v2";
  const ACTIVE_KEY = "minibiaBot.profiles.active";
  const TOKEN_KEY = "minibiaBot.github.token";

  const excludedExact = new Set([
    PROFILES_KEY,
    "minibiaBot.profiles.v1",
    ACTIVE_KEY,
    TOKEN_KEY,
  ]);

  const moduleByStorageKey = {
    "minibiaBot.rune.config": "rune",
    "minibiaBot.heal.config": "heal",
    "minibiaBot.antiParalyzeV2.config": "antiParalyze",
    "minibiaBot.damageTtsAlert.config": "damageTtsAlert",
    "minibiaBot.invisible.config": "invisible",
    "minibiaBot.magicShield.config": "magicShield",
    "minibiaBot.attack.config": "attack",
    "minibiaBot.attackAoe.config": "attackAoe",
    "minibiaBot.greatFireballV2.config": "greatFireballV2",
    "minibiaBot.lure.config": "lureMode",
    "minibiaBot.attackExclude.config": "attackExclude",
    "minibiaBot.attackPriority.config": "attackPriority",
    "minibiaBot.redTextAlert.config": "redTextAlert",
    "minibiaBot.cave.config": "cave",
    "minibiaBot.caveForwardLoop.config": "caveForwardLoop",
    "minibiaBot.equipRing.config": "equipRing",
    "minibiaBot.mining.config": "mining",
    "minibiaBot.eat.config": "eat",
    "minibiaBot.talk.config": "talk",
    "minibiaBot.runeMakerDrop.config": "runeMakerDrop",
    "minibiaBot.maxLight.config": "maxLight",
    "minibiaBot.lowCapAlarm.config": "lowCapAlarm",
    "minibiaBot.playerScreenAlert.config": "playerScreenAlert",
    "minibiaBot.gmDefaultChatKillSwitch.config": "gmDefaultChatKillSwitch",
  };

  function isProtectedKey(key) {
    const value = String(key || "");
    const lower = value.toLowerCase();
    return excludedExact.has(value) ||
      value.startsWith("minibiaBot.ui.") ||
      lower.includes("panelposition") ||
      lower.includes("panelcollapsed") ||
      lower.includes("panelscroll") ||
      lower.includes("scrollposition") ||
      lower.includes("sectionorder") ||
      lower.includes("columnorder") ||
      lower.includes("layoutorder");
  }

  function isProfileSettingKey(key) {
    const value = String(key || "");
    return value.startsWith("minibiaBot.") && !isProtectedKey(value);
  }

  function readProfiles() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(PROFILES_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.error("[minibia-bot] profiles read failed", error);
      return {};
    }
  }

  function writeProfiles(profiles) {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }

  function profileNames() {
    return Object.keys(readProfiles()).sort((a, b) => a.localeCompare(b));
  }

  function captureSettings() {
    const settings = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (isProfileSettingKey(key)) settings[key] = window.localStorage.getItem(key);
    }
    return settings;
  }

  function parseStoredValue(value) {
    try { return JSON.parse(value); } catch (error) { return value; }
  }

  function applyModuleConfig(module, config) {
    if (!module || !config || typeof config !== "object" || Array.isArray(config)) return false;

    if (typeof module.updateConfig === "function") {
      module.updateConfig({ ...config });
    } else if (typeof module.setConfig === "function") {
      module.setConfig({ ...config });
    }

    if (typeof config.enabled === "boolean") {
      if (config.enabled && typeof module.start === "function") module.start({ ...config });
      if (!config.enabled && typeof module.stop === "function") module.stop({ persistEnabled: false });
    }
    return true;
  }

  function applyLiveSettings(settings) {
    const bot = window.minibiaBot;
    let stored = 0;
    let liveModules = 0;

    Object.entries(settings || {}).forEach(([key, rawValue]) => {
      if (!isProfileSettingKey(key) || typeof rawValue !== "string") return;
      window.localStorage.setItem(key, rawValue);
      stored += 1;

      const moduleName = moduleByStorageKey[key];
      const module = moduleName ? bot?.[moduleName] : null;
      if (module && applyModuleConfig(module, parseStoredValue(rawValue))) liveModules += 1;
    });

    window.dispatchEvent(new CustomEvent("minibia-bot-profile-loaded", {
      detail: { settings: { ...(settings || {}) }, stored, liveModules },
    }));
    document.dispatchEvent(new CustomEvent("minibia-bot-settings-changed", {
      detail: { source: "profile" },
    }));

    return { stored, liveModules };
  }

  function findCaveSection(panel) {
    const knownControl =
      document.getElementById("minibia-bot-cave-status") ||
      document.getElementById("minibia-bot-cave-start") ||
      document.getElementById("minibia-bot-cave-pathfinder-mode") ||
      document.getElementById("minibia-bot-cave-preset-select");
    const knownSection = knownControl?.closest?.(".mb-section");
    if (knownSection) return knownSection;
    const label = Array.from(panel.querySelectorAll(".mb-label")).find((element) =>
      String(element.textContent || "").trim().toLowerCase() === "cavebot"
    );
    return label?.closest?.(".mb-section") || null;
  }

  function updateStatus(message) {
    const status = document.getElementById("minibia-bot-profile-status");
    if (status) status.textContent = message;
  }

  function refreshPanel(preferredSelection = "") {
    const select = document.getElementById("minibia-bot-profile-select");
    if (!select) return;
    const names = profileNames();
    const currentSelection = preferredSelection || select.value;
    const active = window.localStorage.getItem(ACTIVE_KEY) || "";
    select.innerHTML = "";

    if (!names.length) {
      select.appendChild(new Option("No saved profiles", ""));
      select.disabled = true;
    } else {
      names.forEach((name) => select.appendChild(new Option(name, name)));
      select.disabled = false;
      select.value = names.includes(currentSelection) ? currentSelection : names.includes(active) ? active : names[0];
    }

    const disabled = !select.value;
    ["save", "load", "delete"].forEach((action) => {
      const button = document.getElementById(`minibia-bot-profile-${action}`);
      if (button) button.disabled = disabled;
    });

    if (!names.length) updateStatus("Create a profile to save all bot settings.");
    else if (select.value && select.value !== active) updateStatus(`Selected profile: ${select.value} — press Load to activate`);
    else if (active) updateStatus(`Active profile: ${active}`);
    else updateStatus("Select a profile, then Load or Save.");
  }

  function saveProfile(name, mustBeNew = false) {
    const normalized = String(name || "").trim();
    if (!normalized) throw new Error("Profile name is required");
    const profiles = readProfiles();
    if (mustBeNew && profiles[normalized]) throw new Error(`Profile “${normalized}” already exists`);
    const settings = captureSettings();
    profiles[normalized] = { name: normalized, savedAt: new Date().toISOString(), settings };
    writeProfiles(profiles);
    window.localStorage.setItem(ACTIVE_KEY, normalized);
    refreshPanel(normalized);
    updateStatus(`Saved profile: ${normalized} (${Object.keys(settings).length} settings)`);
    return profiles[normalized];
  }

  function loadProfile(name) {
    const normalized = String(name || "").trim();
    const profile = readProfiles()[normalized];
    if (!profile) throw new Error("Profile was not found");
    const savedCount = Object.keys(profile.settings || {}).length;
    if (!savedCount) throw new Error("This profile contains no saved settings. Save it again after configuring the bot.");

    const result = applyLiveSettings(profile.settings);
    if (!result.stored) throw new Error("No compatible settings were found in this profile.");

    window.localStorage.setItem(ACTIVE_KEY, normalized);
    refreshPanel(normalized);
    updateStatus(`Loaded profile: ${normalized} (${result.liveModules} live modules updated)`);
    return true;
  }

  function deleteProfile(name) {
    const normalized = String(name || "").trim();
    const profiles = readProfiles();
    if (!profiles[normalized]) return false;
    delete profiles[normalized];
    writeProfiles(profiles);
    if (window.localStorage.getItem(ACTIVE_KEY) === normalized) window.localStorage.removeItem(ACTIVE_KEY);
    refreshPanel();
    return true;
  }

  function injectProfiles() {
    const panel = document.getElementById("minibia-bot-panel");
    if (!panel) return false;
    const caveSection = findCaveSection(panel);
    if (!caveSection) return false;

    let section = document.getElementById(SECTION_ID);
    if (!section) {
      section = document.createElement("div");
      section.id = SECTION_ID;
      section.className = "mb-section mb-column-section";
      section.innerHTML = `
        <div class="mb-label">Profiles</div>
        <div class="mb-stack">
          <select id="minibia-bot-profile-select"></select>
          <div class="mb-actions" style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="mb-small-button" id="minibia-bot-profile-new">New</button>
            <button type="button" class="mb-small-button" id="minibia-bot-profile-save">Save</button>
            <button type="button" class="mb-small-button" id="minibia-bot-profile-load">Load</button>
            <button type="button" class="mb-small-button" id="minibia-bot-profile-delete">Delete</button>
          </div>
          <div class="mb-small-note" id="minibia-bot-profile-status"></div>
        </div>`;

      const select = section.querySelector("#minibia-bot-profile-select");
      section.querySelector("#minibia-bot-profile-new").addEventListener("click", () => {
        const name = window.prompt("New profile name:")?.trim();
        if (!name) return;
        try { saveProfile(name, true); } catch (error) { window.alert(error?.message || String(error)); }
      });
      section.querySelector("#minibia-bot-profile-save").addEventListener("click", () => {
        try { saveProfile(select.value); } catch (error) { window.alert(error?.message || String(error)); }
      });
      section.querySelector("#minibia-bot-profile-load").addEventListener("click", () => {
        try { loadProfile(select.value); }
        catch (error) { updateStatus("Profile load failed."); window.alert(error?.message || String(error)); }
      });
      section.querySelector("#minibia-bot-profile-delete").addEventListener("click", () => {
        const name = select.value;
        if (name && window.confirm(`Delete profile “${name}”?`)) deleteProfile(name);
      });
      select.addEventListener("change", () => refreshPanel(select.value));
    }

    if (caveSection.nextElementSibling !== section) caveSection.insertAdjacentElement("afterend", section);
    section.hidden = false;
    section.style.display = "";
    refreshPanel();

    const bot = window.minibiaBot;
    if (bot) {
      bot.profiles = {
        create: (name) => saveProfile(name, true),
        save: saveProfile,
        load: loadProfile,
        delete: deleteProfile,
        list: profileNames,
        refreshPanel,
      };
    }
    return true;
  }

  injectProfiles();
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (injectProfiles() || attempts >= 600) window.clearInterval(timer);
  }, 100);
})();
