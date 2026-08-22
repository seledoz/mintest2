(() => {
  const BUTTON_ID = "minibia-bot-github-waypoints-delete";
  const SECTION_ID = "minibia-bot-github-waypoints-section";
  const SELECT_ID = "minibia-bot-github-waypoints-select";
  const STATUS_ID = "minibia-bot-github-waypoints-status";
  const REPO_OWNER = "seledoz";
  const REPO_NAME = "mintest2";
  const BRANCH = "main";
  const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
  const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
  const WAIT_STORAGE_KEY = "minibiaBot.cave.waitDelays";
  const WAIT_BUTTON_ID = "minibia-bot-cave-wait-add";
  const WAIT_INPUT_ID = "minibia-bot-cave-wait-minutes";
  const WAIT_STATUS_ID = "minibia-bot-cave-wait-status";

  function setStatus(message) {
    const label = document.getElementById(STATUS_ID);
    if (label) label.textContent = `GitHub: ${message}`;
  }

  function getBot() {
    return window.minibiaBot || null;
  }

  function getLibrary() {
    return getBot()?.githubWaypointLibrary || null;
  }

  function getToken() {
    return String(getLibrary()?.getToken?.() || "").trim();
  }

  function requireFreshSetup(message) {
    const library = getLibrary();
    library?.setToken?.("");
    const setup = document.getElementById("minibia-bot-github-waypoints-setup");
    if (setup) setup.hidden = false;
    const input = document.getElementById("minibia-bot-github-waypoints-token");
    if (input) {
      input.value = "";
      input.focus();
    }
    setStatus(message);
  }

  function encodePath(path) {
    return String(path || "").split("/").map((part) => encodeURIComponent(part)).join("/");
  }

  function headers(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  async function responseDetail(response) {
    try {
      return String((await response.json())?.message || "").trim();
    } catch (error) {
      return "";
    }
  }

  async function readFile(path, token) {
    const response = await fetch(`${API_BASE}/${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`, {
      headers: headers(token),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await responseDetail(response);
      const error = new Error(`read failed (${response.status})${detail ? ` - ${detail}` : ""}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function deleteFile(path, name, sha, token) {
    const response = await fetch(`${API_BASE}/${encodePath(path)}`, {
      method: "DELETE",
      headers: headers(token),
      body: JSON.stringify({ message: `Delete waypoint script: ${name}`, sha, branch: BRANCH }),
    });
    if (!response.ok) {
      const detail = await responseDetail(response);
      const error = new Error(`delete failed (${response.status})${detail ? ` - ${detail}` : ""}`);
      error.status = response.status;
      throw error;
    }
  }

  function selectedName(select) {
    const label = select?.options?.[select.selectedIndex]?.textContent || "selected script";
    return label.replace(/\s*\(\d+\)\s*$/, "").trim() || "selected script";
  }

  function injectDeleteButton() {
    const section = document.getElementById(SECTION_ID);
    const select = document.getElementById(SELECT_ID);
    if (!section || !select) return false;
    if (document.getElementById(BUTTON_ID)) return true;

    const button = document.createElement("button");
    button.type = "button";
    button.id = BUTTON_ID;
    button.className = "mb-small-button";
    button.textContent = "Delete Selected";

    const refreshButton = document.getElementById("minibia-bot-github-waypoints-refresh");
    if (refreshButton) refreshButton.insertAdjacentElement("beforebegin", button);
    else section.querySelector(".mb-stack")?.appendChild(button);

    const syncDisabled = () => { button.disabled = !select.value || select.disabled; };
    select.addEventListener("change", syncDisabled);
    syncDisabled();

    button.addEventListener("click", async () => {
      const path = String(select.value || "").trim();
      const name = selectedName(select);
      if (!path) return;
      const token = getToken();
      if (!token) {
        requireFreshSetup("Save GitHub Setup first");
        return;
      }
      if (!window.confirm(`Delete GitHub waypoint script “${name}”?\n\nThis cannot be undone.`)) return;

      button.disabled = true;
      setStatus(`deleting ${name}...`);
      try {
        const file = await readFile(path, token);
        if (!file?.sha) throw new Error("file SHA missing");
        await deleteFile(path, name, file.sha, token);
        setStatus(`deleted ${name}`);
        await getLibrary()?.refreshUi?.();
      } catch (error) {
        if (error?.status === 401) {
          requireFreshSetup("token rejected (401) — enter a new GitHub token");
        } else if (error?.status === 403) {
          setStatus("token needs Contents read/write permission (403)");
        } else {
          setStatus(error?.message || String(error));
        }
        console.error("[minibia-bot] GitHub waypoint delete failed", error);
      } finally {
        syncDisabled();
      }
    });
    return true;
  }

  function normalizePresetName(value) {
    return String(value || "Default").trim().replace(/\s+/g, " ") || "Default";
  }

  function readWaitStore() {
    const bot = getBot();
    const raw = bot?.storage?.get?.(WAIT_STORAGE_KEY, {});
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function writeWaitStore(value) {
    getBot()?.storage?.set?.(WAIT_STORAGE_KEY, value);
    return value;
  }

  function getActivePresetName() {
    return normalizePresetName(getBot()?.cave?.getActivePresetName?.());
  }

  function getWaitDelays(name = getActivePresetName(), routeLength = null) {
    const bot = getBot();
    const length = routeLength == null ? (bot?.cave?.getRoute?.()?.length || 0) : Math.max(0, Math.trunc(Number(routeLength) || 0));
    const store = readWaitStore();
    const saved = Array.isArray(store[normalizePresetName(name)]) ? store[normalizePresetName(name)] : [];
    return Array.from({ length }, (_, index) => Math.max(0, Number(saved[index]) || 0));
  }

  function saveWaitDelays(delays, name = getActivePresetName(), routeLength = null) {
    const bot = getBot();
    const length = routeLength == null ? (bot?.cave?.getRoute?.()?.length || 0) : Math.max(0, Math.trunc(Number(routeLength) || 0));
    const store = readWaitStore();
    store[normalizePresetName(name)] = Array.from({ length }, (_, index) => Math.max(0, Number(delays?.[index]) || 0));
    writeWaitStore(store);
    return store[normalizePresetName(name)].slice();
  }

  function deleteWaitPreset(name) {
    const store = readWaitStore();
    delete store[normalizePresetName(name)];
    writeWaitStore(store);
  }

  function setLastWaitDelay(minutes) {
    const bot = getBot();
    const route = bot?.cave?.getRoute?.() || [];
    if (!route.length) return null;
    const value = Math.max(0, Number(minutes) || 0);
    if (!(value > 0)) return null;
    const delays = getWaitDelays(undefined, route.length);
    delays[route.length - 1] = value;
    saveWaitDelays(delays, undefined, route.length);
    bot?.log?.("cave wait delay added", { waypoint: route.length, minutes: value });
    return { index: route.length - 1, minutes: value };
  }

  function formatRemaining(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  const waitState = {
    active: false,
    index: -1,
    minutes: 0,
    until: 0,
    presetName: "",
    lastObservedIndex: null,
    lastObservedDirection: 1,
    lastObservedRoute: [],
    suppressArrivalIndex: null,
    pathfinder: null,
    wrappedFindPath: null,
  };

  function updateWaitStatus(text = "") {
    const label = document.getElementById(WAIT_STATUS_ID);
    if (label) label.textContent = text || "Wait delay: idle";
  }

  function installPathfinderWaitGuard() {
    const pathfinder = window.gameClient?.world?.pathfinder;
    if (!pathfinder || typeof pathfinder.findPath !== "function") return false;
    if (pathfinder === waitState.pathfinder && pathfinder.findPath === waitState.wrappedFindPath) return true;
    if (pathfinder.findPath?.__minibiaWaitDelayGuard) {
      waitState.pathfinder = pathfinder;
      waitState.wrappedFindPath = pathfinder.findPath;
      return true;
    }

    const originalFindPath = pathfinder.findPath.bind(pathfinder);
    const guardedFindPath = function caveWaitDelayGuard(...args) {
      if (waitState.active) return null;
      return originalFindPath(...args);
    };
    guardedFindPath.__minibiaWaitDelayGuard = true;
    guardedFindPath.__minibiaWaitDelayOriginal = originalFindPath;
    pathfinder.findPath = guardedFindPath;
    waitState.pathfinder = pathfinder;
    waitState.wrappedFindPath = guardedFindPath;
    return true;
  }

  function beginWait(index, minutes, reason) {
    const bot = getBot();
    if (waitState.active || !(minutes > 0)) return false;
    const route = bot?.cave?.getRoute?.() || [];
    if (!route[index]) return false;

    waitState.active = true;
    waitState.index = index;
    waitState.minutes = minutes;
    waitState.until = Date.now() + Math.round(minutes * 60000);
    waitState.presetName = getActivePresetName();
    waitState.suppressArrivalIndex = index;
    try {
      window.gameClient?.world?.pathfinder?.setPathfindCache?.(null);
    } catch (error) {
      bot?.logDebug?.("cave wait delay failed to clear movement", { error: error?.message || error });
    }
    installPathfinderWaitGuard();
    updateWaitStatus(`Wait delay: ${formatRemaining(waitState.until - Date.now())} remaining`);
    bot?.log?.("cave wait delay started", { waypoint: index + 1, minutes, reason });
    return true;
  }

  function finishWait() {
    if (!waitState.active) return;
    const bot = getBot();
    const completed = { index: waitState.index, minutes: waitState.minutes, presetName: waitState.presetName };
    waitState.active = false;
    waitState.index = -1;
    waitState.minutes = 0;
    waitState.until = 0;
    waitState.presetName = "";
    updateWaitStatus("Wait delay: finished — continuing route");
    bot?.log?.("cave wait delay finished", { waypoint: completed.index + 1, minutes: completed.minutes });
  }

  function distanceTo(position, waypoint) {
    if (!position || !waypoint || Number(position.z) !== Number(waypoint.z)) return Number.POSITIVE_INFINITY;
    return Math.abs(Number(position.x) - Number(waypoint.x)) + Math.abs(Number(position.y) - Number(waypoint.y));
  }

  function runWaitCheck() {
    const bot = getBot();
    const cave = bot?.cave;
    if (!cave?.status || !cave?.getRoute) return;
    installPathfinderWaitGuard();

    if (waitState.active) {
      if (Date.now() >= waitState.until) finishWait();
      else updateWaitStatus(`Wait delay: ${formatRemaining(waitState.until - Date.now())} remaining`);
      return;
    }

    const status = cave.status();
    const route = cave.getRoute() || [];
    const currentIndex = Math.max(0, Math.min(Math.max(0, route.length - 1), Math.trunc(Number(status?.currentIndex) || 0)));
    const currentDirection = Number(status?.direction) < 0 ? -1 : 1;
    const delays = getWaitDelays(undefined, route.length);
    const position = bot.getPlayerPosition?.();
    const tolerance = Math.max(1, Math.trunc(Number(status?.config?.waypointTolerance) || 1));

    if (!status?.running || !route.length) {
      waitState.lastObservedIndex = currentIndex;
      waitState.lastObservedDirection = currentDirection;
      waitState.lastObservedRoute = route;
      if (!waitState.active) updateWaitStatus("Wait delay: idle");
      return;
    }

    if (waitState.suppressArrivalIndex != null && currentIndex !== waitState.suppressArrivalIndex) {
      waitState.suppressArrivalIndex = null;
    }

    const currentDelay = delays[currentIndex] || 0;
    const currentDistance = distanceTo(position, route[currentIndex]);
    if (currentDelay > 0 && currentDistance <= tolerance && waitState.suppressArrivalIndex !== currentIndex) {
      beginWait(currentIndex, currentDelay, "arrival");
    } else if (waitState.lastObservedIndex != null && currentIndex !== waitState.lastObservedIndex) {
      const previousIndex = waitState.lastObservedIndex;
      const previousWaypoint = waitState.lastObservedRoute?.[previousIndex] || route[previousIndex];
      const previousDelay = delays[previousIndex] || 0;
      const previousDistance = distanceTo(position, previousWaypoint);
      if (previousDelay > 0 && previousDistance <= tolerance + 1 && waitState.suppressArrivalIndex !== previousIndex) {
        beginWait(previousIndex, previousDelay, "waypoint advanced");
      }
    }

    waitState.lastObservedIndex = currentIndex;
    waitState.lastObservedDirection = currentDirection;
    waitState.lastObservedRoute = route;
  }

  function installCaveWrappers() {
    const bot = getBot();
    const cave = bot?.cave;
    if (!cave || cave.__waitDelayWrapped) return !!cave;

    const originalAddWaypoint = cave.addWaypoint?.bind(cave);
    const originalAddWaypointCurrentSpot = cave.addWaypointCurrentSpot?.bind(cave);
    const originalRemoveLastWaypoint = cave.removeLastWaypoint?.bind(cave);
    const originalClearWaypoints = cave.clearWaypoints?.bind(cave);
    const originalCreatePreset = cave.createPreset?.bind(cave);
    const originalSavePreset = cave.savePreset?.bind(cave);
    const originalDeletePreset = cave.deletePreset?.bind(cave);

    if (originalAddWaypoint) cave.addWaypoint = (...args) => {
      const before = cave.getRoute?.().length || 0;
      const result = originalAddWaypoint(...args);
      const after = cave.getRoute?.().length || 0;
      if (result && after > before) saveWaitDelays(getWaitDelays(undefined, before), undefined, after);
      return result;
    };

    if (originalAddWaypointCurrentSpot) cave.addWaypointCurrentSpot = (...args) => {
      const before = cave.getRoute?.().length || 0;
      const result = originalAddWaypointCurrentSpot(...args);
      const after = cave.getRoute?.().length || 0;
      if (result && after > before) saveWaitDelays(getWaitDelays(undefined, before), undefined, after);
      return result;
    };

    if (originalRemoveLastWaypoint) cave.removeLastWaypoint = (...args) => {
      const beforeDelays = getWaitDelays();
      const result = originalRemoveLastWaypoint(...args);
      if (result) saveWaitDelays(beforeDelays.slice(0, -1));
      return result;
    };

    if (originalClearWaypoints) cave.clearWaypoints = (...args) => {
      const result = originalClearWaypoints(...args);
      saveWaitDelays([]);
      return result;
    };

    if (originalCreatePreset) cave.createPreset = (...args) => {
      const result = originalCreatePreset(...args);
      if (result?.name) saveWaitDelays([], result.name, 0);
      return result;
    };

    if (originalSavePreset) cave.savePreset = (name, ...args) => {
      const sourceDelays = getWaitDelays();
      const result = originalSavePreset(name, ...args);
      if (result?.name) saveWaitDelays(sourceDelays, result.name, result.route?.length ?? cave.getRoute?.().length ?? 0);
      return result;
    };

    if (originalDeletePreset) cave.deletePreset = (name, ...args) => {
      const normalized = normalizePresetName(name);
      const result = originalDeletePreset(name, ...args);
      if (result) deleteWaitPreset(normalized);
      return result;
    };

    cave.getWaitDelays = (name) => getWaitDelays(name);
    cave.setLastWaitDelay = setLastWaitDelay;
    cave.__waitDelayWrapped = true;
    return true;
  }

  function injectWaitControls() {
    const bot = getBot();
    const addButton = document.getElementById("minibia-bot-cave-add");
    if (!bot?.cave || !addButton) return false;
    if (document.getElementById(WAIT_BUTTON_ID)) return true;

    const mainRow = addButton.closest(".mb-row");
    if (!mainRow) return false;
    const row = document.createElement("div");
    row.className = "mb-row";
    row.innerHTML = `
      <button type="button" id="${WAIT_BUTTON_ID}">Add Wait Delay</button>
      <label class="mb-field" style="display:flex;align-items:center;gap:6px;flex-direction:row;margin:0">
        <input type="number" id="${WAIT_INPUT_ID}" min="0.01" step="0.1" value="1" style="width:72px" />
        <span class="mb-field-label">minutes</span>
      </label>
      <span class="mb-small-note" id="${WAIT_STATUS_ID}">Wait delay: idle</span>
    `;
    mainRow.insertAdjacentElement("afterend", row);

    const button = row.querySelector(`#${WAIT_BUTTON_ID}`);
    const input = row.querySelector(`#${WAIT_INPUT_ID}`);
    button?.addEventListener("click", () => {
      const route = bot.cave?.getRoute?.() || [];
      const minutes = Number(input?.value);
      if (!route.length) {
        updateWaitStatus("Wait delay: add a waypoint first");
        return;
      }
      if (!Number.isFinite(minutes) || minutes <= 0) {
        updateWaitStatus("Wait delay: enter minutes above 0");
        input?.focus();
        return;
      }
      const result = setLastWaitDelay(minutes);
      if (result) updateWaitStatus(`Wait delay: ${minutes} min after waypoint ${result.index + 1}`);
    });
    return true;
  }

  function scriptBaseName(name) {
    const cleaned = String(name || "")
      .trim()
      .replace(/\.json$/i, "")
      .replace(/[^a-z0-9 _.-]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || "waypoints";
  }

  function scriptPath(name) {
    return `waypoints/${scriptBaseName(name)}.json`;
  }

  function encodeBase64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function normalizePosition(value) {
    const x = Number(value?.x), y = Number(value?.y), z = Number(value?.z);
    if (![x, y, z].every(Number.isFinite)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  async function saveCurrentScriptWithWait(name) {
    const bot = getBot();
    const library = getLibrary();
    const token = getToken();
    if (!bot?.cave || !library) throw new Error("GitHub waypoint library unavailable");
    if (!token) throw new Error("Save GitHub Setup first");

    const scriptName = normalizePresetName(name || bot.cave.getActivePresetName?.());
    const route = bot.cave.getRoute?.() || [];
    if (!route.length) throw new Error("No waypoints to save");
    const delays = getWaitDelays(undefined, route.length);
    const savedRoute = route.map((waypoint, index) => {
      const position = normalizePosition(waypoint);
      if (!position) return null;
      const waitMinutes = Math.max(0, Number(delays[index]) || 0);
      return waitMinutes > 0 ? { ...position, waitMinutes } : position;
    }).filter(Boolean);
    const transitions = bot.cave.getTransitions?.() || [];
    const path = scriptPath(scriptName);

    let sha = null;
    const readResponse = await fetch(`${API_BASE}/${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`, {
      headers: headers(token),
      cache: "no-store",
    });
    if (readResponse.ok) sha = (await readResponse.json())?.sha || null;
    else if (readResponse.status !== 404) {
      const detail = await responseDetail(readResponse);
      throw new Error(`GitHub read failed: HTTP ${readResponse.status}${detail ? ` - ${detail}` : ""}`);
    }

    const script = {
      version: 2,
      name: scriptName,
      updatedAt: new Date().toISOString(),
      route: savedRoute,
      transitions,
    };
    const body = {
      message: `Save waypoint script: ${scriptName}`,
      content: encodeBase64Utf8(JSON.stringify(script, null, 2) + "\n"),
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    const writeResponse = await fetch(`${API_BASE}/${encodePath(path)}`, {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify(body),
    });
    if (!writeResponse.ok) {
      const detail = await responseDetail(writeResponse);
      throw new Error(`GitHub save failed: HTTP ${writeResponse.status}${detail ? ` - ${detail}` : ""}`);
    }

    saveWaitDelays(delays, scriptName, route.length);
    bot.cave.savePreset?.(scriptName);
    bot.log?.("GitHub waypoint script saved with wait delays", { name: scriptName, waypoints: route.length, waits: delays.filter((value) => value > 0).length, path });
    return { ...script, path };
  }

  async function loadScriptWithWait(nameOrPath) {
    const bot = getBot();
    const library = getLibrary();
    if (!bot?.cave || !library) throw new Error("GitHub waypoint library unavailable");
    const value = String(nameOrPath || "").trim();
    if (!value) throw new Error("Choose a script to load");

    let path = value;
    if (!path.includes("/") || !/\.json$/i.test(path)) {
      const scripts = await library.listScripts?.() || [];
      const match = scripts.find((entry) => entry.path === value || String(entry.name || "").toLowerCase() === value.toLowerCase());
      path = match?.path || scriptPath(value);
    }

    const response = await fetch(`${RAW_BASE}/${encodePath(path)}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`GitHub load failed: HTTP ${response.status}`);
    const raw = await response.json();
    const scriptName = normalizePresetName(raw?.name || selectedName(document.getElementById(SELECT_ID)) || value);
    const rawRoute = Array.isArray(raw?.route) ? raw.route : [];
    const route = rawRoute.map(normalizePosition).filter(Boolean);
    if (!route.length) throw new Error(`Script has no waypoints: ${scriptName}`);
    const delays = rawRoute.map((entry) => Math.max(0, Number(entry?.waitMinutes) || 0)).slice(0, route.length);

    bot.cave.stop?.();
    bot.cave.clearWaypoints?.();
    bot.cave.clearTransitions?.();
    route.forEach((waypoint) => bot.cave.addWaypoint?.(waypoint));
    saveWaitDelays(delays, scriptName, route.length);
    bot.cave.savePreset?.(scriptName);
    bot.cave.loadPreset?.(scriptName);
    saveWaitDelays(delays, scriptName, route.length);
    bot.log?.("GitHub waypoint script loaded with wait delays", { name: scriptName, waypoints: route.length, waits: delays.filter((value) => value > 0).length, path });
    return {
      version: Number(raw?.version) || 1,
      name: scriptName,
      updatedAt: raw?.updatedAt || null,
      route: route.map((waypoint, index) => delays[index] > 0 ? { ...waypoint, waitMinutes: delays[index] } : waypoint),
      transitions: Array.isArray(raw?.transitions) ? raw.transitions : [],
      path,
    };
  }

  function installGithubWaitHooks() {
    const library = getLibrary();
    if (!library || library.__waitDelayHooksInstalled) return !!library;
    library.saveCurrentScript = saveCurrentScriptWithWait;
    library.loadScript = loadScriptWithWait;
    library.__waitDelayHooksInstalled = true;
    return true;
  }

  async function handleGithubButtonCapture(event) {
    const target = event.target?.closest?.("#minibia-bot-github-waypoints-save, #minibia-bot-github-waypoints-load");
    if (!target) return;
    if (!getLibrary()) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const nameInput = document.getElementById("minibia-bot-github-waypoints-name");
    const select = document.getElementById(SELECT_ID);
    target.disabled = true;
    try {
      if (target.id === "minibia-bot-github-waypoints-save") {
        setStatus("saving current script...");
        const saved = await saveCurrentScriptWithWait(nameInput?.value || "");
        if (nameInput) nameInput.value = saved.name;
        await getLibrary()?.refreshUi?.();
        setStatus(`saved ${saved.name} (${saved.route.length})`);
      } else {
        setStatus("loading selected script...");
        const loaded = await loadScriptWithWait(select?.value || nameInput?.value || "");
        if (nameInput) nameInput.value = loaded.name;
        setStatus(`loaded ${loaded.name} (${loaded.route.length})`);
      }
    } catch (error) {
      setStatus(error?.message || String(error));
      getBot()?.log?.("GitHub waypoint wait-delay operation failed", error?.message || error);
    } finally {
      target.disabled = false;
    }
  }

  document.addEventListener("click", handleGithubButtonCapture, true);

  function installAll() {
    installCaveWrappers();
    injectWaitControls();
    injectDeleteButton();
    installGithubWaitHooks();
    installPathfinderWaitGuard();
  }

  installAll();
  let attempts = 0;
  const installTimer = window.setInterval(() => {
    attempts += 1;
    installAll();
    if (attempts >= 120 && getBot()?.cave && document.getElementById(WAIT_BUTTON_ID) && getLibrary()) {
      window.clearInterval(installTimer);
    }
  }, 250);

  const waitTimer = window.setInterval(runWaitCheck, 50);
  const cleanupBot = getBot();
  cleanupBot?.addCleanup?.(() => {
    window.clearInterval(installTimer);
    window.clearInterval(waitTimer);
    document.removeEventListener("click", handleGithubButtonCapture, true);
  });
})();
