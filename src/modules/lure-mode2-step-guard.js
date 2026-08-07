window.__minibiaBotBundle = window.__minibiaBotBundle || {};

(function installLureMode2StepGuard() {
  const LOST_MONSTER_GRACE_MS = 10000;
  const WATCH_TIMEOUT_MS = 2500;

  function getPosition() {
    const raw = window.minibiaBot?.getPlayerPosition?.() || window.gameClient?.player?.__position;
    if (!raw) return null;
    const x = Number(raw.x), y = Number(raw.y), z = Number(raw.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function distance(a, b) {
    if (!a || !b || a.z !== b.z) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function stopMovement() {
    const client = window.gameClient;
    const targets = [client?.world?.pathfinder, client?.player, client?.world].filter(Boolean);
    const methodNames = [
      "stop", "cancel", "clear", "clearPath", "stopWalking", "cancelWalking",
      "stopAutoWalk", "cancelAutoWalk", "abort", "halt", "reset"
    ];
    let stopped = false;
    targets.forEach((target) => {
      methodNames.forEach((name) => {
        if (typeof target?.[name] !== "function") return;
        try {
          target[name]();
          stopped = true;
        } catch (_) {}
      });
    });
    return stopped;
  }

  function install() {
    const bot = window.minibiaBot;
    const pf = window.gameClient?.world?.pathfinder;
    if (!bot?.lureMode || !pf || typeof pf.findPath !== "function") return false;
    if (pf.__minibiaLureMode2StepGuardInstalled) return true;

    const underlyingFindPath = pf.findPath.bind(pf);
    const state = {
      stepActive: false,
      stepStartedAt: 0,
      stepOrigin: null,
      guardUntil: 0,
      lureLatched: false,
      lastMonsterSeenAt: 0,
      rafId: null,
    };

    function lureStatus() {
      try {
        return bot.lureMode?.getLureStatus?.() || bot.lureMode?.status?.()?.lure || null;
      } catch (_) {
        return null;
      }
    }

    function resetStep() {
      state.stepActive = false;
      state.stepStartedAt = 0;
      state.stepOrigin = null;
      if (state.rafId != null) cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    function resetLatch() {
      state.lureLatched = false;
      state.lastMonsterSeenAt = 0;
    }

    function refreshLatch(status) {
      const enabled = !!bot.lureMode?.config?.enabled;
      const mode = Number(bot.lureMode?.config?.mode) === 2 ? 2 : 1;
      if (!enabled || mode !== 2 || status?.readyToEngage || status?.clearingPack || status?.hasTarget || status?.combatActive) {
        resetLatch();
        return;
      }
      if (Number(status?.monsterCount || 0) > 0) {
        state.lureLatched = true;
        state.lastMonsterSeenAt = Date.now();
      } else if (state.lureLatched && Date.now() - state.lastMonsterSeenAt > LOST_MONSTER_GRACE_MS) {
        resetLatch();
      }
    }

    function watchRealStep(stepDelayMs) {
      if (!state.stepActive) return;
      const now = Date.now();
      const current = getPosition();
      if (current && state.stepOrigin && distance(current, state.stepOrigin) >= 1) {
        stopMovement();
        state.guardUntil = now + Math.max(100, Math.trunc(Number(stepDelayMs) || 450));
        bot.log?.("lure mode 2 guard stopped after one real tile", {
          from: state.stepOrigin,
          to: current,
          nextStepAt: state.guardUntil,
        });
        resetStep();
        return;
      }
      if (now - state.stepStartedAt >= WATCH_TIMEOUT_MS) {
        stopMovement();
        resetStep();
        return;
      }
      state.rafId = requestAnimationFrame(() => watchRealStep(stepDelayMs));
    }

    pf.findPath = function lureMode2OneTileGuard(...args) {
      const status = lureStatus();
      refreshLatch(status);

      const enabled = !!bot.lureMode?.config?.enabled;
      const mode2 = Number(bot.lureMode?.config?.mode) === 2;
      if (!enabled || !mode2) {
        resetStep();
        resetLatch();
        return underlyingFindPath(...args);
      }

      const now = Date.now();
      const missingLatchedMonster = state.lureLatched && Number(status?.monsterCount || 0) === 0;
      if (state.stepActive || now < state.guardUntil || missingLatchedMonster || status?.shouldHoldWalking) {
        stopMovement();
        return null;
      }

      const shouldPace = !!status?.luring && Number(status?.monsterCount || 0) > 0;
      if (!shouldPace) return underlyingFindPath(...args);

      const origin = getPosition();
      const result = underlyingFindPath(...args);
      if (origin) {
        state.stepActive = true;
        state.stepStartedAt = now;
        state.stepOrigin = origin;
        state.rafId = requestAnimationFrame(() => watchRealStep(status?.stepDelayMs));
      }
      return result;
    };

    pf.__minibiaLureMode2StepGuardInstalled = true;
    bot.lureMode2StepGuard = {
      status: () => ({ ...state }),
      stopMovement,
    };
    bot.addCleanup?.(() => {
      resetStep();
      if (pf.findPath === pf.findPath) {
        try { pf.findPath = underlyingFindPath; } catch (_) {}
      }
      delete pf.__minibiaLureMode2StepGuardInstalled;
    });
    return true;
  }

  let attempts = 0;
  const timerId = window.setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 80) window.clearInterval(timerId);
  }, 100);
  install();
})();