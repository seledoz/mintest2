window.__minibiaBotBundle = window.__minibiaBotBundle || {};

/* ============================================================
   Informacoes de versao — preenchidas pelo build.sh

   O script de build (build.sh) substitui os placeholders
   main, b6b33c7 e 2026-09-06T02:15:34Z pelos valores reais
   do git no momento da construcao do bundle pz-bot.js.

   Para desenvolvimento local sem build, os placeholders
   permanecem como estao e o codigo usa "unknown" como fallback.
   ============================================================ */
window.__minibiaBotBundle.versionInfo = {
  number: "2.0.0",
  branch: "main",
  commit: "b6b33c7",
  date: "2026-09-06T02:15:34Z"
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
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.createBot = function createBot() {
  const cleanups = [];
  const defaultAlarmAudioSrc = "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3f/ACA_Allertor_125_video.ogv/ACA_Allertor_125_video.ogv.480p.vp9.webm";
  const alarmAudioSrcStorageKey = "minibiaBot.audio.alarmSrc";
  const recentSentChats = [];
  const reconnectButtonSelectors = [
    "button",
    "[role=\"button\"]",
    "input[type=\"button\"]",
    "input[type=\"submit\"]",
    "a",
    ".button",
    ".btn",
  ];
  let alarmAudio = null;
  let reconnectObserver = null;
  let reconnectPollTimerId = null;
  let lastReconnectClickAt = 0;

  const MAX_LOG_ENTRIES = 2000;
  const logBuffer = [];
  let debugEnabled = false;

  function addCleanup(fn) {
    if (typeof fn === "function") {
      cleanups.push(fn);
    }
  }

  function runCleanups() {
    while (cleanups.length) {
      const fn = cleanups.pop();
      try {
        fn();
      } catch (error) {
        console.error("[minibia-bot] cleanup failed", error);
      }
    }
  }

  function getStoredAlarmAudioSrc() {
    try {
      const value = window.localStorage.getItem(alarmAudioSrcStorageKey);
      return value == null ? defaultAlarmAudioSrc : JSON.parse(value);
    } catch (error) {
      return defaultAlarmAudioSrc;
    }
  }

  function setStoredAlarmAudioSrc(src) {
    window.localStorage.setItem(alarmAudioSrcStorageKey, JSON.stringify(src));
    return src;
  }

  function destroyAlarmAudio() {
    if (!alarmAudio) {
      return;
    }

    try {
      alarmAudio.pause();
      alarmAudio.removeAttribute("src");
      alarmAudio.load();
    } catch (error) {
      console.error("[minibia-bot] audio cleanup failed", error);
    }

    alarmAudio = null;
  }

  function getAlarmAudio() {
    const src = getStoredAlarmAudioSrc();
    if (!src) {
      return null;
    }

    if (!alarmAudio) {
      alarmAudio = new Audio(src);
      alarmAudio.preload = "auto";
    } else if (alarmAudio.src !== src) {
      alarmAudio.pause();
      alarmAudio = new Audio(src);
      alarmAudio.preload = "auto";
    }

    return alarmAudio;
  }

  function normalizeChatText(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function rememberSentChat(text) {
    const normalized = normalizeChatText(text);
    if (!normalized) {
      return;
    }

    recentSentChats.push({
      text: normalized,
      at: Date.now(),
    });

    const maxEntries = 20;
    if (recentSentChats.length > maxEntries) {
      recentSentChats.splice(0, recentSentChats.length - maxEntries);
    }
  }

  function isRecentSentChat(text, withinMs = 45000) {
    const normalized = normalizeChatText(text);
    if (!normalized) {
      return false;
    }

    const cutoff = Date.now() - withinMs;
    for (let index = recentSentChats.length - 1; index >= 0; index -= 1) {
      const entry = recentSentChats[index];
      if (entry.at < cutoff) {
        continue;
      }

      if (entry.text === normalized) {
        return true;
      }
    }

    return false;
  }

  function normalizeUiText(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function getSkillWindowValue(skillNames = []) {
    for (const skillName of skillNames) {
      const value =
        document.querySelector(`#skill-window div[skill="${skillName}"] .skill`)?.textContent?.trim() ||
        null;
      if (value) {
        return value;
      }
    }

    return null;
  }

  function parseNumberText(value) {
    if (value == null) {
      return null;
    }

    const normalized = String(value).replace(/[^\d.-]/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function getElementUiText(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    return normalizeUiText(
      element.textContent ||
      element.innerText ||
      element.getAttribute("value") ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    );
  }

  function findReconnectElement() {
    for (const selector of reconnectButtonSelectors) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (!isVisibleElement(candidate)) {
          continue;
        }

        if (getElementUiText(candidate) === "reconnect") {
          return candidate;
        }
      }
    }

    return null;
  }

  function tryClickReconnect() {
    const now = Date.now();
    if (now - lastReconnectClickAt < 3000) {
      return false;
    }

    const reconnectElement = findReconnectElement();
    if (!reconnectElement) {
      return false;
    }

    reconnectElement.click();
    lastReconnectClickAt = now;
    console.log("[minibia-bot] clicked reconnect");
    return true;
  }

  function startReconnectWatcher() {
    if (reconnectObserver || reconnectPollTimerId) {
      return;
    }

    const runCheck = () => {
      try {
        tryClickReconnect();
      } catch (error) {
        console.error("[minibia-bot] reconnect watcher failed", error);
      }
    };

    reconnectObserver = new MutationObserver(runCheck);
    reconnectObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "value"],
    });

    reconnectPollTimerId = window.setInterval(runCheck, 2000);
    runCheck();
  }

  function stopReconnectWatcher() {
    if (reconnectObserver) {
      reconnectObserver.disconnect();
      reconnectObserver = null;
    }

    if (reconnectPollTimerId) {
      window.clearInterval(reconnectPollTimerId);
      reconnectPollTimerId = null;
    }
  }

  startReconnectWatcher();

  const raw = window.__minibiaBotBundle.versionInfo || {};
  const version = Object.freeze({
    number: raw.number || "0.0.0",
    branch: raw.branch || "unknown",
    commit: raw.commit || "unknown",
    date: raw.date || "unknown",
  });

  return {
    version,
    addCleanup,
    destroy() {
      if (this.panic?.stop) {
        this.panic.stop();
      }

      if (this.rune?.stop) {
        this.rune.stop({ persistEnabled: false });
      }

      if (this.heal?.stop) {
        this.heal.stop({ persistEnabled: false });
      }

      if (this.invisible?.stop) {
        this.invisible.stop({ persistEnabled: false });
      }

      if (this.attack?.stop) {
        this.attack.stop({ persistEnabled: false });
      }

      if (this.cave?.stop) {
        this.cave.stop({ persistEnabled: false });
      }

      if (this.equipRing?.stop) {
        this.equipRing.stop({ persistEnabled: false });
      }

      if (this.eat?.stop) {
        this.eat.stop({ persistEnabled: false });
      }

      if (this.talk?.stop) {
        this.talk.stop({ persistEnabled: false });
      }

      if (this.ui?.destroy) {
        this.ui.destroy();
      }

      stopReconnectWatcher();
      destroyAlarmAudio();
      runCleanups();
    },
    getLoggerPosition() {
      try {
        const pos = window.gameClient?.player?.getPosition?.();
        if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
          return { x: Math.trunc(pos.x), y: Math.trunc(pos.y), z: Math.trunc(pos.z) };
        }
      } catch (e) {}
      return null;
    },
    pushLogEntry(level, args) {
      const now = Date.now();
      const d = new Date(now);
      const time = d.toLocaleTimeString("pt-BR", { hour12: false }) + "." +
        String(d.getMilliseconds()).padStart(3, "0");
      const pos = this.getLoggerPosition();
      const text = String(args[0] || "");
      const data = args.length > 1 ? args[1] : null;

      logBuffer.push({ at: now, time, position: pos, text, data, level });
      if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.shift();

      const posStr = pos ? `[${pos.x},${pos.y},${pos.z}] ` : "";
      const label = level === "debug" ? "[DEBUG] " : "";
      const rest = args.map((a) => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
      console.log(`[minibia-bot] ${label}${posStr}${rest}`);
    },
    log(...args) {
      this.pushLogEntry("info", args);
    },
    logDebug(...args) {
      if (!debugEnabled) return;
      this.pushLogEntry("debug", args);
    },
    logger: {
      getLogs() { return [...logBuffer]; },
      getDebugEnabled() { return debugEnabled; },
      setDebugEnabled(enabled) { debugEnabled = !!enabled; },
      clear() { logBuffer.length = 0; },
      downloadLogs() {
        const logs = [...logBuffer];
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `minibia-bot-logs-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
    },
    storage: {
      get(key, fallback = null) {
        try {
          const value = window.localStorage.getItem(key);
          return value == null ? fallback : JSON.parse(value);
        } catch (error) {
          return fallback;
        }
      },
      set(key, value) {
        window.localStorage.setItem(key, JSON.stringify(value));
        return value;
      },
      remove(key) {
        window.localStorage.removeItem(key);
      },
    },
    getPlayerPosition() {
      return window.gameClient?.player?.getPosition?.() || null;
    },
    getPlayerState() {
      return window.gameClient?.player?.state || null;
    },
    getPlayerName() {
      return (
        String(
          this.getPlayerState()?.name ||
          window.gameClient?.player?.name ||
          window.gameClient?.player?.state?.name ||
          ""
        ).trim() || null
      );
    },
    getPlayerSnapshot() {
      const playerState = this.getPlayerState() || {};
      const levelText = getSkillWindowValue(["level"]);
      const magicLevelText = getSkillWindowValue(["magic", "magic-level", "mlvl"]);
      const experienceText = getSkillWindowValue(["experience", "exp"]);
      const capacityText = getSkillWindowValue(["capacity", "cap"]);

      return {
        name: this.getPlayerName(),
        level: parseNumberText(playerState.level) ?? parseNumberText(levelText),
        magicLevel: parseNumberText(playerState.magicLevel ?? playerState.magic_level) ?? parseNumberText(magicLevelText),
        health: parseNumberText(playerState.health),
        maxHealth: parseNumberText(playerState.maxHealth),
        mana: parseNumberText(playerState.mana),
        maxMana: parseNumberText(playerState.maxMana),
        experience: parseNumberText(playerState.experience ?? playerState.exp) ?? parseNumberText(experienceText),
        capacity: parseNumberText(playerState.capacity ?? playerState.cap) ?? parseNumberText(capacityText),
        food: getSkillWindowValue(["food"]),
      };
    },
    sendChat(text) {
      const channelManager = window.gameClient?.interface?.channelManager;
      if (!channelManager || !text) {
        return false;
      }

      channelManager.sendMessageText(text);
      rememberSentChat(text);
      this.log("sent chat:", text);
      return true;
    },
    isRecentSentChat(text, withinMs) {
      return isRecentSentChat(text, withinMs);
    },
    clickReconnect() {
      return tryClickReconnect();
    },
    clickHotbar(index) {
      const button = window.gameClient?.interface?.hotbarManager?.slots?.[index]?.canvas?.canvas;
      if (!button) {
        return false;
      }

      button.click();
      return true;
    },
    getAlarmAudioSrc() {
      return getStoredAlarmAudioSrc();
    },
    setAlarmAudioSrc(src) {
      const nextSrc = String(src || "").trim();
      if (!nextSrc) {
        return false;
      }

      setStoredAlarmAudioSrc(nextSrc);
      destroyAlarmAudio();
      this.log("alarm audio updated", nextSrc);
      return true;
    },
    unlockAudio() {
      try {
        const audio = getAlarmAudio();
        if (!audio) {
          return false;
        }

        audio.muted = true;
        const playResult = audio.play();

        if (playResult && typeof playResult.then === "function") {
          playResult
            .then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = false;
            })
            .catch((error) => {
              audio.muted = false;
              this.log("audio unlock failed", error?.message || error);
            });
        } else {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }

        return true;
      } catch (error) {
        console.error("[minibia-bot] audio unlock failed", error);
        return false;
      }
    },
    playAlarm() {
      try {
        const audio = getAlarmAudio();
        if (!audio) {
          return false;
        }

        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        const playResult = audio.play();

        if (playResult && typeof playResult.catch === "function") {
          playResult.catch((error) => {
            this.log("alarm playback failed", error?.message || error);
          });
        }

        return true;
      } catch (error) {
        console.error("[minibia-bot] alarm failed", error);
        return false;
      }
    },
  };
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPzModule = function installPzModule(bot) {
  const homeStorageKey = "minibiaBot.pz.home";

  function getLoadedTiles() {
    const chunks = window.gameClient?.world?.chunks || [];
    const tiles = [];

    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;

      for (const tile of chunk.tiles) {
        if (tile?.__position) {
          tiles.push(tile);
        }
      }
    }

    return tiles;
  }

  function hasPzFlag(tile) {
    return !!tile && ((tile.flags || 0) & 1) !== 0;
  }

  function getPzCandidates() {
    const me = bot.getPlayerPosition();
    if (!me) return [];

    return getLoadedTiles()
      .filter((tile) => hasPzFlag(tile) && tile.__position?.z === me.z)
      .map((tile) => {
        const p = tile.__position;
        return {
          tile,
          x: p.x,
          y: p.y,
          z: p.z,
          flags: tile.flags || 0,
          dist: Math.abs(p.x - me.x) + Math.abs(p.y - me.y),
        };
      })
      .sort((a, b) => a.dist - b.dist);
  }

  function goToTile(tile) {
    if (!tile?.__position) return false;

    const from = bot.getPlayerPosition();
    if (!from) return false;

    const p = tile.__position;
    const to = new Position(p.x, p.y, p.z);

    try {
      window.gameClient?.world?.pathfinder?.findPath?.(from, to);
      bot.log("pathing to", { x: p.x, y: p.y, z: p.z, flags: tile.flags });
      return true;
    } catch (error) {
      bot.log("pathing failed", { x: p.x, y: p.y, z: p.z, error: error?.message });
      return false;
    }
  }

  function goToNearestPz(maxAttempts = 20) {
    const candidates = getPzCandidates().slice(0, maxAttempts);

    if (!candidates.length) {
      bot.log("No PZ candidates found");
      return false;
    }

    for (const candidate of candidates) {
      if (goToTile(candidate.tile)) {
        bot.log("selected PZ", {
          x: candidate.x,
          y: candidate.y,
          z: candidate.z,
          flags: candidate.flags,
          dist: candidate.dist,
        });
        return true;
      }
    }

    bot.log("No PZ candidate accepted by pathfinder");
    return false;
  }

  function setHomePz(x, y, z) {
    const home = { x, y, z };
    bot.storage.set(homeStorageKey, home);
    bot.log("home PZ set", home);
    return home;
  }

  function setHomePzCurrentSpot() {
    const pos = bot.getPlayerPosition();
    if (!pos) {
      bot.log("Could not read current position");
      return null;
    }

    return setHomePz(pos.x, pos.y, pos.z);
  }

  function getHomePz() {
    return bot.storage.get(homeStorageKey, null);
  }

  function clearHomePz() {
    bot.storage.remove(homeStorageKey);
    bot.log("home PZ cleared");
  }

  function getNearestPzTo(x, y, z) {
    const candidates = getLoadedTiles()
      .filter((tile) => hasPzFlag(tile) && tile.__position?.z === z)
      .map((tile) => {
        const p = tile.__position;
        return {
          tile,
          x: p.x,
          y: p.y,
          z: p.z,
          flags: tile.flags || 0,
          dist: Math.abs(p.x - x) + Math.abs(p.y - y),
        };
      })
      .sort((a, b) => a.dist - b.dist);

    return candidates[0] || null;
  }

  function goToHomePz() {
    const home = getHomePz();
    if (!home) {
      bot.log("No home PZ set");
      return false;
    }

    const candidate = getNearestPzTo(home.x, home.y, home.z);
    if (!candidate) {
      bot.log("No loaded PZ found near saved home", home);
      return false;
    }

    bot.log("home candidate", {
      x: candidate.x,
      y: candidate.y,
      z: candidate.z,
      flags: candidate.flags,
      distFromHome: candidate.dist,
    });

    return goToTile(candidate.tile);
  }

  function printPzCandidates(limit = 10) {
    const rows = getPzCandidates()
      .slice(0, limit)
      .map((candidate) => ({
        x: candidate.x,
        y: candidate.y,
        z: candidate.z,
        flags: candidate.flags,
        dist: candidate.dist,
      }));

    console.table(rows);
    return rows;
  }

  bot.pz = {
    getLoadedTiles,
    getPzCandidates,
    goToTile,
    goToNearestPz,
    setHomePz,
    setHomePzCurrentSpot,
    getHomePz,
    clearHomePz,
    getNearestPzTo,
    goToHomePz,
    printPzCandidates,
  };

  bot.goToNearestPz = goToNearestPz;
  bot.setHomePz = setHomePz;
  bot.setHomePzCurrentSpot = setHomePzCurrentSpot;
  bot.getHomePz = getHomePz;
  bot.clearHomePz = clearHomePz;
  bot.goToHomePz = goToHomePz;
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installXrayModule = function installXrayModule(bot) {
  const configStorageKey = "minibiaBot.xray.config";
  const overlayRootId = "minibia-bot-xray-overlay";
  const overlayStyleId = "minibia-bot-xray-overlay-style";
  const overlayState = {
    running: false,
    timerId: null,
  };
  const config = Object.assign(
    {
      overlayEnabled: false,
      selectedFloor: null,
    },
    bot.storage.get(configStorageKey, {})
  );

  config.selectedFloor = normalizeSelectedFloor(config.selectedFloor);

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizeSelectedFloor(value) {
    if (value == null || value === "" || value === "all") {
      return null;
    }

    const floor = Number(value);
    if (!Number.isFinite(floor)) {
      return null;
    }

    return Math.trunc(floor);
  }

  function isWithinVisibleRange(me, pos) {
    if (!me || !pos) {
      return false;
    }

    const dx = Math.abs(pos.x - me.x);
    const dy = Math.abs(pos.y - me.y);
    return dx <= 8 && dy <= 6;
  }

  function getTrackedCreatures() {
    const myState = bot.getPlayerState();
    const myId = window.gameClient?.player?.id;
    const myName = normalizeName(myState?.name);

    return Object.values(window.gameClient?.world?.activeCreatures || {}).filter((creature) => {
      if (!creature) return false;
      if (creature.id === myId) return false;

      const name = normalizeName(creature.name);
      if (name && name === myName) return false;

      return true;
    });
  }

  function getVisibleCreatures() {
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    // Keep the visible query strict; panic logic relies on this staying screen-limited.
    return getTrackedCreatures().filter((creature) => isWithinVisibleRange(me, creature.__position));
  }

  function getVisiblePlayers(options = {}) {
    const { sameFloorOnly = false } = options;
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getVisibleCreatures().filter((creature) => {
      if (creature?.type !== 0) {
        return false;
      }

      if (!sameFloorOnly) {
        return true;
      }

      return creature.__position?.z === me.z;
    });
  }

  function getVisibleMonsters(options = {}) {
    const { sameFloorOnly = false } = options;
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getVisibleCreatures().filter((creature) => {
      if (creature?.type === 0) {
        return false;
      }

      if (!sameFloorOnly) {
        return true;
      }

      return creature.__position?.z === me.z;
    });
  }

  function readCreatureHealth(creature) {
    if (!creature) {
      return null;
    }

    const current = [
      creature.health,
      creature.hp,
      creature.currentHealth,
      creature.state?.health,
    ].find((value) => Number.isFinite(Number(value)));

    const max = [
      creature.maxHealth,
      creature.maxHp,
      creature.maximumHealth,
      creature.state?.maxHealth,
    ].find((value) => Number.isFinite(Number(value)));

    const percent = [
      creature.healthPercent,
      creature.hpPercent,
      creature.healthpercentage,
      creature.state?.healthPercent,
    ].find((value) => Number.isFinite(Number(value)));

    if (current != null && max != null) {
      return `${Number(current)}/${Number(max)} HP`;
    }

    if (percent != null) {
      return `${Math.round(Number(percent))}% HP`;
    }

    if (current != null) {
      return `${Number(current)} HP`;
    }

    return null;
  }

  function getCreatureLabel(creature) {
    if (creature?.name) {
      return creature.name;
    }

    return creature?.type === 0 ? "Player" : "Mob";
  }

  function isSpecialMonster(creature) {
    if (!creature || creature.type === 0) {
      return false;
    }

    const name = normalizeName(creature.name);
    return name.includes("alpha") || name.includes("ancient");
  }

  function getOverlayCreatures() {
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getTrackedCreatures().filter((creature) => {
      const pos = creature?.__position;
      if (!pos || pos.z == null) {
        return false;
      }

      if (config.selectedFloor != null && pos.z !== config.selectedFloor) {
        return false;
      }

      if (pos.z !== me.z) {
        return isWithinVisibleRange(me, pos);
      }

      // Players should always keep an X-Ray marker on the current floor,
      // including while they are inside the normal visible viewport.
      if (creature?.type === 0) {
        return true;
      }

      return !isWithinVisibleRange(me, pos);
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getSameFloorOffscreenMarkerText(creature, healthLabel) {
    return healthLabel
      ? `${getCreatureLabel(creature)} ${healthLabel}`
      : `${getCreatureLabel(creature)}`;
  }

  function ensureOverlayStyle() {
    if (document.getElementById(overlayStyleId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = overlayStyleId;
    style.textContent = `
      #${overlayRootId} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 999998;
      }

      #${overlayRootId} .mb-xray-marker {
        position: fixed;
        transform: translate(-50%, -50%);
        padding: 2px 6px;
        border: 1px solid rgba(255, 211, 128, 0.85);
        border-radius: 999px;
        background: rgba(65, 24, 12, 0.72);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
        color: #ffe7ae;
        font: 11px/1.2 Verdana, sans-serif;
        white-space: nowrap;
      }

      #${overlayRootId} .mb-xray-marker.mb-xray-marker-offscreen {
        border-color: rgba(123, 235, 178, 0.92);
        background: rgba(11, 61, 43, 0.8);
        color: #d8ffea;
      }

      #${overlayRootId} .mb-xray-marker.mb-xray-marker-player {
        border-color: rgba(255, 92, 92, 0.95);
        background: rgba(92, 10, 10, 0.84);
        color: #ffd6d6;
      }

      #${overlayRootId} .mb-xray-marker.mb-xray-marker-special-monster {
        border-color: rgba(190, 112, 255, 0.95);
        background: rgba(66, 17, 95, 0.86);
        color: #f1dcff;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlayRoot() {
    let root = document.getElementById(overlayRootId);
    if (root) {
      return root;
    }

    root = document.createElement("div");
    root.id = overlayRootId;
    document.body.appendChild(root);
    return root;
  }

  function destroyOverlayElements() {
    document.getElementById(overlayRootId)?.remove();
    document.getElementById(overlayStyleId)?.remove();
  }

  function getViewportRect() {
    const canvases = Array.from(document.querySelectorAll("canvas"))
      .map((canvas) => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 200 && rect.height >= 150)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));

    return canvases[0]?.rect || null;
  }

  function renderOverlay() {
    if (!overlayState.running) {
      return;
    }

    const root = ensureOverlayRoot();
    const me = bot.getPlayerPosition();
    const viewportRect = getViewportRect();
    const creatures = getOverlayCreatures();
    root.innerHTML = "";

    if (!me || !viewportRect || !creatures.length) {
      return;
    }

    const tileWidth = viewportRect.width / 17;
    const tileHeight = viewportRect.height / 13;
    const edgePadding = 48;

    creatures.forEach((creature) => {
      const pos = creature?.__position;
      if (!pos) return;

      const dx = pos.x - me.x;
      const dy = pos.y - me.y;
      const healthLabel = readCreatureHealth(creature);
      const marker = document.createElement("div");
      marker.className = "mb-xray-marker";

      if (creature?.type === 0) {
        marker.classList.add("mb-xray-marker-player");
      } else if (isSpecialMonster(creature)) {
        marker.classList.add("mb-xray-marker-special-monster");
      }

      if (pos.z === me.z) {
        const isVisible = isWithinVisibleRange(me, pos);
        if (!isVisible) {
          marker.classList.add("mb-xray-marker-offscreen");
        }
        marker.textContent = getSameFloorOffscreenMarkerText(creature, healthLabel);
        marker.style.left = `${clamp(
          viewportRect.left + ((dx + 8.5) * tileWidth),
          viewportRect.left + edgePadding,
          viewportRect.right - edgePadding
        )}px`;
        marker.style.top = `${clamp(
          viewportRect.top + ((dy + 6.5) * tileHeight),
          viewportRect.top + edgePadding,
          viewportRect.bottom - edgePadding
        )}px`;
      } else {
        const floorOffset = me.z - pos.z;
        const floorLabel = floorOffset === 0 ? "0" : floorOffset > 0 ? `+${floorOffset}` : `${floorOffset}`;
        marker.textContent = healthLabel
          ? `${getCreatureLabel(creature)} (${floorLabel}) ${healthLabel}`
          : `${getCreatureLabel(creature)} (${floorLabel})`;
        marker.style.left = `${viewportRect.left + ((dx + 8.5) * tileWidth)}px`;
        marker.style.top = `${viewportRect.top + ((dy + 6.5) * tileHeight)}px`;
      }

      root.appendChild(marker);
    });
  }

  function startOverlay() {
    config.overlayEnabled = true;
    persistConfig();

    if (overlayState.running) {
      return false;
    }

    overlayState.running = true;
    ensureOverlayStyle();
    renderOverlay();
    overlayState.timerId = window.setInterval(renderOverlay, 500);
    return true;
  }

  function stopOverlay() {
    config.overlayEnabled = false;
    persistConfig();

    if (!overlayState.running && overlayState.timerId == null) {
      return false;
    }

    overlayState.running = false;
    if (overlayState.timerId != null) {
      window.clearInterval(overlayState.timerId);
      overlayState.timerId = null;
    }

    destroyOverlayElements();
    return true;
  }

  function setOverlayEnabled(enabled) {
    const nextEnabled = !!enabled;

    if (nextEnabled) {
      if (overlayState.running) {
        config.overlayEnabled = true;
        persistConfig();
        return true;
      }

      return startOverlay();
    }

    if (!overlayState.running) {
      config.overlayEnabled = false;
      persistConfig();
      destroyOverlayElements();
      return true;
    }

    return stopOverlay();
  }

  function setSelectedFloor(floor) {
    config.selectedFloor = normalizeSelectedFloor(floor);
    persistConfig();

    if (overlayState.running) {
      renderOverlay();
    }

    return config.selectedFloor;
  }

  function status() {
    return {
      visibleCreatures: getVisibleCreatures().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      visiblePlayers: getVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visiblePlayersCurrentFloor: getVisiblePlayers({ sameFloorOnly: true }).map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visibleMonsters: getVisibleMonsters().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      visibleMonstersCurrentFloor: getVisibleMonsters({ sameFloorOnly: true }).map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      overlayCreatures: getOverlayCreatures().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      config: { ...config },
      overlayRunning: overlayState.running,
    };
  }

  bot.xray = {
    getVisibleCreatures,
    getVisiblePlayers,
    getVisibleMonsters,
    getOverlayCreatures,
    startOverlay,
    stopOverlay,
    setOverlayEnabled,
    setSelectedFloor,
    status,
    config,
  };

  if (config.overlayEnabled) {
    startOverlay();
  } else {
    destroyOverlayElements();
  }
  bot.addCleanup(stopOverlay);
};window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPanicModule = function installPanicModule(bot) {
  const configStorageKey = "minibiaBot.panic.config";
  const state = {
    running: false,
    timerId: null,
    lastHealth: null,
    lastTriggerAt: 0,
    lastDamageEventKey: null,
    pendingReturnOrigin: null,
    pendingReturnModules: null,
    returnNotBeforeAt: 0,
    lastThreatAt: 0,
    lastReturnAttemptAt: 0,
  };

  const config = Object.assign(
    {
      tickMs: 200,
      triggerCooldownMs: 4000,
      returnToOriginEnabled: false,
      returnDelayMs: 300000,
      returnDelayJitterMs: 30000,
      returnRetryCooldownMs: 2000,
      unknownPlayerEnabled: false,
      healthLossEnabled: false,
      trustedNames: [],
      gameMasterNames: [],
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizeDelayMs(value, fallback = 0) {
    const next = Math.trunc(Number(value));
    return Number.isFinite(next) ? Math.max(0, next) : fallback;
  }

  function normalizePosition(position) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    const z = Number(position?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return { x, y, z };
  }

  function isSamePosition(left, right) {
    return !!left && !!right && left.x === right.x && left.y === right.y && left.z === right.z;
  }

  function getTrustedNames() {
    return Array.from(
      new Set(
        (config.trustedNames || [])
          .map((name) => normalizeName(name))
          .filter(Boolean)
      )
    );
  }

  function getGameMasterNames() {
    return Array.from(
      new Set(
        (config.gameMasterNames || [])
          .map((name) => normalizeName(name))
          .filter(Boolean)
      )
    );
  }

  function getVisiblePlayers() {
    const me = bot.getPlayerPosition();
    const players = bot.xray?.getVisiblePlayers?.() || [];
    if (!me) {
      return players;
    }

    return players.filter((creature) => {
      const z = Number(creature?.__position?.z);
      return Number.isFinite(z) && Math.abs(z - me.z) <= 1;
    });
  }

  function getUnknownVisiblePlayers() {
    const trusted = new Set(getTrustedNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && !trusted.has(name);
    });
  }

  function getTrustedVisiblePlayers() {
    const trusted = new Set(getTrustedNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && trusted.has(name);
    });
  }

  function getVisibleGameMasters() {
    const gameMasters = new Set(getGameMasterNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && gameMasters.has(name);
    });
  }

  function getRecentChannelMessages() {
    return (window.gameClient?.interface?.channelManager?.channels || []).flatMap((channel) =>
      (channel?.__contents || []).map((entry) => ({
        channelName: channel?.name || null,
        message: String(entry?.message || ""),
        time: entry?.__time || null,
      }))
    );
  }

  function parseDamageMessage(entry) {
    const match = entry.message.match(
      /^You lose\s+(\d+)\s+hitpoints\s+due to an attack by\s+(.+?)\.$/i
    );

    if (!match) {
      return null;
    }

    return {
      amount: Number(match[1]),
      attackerName: match[2].trim(),
      time: entry.time,
      channelName: entry.channelName,
      key: `${entry.time || "no-time"}|${entry.message}`,
      message: entry.message,
    };
  }

  function getLatestDamageEvent() {
    const messages = getRecentChannelMessages()
      .map(parseDamageMessage)
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = a.time ? Date.parse(a.time) : 0;
        const bTime = b.time ? Date.parse(b.time) : 0;
        return bTime - aTime;
      });

    return messages[0] || null;
  }

  function getReturnDelayMs() {
    const baseDelayMs = normalizeDelayMs(config.returnDelayMs, 0);
    const jitterMs = normalizeDelayMs(config.returnDelayJitterMs, 0);
    if (!jitterMs) {
      return baseDelayMs;
    }

    const randomOffset = Math.floor(Math.random() * ((jitterMs * 2) + 1)) - jitterMs;
    return Math.max(0, baseDelayMs + randomOffset);
  }

  function clearPendingReturn() {
    state.pendingReturnOrigin = null;
    state.pendingReturnModules = null;
    state.returnNotBeforeAt = 0;
    state.lastThreatAt = 0;
    state.lastReturnAttemptAt = 0;
  }

  function snapshotInterruptedModules() {
    return {
      caveRunning: !!bot.cave?.status?.().running,
      equipRingRunning: !!bot.equipRing?.status?.().running,
    };
  }

  function armPendingReturn(now = Date.now(), origin = normalizePosition(bot.getPlayerPosition())) {
    if (!config.returnToOriginEnabled) {
      clearPendingReturn();
      return;
    }

    if (!state.pendingReturnOrigin && origin) {
      state.pendingReturnOrigin = origin;
      state.pendingReturnModules = snapshotInterruptedModules();
    }

    if (!state.pendingReturnOrigin) {
      return;
    }

    state.lastThreatAt = now;
    state.returnNotBeforeAt = now + getReturnDelayMs();
  }

  function isReturnCoastClear() {
    return !getVisibleGameMasters().length && !getUnknownVisiblePlayers().length;
  }

  function restoreInterruptedModules() {
    if (state.pendingReturnModules?.caveRunning) {
      bot.cave?.start?.();
    }

    if (state.pendingReturnModules?.equipRingRunning) {
      bot.equipRing?.start?.();
      bot.ui?.refreshEquipRingStatus?.();
    }
  }

  function tryReturnToOrigin(now = Date.now()) {
    if (!config.returnToOriginEnabled || !state.pendingReturnOrigin || !state.returnNotBeforeAt) {
      return false;
    }

    if (now < state.returnNotBeforeAt) {
      return false;
    }

    if (!isReturnCoastClear()) {
      return false;
    }

    if (now - state.lastReturnAttemptAt < normalizeDelayMs(config.returnRetryCooldownMs, 2000)) {
      return false;
    }

    const currentPosition = normalizePosition(bot.getPlayerPosition());
    if (isSamePosition(currentPosition, state.pendingReturnOrigin)) {
      bot.log("panic return completed", {
        origin: state.pendingReturnOrigin,
        threatAgeMs: now - state.lastThreatAt,
      });
      restoreInterruptedModules();
      clearPendingReturn();
      return true;
    }

    state.lastReturnAttemptAt = now;
    const moved =
      !!bot.cave?.goToPosition?.(state.pendingReturnOrigin) ||
      !!bot.pz?.goToTile?.({ __position: state.pendingReturnOrigin });

    if (moved) {
      bot.log("panic returning to origin", {
        origin: state.pendingReturnOrigin,
        threatAgeMs: now - state.lastThreatAt,
      });
      return true;
    }

    bot.log("panic return pathing failed", { origin: state.pendingReturnOrigin });
    return false;
  }

  function triggerPanic(reason, details = {}) {
    const now = Date.now();
    armPendingReturn(now);

    if (now - state.lastTriggerAt < config.triggerCooldownMs) {
      return false;
    }

    state.lastTriggerAt = now;
    bot.playAlarm?.();
    bot.log("panic triggered", { reason, ...details });

    if (bot.cave?.stop) {
      bot.cave.stop({ persistEnabled: false });
    }

    if (bot.equipRing?.stop) {
      bot.equipRing.stop({ persistEnabled: false });
      bot.ui?.refreshEquipRingStatus?.();
    }

    return !!bot.pz?.goToHomePz?.();
  }

  function triggerGameMasterKillSwitch(players) {
    const detectedPlayers = (players || []).map((player) => player?.name).filter(Boolean);

    bot.playAlarm?.();
    bot.log("game master kill switch triggered", { players: detectedPlayers });

    if (bot.rune?.stop) {
      bot.rune.stop();
    }

    if (bot.eat?.stop) {
      bot.eat.stop();
    }

    if (bot.invisible?.stop) {
      bot.invisible.stop();
    }

    if (bot.magicShield?.stop) {
      bot.magicShield.stop();
    }

    if (bot.cave?.stop) {
      bot.cave.stop();
    }

    if (bot.attack?.stop) {
      bot.attack.stop();
    }

    if (bot.equipRing?.stop) {
      bot.equipRing.stop();
    }

    clearPendingReturn();
    config.unknownPlayerEnabled = false;
    config.healthLossEnabled = false;
    persistConfig();
    stop();

    bot.ui?.refreshPanicStatus?.();
    bot.ui?.refreshRuneStatus?.();
    bot.ui?.refreshAutoEatStatus?.();
    bot.ui?.refreshAutoInvisibleStatus?.();
    bot.ui?.refreshAutoMagicShieldStatus?.();
    bot.ui?.refreshAutoAttackStatus?.();
    bot.ui?.refreshCaveStatus?.();
    bot.ui?.refreshEquipRingStatus?.();
    return true;
  }

  function checkGameMasters() {
    if (!getGameMasterNames().length) {
      return false;
    }

    const visibleGameMasters = getVisibleGameMasters();
    if (!visibleGameMasters.length) {
      return false;
    }

    return triggerGameMasterKillSwitch(visibleGameMasters);
  }

  function checkUnknownPlayers() {
    if (!config.unknownPlayerEnabled) {
      return false;
    }

    const unknownPlayers = getUnknownVisiblePlayers();
    if (!unknownPlayers.length) {
      return false;
    }

    return triggerPanic("unknown-player", {
      players: unknownPlayers.map((player) => player.name),
    });
  }

  function checkHealthLoss() {
    if (!config.healthLossEnabled) {
      return false;
    }

    const playerState = bot.getPlayerState();
    const currentHealth = Number(playerState?.health ?? 0);

    if (state.lastHealth == null) {
      state.lastHealth = currentHealth;
      return false;
    }

    const lostHealth = currentHealth < state.lastHealth;
    state.lastHealth = currentHealth;

    if (!lostHealth) {
      return false;
    }

    const latestDamageEvent = getLatestDamageEvent();
    if (latestDamageEvent && latestDamageEvent.key !== state.lastDamageEventKey) {
      state.lastDamageEventKey = latestDamageEvent.key;

      const trustedNames = new Set(getTrustedNames());
      const attackerName = normalizeName(latestDamageEvent.attackerName);

      if (attackerName && trustedNames.has(attackerName)) {
        bot.log("ignored health-loss panic because attacker is trusted", {
          attacker: latestDamageEvent.attackerName,
          amount: latestDamageEvent.amount,
          currentHealth,
        });
        return false;
      }

      return triggerPanic("health-loss", {
        currentHealth,
        attacker: latestDamageEvent.attackerName,
        amount: latestDamageEvent.amount,
      });
    }

    const unknownPlayers = getUnknownVisiblePlayers();
    if (!unknownPlayers.length) {
      const trustedPlayers = getTrustedVisiblePlayers();
      if (trustedPlayers.length) {
        bot.log("ignored health-loss panic because only trusted players are nearby", {
          players: trustedPlayers.map((player) => player.name),
          currentHealth,
        });
        return false;
      }
    }

    return triggerPanic("health-loss", { currentHealth });
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      const triggered = checkGameMasters() || checkUnknownPlayers() || checkHealthLoss();
      if (!triggered) {
        tryReturnToOrigin();
      }
    } finally {
      scheduleNextTick();
    }
  }

  function shouldRun() {
    return !!(getGameMasterNames().length || config.unknownPlayerEnabled || config.healthLossEnabled);
  }

  function start() {
    if (state.running) {
      return false;
    }

    state.running = true;
    state.lastHealth = Number(bot.getPlayerState()?.health ?? 0);
    state.lastDamageEventKey = getLatestDamageEvent()?.key || null;
    bot.log("panic runner started", { ...config });
    tick();
    return true;
  }

  function stop() {
    if (!state.running && state.timerId == null) {
      state.lastHealth = null;
      return false;
    }

    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    state.lastHealth = null;
    state.lastDamageEventKey = null;
    clearPendingReturn();
    bot.log("panic runner stopped");
    return true;
  }

  function syncRunningState() {
    if (shouldRun()) {
      start();
    } else {
      stop();
    }
  }

  function updateConfig(nextConfig = {}) {
    const next = { ...nextConfig };

    if (Array.isArray(next.trustedNames)) {
      next.trustedNames = next.trustedNames
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    if (Array.isArray(next.gameMasterNames)) {
      next.gameMasterNames = next.gameMasterNames
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    if ("triggerCooldownMs" in next) {
      next.triggerCooldownMs = normalizeDelayMs(next.triggerCooldownMs, config.triggerCooldownMs);
    }

    if ("returnDelayMs" in next) {
      next.returnDelayMs = normalizeDelayMs(next.returnDelayMs, config.returnDelayMs);
    }

    if ("returnDelayJitterMs" in next) {
      next.returnDelayJitterMs = normalizeDelayMs(next.returnDelayJitterMs, config.returnDelayJitterMs);
    }

    if ("returnRetryCooldownMs" in next) {
      next.returnRetryCooldownMs = normalizeDelayMs(
        next.returnRetryCooldownMs,
        config.returnRetryCooldownMs
      );
    }

    Object.assign(config, next);
    if (!config.returnToOriginEnabled) {
      clearPendingReturn();
    }
    persistConfig();
    syncRunningState();
    bot.log("panic runner config updated", { ...config });
    return { ...config };
  }

  function status() {
    return {
      running: state.running,
      config: {
        ...config,
        trustedNames: [...config.trustedNames],
        gameMasterNames: [...config.gameMasterNames],
      },
      visiblePlayers: getVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      unknownVisiblePlayers: getUnknownVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      trustedVisiblePlayers: getTrustedVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visibleGameMasters: getVisibleGameMasters().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      latestDamageEvent: getLatestDamageEvent(),
      lastTriggerAt: state.lastTriggerAt,
      pendingReturn: state.pendingReturnOrigin
        ? {
            origin: { ...state.pendingReturnOrigin },
            modules: state.pendingReturnModules ? { ...state.pendingReturnModules } : null,
            returnNotBeforeAt: state.returnNotBeforeAt,
            lastThreatAt: state.lastThreatAt,
            lastReturnAttemptAt: state.lastReturnAttemptAt,
            coastClear: isReturnCoastClear(),
          }
        : null,
    };
  }

  if (shouldRun()) {
    start();
  }

  bot.panic = {
    start,
    stop,
    status,
    updateConfig,
    getVisiblePlayers,
    getUnknownVisiblePlayers,
    getTrustedVisiblePlayers,
    getVisibleGameMasters,
    getTrustedNames,
    getGameMasterNames,
    config,
  };
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installRuneModule = function installRuneModule(bot) {
  const configStorageKey = "minibiaBot.rune.config";
  const state = {
    running: false,
    timerId: null,
    watchdogId: null,
    lastTickAt: 0,
    tickInProgress: false,
    lastRuneAt: 0,
    lastSendFailureAt: 0,
    consecutiveSendFailures: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 100,
      minHpPercent: 50,
      minFoodSeconds: 30,
      runeSpellWords: "adori vita vis",
      runeManaCost: 600,
      runeCooldownMs: 2100,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 100;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function readStats() {
    const playerState = bot.getPlayerState();

    const hp = playerState
      ? { current: playerState.health ?? 0, max: playerState.maxHealth ?? 0 }
      : null;

    const mana = playerState
      ? { current: playerState.mana ?? 0, max: playerState.maxMana ?? 0 }
      : null;

    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    let food = null;
    if (foodText) {
      const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
      food = match
        ? {
            text: foodText,
            seconds: Number(match[1]) * 60 + Number(match[2]),
          }
        : { text: foodText, seconds: null };
    }

    return { hp, mana, food };
  }

  function getGateStatus(now = Date.now()) {
    const { hp, mana } = readStats();
    if (!hp || !mana) {
      return {
        hasStats: false,
        enoughHp: false,
        enoughMana: false,
        enoughFood: true,
        cooldownReady: false,
        cooldownRemainingMs: config.runeCooldownMs,
        canMakeRune: false,
      };
    }

    const hpPercent = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    const enoughHp = hpPercent >= config.minHpPercent;
    const enoughMana = mana.current >= config.runeManaCost;
    const enoughFood = true;
    const cooldownElapsedMs = now - state.lastRuneAt;
    const cooldownRemainingMs = Math.max(0, config.runeCooldownMs - cooldownElapsedMs);
    const cooldownReady = cooldownRemainingMs === 0;

    return {
      hasStats: true,
      enoughHp,
      enoughMana,
      enoughFood,
      cooldownReady,
      cooldownRemainingMs,
      canMakeRune: enoughHp && enoughMana && cooldownReady,
    };
  }

  function canMakeRune(now = Date.now()) {
    return getGateStatus(now).canMakeRune;
  }

  function getSendRetryDelayMs() {
    if (state.consecutiveSendFailures <= 2) return 250;
    if (state.consecutiveSendFailures <= 10) return 500;
    return 1000;
  }

  function sendRuneSpell(spellWords) {
    const spell = String(spellWords || "").trim();
    if (!spell) return false;

    const gameClient = window.gameClient;
    const channelManager = gameClient?.interface?.channelManager;

    const candidates = [
      [channelManager, channelManager?.sendMessageText, "channelManager.sendMessageText"],
      [bot, bot.sendChat, "bot.sendChat"],
      [gameClient, gameClient?.sendChat, "gameClient.sendChat"],
      [channelManager, channelManager?.sendMessage, "channelManager.sendMessage"],
      [channelManager, channelManager?.say, "channelManager.say"],
    ];

    for (const [context, sender, label] of candidates) {
      if (typeof sender !== "function") continue;

      try {
        const result = sender.call(context, spell);
        if (result !== false) {
          state.consecutiveSendFailures = 0;
          state.lastSendFailureAt = 0;
          return true;
        }
      } catch (error) {
        bot.log("rune spell chat method failed", { method: label, error: String(error) });
      }
    }

    return false;
  }

  function tryMakeRune(now = Date.now()) {
    const gateStatus = getGateStatus(now);
    if (!gateStatus.canMakeRune) return false;

    if (state.lastSendFailureAt > 0 && now - state.lastSendFailureAt < getSendRetryDelayMs()) {
      return false;
    }

    const sent = sendRuneSpell(config.runeSpellWords);
    if (sent) {
      state.lastRuneAt = Date.now();
      return true;
    }

    state.consecutiveSendFailures += 1;
    state.lastSendFailureAt = Date.now();

    if (state.consecutiveSendFailures === 1 || state.consecutiveSendFailures % 10 === 0) {
      bot.log("rune spell send failed, will retry", {
        mana: gateStatus.hasStats ? readStats().mana?.current : null,
        requiredMana: config.runeManaCost,
        spell: config.runeSpellWords,
        failures: state.consecutiveSendFailures,
        channelManagerAvailable: !!window.gameClient?.interface?.channelManager,
        sendMessageTextAvailable:
          typeof window.gameClient?.interface?.channelManager?.sendMessageText === "function",
      });
    }
    return false;
  }

  function clearTickTimer() {
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
  }

  function scheduleNextTick() {
    if (!state.running) return;
    clearTickTimer();
    state.timerId = window.setTimeout(() => {
      state.timerId = null;
      tick();
    }, Math.max(25, Number(config.tickMs) || 100));
  }

  function runImmediateTick() {
    if (!state.running) return;
    clearTickTimer();
    tick();
  }

  function handleResume() {
    if (document.hidden) return;
    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) return;
    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) return;
    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function startWatchdog() {
    if (state.watchdogId != null) return;
    state.watchdogId = window.setInterval(() => {
      if (!state.running || state.tickInProgress) return;
      const staleForMs = Date.now() - state.lastTickAt;
      if (state.lastTickAt === 0 || staleForMs >= 2000 || state.timerId == null) {
        bot.log("rune loop watchdog restarting stalled timer", { staleForMs });
        runImmediateTick();
      }
    }, 1000);
  }

  function stopWatchdog() {
    if (state.watchdogId != null) {
      window.clearInterval(state.watchdogId);
      state.watchdogId = null;
    }
  }

  function tick() {
    if (!state.running || state.tickInProgress) return;
    state.tickInProgress = true;
    state.lastTickAt = Date.now();

    try {
      tryMakeRune();
    } catch (error) {
      bot.log("rune tick failed", error?.message || error);
    } finally {
      state.tickInProgress = false;
      state.lastTickAt = Date.now();
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 100;
    persistConfig();

    if (state.running) {
      bot.log("rune maker already running");
      runImmediateTick();
      return false;
    }

    state.running = true;
    state.lastTickAt = Date.now();
    state.lastSendFailureAt = 0;
    state.consecutiveSendFailures = 0;
    attachResumeListeners();
    startWatchdog();
    bot.log("rune maker started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;
    state.tickInProgress = false;
    clearTickTimer();
    stopWatchdog();
    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("rune maker stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      stats: readStats(),
      gates: getGateStatus(),
      lastRuneAt: state.lastRuneAt,
      lastTickAt: state.lastTickAt,
      watchdogRunning: state.watchdogId != null,
      consecutiveSendFailures: state.consecutiveSendFailures,
      lastSendFailureAt: state.lastSendFailureAt,
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    config.tickMs = 100;
    persistConfig();
    bot.log("rune config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) start();

  bot.rune = {
    start,
    stop,
    status,
    readStats,
    getGateStatus,
    canMakeRune,
    tryMakeRune,
    config,
    updateConfig,
  };

  bot.startRuneLoop = start;
  bot.stopRuneLoop = stop;
};window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installHealModule = function installHealModule(bot) {
  const configStorageKey = "minibiaBot.heal.config";
  const state = {
    running: false,
    timerId: null,
    lastHpHealAt: 0,
    lastManaHealAt: 0,
    lastHpAttemptAt: 0,
    lastManaAttemptAt: 0,
    pendingHpAttempt: null,
    pendingManaAttempt: null,
  };

  const config = Object.assign(
    {
      tickMs: 75,
      healCooldownMs: 2040,
      manaCooldownMs: 1050,
      healRetryMs: 100,
      healConfirmMs: 150,
      minHp: 250,
      hpHotbarSlot: 1,
      minMana: 150,
      manaHotbarSlot: 2,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 75;

  if (!Number.isFinite(Number(config.healCooldownMs)) || Number(config.healCooldownMs) < 2040) config.healCooldownMs = 2040;
  if (!Number.isFinite(Number(config.manaCooldownMs)) || Number(config.manaCooldownMs) < 1050) config.manaCooldownMs = 1050;

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function readStats() {
    const playerState = bot.getPlayerSnapshot?.();
    return playerState ? { hp: { current: Number(playerState.health ?? 0), max: Number(playerState.maxHealth ?? 0) }, mana: { current: Number(playerState.mana ?? 0), max: Number(playerState.maxMana ?? 0) } } : { hp: null, mana: null };
  }
  function normalizeHotbarSlot(slot) { const value = Number(slot); if (!Number.isFinite(value)) return null; const normalized = Math.trunc(value); return normalized < 1 || normalized > 12 ? null : normalized; }
  function hasPendingAttempt() { return !!(state.pendingHpAttempt || state.pendingManaAttempt); }
  function didHpHealSucceed(stats, attempt) { return !!stats?.hp && !!attempt && stats.hp.current > attempt.hpBefore; }
  function didManaHealSucceed(stats, attempt) { return !!stats?.mana && !!attempt && stats.mana.current > attempt.manaBefore; }
  function resolvePendingAttempts(stats, now = Date.now()) {
    const hpAttempt = state.pendingHpAttempt;
    if (hpAttempt) {
      if (didHpHealSucceed(stats, hpAttempt)) { state.lastHpHealAt = hpAttempt.attemptedAt; state.pendingHpAttempt = null; bot.log("confirmed hp heal", { slot: hpAttempt.slot }); }
      else if (now - hpAttempt.attemptedAt >= Math.max(50, Number(config.healConfirmMs) || 0)) { state.pendingHpAttempt = null; bot.log("hp heal did not register", { slot: hpAttempt.slot }); }
    }
    const manaAttempt = state.pendingManaAttempt;
    if (manaAttempt) {
      if (didManaHealSucceed(stats, manaAttempt)) { state.lastManaHealAt = manaAttempt.attemptedAt; state.pendingManaAttempt = null; bot.log("confirmed mana heal", { slot: manaAttempt.slot }); }
      else if (now - manaAttempt.attemptedAt >= Math.max(50, Number(config.healConfirmMs) || 0)) { state.pendingManaAttempt = null; bot.log("mana heal did not register", { slot: manaAttempt.slot }); }
    }
  }
  function canUseHpHeal(now = Date.now(), stats = readStats()) {
    const { hp } = stats; const slot = normalizeHotbarSlot(config.hpHotbarSlot); if (!hp || !slot || state.pendingHpAttempt) return false;
    return hp.current > 0 && hp.current <= Math.max(0, Number(config.minHp) || 0) && now - state.lastHpHealAt >= config.healCooldownMs && now - state.lastHpAttemptAt >= Math.max(50, Number(config.healRetryMs) || 0);
  }
  function canUseManaHeal(now = Date.now(), stats = readStats()) {
    const { mana } = stats; const slot = normalizeHotbarSlot(config.manaHotbarSlot); if (!mana || !slot || state.pendingManaAttempt || state.pendingHpAttempt) return false;
    return mana.current <= Math.max(0, Number(config.minMana) || 0) && now - state.lastManaHealAt >= config.manaCooldownMs && now - state.lastManaAttemptAt >= Math.max(50, Number(config.healRetryMs) || 0);
  }
  function triggerHpHeal(now = Date.now(), stats = readStats()) {
    if (!canUseHpHeal(now, stats)) return false;
    const slot = normalizeHotbarSlot(config.hpHotbarSlot); const clicked = bot.clickHotbar(slot - 1);
    if (clicked) { state.lastHpAttemptAt = now; state.pendingHpAttempt = { attemptedAt: now, slot, hpBefore: Number(stats.hp?.current ?? 0), manaBefore: Number(stats.mana?.current ?? 0) }; bot.log("pressed hp heal hotkey", { slot, minHp: config.minHp }); }
    return clicked;
  }
  function triggerManaHeal(now = Date.now(), stats = readStats()) {
    if (!canUseManaHeal(now, stats)) return false;
    const slot = normalizeHotbarSlot(config.manaHotbarSlot); const clicked = bot.clickHotbar(slot - 1);
    if (clicked) { state.lastManaAttemptAt = now; state.pendingManaAttempt = { attemptedAt: now, slot, hpBefore: Number(stats.hp?.current ?? 0), manaBefore: Number(stats.mana?.current ?? 0) }; bot.log("pressed mana heal hotkey", { slot, minMana: config.minMana }); }
    return clicked;
  }
  function tryHeal() {
    if (!config.enabled) return false;
    const now = Date.now(); const stats = readStats(); resolvePendingAttempts(stats, now); if (hasPendingAttempt()) return false; if (triggerHpHeal(now, stats)) return true; return triggerManaHeal(now, stats);
  }
  function scheduleNextTick() { if (!state.running) return; state.timerId = window.setTimeout(() => { tick(); }, config.tickMs); }
  function tick() { if (!state.running) return; try { tryHeal(); } catch (error) { bot.log("auto heal tick failed", error?.message || error); } finally { scheduleNextTick(); } }
  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true, tickMs: 75 });
    if (!Number.isFinite(Number(config.healCooldownMs)) || Number(config.healCooldownMs) < 2040) config.healCooldownMs = 2040;
    if (!Number.isFinite(Number(config.manaCooldownMs)) || Number(config.manaCooldownMs) < 1050) config.manaCooldownMs = 1050;
    persistConfig(); if (state.running) { bot.log("auto heal already running"); return false; }
    state.running = true; bot.log("auto heal started", { ...config }); tick(); return true;
  }
  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false; state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (shouldPersistEnabled) { config.enabled = false; persistConfig(); }
    bot.log("auto heal stopped"); return true;
  }
  function status() { return { running: state.running, config: { ...config }, stats: readStats(), lastHpHealAt: state.lastHpHealAt, lastManaHealAt: state.lastManaHealAt, lastHpAttemptAt: state.lastHpAttemptAt, lastManaAttemptAt: state.lastManaAttemptAt, pendingHpAttempt: state.pendingHpAttempt ? { ...state.pendingHpAttempt } : null, pendingManaAttempt: state.pendingManaAttempt ? { ...state.pendingManaAttempt } : null }; }
  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "hpHotbarSlot")) nextConfig.hpHotbarSlot = normalizeHotbarSlot(nextConfig.hpHotbarSlot) ?? config.hpHotbarSlot;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "manaHotbarSlot")) nextConfig.manaHotbarSlot = normalizeHotbarSlot(nextConfig.manaHotbarSlot);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minHp")) nextConfig.minHp = Math.max(0, Number(nextConfig.minHp) || 0);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMana")) nextConfig.minMana = Math.max(0, Number(nextConfig.minMana) || 0);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "healCooldownMs")) nextConfig.healCooldownMs = Math.max(2040, Number(nextConfig.healCooldownMs) || 2040);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "manaCooldownMs")) nextConfig.manaCooldownMs = Math.max(1050, Number(nextConfig.manaCooldownMs) || 1050);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "healRetryMs")) nextConfig.healRetryMs = Math.max(50, Number(nextConfig.healRetryMs) || 50);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "healConfirmMs")) nextConfig.healConfirmMs = Math.max(50, Number(nextConfig.healConfirmMs) || 50);
    Object.assign(config, nextConfig, { tickMs: 75 });
    if (!Number.isFinite(Number(config.healCooldownMs)) || Number(config.healCooldownMs) < 2040) config.healCooldownMs = 2040;
    if (!Number.isFinite(Number(config.manaCooldownMs)) || Number(config.manaCooldownMs) < 1050) config.manaCooldownMs = 1050;
    persistConfig(); bot.log("auto heal config updated", { ...config }); return { ...config };
  }
  if (config.enabled) start();
  bot.heal = { start, stop, status, updateConfig, readStats, tryHeal, canUseHpHeal, canUseManaHeal, triggerHpHeal, triggerManaHeal, normalizeHotbarSlot, config };
};window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoInvisibleModule = function installAutoInvisibleModule(bot) {
  const configStorageKey = "minibiaBot.invisible.config";
  const INVISIBLE_CONDITION_ID = 4;
  const state = {
    running: false,
    timerId: null,
    lastCastAt: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 500,
      spellWords: "utana vid",
      recastCooldownMs: 2000,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 500;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getInvisibleConditionId() {
    return window.ConditionManager?.prototype?.INVISIBLE ?? INVISIBLE_CONDITION_ID;
  }

  function isInvisibleActive() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;
    const invisibleConditionId = getInvisibleConditionId();

    if (conditions?.has) {
      return conditions.has(invisibleConditionId);
    }

    if (player?.hasCondition) {
      return player.hasCondition(invisibleConditionId);
    }

    return false;
  }

  function getGateStatus(now = Date.now()) {
    const cooldownRemainingMs = Math.max(0, config.recastCooldownMs - (now - state.lastCastAt));
    const cooldownReady = cooldownRemainingMs === 0;
    const invisibleActive = isInvisibleActive();

    return {
      invisibleActive,
      cooldownReady,
      cooldownRemainingMs,
      canCast: !invisibleActive && cooldownReady,
    };
  }

  function canCastInvisible(now = Date.now()) {
    return getGateStatus(now).canCast;
  }

  function tryCastInvisible(now = Date.now()) {
    if (!config.enabled || !canCastInvisible(now)) {
      return false;
    }

    const sent = bot.sendChat(config.spellWords);
    if (sent) {
      state.lastCastAt = now;
      bot.log("cast invisible spell", { spellWords: config.spellWords });
    }

    return sent;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      tryCastInvisible();
    } catch (error) {
      bot.log("auto invisible tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 500;
    persistConfig();

    if (state.running) {
      bot.log("auto invisible already running");
      return false;
    }

    state.running = true;
    attachResumeListeners();
    bot.log("auto invisible started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("auto invisible stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      lastCastAt: state.lastCastAt,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "spellWords")) {
      nextConfig.spellWords = String(nextConfig.spellWords || "").trim() || config.spellWords;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "recastCooldownMs")) {
      nextConfig.recastCooldownMs = Math.max(0, Number(nextConfig.recastCooldownMs) || 0);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 500;
    persistConfig();
    bot.log("auto invisible config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.invisible = {
    start,
    stop,
    status,
    updateConfig,
    isInvisibleActive,
    canCastInvisible,
    tryCastInvisible,
    config,
  };
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoMagicShieldModule = function installAutoMagicShieldModule(bot) {
  const configStorageKey = "minibiaBot.magicShield.config";
  const MAGIC_SHIELD_FALLBACK_DURATION_MS = 180000;
  const state = {
    running: false,
    timerId: null,
    lastCastAt: 0,
    assumedActiveUntil: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 500,
      spellWords: "utamo vita",
      recastCooldownMs: 2000,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 500;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getMagicShieldConditionId() {
    const conditionManagerPrototype = window.ConditionManager?.prototype;
    const playerConditions = window.gameClient?.player?.conditions;
    const candidateKeys = [
      "MAGIC_SHIELD",
      "MANA_SHIELD",
      "MAGICSHIELD",
      "MANASHIELD",
      "UTAMO_VITA",
    ];

    for (const key of candidateKeys) {
      const value = conditionManagerPrototype?.[key] ?? playerConditions?.[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  function isMagicShieldActive(now = Date.now()) {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;
    const magicShieldConditionId = getMagicShieldConditionId();

    if (magicShieldConditionId != null) {
      if (conditions?.has) {
        return conditions.has(magicShieldConditionId);
      }

      if (player?.hasCondition) {
        return player.hasCondition(magicShieldConditionId);
      }
    }

    return now < state.assumedActiveUntil;
  }

  function getGateStatus(now = Date.now()) {
    const cooldownRemainingMs = Math.max(0, config.recastCooldownMs - (now - state.lastCastAt));
    const cooldownReady = cooldownRemainingMs === 0;
    const magicShieldActive = isMagicShieldActive(now);

    return {
      magicShieldActive,
      cooldownReady,
      cooldownRemainingMs,
      canCast: !magicShieldActive && cooldownReady,
    };
  }

  function canCastMagicShield(now = Date.now()) {
    return getGateStatus(now).canCast;
  }

  function tryCastMagicShield(now = Date.now()) {
    if (!config.enabled || !canCastMagicShield(now)) {
      return false;
    }

    const sent = bot.sendChat(config.spellWords);
    if (sent) {
      state.lastCastAt = now;
      state.assumedActiveUntil = now + MAGIC_SHIELD_FALLBACK_DURATION_MS;
      bot.log("cast magic shield spell", { spellWords: config.spellWords });
    }

    return sent;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      tryCastMagicShield();
    } catch (error) {
      bot.log("auto magic shield tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 500;
    persistConfig();

    if (state.running) {
      bot.log("auto magic shield already running");
      return false;
    }

    state.running = true;
    attachResumeListeners();
    bot.log("auto magic shield started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("auto magic shield stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      lastCastAt: state.lastCastAt,
      assumedActiveUntil: state.assumedActiveUntil,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "spellWords")) {
      nextConfig.spellWords = String(nextConfig.spellWords || "").trim() || config.spellWords;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "recastCooldownMs")) {
      nextConfig.recastCooldownMs = Math.max(0, Number(nextConfig.recastCooldownMs) || 0);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 500;
    persistConfig();
    bot.log("auto magic shield config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.magicShield = {
    start,
    stop,
    status,
    updateConfig,
    isMagicShieldActive,
    canCastMagicShield,
    tryCastMagicShield,
    config,
  };
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackModule = function installAutoAttackModule(bot) {
  const configStorageKey = "minibiaBot.attack.config";
  const state = {
    running: false,
    timerId: null,
    targetHotkeyUiTimerId: null,
    lastTargetAt: 0,
    lastRuneHotkeyAt: 0,
    engagedTargetId: null,
    combatStartedAt: 0,
    lastChaseAt: 0,
    lastChaseDestinationKey: null,
    lastFollowTargetId: null,
    lastFollowDistance: Number.POSITIVE_INFINITY,
    lastFollowProgressAt: 0,
    lastFollowStallAt: 0,
    skippedTargetIds: new Map(),
  };

  const storedConfig = bot.storage.get(configStorageKey, {}) || {};
  const config = Object.assign(
    {
      tickMs: 300,
      runeHotbarSlot: null,
      targetCooldownMs: 1200,
      runeCooldownMs: 1200,
      maxTargetDistanceX: 7,
      maxTargetDistanceY: 5,
      meleeMode: true,
      enabled: false,
    },
    storedConfig
  );
  delete config.targetHotbarSlot;
  delete config.hotbarSlot;

  function persistConfig() {
    const { targetHotbarSlot, hotbarSlot, ...persistedConfig } = config;
    bot.storage.set(configStorageKey, persistedConfig);
  }

  function normalizeHotbarSlot(slot) {
    const value = Number(slot);
    if (!Number.isFinite(value)) {
      return null;
    }

    const normalized = Math.trunc(value);
    if (normalized < 1 || normalized > 12) {
      return null;
    }

    return normalized;
  }

  function getNearbyMonsters() {
    return bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
  }

  function normalizePosition(value) {
    if (!value) {
      return null;
    }

    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return {
      x: Math.trunc(x),
      y: Math.trunc(y),
      z: Math.trunc(z),
    };
  }

  function getPositionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : null;
  }

  function isAdjacentTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return false;
    }

    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));
    return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
  }

  function getTileDistance(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.max(
      Math.abs(Number(from.x) - Number(to.x)),
      Math.abs(Number(from.y) - Number(to.y))
    );
  }

  function isInTargetRange(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return false;
    }

    const maxTargetDistanceX = Math.max(1, Number(config.maxTargetDistanceX) || 7);
    const maxTargetDistanceY = Math.max(1, Number(config.maxTargetDistanceY) || 5);
    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));
    return dx <= maxTargetDistanceX && dy <= maxTargetDistanceY;
  }

  function isSameCreature(left, right) {
    if (!left || !right) {
      return false;
    }

    return left === right || left.id === right.id;
  }

  function findNearbyMonster(creature) {
    if (!creature) {
      return null;
    }

    const nearbyMonsters = getNearbyMonsters();
    return nearbyMonsters.find((monster) => isSameCreature(monster, creature)) || null;
  }

  function findNearbyMonsterById(id) {
    if (id == null) {
      return null;
    }

    return getNearbyMonsters().find((monster) => monster?.id === id) || null;
  }

  function getCurrentTarget() {
    return window.gameClient?.player?.__target || null;
  }

  function getCurrentFollowTarget() {
    return window.gameClient?.player?.__followTarget || null;
  }

  function pruneSkippedTargets(now = Date.now()) {
    for (const [id, expiresAt] of state.skippedTargetIds.entries()) {
      if (expiresAt <= now) {
        state.skippedTargetIds.delete(id);
      }
    }
  }

  function resetFollowProgress() {
    state.lastFollowTargetId = null;
    state.lastFollowDistance = Number.POSITIVE_INFINITY;
    state.lastFollowProgressAt = 0;
    state.lastFollowStallAt = 0;
  }

  function clearEngagedTarget() {
    state.engagedTargetId = null;
    state.combatStartedAt = 0;
    state.lastChaseDestinationKey = null;
    resetFollowProgress();
  }

  function clearCurrentFollowTarget() {
    return false;
  }

  function clearCurrentTarget() {
    if (!window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof TargetPacket !== "function") {
      return false;
    }

    if (!getCurrentTarget()) {
      return false;
    }

    window.gameClient.player.setTarget(null);
    window.gameClient.send(new TargetPacket(0));
    return true;
  }

  function markCombatActive(now = Date.now()) {
    if (!state.combatStartedAt) {
      state.combatStartedAt = now;
    }
  }

  function getCombatTargetCount() {
    return getEngagedTarget() ? 1 : 0;
  }

  function isCombatActive() {
    if (!config.enabled || !state.running) {
      return false;
    }

    return !!getEngagedTarget();
  }

  function syncCombatState(now = Date.now()) {
    if (isCombatActive()) {
      markCombatActive(now);
      return true;
    }

    state.combatStartedAt = 0;
    return false;
  }

  function getEngagedTarget() {
    const currentTarget = getCurrentTarget();
    if (currentTarget) {
      state.engagedTargetId = currentTarget.id;
      return currentTarget;
    }

    if (state.engagedTargetId == null) {
      return null;
    }

    const followTarget = getCurrentFollowTarget();
    if (followTarget && followTarget.id === state.engagedTargetId) {
      return findNearbyMonster(followTarget) || followTarget;
    }

    const nearbyTarget = findNearbyMonsterById(state.engagedTargetId);
    if (nearbyTarget) {
      return nearbyTarget;
    }

    clearEngagedTarget();
    return null;
  }

  function setCurrentTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof TargetPacket !== "function") {
      return false;
    }

    window.gameClient.player.setTarget(target);
    window.gameClient.send(new TargetPacket(target.id));
    state.engagedTargetId = target.id;
    return true;
  }

  function setCurrentFollowTarget(target) {
    return false;
  }

  function skipTarget(target, reason, now = Date.now(), skipMs = 4000) {
    if (!target?.id) {
      return false;
    }

    const until = now + Math.max(500, Number(skipMs) || 0);
    state.skippedTargetIds.set(target.id, until);

    const clearedTarget = isSameCreature(getCurrentTarget(), target) ? clearCurrentTarget() : false;
    const clearedFollow = false;

    if (state.engagedTargetId === target.id) {
      clearEngagedTarget();
    } else if (state.lastFollowTargetId === target.id) {
      resetFollowProgress();
    }

    bot.log("skipping auto attack target", {
      id: target.id,
      name: target.name || "Mob",
      reason,
      skippedForMs: Math.max(500, Number(skipMs) || 0),
      clearedTarget,
      clearedFollow,
    });
    return true;
  }

  function isTargetSkipped(target, now = Date.now()) {
    pruneSkippedTargets(now);
    return !!target?.id && (state.skippedTargetIds.get(target.id) || 0) > now;
  }

  function getMonsterCandidates(now = Date.now()) {
    pruneSkippedTargets(now);

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    return getNearbyMonsters()
      .filter((monster) => {
        if (isTargetSkipped(monster, now)) {
          return false;
        }
        const monsterPosition = normalizePosition(monster?.getPosition?.() || monster?.__position);
        return isInTargetRange(playerPosition, monsterPosition);
      })
      .sort((left, right) => {
        const leftDistance = getTileDistance(playerPosition, normalizePosition(left?.getPosition?.() || left?.__position));
        const rightDistance = getTileDistance(playerPosition, normalizePosition(right?.getPosition?.() || right?.__position));
        return leftDistance - rightDistance || Number(left?.id || 0) - Number(right?.id || 0);
      });
  }

  function shouldGiveUpTarget(target) {
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target?.getPosition?.() || target?.__position);
    if (!playerPosition || !targetPosition) {
      return false;
    }

    return !isInTargetRange(playerPosition, targetPosition);
  }

  function resetTargetIfTooFar() {
    const currentTarget = getCurrentTarget();
    if (currentTarget && shouldGiveUpTarget(currentTarget)) {
      skipTarget(currentTarget, "target outside rectangular range", Date.now(), 2500);
      bot.log("gave up distant auto attack target", {
        id: currentTarget.id,
        name: currentTarget.name || "Mob",
        position: normalizePosition(currentTarget.getPosition?.() || currentTarget.__position),
        maxTargetDistanceX: Math.max(1, Number(config.maxTargetDistanceX) || 7),
        maxTargetDistanceY: Math.max(1, Number(config.maxTargetDistanceY) || 5),
      });
      return true;
    }

    const engagedTarget = getEngagedTarget();
    if (engagedTarget && shouldGiveUpTarget(engagedTarget)) {
      skipTarget(engagedTarget, "engaged target outside rectangular range", Date.now(), 2500);
      bot.log("gave up distant auto attack target", {
        id: engagedTarget.id,
        name: engagedTarget.name || "Mob",
        position: normalizePosition(engagedTarget.getPosition?.() || engagedTarget.__position),
        maxTargetDistanceX: Math.max(1, Number(config.maxTargetDistanceX) || 7),
        maxTargetDistanceY: Math.max(1, Number(config.maxTargetDistanceY) || 5),
      });
      return true;
    }

    return false;
  }

  function getTileFromPosition(position) {
    if (!position || typeof Position !== "function") {
      return null;
    }

    return window.gameClient?.world?.getTileFromWorldPosition?.(
      new Position(position.x, position.y, position.z)
    ) || null;
  }

  function findReachableAdjacentPosition(targetPosition, playerPosition) {
    if (!targetPosition || !playerPosition) {
      return null;
    }

    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    offsets.sort((a, b) => {
      const da = Math.abs(targetPosition.x + a.x - playerPosition.x) +
        Math.abs(targetPosition.y + a.y - playerPosition.y);
      const db = Math.abs(targetPosition.x + b.x - playerPosition.x) +
        Math.abs(targetPosition.y + b.y - playerPosition.y);
      return da - db;
    });

    const pathfinder = window.gameClient?.world?.pathfinder;
    const startTile = getTileFromPosition(playerPosition);
    if (!pathfinder || !startTile || typeof pathfinder.search !== "function") {
      return null;
    }

    for (const offset of offsets) {
      const candidatePosition = {
        x: targetPosition.x + offset.x,
        y: targetPosition.y + offset.y,
        z: targetPosition.z,
      };
      const tile = getTileFromPosition(candidatePosition);
      if (!tile?.isWalkable?.()) {
        continue;
      }

      if (candidatePosition.x === playerPosition.x && candidatePosition.y === playerPosition.y) {
        return candidatePosition;
      }

      try {
        const path = pathfinder.search(startTile, tile);
        if (Array.isArray(path) && path.length > 0) {
          return candidatePosition;
        }
      } catch (error) {
        bot.log("auto attack reachability check failed", {
          ...candidatePosition,
          error: error?.message || error,
        });
        return null;
      }
    }

    return null;
  }

  function syncMeleeChase(now = Date.now()) {
    if (!config.meleeMode) {
      return false;
    }

    const target = getEngagedTarget();
    if (!target) {
      clearEngagedTarget();
      return false;
    }

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target.getPosition?.() || target.__position);
    if (!playerPosition || !targetPosition || playerPosition.z !== targetPosition.z) {
      bot.logDebug("auto attack chase target on different floor", {
        targetId: target.id,
        targetName: target.name || "Mob",
        playerZ: playerPosition?.z,
        targetZ: targetPosition?.z,
      });
      return false;
    }

    if (!findNearbyMonster(target)) {
      bot.logDebug("auto attack chase target no longer nearby", {
        targetId: target.id,
        targetName: target.name || "Mob",
      });
      clearEngagedTarget();
      return false;
    }

    if (isAdjacentTile(playerPosition, targetPosition)) {
      state.lastChaseDestinationKey = null;
      resetFollowProgress();
      return false;
    }

    bot.logDebug("auto attack chase delegated to game", {
      targetId: target.id,
      targetName: target.name || "Mob",
      distance: getTileDistance(playerPosition, targetPosition),
    });
    return false;
  }

  function canAttack(now = Date.now()) {
    if (now - state.lastTargetAt < Math.max(0, Number(config.targetCooldownMs) || 0)) {
      return false;
    }

    if (config.meleeMode) {
      return getMonsterCandidates(now).length > 0 && !getCurrentTarget();
    }

    return getMonsterCandidates(now).length > 0;
  }

  function triggerAttack(now = Date.now()) {
    if (!canAttack(now)) {
      return false;
    }

    const engagedTarget = getEngagedTarget();
    const preferredTarget = engagedTarget && !isTargetSkipped(engagedTarget, now) && !shouldGiveUpTarget(engagedTarget)
      ? engagedTarget
      : (getMonsterCandidates(now)[0] || null);
    if (!preferredTarget || !setCurrentTarget(preferredTarget)) {
      return false;
    }

    state.lastTargetAt = now;
    markCombatActive(now);
    bot.log("selected auto attack target", {
      id: preferredTarget.id,
      name: preferredTarget.name || "Mob",
      reason: isSameCreature(preferredTarget, engagedTarget) ? "engaged target" : "nearest candidate",
    });
    return true;
  }

  function canUseRune(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.runeHotbarSlot);
    if (!slot || !getCurrentTarget()) {
      return false;
    }

    if (bot.attackGfb?.shouldReservePriority?.()) {
      return false;
    }

    if (now - state.lastRuneHotkeyAt < Math.max(0, Number(config.runeCooldownMs) || 0)) {
      return false;
    }

    return true;
  }

  function triggerRune(now = Date.now()) {
    if (!canUseRune(now)) {
      return false;
    }

    const slot = normalizeHotbarSlot(config.runeHotbarSlot);
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      state.lastRuneHotkeyAt = now;
      markCombatActive(now);
      bot.log("used auto attack rune hotkey", {
        slot,
        target: getCurrentTarget()?.name || "Mob",
      });
    }

    return clicked;
  }

  function tryAttack() {
    if (!config.enabled) {
      return false;
    }

    const now = Date.now();
    const playerPos = normalizePosition(bot.getPlayerPosition());

    if (resetTargetIfTooFar()) {
      bot.logDebug("auto attack no valid targets in rectangular range");
      return true;
    }

    syncCombatState(now);

    if (config.meleeMode) {
      syncMeleeChase(now);
      if (getCurrentTarget()) {
        return triggerRune(now);
      }

      bot.logDebug("auto attack melee no target", { position: playerPos });
    }

    if (getCurrentTarget()) {
      return triggerRune(now);
    }

    const nearbyCount = getMonsterCandidates(now).length;
    const attacked = triggerAttack(now);
    bot.logDebug("auto attack trigger", {
      attacked,
      nearbyMonsters: nearbyCount,
      hasCurrentTarget: !!getCurrentTarget(),
      position: playerPos,
    });
    return attacked;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      tryAttack();
    } catch (error) {
      const playerPos = normalizePosition(bot.getPlayerPosition());
      const combatStatus = bot.attack?.status?.() || {};
      bot.log("auto attack tick failed", {
        position: playerPos,
        error: error?.message || error,
        combatDurationMs: combatStatus.combatDurationMs,
        targetCount: combatStatus.targetCount,
        meleeMode: config.meleeMode,
      });
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    const nextOverrides = { ...overrides };
    delete nextOverrides.targetHotbarSlot;
    delete nextOverrides.hotbarSlot;
    Object.assign(config, nextOverrides, { enabled: true });
    delete config.targetHotbarSlot;
    delete config.hotbarSlot;
    persistConfig();

    if (state.running) {
      bot.log("auto attack already running");
      return false;
    }

    state.running = true;
    bot.log("auto attack started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    clearEngagedTarget();
    state.lastChaseAt = 0;
    state.skippedTargetIds.clear();

    bot.log("auto attack stopped");
    return true;
  }

  function status() {
    const combatActive = syncCombatState(Date.now());
    return {
      running: state.running,
      config: { ...config },
      lastTargetAt: state.lastTargetAt,
      lastRuneHotkeyAt: state.lastRuneHotkeyAt,
      engagedTargetId: state.engagedTargetId,
      combatActive,
      combatStartedAt: state.combatStartedAt || 0,
      combatDurationMs: state.combatStartedAt ? Math.max(0, Date.now() - state.combatStartedAt) : 0,
      targetCount: getCombatTargetCount(),
      lastChaseAt: state.lastChaseAt,
      currentTarget: getCurrentTarget()
        ? {
            id: getCurrentTarget().id,
            name: getCurrentTarget().name,
            type: getCurrentTarget().type,
            position: getCurrentTarget().__position || null,
          }
        : null,
      nearbyMonsters: getMonsterCandidates().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
    };
  }

  function updateConfig(nextConfig = {}) {
    const sanitizedConfig = { ...nextConfig };
    delete sanitizedConfig.targetHotbarSlot;
    delete sanitizedConfig.hotbarSlot;

    if (Object.prototype.hasOwnProperty.call(sanitizedConfig, "runeHotbarSlot")) {
      sanitizedConfig.runeHotbarSlot = normalizeHotbarSlot(sanitizedConfig.runeHotbarSlot);
    }

    if (Object.prototype.hasOwnProperty.call(sanitizedConfig, "maxTargetDistance")) {
      const legacyDistance = Math.max(1, Math.trunc(Number(sanitizedConfig.maxTargetDistance) || 0));
      sanitizedConfig.maxTargetDistanceX = legacyDistance;
      sanitizedConfig.maxTargetDistanceY = legacyDistance;
      delete sanitizedConfig.maxTargetDistance;
    }

    if (Object.prototype.hasOwnProperty.call(sanitizedConfig, "maxTargetDistanceX")) {
      sanitizedConfig.maxTargetDistanceX = Math.max(1, Math.trunc(Number(sanitizedConfig.maxTargetDistanceX) || config.maxTargetDistanceX || 7));
    }

    if (Object.prototype.hasOwnProperty.call(sanitizedConfig, "maxTargetDistanceY")) {
      sanitizedConfig.maxTargetDistanceY = Math.max(1, Math.trunc(Number(sanitizedConfig.maxTargetDistanceY) || config.maxTargetDistanceY || 5));
    }

    Object.assign(config, sanitizedConfig);
    delete config.targetHotbarSlot;
    delete config.hotbarSlot;
    persistConfig();
    bot.log("auto attack config updated", { ...config });
    return { ...config };
  }

  function removeLegacyTargetHotkeyControl() {
    const input = document.getElementById("minibia-bot-auto-attack-hotkey");
    if (!input) return false;
    const field = input.closest?.(".mb-field") || input.parentElement || input;
    field.remove?.();
    return true;
  }

  function watchForLegacyTargetHotkeyControl() {
    if (removeLegacyTargetHotkeyControl()) return;
    let attempts = 0;
    state.targetHotkeyUiTimerId = window.setInterval(() => {
      attempts += 1;
      if (removeLegacyTargetHotkeyControl() || attempts >= 40) {
        window.clearInterval(state.targetHotkeyUiTimerId);
        state.targetHotkeyUiTimerId = null;
      }
    }, 250);
  }

  if (config.enabled) {
    start();
  }

  bot.addCleanup(() => {
    if (state.targetHotkeyUiTimerId != null) {
      window.clearInterval(state.targetHotkeyUiTimerId);
      state.targetHotkeyUiTimerId = null;
    }
    stop({ persistEnabled: false });
  });

  bot.attack = {
    start,
    stop,
    status,
    updateConfig,
    tryAttack,
    canAttack,
    triggerAttack,
    canUseRune,
    triggerRune,
    getNearbyMonsters,
    getCurrentTarget,
    getCurrentFollowTarget,
    isCombatActive,
    syncMeleeChase,
    normalizeHotbarSlot,
    config,
  };

  window.setTimeout(watchForLegacyTargetHotkeyControl, 0);
};window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoTargetV2Module = function installAutoTargetV2Module(bot) {
  if (!bot || bot.autoTargetV2) return bot?.autoTargetV2 || null;

  const configStorageKey = "minibiaBot.autoTargetV2.config";
  const state = {
    running: false,
    uiTimerId: null,
    uiSyncTimerId: null,
    originalGetVisibleMonsters: null,
    filterInstalled: false,
    unreachableTargets: new Map(),
    reachabilityCache: new Map(),
  };

  const config = Object.assign({
    enabled: false,
    unreachableSkipMs: 4000,
    reachabilityCacheMs: 350,
  }, bot.storage.get(configStorageKey, {}));

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function getPositionKey(position) {
    const value = normalizePosition(position);
    return value ? `${value.x},${value.y},${value.z}` : null;
  }

  function getTile(position) {
    if (!position || typeof Position !== "function") return null;
    return window.gameClient?.world?.getTileFromWorldPosition?.(
      new Position(position.x, position.y, position.z)
    ) || null;
  }

  function findReachableAdjacentPosition(targetPosition, playerPosition) {
    const target = normalizePosition(targetPosition);
    const player = normalizePosition(playerPosition);
    if (!target || !player || target.z !== player.z) return null;

    const pathfinder = window.gameClient?.world?.pathfinder;
    const startTile = getTile(player);
    if (!pathfinder || !startTile || typeof pathfinder.search !== "function") return null;

    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    offsets.sort((a, b) => {
      const da = Math.abs(target.x + a.x - player.x) + Math.abs(target.y + a.y - player.y);
      const db = Math.abs(target.x + b.x - player.x) + Math.abs(target.y + b.y - player.y);
      return da - db;
    });

    for (const offset of offsets) {
      const candidate = {
        x: target.x + offset.x,
        y: target.y + offset.y,
        z: target.z,
      };
      const tile = getTile(candidate);
      if (!tile?.isWalkable?.()) continue;
      if (candidate.x === player.x && candidate.y === player.y) return candidate;

      try {
        const path = pathfinder.search(startTile, tile);
        if (Array.isArray(path) && path.length > 0) return candidate;
      } catch (error) {
        bot.logDebug?.("auto target v2 reachability check failed", {
          targetPosition: target,
          candidate,
          error: error?.message || error,
        });
      }
    }

    return null;
  }

  function pruneCaches(now = Date.now()) {
    for (const [id, entry] of state.unreachableTargets.entries()) {
      if (!entry || entry.until <= now) state.unreachableTargets.delete(id);
    }
    for (const [key, entry] of state.reachabilityCache.entries()) {
      if (!entry || now - entry.at > Math.max(100, Number(config.reachabilityCacheMs) || 350)) {
        state.reachabilityCache.delete(key);
      }
    }
  }

  function isMonsterReachable(monster, now = Date.now()) {
    if (!monster) return false;
    const playerPosition = normalizePosition(bot.getPlayerPosition?.());
    const targetPosition = normalizePosition(monster?.getPosition?.() || monster?.__position);
    if (!playerPosition || !targetPosition || playerPosition.z !== targetPosition.z) return false;

    pruneCaches(now);

    const targetKey = getPositionKey(targetPosition);
    const playerKey = getPositionKey(playerPosition);
    const id = monster?.id;
    const skipped = id != null ? state.unreachableTargets.get(id) : null;
    if (skipped && skipped.positionKey === targetKey && skipped.until > now) return false;
    if (skipped && skipped.positionKey !== targetKey) state.unreachableTargets.delete(id);

    const cacheKey = `${playerKey}|${id ?? "no-id"}|${targetKey}`;
    const cached = state.reachabilityCache.get(cacheKey);
    if (cached && now - cached.at <= Math.max(100, Number(config.reachabilityCacheMs) || 350)) {
      return cached.reachable;
    }

    const reachable = !!findReachableAdjacentPosition(targetPosition, playerPosition);
    state.reachabilityCache.set(cacheKey, { reachable, at: now });

    if (!reachable && id != null) {
      state.unreachableTargets.set(id, {
        until: now + Math.max(500, Number(config.unreachableSkipMs) || 4000),
        positionKey: targetKey,
      });
      bot.logDebug?.("auto target v2 filtered unreachable monster", {
        id,
        name: monster?.name || "Mob",
        position: targetPosition,
      });
    }

    return reachable;
  }

  function getRawVisibleMonsters(options = { sameFloorOnly: true }) {
    const getter = state.originalGetVisibleMonsters || bot.xray?.getVisibleMonsters?.bind(bot.xray);
    if (typeof getter !== "function") return [];
    return getter(options) || [];
  }

  function getReachableCandidates(now = Date.now()) {
    return getRawVisibleMonsters({ sameFloorOnly: true }).filter((monster) => isMonsterReachable(monster, now));
  }

  function installReachabilityFilter() {
    if (state.filterInstalled) return true;
    if (!bot.xray || typeof bot.xray.getVisibleMonsters !== "function") return false;

    state.originalGetVisibleMonsters = bot.xray.getVisibleMonsters.bind(bot.xray);
    bot.xray.getVisibleMonsters = function getVisibleMonstersWithAutoTargetV2Reachability(options = {}) {
      const monsters = state.originalGetVisibleMonsters(options) || [];
      if (!state.running) return monsters;
      const now = Date.now();
      return monsters.filter((monster) => isMonsterReachable(monster, now));
    };
    bot.xray.getVisibleMonsters.__autoTargetV2ReachabilityFilter = true;
    state.filterInstalled = true;
    return true;
  }

  function uninstallReachabilityFilter() {
    if (!state.filterInstalled) return;
    if (bot.xray && bot.xray.getVisibleMonsters?.__autoTargetV2ReachabilityFilter && state.originalGetVisibleMonsters) {
      bot.xray.getVisibleMonsters = state.originalGetVisibleMonsters;
    }
    state.originalGetVisibleMonsters = null;
    state.filterInstalled = false;
    state.unreachableTargets.clear();
    state.reachabilityCache.clear();
  }

  function syncUi() {
    const v2Toggle = document.getElementById("minibia-bot-auto-target-v2-enabled");
    const v1Toggle = document.getElementById("minibia-bot-auto-attack-enabled");
    if (v2Toggle) v2Toggle.checked = state.running;
    if (v1Toggle && state.running) v1Toggle.checked = false;
  }

  function startUiSync() {
    if (state.uiSyncTimerId != null) return;
    state.uiSyncTimerId = window.setInterval(() => {
      if (!state.running) return;
      syncUi();
    }, 250);
  }

  function stopUiSync() {
    if (state.uiSyncTimerId != null) window.clearInterval(state.uiSyncTimerId);
    state.uiSyncTimerId = null;
  }

  function withOriginalToggleHidden(callback) {
    const v1Toggle = document.getElementById("minibia-bot-auto-attack-enabled");
    const v1Label = v1Toggle?.closest?.("label") || null;
    const previousVisibility = v1Label?.style?.visibility || "";
    if (v1Label) v1Label.style.visibility = "hidden";
    try {
      return callback();
    } finally {
      syncUi();
      window.requestAnimationFrame?.(() => {
        syncUi();
        if (v1Label) v1Label.style.visibility = previousVisibility;
      });
    }
  }

  function start() {
    config.enabled = true;
    persistConfig();
    if (state.running) return false;
    if (!installReachabilityFilter()) {
      bot.log("auto target v2 could not install reachability filter");
      return false;
    }

    state.running = true;
    startUiSync();
    syncUi();

    if (!bot.attack?.status?.().running) {
      withOriginalToggleHidden(() => bot.attack?.start?.());
    }

    syncUi();
    bot.log("auto target v2 started with full original auto attack behavior", {
      reachabilityOnly: true,
      attackEngineRunning: !!bot.attack?.status?.().running,
      originalToggleHiddenByV2: true,
    });
    return true;
  }

  function stop(options = {}) {
    const stopAttack = options.stopAttack !== false;
    state.running = false;
    stopUiSync();
    uninstallReachabilityFilter();

    if (stopAttack && bot.attack?.status?.().running) {
      bot.attack.stop();
    }

    if (options.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }

    syncUi();
    bot.log("auto target v2 stopped", { stoppedAttack: stopAttack });
    return true;
  }

  function tryTarget() {
    if (!state.running) return false;
    return !!bot.attack?.tryAttack?.();
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "unreachableSkipMs")) {
      nextConfig.unreachableSkipMs = Math.max(500, Math.trunc(Number(nextConfig.unreachableSkipMs) || config.unreachableSkipMs || 4000));
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "reachabilityCacheMs")) {
      nextConfig.reachabilityCacheMs = Math.max(100, Math.trunc(Number(nextConfig.reachabilityCacheMs) || config.reachabilityCacheMs || 350));
    }
    Object.assign(config, nextConfig);
    persistConfig();
    state.unreachableTargets.clear();
    state.reachabilityCache.clear();
    return { ...config };
  }

  function installUi() {
    if (document.getElementById("minibia-bot-auto-target-v2-enabled")) {
      syncUi();
      return true;
    }

    const v1Toggle = document.getElementById("minibia-bot-auto-attack-enabled");
    const v1Label = v1Toggle?.closest?.("label");
    if (!v1Label) return false;

    const label = document.createElement("label");
    label.className = "mb-toggle";
    label.innerHTML = '<input type="checkbox" id="minibia-bot-auto-target-v2-enabled" /><span>Auto Target 2.0</span>';
    v1Label.insertAdjacentElement("afterend", label);

    const v2Toggle = label.querySelector("#minibia-bot-auto-target-v2-enabled");
    v2Toggle.checked = state.running;
    v2Toggle.addEventListener("change", () => {
      if (v2Toggle.checked) start();
      else stop();
      syncUi();
    });

    v1Toggle.addEventListener("change", () => {
      if (v1Toggle.checked && state.running) {
        stop({ stopAttack: false });
        v1Toggle.checked = !!bot.attack?.status?.().running;
      }
    });

    return true;
  }

  function status() {
    const attackStatus = bot.attack?.status?.() || {};
    return {
      ...attackStatus,
      running: state.running,
      config: { ...config },
      attackConfig: attackStatus.config ? { ...attackStatus.config } : null,
      reachableCandidates: state.running
        ? getReachableCandidates().map((monster) => ({ id: monster?.id, name: monster?.name || "Mob" }))
        : [],
      unreachableTargetIds: Array.from(state.unreachableTargets.keys()),
      fullOriginalCombatEngine: true,
      runeAndHotbarInherited: true,
      meleeChaseInherited: true,
      creaturePriorityInherited: true,
    };
  }

  bot.autoTargetV2 = {
    start,
    stop,
    status,
    updateConfig,
    tryTarget,
    getReachableCandidates,
    findReachableAdjacentPosition,
    isMonsterReachable,
    config,
  };

  bot.addCleanup?.(() => {
    stop({ persistEnabled: false, stopAttack: false });
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
    stopUiSync();
  });

  if (!installUi()) {
    let attempts = 0;
    state.uiTimerId = window.setInterval(() => {
      attempts += 1;
      if (installUi() || attempts >= 80) {
        window.clearInterval(state.uiTimerId);
        state.uiTimerId = null;
      }
    }, 250);
  }

  if (config.enabled) start();
  return bot.autoTargetV2;
};

(() => {
  let attempts = 0;
  let lastBot = null;
  const timer = window.setInterval(() => {
    attempts += 1;
    const bot = window.minibiaBot;
    if (bot && bot !== lastBot && window.__minibiaBotBundle?.installAutoTargetV2Module) {
      lastBot = bot;
      if (!bot.autoTargetV2) {
        window.__minibiaBotBundle.installAutoTargetV2Module(bot);
      }
    }
    if (attempts >= 20) window.clearInterval(timer);
  }, 500);
})();
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackExcludeModule = function installAutoAttackExcludeModule(bot) {
  if (!bot || bot.attackExclude?.destroy) return bot?.attackExclude;

  const configStorageKey = "minibiaBot.attackExclude.config";
  const state = {
    installed: false,
    originalGetVisibleMonsters: null,
    uiTimerId: null,
  };

  const config = Object.assign(
    {
      enabled: true,
      excludedCreatureNames: [],
    },
    bot.storage.get(configStorageKey, {}) || {}
  );

  config.enabled = config.enabled !== false;
  config.excludedCreatureNames = normalizeNameList(config.excludedCreatureNames);

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
    mirrorToAttackConfig();
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizeDisplayName(name) {
    return String(name || "").trim();
  }

  function normalizeNameList(names) {
    const source = Array.isArray(names) ? names : String(names || "").split(/[\n,]/);
    return Array.from(new Set(source.map(normalizeName).filter(Boolean))).sort();
  }

  function isExcluded(creatureOrName) {
    if (!config.enabled) return false;
    const name = typeof creatureOrName === "string"
      ? normalizeName(creatureOrName)
      : normalizeName(creatureOrName?.name || "Mob");
    return !!name && config.excludedCreatureNames.includes(name);
  }

  function mirrorToAttackConfig() {
    if (bot.attack?.config) {
      bot.attack.config.excludedCreatureNames = [...config.excludedCreatureNames];
    }
  }

  function addName(name) {
    const normalized = normalizeName(name);
    if (!normalized) return false;
    if (!config.excludedCreatureNames.includes(normalized)) {
      config.excludedCreatureNames.push(normalized);
      config.excludedCreatureNames.sort();
      persistConfig();
    }
    refreshUiValues();
    return true;
  }

  function removeName(name) {
    const normalized = normalizeName(name);
    const before = config.excludedCreatureNames.length;
    config.excludedCreatureNames = config.excludedCreatureNames.filter((item) => item !== normalized);
    const removed = config.excludedCreatureNames.length !== before;
    if (removed) persistConfig();
    refreshUiValues();
    return removed;
  }

  function setNames(names) {
    config.excludedCreatureNames = normalizeNameList(names);
    persistConfig();
    refreshUiValues();
    return [...config.excludedCreatureNames];
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) {
      config.enabled = nextConfig.enabled !== false;
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "excludedCreatureNames")) {
      config.excludedCreatureNames = normalizeNameList(nextConfig.excludedCreatureNames);
    }
    persistConfig();
    refreshUiValues();
    return { ...config };
  }

  function installFilter() {
    if (state.installed || !bot.xray || typeof bot.xray.getVisibleMonsters !== "function") return false;
    state.originalGetVisibleMonsters = bot.xray.getVisibleMonsters.bind(bot.xray);
    bot.xray.getVisibleMonsters = function getVisibleMonstersWithExclusions(options = {}) {
      const monsters = state.originalGetVisibleMonsters(options) || [];
      if (options?.includeExcluded || !config.enabled || !config.excludedCreatureNames.length) {
        return monsters;
      }
      return monsters.filter((monster) => !isExcluded(monster));
    };
    state.installed = true;
    mirrorToAttackConfig();
    return true;
  }

  function uninstallFilter() {
    if (state.installed && state.originalGetVisibleMonsters && bot.xray) {
      bot.xray.getVisibleMonsters = state.originalGetVisibleMonsters;
    }
    state.installed = false;
    state.originalGetVisibleMonsters = null;
  }

  function status() {
    return {
      installed: state.installed,
      config: { ...config, excludedCreatureNames: [...config.excludedCreatureNames] },
    };
  }

  function removeTalkPanelSection() {
    const talkSection = document.getElementById("minibia-bot-talk-enabled")?.closest(".mb-section") ||
      document.getElementById("minibia-bot-talk-api-key")?.closest(".mb-section") ||
      document.getElementById("minibia-bot-talk-prompt")?.closest(".mb-section");
    if (talkSection) {
      talkSection.remove();
      return true;
    }
    return false;
  }

  function findSideColumnMount(panel) {
    const sideColumn = panel.querySelector(".mb-side-column");
    if (sideColumn) return sideColumn;
    return panel.querySelector(".mb-main-column") || panel.querySelector(".mb-body") || panel;
  }

  function ensureUi() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    if (!panel) return;

    removeTalkPanelSection();

    const existing = document.getElementById("minibia-bot-auto-attack-exclude-section");
    const mount = findSideColumnMount(panel);
    if (existing) {
      if (existing.parentElement !== mount) {
        mount.appendChild(existing);
      }
      return;
    }

    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-auto-attack-exclude-section";
    section.innerHTML = `
      <div class="mb-label">Exclude Monsters</div>
      <div class="mb-stack">
        <label class="mb-toggle">
          <input type="checkbox" id="minibia-bot-auto-attack-exclude-enabled" />
          <span>Do not target excluded monsters</span>
        </label>
        <div class="mb-inline">
          <input type="text" id="minibia-bot-auto-attack-exclude-input" placeholder="Monster name" />
          <button type="button" class="mb-small-button" id="minibia-bot-auto-attack-exclude-add">Add</button>
        </div>
        <div class="mb-list" id="minibia-bot-auto-attack-exclude-list"></div>
        <div class="mb-small-note">Ignored by Auto Attack and AoE.</div>
      </div>
    `;

    mount.appendChild(section);

    const enabledInput = section.querySelector("#minibia-bot-auto-attack-exclude-enabled");
    const nameInput = section.querySelector("#minibia-bot-auto-attack-exclude-input");
    const addButton = section.querySelector("#minibia-bot-auto-attack-exclude-add");

    enabledInput?.addEventListener("change", () => updateConfig({ enabled: enabledInput.checked }));
    addButton?.addEventListener("click", () => {
      if (addName(nameInput?.value)) nameInput.value = "";
    });
    nameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (addName(nameInput.value)) nameInput.value = "";
      }
    });

    refreshUiValues();
  }

  function refreshUiValues() {
    const enabledInput = document.getElementById("minibia-bot-auto-attack-exclude-enabled");
    const list = document.getElementById("minibia-bot-auto-attack-exclude-list");

    if (enabledInput) enabledInput.checked = !!config.enabled;
    if (!list) return;

    list.innerHTML = "";
    if (!config.excludedCreatureNames.length) {
      const empty = document.createElement("div");
      empty.className = "mb-small-note";
      empty.textContent = "No excluded monsters.";
      list.appendChild(empty);
      return;
    }

    config.excludedCreatureNames.forEach((name) => {
      const row = document.createElement("div");
      row.className = "mb-list-row";
      const label = document.createElement("span");
      label.textContent = name;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mb-small-button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => removeName(name));
      row.appendChild(label);
      row.appendChild(removeButton);
      list.appendChild(row);
    });
  }

  function destroy() {
    uninstallFilter();
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    document.getElementById("minibia-bot-auto-attack-exclude-section")?.remove();
  }

  bot.attackExclude = {
    installFilter,
    uninstallFilter,
    status,
    updateConfig,
    addName,
    removeName,
    setNames,
    isExcluded,
    destroy,
    config,
  };

  installFilter();
  state.uiTimerId = window.setInterval(() => { ensureUi(); refreshUiValues(); }, 1000);
  bot.addCleanup(destroy);
  ensureUi();
  return bot.attackExclude;
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackAoeModule = function installAutoAttackAoeModule(bot) {
  if (!bot || bot.attackAoe?.destroy) return bot?.attackAoe;

  const configStorageKey = "minibiaBot.attackAoe.config";
  const state = {
    running: false,
    timerId: null,
    uiTimerId: null,
    uiStartupTimerId: null,
    lastSpellHotkeyAt: 0,
    lastCastMonsterCount: 0,
    lastGfbHotkeyAt: 0,
    lastGfbMonsterCount: 0,
    lastGfbTargetName: "",
  };

  const storedConfig = bot.storage.get(configStorageKey, {}) || {};
  const config = Object.assign({
    enabled: false,
    spellHotbarSlot: null,
    minMonsters: 3,
    squareRange: 3,
    cooldownMs: 2000,
    tickMs: 250,
    requireAutoAttackRunning: true,
    respectTargetFilters: true,
    gfbEnabled: false,
    gfbHighestPriority: false,
    gfbHotbarSlot: null,
    gfbMinMonsters: 4,
    gfbCooldownMs: 2000,
  }, storedConfig);

  delete config.energyWaveEnabled;
  delete config.energyWaveHotbarSlot;
  delete config.energyWaveMinMonsters;
  delete config.energyWaveCooldownMs;

  config.spellHotbarSlot = normalizeHotbarSlot(config.spellHotbarSlot);
  config.minMonsters = positiveInt(config.minMonsters, 3);
  config.squareRange = positiveInt(config.squareRange, 3);
  config.cooldownMs = nonNegativeInt(config.cooldownMs, 2000);
  config.tickMs = positiveInt(config.tickMs, 250);
  config.requireAutoAttackRunning = config.requireAutoAttackRunning !== false;
  config.respectTargetFilters = config.respectTargetFilters !== false;
  config.gfbEnabled = !!config.gfbEnabled;
  config.gfbHighestPriority = !!config.gfbHighestPriority;
  config.gfbHotbarSlot = normalizeHotbarSlot(config.gfbHotbarSlot);
  config.gfbMinMonsters = positiveInt(config.gfbMinMonsters, 4);
  config.gfbCooldownMs = nonNegativeInt(config.gfbCooldownMs, 2000);

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function normalizeHotbarSlot(slot) { const n = Math.trunc(Number(slot)); return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null; }
  function positiveInt(value, fallback) { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n > 0 ? n : fallback; }
  function nonNegativeInt(value, fallback) { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n >= 0 ? n : fallback; }
  function normalizeName(name) { return String(name || "").trim().toLowerCase(); }

  function getPosition(value) {
    const raw = value?.getPosition?.() || value?.__position || value?.position || value;
    if (!raw) return null;
    const x = Number(raw.x), y = Number(raw.y), z = Number(raw.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }
      : null;
  }

  function tileDistance(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(Number(a.x) - Number(b.x)), Math.abs(Number(a.y) - Number(b.y)));
  }

  function positionKey(position) { return position ? `${position.x},${position.y},${position.z}` : ""; }

  function passesTargetFilters(monster) {
    if (!config.respectTargetFilters) return true;
    const attackConfig = bot.attack?.config || {};
    const mode = attackConfig.targetFilterMode === "include" || attackConfig.targetFilterMode === "exclude" ? attackConfig.targetFilterMode : "all";
    const monsterName = normalizeName(monster?.name || "Mob");
    const included = new Set((attackConfig.includedCreatureNames || []).map(normalizeName));
    const excluded = new Set((attackConfig.excludedCreatureNames || []).map(normalizeName));
    if (mode === "include") return (!included.size || included.has(monsterName)) && !excluded.has(monsterName);
    return !excluded.has(monsterName);
  }

  function getVisibleMonsters() {
    return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []).filter(passesTargetFilters);
  }

  function getCandidateMonsters() {
    const playerPosition = getPosition(bot.getPlayerPosition?.());
    if (!playerPosition) return [];
    const range = positiveInt(config.squareRange, 3);
    return getVisibleMonsters().filter((monster) => tileDistance(playerPosition, getPosition(monster)) <= range);
  }

  function isAutoAttackRunning() {
    if (!config.requireAutoAttackRunning) return true;
    return !!bot.attack?.status?.().running;
  }

  function canCastSquare(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.spellHotbarSlot);
    if (!config.enabled || !state.running || !slot || !isAutoAttackRunning()) return false;
    if (now - state.lastSpellHotkeyAt < nonNegativeInt(config.cooldownMs, 2000)) return false;
    return getCandidateMonsters().length >= positiveInt(config.minMonsters, 3);
  }

  function triggerSquareSpell(now = Date.now()) {
    if (!canCastSquare(now)) return false;
    const slot = normalizeHotbarSlot(config.spellHotbarSlot);
    const monsters = getCandidateMonsters();
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      state.lastSpellHotkeyAt = now;
      state.lastCastMonsterCount = monsters.length;
      bot.log("used auto attack AoE spell hotkey", { slot, monsterCount: monsters.length, squareRange: config.squareRange });
    }
    refreshUiValues();
    return clicked;
  }

  function getGfbTiles(centerPosition) {
    if (!centerPosition) return [];
    const rowWidths = [1, 5, 5, 7, 5, 5, 1];
    const tiles = [];
    for (let row = 0; row < rowWidths.length; row += 1) {
      const half = Math.floor(rowWidths[row] / 2);
      const yOffset = row - 3;
      for (let xOffset = -half; xOffset <= half; xOffset += 1) {
        tiles.push({ x: centerPosition.x + xOffset, y: centerPosition.y + yOffset, z: centerPosition.z });
      }
    }
    return tiles;
  }

  function evaluateGfbAtPosition(centerPosition, monsters = getVisibleMonsters()) {
    if (!centerPosition) return { position: centerPosition, count: 0, monsters: [], tiles: [] };
    const tileKeys = new Set(getGfbTiles(centerPosition).map(positionKey));
    const hitMonsters = monsters.filter((monster) => {
      const position = getPosition(monster);
      return position && position.z === centerPosition.z && tileKeys.has(positionKey(position));
    });
    return { position: centerPosition, count: hitMonsters.length, monsters: hitMonsters, tiles: Array.from(tileKeys) };
  }

  function getBestGfbCandidate() {
    const playerPosition = getPosition(bot.getPlayerPosition?.());
    if (!playerPosition) return null;
    const monsters = getVisibleMonsters().filter((monster) => {
      const position = getPosition(monster);
      return position && position.z === playerPosition.z && tileDistance(playerPosition, position) <= 7;
    });
    if (!monsters.length) return null;
    const candidatesByKey = new Map();
    monsters.forEach((monster) => {
      const position = getPosition(monster);
      if (position) candidatesByKey.set(positionKey(position), { position, target: monster });
    });
    const evaluations = Array.from(candidatesByKey.values()).map((candidate) => ({
      ...evaluateGfbAtPosition(candidate.position, monsters),
      target: candidate.target,
    }));
    evaluations.sort((left, right) => {
      const countDiff = right.count - left.count;
      if (countDiff) return countDiff;
      return tileDistance(playerPosition, left.position) - tileDistance(playerPosition, right.position);
    });
    return evaluations[0] || null;
  }

  function shouldReservePriority() {
    const slot = normalizeHotbarSlot(config.gfbHotbarSlot);
    if (!config.enabled || !state.running || !config.gfbEnabled || !config.gfbHighestPriority || !slot) return false;
    const best = getBestGfbCandidate();
    return !!best && best.count >= positiveInt(config.gfbMinMonsters, 4);
  }

  function getTileFromPosition(position) {
    if (!position) return null;
    if (typeof Position === "function") return window.gameClient?.world?.getTileFromWorldPosition?.(new Position(position.x, position.y, position.z)) || null;
    return window.gameClient?.world?.getTileFromWorldPosition?.(position) || null;
  }

  function clickCrosshairTarget(best) {
    const slot = normalizeHotbarSlot(config.gfbHotbarSlot);
    if (!slot || !best?.position) return false;
    if (!bot.clickHotbar(slot - 1)) return false;
    const tile = getTileFromPosition(best.position);
    const target = best.target || best.monsters?.[0] || tile;
    const mouse = window.gameClient?.mouse;
    const targetRef = tile ? { which: tile, index: 0xFF } : target ? { which: target, index: 0xFF } : null;
    if (targetRef && typeof mouse?.__handleItemUseWith === "function") { try { mouse.__handleItemUseWith(null, targetRef); return true; } catch (_error) {} }
    if (targetRef && typeof mouse?.__handleThingUse === "function") { try { mouse.__handleThingUse(targetRef); return true; } catch (_error) {} }
    if (tile && typeof mouse?.__handleTileClick === "function") { try { mouse.__handleTileClick(tile); return true; } catch (_error) {} }
    if (target && typeof mouse?.__handleCreatureClick === "function") { try { mouse.__handleCreatureClick(target); return true; } catch (_error) {} }
    bot.log("GFB crosshair target could not be clicked by known mouse handlers", { position: best.position, target: best.target?.name || "Mob" });
    return false;
  }

  function getReadyGfbCandidate(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.gfbHotbarSlot);
    if (!config.enabled || !state.running || !config.gfbEnabled || !slot) return null;
    if (now - state.lastGfbHotkeyAt < nonNegativeInt(config.gfbCooldownMs, 2000)) return null;
    const best = getBestGfbCandidate();
    return best && best.count >= positiveInt(config.gfbMinMonsters, 4) ? best : null;
  }

  function canCastGfb(now = Date.now()) { return !!getReadyGfbCandidate(now); }

  function triggerGfb(now = Date.now(), bestCandidate = null) {
    const best = bestCandidate || getReadyGfbCandidate(now);
    if (!best) return false;
    const clicked = clickCrosshairTarget(best);
    if (clicked) {
      state.lastGfbHotkeyAt = now;
      state.lastGfbMonsterCount = best.count;
      state.lastGfbTargetName = best.target?.name || best.monsters?.[0]?.name || "Mob";
      bot.log("used great fireball hotkey", { slot: config.gfbHotbarSlot, monsterCount: best.count, target: state.lastGfbTargetName, position: best.position, shape: "1-5-5-7-5-5-1" });
    }
    refreshUiValues();
    return clicked;
  }

  function triggerSpell(now = Date.now()) {
    const bestGfb = getReadyGfbCandidate(now);
    if (bestGfb && triggerGfb(now, bestGfb)) return true;
    if (shouldReservePriority()) return false;
    return triggerSquareSpell(now);
  }

  function tick() {
    if (!state.running) return;
    try { triggerSpell(); } catch (error) { bot.log("auto attack AoE tick failed", error?.message || error); }
    state.timerId = window.setTimeout(tick, positiveInt(config.tickMs, 250));
  }

  function startUiTimer() {
    if (state.uiTimerId != null || !state.running || !config.enabled) return;
    state.uiTimerId = window.setInterval(() => { ensureUi(); refreshUiValues(); }, 1000);
  }

  function stopUiTimer() {
    if (state.uiTimerId == null) return;
    window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
  }

  function stopUiStartupTimer() {
    if (state.uiStartupTimerId == null) return;
    window.clearInterval(state.uiStartupTimerId);
    state.uiStartupTimerId = null;
  }

  function ensureUiAtStartup() {
    if (document.getElementById("minibia-bot-auto-attack-aoe-section")) return true;
    ensureUi();
    if (document.getElementById("minibia-bot-auto-attack-aoe-section")) return true;
    if (state.uiStartupTimerId != null) return false;

    let attempts = 0;
    state.uiStartupTimerId = window.setInterval(() => {
      attempts += 1;
      ensureUi();
      if (document.getElementById("minibia-bot-auto-attack-aoe-section") || attempts >= 40) {
        stopUiStartupTimer();
      }
    }, 250);
    return false;
  }

  function start(overrides = {}) {
    updateConfig(Object.assign({}, overrides, { enabled: true }), { silent: true });
    if (state.running) return false;
    state.running = true;
    ensureUiAtStartup();
    startUiTimer();
    bot.log("auto attack AoE started", { ...config });
    tick();
    refreshUiValues();
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    stopUiTimer();
    if (options.persistEnabled !== false) { config.enabled = false; persistConfig(); }
    bot.log("auto attack AoE stopped");
    refreshUiValues();
    return true;
  }

  function updateConfig(nextConfig = {}, options = {}) {
    const cleaned = { ...nextConfig };
    delete cleaned.energyWaveEnabled;
    delete cleaned.energyWaveHotbarSlot;
    delete cleaned.energyWaveMinMonsters;
    delete cleaned.energyWaveCooldownMs;
    if (Object.prototype.hasOwnProperty.call(cleaned, "spellHotbarSlot")) cleaned.spellHotbarSlot = normalizeHotbarSlot(cleaned.spellHotbarSlot);
    if (Object.prototype.hasOwnProperty.call(cleaned, "minMonsters")) cleaned.minMonsters = positiveInt(cleaned.minMonsters, config.minMonsters || 3);
    if (Object.prototype.hasOwnProperty.call(cleaned, "squareRange")) cleaned.squareRange = positiveInt(cleaned.squareRange, config.squareRange || 3);
    if (Object.prototype.hasOwnProperty.call(cleaned, "cooldownMs")) cleaned.cooldownMs = nonNegativeInt(cleaned.cooldownMs, config.cooldownMs || 2000);
    if (Object.prototype.hasOwnProperty.call(cleaned, "tickMs")) cleaned.tickMs = positiveInt(cleaned.tickMs, config.tickMs || 250);
    if (Object.prototype.hasOwnProperty.call(cleaned, "requireAutoAttackRunning")) cleaned.requireAutoAttackRunning = cleaned.requireAutoAttackRunning !== false;
    if (Object.prototype.hasOwnProperty.call(cleaned, "respectTargetFilters")) cleaned.respectTargetFilters = cleaned.respectTargetFilters !== false;
    if (Object.prototype.hasOwnProperty.call(cleaned, "gfbEnabled")) cleaned.gfbEnabled = !!cleaned.gfbEnabled;
    if (Object.prototype.hasOwnProperty.call(cleaned, "gfbHighestPriority")) cleaned.gfbHighestPriority = !!cleaned.gfbHighestPriority;
    if (Object.prototype.hasOwnProperty.call(cleaned, "gfbHotbarSlot")) cleaned.gfbHotbarSlot = normalizeHotbarSlot(cleaned.gfbHotbarSlot);
    if (Object.prototype.hasOwnProperty.call(cleaned, "gfbMinMonsters")) cleaned.gfbMinMonsters = positiveInt(cleaned.gfbMinMonsters, config.gfbMinMonsters || 4);
    if (Object.prototype.hasOwnProperty.call(cleaned, "gfbCooldownMs")) cleaned.gfbCooldownMs = nonNegativeInt(cleaned.gfbCooldownMs, config.gfbCooldownMs || 2000);
    Object.assign(config, cleaned);
    persistConfig();
    if (!options.silent) refreshUiValues();
    return { ...config };
  }

  function status() {
    const monsters = state.running && config.enabled ? getCandidateMonsters() : [];
    const bestGfb = state.running && config.enabled && config.gfbEnabled ? getBestGfbCandidate() : null;
    return {
      running: state.running,
      config: { ...config },
      nearbyMonsterCount: monsters.length,
      lastCastMonsterCount: state.lastCastMonsterCount,
      lastGfbMonsterCount: state.lastGfbMonsterCount,
      lastGfbTargetName: state.lastGfbTargetName,
      bestGfbCount: bestGfb?.count || 0,
      bestGfbTargetName: bestGfb?.target?.name || "",
      priorityReserved: shouldReservePriority(),
      ready: canCastSquare(Date.now()) || canCastGfb(Date.now()),
    };
  }

  function findAutoAttackAnchor(panel) {
    return document.getElementById("minibia-bot-auto-attack-enabled")?.closest(".mb-section") ||
      document.getElementById("minibia-bot-auto-attack-enabled")?.parentElement ||
      panel.querySelector(".mb-main-column") || panel.querySelector(".mb-body") || panel;
  }

  function ensureUi() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    if (!panel || document.getElementById("minibia-bot-auto-attack-aoe-section")) return;
    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-auto-attack-aoe-section";
    section.innerHTML = `
      <div class="mb-label">AoE Spell</div>
      <div class="mb-stack">
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-aoe-enabled" /><span>Enable AoE Spells</span></label>
        <div class="mb-field-grid">
          <label class="mb-field"><span class="mb-field-label">Square Hotkey</span><input type="number" id="minibia-bot-auto-attack-aoe-hotkey" min="1" max="12" placeholder="5" /></label>
          <label class="mb-field"><span class="mb-field-label">Square Min Monsters</span><input type="number" id="minibia-bot-auto-attack-aoe-monsters" min="1" placeholder="3" /></label>
          <label class="mb-field"><span class="mb-field-label">Square Range</span><input type="number" id="minibia-bot-auto-attack-aoe-range" min="1" placeholder="3" /></label>
          <label class="mb-field"><span class="mb-field-label">Square Cooldown MS</span><input type="number" id="minibia-bot-auto-attack-aoe-cooldown" min="0" placeholder="2000" /></label>
        </div>
        <div class="mb-section">
          <div class="mb-label">Great Fireball 1-5-5-7-5-5-1</div>
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gfb-enabled" /><span>Enable Great Fireball</span></label>
          <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gfb-highest-priority" /><span>GFB Highest Priority</span></label>
          <div class="mb-field-grid">
            <label class="mb-field"><span class="mb-field-label">GFB Hotkey</span><input type="number" id="minibia-bot-gfb-hotkey" min="1" max="12" placeholder="8" /></label>
            <label class="mb-field"><span class="mb-field-label">GFB Min Creatures</span><input type="number" id="minibia-bot-gfb-monsters" min="1" placeholder="4" /></label>
            <label class="mb-field"><span class="mb-field-label">GFB Cooldown MS</span><input type="number" id="minibia-bot-gfb-cooldown" min="0" placeholder="2000" /></label>
          </div>
          <div class="mb-small-note">Highest Priority reserves the shared cast while GFB still has enough creatures, including while GFB is cooling down.</div>
          <div class="mb-small-note">Hotkey should have Great Fireball selected on crosshairs. Picks the best 1-5-5-7-5-5-1 shot.</div>
        </div>
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-aoe-require-attack" /><span>Only square AoE while Auto Attack runs</span></label>
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-aoe-respect-filters" /><span>Use target filters</span></label>
        <div class="mb-small-note" id="minibia-bot-auto-attack-aoe-status">AoE: idle</div>
      </div>`;

    const anchor = findAutoAttackAnchor(panel);
    if (anchor && anchor.parentElement) anchor.insertAdjacentElement("afterend", section);
    else (panel.querySelector(".mb-main-column") || panel.querySelector(".mb-body") || panel).appendChild(section);

    const enabled = section.querySelector("#minibia-bot-auto-attack-aoe-enabled");
    const hotkey = section.querySelector("#minibia-bot-auto-attack-aoe-hotkey");
    const monsters = section.querySelector("#minibia-bot-auto-attack-aoe-monsters");
    const range = section.querySelector("#minibia-bot-auto-attack-aoe-range");
    const cooldown = section.querySelector("#minibia-bot-auto-attack-aoe-cooldown");
    const gfbEnabled = section.querySelector("#minibia-bot-gfb-enabled");
    const gfbHighestPriority = section.querySelector("#minibia-bot-gfb-highest-priority");
    const gfbHotkey = section.querySelector("#minibia-bot-gfb-hotkey");
    const gfbMonsters = section.querySelector("#minibia-bot-gfb-monsters");
    const gfbCooldown = section.querySelector("#minibia-bot-gfb-cooldown");
    const requireAttack = section.querySelector("#minibia-bot-auto-attack-aoe-require-attack");
    const filters = section.querySelector("#minibia-bot-auto-attack-aoe-respect-filters");
    enabled?.addEventListener("change", () => enabled.checked ? start() : stop());
    hotkey?.addEventListener("change", () => updateConfig({ spellHotbarSlot: hotkey.value }));
    monsters?.addEventListener("change", () => updateConfig({ minMonsters: monsters.value }));
    range?.addEventListener("change", () => updateConfig({ squareRange: range.value }));
    cooldown?.addEventListener("change", () => updateConfig({ cooldownMs: cooldown.value }));
    gfbEnabled?.addEventListener("change", () => updateConfig({ gfbEnabled: gfbEnabled.checked }));
    gfbHighestPriority?.addEventListener("change", () => updateConfig({ gfbHighestPriority: gfbHighestPriority.checked }));
    gfbHotkey?.addEventListener("change", () => updateConfig({ gfbHotbarSlot: gfbHotkey.value }));
    gfbMonsters?.addEventListener("change", () => updateConfig({ gfbMinMonsters: gfbMonsters.value }));
    gfbCooldown?.addEventListener("change", () => updateConfig({ gfbCooldownMs: gfbCooldown.value }));
    requireAttack?.addEventListener("change", () => updateConfig({ requireAutoAttackRunning: requireAttack.checked }));
    filters?.addEventListener("change", () => updateConfig({ respectTargetFilters: filters.checked }));
    refreshUiValues();
  }

  function refreshUiValues() {
    const enabled = document.getElementById("minibia-bot-auto-attack-aoe-enabled");
    const hotkey = document.getElementById("minibia-bot-auto-attack-aoe-hotkey");
    const monsters = document.getElementById("minibia-bot-auto-attack-aoe-monsters");
    const range = document.getElementById("minibia-bot-auto-attack-aoe-range");
    const cooldown = document.getElementById("minibia-bot-auto-attack-aoe-cooldown");
    const gfbEnabled = document.getElementById("minibia-bot-gfb-enabled");
    const gfbHighestPriority = document.getElementById("minibia-bot-gfb-highest-priority");
    const gfbHotkey = document.getElementById("minibia-bot-gfb-hotkey");
    const gfbMonsters = document.getElementById("minibia-bot-gfb-monsters");
    const gfbCooldown = document.getElementById("minibia-bot-gfb-cooldown");
    const requireAttack = document.getElementById("minibia-bot-auto-attack-aoe-require-attack");
    const filters = document.getElementById("minibia-bot-auto-attack-aoe-respect-filters");
    const statusLabel = document.getElementById("minibia-bot-auto-attack-aoe-status");
    const panelCollapsed = document.getElementById("minibia-bot-panel")?.dataset?.collapsed === "true";
    const shouldScanUi = state.running && config.enabled && !panelCollapsed;
    const bestGfb = shouldScanUi && config.gfbEnabled ? getBestGfbCandidate() : null;
    if (enabled) enabled.checked = !!state.running;
    if (hotkey) hotkey.value = config.spellHotbarSlot || "";
    if (monsters) monsters.value = config.minMonsters;
    if (range) range.value = config.squareRange;
    if (cooldown) cooldown.value = config.cooldownMs;
    if (gfbEnabled) gfbEnabled.checked = !!config.gfbEnabled;
    if (gfbHighestPriority) gfbHighestPriority.checked = !!config.gfbHighestPriority;
    if (gfbHotkey) gfbHotkey.value = config.gfbHotbarSlot || "";
    if (gfbMonsters) gfbMonsters.value = config.gfbMinMonsters;
    if (gfbCooldown) gfbCooldown.value = config.gfbCooldownMs;
    if (requireAttack) requireAttack.checked = !!config.requireAutoAttackRunning;
    if (filters) filters.checked = !!config.respectTargetFilters;
    if (statusLabel) {
      statusLabel.textContent = state.running
        ? `AoE: square ${shouldScanUi ? getCandidateMonsters().length : 0}/${config.minMonsters}; gfb ${bestGfb?.count || 0}/${config.gfbMinMonsters}${shouldReservePriority() ? " PRIORITY" : ""}`
        : "AoE: off";
    }
  }

  function destroy() {
    stop({ persistEnabled: false });
    stopUiStartupTimer();
    document.getElementById("minibia-bot-auto-attack-aoe-section")?.remove();
  }

  bot.attackAoe = {
    start,
    stop,
    status,
    updateConfig,
    triggerSpell,
    triggerSquareSpell,
    triggerGfb,
    shouldReservePriority,
    getBestGfbCandidate,
    evaluateGfbAtPosition,
    getGfbTiles,
    destroy,
    config,
  };

  // Auto Attack's rune priority guard already checks bot.attackGfb. Point that
  // guard at the active embedded GFB implementation when the standalone module
  // is not installed.
  if (!bot.attackGfb) bot.attackGfb = {};
  if (!bot.attackGfb.destroy) bot.attackGfb.shouldReservePriority = shouldReservePriority;

  bot.addCleanup(destroy);
  ensureUiAtStartup();
  if (config.enabled) start();
  return bot.attackAoe;
};window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoAttackGfbModule = function installAutoAttackGfbModule(bot) {
  if (!bot || bot.attackGfb?.destroy) return bot?.attackGfb;

  const configStorageKey = "minibiaBot.attackGfb.config";
  const state = {
    running: false,
    timerId: null,
    uiTimerId: null,
    lastCastAt: 0,
    lastMonsterCount: 0,
    lastTargetName: "",
    lastTargetPosition: null,
  };

  const config = Object.assign({
    enabled: false,
    highestPriority: false,
    hotbarSlot: null,
    minMonsters: 4,
    cooldownMs: 2000,
    scanMs: 250,
    respectTargetFilters: true,
  }, bot.storage.get(configStorageKey, {}) || {});

  config.enabled = !!config.enabled;
  config.highestPriority = !!config.highestPriority;
  config.hotbarSlot = normalizeHotbarSlot(config.hotbarSlot);
  config.minMonsters = positiveInt(config.minMonsters, 4);
  config.cooldownMs = nonNegativeInt(config.cooldownMs, 2000);
  config.scanMs = Math.max(100, positiveInt(config.scanMs, 250));
  config.respectTargetFilters = config.respectTargetFilters !== false;

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function normalizeHotbarSlot(slot) { const n = Math.trunc(Number(slot)); return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null; }
  function positiveInt(value, fallback) { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n > 0 ? n : fallback; }
  function nonNegativeInt(value, fallback) { const n = Math.trunc(Number(value)); return Number.isFinite(n) && n >= 0 ? n : fallback; }
  function normalizeName(name) { return String(name || "").trim().toLowerCase(); }

  function getPosition(value) {
    const raw = value?.getPosition?.() || value?.__position || value?.position || value;
    if (!raw) return null;
    const x = Number(raw.x), y = Number(raw.y), z = Number(raw.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }
      : null;
  }

  function tileDistance(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(Number(a.x) - Number(b.x)), Math.abs(Number(a.y) - Number(b.y)));
  }

  function positionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : "";
  }

  function passesTargetFilters(monster) {
    if (!config.respectTargetFilters) return true;
    const attackConfig = bot.attack?.config || {};
    const mode = attackConfig.targetFilterMode === "include" || attackConfig.targetFilterMode === "exclude" ? attackConfig.targetFilterMode : "all";
    const monsterName = normalizeName(monster?.name || "Mob");
    const included = new Set((attackConfig.includedCreatureNames || []).map(normalizeName));
    const excluded = new Set((attackConfig.excludedCreatureNames || []).map(normalizeName));
    if (mode === "include") return (!included.size || included.has(monsterName)) && !excluded.has(monsterName);
    if (mode === "exclude") return !excluded.has(monsterName);
    return !excluded.has(monsterName);
  }

  function getVisibleMonsters() {
    return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []).filter(passesTargetFilters);
  }

  function getGfbTiles(centerPosition) {
    if (!centerPosition) return [];
    const rowWidths = [1, 5, 5, 7, 5, 5, 1];
    const tiles = [];
    for (let row = 0; row < rowWidths.length; row += 1) {
      const width = rowWidths[row];
      const yOffset = row - 3;
      const half = Math.floor(width / 2);
      for (let xOffset = -half; xOffset <= half; xOffset += 1) {
        tiles.push({ x: centerPosition.x + xOffset, y: centerPosition.y + yOffset, z: centerPosition.z });
      }
    }
    return tiles;
  }

  function evaluateGfbAtPosition(centerPosition, monsters = getVisibleMonsters()) {
    const tileKeys = new Set(getGfbTiles(centerPosition).map(positionKey));
    const hitMonsters = monsters.filter((monster) => {
      const position = getPosition(monster);
      return position && position.z === centerPosition.z && tileKeys.has(positionKey(position));
    });
    return { position: centerPosition, count: hitMonsters.length, monsters: hitMonsters, tiles: Array.from(tileKeys) };
  }

  function getBestGfbCandidate() {
    const playerPosition = getPosition(bot.getPlayerPosition?.());
    if (!playerPosition) return null;

    const monsters = getVisibleMonsters().filter((monster) => {
      const position = getPosition(monster);
      return position && position.z === playerPosition.z && tileDistance(playerPosition, position) <= 7;
    });
    if (!monsters.length) return null;

    const candidatesByKey = new Map();
    monsters.forEach((monster) => {
      const position = getPosition(monster);
      if (position) candidatesByKey.set(positionKey(position), { position, target: monster });
    });

    const evaluations = Array.from(candidatesByKey.values()).map((candidate) => ({
      ...evaluateGfbAtPosition(candidate.position, monsters),
      target: candidate.target,
    }));

    evaluations.sort((left, right) => {
      const countDiff = right.count - left.count;
      if (countDiff) return countDiff;
      return tileDistance(playerPosition, left.position) - tileDistance(playerPosition, right.position);
    });

    return evaluations[0] || null;
  }

  function shouldReservePriority() {
    const slot = normalizeHotbarSlot(config.hotbarSlot);
    if (!state.running || !config.enabled || !config.highestPriority || !slot) return false;
    const best = getBestGfbCandidate();
    return !!best && best.count >= positiveInt(config.minMonsters, 4);
  }

  function getTileFromPosition(position) {
    if (!position) return null;
    if (typeof Position === "function") {
      return window.gameClient?.world?.getTileFromWorldPosition?.(new Position(position.x, position.y, position.z)) || null;
    }
    return window.gameClient?.world?.getTileFromWorldPosition?.(position) || null;
  }

  function clickCrosshairTarget(best) {
    const slot = normalizeHotbarSlot(config.hotbarSlot);
    if (!slot || !best?.position) return false;

    if (!bot.clickHotbar(slot - 1)) return false;

    const tile = getTileFromPosition(best.position);
    const target = best.target || best.monsters?.[0] || tile;
    const mouse = window.gameClient?.mouse;
    const targetRef = tile ? { which: tile, index: 0xFF } : target ? { which: target, index: 0xFF } : null;

    const fireTarget = () => {
      if (targetRef && typeof mouse?.__handleItemUseWith === "function") {
        try { mouse.__handleItemUseWith(null, targetRef); return true; } catch (error) {}
      }
      if (targetRef && typeof mouse?.__handleThingUse === "function") {
        try { mouse.__handleThingUse(targetRef); return true; } catch (error) {}
      }
      if (tile && typeof mouse?.__handleTileClick === "function") {
        try { mouse.__handleTileClick(tile); return true; } catch (error) {}
      }
      if (target && typeof mouse?.__handleCreatureClick === "function") {
        try { mouse.__handleCreatureClick(target); return true; } catch (error) {}
      }
      return false;
    };

    if (fireTarget()) return true;

    bot.log("GFB crosshair target could not be clicked by known mouse handlers", { position: best.position, target: best.target?.name || "Mob" });
    return false;
  }

  function canCast(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.hotbarSlot);
    if (!state.running || !config.enabled || !slot) return false;
    if (now - state.lastCastAt < nonNegativeInt(config.cooldownMs, 2000)) return false;
    const best = getBestGfbCandidate();
    return !!best && best.count >= positiveInt(config.minMonsters, 4);
  }

  function triggerGreatFireball(now = Date.now()) {
    if (!canCast(now)) return false;
    const best = getBestGfbCandidate();
    if (!best || best.count < positiveInt(config.minMonsters, 4)) return false;

    const casted = clickCrosshairTarget(best);
    if (casted) {
      state.lastCastAt = now;
      state.lastMonsterCount = best.count;
      state.lastTargetName = best.target?.name || best.monsters?.[0]?.name || "Mob";
      state.lastTargetPosition = best.position;
      bot.log("used great fireball hotkey", { slot: config.hotbarSlot, monsterCount: best.count, target: state.lastTargetName, position: best.position, shape: "1-5-5-7-5-5-1" });
    }
    refreshUiValues();
    return casted;
  }

  function tick() {
    if (!state.running) return;
    try { triggerGreatFireball(); } catch (error) { bot.log("great fireball tick failed", error?.message || error); }
    state.timerId = window.setTimeout(tick, Math.max(100, positiveInt(config.scanMs, 250)));
  }

  function start(overrides = {}) {
    updateConfig(Object.assign({}, overrides, { enabled: true }), { silent: true });
    if (state.running) return false;
    state.running = true;
    bot.log("great fireball started", { ...config });
    tick();
    refreshUiValues();
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    if (state.timerId != null) window.clearTimeout(state.timerId);
    state.timerId = null;
    if (options.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("great fireball stopped");
    refreshUiValues();
    return true;
  }

  function updateConfig(nextConfig = {}, options = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) nextConfig.enabled = !!nextConfig.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "highestPriority")) nextConfig.highestPriority = !!nextConfig.highestPriority;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "hotbarSlot")) nextConfig.hotbarSlot = normalizeHotbarSlot(nextConfig.hotbarSlot);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMonsters")) nextConfig.minMonsters = positiveInt(nextConfig.minMonsters, config.minMonsters || 4);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "cooldownMs")) nextConfig.cooldownMs = nonNegativeInt(nextConfig.cooldownMs, config.cooldownMs || 2000);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "scanMs")) nextConfig.scanMs = Math.max(100, positiveInt(nextConfig.scanMs, config.scanMs || 250));
    if (Object.prototype.hasOwnProperty.call(nextConfig, "respectTargetFilters")) nextConfig.respectTargetFilters = nextConfig.respectTargetFilters !== false;
    Object.assign(config, nextConfig);
    persistConfig();
    if (!options.silent) refreshUiValues();
    return { ...config };
  }

  function status() {
    const best = getBestGfbCandidate();
    return {
      running: state.running,
      config: { ...config },
      lastMonsterCount: state.lastMonsterCount,
      lastTargetName: state.lastTargetName,
      lastTargetPosition: state.lastTargetPosition,
      bestMonsterCount: best?.count || 0,
      bestTargetName: best?.target?.name || "",
      bestTargetPosition: best?.position || null,
      priorityReserved: shouldReservePriority(),
      ready: canCast(Date.now()),
    };
  }

  function ensureUi() {
    const aoeSection = document.getElementById("minibia-bot-auto-attack-aoe-section");
    if (!aoeSection || document.getElementById("minibia-bot-gfb-section")) return;

    const section = document.createElement("div");
    section.className = "mb-section";
    section.id = "minibia-bot-gfb-section";
    section.innerHTML = `
      <div class="mb-label">Great Fireball 1-5-5-7-5-5-1</div>
      <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gfb-enabled" /><span>Enable Great Fireball</span></label>
      <label class="mb-toggle"><input type="checkbox" id="minibia-bot-gfb-highest-priority" /><span>GFB Highest Priority</span></label>
      <div class="mb-field-grid">
        <label class="mb-field"><span class="mb-field-label">GFB Hotkey</span><input type="number" id="minibia-bot-gfb-hotkey" min="1" max="12" placeholder="8" /></label>
        <label class="mb-field"><span class="mb-field-label">GFB Min Creatures</span><input type="number" id="minibia-bot-gfb-monsters" min="1" placeholder="4" /></label>
        <label class="mb-field"><span class="mb-field-label">GFB Cooldown MS</span><input type="number" id="minibia-bot-gfb-cooldown" min="0" placeholder="2000" /></label>
      </div>
      <div class="mb-small-note">Highest Priority blocks other rune/AoE casts while GFB still has enough creatures to attempt a shot, including while GFB is cooling down.</div>
      <div class="mb-small-note">Hotkey should have Great Fireball selected on crosshairs. Picks the best 1-5-5-7-5-5-1 shot and casts only if it hits the minimum.</div>
      <div class="mb-small-note" id="minibia-bot-gfb-status">GFB: idle</div>`;

    const energySection = document.getElementById("minibia-bot-energy-wave-enabled")?.closest?.(".mb-section");
    if (energySection?.parentElement) {
      energySection.insertAdjacentElement("afterend", section);
    } else {
      aoeSection.querySelector(".mb-stack")?.appendChild(section);
    }

    const enabled = section.querySelector("#minibia-bot-gfb-enabled");
    const highestPriority = section.querySelector("#minibia-bot-gfb-highest-priority");
    const hotkey = section.querySelector("#minibia-bot-gfb-hotkey");
    const monsters = section.querySelector("#minibia-bot-gfb-monsters");
    const cooldown = section.querySelector("#minibia-bot-gfb-cooldown");
    enabled?.addEventListener("change", () => enabled.checked ? start() : stop());
    highestPriority?.addEventListener("change", () => updateConfig({ highestPriority: highestPriority.checked }));
    hotkey?.addEventListener("change", () => updateConfig({ hotbarSlot: hotkey.value }));
    monsters?.addEventListener("change", () => updateConfig({ minMonsters: monsters.value }));
    cooldown?.addEventListener("change", () => updateConfig({ cooldownMs: cooldown.value }));
    refreshUiValues();
  }

  function refreshUiValues() {
    const enabled = document.getElementById("minibia-bot-gfb-enabled");
    const highestPriority = document.getElementById("minibia-bot-gfb-highest-priority");
    const hotkey = document.getElementById("minibia-bot-gfb-hotkey");
    const monsters = document.getElementById("minibia-bot-gfb-monsters");
    const cooldown = document.getElementById("minibia-bot-gfb-cooldown");
    const statusLabel = document.getElementById("minibia-bot-gfb-status");
    const best = getBestGfbCandidate();
    if (enabled) enabled.checked = !!state.running;
    if (highestPriority) highestPriority.checked = !!config.highestPriority;
    if (hotkey) hotkey.value = config.hotbarSlot || "";
    if (monsters) monsters.value = config.minMonsters;
    if (cooldown) cooldown.value = config.cooldownMs;
    if (statusLabel) statusLabel.textContent = state.running
      ? `GFB: best ${best?.count || 0}/${config.minMonsters}${shouldReservePriority() ? "; priority reserved" : ""}${best?.target ? ` via ${best.target.name || "Mob"}` : ""}`
      : "GFB: off";
  }

  function destroy() {
    stop({ persistEnabled: false });
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    document.getElementById("minibia-bot-gfb-section")?.remove();
  }

  bot.attackGfb = { start, stop, status, updateConfig, triggerGreatFireball, shouldReservePriority, getBestGfbCandidate, evaluateGfbAtPosition, getGfbTiles, destroy, config };
  state.uiTimerId = window.setInterval(() => { ensureUi(); refreshUiValues(); }, 1000);
  bot.addCleanup(destroy);
  if (config.enabled) start(); else ensureUi();
  return bot.attackGfb;
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

// Safe layout helper: retries briefly during startup, then stops.
(function moveAoeIntoFourthColumnSafely() {
  const columnId = "minibia-bot-aoe-column";
  const styleId = "minibia-bot-aoe-column-style";

  function installStyle() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #minibia-bot-panel {
        width: min(98vw, 1260px) !important;
        max-width: calc(100vw - 12px) !important;
      }
      #minibia-bot-panel[data-collapsed="true"] {
        width: 220px !important;
      }
      #minibia-bot-panel .mb-body:not([hidden]) {
        grid-template-columns: minmax(0, 1fr) 280px 240px 280px !important;
      }
      #minibia-bot-panel .mb-aoe-column {
        display: grid !important;
        gap: 10px !important;
        align-content: start !important;
        min-width: 0 !important;
      }
      #minibia-bot-panel #minibia-bot-auto-attack-aoe-section {
        max-height: none !important;
        overflow: visible !important;
      }
      @media (max-width: 760px) {
        #minibia-bot-panel .mb-body:not([hidden]) {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function moveAoeSection() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const body = panel?.querySelector?.(".mb-body");
    const aoeSection = document.getElementById("minibia-bot-auto-attack-aoe-section");
    if (!panel || !body || !aoeSection) return false;

    installStyle();
    let column = document.getElementById(columnId);
    if (!column) {
      column = document.createElement("div");
      column.id = columnId;
      column.className = "mb-aoe-column";
      body.appendChild(column);
    }
    if (aoeSection.parentElement !== column) column.prepend(aoeSection);
    return true;
  }

  let attempts = 0;
  const retryId = window.setInterval(() => {
    attempts += 1;
    if (moveAoeSection() || attempts >= 30) window.clearInterval(retryId);
  }, 1000);
  moveAoeSection();
})();

// The old GFB helper used to run a permanent 250 ms interval even when disabled.
// GFB 2.0 already owns its own timer and starts/stops it with the feature toggle,
// so no separate background combat interval is installed here.

(function configureCaptchaAlarmTiming() {
  const desiredConfig = { beepIntervalMs: 3000, alertDurationMs: 30000 };

  function applyTiming() {
    try {
      const alertModule = window.minibiaBot?.redTextAlert;
      if (!alertModule?.updateConfig) return false;
      alertModule.updateConfig(desiredConfig, { silent: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  let attempts = 0;
  const retryId = window.setInterval(() => {
    attempts += 1;
    if (applyTiming() || attempts >= 30) window.clearInterval(retryId);
  }, 1000);
  applyTiming();
})();

(function makeSquareCooldownEditable() {
  const inputId = "minibia-bot-auto-attack-aoe-cooldown";
  let editing = false;
  let draftValue = "";

  function saveCooldown(value) {
    const cooldownMs = Math.max(0, Math.trunc(Number(value)));
    if (!Number.isFinite(cooldownMs)) return false;
    try {
      window.minibiaBot?.attackAoe?.updateConfig?.({ cooldownMs });
      return true;
    } catch (_) {
      return false;
    }
  }

  function attach() {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.squareCooldownEditableInstalled === "true") return false;
    input.dataset.squareCooldownEditableInstalled = "true";
    input.removeAttribute("readonly");
    input.disabled = false;
    input.addEventListener("focus", () => {
      editing = true;
      draftValue = input.value;
    });
    input.addEventListener("input", () => {
      editing = true;
      draftValue = input.value;
      saveCooldown(draftValue);
    });
    input.addEventListener("change", () => {
      draftValue = input.value;
      saveCooldown(draftValue);
    });
    input.addEventListener("blur", () => {
      saveCooldown(input.value);
      editing = false;
    });
    return true;
  }

  let attempts = 0;
  const retryId = window.setInterval(() => {
    attempts += 1;
    const input = document.getElementById(inputId);
    attach();
    if (editing && input && document.activeElement === input && input.value !== draftValue) {
      input.value = draftValue;
    }
    if (attempts >= 40 && !editing) window.clearInterval(retryId);
  }, 250);
})();

(function forceNormalAutoAttackRangeSix() {
  const storageKey = "minibiaBot.attack.config";

  function applySix() {
    try {
      const rawValue = window.localStorage.getItem(storageKey);
      const config = rawValue ? JSON.parse(rawValue) : {};
      if (config.maxTargetDistance !== 6) {
        config.maxTargetDistance = 6;
        window.localStorage.setItem(storageKey, JSON.stringify(config));
      }
      const attackConfig = window.minibiaBot?.attack?.config;
      if (attackConfig && attackConfig.maxTargetDistance !== 6) attackConfig.maxTargetDistance = 6;
    } catch (_) {}
  }

  applySix();
  window.setTimeout(applySix, 500);
})();

// Adds a second square hotkey as a lower-priority fallback.
// Square Hotkey #1 gets an authoritative cast attempt before #2. If #1 is
// cooling down, Square Hotkey #2 may cast if its own conditions are met.
(function installSecondSquareHotkey() {
  const storageKey = "minibiaBot.attackAoe.square2.config";
  const sectionId = "minibia-bot-auto-attack-aoe-square2-section";
  const defaults = {
    hotbarSlot: null,
    minMonsters: 2,
    squareRange: 3,
    cooldownMs: 2000,
  };
  const state = {
    lastHotkeyAt: 0,
    lastMonsterCount: 0,
    timerId: null,
    uiRetryTimerId: null,
    syncTimerId: null,
  };

  function normalizeSlot(value) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number >= 1 && number <= 12 ? number : null;
  }

  function positiveInt(value, fallback) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function nonNegativeInt(value, fallback) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function loadConfig() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
      return {
        hotbarSlot: normalizeSlot(saved.hotbarSlot),
        minMonsters: positiveInt(saved.minMonsters, defaults.minMonsters),
        squareRange: positiveInt(saved.squareRange, defaults.squareRange),
        cooldownMs: nonNegativeInt(saved.cooldownMs, defaults.cooldownMs),
      };
    } catch (_) {
      return { ...defaults };
    }
  }

  const config = loadConfig();

  function persistConfig() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(config));
    } catch (_) {}
  }

  function getPosition(value) {
    const raw = value?.getPosition?.() || value?.__position || value?.position || value;
    if (!raw) return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    const z = Number(raw.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }
      : null;
  }

  function tileDistance(left, right) {
    if (!left || !right || left.z !== right.z) return Number.POSITIVE_INFINITY;
    return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
  }

  function normalizeName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function passesTargetFilters(monster, primaryConfig) {
    if (primaryConfig?.respectTargetFilters === false) return true;
    const attackConfig = window.minibiaBot?.attack?.config || {};
    const mode = attackConfig.targetFilterMode === "include" || attackConfig.targetFilterMode === "exclude"
      ? attackConfig.targetFilterMode
      : "all";
    const name = normalizeName(monster?.name || "Mob");
    const included = new Set((attackConfig.includedCreatureNames || []).map(normalizeName));
    const excluded = new Set((attackConfig.excludedCreatureNames || []).map(normalizeName));
    if (mode === "include") return (!included.size || included.has(name)) && !excluded.has(name);
    return !excluded.has(name);
  }

  function countMonsters(range, primaryConfig) {
    const bot = window.minibiaBot;
    const playerPosition = getPosition(bot?.getPlayerPosition?.());
    if (!bot || !playerPosition) return 0;
    return (bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [])
      .filter((monster) => passesTargetFilters(monster, primaryConfig))
      .filter((monster) => tileDistance(playerPosition, getPosition(monster)) <= range)
      .length;
  }

  function getPrimaryStatus() {
    try {
      return window.minibiaBot?.attackAoe?.status?.() || null;
    } catch (_) {
      return null;
    }
  }

  function primarySquareConditionsMet(status) {
    const primaryConfig = status?.config || {};
    if (!status?.running || !primaryConfig.enabled || !normalizeSlot(primaryConfig.spellHotbarSlot)) return false;
    if (primaryConfig.requireAutoAttackRunning !== false && !window.minibiaBot?.attack?.status?.().running) return false;
    const primaryCount = countMonsters(positiveInt(primaryConfig.squareRange, 3), primaryConfig);
    return primaryCount >= positiveInt(primaryConfig.minMonsters, 3);
  }

  function primarySquareIsReady(status) {
    return primarySquareConditionsMet(status) && status?.ready === true;
  }

  function secondConditionsMet(now = Date.now(), status = getPrimaryStatus()) {
    const bot = window.minibiaBot;
    const primaryConfig = status?.config || {};
    if (!bot || !status?.running || !primaryConfig.enabled || !normalizeSlot(config.hotbarSlot)) return false;
    if (primaryConfig.requireAutoAttackRunning !== false && !bot.attack?.status?.().running) return false;
    if (bot.attackAoe?.shouldReservePriority?.()) return false;
    if (now - state.lastHotkeyAt < nonNegativeInt(config.cooldownMs, 2000)) return false;
    return countMonsters(positiveInt(config.squareRange, 3), primaryConfig) >= positiveInt(config.minMonsters, 2);
  }

  function canCastSecond(now = Date.now()) {
    const status = getPrimaryStatus();
    if (!secondConditionsMet(now, status)) return false;
    if (primarySquareIsReady(status)) return false;
    return true;
  }

  function triggerSecond(now = Date.now()) {
    const bot = window.minibiaBot;
    const status = getPrimaryStatus();
    if (!secondConditionsMet(now, status)) return false;

    // Strict priority handoff: if #1 meets its monster/range conditions, let the
    // primary module make the authoritative cooldown check and cast attempt first.
    // Only when that attempt returns false (for example #1 is cooling down) may #2 fire.
    if (primarySquareConditionsMet(status)) {
      const primaryCast = bot?.attackAoe?.triggerSquareSpell?.(now);
      if (primaryCast) {
        refreshUi();
        return false;
      }
    }

    const primaryConfig = status?.config || {};
    const slot = normalizeSlot(config.hotbarSlot);
    const monsterCount = countMonsters(positiveInt(config.squareRange, 3), primaryConfig);
    const clicked = bot?.clickHotbar?.(slot - 1);
    if (clicked) {
      state.lastHotkeyAt = now;
      state.lastMonsterCount = monsterCount;
      bot.log?.("used square hotkey #2", {
        slot,
        monsterCount,
        squareRange: config.squareRange,
        priority: 2,
      });
    }
    refreshUi();
    return !!clicked;
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "hotbarSlot")) config.hotbarSlot = normalizeSlot(nextConfig.hotbarSlot);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMonsters")) config.minMonsters = positiveInt(nextConfig.minMonsters, config.minMonsters || 2);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "squareRange")) config.squareRange = positiveInt(nextConfig.squareRange, config.squareRange || 3);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "cooldownMs")) config.cooldownMs = nonNegativeInt(nextConfig.cooldownMs, config.cooldownMs || 2000);
    persistConfig();
    refreshUi();
  }

  function ensureUi() {
    if (document.getElementById(sectionId)) return true;
    const mainSection = document.getElementById("minibia-bot-auto-attack-aoe-section");
    const firstGrid = mainSection?.querySelector?.(".mb-field-grid");
    if (!mainSection || !firstGrid) return false;

    const section = document.createElement("div");
    section.id = sectionId;
    section.className = "mb-section";
    section.innerHTML = `
      <div class="mb-label">Square Hotkey #2 (Lower Priority)</div>
      <div class="mb-field-grid">
        <label class="mb-field"><span class="mb-field-label">Square Hotkey #2</span><input type="number" id="minibia-bot-auto-attack-aoe-hotkey-2" min="1" max="12" placeholder="6" /></label>
        <label class="mb-field"><span class="mb-field-label">Square #2 Min Monsters</span><input type="number" id="minibia-bot-auto-attack-aoe-monsters-2" min="1" placeholder="2" /></label>
        <label class="mb-field"><span class="mb-field-label">Square #2 Range</span><input type="number" id="minibia-bot-auto-attack-aoe-range-2" min="1" placeholder="3" /></label>
        <label class="mb-field"><span class="mb-field-label">Square #2 Cooldown MS</span><input type="number" id="minibia-bot-auto-attack-aoe-cooldown-2" min="0" placeholder="2000" /></label>
      </div>
      <div class="mb-small-note" id="minibia-bot-auto-attack-aoe-status-2">Square #2: off</div>`;

    firstGrid.insertAdjacentElement("afterend", section);

    section.querySelector("#minibia-bot-auto-attack-aoe-hotkey-2")?.addEventListener("change", (event) => updateConfig({ hotbarSlot: event.target.value }));
    section.querySelector("#minibia-bot-auto-attack-aoe-monsters-2")?.addEventListener("change", (event) => updateConfig({ minMonsters: event.target.value }));
    section.querySelector("#minibia-bot-auto-attack-aoe-range-2")?.addEventListener("change", (event) => updateConfig({ squareRange: event.target.value }));
    section.querySelector("#minibia-bot-auto-attack-aoe-cooldown-2")?.addEventListener("change", (event) => updateConfig({ cooldownMs: event.target.value }));
    refreshUi();
    return true;
  }

  function refreshUi() {
    const hotkey = document.getElementById("minibia-bot-auto-attack-aoe-hotkey-2");
    const monsters = document.getElementById("minibia-bot-auto-attack-aoe-monsters-2");
    const range = document.getElementById("minibia-bot-auto-attack-aoe-range-2");
    const cooldown = document.getElementById("minibia-bot-auto-attack-aoe-cooldown-2");
    const label = document.getElementById("minibia-bot-auto-attack-aoe-status-2");
    if (hotkey && document.activeElement !== hotkey) hotkey.value = config.hotbarSlot || "";
    if (monsters && document.activeElement !== monsters) monsters.value = config.minMonsters;
    if (range && document.activeElement !== range) range.value = config.squareRange;
    if (cooldown && document.activeElement !== cooldown) cooldown.value = config.cooldownMs;

    if (label) {
      const status = getPrimaryStatus();
      const primaryConfig = status?.config || {};
      if (!status?.running || !primaryConfig.enabled) {
        label.textContent = "Square #2: off";
        return;
      }
      const count = countMonsters(positiveInt(config.squareRange, 3), primaryConfig);
      if (primarySquareIsReady(status)) label.textContent = `Square #2: waiting — #1 ready (${count}/${config.minMonsters})`;
      else label.textContent = `Square #2: watching (${count}/${config.minMonsters})`;
    }
  }

  function primaryAoeEnabled() {
    const status = getPrimaryStatus();
    return !!status?.running && !!status?.config?.enabled;
  }

  function stopTimer() {
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
  }

  function tickSecondSquare() {
    if (!primaryAoeEnabled()) {
      stopTimer();
      refreshUi();
      return;
    }
    try { triggerSecond(); }
    catch (error) { window.minibiaBot?.log?.("square hotkey #2 tick failed", error?.message || error); }
    refreshUi();
  }

  function syncTimer() {
    if (!primaryAoeEnabled()) {
      stopTimer();
      refreshUi();
      return;
    }
    if (state.timerId == null) state.timerId = window.setInterval(tickSecondSquare, 250);
  }

  function installUiOnce() {
    if (ensureUi()) return;
    let attempts = 0;
    state.uiRetryTimerId = window.setInterval(() => {
      attempts += 1;
      if (ensureUi() || attempts >= 40) {
        window.clearInterval(state.uiRetryTimerId);
        state.uiRetryTimerId = null;
      }
    }, 250);
  }

  window.minibiaSquareHotkey2 = {
    config,
    updateConfig,
    trigger: triggerSecond,
    syncTimer,
    status: () => ({
      config: { ...config },
      lastMonsterCount: state.lastMonsterCount,
      ready: canCastSecond(Date.now()),
      timerRunning: state.timerId != null,
    }),
  };

  installUiOnce();
  syncTimer();

  // Lightweight state synchronization only; no creature/world scan occurs here.
  // This allows Square #2 to start/stop with the primary AoE toggle without leaving
  // its 250 ms combat scanner alive while AoE is disabled.
  state.syncTimerId = window.setInterval(syncTimer, 1000);
})();window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installLureModeModule = function installLureModeModule(bot) {
  const configStorageKey = "minibiaBot.lure.config";
  const COUNT_RANGE = 7;
  const COUNT_RANGE_Y = 5;
  const TICK_MS = 150;
  const DEFAULT_STEP_DELAY_MS = 450;
  const LOST_MONSTER_GRACE_MS = 10000;

  const config = Object.assign(
    { enabled: false, mode: 1, minMonsters: 3, maxDistance: 4, stepDelayMs: DEFAULT_STEP_DELAY_MS },
    bot.storage.get(configStorageKey, {}) || {}
  );

  const state = {
    timerId: null,
    uiTimerId: null,
    pathfinder: null,
    originalFindPath: null,
    suppressingAttack: false,
    restoreAttackEnabled: false,
    lastHoldLogAt: 0,
    lastStatus: null,
    clearingPack: false,
    resumeCaveAfterClear: false,

    // Mode 2 is intentionally independent from Cavebot path execution.
    mode2Active: false,
    mode2CaveWasRunning: false,
    mode2Waypoint: null,
    mode2NextStepAt: 0,
    mode2LastMonsterSeenAt: 0,
    mode2LastStepAt: 0,
    mode2LastStepFrom: null,
    mode2LastStepTo: null,
  };

  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }

  function intValue(value, fallback, min = 1, max = 99) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }

  function modeValue(value) { return Number(value) === 2 ? 2 : 1; }

  function pos(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      ? { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) }
      : null;
  }

  function dist(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return Infinity;
    return Math.max(Math.abs(Number(a.x) - Number(b.x)), Math.abs(Number(a.y) - Number(b.y)));
  }

  function isWithinDetectionRange(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return false;
    return Math.abs(Number(a.x) - Number(b.x)) <= COUNT_RANGE
      && Math.abs(Number(a.y) - Number(b.y)) <= COUNT_RANGE_Y;
  }

  function playerPos() { return pos(bot.getPlayerPosition?.() || window.gameClient?.player?.__position); }
  function monsterPos(monster) { return pos(monster?.getPosition?.() || monster?.__position || monster?.position); }
  function currentTarget() { return bot.attack?.getCurrentTarget?.() || window.gameClient?.player?.__target || null; }
  function visibleMonsters() { return bot.attack?.getNearbyMonsters?.() || bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || []; }

  function getOffStatus() {
    return {
      enabled: false,
      mode: modeValue(config.mode),
      countRange: COUNT_RANGE,
      minMonsters: intValue(config.minMonsters, 3, 1, 20),
      maxDistance: intValue(config.maxDistance, 4, 1, COUNT_RANGE),
      stepDelayMs: intValue(config.stepDelayMs, DEFAULT_STEP_DELAY_MS, 100, 2000),
      monsterCount: 0,
      closestDistance: null,
      farthestDistance: null,
      readyToEngage: false,
      clearingPack: false,
      luring: false,
      shouldHoldWalking: false,
      hasTarget: false,
      combatActive: false,
      phase: "off",
      mode2Active: false,
    };
  }

  function getLureMonsters() {
    if (!config.enabled) return [];
    const me = playerPos();
    if (!me) return [];
    return visibleMonsters()
      .map((monster) => ({ monster, position: monsterPos(monster) }))
      .map((entry) => ({ ...entry, distance: dist(me, entry.position) }))
      .filter((entry) => entry.position && isWithinDetectionRange(me, entry.position))
      .sort((a, b) => a.distance - b.distance || Number(a.monster?.id || 0) - Number(b.monster?.id || 0));
  }

  function getLureStatus() {
    if (!config.enabled) return getOffStatus();

    const monsters = getLureMonsters();
    const mode = modeValue(config.mode);
    const minMonsters = intValue(config.minMonsters, 3, 1, 20);
    const maxDistance = intValue(config.maxDistance, 4, 1, COUNT_RANGE);
    const stepDelayMs = intValue(config.stepDelayMs, DEFAULT_STEP_DELAY_MS, 100, 2000);
    const hasTarget = !!currentTarget();
    const combatActive = !!bot.attack?.status?.()?.combatActive;
    const closestDistance = monsters.length ? monsters[0].distance : Infinity;
    const farthestDistance = monsters.length ? monsters[monsters.length - 1].distance : Infinity;
    const readyToEngage = monsters.length >= minMonsters;
    const clearingPack = !!state.clearingPack;
    const luring = monsters.length > 0 && !readyToEngage && !clearingPack && !hasTarget && !combatActive;

    let phase = "looking";
    let shouldHoldWalking = false;

    if (clearingPack) {
      phase = "clearing";
      shouldHoldWalking = true;
    } else if (readyToEngage) {
      phase = "engage";
      shouldHoldWalking = true;
    } else if (mode === 1 && luring) {
      shouldHoldWalking = closestDistance > maxDistance;
      phase = shouldHoldWalking ? "waiting" : "walking";
    } else if (mode === 2 && state.mode2Active) {
      if (!monsters.length) phase = "lost-wait";
      else if (farthestDistance > maxDistance) phase = "waiting";
      else if (Date.now() < state.mode2NextStepAt) phase = "delay";
      else phase = "step-ready";
      shouldHoldWalking = true;
    } else if (monsters.length) {
      phase = "seen";
    }

    return {
      enabled: true,
      mode,
      countRange: COUNT_RANGE,
      minMonsters,
      maxDistance,
      stepDelayMs,
      monsterCount: monsters.length,
      closestDistance: Number.isFinite(closestDistance) ? closestDistance : null,
      farthestDistance: Number.isFinite(farthestDistance) ? farthestDistance : null,
      readyToEngage,
      clearingPack,
      luring,
      shouldHoldWalking,
      hasTarget,
      combatActive,
      phase,
      mode2Active: !!state.mode2Active,
      mode2Waypoint: state.mode2Waypoint ? { ...state.mode2Waypoint } : null,
      mode2NextStepAt: state.mode2NextStepAt,
    };
  }

  function setAttackSuppressed(shouldSuppress) {
    const attackConfig = bot.attack?.config;
    if (!attackConfig) return false;

    if (shouldSuppress) {
      if (!state.suppressingAttack) {
        state.restoreAttackEnabled = !!attackConfig.enabled;
        state.suppressingAttack = true;
      }
      attackConfig.enabled = false;
      return true;
    }

    if (state.suppressingAttack) {
      if (state.restoreAttackEnabled) attackConfig.enabled = true;
      state.suppressingAttack = false;
      state.restoreAttackEnabled = false;
      return true;
    }
    return false;
  }

  function stopCurrentPath() {
    const targets = [
      window.gameClient?.world?.pathfinder,
      window.gameClient?.player,
      window.gameClient?.world,
    ].filter(Boolean);

    let stopped = false;
    ["stop", "cancel", "clear", "clearPath", "stopWalking", "cancelWalking", "stopAutoWalk", "reset"].forEach((name) => {
      targets.forEach((target) => {
        if (typeof target?.[name] !== "function") return;
        try { target[name](); stopped = true; } catch (error) {}
      });
    });
    return stopped;
  }

  function getCurrentCaveWaypoint() {
    const status = bot.cave?.status?.() || null;
    return pos(status?.currentWaypoint);
  }

  function pauseCaveForMode2() {
    if (state.mode2Active) return true;
    const caveStatus = bot.cave?.status?.() || null;
    state.mode2CaveWasRunning = !!caveStatus?.running;
    state.mode2Waypoint = pos(caveStatus?.currentWaypoint);
    state.mode2Active = true;
    state.mode2NextStepAt = 0;
    state.mode2LastMonsterSeenAt = Date.now();

    stopCurrentPath();
    if (caveStatus?.running) {
      try { bot.cave?.stop?.({ persistEnabled: false }); }
      catch (error) { try { bot.cave?.stop?.(); } catch (ignored) {} }
    }

    bot.log?.("lure mode 2 took control from cavebot", {
      waypoint: state.mode2Waypoint,
      caveWasRunning: state.mode2CaveWasRunning,
    });
    return true;
  }

  function releaseMode2Control({ resumeCave = true } = {}) {
    if (!state.mode2Active) return false;
    const shouldResume = resumeCave && state.mode2CaveWasRunning;

    state.mode2Active = false;
    state.mode2NextStepAt = 0;
    state.mode2LastMonsterSeenAt = 0;
    state.mode2LastStepAt = 0;
    state.mode2LastStepFrom = null;
    state.mode2LastStepTo = null;
    state.mode2Waypoint = null;
    state.mode2CaveWasRunning = false;

    stopCurrentPath();

    if (shouldResume) {
      try { bot.cave?.start?.(); } catch (error) {}
    }
    return true;
  }

  function pauseCaveForFight() {
    stopCurrentPath();

    if (modeValue(config.mode) === 2) {
      if (!state.mode2Active) pauseCaveForMode2();
      return;
    }

    try {
      const caveStatus = bot.cave?.status?.();
      if (caveStatus?.running && typeof bot.cave.stop === "function") {
        state.resumeCaveAfterClear = true;
        bot.cave.stop();
      }
    } catch (error) {}
  }

  function resumeCaveIfNeeded() {
    if (modeValue(config.mode) === 2) {
      releaseMode2Control({ resumeCave: true });
      return;
    }

    if (!state.resumeCaveAfterClear) return;
    state.resumeCaveAfterClear = false;
    try { bot.cave?.start?.(); } catch (error) {}
  }

  // Mode 1 keeps the old pathfinder behavior. Mode 2 never uses this.
  function patchPathfinderForMode1() {
    if (!config.enabled || modeValue(config.mode) !== 1) {
      restorePathfinder();
      return false;
    }

    const pf = window.gameClient?.world?.pathfinder;
    if (!pf || typeof pf.findPath !== "function") return false;
    if (state.pathfinder === pf && state.originalFindPath) return true;

    if (state.pathfinder && state.originalFindPath) {
      try { state.pathfinder.findPath = state.originalFindPath; } catch (error) {}
    }

    state.pathfinder = pf;
    state.originalFindPath = pf.findPath.bind(pf);

    pf.findPath = function lureMode1FindPathGuard(...args) {
      if (!config.enabled || modeValue(config.mode) !== 1) {
        return state.originalFindPath(...args);
      }

      const status = getLureStatus();
      state.lastStatus = status;

      if (status.shouldHoldWalking) {
        const now = Date.now();
        stopCurrentPath();
        if (now - state.lastHoldLogAt > 1500) {
          state.lastHoldLogAt = now;
          bot.log?.("lure mode 1 holding path", {
            monsterCount: status.monsterCount,
            closestDistance: status.closestDistance,
            maxDistance: status.maxDistance,
          });
        }
        return null;
      }

      return state.originalFindPath(...args);
    };

    return true;
  }

  function restorePathfinder() {
    if (state.pathfinder && state.originalFindPath) {
      try { state.pathfinder.findPath = state.originalFindPath; } catch (error) {}
    }
    state.pathfinder = null;
    state.originalFindPath = null;
  }

  // ----- Mode 2 one-tile movement engine -----

  const walkMatrixCache = new Map();

  function getWalkabilityMatrix(z) {
    const key = String(z);
    const cached = walkMatrixCache.get(key);
    if (cached && Date.now() - cached.at <= 750) return cached.matrix;

    const matrix = new Map();
    const chunks = window.gameClient?.world?.chunks || [];

    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) {
        const p = pos(tile?.__position);
        if (!p || p.z !== z) continue;
        matrix.set(`${p.x},${p.y}`, tile.isWalkable ? tile.isWalkable() : false);
      }
    }

    walkMatrixCache.set(key, { matrix, at: Date.now() });
    return matrix;
  }

  function getNeighbors(node, matrix) {
    const directions = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    return directions
      .map((d) => ({ x: node.x + d.x, y: node.y + d.y, z: node.z }))
      .filter((p) => matrix.get(`${p.x},${p.y}`) === true);
  }

  function heuristic(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function reconstructPath(node) {
    const path = [];
    let current = node;
    while (current) {
      path.unshift({ x: current.x, y: current.y, z: current.z });
      current = current.parent;
    }
    return path;
  }

  function findOneStepToward(start, goal) {
    const from = pos(start);
    const to = pos(goal);
    if (!from || !to || from.z !== to.z) return null;
    if (from.x === to.x && from.y === to.y) return null;

    const matrix = getWalkabilityMatrix(from.z);
    const open = [{ ...from, g: 0, f: heuristic(from, to), parent: null }];
    const closed = new Set();
    const key = (p) => `${p.x},${p.y}`;

    while (open.length) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i += 1) {
        if (open[i].f < open[bestIndex].f) bestIndex = i;
      }

      const current = open.splice(bestIndex, 1)[0];
      if (current.x === to.x && current.y === to.y) {
        const path = reconstructPath(current);
        return path.length > 1 ? path[1] : null;
      }

      closed.add(key(current));

      for (const neighbor of getNeighbors(current, matrix)) {
        const neighborKey = key(neighbor);
        if (closed.has(neighborKey)) continue;

        const diagonal = neighbor.x !== current.x && neighbor.y !== current.y;
        const g = current.g + (diagonal ? 1.4 : 1);
        const f = g + heuristic(neighbor, to);
        const existing = open.find((entry) => entry.x === neighbor.x && entry.y === neighbor.y);

        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
          }
        } else {
          open.push({ ...neighbor, g, f, parent: current });
        }
      }
    }

    return null;
  }

  function pickArrowKey(from, to) {
    if (!from || !to) return null;
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);

    if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) && dx !== 0) {
      return dx > 0 ? "ArrowRight" : "ArrowLeft";
    }
    if (dy !== 0) return dy > 0 ? "ArrowDown" : "ArrowUp";
    return null;
  }

  function dispatchArrowKey(key) {
    if (!key) return false;
    const target = document.activeElement || document.body || document.documentElement;
    const eventInit = { key, code: key, bubbles: true, cancelable: true, composed: true };

    target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    document.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    window.dispatchEvent(new KeyboardEvent("keydown", eventInit));

    window.setTimeout(() => {
      target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      document.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      window.dispatchEvent(new KeyboardEvent("keyup", eventInit));
    }, 40);

    return true;
  }

  function mode2StepOnce(status) {
    if (!state.mode2Active) return false;
    const from = playerPos();
    if (!from) return false;

    let waypoint = state.mode2Waypoint;
    if (!waypoint) {
      waypoint = getCurrentCaveWaypoint();
      state.mode2Waypoint = waypoint;
    }
    if (!waypoint || waypoint.z !== from.z) {
      bot.log?.("lure mode 2 cannot step: waypoint unavailable or different floor", { from, waypoint });
      return false;
    }

    const nextTile = findOneStepToward(from, waypoint);
    if (!nextTile) {
      bot.log?.("lure mode 2 cannot find one-tile step", { from, waypoint });
      return false;
    }

    const key = pickArrowKey(from, nextTile);
    if (!key) return false;

    const moved = dispatchArrowKey(key);
    if (!moved) return false;

    state.mode2LastStepAt = Date.now();
    state.mode2NextStepAt = state.mode2LastStepAt + status.stepDelayMs;
    state.mode2LastStepFrom = from;
    state.mode2LastStepTo = nextTile;

    bot.log?.("lure mode 2 single step", {
      key,
      from,
      nextTile,
      waypoint,
      monsterCount: status.monsterCount,
      farthestDistance: status.farthestDistance,
      maxDistance: status.maxDistance,
      nextStepAt: state.mode2NextStepAt,
    });
    return true;
  }

  function updateStatusUi(status = null) {
    const label = document.getElementById("minibia-bot-lure-status");
    if (!label) return;

    const current = status || (config.enabled ? state.lastStatus || getLureStatus() : getOffStatus());
    const prefix = `Lure ${current.mode}`;

    if (!current.enabled) label.textContent = `${prefix}: off`;
    else if (current.clearingPack) label.textContent = `${prefix}: clearing ${current.monsterCount} left`;
    else if (current.readyToEngage) label.textContent = `${prefix}: engaging ${current.monsterCount}/${current.minMonsters}`;
    else if (current.mode === 2 && current.mode2Active) {
      if (current.phase === "lost-wait") label.textContent = `${prefix}: holding lure — monster temporarily lost`;
      else if (current.phase === "waiting") label.textContent = `${prefix}: wait ${current.farthestDistance}/${current.maxDistance}`;
      else if (current.phase === "delay") label.textContent = `${prefix}: stepped — rechecking pack`;
      else if (current.phase === "step-ready") label.textContent = `${prefix}: one step ready ${current.monsterCount}/${current.minMonsters}`;
      else label.textContent = `${prefix}: luring ${current.monsterCount}/${current.minMonsters}`;
    } else if (current.shouldHoldWalking) {
      label.textContent = `${prefix}: waiting ${current.closestDistance}/${current.maxDistance}`;
    } else if (current.monsterCount > 0) {
      label.textContent = `${prefix}: walking ${current.monsterCount}/${current.minMonsters}`;
    } else {
      label.textContent = `${prefix}: looking 0/${current.minMonsters}`;
    }
  }

  function tickMode2() {
    restorePathfinder();

    let status = getLureStatus();
    state.lastStatus = status;

    if (state.clearingPack) {
      setAttackSuppressed(false);
      pauseCaveForFight();

      if (!status.hasTarget && status.monsterCount > 0) {
        bot.attack?.triggerAttack?.();
      }

      if (!status.hasTarget && !status.combatActive && status.monsterCount === 0) {
        state.clearingPack = false;
        bot.log?.("lure mode 2 pack cleared");
        releaseMode2Control({ resumeCave: true });
        status = getLureStatus();
      }

      state.lastStatus = status;
      updateStatusUi(status);
      return status;
    }

    if (status.readyToEngage) {
      if (!state.mode2Active) pauseCaveForMode2();
      state.clearingPack = true;
      setAttackSuppressed(false);
      stopCurrentPath();
      bot.attack?.triggerAttack?.();

      window.setTimeout(() => {
        if (!config.enabled || modeValue(config.mode) !== 2 || !state.clearingPack) return;
        stopCurrentPath();
        bot.attack?.triggerAttack?.();
      }, 100);

      bot.log?.("lure mode 2 engaging pack", {
        monsterCount: status.monsterCount,
        minMonsters: status.minMonsters,
      });

      const current = getLureStatus();
      state.lastStatus = current;
      updateStatusUi(current);
      return current;
    }

    if (status.hasTarget || status.combatActive) {
      if (!state.mode2Active) pauseCaveForMode2();
      setAttackSuppressed(false);
      stopCurrentPath();
      updateStatusUi(status);
      return status;
    }

    if (!state.mode2Active) {
      if (status.monsterCount <= 0) {
        setAttackSuppressed(false);
        updateStatusUi(status);
        return status;
      }
      pauseCaveForMode2();
      status = getLureStatus();
      state.lastStatus = status;
    }

    setAttackSuppressed(true);
    stopCurrentPath();

    if (status.monsterCount > 0) {
      state.mode2LastMonsterSeenAt = Date.now();

      if (
        Number.isFinite(status.farthestDistance)
        && status.farthestDistance <= status.maxDistance
        && Date.now() >= state.mode2NextStepAt
      ) {
        mode2StepOnce(status);
      }
    } else {
      const lostForMs = Date.now() - state.mode2LastMonsterSeenAt;
      if (state.mode2LastMonsterSeenAt && lostForMs >= LOST_MONSTER_GRACE_MS) {
        bot.log?.("lure mode 2 released lost lure", { lostForMs });
        setAttackSuppressed(false);
        releaseMode2Control({ resumeCave: true });
        status = getLureStatus();
      }
    }

    state.lastStatus = status;
    updateStatusUi(status);
    return status;
  }

  function tickMode1() {
    patchPathfinderForMode1();

    let status = getLureStatus();
    state.lastStatus = status;

    if (state.clearingPack && !status.hasTarget && !status.combatActive && status.monsterCount === 0) {
      state.clearingPack = false;
      status = getLureStatus();
      bot.log?.("lure mode 1 pack cleared");
      resumeCaveIfNeeded();
    }

    if (state.clearingPack) {
      setAttackSuppressed(false);
      pauseCaveForFight();
      if (!status.hasTarget && status.monsterCount > 0) bot.attack?.triggerAttack?.();
      const current = getLureStatus();
      state.lastStatus = current;
      updateStatusUi(current);
      return current;
    }

    if (status.readyToEngage) {
      state.clearingPack = true;
      setAttackSuppressed(false);
      pauseCaveForFight();
      bot.attack?.triggerAttack?.();
      window.setTimeout(() => {
        if (!config.enabled || modeValue(config.mode) !== 1) return;
        pauseCaveForFight();
        bot.attack?.triggerAttack?.();
      }, 100);
      const current = getLureStatus();
      state.lastStatus = current;
      updateStatusUi(current);
      return current;
    }

    if (status.hasTarget || status.combatActive) {
      setAttackSuppressed(false);
      updateStatusUi(status);
      return status;
    }

    setAttackSuppressed(true);
    if (status.shouldHoldWalking) stopCurrentPath();
    updateStatusUi(status);
    return status;
  }

  function tick() {
    if (!config.enabled) return getOffStatus();
    return modeValue(config.mode) === 2 ? tickMode2() : tickMode1();
  }

  function startRuntime() {
    if (!config.enabled || state.timerId != null) return false;

    if (modeValue(config.mode) === 1) {
      patchPathfinderForMode1();
    } else {
      restorePathfinder();
    }

    tick();
    state.timerId = window.setInterval(() => {
      try { tick(); } catch (error) { bot.log?.("lure mode tick failed", error?.message || error); }
    }, TICK_MS);

    return true;
  }

  function stopRuntime() {
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
    state.clearingPack = false;
    state.resumeCaveAfterClear = false;
    state.lastStatus = getOffStatus();

    setAttackSuppressed(false);
    restorePathfinder();
    releaseMode2Control({ resumeCave: true });
    updateStatusUi(state.lastStatus);
    return true;
  }

  function updateConfig(nextConfig = {}) {
    const hadEnabled = !!config.enabled;
    const previousMode = modeValue(config.mode);

    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) config.enabled = !!nextConfig.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "mode")) config.mode = modeValue(nextConfig.mode);
    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMonsters")) {
      config.minMonsters = intValue(nextConfig.minMonsters, config.minMonsters || 3, 1, 20);
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxDistance")) {
      config.maxDistance = intValue(nextConfig.maxDistance, config.maxDistance || 4, 1, COUNT_RANGE);
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "stepDelayMs")) {
      config.stepDelayMs = intValue(nextConfig.stepDelayMs, config.stepDelayMs || DEFAULT_STEP_DELAY_MS, 100, 2000);
    }

    persistConfig();

    const nextMode = modeValue(config.mode);
    if (previousMode !== nextMode) {
      state.clearingPack = false;
      setAttackSuppressed(false);
      restorePathfinder();
      releaseMode2Control({ resumeCave: true });

      if (config.enabled && nextMode === 1) patchPathfinderForMode1();
    }

    if (config.enabled && !hadEnabled) startRuntime();
    else if (!config.enabled && hadEnabled) stopRuntime();
    else if (!config.enabled) state.lastStatus = getOffStatus();

    bot.log?.("lure mode config updated", { ...config, countRange: COUNT_RANGE });
    updateUiValues();
    updateStatusUi();
    return { ...config };
  }

  function updateUiValues() {
    const enabled = document.getElementById("minibia-bot-lure-enabled");
    const mode = document.getElementById("minibia-bot-lure-mode");
    const min = document.getElementById("minibia-bot-lure-min-monsters");
    const max = document.getElementById("minibia-bot-lure-max-distance");
    const delay = document.getElementById("minibia-bot-lure-step-delay");

    if (enabled) enabled.checked = !!config.enabled;
    if (mode && document.activeElement !== mode) mode.value = String(modeValue(config.mode));
    if (min && document.activeElement !== min) min.value = String(intValue(config.minMonsters, 3, 1, 20));
    if (max && document.activeElement !== max) max.value = String(intValue(config.maxDistance, 4, 1, COUNT_RANGE));
    if (delay && document.activeElement !== delay) delay.value = String(intValue(config.stepDelayMs, DEFAULT_STEP_DELAY_MS, 100, 2000));
  }

  function installLureStyle() {
    let style = document.getElementById("minibia-bot-lure-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "minibia-bot-lure-style";
      document.head.appendChild(style);
    }

    style.textContent = `
      #minibia-bot-panel { width: min(98vw, 1260px) !important; max-width: calc(100vw - 12px) !important; }
      #minibia-bot-panel .mb-body:not([hidden]) { grid-template-columns: minmax(0, 1fr) 280px 240px 280px !important; }
      #minibia-bot-panel .mb-aoe-column { display: grid !important; gap: 10px !important; align-content: start !important; min-width: 0 !important; }
      #minibia-bot-lure-section .mb-field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      #minibia-bot-lure-standalone { display: none !important; }
      @media (max-width: 760px) { #minibia-bot-panel .mb-body:not([hidden]) { grid-template-columns: 1fr !important; } }
    `;
  }

  function makeSection() {
    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-lure-section";
    section.innerHTML = `
      <div class="mb-label">Lure Mode</div>
      <div class="mb-stack">
        <label class="mb-toggle"><input type="checkbox" id="minibia-bot-lure-enabled" /><span>Enable Lure Mode</span></label>
        <label class="mb-field" for="minibia-bot-lure-mode"><span class="mb-field-label">Mode</span>
          <select id="minibia-bot-lure-mode">
            <option value="1">Lure Mode 1 (Current)</option>
            <option value="2">Lure Mode 2 (One-Step)</option>
          </select>
        </label>
        <div class="mb-field-grid">
          <label class="mb-field" for="minibia-bot-lure-min-monsters"><span class="mb-field-label">Min Monsters</span><input type="number" id="minibia-bot-lure-min-monsters" min="1" max="20" step="1" /></label>
          <label class="mb-field" for="minibia-bot-lure-max-distance"><span class="mb-field-label">Max Distance</span><input type="number" id="minibia-bot-lure-max-distance" min="1" max="7" step="1" /></label>
          <label class="mb-field" for="minibia-bot-lure-step-delay"><span class="mb-field-label">Mode 2 Step Delay (ms)</span><input type="number" id="minibia-bot-lure-step-delay" min="100" max="2000" step="50" /></label>
        </div>
        <div class="mb-small-note">Mode 2 stops Cavebot while luring. When every tracked monster is inside Max Distance, it presses exactly one movement key toward the current waypoint, then waits and checks again.</div>
        <div class="mb-small-note">Cavebot resumes only after the pack is cleared, or after the lure has been lost for 10 seconds.</div>
        <div class="mb-small-note" id="minibia-bot-lure-status">Lure 1: off</div>
      </div>
    `;

    section.querySelector("#minibia-bot-lure-enabled")?.addEventListener("change", (event) => updateConfig({ enabled: event.target.checked }));
    section.querySelector("#minibia-bot-lure-mode")?.addEventListener("change", (event) => updateConfig({ mode: event.target.value }));
    section.querySelector("#minibia-bot-lure-min-monsters")?.addEventListener("input", (event) => updateConfig({ minMonsters: event.target.value }));
    section.querySelector("#minibia-bot-lure-max-distance")?.addEventListener("input", (event) => updateConfig({ maxDistance: event.target.value }));
    section.querySelector("#minibia-bot-lure-step-delay")?.addEventListener("input", (event) => updateConfig({ stepDelayMs: event.target.value }));
    return section;
  }

  function cleanupDuplicateLurePanels() {
    document.querySelectorAll("#minibia-bot-lure-standalone").forEach((node) => node.remove());
    const sections = Array.from(document.querySelectorAll("#minibia-bot-lure-section"));
    sections.slice(1).forEach((node) => node.remove());
    return sections[0] || null;
  }

  function getOrCreateLureSection() {
    const existing = cleanupDuplicateLurePanels();
    if (existing) existing.remove();
    return makeSection();
  }

  function getFourthColumn() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    const body = panel?.querySelector?.(".mb-body");
    if (!panel || !body) return null;

    let column = document.getElementById("minibia-bot-aoe-column");
    if (!column) {
      column = document.createElement("div");
      column.id = "minibia-bot-aoe-column";
      column.className = "mb-aoe-column";
      body.appendChild(column);
    }
    return column;
  }

  function injectUi() {
    installLureStyle();

    let section = document.getElementById("minibia-bot-lure-section");
    if (!section || !document.getElementById("minibia-bot-lure-mode")) section = getOrCreateLureSection();

    const column = getFourthColumn();
    if (column && section.parentElement !== column) column.appendChild(section);

    cleanupDuplicateLurePanels();
    updateUiValues();
    updateStatusUi();
    return !!document.getElementById("minibia-bot-lure-section");
  }

  function startUiInjector() {
    let attempts = 0;
    state.uiTimerId = window.setInterval(() => {
      attempts += 1;
      injectUi();
      const section = document.getElementById("minibia-bot-lure-section");
      const column = document.getElementById("minibia-bot-aoe-column");
      const correctlyPlaced = !!section && !!column && section.parentElement === column;
      if (correctlyPlaced || attempts >= 120) {
        window.clearInterval(state.uiTimerId);
        state.uiTimerId = null;
      }
    }, 250);
    injectUi();
  }

  function start() {
    config.enabled = true;
    persistConfig();
    updateUiValues();
    return startRuntime();
  }

  function stop(options = {}) {
    config.enabled = false;
    if (options.persistEnabled !== false) persistConfig();
    updateUiValues();
    return stopRuntime();
  }

  function destroy() {
    stop({ persistEnabled: false });
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
  }

  function status() {
    return {
      running: config.enabled && state.timerId != null,
      config: { ...config, countRange: COUNT_RANGE },
      lure: config.enabled ? getLureStatus() : getOffStatus(),
      clearingPack: config.enabled && state.clearingPack,
      resumeCaveAfterClear: config.enabled && (state.resumeCaveAfterClear || state.mode2CaveWasRunning),
      suppressingAttack: config.enabled && state.suppressingAttack,
      mode2: {
        active: state.mode2Active,
        caveWasRunning: state.mode2CaveWasRunning,
        waypoint: state.mode2Waypoint ? { ...state.mode2Waypoint } : null,
        nextStepAt: state.mode2NextStepAt,
        lastMonsterSeenAt: state.mode2LastMonsterSeenAt,
        lastStepAt: state.mode2LastStepAt,
        lastStepFrom: state.mode2LastStepFrom,
        lastStepTo: state.mode2LastStepTo,
      },
    };
  }

  bot.lureMode = { start, stop, status, updateConfig, getLureStatus, config };

  if (config.enabled) startRuntime();
  else state.lastStatus = getOffStatus();

  startUiInjector();
  bot.addCleanup?.(destroy);
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installRedTextAlertModule = function installRedTextAlertModule(bot) {
  if (!bot || bot.redTextAlert?.destroy) return bot?.redTextAlert;

  const configStorageKey = "minibiaBot.redTextAlert.config";
  const config = Object.assign(
    {
      enabled: false,
      beepIntervalMs: 1000,
      alertDurationMs: 10000,
    },
    bot.storage.get(configStorageKey, {}) || {}
  );

  function positiveInt(value, fallback) {
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  config.beepIntervalMs = positiveInt(config.beepIntervalMs, 1000);
  config.alertDurationMs = 10000;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  let audioContext = null;
  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume?.().catch?.(() => {});
    return audioContext;
  }

  function beep() {
    const ctx = getAudioContext();
    if (!ctx) return false;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(980, now);
    oscillator.frequency.setValueAtTime(740, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.38);
    return true;
  }

  function ensureUi() {
    const panel = document.getElementById("k9x-panel");
    if (!panel || document.getElementById("k9x-red-text-alert-section")) return;
    const parent = panel.querySelector(".mb-side-column") || panel.querySelector(".mb-main-column") || panel.querySelector(".mb-body") || panel;
    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "k9x-red-text-alert-section";
    section.innerHTML = `<div class="mb-label">Captcha Alarm</div><div class="mb-stack"><label class="mb-toggle"><input type="checkbox" id="k9x-red-text-alert-enabled" /><span>Enable Captcha Alarm</span></label><div class="mb-small-note" id="k9x-red-text-alert-status">Alert: off</div><div class="mb-small-note">Alarms when an Anti-bot Verification popup appears. It does not click or solve it.</div></div>`;
    parent.appendChild(section);
    section.querySelector("#k9x-red-text-alert-enabled")?.addEventListener("change", (event) => {
      config.enabled = !!event.target.checked;
      persistConfig();
      refreshUiValues();
      bot.captchaAlarm?.check?.();
    });
    refreshUiValues();
  }

  function refreshUiValues() {
    const enabled = document.getElementById("k9x-red-text-alert-enabled");
    const label = document.getElementById("k9x-red-text-alert-status");
    if (enabled) enabled.checked = !!config.enabled;
    if (label) label.textContent = config.enabled ? "Alert: watching" : "Alert: off";
  }

  function updateConfig(nextConfig = {}, options = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) config.enabled = !!nextConfig.enabled;
    if (Object.prototype.hasOwnProperty.call(nextConfig, "beepIntervalMs")) config.beepIntervalMs = positiveInt(nextConfig.beepIntervalMs, config.beepIntervalMs || 1000);
    config.alertDurationMs = 10000;
    persistConfig();
    if (!options.silent) refreshUiValues();
    return { ...config };
  }

  function start(overrides = {}) {
    updateConfig(Object.assign({}, overrides, { enabled: true }), { silent: true });
    refreshUiValues();
    bot.captchaAlarm?.check?.();
    return true;
  }

  function stop(options = {}) {
    if (options.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }
    refreshUiValues();
    return true;
  }

  function status() {
    const captchaStatus = bot.captchaAlarm?.status?.() || null;
    return {
      running: !!config.enabled,
      config: { ...config },
      mode: config.enabled ? "watching" : "off",
      alertActive: !!captchaStatus?.active,
      remainingMs: 0,
      lastSeenText: captchaStatus?.visible ? "Anti-bot Verification" : "",
      lastSeenAt: captchaStatus?.lastTriggerAt || 0,
      lastBeepAt: 0,
      captchaVisibleNow: !!captchaStatus?.visible,
      captchaCandidateCount: captchaStatus?.visible ? 1 : 0,
      visibleRedTextNow: false,
      visibleRedCount: 0,
      baselineCaptchaCount: 0,
      baselineRedTextCount: 0,
      consoleRootCount: 0,
    };
  }

  function resetSeenMessages() {
    bot.captchaAlarm?.check?.();
  }

  function destroy() {
    document.getElementById("k9x-red-text-alert-section")?.remove();
    if (audioContext && audioContext.state !== "closed") audioContext.close?.().catch?.(() => {});
    audioContext = null;
  }

  bot.redTextAlert = { start, stop, status, updateConfig, beep, resetSeenMessages, destroy, config };
  bot.addCleanup(destroy);

  ensureUi();
  if (!document.getElementById("k9x-red-text-alert-section")) {
    const observer = new MutationObserver(() => {
      ensureUi();
      if (document.getElementById("k9x-red-text-alert-section")) observer.disconnect();
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    bot.addCleanup?.(() => observer.disconnect());
  }

  return bot.redTextAlert;
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaveModule = function installCaveModule(bot) {
  const configStorageKey = "minibiaBot.cave.config";
  const routeStorageKey = "minibiaBot.cave.route";
  const transitionStorageKey = "minibiaBot.cave.transitions";
  const presetStorageKey = "minibiaBot.cave.presets";
  const defaultPresetName = "Default";
  const minimapOverlayRootId = "minibia-bot-cave-minimap-overlay";
  const minimapOverlayStyleId = "minibia-bot-cave-minimap-overlay-style";
  const ladderItemIds = new Set([1948, 1968]);
  const ropeNamePattern = /\brope\b/i;
  const shovelNamePattern = /\bshovel\b/i;
  const shovelTargetNamePatterns = [
    /\bstone pile\b/i,
    /\bloose stone pile\b/i,
    /\bgravel pile\b/i,
    /\bdirt pile\b/i,
  ];
  const state = {
    running: false,
    timerId: null,
    observerTimerId: null,
    currentIndex: 0,
    direction: 1,
    lastPathAt: 0,
    lastPositionKey: null,
    lastProgressAt: 0,
    lastStairsUseAt: 0,
    lastObservedPosition: null,
    pendingTransitionSource: null,
    pausedForCombat: false,
    tickCount: 0,
  };
  const minimapOverlayState = {
    timerId: null,
  };

  const config = Object.assign(
    {
      tickMs: 200,
      repathMs: 1500,
      waypointTolerance: 1,
      enabled: false,
      activePresetName: defaultPresetName,
      pathfinderMode: 'game',
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 200;
  config.waypointTolerance = Math.max(1, Math.trunc(Number(config.waypointTolerance) || 0));

  function normalizePresetName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || null;
  }

  function cloneValue(value) {
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }

  function normalizePreset(value) {
    if (!value) {
      return null;
    }

    const name = normalizePresetName(value.name);
    if (!name) {
      return null;
    }

    return {
      name,
      route: normalizeRoute(value.route),
      transitions: normalizeTransitions(value.transitions),
    };
  }

  function normalizePresets(value) {
    const entries = Array.isArray(value) ? value : [];
    const deduped = new Map();

    entries.map(normalizePreset).filter(Boolean).forEach((preset) => {
      deduped.set(preset.name.toLowerCase(), preset);
    });

    return Array.from(deduped.values());
  }

  let route = normalizeRoute(bot.storage.get(routeStorageKey, []));
  let transitions = normalizeTransitions(bot.storage.get(transitionStorageKey, []));
  let presets = normalizePresets(bot.storage.get(presetStorageKey, []));

  if (!presets.length && (route.length || transitions.length)) {
    presets = [{
      name: defaultPresetName,
      route: route.map((waypoint) => cloneValue(waypoint)),
      transitions: transitions.map((transition) => cloneValue(transition)),
    }];
  }

  function getPresetNames() {
    return presets.map((preset) => preset.name);
  }

  function getPresetByName(name) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) {
      return null;
    }

    return presets.find((preset) => preset.name.toLowerCase() === normalizedName.toLowerCase()) || null;
  }

  function getActivePresetName() {
    const configuredName = normalizePresetName(config.activePresetName);
    if (configuredName && getPresetByName(configuredName)) {
      return getPresetByName(configuredName).name;
    }

    if (presets.length) {
      return presets[0].name;
    }

    return configuredName || defaultPresetName;
  }

  function persistPresets() {
    bot.storage.set(
      presetStorageKey,
      presets.map((preset) => ({
        name: preset.name,
        route: preset.route.map((waypoint) => ({ ...waypoint })),
        transitions: preset.transitions.map((transition) => cloneValue(transition)),
      }))
    );
  }

  function persistLegacyActivePreset() {
    bot.storage.set(routeStorageKey, route.map((waypoint) => ({ ...waypoint })));
    bot.storage.set(transitionStorageKey, transitions.map((transition) => cloneValue(transition)));
  }

  function setActivePresetName(name) {
    config.activePresetName = normalizePresetName(name) || defaultPresetName;
    persistConfig();
    return config.activePresetName;
  }

  function upsertPreset(name, nextRoute = route, nextTransitions = transitions) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) {
      return null;
    }

    const preset = {
      name: normalizedName,
      route: normalizeRoute(nextRoute).map((waypoint) => cloneValue(waypoint)),
      transitions: normalizeTransitions(nextTransitions).map((transition) => cloneValue(transition)),
    };
    const existingIndex = presets.findIndex((entry) => entry.name.toLowerCase() === normalizedName.toLowerCase());

    if (existingIndex >= 0) {
      presets[existingIndex] = preset;
    } else {
      presets.push(preset);
    }

    persistPresets();
    return preset;
  }

  function persistActivePreset() {
    upsertPreset(getActivePresetName(), route, transitions);
    persistLegacyActivePreset();
  }

  function loadPresetState(name) {
    const preset = getPresetByName(name);
    if (!preset) {
      return null;
    }

    route = normalizeRoute(preset.route);
    transitions = normalizeTransitions(preset.transitions);
    state.currentIndex = 0;
    state.direction = 1;
    state.pendingTransitionSource = null;
    setActivePresetName(preset.name);
    persistLegacyActivePreset();
    return preset;
  }

  const initialActivePreset = getActivePresetName();
  if (loadPresetState(initialActivePreset)) {
    config.activePresetName = initialActivePreset;
  } else {
    setActivePresetName(initialActivePreset);
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function persistRoute() {
    persistActivePreset();
  }

  function normalizePosition(value) {
    if (!value) {
      return null;
    }

    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return {
      x: Math.trunc(x),
      y: Math.trunc(y),
      z: Math.trunc(z),
    };
  }

  const PATHFINDER_CONFIG = {
    pathCacheTTL: 2000,
    matrixCacheTTL: 2000,
  };

  const pathCache = new Map();
  const matrixCache = new Map();

  function findBestIndex(openSet) {
    let bestIndex = 0;
    let bestF = openSet[0].f;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < bestF) {
        bestF = openSet[i].f;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function aStarPath(start, goal, getWalkable, getNeighbors, tolerance = 0) {
    const startZ = start.z;
    const openSet = [{ x: start.x, y: start.y, z: startZ, f: 0, g: 0, h: 0, parent: null }];
    const closedSet = new Set();
    const key = (p) => `${p.x},${p.y}`;

    while (openSet.length > 0) {
      const bestIndex = findBestIndex(openSet);
      const current = openSet[bestIndex];
      openSet[bestIndex] = openSet[openSet.length - 1];
      openSet.pop();
      const currentKey = key(current);

      if (Math.max(Math.abs(current.x - goal.x), Math.abs(current.y - goal.y)) <= tolerance) {
        const path = [];
        let node = current;
        while (node) {
          path.unshift({ x: node.x, y: node.y, z: node.z });
          node = node.parent;
        }
        return path;
      }

      closedSet.add(currentKey);

      for (const neighbor of getNeighbors(current)) {
        const nKey = key(neighbor);
        if (closedSet.has(nKey)) continue;
        if (!getWalkable(neighbor.x, neighbor.y)) continue;

        const g = current.g + 1;
        const h = Math.abs(neighbor.x - goal.x) + Math.abs(neighbor.y - goal.y);
        const f = g + h;
        const existing = openSet.find(n => n.x === neighbor.x && n.y === neighbor.y);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
          }
        } else {
          openSet.push({ x: neighbor.x, y: neighbor.y, z: startZ, f, g, h, parent: current });
        }
      }
    }
    return null;
  }

  function getAStarWalkabilityMatrix(position, z) {
    const cacheKey = `matrix_${z}`;
    const cached = matrixCache.get(cacheKey);
    if (cached && Date.now() - cached.at < PATHFINDER_CONFIG.matrixCacheTTL) {
      return cached.matrix;
    }

    const chunks = window.gameClient?.world?.chunks || [];
    const matrix = new Map();
    try {
      for (const chunk of chunks) {
        if (!chunk?.tiles) continue;
        for (const tile of chunk.tiles) {
          if (!tile?.__position || tile.__position.z !== z) continue;
          const key = `${tile.__position.x},${tile.__position.y}`;
          matrix.set(key, tile.isWalkable ? tile.isWalkable() : false);
        }
      }
    } catch (e) {
      return matrix;
    }

    matrixCache.set(cacheKey, { matrix, at: Date.now() });
    return matrix;
  }

  function getAStarNeighbors(current, matrix) {
    const dirs = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];
    return dirs.map(d => ({ x: current.x + d.x, y: current.y + d.y }))
      .filter(n => matrix.get(`${n.x},${n.y}`) === true);
  }

  function getCachedPath(from, to) {
    const key = `${from.x},${from.y},${from.z}-${to.x},${to.y},${to.z}`;
    const entry = pathCache.get(key);
    if (entry && Date.now() - entry.at < PATHFINDER_CONFIG.pathCacheTTL) return entry.path;
    return null;
  }

  function setCachedPath(from, to, path) {
    const key = `${from.x},${from.y},${from.z}-${to.x},${to.y},${to.z}`;
    pathCache.set(key, { path, at: Date.now() });
  }

  function findPathAStar(from, to) {
    from = normalizePosition(from);
    to = normalizePosition(to);
    if (!from || !to) return null;
    if (from.x === to.x && from.y === to.y && from.z === to.z) return [];
    if (from.z !== to.z) return null;

    const cached = getCachedPath(from, to);
    if (cached) return cached;

    const matrix = getAStarWalkabilityMatrix(from, from.z);
    const tolerance = Math.max(1, Number(config.waypointTolerance) || 0);
    const path = aStarPath(from, to,
      (x, y) => matrix.get(`${x},${y}`) === true,
      (node) => getAStarNeighbors(node, matrix),
      tolerance
    );

    if (path) setCachedPath(from, to, path);
    return path;
  }

  function cleanupPathCache() {
    const now = Date.now();
    for (const [key, entry] of pathCache) {
      if (now - entry.at >= PATHFINDER_CONFIG.pathCacheTTL) pathCache.delete(key);
    }
    for (const [key, entry] of matrixCache) {
      if (now - entry.at >= PATHFINDER_CONFIG.matrixCacheTTL) matrixCache.delete(key);
    }
  }

  const MAX_STUCK_COUNT = 3;
  const stuckCounts = new Map();

  function antiStuckFallback(tile) {
    const key = `${tile.x},${tile.y}`;
    const count = (stuckCounts.get(key) || 0) + 1;
    stuckCounts.set(key, count);
    if (count >= MAX_STUCK_COUNT) return { action: 'skip_waypoint' };
    return { action: 'repath' };
  }

  function resetStuckCounts(key) {
    if (key) stuckCounts.delete(key);
    else stuckCounts.clear();
  }

  const chaseState = { targetId: null, startedAt: 0, lastDistance: Infinity, stallCount: 0 };
  const CHASE_TIMEOUT_MS = 15000;
  const CHASE_MAX_STALL = 5;
  const CHASE_MAX_DISTANCE = 8;

  function findAdjacentWalkablePositionForCave(targetPosition, playerPosition) {
    if (!targetPosition || !playerPosition) return null;
    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];
    offsets.sort((a, b) => {
      const da = Math.abs(targetPosition.x + a.x - playerPosition.x) + Math.abs(targetPosition.y + a.y - playerPosition.y);
      const db = Math.abs(targetPosition.x + b.x - playerPosition.x) + Math.abs(targetPosition.y + b.y - playerPosition.y);
      return da - db;
    });
    for (const offset of offsets) {
      const position = new Position(targetPosition.x + offset.x, targetPosition.y + offset.y, targetPosition.z);
      const tile = window.gameClient?.world?.getTileFromWorldPosition?.(position);
      if (tile?.isWalkable?.()) return normalizePosition(position);
    }
    return null;
  }

  function chaseTarget(target) {
    if (!target) return false;
    const now = Date.now();
    const playerPos = normalizePosition(bot.getPlayerPosition());
    const targetPos = normalizePosition(target.getPosition?.() || target.__position);
    if (!playerPos || !targetPos || playerPos.z !== targetPos.z) return false;
    if (!isOnScreen(targetPos, playerPos)) return giveUpChase(target, 'offscreen');
    const distance = Math.abs(playerPos.x - targetPos.x) + Math.abs(playerPos.y - targetPos.y);
    if (distance > CHASE_MAX_DISTANCE) return giveUpChase(target, 'too far');
    if (chaseState.targetId !== target.id) {
      chaseState.targetId = target.id;
      chaseState.startedAt = now;
      chaseState.lastDistance = distance;
      chaseState.stallCount = 0;
    }
    if (now - chaseState.startedAt > CHASE_TIMEOUT_MS) return giveUpChase(target, 'timeout');
    if (distance >= chaseState.lastDistance) {
      chaseState.stallCount++;
      if (chaseState.stallCount > CHASE_MAX_STALL) return giveUpChase(target, 'stalled');
    } else chaseState.stallCount = 0;
    chaseState.lastDistance = distance;
    const adjacent = findAdjacentWalkablePositionForCave(targetPos, playerPos);
    if (!adjacent) return giveUpChase(target, 'no walkable adjacent');
    const to = new Position(adjacent.x, adjacent.y, playerPos.z);
    try {
      window.gameClient?.world?.pathfinder?.findPath?.(playerPos, to);
      return true;
    } catch (e) {
      return giveUpChase(target, 'pathfind error');
    }
  }

  function giveUpChase(target, reason) {
    chaseState.targetId = null;
    bot.log("cave gave up chase", { targetId: target?.id, reason });
    return false;
  }

  const VIEWPORT_DX = 8;
  const VIEWPORT_DY = 6;

  function isOnScreen(pos, playerPos) {
    if (!pos || !playerPos) return false;
    return Math.abs(pos.x - playerPos.x) <= VIEWPORT_DX &&
      Math.abs(pos.y - playerPos.y) <= VIEWPORT_DY &&
      pos.z === playerPos.z;
  }

  function filterPathToViewport(path, playerPos) {
    if (!path || !path.length) return path;
    const onScreen = path.filter(p => isOnScreen(p, playerPos));
    if (onScreen.length > 0) return onScreen;
    const extended = path.filter(p =>
      Math.abs(p.x - playerPos.x) <= VIEWPORT_DX * 2 &&
      Math.abs(p.y - playerPos.y) <= VIEWPORT_DY * 2 &&
      p.z === playerPos.z
    );
    if (extended.length > 0) return [extended[0]];
    return path.slice(0, 1);
  }

  function normalizeWaypoint(waypoint) { return normalizePosition(waypoint); }
  function normalizeRoute(value) {
    if (!Array.isArray(value)) return [];
    return value.map(normalizeWaypoint).filter(Boolean);
  }
  function normalizeTransition(transition) {
    if (!transition) return null;
    const from = normalizePosition(transition.from || transition);
    const to = normalizePosition(transition.to || { x: transition.targetX, y: transition.targetY, z: transition.targetZ });
    if (!from || !to || from.z === to.z) return null;
    const count = Math.max(1, Math.trunc(Number(transition.count) || 1));
    const lastSeenAt = Math.max(0, Math.trunc(Number(transition.lastSeenAt) || Date.now()));
    return { from, to, count, lastSeenAt };
  }
  function normalizeTransitions(value) {
    if (!Array.isArray(value)) return [];
    const deduped = new Map();
    value.map(normalizeTransition).filter(Boolean).forEach((transition) => deduped.set(getPositionKey(transition.from), transition));
    return Array.from(deduped.values());
  }
  function getRoute() { return route.map((waypoint) => cloneValue(waypoint)); }
  function getTransitions() { return transitions.map((transition) => cloneValue(transition)); }
  function persistTransitions() { persistActivePreset(); }

  function savePreset(name, options = {}) {
    const preset = upsertPreset(name, route, transitions);
    if (!preset) { bot.log("cave preset name is required"); return null; }
    if (options.activate !== false) {
      setActivePresetName(preset.name);
      persistLegacyActivePreset();
    }
    bot.log("cave preset saved", { name: preset.name, waypoints: preset.route.length, transitions: preset.transitions.length });
    return { name: preset.name, route: preset.route.map((waypoint) => cloneValue(waypoint)), transitions: preset.transitions.map((transition) => cloneValue(transition)) };
  }

  function createPreset(name) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) { bot.log("cave preset name is required"); return null; }
    if (getPresetByName(normalizedName)) { bot.log("cave preset already exists", { name: normalizedName }); return null; }
    if (state.running) stop();
    const preset = upsertPreset(normalizedName, [], []);
    if (!preset) return null;
    loadPresetState(preset.name);
    bot.log("cave preset created", { name: preset.name });
    return { name: preset.name, route: [], transitions: [] };
  }

  function loadPreset(name) {
    const preset = getPresetByName(name);
    if (!preset) { bot.log("cave preset not found", { name }); return null; }
    if (state.running) stop();
    loadPresetState(preset.name);
    bot.log("cave preset loaded", { name: preset.name, waypoints: route.length, transitions: transitions.length });
    return { name: preset.name, route: getRoute(), transitions: getTransitions() };
  }

  function deletePreset(name) {
    const preset = getPresetByName(name);
    if (!preset) { bot.log("cave preset not found", { name }); return false; }
    presets = presets.filter((entry) => entry.name.toLowerCase() !== preset.name.toLowerCase());
    persistPresets();
    if (preset.name.toLowerCase() === getActivePresetName().toLowerCase()) {
      const fallbackPreset = presets[0] || null;
      if (state.running) stop();
      if (fallbackPreset) loadPresetState(fallbackPreset.name);
      else {
        route = [];
        transitions = [];
        state.currentIndex = 0;
        state.direction = 1;
        state.pendingTransitionSource = null;
        setActivePresetName(defaultPresetName);
        persistLegacyActivePreset();
      }
    }
    bot.log("cave preset deleted", { name: preset.name });
    return true;
  }

  function getCurrentWaypoint() {
    if (!route.length) return null;
    if (state.currentIndex < 0 || state.currentIndex >= route.length) state.currentIndex = 0;
    return route[state.currentIndex] || null;
  }
  function getPositionKey(position) { return position ? `${position.x},${position.y},${position.z}` : null; }
  function getDistance(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) return Number.POSITIVE_INFINITY;
    return Math.abs(Number(from.x) - Number(to.x)) + Math.abs(Number(from.y) - Number(to.y));
  }
  function isBesideOrSameTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) return false;
    return Math.abs(Number(from.x) - Number(to.x)) <= 1 && Math.abs(Number(from.y) - Number(to.y)) <= 1;
  }
  function isAdjacentTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) return false;
    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));
    return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
  }
  function getDistanceToWaypoint(position, waypoint) {
    if (!position || !waypoint) return null;
    return getDistance(position, waypoint);
  }
  function isSameTile(a, b) {
    if (!a || !b) return false;
    return Number(a.x) === Number(b.x) && Number(a.y) === Number(b.y) && Number(a.z) === Number(b.z);
  }
  function findClosestWaypointIndex(position) {
    if (!position || !route.length) return 0;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    route.forEach((waypoint, index) => {
      const distance = getDistanceToWaypoint(position, waypoint);
      if (!Number.isFinite(distance)) return;
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    });
    return bestIndex;
  }

  function getTileAt(position) {
    if (!position) return null;
    return window.gameClient?.world?.getTileFromWorldPosition?.(new Position(position.x, position.y, position.z)) || null;
  }
  function getTilePosition(tile) { return normalizePosition(tile?.__position); }
  function getThingDefinition(itemId) {
    if (!itemId) return null;
    return window.gameClient?.itemDefinitionsByCid?.[itemId] || window.gameClient?.itemDefinitionsBySid?.[itemId] || window.gameClient?.itemDefinitions?.[itemId] || null;
  }
  function getThingName(thing) {
    const definition = getThingDefinition(thing?.id);
    return String(definition?.properties?.name || thing?.name || "").trim().toLowerCase();
  }
  function isLadderThing(thing) {
    if (!thing?.id) return false;
    if (ladderItemIds.has(Number(thing.id))) return true;
    return getThingName(thing).includes("ladder");
  }
  function isFloorChangeThing(thing) {
    const definition = getThingDefinition(thing?.id);
    return !!definition?.properties?.floorchange || isLadderThing(thing);
  }
  function isFloorChangeTile(tile) {
    const tilePosition = getTilePosition(tile);
    if (!tilePosition) return false;
    if (isFloorChangeThing(tile)) return true;
    return Array.isArray(tile.items) && tile.items.some((item) => isFloorChangeThing(item));
  }
  function getTileThings(tile) {
    if (!tile) return [];
    const things = [];
    if (tile.id) things.push(tile);
    if (Array.isArray(tile.items)) tile.items.forEach((item) => { if (item) things.push(item); });
    return things;
  }
  function tileHasNamedThing(tile, needle) {
    const value = String(needle || "").trim().toLowerCase();
    if (!value) return false;
    return getTileThings(tile).some((thing) => getThingName(thing).includes(value));
  }
  function isLadderTile(tile) { return getTileThings(tile).some((thing) => isLadderThing(thing)); }
  function isStairsTile(tile) { return tileHasNamedThing(tile, "stairs"); }
  function isHoleTile(tile) { return tileHasNamedThing(tile, "hole"); }
  function isRopeSpotTile(tile) { return tileHasNamedThing(tile, "rope spot"); }
  function isRopeTargetTile(tile) { return isHoleTile(tile) || isRopeSpotTile(tile); }
  function isShovelTargetThing(thing) {
    const name = getThingName(thing);
    if (!name) return false;
    return shovelTargetNamePatterns.some((pattern) => pattern.test(name));
  }
  function isShovelTargetTile(tile) { return getTileThings(tile).some((thing) => isShovelTargetThing(thing)); }

  function isTransitionCandidateTile(tile, waypoint, position) {
    if (!tile) return false;
    if (isFloorChangeTile(tile)) return true;
    const hasWaypointDelta = waypoint && position && Number.isFinite(waypoint.z) && Number.isFinite(position.z);
    if (!hasWaypointDelta) return false;
    if (waypoint.z > position.z) return isShovelTargetTile(tile);
    if (waypoint.z < position.z) return isRopeTargetTile(tile);
    return false;
  }
  function getFloorChangeTileBias(tile, position, waypoint) {
    if (!tile || !position || !waypoint || position.z === waypoint.z) return 0;
    const goingDown = waypoint.z > position.z;
    const goingUp = waypoint.z < position.z;
    if (goingDown) {
      if (isLadderTile(tile)) return -30;
      if (isHoleTile(tile)) return -20;
      if (isStairsTile(tile)) return 25;
    }
    if (goingUp) {
      if (isStairsTile(tile)) return -20;
      if (isHoleTile(tile)) return 20;
    }
    return 0;
  }
  function getLoadedTiles() {
    const chunks = window.gameClient?.world?.chunks || [];
    const tiles = [];
    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) if (tile?.__position) tiles.push(tile);
    }
    return tiles;
  }

  function ensureMinimapOverlayStyle() {
    if (document.getElementById(minimapOverlayStyleId)) return;
    const style = document.createElement("style");
    style.id = minimapOverlayStyleId;
    style.textContent = `#${minimapOverlayRootId}{position:fixed;inset:0;pointer-events:none;z-index:999997}#${minimapOverlayRootId} canvas{position:fixed;pointer-events:none}`;
    document.head.appendChild(style);
  }
  function ensureMinimapOverlayRoot() {
    let root = document.getElementById(minimapOverlayRootId);
    if (root) return root;
    root = document.createElement("div");
    root.id = minimapOverlayRootId;
    root.innerHTML = '<canvas></canvas>';
    document.body.appendChild(root);
    return root;
  }
  function destroyMinimapOverlayElements() {
    document.getElementById(minimapOverlayRootId)?.remove();
    document.getElementById(minimapOverlayStyleId)?.remove();
  }
  function getMinimapCanvas() { return window.gameClient?.renderer?.minimap?.minimap?.canvas || document.getElementById("minimap") || null; }
  function getMinimapViewport() {
    const canvas = getMinimapCanvas();
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { canvas, rect };
  }
  function getWaypointCanvasPoint(waypoint, viewport, playerPosition, minimap) {
    if (!waypoint || !viewport || !playerPosition || !minimap) return null;
    if (waypoint.z !== minimap.__renderLayer) return null;
    const zoomScale = 1 << (Number(minimap.__zoomLevel) || 0);
    const center = minimap.center || { x: 0, y: 0 };
    const internalWidth = Number(viewport.canvas.width) || 160;
    const internalHeight = Number(viewport.canvas.height) || 160;
    const internalX = (internalWidth / 2) + (waypoint.x - playerPosition.x - Number(center.x || 0)) * zoomScale;
    const internalY = (internalHeight / 2) + (waypoint.y - playerPosition.y - Number(center.y || 0)) * zoomScale;
    return { x: internalX * (viewport.rect.width / internalWidth), y: internalY * (viewport.rect.height / internalHeight) };
  }
  function renderMinimapOverlay() {
    const viewport = getMinimapViewport();
    const minimap = window.gameClient?.renderer?.minimap;
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const root = ensureMinimapOverlayRoot();
    const canvas = root.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (!viewport || !minimap || !playerPosition || !route.length) { canvas.width = 0; canvas.height = 0; return; }
    const rect = viewport.rect;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
    canvas.style.left = `${Math.round(rect.left)}px`;
    canvas.style.top = `${Math.round(rect.top)}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const visibleWaypoints = route.map((waypoint, index) => ({ waypoint, index, point: getWaypointCanvasPoint(waypoint, viewport, playerPosition, minimap) })).filter((entry) => entry.point);
    if (!visibleWaypoints.length) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    for (let index = 1; index < visibleWaypoints.length; index += 1) {
      const previous = visibleWaypoints[index - 1];
      const current = visibleWaypoints[index];
      if (current.index !== previous.index + 1) continue;
      context.strokeStyle = "rgba(92, 228, 196, 0.7)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(previous.point.x, previous.point.y);
      context.lineTo(current.point.x, current.point.y);
      context.stroke();
    }
    visibleWaypoints.forEach(({ point, index }) => {
      const isCurrent = state.running && index === state.currentIndex;
      const radius = isCurrent ? 7 : 5;
      context.fillStyle = isCurrent ? "#ffcf5a" : "#2bd1c4";
      context.strokeStyle = isCurrent ? "#6a2400" : "#083f49";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = "#ffffff";
      context.font = "bold 11px Verdana, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(index + 1), point.x, point.y);
    });
    context.restore();
  }
  function startMinimapOverlay() {
    if (minimapOverlayState.timerId != null) return;
    ensureMinimapOverlayStyle();
    renderMinimapOverlay();
    minimapOverlayState.timerId = window.setInterval(renderMinimapOverlay, 250);
  }
  function stopMinimapOverlay() {
    if (minimapOverlayState.timerId != null) {
      window.clearInterval(minimapOverlayState.timerId);
      minimapOverlayState.timerId = null;
    }
    destroyMinimapOverlayElements();
  }

  function getNearbyTransitionTiles(position, waypoint, radius = 8) {
    if (!position) return [];
    return getLoadedTiles().map((tile) => ({ tile, position: getTilePosition(tile) })).filter((entry) =>
      entry.position && entry.position.z === position.z && Math.abs(entry.position.x - position.x) <= radius && Math.abs(entry.position.y - position.y) <= radius && isTransitionCandidateTile(entry.tile, waypoint, position)
    );
  }
  function findTransitionTileNearPosition(position, waypoint, radius = 1) {
    if (!position) return null;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    getNearbyTransitionTiles(position, waypoint, radius).forEach((entry) => {
      const distance = getDistance(position, entry.position);
      if (!Number.isFinite(distance)) return;
      if (distance < bestDistance) { bestDistance = distance; best = entry; }
    });
    return best;
  }
  function findBestKnownTransition(position, waypoint) {
    if (!position || !waypoint) return null;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    transitions.forEach((transition) => {
      if (transition.from.z !== position.z || transition.to.z !== waypoint.z) return;
      const playerDistance = getDistance(position, transition.from);
      const landingDistance = getDistance(transition.to, waypoint);
      if (!Number.isFinite(playerDistance) || !Number.isFinite(landingDistance)) return;
      const score = playerDistance * 10 + landingDistance;
      if (score < bestScore) { bestScore = score; best = transition; }
    });
    return best;
  }
  function findNearbyTransitionTile(position, waypoint) {
    if (!position || !waypoint) return null;
    const waypointDistance = Math.abs(position.x - waypoint.x) + Math.abs(position.y - waypoint.y);
    const radius = Math.max(4, Math.min(20, waypointDistance + 2));
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    getNearbyTransitionTiles(position, waypoint, radius).forEach((entry) => {
      const playerDistance = getDistance(position, entry.position);
      const tileToWaypointDistance = Math.abs(entry.position.x - waypoint.x) + Math.abs(entry.position.y - waypoint.y);
      const score = playerDistance * 10 + tileToWaypointDistance + getFloorChangeTileBias(entry.tile, position, waypoint);
      if (score < bestScore) {
        bestScore = score;
        best = { tile: entry.tile, position: entry.position, playerDistance, waypointDistance: tileToWaypointDistance };
      }
    });
    return best;
  }

  function isAtWaypoint(position, waypoint) {
    if (!position || !waypoint || Number(position.z) !== Number(waypoint.z)) return false;
    const tolerance = Math.max(1, Math.trunc(Number(config.waypointTolerance) || 0));
    const dx = Math.abs(Number(position.x) - Number(waypoint.x));
    const dy = Math.abs(Number(position.y) - Number(waypoint.y));
    return dx <= tolerance && dy <= tolerance;
  }

  function goToWaypoint(waypoint) {
    const from = bot.getPlayerPosition();
    if (!from || !waypoint) return false;
    const now = Date.now();
    if (config.pathfinderMode === 'astar') {
      const fromPos = normalizePosition(from);
      const waypointPos = normalizePosition(waypoint);
      const path = findPathAStar(fromPos, waypointPos);
      if (path && path.length > 0) {
        const playerPos = fromPos;
        const waypointOnScreen = waypointPos && isOnScreen(waypointPos, playerPos);
        let targetTile = null;
        if (waypointOnScreen) targetTile = waypointPos;
        else {
          const visiblePath = filterPathToViewport(path, playerPos);
          if (visiblePath && visiblePath.length > 1) targetTile = visiblePath[visiblePath.length - 1];
          else if (visiblePath && visiblePath.length === 1) targetTile = visiblePath[0];
          else targetTile = path[Math.min(VIEWPORT_DX, path.length - 1)];
        }
        if (targetTile && !(targetTile.x === playerPos.x && targetTile.y === playerPos.y)) {
          const to = new Position(targetTile.x, targetTile.y, playerPos.z);
          try {
            window.gameClient?.world?.pathfinder?.findPath?.(from, to);
            state.lastPathAt = now;
            bot.log("cave A* pathing to waypoint", { ...waypoint, index: state.currentIndex + 1, total: route.length, targetTile, pathLength: path.length, waypointOnScreen });
            return true;
          } catch (error) {
            bot.log("cave A* pathing failed to target tile, falling back", { targetTile, error: error?.message || error });
          }
        }
      } else bot.log("cave A* pathfinding failed, falling back to game pathfinder", { ...waypoint, index: state.currentIndex + 1 });
    }
    const to = new Position(waypoint.x, waypoint.y, waypoint.z);
    try {
      window.gameClient?.world?.pathfinder?.findPath?.(from, to);
      state.lastPathAt = now;
      bot.log("cave pathing to waypoint", { ...waypoint, index: state.currentIndex + 1, total: route.length });
      return true;
    } catch (error) {
      bot.log("cave pathing failed", { ...waypoint, error: error?.message || error });
      return false;
    }
  }

  function goToPosition(position) { if (!position) return false; return goToWaypoint(position); }
  function markPendingTransitionSource(source) {
    const normalized = normalizePosition(source);
    if (!normalized) return;
    state.pendingTransitionSource = { ...normalized, at: Date.now() };
  }
  function upsertTransition(from, to) {
    const normalizedFrom = normalizePosition(from);
    const normalizedTo = normalizePosition(to);
    if (!normalizedFrom || !normalizedTo || normalizedFrom.z === normalizedTo.z) return null;
    const key = getPositionKey(normalizedFrom);
    const index = transitions.findIndex((transition) => getPositionKey(transition.from) === key);
    const next = { from: normalizedFrom, to: normalizedTo, count: index >= 0 ? transitions[index].count + 1 : 1, lastSeenAt: Date.now() };
    if (index >= 0) transitions[index] = next;
    else transitions.push(next);
    persistTransitions();
    bot.log("cave learned floor transition", next);
    return cloneValue(next);
  }
  function resolveObservedTransitionSource(previousPosition) {
    const pending = normalizePosition(state.pendingTransitionSource);
    if (pending && pending.z === previousPosition.z) return pending;
    const currentTile = getTileAt(previousPosition);
    if (currentTile && isFloorChangeTile(currentTile)) return previousPosition;
    const nearby = findTransitionTileNearPosition(previousPosition, null, 1);
    if (nearby?.position) return nearby.position;
    return null;
  }
  function observePosition() {
    const current = normalizePosition(bot.getPlayerPosition());
    if (!current) return;
    const previous = state.lastObservedPosition;
    if (previous && !isSameTile(previous, current) && previous.z !== current.z) {
      const source = resolveObservedTransitionSource(previous);
      if (source) upsertTransition(source, current);
      state.pendingTransitionSource = null;
    }
    state.lastObservedPosition = current;
  }

  function getEquipment() { return window.gameClient?.player?.equipment || null; }
  function getOpenContainers() { return Array.from(window.gameClient?.player?.__openedContainers || []); }
  function findAdjacentWalkablePosition(targetPosition, playerPosition) {
    if (!targetPosition || !playerPosition) return null;
    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];
    offsets.sort((a, b) => {
      const da = Math.abs(targetPosition.x + a.x - playerPosition.x) + Math.abs(targetPosition.y + a.y - playerPosition.y);
      const db = Math.abs(targetPosition.x + b.x - playerPosition.x) + Math.abs(targetPosition.y + b.y - playerPosition.y);
      return da - db;
    });
    for (const offset of offsets) {
      const position = new Position(targetPosition.x + offset.x, targetPosition.y + offset.y, targetPosition.z);
      const tile = window.gameClient?.world?.getTileFromWorldPosition?.(position);
      if (tile?.isWalkable?.()) return normalizePosition(position);
    }
    return null;
  }
  function isRopeItem(item) { const name = getThingName(item); return !!name && ropeNamePattern.test(name); }
  function isShovelItem(item) { const name = getThingName(item); return !!name && shovelNamePattern.test(name); }
  function findToolSource(predicate) {
    const equipment = getEquipment();
    if (equipment?.slots) {
      for (let slotIndex = 0; slotIndex < equipment.slots.length; slotIndex += 1) {
        const item = equipment.getSlotItem?.(slotIndex);
        if (predicate(item)) return { which: equipment, index: slotIndex, item, location: "equipment" };
      }
    }
    for (const container of getOpenContainers()) {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const item = container.getSlotItem?.(slotIndex);
        if (predicate(item)) return { which: container, index: slotIndex, item, location: "container" };
      }
    }
    return null;
  }
  function findRopeSource() { return findToolSource(isRopeItem); }
  function findShovelSource() { return findToolSource(isShovelItem); }
  function useToolOnTile(tool, targetTile, targetPosition, actionLabel, now = Date.now()) {
    if (!tool || !targetTile || !targetPosition) return false;
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    if (!playerPosition) return false;
    if (!isAdjacentTile(playerPosition, targetPosition)) {
      const adjacentPosition = findAdjacentWalkablePosition(targetPosition, playerPosition);
      if (adjacentPosition) return goToPosition(adjacentPosition);
    }
    window.gameClient?.mouse?.__handleItemUseWith?.({ which: tool.which, index: tool.index }, { which: targetTile, index: 0xFF });
    state.lastStairsUseAt = now;
    state.lastPathAt = now;
    markPendingTransitionSource(targetPosition);
    bot.log(actionLabel, { source: targetPosition, toolLocation: tool.location, toolSlot: tool.index, toolName: getThingName(tool.item) });
    return true;
  }
  function useRopeOnTile(targetTile, targetPosition, now = Date.now()) { return useToolOnTile(findRopeSource(), targetTile, targetPosition, "cave roped transition tile", now); }
  function useShovelOnTile(targetTile, targetPosition, now = Date.now()) { return useToolOnTile(findShovelSource(), targetTile, targetPosition, "cave shoveled transition tile", now); }
  function useFloorChangeTile(target, waypoint, now = Date.now()) {
    const position = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target?.position);
    const targetTile = target?.tile || (targetPosition ? getTileAt(targetPosition) : null);
    if (!position || !targetPosition || !targetTile) return false;
    if (now - state.lastStairsUseAt < 1200) return true;
    if (waypoint?.z < position.z && isRopeTargetTile(targetTile)) return useRopeOnTile(targetTile, targetPosition, now);
    if (!isFloorChangeTile(targetTile)) {
      if (waypoint?.z > position.z && isShovelTargetTile(targetTile)) return useShovelOnTile(targetTile, targetPosition, now);
      return false;
    }
    if (isLadderTile(targetTile)) {
      window.gameClient?.mouse?.use?.({ which: targetTile, index: 0xFF });
      state.lastStairsUseAt = now;
      state.lastPathAt = now;
      markPendingTransitionSource(targetPosition);
      bot.log("cave used ladder tile", { source: targetPosition, targetZ: waypoint?.z ?? null });
      return true;
    }
    if (!isSameTile(position, targetPosition)) return goToPosition(targetPosition);
    const currentTile = getTileAt(position);
    if (!currentTile || !isFloorChangeTile(currentTile)) return false;
    window.gameClient?.mouse?.use?.({ which: currentTile, index: 0xFF });
    state.lastStairsUseAt = now;
    state.lastPathAt = now;
    markPendingTransitionSource(position);
    bot.log("cave used floor-change tile", { source: position, targetZ: waypoint?.z ?? null });
    return true;
  }
  function handleFloorChange(waypoint, now = Date.now()) {
    const position = normalizePosition(bot.getPlayerPosition());
    if (!position || !waypoint || position.z === waypoint.z) return false;
    const visibleCandidate = findNearbyTransitionTile(position, waypoint);
    if (visibleCandidate) {
      const moved = useFloorChangeTile(visibleCandidate, waypoint, now);
      if (moved) {
        bot.log("cave probing visible floor-change tile", { tileX: visibleCandidate.position.x, tileY: visibleCandidate.position.y, tileZ: visibleCandidate.position.z, targetZ: waypoint.z });
        return true;
      }
    }
    const knownTransition = findBestKnownTransition(position, waypoint);
    if (knownTransition) {
      const target = { tile: getTileAt(knownTransition.from), position: knownTransition.from };
      const moved = useFloorChangeTile(target, waypoint, now);
      if (moved) {
        bot.log("cave using learned floor transition", { from: knownTransition.from, to: knownTransition.to, waypoint });
        return true;
      }
      bot.log("cave learned transition unavailable, falling back to live scan", { from: knownTransition.from, to: knownTransition.to, waypoint });
    }
    return false;
  }

  function advanceWaypoint() {
    if (!route.length) return null;
    if (route.length === 1) return route[0];
    let nextIndex = state.currentIndex + state.direction;
    if (nextIndex >= route.length) { state.direction = -1; nextIndex = route.length - 2; }
    else if (nextIndex < 0) { state.direction = 1; nextIndex = 1; }
    state.currentIndex = Math.max(0, Math.min(route.length - 1, nextIndex));
    const nextWaypoint = getCurrentWaypoint();
    bot.log("cave advanced waypoint", { index: state.currentIndex + 1, total: route.length, direction: state.direction, waypoint: nextWaypoint });
    return nextWaypoint;
  }
  function scheduleNextTick() {
    if (!state.running) return;
    state.timerId = window.setTimeout(() => tick(), config.tickMs);
  }
  function tick() {
    if (!state.running) return;
    try {
      observePosition();
      cleanupPathCache();
      if (!route.length) { stop(); return; }
      const position = normalizePosition(bot.getPlayerPosition());
      const positionKey = getPositionKey(position);
      const now = Date.now();
      const attackStatus = bot.attack?.status?.() || null;
      state.tickCount += 1;
      if (state.tickCount % 5 === 0) {
        const waypoint = getCurrentWaypoint();
        const dist = waypoint && position ? getDistanceToWaypoint(position, waypoint) : null;
        bot.logDebug("cave tick summary", { pos: position, waypointIndex: state.currentIndex + 1, waypointTotal: route.length, distance: Number.isFinite(dist) ? dist : null, direction: state.direction, pausedForCombat: state.pausedForCombat, combatDurationMs: Number(attackStatus?.combatDurationMs || 0), combatTargetCount: Number(attackStatus?.targetCount || 0), pathfinderMode: config.pathfinderMode, stuckForMs: state.lastProgressAt ? now - state.lastProgressAt : 0 });
      }
      const shouldPauseForCombat = !!attackStatus?.combatActive && Number(attackStatus?.combatDurationMs || 0) < 60000;
      if (shouldPauseForCombat) {
        if (!state.pausedForCombat) {
          try {
            window.gameClient?.world?.pathfinder?.setPathfindCache?.(null);
          } catch (error) {
            bot.logDebug("cave failed to stop waypoint movement for combat", { error: error?.message || error });
          }
          state.pausedForCombat = true;
          resetStuckCounts();
          bot.log("cave paused for auto attack", { combatDurationMs: Number(attackStatus?.combatDurationMs || 0), targetCount: Number(attackStatus?.targetCount || 0) });
        }
        if (config.pathfinderMode === 'astar') {
          const target = bot.attack?.getCurrentTarget?.() || null;
          if (target) {
            const chaseResult = chaseTarget(target);
            bot.logDebug("cave combat chase", { chasing: chaseResult, targetId: target.id, targetName: target.name || "Mob", targetPos: normalizePosition(target.getPosition?.() || target.__position) });
          } else bot.logDebug("cave combat no target to chase");
        }
        return;
      }
      if (state.pausedForCombat) {
        state.pausedForCombat = false;
        resetStuckCounts();
        bot.log("cave resumed after auto attack", { combatDurationMs: Number(attackStatus?.combatDurationMs || 0), targetCount: Number(attackStatus?.targetCount || 0) });
      }
      if (positionKey && positionKey !== state.lastPositionKey) {
        state.lastPositionKey = positionKey;
        state.lastProgressAt = now;
        resetStuckCounts();
      }
      let waypoint = getCurrentWaypoint();
      if (!waypoint) { stop(); return; }
      if (isAtWaypoint(position, waypoint)) {
        const dist = getDistanceToWaypoint(position, waypoint);
        bot.logDebug("cave reached waypoint", { index: state.currentIndex + 1, waypoint, distance: Number.isFinite(dist) ? dist : null });
        waypoint = advanceWaypoint();
      }
      if (!waypoint) { bot.logDebug("cave no waypoint after advance, stopping"); return; }
      if (position && waypoint.z !== position.z) {
        bot.logDebug("cave floor change needed", { fromZ: position.z, toZ: waypoint.z, waypointIndex: state.currentIndex + 1, waypoint });
        handleFloorChange(waypoint, now);
        return;
      }
      const timeSinceProgress = now - (state.lastProgressAt || now);
      const isStuck = timeSinceProgress >= 5000 && state.lastPositionKey === positionKey && positionKey != null;
      if (isStuck && config.pathfinderMode === 'astar') {
        const fallback = antiStuckFallback(waypoint);
        bot.log("cave anti-stuck triggered", { action: fallback.action, waypoint, stuckForMs: timeSinceProgress, attempt: (stuckCounts.get(`${waypoint.x},${waypoint.y}`) || 0) });
        if (fallback.action === 'skip_waypoint') {
          resetStuckCounts(`${waypoint.x},${waypoint.y}`);
          const skipped = getCurrentWaypoint();
          bot.logDebug("cave skipping stuck waypoint", { skippedWaypoint: waypoint, nextWaypoint: skipped, stuckForMs: timeSinceProgress });
          advanceWaypoint();
          return;
        }
        if (fallback.action === 'repath') resetStuckCounts(`${waypoint.x},${waypoint.y}`);
      }
      const shouldRepath = now - state.lastPathAt >= config.repathMs || !state.lastProgressAt || now - state.lastProgressAt >= config.repathMs;
      if (shouldRepath) {
        const dist = getDistanceToWaypoint(position, waypoint);
        bot.logDebug("cave pathing to waypoint", { index: state.currentIndex + 1, from: position, to: waypoint, distance: Number.isFinite(dist) ? dist : null, timeSinceLastPath: now - state.lastPathAt });
        goToWaypoint(waypoint);
      } else bot.logDebug("cave waiting for path", { timeSinceLastPath: now - state.lastPathAt, repathThreshold: config.repathMs });
    } catch (error) {
      const snapshot = { position: normalizePosition(bot.getPlayerPosition()), currentIndex: state.currentIndex, direction: state.direction, waypoint: getCurrentWaypoint(), routeLength: route.length, pausedForCombat: state.pausedForCombat, combatDurationMs: Number(bot.attack?.status?.()?.combatDurationMs || 0), pathfinderMode: config.pathfinderMode, error: error?.message || error };
      bot.log("cave tick failed", snapshot);
    } finally {
      scheduleNextTick();
    }
  }

  function startObserver() {
    if (state.observerTimerId != null) return;
    state.observerTimerId = window.setInterval(() => {
      try { observePosition(); } catch (error) { bot.log("cave observer failed", error?.message || error); }
    }, 200);
  }
  function stopObserver() {
    if (state.observerTimerId == null) return;
    window.clearInterval(state.observerTimerId);
    state.observerTimerId = null;
  }
  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 200;
    config.waypointTolerance = Math.max(1, Math.trunc(Number(config.waypointTolerance) || 0));
    persistConfig();
    if (!route.length) { bot.log("cave bot cannot start without waypoints"); return false; }
    if (state.running) { bot.log("cave bot already running"); return false; }
    const position = normalizePosition(bot.getPlayerPosition());
    state.running = true;
    state.currentIndex = findClosestWaypointIndex(position);
    state.direction = state.currentIndex >= route.length - 1 ? -1 : 1;
    if (route.length <= 1) state.direction = 1;
    state.lastPathAt = 0;
    state.lastPositionKey = getPositionKey(position);
    state.lastProgressAt = Date.now();
    state.pausedForCombat = false;
    bot.log("cave bot started", { waypoints: route.length, currentIndex: state.currentIndex + 1, direction: state.direction, waypoint: getCurrentWaypoint() });
    tick();
    return true;
  }
  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;
    if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; }
    if (shouldPersistEnabled) { config.enabled = false; persistConfig(); }
    state.pausedForCombat = false;
    bot.log("cave bot stopped");
    return true;
  }
  function addWaypoint(waypoint) {
    const normalized = normalizeWaypoint(waypoint);
    if (!normalized) return null;
    route.push(normalized);
    persistRoute();
    bot.log("cave waypoint added", { ...normalized, total: route.length });
    return cloneValue(normalized);
  }
  function addWaypointCurrentSpot() {
    const position = normalizePosition(bot.getPlayerPosition());
    if (!position) { bot.log("could not read current position for cave waypoint"); return null; }
    return addWaypoint(position);
  }
  function clearWaypoints() {
    route = [];
    state.currentIndex = 0;
    state.direction = 1;
    persistRoute();
    bot.log("cave route cleared");
    if (state.running) stop();
    return [];
  }
  function clearTransitions() {
    transitions = [];
    state.pendingTransitionSource = null;
    persistTransitions();
    bot.log("cave learned transitions cleared");
    return [];
  }
  function removeLastWaypoint() {
    if (!route.length) return null;
    const removed = route.pop();
    if (state.currentIndex >= route.length) state.currentIndex = Math.max(0, route.length - 1);
    if (route.length <= 1) state.direction = 1;
    persistRoute();
    bot.log("cave waypoint removed", removed);
    if (!route.length && state.running) stop();
    return removed;
  }
  function setCurrentIndex(index) {
    if (!route.length) { state.currentIndex = 0; state.direction = 1; return 0; }
    const nextIndex = Math.max(0, Math.min(route.length - 1, Math.trunc(Number(index) || 0)));
    state.currentIndex = nextIndex;
    state.direction = nextIndex >= route.length - 1 ? -1 : 1;
    if (route.length <= 1) state.direction = 1;
    return state.currentIndex;
  }
  function status() {
    const position = normalizePosition(bot.getPlayerPosition());
    const waypoint = getCurrentWaypoint();
    return {
      running: state.running,
      config: { ...config },
      route: getRoute(),
      transitions: getTransitions(),
      presetNames: getPresetNames(),
      activePresetName: getActivePresetName(),
      currentIndex: state.currentIndex,
      direction: state.direction,
      currentWaypoint: cloneValue(waypoint),
      distanceToWaypoint: getDistanceToWaypoint(position, waypoint),
      lastPathAt: state.lastPathAt,
      lastProgressAt: state.lastProgressAt,
      pendingTransitionSource: cloneValue(state.pendingTransitionSource),
      pausedForCombat: state.pausedForCombat,
    };
  }
  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    config.tickMs = 200;
    config.waypointTolerance = Math.max(1, Math.trunc(Number(config.waypointTolerance) || 0));
    persistConfig();
    bot.log("cave config updated", { ...config });
    return { ...config };
  }

  startObserver();
  bot.addCleanup(stopObserver);
  bot.addCleanup(function () {
    resetStuckCounts();
    pathCache.clear();
    matrixCache.clear();
  });
  startMinimapOverlay();
  bot.addCleanup(stopMinimapOverlay);
  if (config.enabled && route.length) start();

  bot.cave = {
    start,
    stop,
    status,
    updateConfig,
    config,
    getRoute,
    getTransitions,
    getPresetNames,
    getActivePresetName,
    getCurrentWaypoint,
    createPreset,
    savePreset,
    loadPreset,
    deletePreset,
    addWaypoint,
    addWaypointCurrentSpot,
    clearWaypoints,
    clearTransitions,
    removeLastWaypoint,
    setCurrentIndex,
    goToWaypoint,
    goToPosition,
    handleFloorChange,
    findClosestWaypointIndex,
    findRopeSource,
    findShovelSource,
    inspectNearbyTiles: (radius = 1) => {
      const position = normalizePosition(bot.getPlayerPosition());
      if (!position) return [];
      return getLoadedTiles()
        .map((tile) => ({ tile, position: getTilePosition(tile) }))
        .filter((entry) => entry.position && entry.position.z === position.z && Math.abs(entry.position.x - position.x) <= radius && Math.abs(entry.position.y - position.y) <= radius)
        .map((entry) => ({
          position: entry.position,
          isFloorChange: isFloorChangeTile(entry.tile),
          isHole: isHoleTile(entry.tile),
          isRopeTarget: isRopeTargetTile(entry.tile),
          isShovelTarget: isShovelTargetTile(entry.tile),
          names: getTileThings(entry.tile).map((thing) => getThingName(thing)).filter(Boolean),
        }));
    },
    isAtWaypoint,
  };
};window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaveForwardLoopModule = function installCaveForwardLoopModule(bot) {
  if (!bot || bot.caveForwardLoop?.destroy) return bot?.caveForwardLoop;

  const configStorageKey = "minibiaBot.caveForwardLoop.config";
  const state = {
    timerId: null,
    wrapCount: 0,
    lastWrapAt: 0,
    originalAttackStatus: null,
    lastCombatActiveAt: 0,
  };

  const config = Object.assign(
    {
      enabled: true,
      checkMs: 250,
      combatRetargetGraceMs: 750,
    },
    bot.storage.get(configStorageKey, {}) || {}
  );

  config.enabled = config.enabled !== false;
  config.checkMs = Math.max(100, Math.trunc(Number(config.checkMs) || 250));
  config.combatRetargetGraceMs = Math.max(0, Math.trunc(Number(config.combatRetargetGraceMs) || 750));

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function installCombatRetargetGrace() {
    if (!bot.attack?.status || state.originalAttackStatus) return false;

    state.originalAttackStatus = bot.attack.status.bind(bot.attack);
    bot.attack.status = function statusWithCombatRetargetGrace() {
      const status = state.originalAttackStatus();
      const now = Date.now();

      if (status?.combatActive) {
        state.lastCombatActiveAt = now;
        return status;
      }

      const graceMs = Math.max(0, Number(config.combatRetargetGraceMs) || 0);
      const elapsed = state.lastCombatActiveAt ? now - state.lastCombatActiveAt : Number.POSITIVE_INFINITY;
      if (graceMs > 0 && elapsed < graceMs) {
        return {
          ...status,
          combatActive: true,
          combatRetargetGrace: true,
          combatRetargetGraceRemainingMs: Math.max(0, graceMs - elapsed),
        };
      }

      return status;
    };

    return true;
  }

  function removeCombatRetargetGrace() {
    if (!state.originalAttackStatus || !bot.attack) return;
    bot.attack.status = state.originalAttackStatus;
    state.originalAttackStatus = null;
    state.lastCombatActiveAt = 0;
  }

  function wrapIfReversing() {
    if (!config.enabled || !bot.cave?.status || !bot.cave?.setCurrentIndex) return false;

    const caveStatus = bot.cave.status();
    const routeLength = Array.isArray(caveStatus.route) ? caveStatus.route.length : 0;
    if (!caveStatus.running || routeLength <= 1) return false;

    if (Number(caveStatus.direction) < 0) {
      bot.cave.setCurrentIndex(0);
      state.wrapCount += 1;
      state.lastWrapAt = Date.now();
      bot.log("cave forward loop wrapped to first waypoint instead of reversing", {
        routeLength,
        previousIndex: Number(caveStatus.currentIndex) + 1,
        wrapCount: state.wrapCount,
      });
      return true;
    }

    return false;
  }

  function start() {
    installCombatRetargetGrace();
    if (state.timerId != null) return false;
    state.timerId = window.setInterval(wrapIfReversing, config.checkMs);
    return true;
  }

  function stop() {
    if (state.timerId != null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    return true;
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "enabled")) {
      config.enabled = nextConfig.enabled !== false;
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "checkMs")) {
      config.checkMs = Math.max(100, Math.trunc(Number(nextConfig.checkMs) || config.checkMs || 250));
      if (state.timerId != null) {
        stop();
        start();
      }
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "combatRetargetGraceMs")) {
      config.combatRetargetGraceMs = Math.max(0, Math.trunc(Number(nextConfig.combatRetargetGraceMs) || 0));
    }
    persistConfig();
    return { ...config };
  }

  function status() {
    return {
      running: state.timerId != null,
      config: { ...config },
      wrapCount: state.wrapCount,
      lastWrapAt: state.lastWrapAt,
      lastCombatActiveAt: state.lastCombatActiveAt,
    };
  }

  function destroy() {
    stop();
    removeCombatRetargetGrace();
  }

  bot.caveForwardLoop = {
    start,
    stop,
    status,
    updateConfig,
    wrapIfReversing,
    destroy,
    config,
  };

  start();
  bot.addCleanup(destroy);
  return bot.caveForwardLoop;
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaveArrowKeysModule = function installCaveArrowKeysModule(bot) {
  if (!bot || bot.caveArrowKeys?.destroy) return bot?.caveArrowKeys;

  const state = {
    installed: false,
    originalFindPath: null,
    lastStepAt: 0,
    lastKey: null,
    stepCount: 0,
    fieldStepCount: 0,
    uiTimerId: null,
    lastPathLength: 0,
    lastNextTile: null,
    lastError: null,
    lastWalkMethod: null,
    lastFieldName: null,
  };

  const config = {
    stepCooldownMs: 180,
    matrixCacheMs: 750,
    allowDamagingFields: true,
  };

  const matrixCache = new Map();
  const damagingFieldPattern = /\b(?:fire|poison|energy)\s+field\b/i;

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function sameTile(left, right) {
    const a = normalizePosition(left);
    const b = normalizePosition(right);
    return !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;
  }

  function isArrowModeActive(to) {
    const caveStatus = bot.cave?.status?.() || null;
    if (!caveStatus?.running || caveStatus?.config?.pathfinderMode !== "arrow") return false;
    if (!caveStatus.currentWaypoint) return false;
    return sameTile(to, caveStatus.currentWaypoint);
  }

  function getThingDefinition(itemId) {
    if (!itemId) return null;
    const client = window.gameClient;
    return client?.itemDefinitionsByCid?.[itemId]
      || client?.itemDefinitionsBySid?.[itemId]
      || client?.itemDefinitions?.[itemId]
      || null;
  }

  function getThingName(thing) {
    if (!thing) return "";
    const definition = getThingDefinition(thing.id);
    return String(definition?.properties?.name || thing?.name || "").trim().toLowerCase();
  }

  function getTileThings(tile) {
    if (!tile) return [];
    const things = [];
    if (tile.id) things.push(tile);
    if (Array.isArray(tile.items)) {
      for (const item of tile.items) if (item) things.push(item);
    }
    return things;
  }

  function getDamagingFieldName(tile) {
    if (!config.allowDamagingFields || !tile) return null;
    for (const thing of getTileThings(tile)) {
      const name = getThingName(thing);
      if (damagingFieldPattern.test(name)) return name;
    }
    return null;
  }

  function isDamagingFieldTile(tile) {
    return !!getDamagingFieldName(tile);
  }

  function getTileAt(position) {
    const pos = normalizePosition(position);
    if (!pos) return null;
    try {
      return window.gameClient?.world?.getTileFromWorldPosition?.(
        new Position(pos.x, pos.y, pos.z)
      ) || null;
    } catch (_) {
      return null;
    }
  }

  function isSmartArrowPassable(tile) {
    if (!tile) return false;
    try {
      if (typeof tile.isWalkable === "function" && tile.isWalkable()) return true;
    } catch (_) {}
    return isDamagingFieldTile(tile);
  }

  function getMatrix(z) {
    const cacheKey = String(z);
    const cached = matrixCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= config.matrixCacheMs) return cached.matrix;

    const matrix = new Map();
    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) {
        const pos = normalizePosition(tile?.__position);
        if (!pos || pos.z !== z) continue;
        matrix.set(`${pos.x},${pos.y}`, isSmartArrowPassable(tile));
      }
    }

    matrixCache.set(cacheKey, { matrix, at: Date.now() });
    return matrix;
  }

  function getNeighbors(node, matrix) {
    const directions = [
      { x: 0, y: -1 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ];

    return directions
      .map((direction) => ({ x: node.x + direction.x, y: node.y + direction.y, z: node.z }))
      .filter((position) => matrix.get(`${position.x},${position.y}`) === true);
  }

  function heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function reconstructPath(node) {
    const path = [];
    let current = node;
    while (current) {
      path.unshift({ x: current.x, y: current.y, z: current.z });
      current = current.parent;
    }
    return path;
  }

  function findPathAStar(start, goal) {
    const from = normalizePosition(start);
    const to = normalizePosition(goal);
    if (!from || !to || from.z !== to.z) return null;
    if (sameTile(from, to)) return [from];

    const matrix = getMatrix(from.z);
    const open = [{ ...from, g: 0, f: heuristic(from, to), parent: null }];
    const closed = new Set();
    const key = (position) => `${position.x},${position.y}`;
    const tolerance = Math.max(0, Number(bot.cave?.config?.waypointTolerance) || 0);

    while (open.length) {
      let bestIndex = 0;
      for (let index = 1; index < open.length; index += 1) {
        if (open[index].f < open[bestIndex].f) bestIndex = index;
      }

      const current = open.splice(bestIndex, 1)[0];
      if (Math.abs(current.x - to.x) + Math.abs(current.y - to.y) <= tolerance) {
        return reconstructPath(current);
      }

      closed.add(key(current));

      for (const neighbor of getNeighbors(current, matrix)) {
        const neighborKey = key(neighbor);
        if (closed.has(neighborKey)) continue;

        const g = current.g + 1;
        const f = g + heuristic(neighbor, to);
        const existing = open.find((entry) => entry.x === neighbor.x && entry.y === neighbor.y);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
          }
        } else {
          open.push({ ...neighbor, g, f, parent: current });
        }
      }
    }

    return null;
  }

  function pickArrowKey(from, to) {
    const dx = Number(to.x) - Number(from.x);
    const dy = Number(to.y) - Number(from.y);
    if (dx === 1 && dy === 0) return "ArrowRight";
    if (dx === -1 && dy === 0) return "ArrowLeft";
    if (dx === 0 && dy === 1) return "ArrowDown";
    if (dx === 0 && dy === -1) return "ArrowUp";
    return null;
  }

  function getNextSmartStep(from, to) {
    const path = findPathAStar(from, to);
    if (path && path.length > 1) {
      state.lastPathLength = path.length;
      state.lastNextTile = { ...path[1] };
      return path[1];
    }
    state.lastPathLength = path ? path.length : 0;
    state.lastNextTile = null;
    return null;
  }

  function temporarilyForceFieldTileWalkable(tile, callback) {
    const fieldName = getDamagingFieldName(tile);
    if (!fieldName) return callback(false, null);

    const restores = [];
    const patchMethod = (owner, methodName) => {
      if (!owner || typeof owner[methodName] !== "function") return;
      const original = owner[methodName];
      try {
        owner[methodName] = () => true;
        restores.push(() => { owner[methodName] = original; });
      } catch (_) {}
    };

    patchMethod(tile, "isWalkable");
    patchMethod(tile, "isPathable");
    patchMethod(tile, "isPathfindable");

    try {
      return callback(true, fieldName);
    } finally {
      for (let index = restores.length - 1; index >= 0; index -= 1) {
        try { restores[index](); } catch (_) {}
      }
    }
  }

  function walkOneCardinalTile(originalFrom, fromPosition, nextTile, key) {
    if (typeof state.originalFindPath !== "function") {
      state.lastError = "Original Minibia pathfinder is unavailable";
      return false;
    }

    const targetTile = getTileAt(nextTile);

    try {
      const nextPosition = new Position(nextTile.x, nextTile.y, nextTile.z);
      const result = temporarilyForceFieldTileWalkable(targetTile, (forcedField, fieldName) => {
        const pathResult = state.originalFindPath(originalFrom, nextPosition);
        state.lastFieldName = forcedField ? fieldName : null;
        if (forcedField) state.fieldStepCount += 1;
        return pathResult;
      });

      state.lastWalkMethod = state.lastFieldName
        ? `Minibia forced one-tile field step (${key})`
        : `Minibia one-tile path (${key})`;
      state.lastError = null;
      bot.log("cave Smart A* one-tile walk step requested", {
        key,
        from: fromPosition,
        nextTile,
        field: state.lastFieldName,
        pathResult: result == null ? null : typeof result,
      });
      return true;
    } catch (error) {
      state.lastWalkMethod = null;
      state.lastError = `One-tile movement failed: ${error?.message || error}`;
      bot.log("cave Smart A* one-tile walk failed", {
        key,
        from: fromPosition,
        nextTile,
        field: getDamagingFieldName(targetTile),
        error: state.lastError,
      });
      return false;
    }
  }

  function stepToward(from, to) {
    const fromPosition = normalizePosition(from);
    const toPosition = normalizePosition(to);
    if (!fromPosition || !toPosition || fromPosition.z !== toPosition.z) return false;

    const now = Date.now();
    if (now - state.lastStepAt < config.stepCooldownMs) return true;

    let nextTile = null;
    try {
      nextTile = getNextSmartStep(fromPosition, toPosition);
    } catch (error) {
      state.lastError = error?.message || String(error);
      return false;
    }

    if (!nextTile) return true;

    const key = pickArrowKey(fromPosition, nextTile);
    if (!key) {
      state.lastError = "Smart A* produced a non-cardinal step";
      return false;
    }

    if (!walkOneCardinalTile(from, fromPosition, nextTile, key)) return false;

    state.lastStepAt = now;
    state.lastKey = key;
    state.stepCount += 1;
    bot.log("cave Smart A* one-tile walk step", {
      key,
      walkMethod: state.lastWalkMethod,
      from: fromPosition,
      nextTile,
      waypoint: toPosition,
      field: state.lastFieldName,
      pathLength: state.lastPathLength,
      stepCount: state.stepCount,
      fieldStepCount: state.fieldStepCount,
    });
    return true;
  }

  function installPathInterceptor() {
    const pathfinder = window.gameClient?.world?.pathfinder;
    if (!pathfinder || typeof pathfinder.findPath !== "function" || state.installed) return false;

    state.originalFindPath = pathfinder.findPath.bind(pathfinder);
    pathfinder.findPath = function findPathWithSmartArrowMode(from, to, ...args) {
      if (isArrowModeActive(to)) {
        stepToward(from, to);
        return null;
      }
      return state.originalFindPath(from, to, ...args);
    };

    state.installed = true;
    return true;
  }

  function uninstallPathInterceptor() {
    const pathfinder = window.gameClient?.world?.pathfinder;
    if (state.installed && pathfinder && state.originalFindPath) {
      pathfinder.findPath = state.originalFindPath;
    }
    state.installed = false;
    state.originalFindPath = null;
  }

  function ensureDropdownOption() {
    const select = document.getElementById("minibia-bot-cave-pathfinder-mode");
    if (!select) return;

    let astarOption = Array.from(select.options).find((entry) => entry.value === "astar");
    if (!astarOption) {
      astarOption = document.createElement("option");
      astarOption.value = "astar";
      select.appendChild(astarOption);
    }
    astarOption.textContent = "Smart A*";

    let arrowOption = Array.from(select.options).find((entry) => entry.value === "arrow");
    if (!arrowOption) {
      arrowOption = document.createElement("option");
      arrowOption.value = "arrow";
      select.appendChild(arrowOption);
    }
    arrowOption.textContent = "Smart A* + Field Crossing";

    const mode = bot.cave?.status?.().config?.pathfinderMode;
    if (mode === "astar" || mode === "arrow") select.value = mode;
  }

  function status() {
    return {
      installed: state.installed,
      config: { ...config },
      lastStepAt: state.lastStepAt,
      lastKey: state.lastKey,
      stepCount: state.stepCount,
      fieldStepCount: state.fieldStepCount,
      lastPathLength: state.lastPathLength,
      lastNextTile: state.lastNextTile,
      lastError: state.lastError,
      lastWalkMethod: state.lastWalkMethod,
      lastFieldName: state.lastFieldName,
    };
  }

  function destroy() {
    uninstallPathInterceptor();
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
    matrixCache.clear();
  }

  bot.caveArrowKeys = {
    installPathInterceptor,
    uninstallPathInterceptor,
    ensureDropdownOption,
    status,
    destroy,
    config,
    isDamagingFieldTile,
    getDamagingFieldName,
  };

  installPathInterceptor();
  ensureDropdownOption();
  state.uiTimerId = window.setInterval(ensureDropdownOption, 1000);
  bot.addCleanup(destroy);
  return bot.caveArrowKeys;
};window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaveWaypointActionsModule = function installCaveWaypointActionsModule(bot) {
  const actionStorageKey = "minibiaBot.cave.waypointActions";
  const ropeNamePattern = /\brope\b/i;
  const shovelNamePattern = /\bshovel\b/i;
  const shovelTargetNamePatterns = [
    /\bhole\b/i,
    /\bstone pile\b/i,
    /\bloose stone pile\b/i,
    /\bgravel pile\b/i,
    /\bdirt pile\b/i,
  ];
  const noopAction = "walk";
  const ropeAction = "rope";
  const shovelAction = "shovel";
  const waitAction = "wait";
  const waitDurationMs = 60 * 1000;
  let lastToolUseAt = 0;
  let lastHandledKey = null;
  const waitState = {
    active: false,
    presetName: null,
    index: -1,
    startedAt: 0,
    resumeAt: 0,
    timerId: null,
    completedKey: null,
  };

  function normalizePresetName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || "Default";
  }

  function normalizeAction(action) {
    if (action === ropeAction || action === shovelAction || action === waitAction) return action;
    return noopAction;
  }

  function getActivePresetName() {
    return normalizePresetName(bot.cave?.getActivePresetName?.());
  }

  function readAllActions() {
    const raw = bot.storage.get(actionStorageKey, {});
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function writeAllActions(next) {
    bot.storage.set(actionStorageKey, next);
    return next;
  }

  function getPresetActions(name = getActivePresetName()) {
    const allActions = readAllActions();
    const actions = allActions[normalizePresetName(name)];
    return Array.isArray(actions) ? actions.slice() : [];
  }

  function savePresetActions(actions, name = getActivePresetName()) {
    const allActions = readAllActions();
    const routeLength = bot.cave?.getRoute?.().length || 0;
    allActions[normalizePresetName(name)] = Array.from({ length: routeLength }, (_, index) => normalizeAction(actions[index]));
    writeAllActions(allActions);
    return allActions[normalizePresetName(name)].slice();
  }

  function getWaypointActions() {
    const routeLength = bot.cave?.getRoute?.().length || 0;
    const actions = getPresetActions();
    return Array.from({ length: routeLength }, (_, index) => normalizeAction(actions[index]));
  }

  function setWaypointAction(index, action) {
    const routeLength = bot.cave?.getRoute?.().length || 0;
    const normalizedIndex = Math.trunc(Number(index));
    if (!Number.isFinite(normalizedIndex) || normalizedIndex < 0 || normalizedIndex >= routeLength) return null;

    const actions = getWaypointActions();
    actions[normalizedIndex] = normalizeAction(action);
    savePresetActions(actions);
    bot.log("cave waypoint action updated", { index: normalizedIndex + 1, action: actions[normalizedIndex] });
    return actions[normalizedIndex];
  }

  function setLastWaypointAction(action) {
    const routeLength = bot.cave?.getRoute?.().length || 0;
    return routeLength ? setWaypointAction(routeLength - 1, action) : null;
  }

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function getPositionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : null;
  }

  function getTilePosition(tile) {
    return normalizePosition(tile?.__position);
  }

  function getThingDefinition(itemId) {
    if (!itemId) return null;
    return (
      window.gameClient?.itemDefinitionsByCid?.[itemId] ||
      window.gameClient?.itemDefinitionsBySid?.[itemId] ||
      window.gameClient?.itemDefinitions?.[itemId] ||
      null
    );
  }

  function getThingName(thing) {
    const definition = getThingDefinition(thing?.id);
    return String(definition?.properties?.name || thing?.name || "").trim().toLowerCase();
  }

  function getTileThings(tile) {
    if (!tile) return [];
    const things = [];
    if (tile.id) things.push(tile);
    if (Array.isArray(tile.items)) {
      tile.items.forEach((item) => {
        if (item) things.push(item);
      });
    }
    return things;
  }

  function tileHasNamedThing(tile, needle) {
    const value = String(needle || "").trim().toLowerCase();
    return !!value && getTileThings(tile).some((thing) => getThingName(thing).includes(value));
  }

  function isRopeTargetTile(tile) {
    return tileHasNamedThing(tile, "hole") || tileHasNamedThing(tile, "rope spot");
  }

  function isShovelTargetThing(thing) {
    const name = getThingName(thing);
    return !!name && shovelTargetNamePatterns.some((pattern) => pattern.test(name));
  }

  function isShovelTargetTile(tile) {
    return getTileThings(tile).some((thing) => isShovelTargetThing(thing));
  }

  function getLoadedTiles() {
    const chunks = window.gameClient?.world?.chunks || [];
    const tiles = [];
    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) {
        if (tile?.__position) tiles.push(tile);
      }
    }
    return tiles;
  }

  function isRopeItem(item) {
    const name = getThingName(item);
    return !!name && ropeNamePattern.test(name);
  }

  function isShovelItem(item) {
    const name = getThingName(item);
    return !!name && shovelNamePattern.test(name);
  }

  function getEquipment() {
    return window.gameClient?.player?.equipment || null;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function findToolSource(predicate) {
    const equipment = getEquipment();
    if (equipment?.slots) {
      for (let slotIndex = 0; slotIndex < equipment.slots.length; slotIndex += 1) {
        const item = equipment.getSlotItem?.(slotIndex);
        if (predicate(item)) return { which: equipment, index: slotIndex, item, location: "equipment" };
      }
    }

    for (const container of getOpenContainers()) {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const item = container.getSlotItem?.(slotIndex);
        if (predicate(item)) return { which: container, index: slotIndex, item, location: "container" };
      }
    }

    return null;
  }

  function findRopeSource() {
    return findToolSource(isRopeItem);
  }

  function findShovelSource() {
    return findToolSource(isShovelItem);
  }

  function distanceOnSameFloor(a, b) {
    if (!a || !b || a.z !== b.z) return Number.POSITIVE_INFINITY;
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function isAtWaypoint(position, waypoint) {
    if (!position || !waypoint || position.z !== waypoint.z) return false;
    const tolerance = Math.max(1, Math.trunc(Number(bot.cave?.status?.()?.config?.waypointTolerance) || 1));
    return Math.abs(position.x - waypoint.x) <= tolerance && Math.abs(position.y - waypoint.y) <= tolerance;
  }

  function isBesideOrSameTile(a, b) {
    return !!a && !!b && a.z === b.z && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
  }

  function findNearestTargetTile(origin, preferredPosition = null, radius = 2, predicate = () => false) {
    if (!origin) return null;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    getLoadedTiles().forEach((tile) => {
      const position = getTilePosition(tile);
      if (!position || position.z !== origin.z || !predicate(tile)) return;
      if (Math.abs(position.x - origin.x) > radius || Math.abs(position.y - origin.y) > radius) return;

      const score = distanceOnSameFloor(origin, position) * 10 +
        (preferredPosition ? distanceOnSameFloor(preferredPosition, position) : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { tile, position };
      }
    });

    return best;
  }

  function useToolOnNearestTarget({ action, tool, target, preferredPosition = null, missingToolLog, usedLog }) {
    const now = Date.now();
    if (now - lastToolUseAt < 1200) return true;

    const playerPosition = normalizePosition(bot.getPlayerPosition?.());
    if (!playerPosition) return false;

    const targetEntry = findNearestTargetTile(playerPosition, preferredPosition, 2, target);
    if (!targetEntry || !isBesideOrSameTile(playerPosition, targetEntry.position)) return false;

    const toolEntry = tool();
    if (!toolEntry) {
      bot.log(missingToolLog);
      return false;
    }

    window.gameClient?.mouse?.__handleItemUseWith?.(
      { which: toolEntry.which, index: toolEntry.index },
      { which: targetEntry.tile, index: 0xFF }
    );
    lastToolUseAt = now;
    bot.log(usedLog, {
      action,
      source: targetEntry.position,
      toolLocation: toolEntry.location,
      toolSlot: toolEntry.index,
      toolName: getThingName(toolEntry.item),
    });
    return true;
  }

  function useRopeOnNearestHole(preferredPosition = null) {
    return useToolOnNearestTarget({
      action: ropeAction,
      tool: findRopeSource,
      target: isRopeTargetTile,
      preferredPosition,
      missingToolLog: "cave rope waypoint skipped: no rope found",
      usedLog: "cave waypoint used rope",
    });
  }

  function useShovelOnNearestHole(preferredPosition = null) {
    return useToolOnNearestTarget({
      action: shovelAction,
      tool: findShovelSource,
      target: isShovelTargetTile,
      preferredPosition,
      missingToolLog: "cave shovel waypoint skipped: no shovel found",
      usedLog: "cave waypoint used shovel",
    });
  }

  function stopCurrentMovement() {
    const pathfinder = window.gameClient?.world?.pathfinder;
    try { pathfinder?.setPathfindCache?.(null); } catch (_) {}
    const targets = [pathfinder, window.gameClient?.player, window.gameClient?.world].filter(Boolean);
    ["stop", "cancel", "clear", "clearPath", "stopWalking", "cancelWalking", "stopAutoWalk", "reset"].forEach((name) => {
      targets.forEach((target) => {
        if (typeof target?.[name] !== "function") return;
        try { target[name](); } catch (_) {}
      });
    });
  }

  function clearWaitTimer() {
    if (waitState.timerId != null) {
      window.clearTimeout(waitState.timerId);
      waitState.timerId = null;
    }
  }

  function finishWaypointWait() {
    if (!waitState.active) return false;
    const presetName = waitState.presetName;
    const index = waitState.index;
    const waitKey = `${presetName}:${index}`;
    clearWaitTimer();
    waitState.active = false;
    waitState.startedAt = 0;
    waitState.resumeAt = 0;
    waitState.completedKey = waitKey;

    const actions = getWaypointActions();
    const samePreset = getActivePresetName() === presetName;
    const sameWaitWaypoint = actions[index] === waitAction;
    const manuallyPaused = !!bot.pauseBreak?.status?.()?.paused;
    const stillEnabled = bot.cave?.config?.enabled !== false;

    if (!samePreset || !sameWaitWaypoint || manuallyPaused || !stillEnabled) {
      bot.log("waypoint wait finished without auto-resume", { index: index + 1, samePreset, sameWaitWaypoint, manuallyPaused, stillEnabled });
      return false;
    }

    bot.log("waypoint wait finished", { index: index + 1, waitMs: waitDurationMs });
    return !!bot.cave?.start?.();
  }

  function startWaypointWait(status, index, waypoint) {
    if (waitState.active) return true;
    const presetName = getActivePresetName();
    const waitKey = `${presetName}:${index}`;
    if (waitState.completedKey === waitKey) return false;

    waitState.active = true;
    waitState.presetName = presetName;
    waitState.index = index;
    waitState.startedAt = Date.now();
    waitState.resumeAt = waitState.startedAt + waitDurationMs;

    stopCurrentMovement();
    bot.cave?.stop?.({ persistEnabled: false });
    stopCurrentMovement();
    bot.log("waypoint wait started", { index: index + 1, waitMs: waitDurationMs, waypoint });

    waitState.timerId = window.setTimeout(finishWaypointWait, waitDurationMs);
    return true;
  }

  function getNextRouteIndex(status) {
    const route = bot.cave?.getRoute?.() || [];
    if (route.length <= 1) return 0;

    const currentIndex = Math.max(0, Math.min(route.length - 1, Math.trunc(Number(status?.currentIndex) || 0)));
    let direction = Number(status?.direction) || 1;
    let nextIndex = currentIndex + direction;

    if (nextIndex >= route.length) {
      nextIndex = route.length - 2;
    } else if (nextIndex < 0) {
      nextIndex = 1;
    }

    return Math.max(0, Math.min(route.length - 1, nextIndex));
  }

  function runWaypointActionCheck() {
    const status = bot.cave?.status?.();

    if (waitState.completedKey && status?.running) {
      const currentKey = `${getActivePresetName()}:${Math.trunc(Number(status.currentIndex) || 0)}`;
      if (currentKey !== waitState.completedKey) waitState.completedKey = null;
    }

    if (!status?.running) return;

    const route = bot.cave?.getRoute?.() || [];
    const index = Math.trunc(Number(status.currentIndex) || 0);
    const waypoint = route[index];
    const actions = getWaypointActions();
    const action = actions[index];

    if (!waypoint || action === noopAction) return;

    const playerPosition = normalizePosition(bot.getPlayerPosition?.());
    if (action === waitAction) {
      if (isAtWaypoint(playerPosition, waypoint)) startWaypointWait(status, index, waypoint);
      return;
    }

    const distance = distanceOnSameFloor(playerPosition, waypoint);
    if (!Number.isFinite(distance) || distance > 2) return;

    const actionKey = `${action}:${index}:${getPositionKey(playerPosition)}`;
    if (actionKey === lastHandledKey && Date.now() - lastToolUseAt < 2000) return;

    const used = action === ropeAction
      ? useRopeOnNearestHole(waypoint)
      : action === shovelAction
        ? useShovelOnNearestHole(waypoint)
        : false;

    if (used) {
      lastHandledKey = actionKey;
      window.setTimeout(() => {
        const nextStatus = bot.cave?.status?.();
        if (!nextStatus?.running) return;
        const nextIndex = getNextRouteIndex(status);
        bot.cave?.setCurrentIndex?.(nextIndex);
      }, 700);
    }
  }

  const originalAddWaypoint = bot.cave?.addWaypoint?.bind(bot.cave);
  const originalAddWaypointCurrentSpot = bot.cave?.addWaypointCurrentSpot?.bind(bot.cave);
  const originalRemoveLastWaypoint = bot.cave?.removeLastWaypoint?.bind(bot.cave);
  const originalClearWaypoints = bot.cave?.clearWaypoints?.bind(bot.cave);
  const originalCreatePreset = bot.cave?.createPreset?.bind(bot.cave);
  const originalLoadPreset = bot.cave?.loadPreset?.bind(bot.cave);
  const originalSavePreset = bot.cave?.savePreset?.bind(bot.cave);

  if (originalAddWaypoint) {
    bot.cave.addWaypoint = (waypoint, options = {}) => {
      const added = originalAddWaypoint(waypoint);
      if (added) setLastWaypointAction(options.action);
      return added;
    };
  }

  if (originalAddWaypointCurrentSpot) {
    bot.cave.addWaypointCurrentSpot = (options = {}) => {
      const added = originalAddWaypointCurrentSpot();
      if (added) setLastWaypointAction(options.action);
      return added;
    };
  }

  if (originalRemoveLastWaypoint) {
    bot.cave.removeLastWaypoint = () => {
      const removed = originalRemoveLastWaypoint();
      if (removed) savePresetActions(getWaypointActions().slice(0, -1));
      return removed;
    };
  }

  if (originalClearWaypoints) {
    bot.cave.clearWaypoints = () => {
      const result = originalClearWaypoints();
      savePresetActions([]);
      return result;
    };
  }

  if (originalCreatePreset) {
    bot.cave.createPreset = (name) => {
      const result = originalCreatePreset(name);
      if (result) savePresetActions([], result.name);
      return result;
    };
  }

  if (originalLoadPreset) {
    bot.cave.loadPreset = (name) => {
      const result = originalLoadPreset(name);
      if (result) savePresetActions(getPresetActions(result.name), result.name);
      return result;
    };
  }

  if (originalSavePreset) {
    bot.cave.savePreset = (name, options = {}) => {
      const result = originalSavePreset(name, options);
      if (result) savePresetActions(getWaypointActions(), result.name);
      return result;
    };
  }

  const actionTimerId = window.setInterval(() => {
    try {
      runWaypointActionCheck();
    } catch (error) {
      bot.log("cave waypoint action failed", error?.message || error);
    }
  }, 100);

  bot.addCleanup(() => {
    window.clearInterval(actionTimerId);
    clearWaitTimer();
  });

  function installPanelControls() {
    const recordButton = document.getElementById("minibia-bot-cave-add");
    if (!recordButton) return;

    let select = document.getElementById("minibia-bot-cave-waypoint-action");
    if (!select) {
      const wrapper = document.createElement("label");
      wrapper.className = "mb-field";
      wrapper.setAttribute("for", "minibia-bot-cave-waypoint-action");

      const label = document.createElement("span");
      label.className = "mb-field-label";
      label.textContent = "Waypoint Action";

      select = document.createElement("select");
      select.id = "minibia-bot-cave-waypoint-action";

      const walkOption = document.createElement("option");
      walkOption.value = noopAction;
      walkOption.textContent = "Walk";

      const ropeOption = document.createElement("option");
      ropeOption.value = ropeAction;
      ropeOption.textContent = "Use Rope";

      const shovelOption = document.createElement("option");
      shovelOption.value = shovelAction;
      shovelOption.textContent = "Use Shovel";

      const waitOption = document.createElement("option");
      waitOption.value = waitAction;
      waitOption.textContent = "Waypoint Wait (1 Minute)";

      select.appendChild(walkOption);
      select.appendChild(ropeOption);
      select.appendChild(shovelOption);
      select.appendChild(waitOption);
      wrapper.appendChild(label);
      wrapper.appendChild(select);

      recordButton.closest(".mb-row")?.insertAdjacentElement("afterend", wrapper);

      recordButton.addEventListener("click", () => {
        window.setTimeout(() => {
          setLastWaypointAction(select.value);
        }, 0);
      });
    }

    if (!document.getElementById("minibia-bot-cave-record-wait")) {
      const waitButton = document.createElement("button");
      waitButton.type = "button";
      waitButton.id = "minibia-bot-cave-record-wait";
      waitButton.className = recordButton.className;
      waitButton.textContent = "Add Waypoint Wait";
      waitButton.title = "Add a waypoint at your current position that pauses Cavebot movement for 1 minute";
      waitButton.addEventListener("click", () => {
        const added = bot.cave?.addWaypointCurrentSpot?.({ action: waitAction });
        if (added) bot.log("waypoint wait added", { waypoint: added, waitMs: waitDurationMs });
      });
      recordButton.insertAdjacentElement("afterend", waitButton);
    }
  }

  function patchUiInject() {
    if (!bot.ui?.inject || bot.ui.__caveWaypointActionsPatched) return;
    const originalInject = bot.ui.inject.bind(bot.ui);
    bot.ui.inject = (...args) => {
      const result = originalInject(...args);
      installPanelControls();
      return result;
    };
    bot.ui.__caveWaypointActionsPatched = true;
  }

  patchUiInject();
  window.setTimeout(patchUiInject, 0);

  bot.cave.getWaypointActions = getWaypointActions;
  bot.cave.setWaypointAction = setWaypointAction;
  bot.cave.setLastWaypointAction = setLastWaypointAction;
  bot.cave.useRopeOnNearestHole = useRopeOnNearestHole;
  bot.cave.useShovelOnNearestHole = useShovelOnNearestHole;
  bot.cave.waypointWaitStatus = () => ({
    active: waitState.active,
    index: waitState.index,
    startedAt: waitState.startedAt,
    resumeAt: waitState.resumeAt,
    remainingMs: waitState.active ? Math.max(0, waitState.resumeAt - Date.now()) : 0,
    durationMs: waitDurationMs,
  });
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

(function installCaveActiveTimerGates(bundle) {
  if (!bundle || bundle.__caveActiveTimerGatesInstalled) return;
  bundle.__caveActiveTimerGatesInstalled = true;

  function wrapCaveInstaller() {
    const originalInstall = bundle.installCaveModule;
    if (typeof originalInstall !== "function" || originalInstall.__activeTimerGated) return;

    function installCaveModuleWithActiveTimers(bot) {
      const originalSetInterval = window.setInterval;
      let observerCallback = null;

      window.setInterval = function captureCaveIntervals(callback, delay, ...args) {
        const timerId = originalSetInterval.call(window, callback, delay, ...args);
        if (Number(delay) === 200 && observerCallback == null) {
          observerCallback = callback;
          window.clearInterval(timerId);
          return timerId;
        }
        return timerId;
      };

      let result;
      try {
        result = originalInstall(bot);
      } finally {
        window.setInterval = originalSetInterval;
      }

      if (!bot.cave || typeof observerCallback !== "function") return result;

      let observerTimerId = null;
      const startObserver = () => {
        if (observerTimerId != null || !bot.cave?.status?.().running) return false;
        observerTimerId = originalSetInterval.call(window, () => {
          try { observerCallback(); } catch (error) { bot.log?.("cave observer failed", error?.message || error); }
        }, 200);
        return true;
      };
      const stopObserver = () => {
        if (observerTimerId == null) return false;
        window.clearInterval(observerTimerId);
        observerTimerId = null;
        return true;
      };

      const originalStart = bot.cave.start?.bind(bot.cave);
      const originalStop = bot.cave.stop?.bind(bot.cave);
      if (originalStart) {
        bot.cave.start = (...args) => {
          const value = originalStart(...args);
          startObserver();
          return value;
        };
      }
      if (originalStop) {
        bot.cave.stop = (...args) => {
          const value = originalStop(...args);
          stopObserver();
          return value;
        };
      }

      if (bot.cave.status?.().running) startObserver();
      bot.addCleanup?.(stopObserver);
      bot.caveActiveObserver = { start: startObserver, stop: stopObserver, status: () => ({ running: observerTimerId != null }) };
      return result;
    }

    installCaveModuleWithActiveTimers.__activeTimerGated = true;
    installCaveModuleWithActiveTimers.__originalInstallCaveModule = originalInstall;
    bundle.installCaveModule = installCaveModuleWithActiveTimers;
  }

  function wrapForwardLoopInstaller() {
    const originalInstall = bundle.installCaveForwardLoopModule;
    if (typeof originalInstall !== "function" || originalInstall.__activeTimerGated) return;

    function installForwardLoopWithActiveTimer(bot) {
      const result = originalInstall(bot);
      if (!bot.caveForwardLoop || !bot.cave) return result;

      if (!bot.cave.status?.().running) bot.caveForwardLoop.stop?.();

      const originalStart = bot.cave.start?.bind(bot.cave);
      const originalStop = bot.cave.stop?.bind(bot.cave);
      if (originalStart) {
        bot.cave.start = (...args) => {
          const value = originalStart(...args);
          if (bot.cave.status?.().running) bot.caveForwardLoop.start?.();
          return value;
        };
      }
      if (originalStop) {
        bot.cave.stop = (...args) => {
          const value = originalStop(...args);
          bot.caveForwardLoop.stop?.();
          return value;
        };
      }
      return result;
    }

    installForwardLoopWithActiveTimer.__activeTimerGated = true;
    bundle.installCaveForwardLoopModule = installForwardLoopWithActiveTimer;
  }

  function wrapWaypointActionsInstaller() {
    const originalInstall = bundle.installCaveWaypointActionsModule;
    if (typeof originalInstall !== "function" || originalInstall.__activeTimerGated) return;

    function installWaypointActionsWithActiveTimer(bot) {
      const originalSetInterval = window.setInterval;
      let actionCallback = null;

      window.setInterval = function captureWaypointActionInterval(callback, delay, ...args) {
        const timerId = originalSetInterval.call(window, callback, delay, ...args);
        if (Number(delay) === 100 && actionCallback == null) {
          actionCallback = callback;
          window.clearInterval(timerId);
          return timerId;
        }
        return timerId;
      };

      let result;
      try {
        result = originalInstall(bot);
      } finally {
        window.setInterval = originalSetInterval;
      }

      if (typeof actionCallback !== "function" || !bot.cave) return result;

      let actionTimerId = null;
      const startActions = () => {
        if (actionTimerId != null || !bot.cave?.status?.().running) return false;
        actionTimerId = originalSetInterval.call(window, actionCallback, 100);
        return true;
      };
      const stopActions = () => {
        if (actionTimerId == null) return false;
        window.clearInterval(actionTimerId);
        actionTimerId = null;
        return true;
      };

      const originalStart = bot.cave.start?.bind(bot.cave);
      const originalStop = bot.cave.stop?.bind(bot.cave);
      if (originalStart) {
        bot.cave.start = (...args) => {
          const value = originalStart(...args);
          startActions();
          return value;
        };
      }
      if (originalStop) {
        bot.cave.stop = (...args) => {
          const value = originalStop(...args);
          stopActions();
          return value;
        };
      }

      if (bot.cave.status?.().running) startActions();
      bot.addCleanup?.(stopActions);
      bot.caveActiveWaypointActions = { start: startActions, stop: stopActions, status: () => ({ running: actionTimerId != null }) };
      return result;
    }

    installWaypointActionsWithActiveTimer.__activeTimerGated = true;
    bundle.installCaveWaypointActionsModule = installWaypointActionsWithActiveTimer;
  }

  wrapCaveInstaller();
  wrapForwardLoopInstaller();
  wrapWaypointActionsInstaller();
})(window.__minibiaBotBundle);
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installWaypointProfilesModule = function installWaypointProfilesModule(bot) {
  if (!bot || bot.waypointProfiles?.destroy) return bot?.waypointProfiles;

  const repository = "seledoz/min-new";
  const ref = "main";
  const rawBaseUrl = `https://raw.githubusercontent.com/${repository}/${ref}`;
  const manifestPath = "waypoint-profiles/manifest.json";

  const state = {
    profiles: [],
    lastLoadedAt: 0,
    lastError: null,
    uiTimerId: null,
  };

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function normalizeRoute(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        const x = Number(entry?.x);
        const y = Number(entry?.y);
        const z = Number(entry?.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
      })
      .filter(Boolean);
  }

  function normalizeTransitions(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        const from = normalizeRoute([entry?.from])[0];
        const to = normalizeRoute([entry?.to])[0];
        if (!from || !to) return null;
        return {
          from,
          to,
          count: Math.max(1, Math.trunc(Number(entry?.count) || 1)),
          lastSeenAt: Number(entry?.lastSeenAt) || Date.now(),
        };
      })
      .filter(Boolean);
  }

  function normalizeManifest(value) {
    const profiles = Array.isArray(value?.profiles) ? value.profiles : [];
    return profiles
      .map((profile) => ({
        name: normalizeName(profile?.name),
        file: String(profile?.file || "").trim(),
        description: String(profile?.description || "").trim(),
      }))
      .filter((profile) => profile.name && profile.file && !profile.file.includes(".."));
  }

  async function fetchJson(path) {
    const response = await fetch(`${rawBaseUrl}/${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status} loading ${path}`);
    return response.json();
  }

  async function refreshManifest() {
    try {
      const manifest = await fetchJson(manifestPath);
      state.profiles = normalizeManifest(manifest);
      state.lastLoadedAt = Date.now();
      state.lastError = null;
      renderProfiles();
      refreshUiValues();
      bot.log("waypoint profile manifest loaded", { profiles: state.profiles.length });
      return [...state.profiles];
    } catch (error) {
      state.lastError = error?.message || String(error);
      refreshUiValues();
      bot.log("waypoint profile manifest failed", { error: state.lastError });
      return [];
    }
  }

  async function loadProfile(nameOrFile) {
    const requested = String(nameOrFile || "").trim();
    const profile = state.profiles.find((entry) =>
      entry.name.toLowerCase() === requested.toLowerCase() || entry.file.toLowerCase() === requested.toLowerCase()
    );

    if (!profile) throw new Error(`Waypoint profile not found: ${requested}`);

    const data = await fetchJson(`waypoint-profiles/${profile.file}`);
    const route = normalizeRoute(data.route || data.waypoints);
    const transitions = normalizeTransitions(data.transitions);
    const profileName = normalizeName(data.name || profile.name);

    if (!route.length) throw new Error(`Waypoint profile has no valid waypoints: ${profile.name}`);

    bot.cave?.stop?.();
    bot.cave?.createPreset?.(profileName);
    bot.storage.set("minibiaBot.cave.presets", mergePresetIntoStorage(profileName, route, transitions));
    bot.storage.set("minibiaBot.cave.route", route);
    bot.storage.set("minibiaBot.cave.transitions", transitions);
    bot.cave?.updateConfig?.({ activePresetName: profileName });

    bot.log("waypoint profile loaded from GitHub", {
      name: profileName,
      waypoints: route.length,
      transitions: transitions.length,
    });

    window.setTimeout(() => window.minibiaBotReload?.(), 100);
    return { name: profileName, route, transitions };
  }

  function mergePresetIntoStorage(name, route, transitions) {
    const existing = Array.isArray(bot.storage.get("minibiaBot.cave.presets", []))
      ? bot.storage.get("minibiaBot.cave.presets", [])
      : [];
    const preset = { name, route, transitions };
    const filtered = existing.filter((entry) => String(entry?.name || "").toLowerCase() !== name.toLowerCase());
    filtered.push(preset);
    return filtered;
  }

  function exportCurrentRoute() {
    const status = bot.cave?.status?.();
    const route = normalizeRoute(status?.route || []);
    const transitions = normalizeTransitions(status?.transitions || []);
    const name = normalizeName(status?.activePresetName || "Waypoint Profile");
    return {
      name,
      route,
      transitions,
      exportedAt: new Date().toISOString(),
    };
  }

  function getMount(panel) {
    return panel.querySelector(".mb-side-column") ||
      panel.querySelector(".mb-main-column") ||
      panel.querySelector(".mb-body") ||
      panel;
  }

  function moveSectionToTop(section, panel) {
    const mount = getMount(panel);
    const excludeSection = document.getElementById("minibia-bot-auto-attack-exclude-section");
    const redTextSection = document.getElementById("k9x-red-text-alert-section");

    if (excludeSection && excludeSection.parentElement === mount) {
      excludeSection.insertAdjacentElement("afterend", section);
      return;
    }

    if (redTextSection && redTextSection.parentElement === mount) {
      redTextSection.insertAdjacentElement("afterend", section);
      return;
    }

    mount.insertBefore(section, mount.firstElementChild || null);
  }

  function ensureUi() {
    const panel = document.getElementById("minibia-bot-panel") || document.getElementById("k9x-panel");
    if (!panel) return;

    const existing = document.getElementById("minibia-bot-waypoint-profiles-section");
    if (existing) {
      moveSectionToTop(existing, panel);
      return;
    }

    const section = document.createElement("div");
    section.className = "mb-section mb-column-section";
    section.id = "minibia-bot-waypoint-profiles-section";
    section.innerHTML = `
      <div class="mb-label">GitHub Waypoints</div>
      <div class="mb-stack">
        <button type="button" class="mb-small-button" id="minibia-bot-waypoint-profiles-refresh">Refresh GitHub List</button>
        <select id="minibia-bot-waypoint-profiles-select"></select>
        <button type="button" class="mb-small-button" id="minibia-bot-waypoint-profiles-load">Load Selected Route</button>
        <button type="button" class="mb-small-button" id="minibia-bot-waypoint-profiles-export">Copy Current Route JSON</button>
        <div class="mb-small-note" id="minibia-bot-waypoint-profiles-status">GitHub routes: not loaded</div>
      </div>`;

    moveSectionToTop(section, panel);

    section.querySelector("#minibia-bot-waypoint-profiles-refresh")?.addEventListener("click", () => refreshManifest());
    section.querySelector("#minibia-bot-waypoint-profiles-load")?.addEventListener("click", async () => {
      const select = document.getElementById("minibia-bot-waypoint-profiles-select");
      const value = select?.value || "";
      try {
        await loadProfile(value);
      } catch (error) {
        state.lastError = error?.message || String(error);
        refreshUiValues();
      }
    });
    section.querySelector("#minibia-bot-waypoint-profiles-export")?.addEventListener("click", async () => {
      const json = JSON.stringify(exportCurrentRoute(), null, 2);
      try {
        await navigator.clipboard.writeText(json);
        state.lastError = null;
        setStatusText("Current route JSON copied. Paste it into a new file in waypoint-profiles/ on GitHub.");
      } catch (error) {
        state.lastError = "Clipboard copy failed. Open console and run minibiaBot.waypointProfiles.exportCurrentRoute().";
        refreshUiValues();
      }
    });

    renderProfiles();
    refreshUiValues();
  }

  function renderProfiles() {
    const select = document.getElementById("minibia-bot-waypoint-profiles-select");
    if (!select) return;

    const previous = select.value;
    select.innerHTML = "";

    if (!state.profiles.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No GitHub waypoint profiles";
      select.appendChild(option);
      select.disabled = true;
      return;
    }

    state.profiles.forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.file;
      option.textContent = profile.name;
      select.appendChild(option);
    });

    select.disabled = false;
    if (previous && Array.from(select.options).some((option) => option.value === previous)) select.value = previous;
  }

  function setStatusText(text) {
    const label = document.getElementById("minibia-bot-waypoint-profiles-status");
    if (label) label.textContent = text;
  }

  function refreshUiValues() {
    if (state.lastError) {
      setStatusText(`GitHub routes error: ${state.lastError}`);
      return;
    }

    setStatusText(state.profiles.length
      ? `GitHub routes: ${state.profiles.length} loaded`
      : "GitHub routes: none saved yet");
  }

  function status() {
    return {
      repository,
      manifestPath,
      profiles: [...state.profiles],
      lastLoadedAt: state.lastLoadedAt,
      lastError: state.lastError,
    };
  }

  function destroy() {
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
    document.getElementById("minibia-bot-waypoint-profiles-section")?.remove();
  }

  bot.waypointProfiles = {
    refreshManifest,
    loadProfile,
    exportCurrentRoute,
    status,
    destroy,
  };

  state.uiTimerId = window.setInterval(() => { ensureUi(); refreshUiValues(); }, 1000);
  bot.addCleanup(destroy);
  ensureUi();
  refreshManifest();

  return bot.waypointProfiles;
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installEquipRingModule = function installEquipRingModule(bot) {
  const configStorageKey = "minibiaBot.equipRing.config";
  const RING_SLOT = 8;
  const PZ_FLAG = 1;
  const ALLOWED_RINGS = [
    { name: "ring of healing", priority: 1 },
    { name: "life ring", priority: 2 },
  ];
  const state = {
    running: false,
    timerId: null,
    lastEquipAt: 0,
    lastUnequipAt: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 1000,
      equipCooldownMs: 1500,
      unequipCooldownMs: 1500,
      unequipInProtectionZone: true,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 1000;
  config.unequipInProtectionZone = config.unequipInProtectionZone !== false;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getEquipment() {
    return window.gameClient?.player?.equipment || null;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDefinition(item) {
    if (!item) return null;

    const cid = item.cid ?? item.id;
    const sid = item.sid ?? item.id;
    return (
      window.gameClient?.itemDefinitionsByCid?.[cid] ||
      window.gameClient?.itemDefinitionsBySid?.[sid] ||
      window.gameClient?.itemDefinitions?.[item.id] ||
      window.gameClient?.itemDefinitions?.[cid] ||
      window.gameClient?.itemDefinitions?.[sid] ||
      null
    );
  }

  function getItemName(item) {
    const definition = getItemDefinition(item);
    return definition?.properties?.name || item?.name || "";
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function getAllowedRingInfo(item) {
    const itemName = normalizeName(getItemName(item));
    if (!itemName) return null;
    return ALLOWED_RINGS.find((ring) => itemName === ring.name || itemName.includes(ring.name)) || null;
  }

  function isRingItem(item) {
    return !!getAllowedRingInfo(item);
  }

  function getEquippedRing() {
    const equipment = getEquipment();
    return equipment?.getSlotItem?.(RING_SLOT) || null;
  }

  function hasEquippedRing() {
    return !!getEquippedRing();
  }

  function getLoadedTiles() {
    return bot.pz?.getLoadedTiles?.() || [];
  }

  function isPlayerInProtectionZone() {
    const position = bot.getPlayerPosition?.();
    if (!position) return false;
    return getLoadedTiles().some((tile) => {
      const tilePosition = tile?.__position;
      return tilePosition &&
        tilePosition.x === position.x &&
        tilePosition.y === position.y &&
        tilePosition.z === position.z &&
        ((tile.flags || 0) & PZ_FLAG) !== 0;
    });
  }

  function findFirstEmptyContainerSlot() {
    for (const container of getOpenContainers()) {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        if (!container.getSlotItem?.(slotIndex)) {
          return { container, slotIndex };
        }
      }
    }
    return null;
  }

  function findBestRingSource() {
    const equipment = getEquipment();
    if (!equipment) {
      return null;
    }

    let best = null;

    const consider = (container, slotIndex, item) => {
      const allowedRing = getAllowedRingInfo(item);
      if (!allowedRing) {
        return;
      }

      const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
      const candidate = {
        container,
        slotIndex,
        item,
        count,
        name: getItemName(item),
        priority: allowedRing.priority,
      };

      if (!best || candidate.priority < best.priority || (candidate.priority === best.priority && candidate.count > best.count)) {
        best = candidate;
      }
    };

    const equipmentSlots = equipment?.slots || [];
    for (let slotIndex = 0; slotIndex < equipmentSlots.length; slotIndex += 1) {
      if (slotIndex === RING_SLOT) continue;
      consider(equipment, slotIndex, equipment.getSlotItem?.(slotIndex));
    }

    for (const container of getOpenContainers()) {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        consider(container, slotIndex, container.getSlotItem?.(slotIndex));
      }
    }

    return best;
  }

  function canUnequipRingInProtectionZone(now = Date.now()) {
    if (!config.enabled || !config.unequipInProtectionZone || !isPlayerInProtectionZone()) return false;
    if (now - state.lastUnequipAt < (config.unequipCooldownMs || 1500)) return false;
    const equippedRing = getEquippedRing();
    return !!getAllowedRingInfo(equippedRing) && !!findFirstEmptyContainerSlot();
  }

  function tryUnequipRingInProtectionZone(now = Date.now()) {
    if (!canUnequipRingInProtectionZone(now)) return false;
    const equipment = getEquipment();
    const equippedRing = getEquippedRing();
    const destination = findFirstEmptyContainerSlot();
    if (!equipment || !equippedRing || !destination) return false;

    const from = { which: equipment, index: RING_SLOT };
    const to = { which: destination.container, index: destination.slotIndex };
    const count = (typeof equippedRing.getCount === "function" ? equippedRing.getCount() : equippedRing.count) || 1;

    window.gameClient.send(new ItemMovePacket(from, to, count));
    state.lastUnequipAt = now;
    bot.log("unequipped ring in protection zone", {
      name: getItemName(equippedRing),
      toContainerId: destination.container?.__containerId ?? null,
      toSlot: destination.slotIndex,
    });
    return true;
  }

  function getGateStatus(now = Date.now()) {
    const equipment = getEquipment();
    const source = findBestRingSource();
    const inProtectionZone = isPlayerInProtectionZone();
    const cooldownRemainingMs = Math.max(0, config.equipCooldownMs - (now - state.lastEquipAt));
    const unequipCooldownRemainingMs = Math.max(0, (config.unequipCooldownMs || 1500) - (now - state.lastUnequipAt));

    return {
      hasEquipment: !!equipment,
      hasRingEquipped: hasEquippedRing(),
      hasRingAvailable: !!source,
      inProtectionZone,
      cooldownReady: cooldownRemainingMs === 0,
      cooldownRemainingMs,
      unequipCooldownRemainingMs,
      source,
      canEquip: !!equipment && !inProtectionZone && !hasEquippedRing() && !!source && cooldownRemainingMs === 0,
      canUnequipInProtectionZone: canUnequipRingInProtectionZone(now),
    };
  }

  function canEquipRing(now = Date.now()) {
    return getGateStatus(now).canEquip;
  }

  function tryEquipRing(now = Date.now()) {
    if (!config.enabled || !canEquipRing(now)) {
      return false;
    }

    const equipment = getEquipment();
    const source = findBestRingSource();
    if (!equipment || !source) {
      return false;
    }

    const from = {
      which: source.container,
      index: source.slotIndex,
    };
    const to = {
      which: equipment,
      index: RING_SLOT,
    };
    const count = source.count || 1;

    window.gameClient.send(new ItemMovePacket(from, to, count));
    state.lastEquipAt = now;
    bot.log("equipped ring", {
      name: source.name,
      priority: source.priority,
      fromContainerId: source.container?.__containerId ?? null,
      fromSlot: source.slotIndex,
    });
    return true;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      if (!tryUnequipRingInProtectionZone()) {
        tryEquipRing();
      }
    } catch (error) {
      bot.log("equip ring tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 1000;
    config.unequipInProtectionZone = config.unequipInProtectionZone !== false;
    persistConfig();

    if (state.running) {
      bot.log("equip ring already running");
      return false;
    }

    state.running = true;
    attachResumeListeners();
    bot.log("equip ring started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("equip ring stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      equippedRing: getEquippedRing(),
      lastEquipAt: state.lastEquipAt,
      lastUnequipAt: state.lastUnequipAt,
      allowedRings: ALLOWED_RINGS.map((ring) => ring.name),
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    config.tickMs = 1000;
    config.unequipInProtectionZone = config.unequipInProtectionZone !== false;
    persistConfig();
    bot.log("equip ring config updated", { ...config });
    return { ...config };
  }

  bot.equipRing = {
    start,
    stop,
    status,
    updateConfig,
    config,
    getEquippedRing,
    hasEquippedRing,
    findBestRingSource,
    getGateStatus,
    canEquipRing,
    tryEquipRing,
    isPlayerInProtectionZone,
    tryUnequipRingInProtectionZone,
  };

  if (config.enabled) {
    start();
  }
};window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAutoEatModule = function installAutoEatModule(bot) {
  const configStorageKey = "minibiaBot.eat.config";
  const state = {
    running: false,
    timerId: null,
    lastFoodAt: 0,
    lastTimedEatAt: 0,
    panelObserver: null,
  };

  const config = Object.assign(
    {
      tickMs: 5000,
      eatCooldownMs: 60000,
      eatHotbarSlot: 10,
      timedEatEnabled: false,
      timedEatIntervalMs: 600000,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 5000;
  config.timedEatEnabled = !!config.timedEatEnabled;
  config.timedEatIntervalMs = Math.max(60000, Number(config.timedEatIntervalMs) || 600000);

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeHotbarSlot(slot) {
    const value = Number(slot);
    if (!Number.isFinite(value)) {
      return null;
    }

    const normalized = Math.trunc(value);
    if (normalized < 1 || normalized > 12) {
      return null;
    }

    return normalized;
  }

  function normalizeTimedEatIntervalMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 600000;
    return Math.max(60000, Math.trunc(numeric));
  }

  function readFoodTimer() {
    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    if (!foodText) return null;

    const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
    return match
      ? {
          text: foodText,
          seconds: Number(match[1]) * 60 + Number(match[2]),
        }
      : { text: foodText, seconds: null };
  }

  function isSated() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;

    if (conditions?.has && conditions.SATED != null) {
      return conditions.has(conditions.SATED);
    }

    const food = readFoodTimer();
    if (food?.seconds != null) {
      return food.seconds > 0;
    }

    return true;
  }

  function useFoodHotbar(reason) {
    const slot = normalizeHotbarSlot(config.eatHotbarSlot);
    if (!slot) {
      return false;
    }

    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      const now = Date.now();
      state.lastFoodAt = now;
      state.lastTimedEatAt = now;
      bot.log("used eat hotkey", { slot, reason });
    }
    return clicked;
  }

  function tryEat() {
    if (!config.enabled) {
      return false;
    }

    if (isSated()) {
      return false;
    }

    if (Date.now() - state.lastFoodAt < config.eatCooldownMs) {
      return false;
    }

    return useFoodHotbar("food timer / sated check");
  }

  function tryTimedEat() {
    if (!config.enabled || !config.timedEatEnabled) {
      return false;
    }

    const now = Date.now();
    const intervalMs = normalizeTimedEatIntervalMs(config.timedEatIntervalMs);

    if (!state.lastTimedEatAt) {
      state.lastTimedEatAt = now;
      return false;
    }

    if (now - state.lastTimedEatAt < intervalMs) {
      return false;
    }

    if (now - state.lastFoodAt < config.eatCooldownMs) {
      return false;
    }

    const clicked = useFoodHotbar("timed fallback");
    if (!clicked) {
      // Avoid retrying every one-second tick if the hotbar click is temporarily unavailable.
      state.lastTimedEatAt = now;
    }
    return clicked;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      const ateFromStatus = tryEat();
      if (!ateFromStatus) {
        tryTimedEat();
      }
    } catch (error) {
      bot.log("auto eat tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 5000;
    config.timedEatEnabled = !!config.timedEatEnabled;
    config.timedEatIntervalMs = normalizeTimedEatIntervalMs(config.timedEatIntervalMs);
    if (config.timedEatEnabled && !state.lastTimedEatAt) {
      state.lastTimedEatAt = Date.now();
    }
    persistConfig();

    if (state.running) {
      bot.log("auto eat already running");
      return false;
    }

    state.running = true;
    bot.log("auto eat started", {
      eatCooldownMs: config.eatCooldownMs,
      eatHotbarSlot: config.eatHotbarSlot,
      timedEatEnabled: config.timedEatEnabled,
      timedEatIntervalMs: config.timedEatIntervalMs,
    });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("auto eat stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      lastFoodAt: state.lastFoodAt,
      lastTimedEatAt: state.lastTimedEatAt,
      isSated: isSated(),
    };
  }

  function updateConfig(nextConfig = {}) {
    const previousTimedEatEnabled = !!config.timedEatEnabled;

    if (Object.prototype.hasOwnProperty.call(nextConfig, "eatHotbarSlot")) {
      nextConfig.eatHotbarSlot = normalizeHotbarSlot(nextConfig.eatHotbarSlot) ?? config.eatHotbarSlot;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "eatCooldownMs")) {
      nextConfig.eatCooldownMs = Math.max(0, Number(nextConfig.eatCooldownMs) || 0);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "timedEatEnabled")) {
      nextConfig.timedEatEnabled = !!nextConfig.timedEatEnabled;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "timedEatIntervalMs")) {
      nextConfig.timedEatIntervalMs = normalizeTimedEatIntervalMs(nextConfig.timedEatIntervalMs);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 5000;
    config.timedEatIntervalMs = normalizeTimedEatIntervalMs(config.timedEatIntervalMs);

    if (config.timedEatEnabled && !previousTimedEatEnabled) {
      state.lastTimedEatAt = Date.now();
    }

    persistConfig();
    refreshTimedEatControls();
    bot.log("auto eat config updated", { ...config });
    return { ...config };
  }

  function refreshTimedEatControls() {
    const enabledInput = document.getElementById("minibia-bot-auto-eat-timer-enabled");
    const minutesInput = document.getElementById("minibia-bot-auto-eat-timer-minutes");
    if (enabledInput) enabledInput.checked = !!config.timedEatEnabled;
    if (minutesInput && minutesInput !== document.activeElement) {
      minutesInput.value = String(Math.max(1, Math.round(config.timedEatIntervalMs / 60000)));
      minutesInput.disabled = !config.timedEatEnabled;
    }
  }

  function installTimedEatControls() {
    if (document.getElementById("minibia-bot-auto-eat-timer-enabled")) {
      refreshTimedEatControls();
      return true;
    }

    const autoEatToggle = document.getElementById("minibia-bot-auto-eat-enabled");
    const autoEatLabel = autoEatToggle?.closest?.("label");
    const stack = autoEatLabel?.parentElement;
    if (!autoEatLabel || !stack) return false;

    const timerToggleLabel = document.createElement("label");
    timerToggleLabel.className = "mb-toggle";
    timerToggleLabel.innerHTML = '<input type="checkbox" id="minibia-bot-auto-eat-timer-enabled" /><span>Timed Auto Eat</span>';

    const timerField = document.createElement("label");
    timerField.className = "mb-field";
    timerField.id = "minibia-bot-auto-eat-timer-field";
    timerField.innerHTML = '<span class="mb-field-label">Eat Every (minutes)</span><input type="number" id="minibia-bot-auto-eat-timer-minutes" min="1" step="1" inputmode="numeric" /><span class="mb-small-note">While Auto Eat is enabled, this also presses the food hotkey on this interval. The normal 00:00 check still works.</span>';

    autoEatLabel.insertAdjacentElement("afterend", timerToggleLabel);
    timerToggleLabel.insertAdjacentElement("afterend", timerField);

    const enabledInput = timerToggleLabel.querySelector("#minibia-bot-auto-eat-timer-enabled");
    const minutesInput = timerField.querySelector("#minibia-bot-auto-eat-timer-minutes");

    enabledInput?.addEventListener("change", () => {
      updateConfig({ timedEatEnabled: !!enabledInput.checked });
    });

    const saveMinutes = () => {
      const minutes = Math.max(1, Math.trunc(Number(minutesInput?.value) || 1));
      if (minutesInput) minutesInput.value = String(minutes);
      updateConfig({ timedEatIntervalMs: minutes * 60000 });
    };
    minutesInput?.addEventListener("change", saveMinutes);
    minutesInput?.addEventListener("blur", saveMinutes);

    refreshTimedEatControls();
    return true;
  }

  function watchForPanel() {
    if (installTimedEatControls()) return;
    if (state.panelObserver) return;

    state.panelObserver = new MutationObserver(() => {
      if (!installTimedEatControls()) return;
      state.panelObserver?.disconnect();
      state.panelObserver = null;
    });
    state.panelObserver.observe(document.documentElement, { childList: true, subtree: true });
    bot.addCleanup?.(() => {
      state.panelObserver?.disconnect();
      state.panelObserver = null;
    });
  }

  if (config.enabled) {
    start();
  }

  bot.eat = {
    start,
    stop,
    status,
    updateConfig,
    isSated,
    tryEat,
    tryTimedEat,
    normalizeHotbarSlot,
    config,
  };

  bot.startAutoEat = start;
  bot.stopAutoEat = stop;

  if (bot.rune) {
    bot.rune.startAutoEat = start;
    bot.rune.stopAutoEat = stop;
    bot.rune.tryEat = tryEat;
    bot.rune.isSated = isSated;
  }

  watchForPanel();
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installTalkModule = function installTalkModule(bot) {
  const configStorageKey = "minibiaBot.talk.config";
  const legacyDefaultModels = ["gemini-3-pro-preview", "gemini-2.0-flash"];
  const defaultModel = "gemini-2.5-flash-lite";
  const defaultSystemPrompt =
    "You are a normal Tibia MMORPG player chatting in Minibia in live in-game chat. Every reply must sound like Tibia player chat: casual, brief, informal, fully lowercase, and natural for a real player typing quickly. Use plain text only. Keep it under 90 characters and under 12 words. Prefer short Tibia-style phrasing, light slang, abbreviations, and simple punctuation when natural. Avoid polished grammar, title case, or assistant-like wording. Write like someone typing mid-hunt or while afk for a sec. Never say you are a bot or AI.";
  const defaultGreetingPrompt =
    "Respond to greetings like a Tibia MMORPG player in chat. Be short, casual, friendly, and in-character for fast Tibia-style game chat. Use lowercase. One sentence only. Plain text only.";
  const defaultQuestionPrompt =
    "Respond to questions like a Tibia MMORPG player in chat, but stay vague and noncommittal. Keep it brief, casual, and a little evasive. Use lowercase and do not explain much. One short sentence only. Plain text only. If asked whether you are a bot, reply with no.";
  const defaultStatementPrompt =
    "Respond to statements like a Tibia MMORPG player in chat. Keep it short, casual, reactive, and natural for live Tibia-style game chat. Use lowercase. One sentence only. Plain text only.";
  const minPollMs = 1000;
  const maxMessageAgeMs = 2 * 60 * 1000;
  const state = {
    running: false,
    pending: false,
    timerId: null,
    lastReplyAt: 0,
    seenKeys: [],
    seenSignatures: [],
  };
  const greetingReplies = ["yo", "sup", "hey", "hiya", "yo lol"];
  const agreeReplies = ["true", "fr", "based", "ya", "real"];
  const vagueQuestionReplies = ["maybe", "not sure", "hard to say", "could be"];
  const denyBotReplies = ["no", "nope", "nah"];

  const config = Object.assign(
    {
      enabled: false,
      apiKey: "",
      model: defaultModel,
      pollMs: minPollMs,
      replyCooldownMs: 1500,
      systemPrompt: defaultSystemPrompt,
      greetingPrompt: defaultGreetingPrompt,
      questionPrompt: defaultQuestionPrompt,
      statementPrompt: defaultStatementPrompt,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function sanitizeConfig() {
    config.apiKey = String(config.apiKey || "").trim();
    config.model = String(config.model || defaultModel).trim() || defaultModel;
    if (legacyDefaultModels.includes(config.model)) {
      config.model = defaultModel;
    }
    config.pollMs = Math.max(minPollMs, Number(config.pollMs) || minPollMs);
    config.replyCooldownMs = Math.max(0, Number(config.replyCooldownMs) || 1500);
    config.systemPrompt = String(config.systemPrompt || defaultSystemPrompt).trim() || defaultSystemPrompt;
    config.greetingPrompt = String(config.greetingPrompt || defaultGreetingPrompt).trim() || defaultGreetingPrompt;
    config.questionPrompt = String(config.questionPrompt || defaultQuestionPrompt).trim() || defaultQuestionPrompt;
    config.statementPrompt = String(config.statementPrompt || defaultStatementPrompt).trim() || defaultStatementPrompt;
  }

  function trimSeen() {
    const maxSeenEntries = 200;
    if (state.seenKeys.length > maxSeenEntries) {
      state.seenKeys = state.seenKeys.slice(-maxSeenEntries);
    }

    if (state.seenSignatures.length > maxSeenEntries) {
      state.seenSignatures = state.seenSignatures.slice(-maxSeenEntries);
    }
  }

  function getSelfNames() {
    return new Set(
      ["you", bot.getPlayerName?.(), window.gameClient?.player?.name, window.gameClient?.player?.state?.name]
        .map((name) => normalizeText(name))
        .filter(Boolean)
    );
  }

  function extractSenderFromMessage(message) {
    const text = String(message || "").trim();
    if (!text) {
      return { sender: null, body: "" };
    }

    const patterns = [
      /^\[[^\]]+\]\s*([^:\n]{2,40}):\s+(.+)$/i,
      /^([^:\n]{2,40}):\s+(.+)$/i,
      /^([^:\n]{2,40})\s+says:\s+(.+)$/i,
      /^From\s+([^:\n]{2,40}):\s+(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          sender: String(match[1] || "").trim() || null,
          body: String(match[2] || "").trim(),
        };
      }
    }

    return { sender: null, body: text };
  }

  function getRawChatEntries() {
    return (window.gameClient?.interface?.channelManager?.channels || []).flatMap((channel) =>
      (channel?.__contents || []).map((entry, index) => ({
        channelName: channel?.name || null,
        entry,
        index,
      }))
    );
  }

  function toChatMessage(rawEntry) {
    const entry = rawEntry?.entry || {};
    const rawMessage = String(entry?.message || entry?.text || "").trim();
    const parsed = extractSenderFromMessage(rawMessage);
    const sender =
      String(entry?.author || entry?.sender || entry?.name || parsed.sender || "").trim() || null;
    const body = String(entry?.text || parsed.body || rawMessage).trim();
    const time = entry?.__time || entry?.time || null;
    const senderType = entry?.type;
    const key = [
      rawEntry?.channelName || "",
      time || "",
      sender || "",
      rawMessage || "",
      rawEntry?.index || 0,
    ].join("|");

    return {
      key,
      channelName: rawEntry?.channelName || null,
      sender,
      body,
      rawMessage,
      time,
      senderType,
    };
  }

  function getChatMessages() {
    return getRawChatEntries().map(toChatMessage).filter((message) => message.body);
  }

  function getMessageTimestamp(message) {
    const rawTime = message?.time;
    if (typeof rawTime === "number" && Number.isFinite(rawTime)) {
      return rawTime < 1e12 ? rawTime * 1000 : rawTime;
    }

    if (rawTime instanceof Date) {
      return rawTime.getTime();
    }

    const parsed = Date.parse(String(rawTime || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getMessageSignature(message) {
    return [
      normalizeText(message?.channelName),
      normalizeText(message?.sender),
      normalizeText(message?.body || message?.rawMessage),
      String(getMessageTimestamp(message) || ""),
    ].join("|");
  }

  function hasSeenMessage(message) {
    return state.seenKeys.includes(message?.key) || state.seenSignatures.includes(getMessageSignature(message));
  }

  function rememberSeenMessage(message) {
    if (!message) {
      return;
    }

    if (message.key && !state.seenKeys.includes(message.key)) {
      state.seenKeys.push(message.key);
    }

    const signature = getMessageSignature(message);
    if (signature && !state.seenSignatures.includes(signature)) {
      state.seenSignatures.push(signature);
    }

    trimSeen();
  }

  function rememberSeenMessages(messages) {
    messages.forEach((message) => rememberSeenMessage(message));
  }

  function isSelfMessage(message) {
    if (getSelfNames().has(normalizeText(message?.sender))) {
      return true;
    }

    return [message?.body, message?.rawMessage].some((text) => bot.isRecentSentChat?.(text, 20000));
  }

  function isTrustedSender(message) {
    const senderName = normalizeText(message?.sender);
    if (!senderName) {
      return false;
    }

    const trustedNames = bot.panic?.getTrustedNames?.() || [];
    return trustedNames.includes(senderName);
  }

  function isNpcMessage(message) {
    const npcType = window.CONST?.TYPES?.NPC;
    return npcType != null && message?.senderType === npcType;
  }

  function isWithinVisibleRange(me, pos) {
    if (!me || !pos) {
      return false;
    }

    const dx = Math.abs(pos.x - me.x);
    const dy = Math.abs(pos.y - me.y);
    return dx <= 8 && dy <= 6;
  }

  function isSenderVisiblePlayer(message) {
    const me = bot.getPlayerPosition?.();
    const myId = window.gameClient?.player?.id;
    const senderName = normalizeText(message?.sender);
    const playerType = window.CONST?.TYPES?.PLAYER;

    if (!me || !senderName || playerType == null) {
      return false;
    }

    return Object.values(window.gameClient?.world?.activeCreatures || {}).some((creature) => {
      if (!creature) {
        return false;
      }

      if (creature.id === myId || creature.type !== playerType) {
        return false;
      }

      if (normalizeText(creature.name) !== senderName) {
        return false;
      }

      return isWithinVisibleRange(me, creature.__position);
    });
  }

  function getDefaultMessages() {
    return getChatMessages().filter((message) => message.channelName === "Default");
  }

  function getNewestPendingMessage() {
    const pendingMessages = getDefaultMessages().filter((message) => {
      if (!message?.body || !message?.key) {
        return false;
      }

      if (hasSeenMessage(message)) {
        return false;
      }

      if (!message.sender || isSelfMessage(message) || isNpcMessage(message) || isTrustedSender(message)) {
        rememberSeenMessage(message);
        return false;
      }

      const timestamp = getMessageTimestamp(message);
      if (timestamp && Date.now() - timestamp > maxMessageAgeMs) {
        rememberSeenMessage(message);
        return false;
      }

      return true;
    });

    if (!pendingMessages.length) {
      return null;
    }

    return {
      targetMessage: pendingMessages[pendingMessages.length - 1],
      pendingMessages,
    };
  }

  function buildClassifierPrompt(targetMessage, contextMessages) {
    const transcript = contextMessages
      .map((message) => `${message.sender || "player"}: ${message.body}`)
      .join("\n");

    return [
      "Channel: Default",
      "Recent chat:",
      transcript || "(none)",
      "",
      `Last message from ${targetMessage.sender}: ${targetMessage.body}`,
      "Classify the last message as exactly one label:",
      "greeting",
      "question",
      "statement",
      "Reply with the label only.",
    ].join("\n");
  }

  function getTypePrompt(messageType) {
    if (messageType === "greeting") {
      return config.greetingPrompt;
    }

    if (messageType === "question") {
      return config.questionPrompt;
    }

    return config.statementPrompt;
  }

  function buildReplyPrompt(targetMessage, contextMessages, messageType) {
    const transcript = contextMessages
      .map((message) => `${message.sender || "player"}: ${message.body}`)
      .join("\n");

    return [
      config.systemPrompt,
      getTypePrompt(messageType),
      "",
      "Channel: Default",
      `Message type: ${messageType}`,
      "Recent chat:",
      transcript || "(none)",
      "",
      `Last message from ${targetMessage.sender}: ${targetMessage.body}`,
      "Reply with one short sentence only.",
      "Avoid repeating the same wording again and again.",
      "Reply text only:",
    ].join("\n");
  }

  async function generateText(prompt, generationConfig = {}) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: Object.assign(
            {
              temperature: 0.9,
              topP: 0.95,
              maxOutputTokens: 40,
            },
            generationConfig
          ),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return (
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => String(part?.text || ""))
        .join(" ")
        .trim() || ""
    );
  }

  async function classifyMessageType(targetMessage, contextMessages) {
    const rawType = normalizeText(
      await generateText(buildClassifierPrompt(targetMessage, contextMessages), {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 8,
      })
    );

    if (rawType === "greeting" || rawType === "question" || rawType === "statement") {
      return rawType;
    }

    if (isGreeting(targetMessage?.body)) {
      return "greeting";
    }

    if (/\?/.test(String(targetMessage?.body || ""))) {
      return "question";
    }

    return "statement";
  }

  function sanitizeReply(text) {
    const singleLine = String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();

    if (!singleLine) {
      return "";
    }

    const firstSentence = singleLine.split(/(?<=[.!?])\s+/)[0] || singleLine;
    const trimmed = firstSentence.slice(0, 90).trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed === "?") {
      return bot.isRecentSentChat?.("?", 20000) ? "" : "?";
    }

    const styled = trimmed
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\bi am\b/g, "im")
      .replace(/\byou are\b/g, "youre")
      .replace(/\bdo not\b/g, "dont")
      .replace(/\bcannot\b/g, "cant")
      .replace(/\bgoing to\b/g, "gonna")
      .replace(/\bwant to\b/g, "wanna")
      .replace(/\s+([,.!?])/g, "$1")
      .replace(/([!?.,]){2,}/g, "$1")
      .trim();

    const normalized = normalizeText(styled);
    if (!normalized || /^[^a-z0-9]+$/i.test(styled)) {
      return "";
    }

    if (/\b(bot|ai|assistant|language model|automation|script)\b/i.test(styled)) {
      return "";
    }

    if (bot.isRecentSentChat?.(styled, 20000)) {
      return "";
    }

    return styled;
  }

  function pickUnusedReply(replies, withinMs = 30000, fallback = "?") {
    for (const reply of replies) {
      if (!bot.isRecentSentChat?.(reply, withinMs)) {
        return reply;
      }
    }

    return fallback;
  }

  function isGreeting(text) {
    return /^(hi|hey|yo|sup|howdy|hello|hiya)\b/i.test(String(text || "").trim());
  }

  function isBotQuestion(text) {
    return /\b(are you|u)\b.*\bbot\b|\bbot\b.*\?|\bare you a bot\b/i.test(String(text || ""));
  }

  function isSimpleReaction(text) {
    return /^(based|true|real|lol|lmao|xd|nice|ok|kk|k)\b[!.?]*$/i.test(String(text || "").trim());
  }

  function pickFallbackReply(targetMessage, messageType) {
    const messageText = String(targetMessage?.body || "").trim();

    if (isBotQuestion(messageText)) {
      return pickUnusedReply(denyBotReplies, 30000, "no");
    }

    if (messageType === "greeting" || isGreeting(messageText)) {
      return pickUnusedReply(greetingReplies, 15000, "yo");
    }

    if (isSimpleReaction(messageText)) {
      return pickUnusedReply(agreeReplies, 15000, "true");
    }

    if (messageType === "question" || /\?$/.test(messageText)) {
      return pickUnusedReply(vagueQuestionReplies, 20000, "maybe");
    }

    return pickUnusedReply(["lol", "maybe", "ya", "true", "kinda"], 30000, "lol");
  }

  async function maybeRespond() {
    if (!state.running || state.pending || !config.enabled || !config.apiKey) {
      return false;
    }

    if (Date.now() - state.lastReplyAt < config.replyCooldownMs) {
      return false;
    }

    const pending = getNewestPendingMessage();
    if (!pending?.targetMessage) {
      return false;
    }

    state.pending = true;

    try {
      const contextMessages = getDefaultMessages().slice(-6);
      if (!isSenderVisiblePlayer(pending.targetMessage)) {
        rememberSeenMessages(pending.pendingMessages);
        bot.log("talk skipped reply", {
          sender: pending.targetMessage.sender,
          message: pending.targetMessage.body,
          reason: "sender-not-visible",
        });
        return false;
      }

      const messageType = await classifyMessageType(pending.targetMessage, contextMessages);
      const rawReply = isBotQuestion(pending.targetMessage.body)
        ? "no"
        : await generateText(buildReplyPrompt(pending.targetMessage, contextMessages, messageType));
      const reply = sanitizeReply(rawReply) || pickFallbackReply(pending.targetMessage, messageType);

      rememberSeenMessages(pending.pendingMessages);

      if (!reply) {
        bot.log("talk skipped reply", {
          sender: pending.targetMessage.sender,
          message: pending.targetMessage.body,
          messageType,
          rawReply,
        });
        return false;
      }

      const sent = bot.sendChat(reply);
      if (sent) {
        state.lastReplyAt = Date.now();
        bot.log("talk replied", {
          sender: pending.targetMessage.sender,
          message: pending.targetMessage.body,
          messageType,
          reply,
        });
      }

      return sent;
    } finally {
      state.pending = false;
    }
  }

  function scheduleNextTick() {
    if (!state.running) {
      return;
    }

    state.timerId = window.setTimeout(async () => {
      try {
        await maybeRespond();
      } catch (error) {
        bot.log("talk request failed", error?.message || error);
      }

      scheduleNextTick();
    }, config.pollMs);
  }

  function seedSeenMessages() {
    rememberSeenMessages(getDefaultMessages());
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    sanitizeConfig();
    persistConfig();

    if (!config.apiKey) {
      bot.log("talk module requires a Gemini API key");
      return false;
    }

    if (state.running) {
      return false;
    }

    state.running = true;
    seedSeenMessages();
    bot.log("talk module started", {
      model: config.model,
      channel: "Default",
    });
    scheduleNextTick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    return true;
  }

  function status() {
    return {
      running: state.running,
      pending: state.pending,
      lastReplyAt: state.lastReplyAt,
      config: {
        ...config,
        apiKey: config.apiKey ? "***configured***" : "",
      },
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    sanitizeConfig();
    persistConfig();
    return status().config;
  }

  sanitizeConfig();

  if (config.enabled && config.apiKey) {
    start();
  }

  bot.talk = {
    start,
    stop,
    status,
    updateConfig,
    getChatMessages,
    config,
  };
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installQuickControlsSettingsModule = function installQuickControlsSettingsModule(bot) {
  if (!bot || bot.quickControlsSettings?.destroy) return bot?.quickControlsSettings;

  let observer = null;
  const runeV2StorageKey = "minibiaBot.runeV2.config";
  const runeV2State = {
    running: false,
    timerId: null,
    lastActivationAt: 0,
  };
  const runeV2Config = Object.assign(
    {
      manaCost: 600,
      hotkey: "1",
      cooldownMs: 3500,
      enabled: false,
    },
    bot.storage.get(runeV2StorageKey, {})
  );

  // A saved profile can restore enabled=true before the Rune 2.0 checkbox is
  // installed. Do not auto-start from persisted config alone; the checkbox
  // change handler is the source of truth for starting/stopping the runtime.
  const runeV2SavedEnabled = runeV2Config.enabled === true;
  runeV2Config.enabled = false;

  delete runeV2Config.spellName;

  function removeLegacyRuneMakerUi() {
    document.getElementById("minibia-bot-rune-settings")?.remove();
    document.getElementById("minibia-bot-rune-enabled")?.closest?.("label")?.remove();
    document.getElementById("minibia-bot-rune-v2-spell-name")?.closest?.("label")?.remove();
    document.getElementById("minibia-bot-rune-v2-spell-name")?.remove?.();

    document.querySelectorAll("#minibia-bot-rune-v2-settings .mb-field").forEach((field) => {
      const label = String(field.querySelector?.(".mb-field-label")?.textContent || "")
        .trim()
        .toLowerCase();
      if (label === "rune 2.0 spell name" || label === "spell name") field.remove();
    });
  }

  function disableLegacyRuneMaker() {
    try {
      bot.rune?.stop?.();
      bot.rune?.updateConfig?.({ enabled: false });
    } catch (error) {
      bot.log?.("failed to disable legacy rune maker", error?.message || error);
    }
  }

  function clampHotbarSlot(value, fallback = 10) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 1 && numeric <= 12 ? numeric : fallback;
  }

  function clampManaCost(value, fallback = 600) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
  }

  function normalizeRuneV2Hotkey(value, fallback = "1") {
    const text = String(value ?? "").trim().toUpperCase();
    const match = text.match(/^F?(1[0-2]|[1-9])$/);
    if (match) return match[1];

    const fallbackText = String(fallback ?? "1").trim().toUpperCase();
    const fallbackMatch = fallbackText.match(/^F?(1[0-2]|[1-9])$/);
    return fallbackMatch ? fallbackMatch[1] : "1";
  }

  function persistRuneV2Config() {
    bot.storage.set(runeV2StorageKey, { ...runeV2Config });
  }

  function getRuneV2GateStatus(now = Date.now()) {
    const stats = bot.rune?.readStats?.();
    const mana = stats?.mana;
    const nearbyMonsters = bot.hasteParalyzeMonsterRangeGuard?.getMonstersWithinRange?.(4) || [];
    const monsterSafe = nearbyMonsters.length === 0;
    if (!mana) {
      return {
        hasStats: false,
        enoughHp: true,
        enoughMana: false,
        cooldownReady: false,
        cooldownRemainingMs: runeV2Config.cooldownMs,
        monsterSafe,
        nearbyMonsterCount: nearbyMonsters.length,
        canActivate: false,
      };
    }

    const enoughMana = mana.current >= runeV2Config.manaCost;
    const elapsedMs = now - runeV2State.lastActivationAt;
    const cooldownRemainingMs = Math.max(0, runeV2Config.cooldownMs - elapsedMs);
    const cooldownReady = cooldownRemainingMs === 0;

    return {
      hasStats: true,
      enoughHp: true,
      enoughMana,
      cooldownReady,
      cooldownRemainingMs,
      monsterSafe,
      nearbyMonsterCount: nearbyMonsters.length,
      canActivate: enoughMana && cooldownReady && monsterSafe,
    };
  }

  function tryRuneV2(now = Date.now()) {
    if (!runeV2State.running || !runeV2Config.enabled) return false;
    const gate = getRuneV2GateStatus(now);
    if (!gate.canActivate) return false;

    const slot = Number(normalizeRuneV2Hotkey(runeV2Config.hotkey, "1"));
    const clicked = bot.clickHotbar?.(slot - 1) === true;
    if (!clicked) return false;

    runeV2State.lastActivationAt = Date.now();
    bot.log("rune spell 2.0 hotkey activated", {
      manaCost: runeV2Config.manaCost,
      hotkey: slot,
    });
    return true;
  }

  function scheduleRuneV2Tick() {
    if (!runeV2State.running || !runeV2Config.enabled) return;
    if (runeV2State.timerId != null) window.clearTimeout(runeV2State.timerId);
    runeV2State.timerId = window.setTimeout(() => {
      runeV2State.timerId = null;
      if (!runeV2State.running || !runeV2Config.enabled) return;
      try {
        tryRuneV2();
      } catch (error) {
        bot.log("rune spell 2.0 tick failed", error?.message || error);
      } finally {
        scheduleRuneV2Tick();
      }
    }, 1000);
  }

  function startRuneV2(overrides = {}) {
    updateRuneV2Config({ ...overrides, enabled: true });
    if (runeV2State.running) return false;
    runeV2State.running = true;
    scheduleRuneV2Tick();
    bot.log("rune spell 2.0 started", { ...runeV2Config });
    return true;
  }

  function stopRuneV2(options = {}) {
    runeV2State.running = false;
    runeV2Config.enabled = false;
    if (runeV2State.timerId != null) {
      window.clearTimeout(runeV2State.timerId);
      runeV2State.timerId = null;
    }
    if (options.persistEnabled !== false) {
      persistRuneV2Config();
    }
    bot.log("rune spell 2.0 stopped");
    return true;
  }

  function updateRuneV2Config(nextConfig = {}) {
    const normalized = { ...nextConfig };
    delete normalized.spellName;
    if (Object.prototype.hasOwnProperty.call(normalized, "manaCost")) {
      normalized.manaCost = clampManaCost(normalized.manaCost, runeV2Config.manaCost ?? 600);
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "hotkey")) {
      normalized.hotkey = normalizeRuneV2Hotkey(normalized.hotkey, runeV2Config.hotkey ?? "1");
    }
    if (Object.prototype.hasOwnProperty.call(normalized, "cooldownMs")) {
      normalized.cooldownMs = Math.max(0, Math.trunc(Number(normalized.cooldownMs) || 0));
    }
    Object.assign(runeV2Config, normalized);
    delete runeV2Config.spellName;
    persistRuneV2Config();
    return { ...runeV2Config };
  }

  bot.runeV2 = {
    start: startRuneV2,
    stop: stopRuneV2,
    tryActivate: tryRuneV2,
    getGateStatus: getRuneV2GateStatus,
    updateConfig: updateRuneV2Config,
    status: () => ({
      running: runeV2State.running,
      config: { ...runeV2Config },
      gates: getRuneV2GateStatus(),
      lastActivationAt: runeV2State.lastActivationAt,
    }),
    config: runeV2Config,
  };

  function makeField(labelText, input) {
    const label = document.createElement("label");
    label.className = "mb-field";
    const caption = document.createElement("span");
    caption.className = "mb-field-label";
    caption.textContent = labelText;
    label.append(caption, input);
    return label;
  }

  function installControls() {
    disableLegacyRuneMaker();
    removeLegacyRuneMakerUi();

    const eatToggle = document.getElementById("minibia-bot-auto-eat-enabled");
    const quickSection = eatToggle?.closest?.(".mb-section");
    const stack = quickSection?.querySelector?.(".mb-stack");
    if (!stack) return false;

    if (!document.getElementById("minibia-bot-rune-v2-settings")) {
      const runeV2Settings = document.createElement("div");
      runeV2Settings.id = "minibia-bot-rune-v2-settings";
      runeV2Settings.className = "mb-stack";

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "mb-toggle";
      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.id = "minibia-bot-rune-v2-enabled";
      toggleInput.checked = !!runeV2State.running;
      const toggleText = document.createElement("span");
      toggleText.textContent = "Enable Rune Spell 2.0";
      toggleLabel.append(toggleInput, toggleText);

      const manaInput = document.createElement("input");
      manaInput.type = "number";
      manaInput.id = "minibia-bot-rune-v2-mana-cost";
      manaInput.min = "0";
      manaInput.step = "1";
      manaInput.value = String(clampManaCost(runeV2Config.manaCost, 600));
      manaInput.addEventListener("change", () => {
        const manaCost = clampManaCost(manaInput.value, runeV2Config.manaCost ?? 600);
        manaInput.value = String(manaCost);
        updateRuneV2Config({ manaCost });
      });

      const hotkeyInput = document.createElement("input");
      hotkeyInput.type = "text";
      hotkeyInput.id = "minibia-bot-rune-v2-hotkey";
      hotkeyInput.placeholder = "1-12 or F1-F12";
      hotkeyInput.value = String(runeV2Config.hotkey || "1");
      hotkeyInput.addEventListener("change", () => {
        const hotkey = normalizeRuneV2Hotkey(hotkeyInput.value, runeV2Config.hotkey ?? "1");
        hotkeyInput.value = hotkey;
        updateRuneV2Config({ hotkey });
      });

      toggleInput.addEventListener("change", () => {
        if (toggleInput.checked) startRuneV2();
        else stopRuneV2();
        toggleInput.checked = runeV2State.running;
      });

      runeV2Settings.append(
        toggleLabel,
        makeField("Rune 2.0 Mana Cost", manaInput),
        makeField("Rune 2.0 Hotkey", hotkeyInput)
      );
      stack.prepend(runeV2Settings);

      // Preserve compatibility for a normal reload when Rune 2.0 was actually
      // enabled, but only after the checkbox exists so runtime and UI agree.
      if (runeV2SavedEnabled) {
        toggleInput.checked = true;
        toggleInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    if (!document.getElementById("minibia-bot-auto-eat-settings")) {
      const eatSettings = document.createElement("div");
      eatSettings.id = "minibia-bot-auto-eat-settings";
      eatSettings.className = "mb-stack";

      const hotkeyInput = document.createElement("input");
      hotkeyInput.type = "number";
      hotkeyInput.id = "minibia-bot-auto-eat-hotkey";
      hotkeyInput.min = "1";
      hotkeyInput.max = "12";
      hotkeyInput.step = "1";
      hotkeyInput.value = String(clampHotbarSlot(bot.eat?.config?.eatHotbarSlot, 10));
      hotkeyInput.addEventListener("change", () => {
        const eatHotbarSlot = clampHotbarSlot(hotkeyInput.value, bot.eat?.config?.eatHotbarSlot ?? 10);
        hotkeyInput.value = String(eatHotbarSlot);
        bot.eat?.updateConfig?.({ eatHotbarSlot });
      });

      eatSettings.append(makeField("Food Hotkey", hotkeyInput));
      eatToggle?.closest?.("label")?.after(eatSettings);
    }

    removeLegacyRuneMakerUi();
    return true;
  }

  function destroy() {
    observer?.disconnect?.();
    observer = null;
    stopRuneV2({ persistEnabled: false });
    document.getElementById("minibia-bot-rune-settings")?.remove();
    document.getElementById("minibia-bot-rune-v2-settings")?.remove();
    document.getElementById("minibia-bot-auto-eat-settings")?.remove();
  }

  bot.quickControlsSettings = { installControls, destroy };

  disableLegacyRuneMaker();
  removeLegacyRuneMakerUi();

  if (!installControls()) {
    observer = new MutationObserver(() => {
      disableLegacyRuneMaker();
      removeLegacyRuneMakerUi();
      if (installControls()) observer?.disconnect?.();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  bot.addCleanup?.(destroy);
  return bot.quickControlsSettings;
};
window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installPanel = function installPanel(bot) {
  const panelPositionKey = "minibiaBot.ui.panelPosition";
  const panelCollapsedKey = "minibiaBot.ui.panelCollapsed";

  function destroy() {
    document.getElementById("minibia-bot-panel")?.remove();
    document.getElementById("minibia-bot-style")?.remove();
  }

  function savePanelPosition(position, key = panelPositionKey) {
    bot.storage.set(key, position);
  }

  function getSavedPanelPosition(key = panelPositionKey) {
    return bot.storage.get(key, null);
  }

  function savePanelCollapsed(collapsed) {
    bot.storage.set(panelCollapsedKey, !!collapsed);
  }

  function getSavedPanelCollapsed() {
    return !!bot.storage.get(panelCollapsedKey, false);
  }

  function isPanelCollapsed() {
    return document.getElementById("minibia-bot-panel")?.dataset?.collapsed === "true";
  }

  function refreshHomeLabel() {
    const homeLabel = document.getElementById("minibia-bot-home");
    if (!homeLabel) return;
    const home = bot.pz?.getHomePz?.();
    homeLabel.textContent = home ? `Panic Runner Home: ${home.x}, ${home.y}, ${home.z}` : "Panic Runner Home: not set";
  }

  function refreshPanicStatus() {
    const unknownToggle = document.getElementById("minibia-bot-panic-unknown");
    const healthToggle = document.getElementById("minibia-bot-panic-health");
    const returnToggle = document.getElementById("minibia-bot-panic-return");
    const status = bot.panic?.status?.();
    if (unknownToggle) unknownToggle.checked = !!status?.config?.unknownPlayerEnabled;
    if (healthToggle) healthToggle.checked = !!status?.config?.healthLossEnabled;
    if (returnToggle) returnToggle.checked = !!status?.config?.returnToOriginEnabled;
  }

  function refreshXrayStatus() {
    const status = bot.xray?.status?.();
    const me = bot.getPlayerPosition?.();
    const overlayButton = document.getElementById("minibia-bot-xray-overlay-toggle");
    const overlayLabel = document.getElementById("minibia-bot-xray-overlay-status");
    const floorSelect = document.getElementById("minibia-bot-xray-floor-select");
    const formatFloorOffset = (floor) => {
      if (!me || floor == null) return null;
      const offset = me.z - floor;
      return offset === 0 ? "0" : offset > 0 ? `+${offset}` : `${offset}`;
    };
    if (overlayButton) overlayButton.textContent = status?.config?.overlayEnabled ? "Disable Overlay" : "Enable Overlay";
    if (overlayLabel) {
      const floorLabel = status?.config?.selectedFloor == null ? "all floors" : `${formatFloorOffset(status.config.selectedFloor) ?? "?"}`;
      overlayLabel.textContent = `${status?.config?.overlayEnabled ? "Overlay: on" : "Overlay: off"} • ${floorLabel}`;
    }
    if (floorSelect) {
      const floors = Array.from(new Set((status?.visibleCreatures || []).map((creature) => creature?.position?.z).filter((floor) => floor != null))).sort((a, b) => a - b);
      const selectedFloor = status?.config?.selectedFloor;
      if (selectedFloor != null && !floors.includes(selectedFloor)) { floors.push(selectedFloor); floors.sort((a, b) => a - b); }
      floorSelect.innerHTML = "";
      const allOption = document.createElement("option"); allOption.value = "all"; allOption.textContent = "All floors"; floorSelect.appendChild(allOption);
      floors.forEach((floor) => { const option = document.createElement("option"); option.value = String(floor); const offsetLabel = formatFloorOffset(floor); option.textContent = offsetLabel == null ? String(floor) : offsetLabel; floorSelect.appendChild(option); });
      floorSelect.value = selectedFloor == null ? "all" : String(selectedFloor);
    }
  }

  function renderTrustedNames() {
    const list = document.getElementById("minibia-bot-panic-trusted-list"); if (!list) return;
    const trustedNames = bot.panic?.config?.trustedNames || []; list.innerHTML = "";
    if (!trustedNames.length) { const empty = document.createElement("div"); empty.className = "mb-small-note"; empty.textContent = "No trusted names saved."; list.appendChild(empty); return; }
    trustedNames.forEach((name, index) => { const row = document.createElement("div"); row.className = "mb-list-row"; const label = document.createElement("span"); label.textContent = name; const removeButton = document.createElement("button"); removeButton.type = "button"; removeButton.className = "mb-small-button"; removeButton.textContent = "Remove"; removeButton.addEventListener("click", () => { const nextNames = trustedNames.filter((_, currentIndex) => currentIndex !== index); bot.panic.updateConfig({ trustedNames: nextNames }); renderTrustedNames(); }); row.appendChild(label); row.appendChild(removeButton); list.appendChild(row); });
  }

  function renderGameMasterNames() {
    const list = document.getElementById("minibia-bot-panic-gm-list"); if (!list) return;
    const gameMasterNames = bot.panic?.config?.gameMasterNames || []; list.innerHTML = "";
    if (!gameMasterNames.length) { const empty = document.createElement("div"); empty.className = "mb-small-note"; empty.textContent = "No game master names saved."; list.appendChild(empty); return; }
    gameMasterNames.forEach((name, index) => { const row = document.createElement("div"); row.className = "mb-list-row"; const label = document.createElement("span"); label.textContent = name; const removeButton = document.createElement("button"); removeButton.type = "button"; removeButton.className = "mb-small-button"; removeButton.textContent = "Remove"; removeButton.addEventListener("click", () => { const nextNames = gameMasterNames.filter((_, currentIndex) => currentIndex !== index); bot.panic.updateConfig({ gameMasterNames: nextNames }); renderGameMasterNames(); }); row.appendChild(label); row.appendChild(removeButton); list.appendChild(row); });
  }

  function refreshRuneStatus() { const runeToggle = document.getElementById("minibia-bot-rune-enabled"); const running = !!bot.rune?.status?.().running; if (runeToggle) runeToggle.checked = running; }
  function refreshAutoEatStatus() { const autoEatToggle = document.getElementById("minibia-bot-auto-eat-enabled"); if (autoEatToggle) autoEatToggle.checked = !!bot.eat?.status?.().running; }
  function refreshAutoHealStatus() { const autoHealToggle = document.getElementById("minibia-bot-auto-heal-enabled"); if (autoHealToggle) autoHealToggle.checked = !!bot.heal?.status?.().running; }
  function refreshAutoInvisibleStatus() { const toggle = document.getElementById("minibia-bot-auto-invisible-enabled"); if (toggle) toggle.checked = !!bot.invisible?.status?.().running; }
  function refreshAutoMagicShieldStatus() { const toggle = document.getElementById("minibia-bot-auto-magic-shield-enabled"); if (toggle) toggle.checked = !!bot.magicShield?.status?.().running; }
  function refreshAutoAttackStatus() { const toggle = document.getElementById("minibia-bot-auto-attack-enabled"); if (toggle) toggle.checked = !!bot.attack?.status?.().running; }

  function refreshCaveStatus() {
    const statusLabel = document.getElementById("minibia-bot-cave-status"); const startButton = document.getElementById("minibia-bot-cave-start"); const stopButton = document.getElementById("minibia-bot-cave-stop"); const route = bot.cave?.getRoute?.() || []; const status = bot.cave?.status?.();
    if (statusLabel) { if (!route.length) statusLabel.textContent = "Status: no waypoints"; else if (status?.running) { const waypointNumber = (status.currentIndex ?? 0) + 1; const distanceLabel = Number.isFinite(status?.distanceToWaypoint) && status.distanceToWaypoint >= 0 ? `, dist ${status.distanceToWaypoint}` : ""; statusLabel.textContent = `Status: running (${waypointNumber}/${route.length}${distanceLabel})`; } else statusLabel.textContent = `Status: idle (${route.length} waypoint${route.length === 1 ? "" : "s"})`; }
    if (startButton) startButton.disabled = !route.length || !!status?.running; if (stopButton) stopButton.disabled = !status?.running;
  }

  function refreshCavePresetControls() {
    const select = document.getElementById("minibia-bot-cave-preset-select"); const label = document.getElementById("minibia-bot-cave-preset-status"); const deleteButton = document.getElementById("minibia-bot-cave-preset-delete"); const status = bot.cave?.status?.(); const presetNames = status?.presetNames || bot.cave?.getPresetNames?.() || []; const activePresetName = status?.activePresetName || bot.cave?.getActivePresetName?.() || "Default";
    if (select) { const previousValue = select.value; select.innerHTML = ""; if (!presetNames.length) { const option = document.createElement("option"); option.value = ""; option.textContent = "No saved presets"; select.appendChild(option); select.disabled = true; } else { presetNames.forEach((name) => { const option = document.createElement("option"); option.value = name; option.textContent = name; select.appendChild(option); }); select.disabled = false; const nextValue = presetNames.includes(activePresetName) ? activePresetName : previousValue; if (nextValue) select.value = nextValue; } }
    if (label) label.textContent = presetNames.length ? `Preset: ${activePresetName} (${presetNames.length} saved)` : `Preset: ${activePresetName}`; if (deleteButton) deleteButton.disabled = !presetNames.length || !select?.value;
  }

  function refreshCaveClosestStatus() { const label = document.getElementById("minibia-bot-cave-closest"); if (!label) return; const position = bot.getPlayerPosition?.(); const route = bot.cave?.getRoute?.() || []; if (!position) { label.textContent = "Closest start: current position unavailable"; return; } if (!route.length) { label.textContent = "Closest start: no waypoints"; return; } const closestIndex = bot.cave?.findClosestWaypointIndex?.(position) ?? 0; const waypoint = route[closestIndex]; if (!waypoint) { label.textContent = "Closest start: unavailable"; return; } label.textContent = `Closest start: ${closestIndex + 1}. ${waypoint.x}, ${waypoint.y}, ${waypoint.z}`; }
  function refreshCaveTransitionStatus() { const label = document.getElementById("minibia-bot-cave-transition-status"); if (!label) return; const transitions = bot.cave?.getTransitions?.() || []; if (!transitions.length) { label.textContent = "Transitions learned: none"; return; } const latest = transitions.slice().sort((a, b) => Number(b?.lastSeenAt || 0) - Number(a?.lastSeenAt || 0))[0]; if (!latest?.from || !latest?.to) { label.textContent = `Transitions learned: ${transitions.length}`; return; } const extra = transitions.length > 1 ? ` (+${transitions.length - 1} more)` : ""; label.textContent = `Transitions learned: ${latest.from.x}, ${latest.from.y}, ${latest.from.z} -> ${latest.to.x}, ${latest.to.y}, ${latest.to.z}${extra}`; }
  function refreshCavePathfinderMode() { const select = document.getElementById("minibia-bot-cave-pathfinder-mode"); if (!select) return; const status = bot.cave?.status?.(); select.value = status?.config?.pathfinderMode || 'game'; }
  function refreshEquipRingStatus() { const toggle = document.getElementById("minibia-bot-equip-ring-enabled"); if (toggle) toggle.checked = !!bot.ring?.status?.().running; }
  function refreshDebugStatus() { const enabledToggle = document.getElementById("minibia-bot-debug-enabled"); const countLabel = document.getElementById("minibia-bot-debug-count"); const downloadButton = document.getElementById("minibia-bot-debug-download"); const clearButton = document.getElementById("minibia-bot-debug-clear"); if (enabledToggle) enabledToggle.checked = !!bot.logger?.debugEnabled; const count = bot.logger?.getLogs?.()?.length || 0; if (countLabel) countLabel.textContent = `${count} log entr${count === 1 ? "y" : "ies"}`; if (downloadButton) downloadButton.disabled = !count; if (clearButton) clearButton.disabled = !count; }
  function refreshTalkStatus() { const toggle = document.getElementById("minibia-bot-talk-enabled"); const label = document.getElementById("minibia-bot-talk-status"); const status = bot.talk?.status?.(); if (toggle) toggle.checked = !!status?.running; if (label) { if (!status?.config?.apiKey) label.textContent = "Status: API key missing"; else if (status?.pending) label.textContent = "Status: generating"; else if (status?.running) label.textContent = "Status: listening to Default"; else label.textContent = "Status: idle"; } }

  function refreshVisibleCreatures() {
    const list = document.getElementById("minibia-bot-visible-creatures-list"); if (!list || isPanelCollapsed()) return;
    const me = bot.getPlayerPosition?.(); const status = bot.xray?.status?.(); const creatures = status?.visibleCreatures || []; const selectedFloor = status?.config?.selectedFloor; list.innerHTML = "";
    if (!me) { const empty = document.createElement("div"); empty.className = "mb-small-note"; empty.textContent = "Current position unavailable."; list.appendChild(empty); return; }
    const getFloorOffset = (creature) => (creature.position?.z || 0) - me.z; const getFloorDistance = (creature) => Math.abs(getFloorOffset(creature));
    const visibleCreatures = creatures.filter((creature) => { const floor = creature?.position?.z; if (floor == null) return false; if (selectedFloor != null) return floor === selectedFloor; return floor !== me.z; }).sort((a, b) => { const floorDistanceDiff = getFloorDistance(a) - getFloorDistance(b); if (floorDistanceDiff !== 0) return floorDistanceDiff; const floorOffsetDiff = getFloorOffset(a) - getFloorOffset(b); if (floorOffsetDiff !== 0) return floorOffsetDiff; const aDist = Math.abs((a.position?.x || 0) - me.x) + Math.abs((a.position?.y || 0) - me.y); const bDist = Math.abs((b.position?.x || 0) - me.x) + Math.abs((b.position?.y || 0) - me.y); return aDist - bDist; });
    if (!visibleCreatures.length) { const empty = document.createElement("div"); empty.className = "mb-small-note"; empty.textContent = selectedFloor == null ? "No off-floor creatures." : `No creatures on floor ${selectedFloor}.`; list.appendChild(empty); return; }
    let currentFloor = null;
    visibleCreatures.forEach((creature) => { const floor = creature.position?.z; if (floor !== currentFloor) { currentFloor = floor; const floorOffset = me.z - floor; const floorOffsetLabel = floorOffset === 0 ? "0" : floorOffset > 0 ? `+${floorOffset}` : `${floorOffset}`; const floorLabel = document.createElement("div"); floorLabel.className = "mb-floor-label"; floorLabel.textContent = floorOffsetLabel; list.appendChild(floorLabel); } const row = document.createElement("div"); row.className = "mb-creature-row"; const name = document.createElement("div"); name.className = "mb-creature-name"; name.textContent = creature.name || (creature.type === 0 ? "Player" : "Mob"); const meta = document.createElement("div"); meta.className = "mb-small-note"; meta.textContent = `${creature.type === 0 ? "Player" : "Mob"} at ${creature.position.x}, ${creature.position.y}, ${creature.position.z}`; row.appendChild(name); row.appendChild(meta); list.appendChild(row); });
  }

  function setPanelCollapsed(panel, collapsed) {
    if (!panel) return; const body = panel.querySelector(".mb-body"); const toggle = panel.querySelector("#minibia-bot-collapse"); const nextCollapsed = !!collapsed; panel.dataset.collapsed = nextCollapsed ? "true" : "false"; if (body) body.hidden = nextCollapsed; if (toggle) { toggle.textContent = nextCollapsed ? "+" : "−"; toggle.setAttribute("aria-label", nextCollapsed ? "Maximize panel" : "Minimize panel"); toggle.setAttribute("title", nextCollapsed ? "Maximize" : "Minimize"); } savePanelCollapsed(nextCollapsed); if (!nextCollapsed) { refreshXrayStatus(); refreshVisibleCreatures(); refreshTalkStatus(); refreshCaveStatus(); refreshCavePresetControls(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); refreshCavePathfinderMode(); refreshDebugStatus(); }
  }

  function applySavedPanelPosition(panel, key = panelPositionKey) { const position = getSavedPanelPosition(key); if (!position) return; if (typeof position.top === "number") panel.style.top = `${position.top}px`; if (typeof position.left === "number") { panel.style.left = `${position.left}px`; panel.style.right = "auto"; } }
  function clampPanelPosition(panel, left, top) { const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth); const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight); return { left: Math.min(Math.max(0, left), maxLeft), top: Math.min(Math.max(0, top), maxTop) }; }
  function enableDrag(panel, key = panelPositionKey) { const handle = panel.querySelector(".mb-title"); if (!handle) return; let dragState = null; const onMouseMove = (event) => { if (!dragState) return; const next = clampPanelPosition(panel, event.clientX - dragState.offsetX, event.clientY - dragState.offsetY); panel.style.left = `${next.left}px`; panel.style.top = `${next.top}px`; panel.style.right = "auto"; }; const onMouseUp = () => { if (!dragState) return; dragState = null; const rect = panel.getBoundingClientRect(); savePanelPosition({ left: rect.left, top: rect.top }, key); }; handle.addEventListener("mousedown", (event) => { if (event.button !== 0) return; const rect = panel.getBoundingClientRect(); dragState = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top }; event.preventDefault(); }); window.addEventListener("mousemove", onMouseMove); window.addEventListener("mouseup", onMouseUp); bot.addCleanup(() => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); }); }

  function inject() {
    destroy();
    const style = document.createElement("style"); style.id = "minibia-bot-style"; style.textContent = `#minibia-bot-panel{position:fixed;z-index:999999;max-width:calc(100vw - 32px);padding:12px;border:1px solid rgba(224,200,148,.45);border-radius:10px;background:linear-gradient(180deg,rgba(30,23,15,.95),rgba(15,11,8,.97));box-shadow:0 8px 24px rgba(0,0,0,.35);color:#f1e2b8;font:12px/1.35 Verdana,sans-serif;user-select:none;top:16px;right:16px;width:960px}#minibia-bot-panel[data-collapsed="true"]{width:220px}#minibia-bot-panel .mb-title{margin:0;font-weight:700;letter-spacing:.04em;text-transform:uppercase;cursor:move}#minibia-bot-panel .mb-version{font-size:.7em;font-weight:400;opacity:.55;margin-left:6px;text-transform:none;letter-spacing:0;cursor:default;user-select:text}#minibia-bot-panel .mb-titlebar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}#minibia-bot-panel .mb-icon-button{width:24px;min-width:24px;padding:2px 0;border-radius:6px;font-weight:700;line-height:1}#minibia-bot-panel[data-collapsed="true"] .mb-titlebar{margin-bottom:0}#minibia-bot-panel .mb-body{display:grid;grid-template-columns:minmax(0,1fr) 280px 240px;gap:12px;align-items:start}#minibia-bot-panel .mb-body[hidden]{display:none!important}#minibia-bot-panel .mb-side-column,#minibia-bot-panel .mb-main-column,#minibia-bot-panel .mb-cave-column{display:grid;gap:10px}#minibia-bot-panel .mb-section{padding:10px;border:1px solid rgba(224,200,148,.18);border-radius:8px;background:rgba(255,255,255,.025)}#minibia-bot-panel .mb-label{margin-bottom:7px;font-weight:700;color:#f8dc96}#minibia-bot-panel .mb-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}#minibia-bot-panel .mb-stack{display:grid;gap:7px}#minibia-bot-panel .mb-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}#minibia-bot-panel .mb-field{display:grid;gap:3px}#minibia-bot-panel .mb-field-label,#minibia-bot-panel .mb-small-note{font-size:11px;color:rgba(241,226,184,.74)}#minibia-bot-panel input,#minibia-bot-panel select,#minibia-bot-panel textarea,#minibia-bot-panel button{box-sizing:border-box;border:1px solid rgba(224,200,148,.35);border-radius:6px;background:rgba(20,15,10,.92);color:#f1e2b8;font:inherit}#minibia-bot-panel input,#minibia-bot-panel select,#minibia-bot-panel textarea{width:100%;min-width:0;padding:5px 6px}#minibia-bot-panel button{cursor:pointer;padding:5px 8px}#minibia-bot-panel button:disabled{cursor:not-allowed;opacity:.45}#minibia-bot-panel textarea{min-height:64px;resize:vertical}#minibia-bot-panel .mb-toggle{display:flex;align-items:center;gap:7px}#minibia-bot-panel .mb-toggle input{width:auto}#minibia-bot-panel .mb-list{display:grid;gap:5px}#minibia-bot-panel .mb-list-row,#minibia-bot-panel .mb-creature-row{display:flex;align-items:center;justify-content:space-between;gap:8px}#minibia-bot-panel .mb-creature-row{align-items:flex-start}#minibia-bot-panel .mb-creature-name{font-weight:700}#minibia-bot-panel .mb-floor-label{margin-top:5px;padding-top:5px;border-top:1px solid rgba(224,200,148,.2);font-weight:700;color:#f8dc96}#minibia-bot-panel .mb-small-button{padding:2px 6px}@media(max-width:980px){#minibia-bot-panel{width:calc(100vw - 32px)}#minibia-bot-panel .mb-body{grid-template-columns:1fr;max-height:calc(100vh - 100px);overflow-y:auto}}`; document.head.appendChild(style);

    const panel = document.createElement("div"); panel.id = "minibia-bot-panel"; panel.innerHTML = `<div class="mb-titlebar"><div class="mb-title">Minibia Bot <span class="mb-version">${bot.version || "dev"}</span></div><button type="button" class="mb-icon-button" id="minibia-bot-collapse" aria-label="Minimize panel" title="Minimize">−</button></div><div class="mb-body"><div class="mb-main-column"><div class="mb-section"><div class="mb-label">Auto Heal</div><div class="mb-stack"><label class="mb-field"><span class="mb-field-label">Minimum HP</span><input type="number" id="minibia-bot-auto-heal-min-hp" min="0" /></label><label class="mb-field"><span class="mb-field-label">HP Hotkey</span><input type="number" id="minibia-bot-auto-heal-hp-hotkey" min="1" max="12" /></label><label class="mb-field"><span class="mb-field-label">Minimum Mana</span><input type="number" id="minibia-bot-auto-heal-min-mana" min="0" /></label><label class="mb-field"><span class="mb-field-label">Mana Hotkey</span><input type="number" id="minibia-bot-auto-heal-mana-hotkey" min="1" max="12" /></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-heal-enabled" /><span>Enable Auto Heal</span></label></div></div><div class="mb-section"><div class="mb-label">Auto Attack</div><div class="mb-stack"><label class="mb-field"><span class="mb-field-label">Rune Hotkey</span><input type="number" id="minibia-bot-auto-attack-rune-hotkey" min="1" max="12" placeholder="Optional" /></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-attack-enabled" /><span>Enable Auto Attack</span></label></div></div><div class="mb-section"><div class="mb-label">Cavebot</div><div class="mb-stack"><div class="mb-row"><button type="button" id="minibia-bot-cave-add">Add Waypoint</button><button type="button" id="minibia-bot-cave-clear">Clear</button><button type="button" id="minibia-bot-cave-start">Start</button><button type="button" id="minibia-bot-cave-stop">Stop</button></div><div class="mb-small-note" id="minibia-bot-cave-status">Status: idle</div><div class="mb-small-note" id="minibia-bot-cave-closest">Closest start: unavailable</div><div class="mb-small-note" id="minibia-bot-cave-transition-status">Transitions learned: none</div><label class="mb-field"><span class="mb-field-label">Pathfinder Mode</span><select id="minibia-bot-cave-pathfinder-mode"><option value="game">Game</option><option value="direct">Direct</option></select></label><label class="mb-field"><span class="mb-field-label">Preset</span><select id="minibia-bot-cave-preset-select"></select></label><div class="mb-row"><button type="button" id="minibia-bot-cave-preset-save">Save Preset</button><button type="button" id="minibia-bot-cave-preset-load">Load Preset</button><button type="button" id="minibia-bot-cave-preset-delete">Delete Preset</button></div><div class="mb-small-note" id="minibia-bot-cave-preset-status">Preset: Default</div></div></div></div><div class="mb-cave-column"><div class="mb-section"><div class="mb-label">Safety</div><div class="mb-stack"><div class="mb-small-note" id="minibia-bot-home">Panic Runner Home: not set</div><button type="button" id="minibia-bot-set-home">Set Home Here</button><label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-unknown" /><span>Panic on unknown player</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-health" /><span>Panic on health loss</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-panic-return" /><span>Return after panic</span></label><div class="mb-field"><span class="mb-field-label">Trusted Names</span><div class="mb-row"><input type="text" id="minibia-bot-panic-trusted-input" placeholder="Name" /><button type="button" id="minibia-bot-panic-trusted-add">Add</button></div><div class="mb-list" id="minibia-bot-panic-trusted-list"></div></div><div class="mb-field"><span class="mb-field-label">Game Master Names</span><div class="mb-row"><input type="text" id="minibia-bot-panic-gm-input" placeholder="Name" /><button type="button" id="minibia-bot-panic-gm-add">Add</button></div><div class="mb-list" id="minibia-bot-panic-gm-list"></div></div></div></div><div class="mb-section"><div class="mb-label">Quick Controls</div><div class="mb-stack"><label class="mb-toggle"><input type="checkbox" id="minibia-bot-rune-enabled" /><span>Enable Rune Maker</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-eat-enabled" /><span>Enable Auto Eat</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-invisible-enabled" /><span>Enable Auto Invisible</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-auto-magic-shield-enabled" /><span>Enable Auto Magic Shield</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-equip-ring-enabled" /><span>Enable Equip Ring</span></label></div></div><div class="mb-section"><div class="mb-label">Talk</div><div class="mb-stack"><label class="mb-field"><span class="mb-field-label">API Key</span><input type="password" id="minibia-bot-talk-api-key" autocomplete="off" /></label><label class="mb-field"><span class="mb-field-label">System Prompt</span><textarea id="minibia-bot-talk-prompt"></textarea></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-talk-enabled" /><span>Enable Talk Assistant</span></label><div class="mb-small-note" id="minibia-bot-talk-status">Status: idle</div></div></div><div class="mb-section"><div class="mb-label">Debug</div><div class="mb-stack"><label class="mb-toggle"><input type="checkbox" id="minibia-bot-debug-enabled" /><span>Enable Debug Logs</span></label><div class="mb-small-note" id="minibia-bot-debug-count">0 log entries</div><div class="mb-row"><button type="button" id="minibia-bot-debug-download">Download Logs</button><button type="button" id="minibia-bot-debug-clear">Clear Logs</button></div></div></div></div><div class="mb-side-column"><div class="mb-section"><div class="mb-label">X-Ray</div><div class="mb-stack"><div class="mb-row"><button type="button" id="minibia-bot-xray-overlay-toggle">Enable Overlay</button><span class="mb-small-note" id="minibia-bot-xray-overlay-status">Overlay: off</span></div><label class="mb-field"><span class="mb-field-label">Floor</span><select id="minibia-bot-xray-floor-select"><option value="all">All floors</option></select></label><div class="mb-list" id="minibia-bot-visible-creatures-list"></div></div></div></div></div>`;
    document.body.appendChild(panel); applySavedPanelPosition(panel); setPanelCollapsed(panel, getSavedPanelCollapsed()); enableDrag(panel);

    const q = (id) => panel.querySelector(id);
    q("#minibia-bot-collapse")?.addEventListener("click", () => setPanelCollapsed(panel, panel.dataset.collapsed !== "true"));
    const panicTrustedInput=q("#minibia-bot-panic-trusted-input"),panicTrustedAddButton=q("#minibia-bot-panic-trusted-add"),panicGmInput=q("#minibia-bot-panic-gm-input"),panicGmAddButton=q("#minibia-bot-panic-gm-add"),runeEnabledInput=q("#minibia-bot-rune-enabled"),autoEatEnabledInput=q("#minibia-bot-auto-eat-enabled"),autoInvisibleEnabledInput=q("#minibia-bot-auto-invisible-enabled"),autoMagicShieldEnabledInput=q("#minibia-bot-auto-magic-shield-enabled"),equipRingEnabledInput=q("#minibia-bot-equip-ring-enabled"),caveAddButton=q("#minibia-bot-cave-add"),caveClearButton=q("#minibia-bot-cave-clear"),caveStartButton=q("#minibia-bot-cave-start"),caveStopButton=q("#minibia-bot-cave-stop"),cavePresetSelect=q("#minibia-bot-cave-preset-select"),cavePresetSaveButton=q("#minibia-bot-cave-preset-save"),cavePresetLoadButton=q("#minibia-bot-cave-preset-load"),cavePresetDeleteButton=q("#minibia-bot-cave-preset-delete"),cavePathfinderModeSelect=q("#minibia-bot-cave-pathfinder-mode"),debugEnabledInput=q("#minibia-bot-debug-enabled"),debugLogsDownloadButton=q("#minibia-bot-debug-download"),debugLogsClearButton=q("#minibia-bot-debug-clear"),autoHealMinHpInput=q("#minibia-bot-auto-heal-min-hp"),autoHealHpHotkeyInput=q("#minibia-bot-auto-heal-hp-hotkey"),autoHealMinManaInput=q("#minibia-bot-auto-heal-min-mana"),autoHealManaHotkeyInput=q("#minibia-bot-auto-heal-mana-hotkey"),autoHealEnabledInput=q("#minibia-bot-auto-heal-enabled"),autoAttackHotkeyInput=q("#minibia-bot-auto-attack-hotkey"),autoAttackRuneHotkeyInput=q("#minibia-bot-auto-attack-rune-hotkey"),autoAttackEnabledInput=q("#minibia-bot-auto-attack-enabled"),talkApiKeyInput=q("#minibia-bot-talk-api-key"),talkPromptInput=q("#minibia-bot-talk-prompt"),talkEnabledInput=q("#minibia-bot-talk-enabled"),panicUnknownInput=q("#minibia-bot-panic-unknown"),panicHealthInput=q("#minibia-bot-panic-health"),panicReturnInput=q("#minibia-bot-panic-return"),xrayOverlayButton=q("#minibia-bot-xray-overlay-toggle"),xrayFloorSelect=q("#minibia-bot-xray-floor-select");
    panicTrustedAddButton?.addEventListener("click",()=>{const name=panicTrustedInput?.value?.trim();if(!name)return;const names=bot.panic?.config?.trustedNames||[];bot.panic.updateConfig({trustedNames:Array.from(new Set([...names,name]))});panicTrustedInput.value="";renderTrustedNames();});
    panicGmAddButton?.addEventListener("click",()=>{const name=panicGmInput?.value?.trim();if(!name)return;const names=bot.panic?.config?.gameMasterNames||[];bot.panic.updateConfig({gameMasterNames:Array.from(new Set([...names,name]))});panicGmInput.value="";renderGameMasterNames();});
    runeEnabledInput?.addEventListener("change",()=>{runeEnabledInput.checked?bot.rune.start():bot.rune.stop();refreshRuneStatus();}); autoEatEnabledInput?.addEventListener("change",()=>{autoEatEnabledInput.checked?bot.eat.start():bot.eat.stop();refreshAutoEatStatus();}); autoInvisibleEnabledInput?.addEventListener("change",()=>{autoInvisibleEnabledInput.checked?bot.invisible.start():bot.invisible.stop();refreshAutoInvisibleStatus();}); autoMagicShieldEnabledInput?.addEventListener("change",()=>{autoMagicShieldEnabledInput.checked?bot.magicShield.start():bot.magicShield.stop();refreshAutoMagicShieldStatus();}); equipRingEnabledInput?.addEventListener("change",()=>{equipRingEnabledInput.checked?bot.ring.start():bot.ring.stop();refreshEquipRingStatus();});
    caveAddButton?.addEventListener("click",()=>{bot.cave.addCurrentPosition();refreshCaveStatus();refreshCaveClosestStatus();}); caveClearButton?.addEventListener("click",()=>{bot.cave.clearRoute();refreshCaveStatus();refreshCaveClosestStatus();}); caveStartButton?.addEventListener("click",()=>{bot.cave.start();refreshCaveStatus();}); caveStopButton?.addEventListener("click",()=>{bot.cave.stop();refreshCaveStatus();}); cavePresetSaveButton?.addEventListener("click",()=>{const name=window.prompt("Preset name",bot.cave?.getActivePresetName?.()||"Default");if(!name)return;bot.cave.savePreset(name);refreshCavePresetControls();}); cavePresetLoadButton?.addEventListener("click",()=>{if(!cavePresetSelect?.value)return;bot.cave.loadPreset(cavePresetSelect.value);refreshCaveStatus();refreshCavePresetControls();refreshCaveClosestStatus();}); cavePresetDeleteButton?.addEventListener("click",()=>{if(!cavePresetSelect?.value)return;bot.cave.deletePreset(cavePresetSelect.value);refreshCaveStatus();refreshCavePresetControls();refreshCaveClosestStatus();}); cavePathfinderModeSelect?.addEventListener("change",()=>{bot.cave?.updateConfig?.({pathfinderMode:cavePathfinderModeSelect.value});refreshCavePathfinderMode();});
    debugEnabledInput?.addEventListener("change",()=>{bot.logger.setDebugEnabled(debugEnabledInput.checked);if(debugEnabledInput.checked)bot.log("debug mode enabled");refreshDebugStatus();}); debugLogsDownloadButton?.addEventListener("click",()=>bot.logger.downloadLogs()); debugLogsClearButton?.addEventListener("click",()=>{bot.logger.clear();refreshDebugStatus();});
    if(autoHealMinHpInput){autoHealMinHpInput.value=String(bot.heal?.config?.minHp??0);autoHealMinHpInput.addEventListener("change",()=>{const v=Math.max(0,Number(autoHealMinHpInput.value)||0);autoHealMinHpInput.value=String(v);bot.heal.updateConfig({minHp:v});});} if(autoHealHpHotkeyInput){autoHealHpHotkeyInput.value=String(bot.heal?.config?.hpHotbarSlot??1);autoHealHpHotkeyInput.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(autoHealHpHotkeyInput.value)||1));autoHealHpHotkeyInput.value=String(v);bot.heal.updateConfig({hpHotbarSlot:v});});} if(autoHealMinManaInput){autoHealMinManaInput.value=String(bot.heal?.config?.minMana??0);autoHealMinManaInput.addEventListener("change",()=>{const v=Math.max(0,Number(autoHealMinManaInput.value)||0);autoHealMinManaInput.value=String(v);bot.heal.updateConfig({minMana:v});});} if(autoHealManaHotkeyInput){autoHealManaHotkeyInput.value=String(bot.heal?.config?.manaHotbarSlot??1);autoHealManaHotkeyInput.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(autoHealManaHotkeyInput.value)||1));autoHealManaHotkeyInput.value=String(v);bot.heal.updateConfig({manaHotbarSlot:v});});}
    autoHealEnabledInput&&(autoHealEnabledInput.checked=!!bot.heal?.status?.().running,autoHealEnabledInput.addEventListener("change",()=>{const minHp=Math.max(0,Number(autoHealMinHpInput?.value)||bot.heal.config.minHp||0),hpHotbarSlot=Math.min(12,Math.max(1,Number(autoHealHpHotkeyInput?.value)||bot.heal.config.hpHotbarSlot||1)),minMana=Math.max(0,Number(autoHealMinManaInput?.value)||bot.heal.config.minMana||0),manaHotbarSlot=Math.min(12,Math.max(1,Number(autoHealManaHotkeyInput?.value)||bot.heal.config.manaHotbarSlot||1));autoHealEnabledInput.checked?bot.heal.start({minHp,hpHotbarSlot,minMana,manaHotbarSlot}):bot.heal.stop();refreshAutoHealStatus();}));
    if(autoAttackHotkeyInput){autoAttackHotkeyInput.value=String(bot.attack?.config?.targetHotbarSlot??3);autoAttackHotkeyInput.addEventListener("change",()=>{const v=Math.min(12,Math.max(1,Number(autoAttackHotkeyInput.value)||1));autoAttackHotkeyInput.value=String(v);bot.attack.updateConfig({targetHotbarSlot:v});});} if(autoAttackRuneHotkeyInput){autoAttackRuneHotkeyInput.value=bot.attack?.config?.runeHotbarSlot?String(bot.attack.config.runeHotbarSlot):"";autoAttackRuneHotkeyInput.addEventListener("change",()=>{const raw=Number(autoAttackRuneHotkeyInput.value),v=Number.isFinite(raw)&&raw>=1&&raw<=12?Math.trunc(raw):null;autoAttackRuneHotkeyInput.value=v?String(v):"";bot.attack.updateConfig({runeHotbarSlot:v});});} autoAttackEnabledInput&&(autoAttackEnabledInput.checked=!!bot.attack?.status?.().running,autoAttackEnabledInput.addEventListener("change",()=>{const raw=Number(autoAttackRuneHotkeyInput?.value),runeHotbarSlot=Number.isFinite(raw)&&raw>=1&&raw<=12?Math.trunc(raw):(bot.attack.config.runeHotbarSlot??null);autoAttackEnabledInput.checked?bot.attack.start({runeHotbarSlot}):bot.attack.stop();refreshAutoAttackStatus();}));
    if(talkApiKeyInput){talkApiKeyInput.value=bot.talk?.config?.apiKey||"";talkApiKeyInput.addEventListener("change",()=>{bot.talk.updateConfig({apiKey:talkApiKeyInput.value.trim()});refreshTalkStatus();});} if(talkPromptInput){talkPromptInput.value=bot.talk?.config?.systemPrompt||"";talkPromptInput.addEventListener("change",()=>bot.talk.updateConfig({systemPrompt:talkPromptInput.value.trim()||bot.talk.config.systemPrompt||""}));} if(talkEnabledInput){talkEnabledInput.checked=!!bot.talk?.status?.().running;talkEnabledInput.addEventListener("change",()=>{if(talkEnabledInput.checked){bot.talk.updateConfig({apiKey:talkApiKeyInput?.value?.trim()||"",systemPrompt:talkPromptInput?.value?.trim()||bot.talk.config.systemPrompt||""});if(!bot.talk.start())talkEnabledInput.checked=false;}else bot.talk.stop();refreshTalkStatus();});}
    panicUnknownInput&&(panicUnknownInput.checked=!!bot.panic?.status?.().config?.unknownPlayerEnabled,panicUnknownInput.addEventListener("change",()=>{bot.panic.updateConfig({unknownPlayerEnabled:panicUnknownInput.checked});refreshPanicStatus();})); panicHealthInput&&(panicHealthInput.checked=!!bot.panic?.status?.().config?.healthLossEnabled,panicHealthInput.addEventListener("change",()=>{bot.panic.updateConfig({healthLossEnabled:panicHealthInput.checked});refreshPanicStatus();})); panicReturnInput&&(panicReturnInput.checked=!!bot.panic?.status?.().config?.returnToOriginEnabled,panicReturnInput.addEventListener("change",()=>{bot.panic.updateConfig({returnToOriginEnabled:panicReturnInput.checked});refreshPanicStatus();}));
    xrayOverlayButton?.addEventListener("click",()=>{const enabled=!!bot.xray?.status?.().config?.overlayEnabled;bot.xray?.setOverlayEnabled?.(!enabled);refreshXrayStatus();refreshVisibleCreatures();}); xrayFloorSelect?.addEventListener("change",()=>{const raw=xrayFloorSelect.value;bot.xray?.setSelectedFloor?.(raw==="all"?null:Number(raw));refreshXrayStatus();refreshVisibleCreatures();}); panel.querySelector("#minibia-bot-set-home")?.addEventListener("click",()=>{bot.pz.setHomePzCurrentSpot();refreshHomeLabel();});

    refreshHomeLabel();refreshPanicStatus();refreshXrayStatus();renderGameMasterNames();renderTrustedNames();refreshRuneStatus();refreshAutoHealStatus();refreshAutoInvisibleStatus();refreshAutoMagicShieldStatus();refreshAutoAttackStatus();refreshAutoEatStatus();refreshCaveStatus();refreshEquipRingStatus();refreshTalkStatus();refreshVisibleCreatures();refreshCavePresetControls();refreshCaveClosestStatus();refreshCaveTransitionStatus();refreshCavePathfinderMode();refreshDebugStatus();

    const talkStatusTimerId = window.setInterval(() => { if (!isPanelCollapsed()) refreshTalkStatus(); }, 1000); bot.addCleanup(() => window.clearInterval(talkStatusTimerId));
    const caveStatusTimerId = window.setInterval(() => { if (isPanelCollapsed()) return; refreshCaveStatus(); refreshCavePresetControls(); refreshCaveClosestStatus(); refreshCaveTransitionStatus(); refreshCavePathfinderMode(); refreshDebugStatus(); }, 1000); bot.addCleanup(() => window.clearInterval(caveStatusTimerId));
  }

  bot.ui = { inject,destroy,refreshHomeLabel,refreshPanicStatus,refreshXrayStatus,refreshRuneStatus,refreshAutoHealStatus,refreshAutoInvisibleStatus,refreshAutoMagicShieldStatus,refreshAutoAttackStatus,refreshAutoEatStatus,refreshCaveStatus,refreshCavePresetControls,refreshEquipRingStatus,refreshTalkStatus,refreshVisibleCreatures,refreshCaveClosestStatus,refreshCaveTransitionStatus,getSavedPanelPosition,getSavedPanelCollapsed,setPanelCollapsed:(collapsed)=>{const panel=document.getElementById("minibia-bot-panel");setPanelCollapsed(panel,collapsed);} };
};
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
(() => {
  const bundle = window.__minibiaBotBundle || window.__minibiaBotReloadBundle || {};
  const persistedEnabledModules = [
    ["rune", "minibiaBot.rune.config"],
    ["runeV2", "minibiaBot.runeV2.config"],
    ["runeV3", "minibiaBot.runeV3.config"],
    ["heal", "minibiaBot.heal.config"],
    ["antiParalyze", "minibiaBot.antiParalyzeV2.config"],
    ["damageTtsAlert", "minibiaBot.damageTtsAlert.config"],
    ["invisible", "minibiaBot.invisible.config"],
    ["magicShield", "minibiaBot.magicShield.config"],
    ["attack", "minibiaBot.attack.config"],
    ["attackAoe", "minibiaBot.attackAoe.config"],
    ["greatFireballV2", "minibiaBot.greatFireballV2.config"],
    ["fireball", "minibiaBot.fireball.config"],
    ["fireballV2", "minibiaBot.fireballV2.config"],
    ["lureMode", "minibiaBot.lure.config"],
    ["attackExclude", "minibiaBot.attackExclude.config"],
    ["attackPriority", "minibiaBot.attackPriority.config"],
    ["redTextAlert", "minibiaBot.redTextAlert.config"],
    ["cave", "minibiaBot.cave.config"],
    ["caveForwardLoop", "minibiaBot.caveForwardLoop.config"],
    ["equipRing", "minibiaBot.equipRing.config"],
    ["mining", "minibiaBot.mining.config"],
    ["eat", "minibiaBot.eat.config"],
    ["talk", "minibiaBot.talk.config"],
    ["runeMakerDrop", "minibiaBot.runeMakerDrop.config"],
    ["maxLight", "minibiaBot.maxLight.config"],
  ];

  function getPersistedEnabledSnapshot(bot) {
    const snapshot = {};
    const status = typeof bot?.status === "function" ? bot.status() : null;
    persistedEnabledModules.forEach(([moduleName]) => {
      const enabled = status?.[moduleName]?.config?.enabled;
      if (typeof enabled === "boolean") snapshot[moduleName] = enabled;
    });
    return snapshot;
  }

  function restorePersistedEnabledSnapshot(snapshot) {
    persistedEnabledModules.forEach(([moduleName, storageKey]) => {
      if (typeof snapshot?.[moduleName] !== "boolean") return;
      try {
        const rawValue = window.localStorage.getItem(storageKey);
        const config = rawValue ? JSON.parse(rawValue) : {};
        config.enabled = snapshot[moduleName];
        window.localStorage.setItem(storageKey, JSON.stringify(config));
      } catch (error) {
        console.error("[minibia-bot] failed to restore persisted enabled state", { module: moduleName, error });
      }
    });
  }

  function forceAttackAndCaveDisabled() {
    ["minibiaBot.attack.config", "minibiaBot.cave.config"].forEach((storageKey) => {
      try {
        const rawValue = window.localStorage.getItem(storageKey);
        const config = rawValue ? JSON.parse(rawValue) : {};
        config.enabled = false;
        window.localStorage.setItem(storageKey, JSON.stringify(config));
      } catch (error) {
        console.error("[minibia-bot] failed to disable startup module", { storageKey, error });
      }
    });
  }

  function removePanelDebugSection() {
    const debugToggle = document.getElementById("minibia-bot-debug-enabled");
    const debugSection = debugToggle?.closest?.(".mb-section");
    if (debugSection) {
      debugSection.remove();
      return true;
    }
    const labels = Array.from(document.querySelectorAll("#minibia-bot-panel .mb-label"));
    const debugLabel = labels.find((label) => String(label.textContent || "").trim().toLowerCase() === "debug");
    debugLabel?.closest?.(".mb-section")?.remove();
    return !!debugLabel;
  }

  function installGmKillSwitchBelowGithub(bot) {
    let attempts = 0;
    const placeControl = () => {
      const githubSection = document.getElementById("minibia-bot-github-waypoints-section");
      if (!githubSection) return false;
      const gmModule = bot.gmDefaultChatKillSwitch;
      if (typeof gmModule?.injectPanelControl === "function") {
        gmModule.injectPanelControl();
        const section = document.getElementById("minibia-bot-gm-kill-switch-section");
        if (!section) return false;
        if (githubSection.nextElementSibling !== section) githubSection.insertAdjacentElement("afterend", section);
        return !!section.querySelector("#minibia-bot-gm-pause-enabled");
      }
      return false;
    };
    if (placeControl()) return;
    const timerId = window.setInterval(() => {
      attempts += 1;
      if (placeControl() || attempts >= 80) window.clearInterval(timerId);
    }, 250);
    bot.addCleanup?.(() => window.clearInterval(timerId));
  }

  function installPauseBreakToggle(bot) {
    let paused = false;
    let resumeSnapshot = { cave: false, attack: false, greatFireballV2: false, fireball: false, fireballV2: false, lureMode: false };

    function isTypingTarget(target) {
      if (!(target instanceof Element)) return false;
      return !!target.closest("input, textarea, select, [contenteditable=\"true\"]");
    }

    function updatePanelState() {
      const panel = document.getElementById("minibia-bot-panel");
      if (!panel) return;
      panel.dataset.pauseBreakPaused = paused ? "true" : "false";
      panel.style.outline = paused ? "3px solid #d93025" : "";
      panel.title = paused ? "PAUSED — press Pause/Break to resume Cavebot, Auto Attack, GFB, Fireball, Fireball 2.0, and Lure Mode" : "";
    }

    function pause() {
      if (paused) return false;
      resumeSnapshot = {
        cave: !!bot.cave?.status?.().running,
        attack: !!bot.attack?.status?.().running,
        greatFireballV2: !!bot.greatFireballV2?.status?.().running,
        fireball: !!bot.fireball?.status?.().running,
        fireballV2: !!bot.fireballV2?.status?.().running,
        lureMode: !!bot.lureMode?.status?.().running,
      };
      if (resumeSnapshot.lureMode) bot.lureMode.stop({ persistEnabled: false });
      if (resumeSnapshot.fireballV2) bot.fireballV2.stop({ persistEnabled: false });
      if (resumeSnapshot.fireball) bot.fireball.stop({ persistEnabled: false });
      if (resumeSnapshot.greatFireballV2) bot.greatFireballV2.stop({ persistEnabled: false });
      if (resumeSnapshot.attack) bot.attack.stop({ persistEnabled: false });
      if (resumeSnapshot.cave || bot.cave?.status?.().running) bot.cave.stop({ persistEnabled: false });
      paused = true;
      updatePanelState();
      bot.log("Pause/Break paused Cavebot, Auto Attack, GFB, Fireball, Fireball 2.0, and Lure Mode", { ...resumeSnapshot });
      return true;
    }

    function resume() {
      if (!paused) return false;
      const snapshot = { ...resumeSnapshot };
      paused = false;
      resumeSnapshot = { cave: false, attack: false, greatFireballV2: false, fireball: false, fireballV2: false, lureMode: false };
      if (snapshot.cave) bot.cave?.start?.();
      if (snapshot.attack) bot.attack?.start?.();
      if (snapshot.greatFireballV2) bot.greatFireballV2?.start?.();
      if (snapshot.fireball) bot.fireball?.start?.();
      if (snapshot.fireballV2) bot.fireballV2?.start?.();
      if (snapshot.lureMode) bot.lureMode?.start?.();
      updatePanelState();
      bot.log("Pause/Break resumed Cavebot, Auto Attack, GFB, Fireball, Fireball 2.0, and Lure Mode", snapshot);
      return true;
    }

    function toggle() { return paused ? resume() : pause(); }
    function onKeyDown(event) {
      const isPauseBreak = event.key === "Pause" || event.code === "Pause" || event.keyCode === 19;
      if (!isPauseBreak || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }

    document.addEventListener("keydown", onKeyDown, true);
    bot.addCleanup(() => document.removeEventListener("keydown", onKeyDown, true));
    bot.pauseBreak = { pause, resume, toggle, status: () => ({ paused, resumeSnapshot: { ...resumeSnapshot } }) };
    updatePanelState();
  }

  function installLureCaveProgressPreserver(bot) {
    if (!bot?.cave?.start || !bot?.cave?.stop || !bot?.cave?.status || !bot?.cave?.setCurrentIndex) return null;
    const originalStart = bot.cave.start.bind(bot.cave);
    const originalStop = bot.cave.stop.bind(bot.cave);
    const state = { pending: null, restoreCount: 0, lastRestoreAt: 0 };
    function getLureMode() { const lureStatus = bot.lureMode?.status?.() || null; return Number(lureStatus?.config?.mode) === 2 ? 2 : 1; }
    function lureOwnsCave() { const lureStatus = bot.lureMode?.status?.() || null; if (!lureStatus?.running) return false; const mode = getLureMode(); return mode === 2 ? !!lureStatus?.mode2?.active : !!lureStatus?.clearingPack; }
    function snapshotProgress() { const caveStatus = bot.cave.status(); const routeLength = Array.isArray(caveStatus?.route) ? caveStatus.route.length : 0; if (!caveStatus?.running || routeLength <= 0) return null; return { currentIndex: Math.max(0, Math.min(routeLength - 1, Math.trunc(Number(caveStatus.currentIndex) || 0))), direction: Number(caveStatus.direction) < 0 ? -1 : 1, routeLength, waypoint: caveStatus.currentWaypoint ? { ...caveStatus.currentWaypoint } : null, capturedAt: Date.now() }; }
    function stopCurrentMovement() { const targets = [window.gameClient?.world?.pathfinder, window.gameClient?.player, window.gameClient?.world].filter(Boolean); ["stop", "cancel", "clear", "clearPath", "stopWalking", "cancelWalking", "stopAutoWalk", "reset"].forEach((name) => { targets.forEach((target) => { if (typeof target?.[name] !== "function") return; try { target[name](); } catch (_) {} }); }); }
    bot.cave.stop = function lureAwareCaveStop(options = {}) { if (lureOwnsCave()) { const snapshot = snapshotProgress(); if (snapshot) { state.pending = snapshot; bot.log?.("lure preserved cave waypoint before takeover", { index: snapshot.currentIndex + 1, direction: snapshot.direction, routeLength: snapshot.routeLength, waypoint: snapshot.waypoint }); } if (getLureMode() === 1 && bot.cave.status()?.running) { stopCurrentMovement(); return true; } } return originalStop(options); };
    bot.cave.start = function lureAwareCaveStart(...args) { const pending = state.pending ? { ...state.pending } : null; const alreadyRunning = !!bot.cave.status()?.running; const result = alreadyRunning ? true : originalStart(...args); if (!pending || !bot.cave.status()?.running) return result; const currentStatus = bot.cave.status(); const routeLength = Array.isArray(currentStatus?.route) ? currentStatus.route.length : 0; if (!routeLength) { state.pending = null; return result; } const restoreIndex = Math.max(0, Math.min(routeLength - 1, pending.currentIndex)); bot.cave.setCurrentIndex(restoreIndex); const restoredWaypoint = bot.cave.status()?.currentWaypoint || null; stopCurrentMovement(); if (restoredWaypoint) { try { bot.cave.goToWaypoint?.(restoredWaypoint); } catch (_) {} } state.pending = null; state.restoreCount += 1; state.lastRestoreAt = Date.now(); bot.log?.("lure restored cave waypoint after takeover", { index: restoreIndex + 1, directionBeforeLure: pending.direction, routeLength, waypoint: restoredWaypoint }); return result; };
    bot.lureCaveProgressPreserver = { status: () => ({ pending: state.pending ? { ...state.pending } : null, restoreCount: state.restoreCount, lastRestoreAt: state.lastRestoreAt }) };
    return bot.lureCaveProgressPreserver;
  }

  function boot(currentBundle = bundle) {
    const previousEnabledSnapshot = getPersistedEnabledSnapshot(window.minibiaBot);
    if (window.minibiaBot?.destroy) window.minibiaBot.destroy();
    restorePersistedEnabledSnapshot(previousEnabledSnapshot);
    forceAttackAndCaveDisabled();

    const bot = currentBundle.createBot();
    currentBundle.installPzModule(bot);
    currentBundle.installXrayModule(bot);
    currentBundle.installPanicModule(bot);
    currentBundle.installGmDefaultChatKillSwitch?.(bot);
    currentBundle.installRuneModule(bot);
    currentBundle.installHealModule(bot);
    currentBundle.installAntiParalyzeModule?.(bot);
    currentBundle.installHasteParalyzeMonsterRangeGuard?.(bot);
    currentBundle.installDamageTtsAlertModule?.(bot);
    currentBundle.installAutoInvisibleModule(bot);
    currentBundle.installAutoMagicShieldModule(bot);
    currentBundle.installAutoAttackModule(bot);
    bot.attack?.updateConfig?.({ enabled: false, maxTargetDistanceX: 7, maxTargetDistanceY: 5, runeCooldownMs: 2000 });
    bot.attack?.stop?.();
    currentBundle.installAutoAttackExcludeModule?.(bot);
    currentBundle.installAutoAttackAoeModule?.(bot);
    currentBundle.installRedTextAlertModule?.(bot);
    currentBundle.installCaveModule(bot);
    bot.cave?.updateConfig?.({ enabled: false });
    bot.cave?.stop?.();
    currentBundle.installCaveForwardLoopModule?.(bot);
    currentBundle.installCaveArrowKeysModule?.(bot);
    currentBundle.installEquipRingModule(bot);
    currentBundle.installMiningModule?.(bot);
    currentBundle.installAutoEatModule(bot);
    currentBundle.installTalkModule(bot);
    currentBundle.installMaxLightModule?.(bot);
    currentBundle.installPanel(bot);
    currentBundle.installCaveWaypointActionsModule?.(bot);

    bot.ui.inject();
    currentBundle.installQuickControlsSettingsModule?.(bot);
    currentBundle.installRuneV3KeyboardModule?.(bot);
    bot.gmDefaultChatKillSwitch?.injectPanelControl?.();
    bot.maxLight?.injectControls?.();
    currentBundle.installRuneMakerDropModule?.(bot);
    currentBundle.installAutoAttackPriorityModule?.(bot);
    currentBundle.installGreatFireballV2Module?.(bot);
    currentBundle.installFireballModule?.(bot);
    currentBundle.installFireballV2Module?.(bot);
    currentBundle.installLureModeModule?.(bot);
    currentBundle.installCaptchaAlarmModule?.(bot);
    installPauseBreakToggle(bot);
    installLureCaveProgressPreserver(bot);
    currentBundle.installGithubWaypointLibraryModule?.(bot);
    installGmKillSwitchBelowGithub(bot);
    removePanelDebugSection();
    window.setTimeout(removePanelDebugSection, 0);
    bot.caveArrowKeys?.ensureDropdownOption?.();
    document.getElementById("minibia-bot-waypoint-profiles-section")?.remove();
    bot.start = (...args) => bot.rune.start(...args);
    bot.stop = (...args) => bot.rune.stop(...args);
    bot.reload = () => window.minibiaBotReload?.();
    bot.status = () => ({
      version: bot.version.number,
      branch: bot.version.branch,
      commit: bot.version.commit,
      pz: { home: bot.pz.getHomePz() },
      xray: bot.xray.status(),
      panic: bot.panic.status(),
      gmDefaultChatKillSwitch: bot.gmDefaultChatKillSwitch?.status?.() || null,
      rune: bot.rune.status(),
      runeV2: bot.runeV2?.status?.() || null,
      runeV3: bot.runeV3?.status?.() || null,
      heal: bot.heal.status(),
      antiParalyze: bot.antiParalyze?.status?.() || null,
      damageTtsAlert: bot.damageTtsAlert?.status?.() || null,
      invisible: bot.invisible.status(),
      magicShield: bot.magicShield.status(),
      attack: bot.attack.status(),
      attackExclude: bot.attackExclude?.status?.() || null,
      attackAoe: bot.attackAoe?.status?.() || null,
      attackPriority: bot.attackPriority?.status?.() || null,
      greatFireballV2: bot.greatFireballV2?.status?.() || null,
      fireball: bot.fireball?.status?.() || null,
      fireballV2: bot.fireballV2?.status?.() || null,
      lureMode: bot.lureMode?.status?.() || null,
      redTextAlert: bot.redTextAlert?.status?.() || null,
      cave: bot.cave.status(),
      caveForwardLoop: bot.caveForwardLoop?.status?.() || null,
      caveArrowKeys: bot.caveArrowKeys?.status?.() || null,
      equipRing: bot.equipRing.status(),
      mining: bot.mining?.status?.() || null,
      eat: bot.eat.status(),
      talk: bot.talk.status(),
      runeMakerDrop: bot.runeMakerDrop?.status?.() || null,
      maxLight: bot.maxLight?.status?.() || null,
      captchaAlarm: bot.captchaAlarm?.status?.() || null,
      pauseBreak: bot.pauseBreak?.status?.() || null,
    });

    window.minibiaBot = bot;
    return bot;
  }

  window.minibiaBotReload = (nextBundle = window.__minibiaBotReloadBundle || window.__minibiaBotBundle || bundle) => boot(nextBundle);
  boot();
})();
