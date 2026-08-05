(() => {
  const SECTION_ID = "minibia-bot-profiles-section";
  const PROFILES_KEY = "minibiaBot.profiles.v2";
  const ACTIVE_KEY = "minibiaBot.profiles.active";
  const TOKEN_KEY = "minibiaBot.github.token";
  const SOURCE_LOADER_URL = "https://raw.githubusercontent.com/seledoz/mintest2/main/pz-bot.js";

  const excludedExact = new Set([
    PROFILES_KEY,
    "minibiaBot.profiles.v1",
    ACTIVE_KEY,
    TOKEN_KEY,
  ]);

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

  function applySettings(settings) {
    let applied = 0;
    Object.entries(settings || {}).forEach(([key, value]) => {
      if (isProfileSettingKey(key) && typeof value === "string") {
        window.localStorage.setItem(key, value);
        applied += 1;
      }
    });
    return applied;
  }

  function capturePanelState() {
    const panel = document.getElementById("minibia-bot-panel");
    const content = panel?.querySelector?.(".mb-content");
    if (!panel) return null;

    const rect = panel.getBoundingClientRect();
    return {
      left: panel.style.left || `${Math.round(rect.left)}px`,
      top: panel.style.top || `${Math.round(rect.top)}px`,
      right: panel.style.right || "auto",
      bottom: panel.style.bottom || "auto",
      scrollTop: content?.scrollTop || 0,
      collapsed: panel.dataset.collapsed || "false",
    };
  }

  function restorePanelState(state) {
    if (!state) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const panel = document.getElementById("minibia-bot-panel");
      const content = panel?.querySelector?.(".mb-content");
      if (panel) {
        panel.style.left = state.left;
        panel.style.top = state.top;
        panel.style.right = state.right;
        panel.style.bottom = state.bottom;
        panel.dataset.collapsed = state.collapsed;
        if (content) content.scrollTop = state.scrollTop;
      }
      if (panel || attempts >= 200) window.clearInterval(timer);
    }, 25);
  }

  async function reloadBotInPage(panelState) {
    const response = await fetch(`${SOURCE_LOADER_URL}?profileReload=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Bot reload failed: HTTP ${response.status}`);
    const code = await response.text();
    (0, eval)(`${code}\n//# sourceURL=${SOURCE_LOADER_URL}`);
    restorePanelState(panelState);
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
      select.value = names.includes(currentSelection)
        ? currentSelection
        : names.includes(active)
          ? active
          : names[0];
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
    profiles[normalized] = {
      name: normalized,
      savedAt: new Date().toISOString(),
      settings,
    };
    writeProfiles(profiles);
    window.localStorage.setItem(ACTIVE_KEY, normalized);
    refreshPanel(normalized);
    updateStatus(`Saved profile: ${normalized} (${Object.keys(settings).length} settings)`);
    return profiles[normalized];
  }

  async function loadProfile(name) {
    const normalized = String(name || "").trim();
    const profile = readProfiles()[normalized];
    if (!profile) throw new Error("Profile was not found");

    const savedCount = Object.keys(profile.settings || {}).length;
    if (!savedCount) {
      throw new Error("This profile contains no saved settings. Select it, configure the bot, and press Save again.");
    }

    const panelState = capturePanelState();
    const appliedCount = applySettings(profile.settings);
    if (!appliedCount) {
      throw new Error("No compatible settings were found in this profile. Save the profile again with the current bot version.");
    }

    window.localStorage.setItem(ACTIVE_KEY, normalized);
    updateStatus(`Loading ${appliedCount} settings from ${normalized}...`);
    await reloadBotInPage(panelState);
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
        try { saveProfile(name, true); }
        catch (error) { window.alert(error?.message || String(error)); }
      });

      section.querySelector("#minibia-bot-profile-save").addEventListener("click", () => {
        try { saveProfile(select.value); }
        catch (error) { window.alert(error?.message || String(error)); }
      });

      section.querySelector("#minibia-bot-profile-load").addEventListener("click", async () => {
        try { await loadProfile(select.value); }
        catch (error) {
          updateStatus("Profile load failed.");
          window.alert(error?.message || String(error));
        }
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
