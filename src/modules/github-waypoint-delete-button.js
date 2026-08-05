(() => {
  const BUTTON_ID = "minibia-bot-github-waypoints-delete";
  const SECTION_ID = "minibia-bot-github-waypoints-section";
  const SELECT_ID = "minibia-bot-github-waypoints-select";
  const STATUS_ID = "minibia-bot-github-waypoints-status";
  const TOKEN_KEY = "minibiaBot.github.token";
  const REPO_OWNER = "seledoz";
  const REPO_NAME = "mintest2";
  const BRANCH = "main";
  const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;

  function setStatus(message) {
    const label = document.getElementById(STATUS_ID);
    if (label) label.textContent = `GitHub: ${message}`;
  }

  function getToken() {
    try {
      const raw = window.localStorage.getItem(TOKEN_KEY);
      if (!raw) return "";
      try { return String(JSON.parse(raw) || "").trim(); } catch (error) { return String(raw || "").trim(); }
    } catch (error) {
      return "";
    }
  }

  function encodePath(path) {
    return String(path || "").split("/").map((part) => encodeURIComponent(part)).join("/");
  }

  function headers(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  async function readFile(path, token) {
    const response = await fetch(`${API_BASE}/${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`, {
      headers: headers(token),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`read failed (${response.status})`);
    return response.json();
  }

  async function deleteFile(path, name, sha, token) {
    const response = await fetch(`${API_BASE}/${encodePath(path)}`, {
      method: "DELETE",
      headers: headers(token),
      body: JSON.stringify({ message: `Delete waypoint script: ${name}`, sha, branch: BRANCH }),
    });
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json())?.message || ""; } catch (error) {}
      throw new Error(`delete failed (${response.status})${detail ? ` - ${detail}` : ""}`);
    }
  }

  function selectedName(select) {
    const label = select?.options?.[select.selectedIndex]?.textContent || "selected script";
    return label.replace(/\s*\(\d+\)\s*$/, "").trim() || "selected script";
  }

  function injectDeleteButton() {
    const section = document.getElementById(SECTION_ID);
    const select = document.getElementById(SELECT_ID);
    if (!section || !select) return false;
    if (document.getElementById(BUTTON_ID)) return true;

    const button = document.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    button.className = "mb-small-button";
    button.textContent = "Delete Selected";

    const refreshButton = document.getElementById("minibia-bot-github-waypoints-refresh");
    if (refreshButton) refreshButton.insertAdjacentElement("beforebegin", button);
    else section.querySelector(".mb-stack")?.appendChild(button);

    const syncDisabled = () => { button.disabled = !select.value || select.disabled; };
    select.addEventListener("change", syncDisabled);
    syncDisabled();

    button.addEventListener("click", async () => {
      const path = String(select.value || "").trim();
      const name = selectedName(select);
      if (!path) return;
      const token = getToken();
      if (!token) { setStatus("Save GitHub Setup first"); return; }
      if (!window.confirm(`Delete GitHub waypoint script “${name}”?\n\nThis cannot be undone.`)) return;

      button.disabled = true;
      setStatus(`deleting ${name}...`);
      try {
        const file = await readFile(path, token);
        if (!file?.sha) throw new Error("file SHA missing");
        await deleteFile(path, name, file.sha, token);
        setStatus(`deleted ${name}`);
        await window.minibiaBot?.githubWaypointLibrary?.refreshUi?.();
      } catch (error) {
        setStatus(error?.message || String(error));
        console.error("[minibia-bot] GitHub waypoint delete failed", error);
      } finally {
        syncDisabled();
      }
    });
    return true;
  }

  injectDeleteButton();
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (injectDeleteButton() || attempts >= 80) window.clearInterval(timer);
  }, 250);
})();

