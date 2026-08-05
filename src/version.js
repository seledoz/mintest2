window.__minibiaBotBundle = window.__minibiaBotBundle || {};

/* ============================================================
   Informacoes de versao — preenchidas pelo build.sh

   O script de build (build.sh) substitui os placeholders
   %%BRANCH%%, %%COMMIT%% e %%DATE%% pelos valores reais
   do git no momento da construcao do bundle pz-bot.js.

   Para desenvolvimento local sem build, os placeholders
   permanecem como estao e o codigo usa "unknown" como fallback.
   ============================================================ */
window.__minibiaBotBundle.versionInfo = {
  number: "2.0.0",
  branch: "%%BRANCH%%",
  commit: "%%COMMIT%%",
  date: "%%DATE%%"
};

// Capture the Anti Paralyze toggle before its module-level change handler.
// The module synchronizes the UI while saving the spell, which otherwise
// resets a newly checked box before start() is called.
if (!document.__minNewAntiParalyzeToggleFixInstalled) {
  document.__minNewAntiParalyzeToggleFixInstalled = true;
  document.addEventListener(
    "change",
    (event) => {
      const toggle = event.target;
      if (!(toggle instanceof HTMLInputElement)) return;
      if (toggle.id !== "minibia-bot-anti-paralyze-enabled") return;

      const antiParalyze = window.minibiaBot?.antiParalyze;
      if (!antiParalyze) return;

      const shouldEnable = toggle.checked;
      const spellWords = String(
        document.getElementById("minibia-bot-anti-paralyze-spell")?.value || ""
      ).trim();

      event.stopImmediatePropagation();

      if (shouldEnable) {
        antiParalyze.start({ spellWords });
      } else {
        antiParalyze.stop();
      }

      toggle.checked = !!antiParalyze.status?.().running;
    },
    true
  );
}

// Lure Mode 2 safety guard.
// Prevents repeated cavebot path requests from stacking several one-square
// paths before the first movement is registered. It also briefly holds the
// character when the followed pack slips outside the lure detection box so
// the monsters can catch back up instead of being abandoned.
if (!window.__minNewLureMode2StepGuardInstalled) {
  window.__minNewLureMode2StepGuardInstalled = true;

  const guardState = {
    pathfinder: null,
    wrappedFindPath: null,
    waitingForMove: false,
    stepStartPosition: null,
    nextStepAt: 0,
    packHoldUntil: 0,
  };

  const readPosition = () => {
    const value = window.minibiaBot?.getPlayerPosition?.() || window.gameClient?.player?.__position;
    const x = Number(value?.x), y = Number(value?.y), z = Number(value?.z);
    if (![x, y, z].every(Number.isFinite)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  };

  const movedAtLeastOneSquare = (from, to) => {
    if (!from || !to || from.z !== to.z) return false;
    return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) >= 1;
  };

  const limitPathToOneStep = (path) => {
    if (Array.isArray(path)) return path.length > 1 ? path.slice(0, 1) : path;
    if (Array.isArray(path?.path)) return { ...path, path: path.path.slice(0, 1) };
    if (Array.isArray(path?.steps)) return { ...path, steps: path.steps.slice(0, 1) };
    return path;
  };

  const pathHasStep = (path) => {
    if (Array.isArray(path)) return path.length > 0;
    if (Array.isArray(path?.path)) return path.path.length > 0;
    if (Array.isArray(path?.steps)) return path.steps.length > 0;
    return !!path;
  };

  window.setInterval(() => {
    const bot = window.minibiaBot;
    const pf = window.gameClient?.world?.pathfinder;
    if (!bot?.lureMode || !pf || typeof pf.findPath !== "function") return;
    if (pf.findPath === guardState.wrappedFindPath) return;

    const originalFindPath = pf.findPath.bind(pf);
    const wrappedFindPath = function guardedLureMode2FindPath(...args) {
      const status = bot.lureMode?.status?.();
      const lure = status?.lure;
      const mode2Active = !!status?.running && Number(lure?.mode) === 2;

      if (!mode2Active) {
        guardState.waitingForMove = false;
        guardState.stepStartPosition = null;
        guardState.nextStepAt = 0;
        guardState.packHoldUntil = 0;
        return originalFindPath(...args);
      }

      const now = Date.now();
      const currentPosition = readPosition();

      if (lure?.readyToEngage || lure?.clearingPack) {
        guardState.waitingForMove = false;
        guardState.stepStartPosition = null;
        guardState.packHoldUntil = 0;
        return originalFindPath(...args);
      }

      if (Number(lure?.monsterCount) > 0) {
        guardState.packHoldUntil = now + 5000;
      }

      if (guardState.waitingForMove) {
        if (!movedAtLeastOneSquare(guardState.stepStartPosition, currentPosition)) {
          return null;
        }
        guardState.waitingForMove = false;
        guardState.stepStartPosition = null;
        guardState.nextStepAt = now + Math.max(100, Number(lure?.stepDelayMs) || 450);
      }

      const packTemporarilyOutsideDetection = Number(lure?.monsterCount) === 0 && now < guardState.packHoldUntil;
      const packOutsideMaxDistance = Number.isFinite(Number(lure?.farthestDistance))
        && Number(lure.farthestDistance) > Number(lure?.maxDistance);

      if (packTemporarilyOutsideDetection || packOutsideMaxDistance || now < guardState.nextStepAt) {
        return null;
      }

      const path = limitPathToOneStep(originalFindPath(...args));
      if (lure?.luring && pathHasStep(path)) {
        guardState.waitingForMove = true;
        guardState.stepStartPosition = currentPosition;
      }
      return path;
    };

    wrappedFindPath.__minNewLureMode2StepGuard = true;
    guardState.pathfinder = pf;
    guardState.wrappedFindPath = wrappedFindPath;
    pf.findPath = wrappedFindPath;
  }, 100);
}

