(() => {
  if (window.__minibiaCaveWaitDelayInstalled) return;
  window.__minibiaCaveWaitDelayInstalled = true;

  const STORAGE_KEY = "minibiaBot.cave.waitDelays";
  const BUTTON_ID = "minibia-bot-cave-wait-add";
  const INPUT_ID = "minibia-bot-cave-wait-minutes";
  const STATUS_ID = "minibia-bot-cave-wait-status";
  const API_BASE = "https://api.github.com/repos/seledoz/mintest2/contents";
  const RAW_BASE = "https://raw.githubusercontent.com/seledoz/mintest2/main";
  const BRANCH = "main";

  const state = {
    active: false,
    index: -1,
    minutes: 0,
    until: 0,
    lastIndex: null,
    lastRoute: [],
    suppressIndex: null,
    pathfinder: null,
    guardedFindPath: null,
  };

  const bot = () => window.minibiaBot || null;
  const cave = () => bot()?.cave || null;
  const library = () => bot()?.githubWaypointLibrary || null;
  const presetName = () => String(cave()?.getActivePresetName?.() || "Default").trim() || "Default";

  function readStore() {
    const value = bot()?.storage?.get?.(STORAGE_KEY, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function writeStore(value) {
    bot()?.storage?.set?.(STORAGE_KEY, value);
  }

  function getWaitDelays(name = presetName(), length = null) {
    const routeLength = length == null ? (cave()?.getRoute?.().length || 0) : Math.max(0, Math.trunc(Number(length) || 0));
    const saved = readStore()[String(name || "Default")] || [];
    return Array.from({ length: routeLength }, (_, index) => Math.max(0, Number(saved[index]) || 0));
  }

  function setWaitDelays(delays, name = presetName(), length = null) {
    const routeLength = length == null ? (cave()?.getRoute?.().length || 0) : Math.max(0, Math.trunc(Number(length) || 0));
    const store = readStore();
    store[String(name || "Default")] = Array.from({ length: routeLength }, (_, index) => Math.max(0, Number(delays?.[index]) || 0));
    writeStore(store);
    return store[String(name || "Default")].slice();
  }

  function setLastWaitDelay(minutes) {
    const route = cave()?.getRoute?.() || [];
    const value = Number(minutes);
    if (!route.length || !Number.isFinite(value) || value <= 0) return null;
    const delays = getWaitDelays(undefined, route.length);
    delays[route.length - 1] = value;
    setWaitDelays(delays, undefined, route.length);
    bot()?.log?.("cave wait delay added", { waypoint: route.length, minutes: value });
    return { index: route.length - 1, minutes: value };
  }

  function statusText(text) {
    const label = document.getElementById(STATUS_ID);
    if (label) label.textContent = text;
  }

  function remainingText(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function restoreOldGuard() {
    const pf = state.pathfinder || window.gameClient?.world?.pathfinder;
    if (pf && pf.findPath === state.guardedFindPath && typeof state.guardedFindPath?.__minibiaWaitBaseFindPath === "function") {
      pf.findPath = state.guardedFindPath.__minibiaWaitBaseFindPath;
    }
    state.pathfinder = null;
    state.guardedFindPath = null;
  }

  function installPathGuard() {
    const pf = window.gameClient?.world?.pathfinder;
    if (!pf || typeof pf.findPath !== "function") return false;

    if (pf === state.pathfinder && pf.findPath === state.guardedFindPath) return true;

    if (state.pathfinder && state.pathfinder !== pf) restoreOldGuard();

    const current = pf.findPath;
    if (current?.__minibiaCaveWaitGuard) {
      state.pathfinder = pf;
      state.guardedFindPath = current;
      return true;
    }

    const baseFindPath = current;
    const guarded = function caveWaitGuard(...args) {
      if (state.active) return null;
      return baseFindPath.apply(this, args);
    };

    guarded.__minibiaCaveWaitGuard = true;
    guarded.__minibiaWaitBaseFindPath = baseFindPath;
    pf.findPath = guarded;
    state.pathfinder = pf;
    state.guardedFindPath = guarded;
    return true;
  }

  function beginWait(index, minutes) {
    if (state.active || !(minutes > 0)) return false;
    state.active = true;
    state.index = index;
    state.minutes = minutes;
    state.until = Date.now() + Math.round(minutes * 60000);
    state.suppressIndex = index;
    try { window.gameClient?.world?.pathfinder?.setPathfindCache?.(null); } catch (_) {}
    installPathGuard();
    statusText(`Wait delay: ${remainingText(state.until - Date.now())} remaining`);
    bot()?.log?.("cave wait delay started", { waypoint: index + 1, minutes });
    return true;
  }

  function finishWait() {
    if (!state.active) return;
    const done = { index: state.index, minutes: state.minutes };
    state.active = false;
    state.index = -1;
    state.minutes = 0;
    state.until = 0;
    statusText("Wait delay: finished");
    bot()?.log?.("cave wait delay finished", { waypoint: done.index + 1, minutes: done.minutes });
  }

  function distance(a, b) {
    if (!a || !b || Number(a.z) !== Number(b.z)) return Infinity;
    return Math.abs(Number(a.x) - Number(b.x)) + Math.abs(Number(a.y) - Number(b.y));
  }

  function tick() {
    const c = cave();
    if (!c?.status || !c?.getRoute) return;
    installPathGuard();
    if (state.active) {
      if (Date.now() >= state.until) finishWait();
      else statusText(`Wait delay: ${remainingText(state.until - Date.now())} remaining`);
      return;
    }

    const status = c.status();
    const route = c.getRoute() || [];
    const index = Math.max(0, Math.min(Math.max(0, route.length - 1), Math.trunc(Number(status?.currentIndex) || 0)));
    const position = bot()?.getPlayerPosition?.();
    const tolerance = Math.max(1, Math.trunc(Number(status?.config?.waypointTolerance) || 1));
    const delays = getWaitDelays(undefined, route.length);

    if (!status?.running || !route.length) {
      state.lastIndex = index;
      state.lastRoute = route;
      statusText("Wait delay: idle");
      return;
    }

    if (state.suppressIndex != null && index !== state.suppressIndex) state.suppressIndex = null;
    const currentDelay = delays[index] || 0;
    if (currentDelay > 0 && distance(position, route[index]) <= tolerance && state.suppressIndex !== index) {
      beginWait(index, currentDelay);
    } else if (state.lastIndex != null && state.lastIndex !== index) {
      const oldIndex = state.lastIndex;
      const oldWaypoint = state.lastRoute[oldIndex] || route[oldIndex];
      const oldDelay = delays[oldIndex] || 0;
      if (oldDelay > 0 && distance(position, oldWaypoint) <= tolerance + 1 && state.suppressIndex !== oldIndex) beginWait(oldIndex, oldDelay);
    }

    state.lastIndex = index;
    state.lastRoute = route;
  }

  function wrapCave() {
    const c = cave();
    if (!c || c.__minuteWaitWrapped) return !!c;
    const add = c.addWaypoint?.bind(c);
    const addHere = c.addWaypointCurrentSpot?.bind(c);
    const remove = c.removeLastWaypoint?.bind(c);
    const clear = c.clearWaypoints?.bind(c);
    const savePreset = c.savePreset?.bind(c);
    const createPreset = c.createPreset?.bind(c);
    const deletePreset = c.deletePreset?.bind(c);

    if (add) c.addWaypoint = (...args) => { const before = c.getRoute?.().length || 0; const result = add(...args); if (result) setWaitDelays(getWaitDelays(undefined, before), undefined, c.getRoute?.().length || 0); return result; };
    if (addHere) c.addWaypointCurrentSpot = (...args) => { const before = c.getRoute?.().length || 0; const result = addHere(...args); if (result) setWaitDelays(getWaitDelays(undefined, before), undefined, c.getRoute?.().length || 0); return result; };
    if (remove) c.removeLastWaypoint = (...args) => { const delays = getWaitDelays(); const result = remove(...args); if (result) setWaitDelays(delays.slice(0, -1)); return result; };
    if (clear) c.clearWaypoints = (...args) => { const result = clear(...args); setWaitDelays([]); return result; };
    if (savePreset) c.savePreset = (name, ...args) => { const delays = getWaitDelays(); const result = savePreset(name, ...args); if (result?.name) setWaitDelays(delays, result.name, result.route?.length ?? c.getRoute?.().length ?? 0); return result; };
    if (createPreset) c.createPreset = (...args) => { const result = createPreset(...args); if (result?.name) setWaitDelays([], result.name, 0); return result; };
    if (deletePreset) c.deletePreset = (name, ...args) => { const result = deletePreset(name, ...args); if (result) { const store = readStore(); delete store[String(name || "Default")]; writeStore(store); } return result; };

    c.getWaitDelays = getWaitDelays;
    c.setWaitDelays = setWaitDelays;
    c.setLastWaitDelay = setLastWaitDelay;
    c.__minuteWaitWrapped = true;
    return true;
  }

  function injectControls() {
    const add = document.getElementById("minibia-bot-cave-add");
    if (!add || document.getElementById(BUTTON_ID)) return !!document.getElementById(BUTTON_ID);
    const row = document.createElement("div");
    row.className = "mb-row";
    row.innerHTML = `<button type="button" id="${BUTTON_ID}">Add Wait Delay</button><input type="number" id="${INPUT_ID}" min="0.01" step="0.1" value="1" style="width:72px" /><span class="mb-small-note">minutes</span><span class="mb-small-note" id="${STATUS_ID}">Wait delay: idle</span>`;
    add.closest(".mb-row")?.insertAdjacentElement("afterend", row);
    row.querySelector(`#${BUTTON_ID}`)?.addEventListener("click", () => {
      const input = row.querySelector(`#${INPUT_ID}`);
      const minutes = Number(input?.value);
      if (!cave()?.getRoute?.().length) return statusText("Wait delay: add a waypoint first");
      if (!Number.isFinite(minutes) || minutes <= 0) return statusText("Wait delay: enter minutes above 0");
      const saved = setLastWaitDelay(minutes);
      if (saved) statusText(`Wait delay: ${minutes} min after waypoint ${saved.index + 1}`);
    });
    return true;
  }

  function encodePath(path) { return String(path || "").split("/").map(encodeURIComponent).join("/"); }
  function token() { return String(library()?.getToken?.() || "").trim(); }
  function headers(value) { return { Authorization: `Bearer ${value}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }; }
  function scriptPath(name) { const clean = String(name || "waypoints").trim().replace(/\.json$/i, "").replace(/[^a-z0-9 _.-]/gi, "").replace(/\s+/g, " ") || "waypoints"; return `waypoints/${clean}.json`; }

  async function saveGithub(name) {
    const c = cave();
    const lib = library();
    const auth = token();
    if (!c || !lib) throw new Error("GitHub waypoint library unavailable");
    if (!auth) throw new Error("Save GitHub Setup first");
    const scriptName = String(name || c.getActivePresetName?.() || "").trim();
    const route = c.getRoute?.() || [];
    if (!route.length) throw new Error("No waypoints to save");
    const delays = getWaitDelays(undefined, route.length);
    const savedRoute = route.map((point, index) => delays[index] > 0 ? { x: point.x, y: point.y, z: point.z, waitMinutes: delays[index] } : { x: point.x, y: point.y, z: point.z });
    const path = scriptPath(scriptName);
    let sha = null;
    const read = await fetch(`${API_BASE}/${encodePath(path)}?ref=${BRANCH}`, { headers: headers(auth), cache: "no-store" });
    if (read.ok) sha = (await read.json())?.sha || null;
    else if (read.status !== 404) throw new Error(`GitHub read failed: HTTP ${read.status}`);
    const body = { message: `Save waypoint script: ${scriptName}`, content: btoa(unescape(encodeURIComponent(JSON.stringify({ version: 2, name: scriptName, updatedAt: new Date().toISOString(), route: savedRoute, transitions: c.getTransitions?.() || [] }, null, 2) + "\n"))), branch: BRANCH };
    if (sha) body.sha = sha;
    const write = await fetch(`${API_BASE}/${encodePath(path)}`, { method: "PUT", headers: headers(auth), body: JSON.stringify(body) });
    if (!write.ok) throw new Error(`GitHub save failed: HTTP ${write.status}`);
    c.savePreset?.(scriptName);
    return { name: scriptName, route: savedRoute, path };
  }

  async function loadGithub(nameOrPath) {
    const c = cave();
    const lib = library();
    if (!c || !lib) throw new Error("GitHub waypoint library unavailable");
    let path = String(nameOrPath || "").trim();
    if (!path) throw new Error("Choose a script to load");
    if (!path.includes("/") || !/\.json$/i.test(path)) {
      const scripts = await lib.listScripts?.() || [];
      const match = scripts.find((entry) => entry.path === path || String(entry.name || "").toLowerCase() === path.toLowerCase());
      path = match?.path || scriptPath(path);
    }
    const response = await fetch(`${RAW_BASE}/${encodePath(path)}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`GitHub load failed: HTTP ${response.status}`);
    const raw = await response.json();
    const rawRoute = Array.isArray(raw?.route) ? raw.route : [];
    const route = rawRoute.map((p) => ({ x: Math.trunc(Number(p.x)), y: Math.trunc(Number(p.y)), z: Math.trunc(Number(p.z)) })).filter((p) => [p.x,p.y,p.z].every(Number.isFinite));
    const delays = rawRoute.map((p) => Math.max(0, Number(p?.waitMinutes) || 0)).slice(0, route.length);
    if (!route.length) throw new Error("Script has no waypoints");
    c.stop?.(); c.clearWaypoints?.(); c.clearTransitions?.(); route.forEach((p) => c.addWaypoint?.(p));
    const scriptName = String(raw?.name || path.split("/").pop()?.replace(/\.json$/i, "") || "Default");
    setWaitDelays(delays, scriptName, route.length);
    c.savePreset?.(scriptName); c.loadPreset?.(scriptName); setWaitDelays(delays, scriptName, route.length);
    return { name: scriptName, route, path };
  }

  async function captureGithub(event) {
    const target = event.target?.closest?.("#minibia-bot-github-waypoints-save, #minibia-bot-github-waypoints-load");
    if (!target || !library()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const nameInput = document.getElementById("minibia-bot-github-waypoints-name");
    const select = document.getElementById("minibia-bot-github-waypoints-select");
    const ghStatus = document.getElementById("minibia-bot-github-waypoints-status");
    const setGh = (text) => { if (ghStatus) ghStatus.textContent = `GitHub: ${text}`; };
    target.disabled = true;
    try {
      if (target.id === "minibia-bot-github-waypoints-save") {
        setGh("saving current script...");
        const saved = await saveGithub(nameInput?.value || "");
        if (nameInput) nameInput.value = saved.name;
        await library()?.refreshUi?.();
        setGh(`saved ${saved.name} (${saved.route.length})`);
      } else {
        setGh("loading selected script...");
        const loaded = await loadGithub(select?.value || nameInput?.value || "");
        if (nameInput) nameInput.value = loaded.name;
        setGh(`loaded ${loaded.name} (${loaded.route.length})`);
      }
    } catch (error) {
      setGh(error?.message || String(error));
    } finally { target.disabled = false; }
  }

  restoreOldGuard();
  document.addEventListener("click", captureGithub, true);
  const installTimer = window.setInterval(() => { wrapCave(); injectControls(); installPathGuard(); }, 250);
  const waitTimer = window.setInterval(tick, 50);

  const cleanupTimer = window.setInterval(() => {
    const b = bot();
    if (!b?.addCleanup || b.__minuteWaitCleanupAdded) return;
    b.__minuteWaitCleanupAdded = true;
    b.addCleanup(() => {
      window.clearInterval(installTimer);
      window.clearInterval(waitTimer);
      window.clearInterval(cleanupTimer);
      document.removeEventListener("click", captureGithub, true);
      restoreOldGuard();
      window.__minibiaCaveWaitDelayInstalled = false;
    });
  }, 250);
})();
