window.__minibiaBotBundle = window.__minibiaBotBundle || {};

(() => {
  const bundle = window.__minibiaBotBundle;
  const originalInstallPanel = bundle.installPanel;
  if (typeof originalInstallPanel !== "function" || originalInstallPanel.__autoTargetV2PanelWrapped) return;

  function ensureAutoTargetV2(bot) {
    if (!bot?.autoTargetV2 && typeof bundle.installAutoTargetV2Module === "function") {
      bundle.installAutoTargetV2Module(bot);
    }
    return bot?.autoTargetV2 || null;
  }

  function installToggle(bot) {
    const v1Toggle = document.getElementById("minibia-bot-auto-attack-enabled");
    const v1Label = v1Toggle?.closest?.("label");
    if (!v1Label) return false;

    let toggle = document.getElementById("minibia-bot-auto-target-v2-enabled");
    if (!toggle) {
      const label = document.createElement("label");
      label.className = "mb-toggle";
      label.innerHTML = '<input type="checkbox" id="minibia-bot-auto-target-v2-enabled" /><span>Auto Target 2.0</span>';
      v1Label.insertAdjacentElement("afterend", label);
      toggle = label.querySelector("#minibia-bot-auto-target-v2-enabled");
    }

    const v2 = ensureAutoTargetV2(bot);
    toggle.checked = !!v2?.status?.().running;

    if (toggle.dataset.autoTargetV2Bound !== "true") {
      toggle.dataset.autoTargetV2Bound = "true";
      toggle.addEventListener("change", () => {
        const currentV2 = ensureAutoTargetV2(bot);
        if (!currentV2) {
          toggle.checked = false;
          return;
        }

        if (toggle.checked) currentV2.start?.();
        else currentV2.stop?.();

        toggle.checked = !!currentV2.status?.().running;
        if (v1Toggle) v1Toggle.checked = !!bot.attack?.status?.().running;
      });
    }

    if (v1Toggle.dataset.autoTargetV2Bound !== "true") {
      v1Toggle.dataset.autoTargetV2Bound = "true";
      v1Toggle.addEventListener("change", () => {
        if (!v1Toggle.checked) return;
        const currentV2 = ensureAutoTargetV2(bot);
        if (currentV2?.status?.().running) currentV2.stop?.();
        if (toggle) toggle.checked = false;
      });
    }

    return true;
  }

  function wrappedInstallPanel(bot) {
    const result = originalInstallPanel(bot);
    const originalInject = bot?.ui?.inject;

    if (typeof originalInject === "function" && !originalInject.__autoTargetV2PanelWrapped) {
      const wrappedInject = function autoTargetV2PanelInject(...args) {
        const injectResult = originalInject.apply(this, args);
        installToggle(bot);
        return injectResult;
      };
      wrappedInject.__autoTargetV2PanelWrapped = true;
      bot.ui.inject = wrappedInject;
    }

    return result;
  }

  wrappedInstallPanel.__autoTargetV2PanelWrapped = true;
  bundle.installPanel = wrappedInstallPanel;
})();