// Add a Delete Selected action to the GitHub Waypoints section.
if (!window.__minNewGithubWaypointDeleteInstalled) {
  window.__minNewGithubWaypointDeleteInstalled = true;

  const installGithubWaypointDeleteButton = () => {
    const bot = window.minibiaBot;
    const library = bot?.githubWaypointLibrary;
    const section = document.getElementById("minibia-bot-github-waypoints-section");
    const select = document.getElementById("minibia-bot-github-waypoints-select");
    const refreshButton = document.getElementById("minibia-bot-github-waypoints-refresh");
    if (!bot || !library || !section || !select || !refreshButton) return false;
    if (document.getElementById("minibia-bot-github-waypoints-delete")) return true;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mb-small-button";
    button.id = "minibia-bot-github-waypoints-delete";
    button.textContent = "Delete Selected";
    refreshButton.insertAdjacentElement("beforebegin", button);

    button.addEventListener("click", async () => {
      const path = String(select.value || "").trim();
      const optionText = select.options[select.selectedIndex]?.textContent || path;
      const scriptName = optionText.replace(/\s*\(\d+\)\s*$/, "").trim() || path;
      const status = document.getElementById("minibia-bot-github-waypoints-status");
      const setStatus = (message) => { if (status) status.textContent = message; };

      try {
        if (!path) throw new Error("Choose a script to delete");
        const token = String(library.getToken?.() || "").trim();
        if (!token) throw new Error("Save GitHub Setup first");
        if (!window.confirm(`Delete GitHub waypoint script "${scriptName}"?\n\nThis cannot be undone.`)) return;

        button.disabled = true;
        setStatus(`GitHub: deleting ${scriptName}...`);

        const owner = "seledoz";
        const repo = "mintest2";
        const branch = "main";
        const encodedPath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        };

        const readResponse = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, {
          headers,
          cache: "no-store",
        });
        if (!readResponse.ok) throw new Error(`GitHub read failed: HTTP ${readResponse.status}`);
        const file = await readResponse.json();
        if (!file?.sha) throw new Error("Selected script SHA missing");

        const deleteResponse = await fetch(url, {
          method: "DELETE",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Delete waypoint script: ${scriptName}`,
            sha: file.sha,
            branch,
          }),
        });

        if (!deleteResponse.ok) {
          let details = "";
          try {
            const data = await deleteResponse.json();
            details = data?.message ? ` - ${data.message}` : "";
          } catch (error) {}
          throw new Error(`GitHub delete failed: HTTP ${deleteResponse.status}${details}`);
        }

        await library.refreshUi?.();
        setStatus(`GitHub: deleted ${scriptName}`);
        bot.log?.("GitHub waypoint script deleted", { name: scriptName, path });
      } catch (error) {
        setStatus(`GitHub: ${error?.message || error}`);
        bot.log?.("GitHub waypoint delete failed", error?.message || error);
      } finally {
        button.disabled = false;
      }
    });

    return true;
  };

  let deleteButtonAttempts = 0;
  const deleteButtonTimer = window.setInterval(() => {
    deleteButtonAttempts += 1;
    if (installGithubWaypointDeleteButton() || deleteButtonAttempts >= 120) {
      window.clearInterval(deleteButtonTimer);
    }
  }, 250);
}
