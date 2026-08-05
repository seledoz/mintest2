(() => {
  function installProfilesPanel() {
    const bot = window.minibiaBot;
    const installer = window.__minibiaBotBundle?.installProfilesModule;
    const panel = document.getElementById("minibia-bot-panel");

    if (!bot || !panel || typeof installer !== "function") return false;

    try {
      installer(bot);
      return !!document.getElementById("minibia-bot-profiles-section") || !!bot.profiles;
    } catch (error) {
      console.error("[minibia-bot] profiles panel bootstrap failed", error);
      return false;
    }
  }

  if (installProfilesPanel()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (installProfilesPanel() || attempts >= 160) {
      window.clearInterval(timer);
    }
  }, 100);
})();
