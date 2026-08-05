(() => {
  const SELECT_ID = "minibia-bot-profile-select";

  function installFix() {
    const select = document.getElementById(SELECT_ID);
    if (!select) return false;
    if (select.dataset.profileSelectionFix === "true") return true;

    select.dataset.profileSelectionFix = "true";

    // The original change listener rebuilds the dropdown and forces it back
    // to the active profile. Intercept the change first so another saved
    // profile can remain selected until Load is pressed.
    select.addEventListener("change", (event) => {
      event.stopImmediatePropagation();

      const selected = String(select.value || "").trim();
      const disabled = !selected;
      ["save", "load", "delete"].forEach((action) => {
        const button = document.getElementById(`minibia-bot-profile-${action}`);
        if (button) button.disabled = disabled;
      });

      const status = document.getElementById("minibia-bot-profile-status");
      const active = window.localStorage.getItem("minibiaBot.profiles.active") || "";
      if (status) {
        status.textContent = selected
          ? selected === active
            ? `Active profile: ${selected}`
            : `Selected profile: ${selected} — press Load to activate`
          : "Select a profile, then Load or Save.";
      }
    }, true);

    return true;
  }

  installFix();
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (installFix() || attempts >= 600) window.clearInterval(timer);
  }, 100);
})();