(() => {
  const SECTION_ID = "minibia-bot-profiles-section";
  const PROFILES_KEY = "minibiaBot.profiles.v2";
  const ACTIVE_KEY = "minibiaBot.profiles.active";
  const excludedKeys = new Set([
    PROFILES_KEY,
    "minibiaBot.profiles.v1",
    ACTIVE_KEY,
    "minibiaBot.github.token",
  ]);

  function readProfiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.error("[minibia-bot] profiles read failed", error);
      return {};
    }
  }

  function writeProfiles(profiles) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }

  function profileNames() {
    return Object.keys(readProfiles()).sort((a, b) => a.localeCompare(b));
  }

  function isBotSettingKey(key) {
    return String(key || "").startsWith("minibiaBot.") && !excludedKeys.has(key);
  }

  function captureSettings() {
    const settings = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (isBotSettingKey(key)) settings[key] = localStorage.getItem(key);
    }
    return settings;
  }

  function applySettings(settings) {
    const removeKeys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (isBotSettingKey(key)) removeKeys.push(key);
    }
    removeKeys.forEach((key) => localStorage.removeItem(key));
    Object.entries(settings || {}).forEach(([key, value]) => {
      if (isBotSettingKey(key) && typeof value === "string") localStorage.setItem(key, value);
    });
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

  function refresh() {
    const select = document.getElementById("minibia-bot-profile-select");
    if (!select) return;
    const names = profileNames();
    const previous = select.value;
    const active = localStorage.getItem(ACTIVE_KEY) || "";
    select.innerHTML = "";

    if (!names.length) {
      select.appendChild(new Option("No saved profiles", ""));
      select.disabled = true;
    } else {
      names.forEach((name) => select.appendChild(new Option(name, name)));
      select.disabled = false;
      select.value = names.includes(active) ? active : names.includes(previous) ? previous : names[0];
    }

    const disabled = !select.value;
    ["save", "load", "delete"].forEach((action) => {
      const button = document.getElementById(`minibia-bot-profile-${action}`);
      if (button) button.disabled = disabled;
    });
    updateStatus(active && names.includes(active)
      ? `Active profile: ${active}`
      : names.length ? "Select a profile, then Load or Save." : "Create a profile to save all bot settings.");
  }

  function saveProfile(name, mustBeNew = false) {
    name = String(name || "").trim();
    if (!name) throw new Error("Profile name is required");
    const profiles = readProfiles();
    if (mustBeNew && profiles[name]) throw new Error(`Profile “${name}” already exists`);
    profiles[name] = {
      name,
      savedAt: new Date().toISOString(),
      settings: captureSettings(),
    };
    writeProfiles(profiles);
    localStorage.setItem(ACTIVE_KEY, name);
    refresh();
    return profiles[name];
  }

  function loadProfile(name) {
    const profile = readProfiles()[String(name || "").trim()];
    if (!profile) throw new Error("Profile was not found");
    applySettings(profile.settings);
    localStorage.setItem(ACTIVE_KEY, profile.name);
    if (typeof window.minibiaBotReload === "function") window.minibiaBotReload();
    else window.location.reload();
  }

  function deleteProfile(name) {
    name = String(name || "").trim();
    const profiles = readProfiles();
    if (!profiles[name]) return false;
    delete profiles[name];
    writeProfiles(profiles);
    if (localStorage.getItem(ACTIVE_KEY) === name) localStorage.removeItem(ACTIVE_KEY);
    refresh();
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
        try {
          saveProfile(name, true);
          select.value = name;
          refresh();
        } catch (error) {
          window.alert(error?.message || String(error));
        }
      });
      section.querySelector("#minibia-bot-profile-save").addEventListener("click", () => {
        try { saveProfile(select.value); }
        catch (error) { window.alert(error?.message || String(error)); }
      });
      section.querySelector("#minibia-bot-profile-load").addEventListener("click", () => {
        try { loadProfile(select.value); }
        catch (error) { window.alert(error?.message || String(error)); }
      });
      section.querySelector("#minibia-bot-profile-delete").addEventListener("click", () => {
        const name = select.value;
        if (name && window.confirm(`Delete profile “${name}”?`)) deleteProfile(name);
      });
      select.addEventListener("change", refresh);
    }

    if (caveSection.nextElementSibling !== section) {
      caveSection.insertAdjacentElement("afterend", section);
    }
    section.hidden = false;
    section.style.display = "";
    refresh();

    const bot = window.minibiaBot;
    if (bot) {
      bot.profiles = {
        create: (name) => saveProfile(name, true),
        save: saveProfile,
        load: loadProfile,
        delete: deleteProfile,
        list: profileNames,
        refreshPanel: refresh,
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
