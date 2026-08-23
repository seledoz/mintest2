(() => {
  const bundle = window.__minibiaBotBundle || window.__minibiaBotReloadBundle || {};

  function install() {
    const bot = window.minibiaBot;
    if (!bot || typeof bundle.installFireballV2Module !== "function") return false;
    if (!bot.fireballV2?.destroy) bundle.installFireballV2Module(bot);
    return !!bot.fireballV2?.destroy;
  }

  if (install()) return;

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 40) window.clearInterval(timerId);
  }, 250);
})();
