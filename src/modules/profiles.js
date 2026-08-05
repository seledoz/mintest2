(() => {
  const SECTION_ID = "minibia-bot-profiles-section";
  const PROFILES_KEY = "minibiaBot.profiles.v2";
  const ACTIVE_KEY = "minibiaBot.profiles.active";

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

  function isProfileControl(element) {
    return !!element?.closest?.(`#${SECTION_ID}`);
  }

  function isSavableControl(element) {
    if (!element?.id || isProfileControl(element)) return false;
    if (element.disabled && element.type === "button") return false;
    if (element.tagName === "BUTTON") return false;
    if (element.type === "button" || element.type === "submit" || element.type === "reset") return false;
    return element.matches("input, select, textarea");
  }

  function capturePanelControls() {
    const panel = document.getElementById("minibia-bot-panel");
    if (!panel) throw new Error("Bot panel was not found");

    const controls = {};
    panel.querySelectorAll("input, select, textarea").forEach((element) => {
      if (!isSavableControl(element)) return;

      if (element.type === "checkbox" || element.type === "radio") {
        controls[element.id] = {
          kind: element.type,
          checked: !!element.checked,
        };
      } else {
        controls[element.id] = {
          kind: element.tagName.toLowerCase(),
          value: String(element.value ?? ""),
        };
      }
    });
    return controls;
  }

  function dispatchControlEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyPanelControls(controls) {
    const entries = Object.entries(controls || {});
    let restored = 0;
    let missing = 0;

    // Restore all values first so modules receive their complete configuration
    // before enabled checkboxes are applied.
    entries.forEach(([id, saved]) => {
      if (saved?.kind === "checkbox" || saved?.kind === "radio") return;
      const element = document.getElementById(id);
      if (!element || !isSavableControl(element)) {
        missing += 1;
        return;
      }
      element.value = String(saved?.value ?? "");
      dispatchControlEvents(element);
      restored += 1;
    });

    // Apply on/off states last. Existing change handlers start or stop modules
    // exactly as if the user clicked each checkbox manually.
    entries.forEach(([id, saved]) => {
      if (saved?.kind !== "checkbox" && saved?.kind !== "radio") return;
      const element = document.getElementById(id);
      if (!element || !isSavableControl(element)) {
        missing += 1;
        return;
      }
      element.checked = !!saved.checked;
      dispatchControlEvents(element);
      restored += 1;
    });

    return { restored, missing };
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
    const active = window.localStorage.getItem(ACTIVE_KEY) || "";
    const current = preferredSelection || select.value;
    select.innerHTML = "";

    if (!names.length) {
      select.appendChild(new Option("No saved profiles", ""));
      select.disabled = true;
    } else {
      names.forEach((name) => select.appendChild(new Option(name, name)));
      select.disabled = false;
      select.value = names.includes(current) ? current : names.includes(active) ? active : names[0];
    }

    const disabled = !select.value;
    ["save", "load", "delete"].forEach((action) => {
      const button = document.getElementById(`minibia-bot-profile-${action}`);
      if (button) button.disabled = disabled;
    });

    if (!names.length) updateStatus("Create a profile to save the panel settings.");
    else if (select.value && select.value !== active) updateStatus(`Selected profile: ${select.value} — press Load`);
    else if (active) updateStatus(`Active profile: ${active}`);
    else updateStatus("Select a profile, then Load or Save.");
  }

  function saveProfile(name, mustBeNew = false) {
    const normalized = String(name || "").trim();
    if (!normalized) throw new Error("Profile name is required");

    const profiles = readProfiles();
    if (mustBeNew && profiles[normalized]) throw new Error(`Profile “${normalized}” already exists`);

    const controls = capturePanelControls();
    profiles[normalized] = {
      name: normalized,
      savedAt: new Date().toISOString(),
      controls,
    };
    writeProfiles(profiles);
    window.localStorage.setItem(ACTIVE_KEY, normalized);
    refreshPanel(normalized);
    updateStatus(`Saved profile: ${normalized} (${Object.keys(controls).length} controls)`);
    return profiles[normalized];
  }

  function loadProfile(name) {
    const normalized = String(name || "").trim();
    const profile = readProfiles()[normalized];
    if (!profile) throw new Error("Profile was not found");
    if (!profile.controls || !Object.keys(profile.controls).length) {
      throw new Error("This profile uses the old format. Configure the bot and press Save on this profile once.");
    }

    const result = applyPanelControls(profile.controls);
    window.localStorage.setItem(ACTIVE_KEY, normalized);
    refreshPanel(normalized);
    updateStatus(`Loaded profile: ${normalized} (${result.restored} controls restored)`);
    return result;
  }

  function deleteProfile(name) {
    const normalized = String(name || "").trim();
    const profiles = readProfiles();
    if (!profiles[normalized]) return false;

    delete profiles[normalized];
    writeProfiles(profiles);
    if (window.localStorage.getItem(ACTIVE_KEY) === normalized) {
      window.localStorage.removeItem(ACTIVE_KEY);
    }
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
      section.querySelector("#minibia-bot-profile-load").addEventListener("click", () => {
        try { loadProfile(select.value); }
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

    if (caveSection.nextElementSibling !== section) {
      caveSection.insertAdjacentElement("afterend", section);
    }
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
