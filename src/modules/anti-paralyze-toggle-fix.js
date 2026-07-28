(() => {
  function installCaveWaypointCompatibility(bot) {
    if (!bot?.cave) return false;

    if (typeof bot.cave.addCurrentPosition !== "function" && typeof bot.cave.addWaypointCurrentSpot === "function") {
      bot.cave.addCurrentPosition = (...args) => bot.cave.addWaypointCurrentSpot(...args);
    }

    if (typeof bot.cave.clearRoute !== "function" && typeof bot.cave.clearWaypoints === "function") {
      bot.cave.clearRoute = (...args) => bot.cave.clearWaypoints(...args);
    }

    return typeof bot.cave.addCurrentPosition === "function";
  }

  function install() {
    const bot = window.minibiaBot;
    installCaveWaypointCompatibility(bot);

    const toggle = document.getElementById("minibia-bot-anti-paralyze-enabled");
    const spellInput = document.getElementById("minibia-bot-anti-paralyze-spell");
    if (!bot?.antiParalyze || !toggle || !spellInput) return false;
    if (toggle.dataset.antiParalyzeToggleFix === "true") return true;

    toggle.dataset.antiParalyzeToggleFix = "true";

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const shouldEnable = !bot.antiParalyze.status().running;
      const spellWords = String(spellInput.value || "").trim();

      if (shouldEnable) {
        bot.antiParalyze.start({ spellWords });
      } else {
        bot.antiParalyze.stop();
      }

      toggle.checked = !!bot.antiParalyze.status().running;
    }, true);

    return true;
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 80) window.clearInterval(timerId);
  }, 100);
})();