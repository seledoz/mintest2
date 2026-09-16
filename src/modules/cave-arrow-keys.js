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
    pendingStep: null,
    stepRetries: 0,
    dpadButtons: null,
  };

  // D-walk has its own A* route planner and always treats damaging fields as
  // traversable. Smart A / cave.js pathfinding is not modified.
  const config = {
    matrixCacheMs: 250,
    stepRetryMs: 250,
    maxStepRetries: 3,
  };

  const matrixCache = new Map();
  const damagingFieldPattern = /(?:fire|poison|energy)\s*(?:field|wall|damage|ground|tile)/i;

  function normalizePosition(value) {
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function sameTile(left, right) {
    const a = normalizePosition(left), b = normalizePosition(right);
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
    const values = [
      definition?.properties?.name,
      definition?.name,
      thing?.name,
      thing?.type,
      thing?.category,
      thing?.properties?.name,
      thing?.properties?.type,
      thing?.properties?.category,
    ];
    return values.filter((value) => value != null).map((value) => String(value)).join(" ").trim().toLowerCase();
  }

  function getTileThings(tile) {
    if (!tile) return [];
    const things = [];
    const add = (value) => {
      if (!value) return;
      if (Array.isArray(value)) value.forEach(add);
      else if (!things.includes(value)) things.push(value);
    };
    if (tile.id) add(tile);
    add(tile.items);
    add(tile.things);
    add(tile.topThing);
    try { add(tile.getItems?.()); } catch (_) {}
    try { add(tile.getThings?.()); } catch (_) {}
    try { add(tile.getTopThing?.()); } catch (_) {}
    return things;
  }

  function getDamagingFieldName(tile) {
    if (!tile) return null;
    for (const thing of getTileThings(tile)) {
      const name = getThingName(thing);
      if (damagingFieldPattern.test(name)) return name;
    }
    // Some client tile implementations expose the field only on the tile
    // itself rather than inside items/things. Inspect the common descriptive
    // properties without changing normal walkability handling.
    const tileText = [
      tile?.name,
      tile?.type,
      tile?.category,
      tile?.properties?.name,
      tile?.properties?.type,
      tile?.properties?.category,
      tile?.topThing?.name,
      tile?.topThing?.type,
    ].filter((value) => value != null).map((value) => String(value)).join(" ").trim().toLowerCase();
    return damagingFieldPattern.test(tileText) ? tileText : null;
  }

  function isDamagingFieldTile(tile) {
    return !!getDamagingFieldName(tile);
  }

  function getTileAt(position) {
    const pos = normalizePosition(position);
    if (!pos) return null;
    try {
      return window.gameClient?.world?.getTileFromWorldPosition?.(new Position(pos.x, pos.y, pos.z)) || null;
    } catch (_) { return null; }
  }

  // Important: the CURRENT tile may itself be a non-walkable field. We only
  // need the destination/neighbor to be enterable, so the player's starting
  // tile must never make the A* search fail. Damaging fields are explicitly
  // passable regardless of tile.isWalkable().
  function isDWalkPassable(tile) {
    if (!tile) return false;
    if (isDamagingFieldTile(tile)) return true;
    try {
      return typeof tile.isWalkable === "function" && tile.isWalkable();
    } catch (_) { return false; }
  }

  function getMatrix(z, start, goal) {
    const cacheKey = String(z);
    const cached = matrixCache.get(cacheKey);
    if (cached && Date.now() - cached.at <= config.matrixCacheMs) {
      const matrix = cached.matrix;
      // Always refresh the start/goal tiles so a field that appeared/changed
      // after the cache was created cannot make D-walk report "no way".
      for (const position of [start, goal]) {
        if (!position || position.z !== z) continue;
        const tile = getTileAt(position);
        if (tile) matrix.set(`${position.x},${position.y}`, {
          passable: isDWalkPassable(tile), field: isDamagingFieldTile(tile),
        });
      }
      return matrix;
    }

    const matrix = new Map();
    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) {
        const pos = normalizePosition(tile?.__position);
        if (!pos || pos.z !== z) continue;
        matrix.set(`${pos.x},${pos.y}`, {
          passable: isDWalkPassable(tile),
          field: isDamagingFieldTile(tile),
        });
      }
    }

    // The player's current tile is allowed as an A* starting node even when
    // the game marks the damaging field as non-walkable.
    for (const position of [start, goal]) {
      if (!position || position.z !== z) continue;
      const tile = getTileAt(position);
      if (tile) matrix.set(`${position.x},${position.y}`, {
        passable: isDWalkPassable(tile), field: isDamagingFieldTile(tile),
      });
    }
    if (start) matrix.set(`${start.x},${start.y}`, { passable: true, field: isDamagingFieldTile(getTileAt(start)) });

    matrixCache.set(cacheKey, { matrix, at: Date.now() });
    return matrix;
  }

  function getNeighbors(node, matrix) {
    const directions = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
    ];
    return directions
      .map((d) => ({ x: node.x + d.x, y: node.y + d.y, z: node.z }))
      .filter((p) => matrix.get(`${p.x},${p.y}`)?.passable);
  }

  function heuristic(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  function reconstructPath(node) {
    const path = [];
    for (let current = node; current; current = current.parent) {
      path.unshift({ x: current.x, y: current.y, z: current.z });
    }
    return path;
  }

  function findPathAStar(start, goal) {
    const from = normalizePosition(start), to = normalizePosition(goal);
    if (!from || !to || from.z !== to.z) return null;
    if (sameTile(from, to)) return [from];

    const matrix = getMatrix(from.z, from, to);
    // Do not reject the current tile because it is a damaging field.
    matrix.set(`${from.x},${from.y}`, { passable: true, field: isDamagingFieldTile(getTileAt(from)) });

    // A destination field is also explicitly enterable.
    const destinationTile = getTileAt(to);
    if (destinationTile && isDamagingFieldTile(destinationTile)) {
      matrix.set(`${to.x},${to.y}`, { passable: true, field: true });
    }

    const open = [{ ...from, g: 0, f: heuristic(from, to), parent: null }];
    const closed = new Set();
    const key = (p) => `${p.x},${p.y}`;
    const tolerance = Math.max(1, Number(bot.cave?.config?.waypointTolerance) || 0);

    while (open.length) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bestIndex].f) bestIndex = i;
      const current = open.splice(bestIndex, 1)[0];
      if (heuristic(current, to) <= tolerance) return reconstructPath(current);
      closed.add(key(current));

      for (const neighbor of getNeighbors(current, matrix)) {
        const neighborKey = key(neighbor);
        if (closed.has(neighborKey)) continue;
        const g = current.g + 1;
        const f = g + heuristic(neighbor, to);
        const existing = open.find((entry) => entry.x === neighbor.x && entry.y === neighbor.y);
        if (existing) {
          if (g < existing.g) { existing.g = g; existing.f = f; existing.parent = current; }
        } else open.push({ ...neighbor, g, f, parent: current });
      }
    }
    return null;
  }

  function pickArrowKey(from, to) {
    const dx = Number(to.x) - Number(from.x), dy = Number(to.y) - Number(from.y);
    if (dx === 1 && dy === 0) return "ArrowRight";
    if (dx === -1 && dy === 0) return "ArrowLeft";
    if (dx === 0 && dy === 1) return "ArrowDown";
    if (dx === 0 && dy === -1) return "ArrowUp";
    return null;
  }

  function getNextSmartStep(from, to) {
    const path = findPathAStar(from, to);
    state.lastPathLength = path ? path.length : 0;
    state.lastNextTile = path?.length > 1 ? { ...path[1] } : null;
    return path?.length > 1 ? path[1] : null;
  }

  function normalizeControlText(value) {
    return String(value || "").replace(/\uFE0E|\uFE0F/g, "").replace(/\s+/g, "").trim().toLowerCase();
  }

  function getButtonDirection(button) {
    const text = normalizeControlText(button?.textContent);
    const label = normalizeControlText(button?.getAttribute?.("aria-label") || button?.getAttribute?.("title") || button?.dataset?.direction || button?.dataset?.key || "");
    const values = new Set([text, label]);
    if (values.has("▲") || values.has("up") || values.has("north") || values.has("arrowup")) return "ArrowUp";
    if (values.has("▶") || values.has("right") || values.has("east") || values.has("arrowright")) return "ArrowRight";
    if (values.has("▼") || values.has("down") || values.has("south") || values.has("arrowdown")) return "ArrowDown";
    if (values.has("◀") || values.has("left") || values.has("west") || values.has("arrowleft")) return "ArrowLeft";
    return null;
  }

  function findDpadButtons() {
    if (state.dpadButtons && Object.values(state.dpadButtons).every((b) => b?.isConnected)) return state.dpadButtons;
    const candidates = Array.from(document.querySelectorAll("button")).map((button) => ({ button, key: getButtonDirection(button) })).filter((e) => e.key);
    for (const entry of candidates) {
      let container = entry.button.parentElement;
      for (let depth = 0; container && depth < 7; depth += 1, container = container.parentElement) {
        const buttons = {};
        for (const button of container.querySelectorAll("button")) {
          const key = getButtonDirection(button);
          if (key && !buttons[key]) buttons[key] = button;
        }
        if (Object.keys(buttons).length === 4) { state.dpadButtons = buttons; return buttons; }
      }
    }
    const fallback = {};
    for (const entry of candidates) if (!fallback[entry.key]) fallback[entry.key] = entry.button;
    state.dpadButtons = Object.keys(fallback).length === 4 ? fallback : null;
    return state.dpadButtons;
  }

  function clickDpadDirection(key, fromPosition, nextTile, fieldName) {
    const button = findDpadButtons()?.[key] || null;
    if (!button) { state.lastError = `Minibia D-pad control not found for ${key}`; return false; }
    try {
      button.click();
      state.lastFieldName = fieldName || null;
      state.lastWalkMethod = fieldName ? `Minibia direct D-pad field step (${key})` : `Minibia direct D-pad step (${key})`;
      state.lastError = null;
      state.pendingStep = { from: { ...fromPosition }, to: { ...nextTile }, key, fieldName: fieldName || null, sentAt: Date.now() };
      state.stepRetries = 0;
      state.lastKey = key;
      state.lastStepAt = Date.now();
      return true;
    } catch (error) { state.lastError = `D-pad movement failed: ${error?.message || error}`; return false; }
  }

  function handlePendingStep(fromPosition) {
    const pending = state.pendingStep;
    if (!pending) return null;
    if (!sameTile(fromPosition, pending.from)) {
      state.pendingStep = null;
      state.stepRetries = 0;
      state.stepCount += 1;
      state.lastStepAt = Date.now();
      if (pending.fieldName) state.fieldStepCount += 1;
      return true;
    }
    if (Date.now() - pending.sentAt < config.stepRetryMs) return true;
    if (state.stepRetries >= config.maxStepRetries) {
      state.lastError = `D-pad step did not move after ${state.stepRetries + 1} attempts`;
      state.pendingStep = null; state.stepRetries = 0; return false;
    }
    state.stepRetries += 1;
    const button = findDpadButtons()?.[pending.key] || null;
    if (!button) { state.lastError = `Minibia D-pad control not found for retry ${pending.key}`; state.pendingStep = null; state.stepRetries = 0; return false; }
    try { button.click(); pending.sentAt = Date.now(); return true; }
    catch (error) { state.lastError = `D-pad retry failed: ${error?.message || error}`; state.pendingStep = null; state.stepRetries = 0; return false; }
  }

  function installPathfinderPatch() {
    const pathfinder = window.gameClient?.world?.pathfinder;
    if (!pathfinder || typeof pathfinder.findPath !== "function") return false;
    if (state.installed && pathfinder.findPath.__caveArrowKeysPatched) return true;
    const originalFindPath = pathfinder.findPath.__caveArrowKeysOriginal || pathfinder.findPath;
    state.originalFindPath = originalFindPath;

    function patchedFindPath(fromValue, toValue, ...args) {
      if (!isArrowModeActive(toValue)) return originalFindPath.call(this, fromValue, toValue, ...args);
      const from = normalizePosition(fromValue), to = normalizePosition(toValue);
      if (!from || !to || from.z !== to.z) return originalFindPath.call(this, fromValue, toValue, ...args);

      const pendingResult = handlePendingStep(from);
      if (pendingResult !== null) return pendingResult;

      const nextTile = getNextSmartStep(from, to);
      if (!nextTile) { state.lastError = "D-walk A* path not found"; return null; }
      const key = pickArrowKey(from, nextTile);
      if (!key) { state.lastError = "D-walk A* next step is not cardinal"; return null; }
      const fieldName = getDamagingFieldName(getTileAt(nextTile));
      return clickDpadDirection(key, from, nextTile, fieldName);
    }

    patchedFindPath.__caveArrowKeysPatched = true;
    patchedFindPath.__caveArrowKeysOriginal = originalFindPath;
    pathfinder.findPath = patchedFindPath;
    state.installed = true;
    return true;
  }

  function ensurePathfinderPatch() {
    if (installPathfinderPatch()) return;
    let attempts = 0;
    const timerId = window.setInterval(() => { attempts += 1; if (installPathfinderPatch() || attempts >= 80) window.clearInterval(timerId); }, 250);
    bot.addCleanup?.(() => window.clearInterval(timerId));
  }

  function status() { return { ...state, config: { ...config } }; }
  function destroy() {
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null; matrixCache.clear(); state.dpadButtons = null; state.pendingStep = null;
  }

  bot.caveArrowKeys = { status, destroy, ensureDropdownOption: () => {} };
  ensurePathfinderPatch();
  return bot.caveArrowKeys;
};
