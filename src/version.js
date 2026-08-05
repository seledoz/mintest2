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
