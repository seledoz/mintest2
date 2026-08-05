window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installProfilesModule = function installProfilesModule(bot) {
  const profilesKey = "minibiaBot.profiles.v1";
  const activeProfileKey = "minibiaBot.profiles.active";
  const excludedKeys = new Set([
    profilesKey,
    activeProfileKey,
  ]);

  function readProfiles() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(profilesKey) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.error("[minibia-bot] failed to read profiles", error);
      return {};
    }
  }

  function writeProfiles(profiles) {
    window.localStorage.setItem(profilesKey, JSON.stringify(profiles));
  }

  function getProfileNames() {
    return Object.keys(readProfiles()).sort((a, b) => a.localeCompare(b));
  }

  function getActiveProfileName() {
    return window.localStorage.getItem(activeProfileKey) || "";
  }

  function isProfileStorageKey(key) {
    return String(key || "").startsWith("minibiaBot.") && !excludedKeys.has(key);
  }

  function captureStorageSnapshot() {
    const snapshot = {};
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!isProfileStorageKey(key)) continue;
      snapshot[key] = window.localStorage.getItem(key);
    }
    return snapshot;
  }

  function applyStorageSnapshot(snapshot) {
    const keysToRemove = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (isProfileStorageKey(key)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));

    Object.entries(snapshot || {}).forEach(([key, value]) => {
      if (!isProfileStorageKey(key)) return;
      if (typeof value === "string") window.localStorage.setItem(key, value);
    });
  }

  function save(name) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) throw new Error("Profile name is required.");

    const profiles = readProfiles();
    profiles[normalizedName] = {
      name: normalizedName,
      savedAt: new Date().toISOString(),
      storage: captureStorageSnapshot(),
    };
    writeProfiles(profiles);
    window.localStorage.setItem(activeProfileKey, normalizedName);
    refreshPanel();
    bot.log?.("profile saved", { profile: normalizedName });
    return profiles[normalizedName];
  }

  function create(name) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) throw new Error("Profile name is required.");
    const profiles = readProfiles();
    if (profiles[normalizedName]) throw new Error(`Profile \"${normalizedName}\" already exists.`);
    return save(normalizedName);
  }

  function load(name) {
    const normalizedName = String(name || "").trim();
    const profile = readProfiles()[normalizedName];
    if (!profile) throw new Error(`Profile \"${normalizedName}\" was not found.`);

    applyStorageSnapshot(profile.storage);
    window.localStorage.setItem(activeProfileKey, normalizedName);
    bot.log?.("profile loaded", { profile: normalizedName });

    if (typeof bot.reload === "function") bot.reload();
    else if (typeof window.minibiaBotReload === "function") window.minibiaBotReload();
    else window.location.reload();
    return true;
  }

  function remove(name) {
    const normalizedName = String(name || "").trim();
    const profiles = readProfiles();
    if (!profiles[normalizedName]) return false;

    delete profiles[normalizedName];
    writeProfiles(profiles);
    if (getActiveProfileName() === normalizedName) {
      window.localStorage.removeItem(activeProfileKey);
    }
    refreshPanel();
    bot.log?.("profile deleted", { profile: normalizedName });
    return true;
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById("minibia-bot-profile-status");
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? "#ff8a80" : "";
  }

  function refreshPanel() {
    const select = document.getElementById("minibia-bot-profile-select");
    const deleteButton = document.getElementById("minibia-bot-profile-delete");
    const loadButton = document.getElementById("minibia-bot-profile-load");
    const saveButton = document.getElementById("minibia-bot-profile-save");
    if (!select) return;

    const names = getProfileNames();
    const activeName = getActiveProfileName();
    const previousValue = select.value;
    select.innerHTML = "";

    if (!names.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No saved profiles";
      select.appendChild(option);
      select.disabled = true;
    } else {
      names.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
      select.disabled = false;
      select.value = names.includes(activeName)
        ? activeName
        : names.includes(previousValue)
          ? previousValue
          : names[0];
    }

    const disabled = !names.length || !select.value;
    if (deleteButton) deleteButton.disabled = disabled;
    if (loadButton) loadButton.disabled = disabled;
    if (saveButton) saveButton.disabled = disabled;

    if (activeName && names.includes(activeName)) {
      setStatus(`Active profile: ${activeName}`);
    } else if (!names.length) {
      setStatus("Create a profile to save all current bot settings.");
    } else {
      setStatus("Select a profile, then Load or Save.");
    }
  }

  function injectPanel() {
    if (document.getElementById("minibia-bot-profiles-section")) {
      refreshPanel();
      return true;
    }

    const panel = document.getElementById("minibia-bot-panel");
    const content = panel?.querySelector?.(".mb-content") || panel;
    if (!content) return false;

    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-profiles-section";
    section.innerHTML = `
      <div class="mb-label">Profiles</div>
      <div class="mb-stack">
        <select id="minibia-bot-profile-select" class="mb-input"></select>
        <div class="mb-row" style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" id="minibia-bot-profile-new" class="mb-small-button">New</button>
          <button type="button" id="minibia-bot-profile-save" class="mb-small-button">Save</button>
          <button type="button" id="minibia-bot-profile-load" class="mb-small-button">Load</button>
          <button type="button" id="minibia-bot-profile-delete" class="mb-small-button">Delete</button>
        </div>
        <div id="minibia-bot-profile-status" class="mb-small-note"></div>
      </div>
    `;

    const firstSection = content.querySelector?.(".mb-section");
    if (firstSection) content.insertBefore(section, firstSection);
    else content.prepend(section);

    const select = section.querySelector("#minibia-bot-profile-select");
    section.querySelector("#minibia-bot-profile-new")?.addEventListener("click", () => {
      const name = window.prompt("New profile name:")?.trim();
      if (!name) return;
      try {
        create(name);
        select.value = name;
        setStatus(`Created and saved profile: ${name}`);
      } catch (error) {
        window.alert(error.message || String(error));
        setStatus(error.message || String(error), true);
      }
    });

    section.querySelector("#minibia-bot-profile-save")?.addEventListener("click", () => {
      const name = select.value;
      if (!name) return;
      try {
        save(name);
        setStatus(`Saved current settings to: ${name}`);
      } catch (error) {
        window.alert(error.message || String(error));
        setStatus(error.message || String(error), true);
      }
    });

    section.querySelector("#minibia-bot-profile-load")?.addEventListener("click", () => {
      const name = select.value;
      if (!name) return;
      try {
        setStatus(`Loading profile: ${name}...`);
        load(name);
      } catch (error) {
        window.alert(error.message || String(error));
        setStatus(error.message || String(error), true);
      }
    });

    section.querySelector("#minibia-bot-profile-delete")?.addEventListener("click", () => {
      const name = select.value;
      if (!name) return;
      if (!window.confirm(`Delete profile \"${name}\"?`)) return;
      remove(name);
      setStatus(`Deleted profile: ${name}`);
    });

    select?.addEventListener("change", refreshPanel);
    refreshPanel();
    return true;
  }

  let attempts = 0;
  const installTimer = window.setInterval(() => {
    attempts += 1;
    if (injectPanel() || attempts >= 80) window.clearInterval(installTimer);
  }, 100);

  bot.addCleanup?.(() => window.clearInterval(installTimer));
  bot.profiles = {
    create,
    save,
    load,
    delete: remove,
    list: getProfileNames,
    getActive: getActiveProfileName,
    refreshPanel,
  };
};
