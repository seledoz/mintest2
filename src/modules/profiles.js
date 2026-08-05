window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installProfilesModule = function installProfilesModule(bot) {
  if (bot.profiles) {
    bot.profiles.refreshPanel?.();
    return bot.profiles;
  }

  const profilesKey = "minibiaBot.profiles.v1";
  const activeKey = "minibiaBot.profiles.active";
  const excluded = new Set([profilesKey, activeKey, "minibiaBot.github.token"]);

  const readProfiles = () => {
    try {
      const value = JSON.parse(localStorage.getItem(profilesKey) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (error) {
      console.error("[minibia-bot] profile read failed", error);
      return {};
    }
  };

  const writeProfiles = (profiles) => localStorage.setItem(profilesKey, JSON.stringify(profiles));
  const names = () => Object.keys(readProfiles()).sort((a, b) => a.localeCompare(b));
  const active = () => localStorage.getItem(activeKey) || "";
  const isSettingKey = (key) => String(key || "").startsWith("minibiaBot.") && !excluded.has(key);

  function capture() {
    const storage = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (isSettingKey(key)) storage[key] = localStorage.getItem(key);
    }
    return storage;
  }

  function apply(storage) {
    const remove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (isSettingKey(key)) remove.push(key);
    }
    remove.forEach((key) => localStorage.removeItem(key));
    Object.entries(storage || {}).forEach(([key, value]) => {
      if (isSettingKey(key) && typeof value === "string") localStorage.setItem(key, value);
    });
  }

  function refreshPanel() {
    const select = document.getElementById("minibia-bot-profile-select");
    if (!select) return;
    const list = names();
    const selected = select.value;
    const current = active();
    select.innerHTML = "";
    if (!list.length) {
      select.append(new Option("No saved profiles", ""));
      select.disabled = true;
    } else {
      list.forEach((name) => select.append(new Option(name, name)));
      select.disabled = false;
      select.value = list.includes(current) ? current : list.includes(selected) ? selected : list[0];
    }
    const disabled = !select.value;
    ["save", "load", "delete"].forEach((action) => {
      const button = document.getElementById(`minibia-bot-profile-${action}`);
      if (button) button.disabled = disabled;
    });
    const status = document.getElementById("minibia-bot-profile-status");
    if (status) status.textContent = current && list.includes(current)
      ? `Active profile: ${current}`
      : list.length ? "Select a profile, then Load or Save." : "Create a profile to save all bot settings.";
  }

  function save(name, requireNew = false) {
    name = String(name || "").trim();
    if (!name) throw new Error("Profile name is required");
    const profiles = readProfiles();
    if (requireNew && profiles[name]) throw new Error(`Profile \"${name}\" already exists`);
    profiles[name] = { name, savedAt: new Date().toISOString(), storage: capture() };
    writeProfiles(profiles);
    localStorage.setItem(activeKey, name);
    refreshPanel();
    return profiles[name];
  }

  function load(name) {
    const profile = readProfiles()[String(name || "").trim()];
    if (!profile) throw new Error("Profile was not found");
    apply(profile.storage);
    localStorage.setItem(activeKey, profile.name);
    if (typeof window.minibiaBotReload === "function") window.minibiaBotReload();
    else location.reload();
  }

  function remove(name) {
    name = String(name || "").trim();
    const profiles = readProfiles();
    if (!profiles[name]) return false;
    delete profiles[name];
    writeProfiles(profiles);
    if (active() === name) localStorage.removeItem(activeKey);
    refreshPanel();
    return true;
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
    section.id = "minibia-bot-profiles-section";
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
    content.prepend(section);

    const select = section.querySelector("#minibia-bot-profile-select");
    section.querySelector("#minibia-bot-profile-new").onclick = () => {
      const name = prompt("New profile name:")?.trim();
      if (!name) return;
      try { save(name, true); select.value = name; refreshPanel(); }
      catch (error) { alert(error.message || error); }
    };
    section.querySelector("#minibia-bot-profile-save").onclick = () => {
      try { save(select.value); } catch (error) { alert(error.message || error); }
    };
    section.querySelector("#minibia-bot-profile-load").onclick = () => {
      try { load(select.value); } catch (error) { alert(error.message || error); }
    };
    section.querySelector("#minibia-bot-profile-delete").onclick = () => {
      const name = select.value;
      if (name && confirm(`Delete profile \"${name}\"?`)) remove(name);
    };
    select.onchange = refreshPanel;
    refreshPanel();
    return true;
  }

  bot.profiles = { create: (name) => save(name, true), save, load, delete: remove, list: names, getActive: active, refreshPanel };

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (injectPanel() || attempts >= 100) clearInterval(timer);
  }, 100);
  bot.addCleanup?.(() => clearInterval(timer));
  return bot.profiles;
};

(() => {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const bot = window.minibiaBot;
    const installer = window.__minibiaBotBundle?.installProfilesModule;
    if (bot && typeof installer === "function") installer(bot);
    if (bot?.profiles || attempts >= 100) clearInterval(timer);
  }, 100);
})();
