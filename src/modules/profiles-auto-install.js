(() => {
  function install() {
    const bot = window.minibiaBot;
    const installer = window.__minibiaBotBundle?.installProfilesModule;
    if (!bot || typeof installer !== "function") return false;

    if (!bot.profiles) {
      installer(bot);
    } else {
      bot.profiles.refreshPanel?.();
    }

    return !!document.getElementById("minibia-bot-profiles-section") || !!bot.profiles;
  }

  if (install()) return;

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 100) {
      window.clearInterval(timer);
    }
  }, 100);
})();
