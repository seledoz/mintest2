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
    if (["button", "submit", "reset"].includes(element.type)) return false;
    return element.matches("input, select, textarea");
  }

  function capturePanelControls() {
    const panel = document.getElementById("minibia-bot-panel");
    if (!panel) throw new Error("Bot panel was not found");
    const controls = {};
    panel.querySelectorAll("input, select, textarea").forEach((element) => {
      if (!isSavableControl(element)) return;
      controls[element.id] = (element.type === "checkbox" || element.type === "radio")
        ? { kind: element.type, checked: !!element.checked }
        : { kind: element.tagName.toLowerCase(), value: String(element.value ?? "") };
    });
    return controls;
  }

  function captureModuleLists() {
    const bot = window.minibiaBot;
    return {
      attackPriorityCreatureNames: Array.isArray(bot?.attackPriority?.config?.creatureNames)
        ? [...bot.attackPriority.config.creatureNames]
        : [],
      attackExcludeCreatureNames: Array.isArray(bot?.attackExclude?.config?.excludedCreatureNames)
        ? [...bot.attackExclude.config.excludedCreatureNames]
        : [],
      gmUnknownMonsterAllowlist: Array.isArray(bot?.gmKillSwitch?.unknownMonsterAllowlist)
        ? [...bot.gmKillSwitch.unknownMonsterAllowlist]
        : [],
    };
  }

  function captureModuleConfigs() {
    const bot = window.minibiaBot;
    const fireballConfig = bot?.fireball?.status?.()?.config || bot?.fireball?.config;
    const fireballV2Config = bot?.fireballV2?.status?.()?.config || bot?.fireballV2?.config;
    return {
      fireball: fireballConfig && typeof fireballConfig === "object" ? { ...fireballConfig } : null,
      fireballV2: fireballV2Config && typeof fireballV2Config === "object" ? { ...fireballV2Config } : null,
    };
  }

  function restoreModuleLists(lists) {
    if (!lists || typeof lists !== "object") return { restored: 0, missing: 0 };
    const bot = window.minibiaBot;
    let restored = 0;
    let missing = 0;
    if (Array.isArray(lists.attackPriorityCreatureNames)) {
      if (typeof bot?.attackPriority?.setNames === "function") {
        bot.attackPriority.setNames(lists.attackPriorityCreatureNames);
        restored += 1;
      } else missing += 1;
    }
    if (Array.isArray(lists.attackExcludeCreatureNames)) {
      if (typeof bot?.attackExclude?.setNames === "function") {
        bot.attackExclude.setNames(lists.attackExcludeCreatureNames);
        restored += 1;
      } else missing += 1;
    }
    if (Array.isArray(lists.gmUnknownMonsterAllowlist)) {
      if (typeof bot?.gmKillSwitch?.setUnknownMonsterAllowlist === "function") {
        bot.gmKillSwitch.setUnknownMonsterAllowlist(lists.gmUnknownMonsterAllowlist);
        restored += 1;
      } else missing += 1;
    }
    return { restored, missing };
  }

  function restoreSingleModuleConfig(module, savedConfig) {
    if (!savedConfig || typeof savedConfig !== "object") return false;
    if (typeof module?.updateConfig !== "function") return false;
    const nextConfig = { ...savedConfig };
    const enabled = !!nextConfig.enabled;
    delete nextConfig.enabled;
    module.updateConfig(nextConfig);
    if (enabled) module.start?.();
    else module.stop?.();
    return true;
  }

  function restoreModuleConfigs(configs) {
    if (!configs || typeof configs !== "object") return { restored: 0, missing: 0 };
    const bot = window.minibiaBot;
    let restored = 0;
    let missing = 0;
    if (configs.fireball && typeof configs.fireball === "object") {
      if (restoreSingleModuleConfig(bot?.fireball, configs.fireball)) restored += 1;
      else missing += 1;
    }
    if (configs.fireballV2 && typeof configs.fireballV2 === "object") {
      if (restoreSingleModuleConfig(bot?.fireballV2, configs.fireballV2)) restored += 1;
      else missing += 1;
    }
    return { restored, missing };
  }

  function dispatchControlEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function applyPanelControls(controls) {
    const entries = Object.entries(controls || {});
    let restored = 0;
    let missing = 0;

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

  function savedChecked(controls, id) {
    const saved = controls?.[id];
    return saved && (saved.kind === "checkbox" || saved.kind === "radio")
      ? !!saved.checked
      : null;
  }

  function reconcileCombatRuntime(controls) {
    const bot = window.minibiaBot;
    if (!bot) return;

    const autoTargetV2Enabled = savedChecked(controls, "minibia-bot-auto-target-v2-enabled");
    const autoAttackEnabled = savedChecked(controls, "minibia-bot-auto-attack-enabled");
    const highestHpEnabled = savedChecked(controls, "minibia-bot-auto-attack-highest-hp");

    if (typeof highestHpEnabled === "boolean" && typeof bot.attackPriority?.updateConfig === "function") {
      bot.attackPriority.updateConfig({ highestHpEnabled });
    }

    if (typeof autoTargetV2Enabled === "boolean" && bot.autoTargetV2) {
      if (autoTargetV2Enabled) bot.autoTargetV2.start?.();
      else bot.autoTargetV2.stop?.();
    } else if (typeof autoAttackEnabled === "boolean" && bot.attack) {
      if (autoAttackEnabled) bot.attack.start?.();
      else bot.attack.stop?.();
    }

    if (typeof highestHpEnabled === "boolean" && typeof bot.attackPriority?.updateConfig === "function") {
      bot.attackPriority.updateConfig({ highestHpEnabled });
      if (highestHpEnabled) bot.attackPriority.trySelectPriorityTarget?.();
    }
  }

  function scheduleCombatRuntimeReconcile(controls) {
    reconcileCombatRuntime(controls);
    window.setTimeout(() => reconcileCombatRuntime(controls), 100);
    window.setTimeout(() => reconcileCombatRuntime(controls), 500);
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
    const lists = captureModuleLists();
    const moduleConfigs = captureModuleConfigs();
    profiles[normalized] = { name: normalized, savedAt: new Date().toISOString(), controls, lists, moduleConfigs };
    writeProfiles(profiles);
    window.localStorage.setItem(ACTIVE_KEY, normalized);
    refreshPanel(normalized);
    updateStatus(`Saved profile: ${normalized} (${Object.keys(controls).length} controls + priority/exclude lists + Fireball/Fireball 2.0 settings)`);
    return profiles[normalized];
  }

  function loadProfile(name) {
    const normalized = String(name || "").trim();
    const profile = readProfiles()[normalized];
    if (!profile) throw new Error("Profile was not found");
    if (!profile.controls || !Object.keys(profile.controls).length) {
      throw new Error("This profile uses the old format. Configure the bot and press Save on this profile once.");
    }

    const listResult = restoreModuleLists(profile.lists);
    const controlResult = applyPanelControls(profile.controls);
    const moduleConfigResult = restoreModuleConfigs(profile.moduleConfigs);
    scheduleCombatRuntimeReconcile(profile.controls);

    const result = {
      restored: controlResult.restored,
      missing: controlResult.missing,
      listsRestored: listResult.restored,
      listsMissing: listResult.missing,
      moduleConfigsRestored: moduleConfigResult.restored,
      moduleConfigsMissing: moduleConfigResult.missing,
    };
    window.localStorage.setItem(ACTIVE_KEY, normalized);
    refreshPanel(normalized);
    updateStatus(`Loaded profile: ${normalized} (${result.restored} controls, ${result.listsRestored} lists, ${result.moduleConfigsRestored} module configs restored)`);
    return result;
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
