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

  // D-walk keeps the D-pad as its movement executor.  The route planner is
  // A*-style, but it is cardinal because the D-pad only has four directions.
  const config = {
    matrixCacheMs: 750,
    stepRetryMs: 450,
    maxStepRetries: 3,
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
    if (!caveStatus?.running) return false;
    if (caveStatus?.config?.pathfinderMode !== "arrow") return false;
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
    if (!tile) return null;
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

  // Fire/poison/energy fields are ALWAYS traversable for D-walk.
  function isDWalkPassable(tile) {
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
        matrix.set(`${pos.x},${pos.y}`, {
          passable: isDWalkPassable(tile),
          field: isDamagingFieldTile(tile),
        });
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
      .filter((position) => matrix.get(`${position.x},${position.y}`)?.passable);
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
    const tolerance = Math.max(1, Number(bot.cave?.config?.waypointTolerance) || 0);

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

  function normalizeControlText(value) {
    return String(value || "")
      .replace(/\uFE0E|\uFE0F/g, "")
      .replace(/\s+/g, "")
      .trim()
      .toLowerCase();
  }

  function getButtonDirection(button) {
    const text = normalizeControlText(button?.textContent);
    const label = normalizeControlText(
      button?.getAttribute?.("aria-label")
      || button?.getAttribute?.("title")
      || button?.dataset?.direction
      || button?.dataset?.key
      || ""
    );
    const values = new Set([text, label]);
    if (values.has("▲") || values.has("up") || values.has("north") || values.has("arrowup")) return "ArrowUp";
    if (values.has("▶") || values.has("right") || values.has("east") || values.has("arrowright")) return "ArrowRight";
    if (values.has("▼") || values.has("down") || values.has("south") || values.has("arrowdown")) return "ArrowDown";
    if (values.has("◀") || values.has("left") || values.has("west") || values.has("arrowleft")) return "ArrowLeft";
    return null;
  }

  function findDpadButtons() {
    if (state.dpadButtons
      && Object.values(state.dpadButtons).every((button) => button?.isConnected)) {
      return state.dpadButtons;
    }

    const candidates = Array.from(document.querySelectorAll("button"))
      .map((button) => ({ button, key: getButtonDirection(button) }))
      .filter((entry) => entry.key);

    for (const entry of candidates) {
      let container = entry.button.parentElement;
      for (let depth = 0; container && depth < 7; depth += 1, container = container.parentElement) {
        const buttons = {};
        for (const button of container.querySelectorAll("button")) {
          const key = getButtonDirection(button);
          if (key && !buttons[key]) buttons[key] = button;
        }
        if (Object.keys(buttons).length === 4) {
          state.dpadButtons = buttons;
          return buttons;
        }
      }
    }

    const fallback = {};
    for (const entry of candidates) if (!fallback[entry.key]) fallback[entry.key] = entry.button;
    state.dpadButtons = Object.keys(fallback).length === 4 ? fallback : null;
    return state.dpadButtons;
  }

  function clickDpadDirection(key, fromPosition, nextTile, fieldName) {
    const button = findDpadButtons()?.[key] || null;
    if (!button) {
      state.lastError = `Minibia D-pad control not found for ${key}`;
      state.lastWalkMethod = null;
      return false;
    }

    try {
      button.click();
      state.lastFieldName = fieldName || null;
      state.lastWalkMethod = fieldName
        ? `Minibia direct D-pad field step (${key})`
        : `Minibia direct D-pad step (${key})`;
      state.lastError = null;
      state.pendingStep = {
        from: { ...fromPosition },
        to: { ...nextTile },
        key,
        fieldName: fieldName || null,
        sentAt: Date.now(),
      };
      state.stepRetries = 0;
      bot.log("cave D-walk step requested", {
        key,
        from: fromPosition,
        nextTile,
        field: fieldName || null,
      });
      return true;
    } catch (error) {
      state.lastError = `D-pad movement failed: ${error?.message || error}`;
      state.lastWalkMethod = null;
      return false;
    }
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
      bot.log("cave D-walk step confirmed", {
        key: pending.key,
        from: pending.from,
        expected: pending.to,
        actual: fromPosition,
        field: pending.fieldName,
        fieldStepCount: state.fieldStepCount,
      });
      return true;
    }

    if (Date.now() - pending.sentAt < config.stepRetryMs) return true;
    if (state.stepRetries >= config.maxStepRetries) {
      state.lastError = `D-pad step did not move after ${state.stepRetries + 1} attempts`;
      state.pendingStep = null;
      state.stepRetries = 0;
      return false;
    }

    state.stepRetries += 1;
    const button = findDpadButtons()?.[pending.key] || null;
    if (!button) {
      state.lastError = `Minibia D-pad control not found for retry ${pending.key}`;
      state.pendingStep = null;
      state.stepRetries = 0;
      return false;
    }
    try {
      button.click();
      pending.sentAt = Date.now();
      bot.log("cave D-walk step retry", {
        key: pending.key,
        attempt: state.stepRetries + 1,
        field: pending.fieldName,
      });
      return true;
    } catch (error) {
      state.lastError = `D-pad retry failed: ${error?.message || error}`;
      state.pendingStep = null;
      state.stepRetries = 0;
      return false;
    }
  }

  function installPathfinderPatch() {
    const pathfinder = window.gameClient?.world?.pathfinder;
    if (!pathfinder || typeof pathfinder.findPath !== "function") return false;
    if (state.installed && pathfinder.findPath.__caveArrowKeysPatched) return true;

    const originalFindPath = pathfinder.findPath.__caveArrowKeysOriginal || pathfinder.findPath;
    state.originalFindPath = originalFindPath;

    function patchedFindPath(fromValue, toValue, ...args) {
      if (!isArrowModeActive(toValue)) {
        return originalFindPath.call(this, fromValue, toValue, ...args);
      }

      const from = normalizePosition(fromValue);
      const to = normalizePosition(toValue);
      if (!from || !to || from.z !== to.z) {
        return originalFindPath.call(this, fromValue, toValue, ...args);
      }

      const pendingResult = handlePendingStep(from);
      if (pendingResult !== null) return pendingResult;

      const nextTile = getNextSmartStep(from, to);
      if (!nextTile) {
        state.lastError = "D-walk A* path not found";
        return null;
      }

      const key = pickArrowKey(from, nextTile);
      if (!key) {
        state.lastError = "D-walk A* next step is not cardinal";
        return null;
      }

      const tile = getTileAt(nextTile);
      const fieldName = getDamagingFieldName(tile);
      state.lastKey = key;
      state.lastStepAt = Date.now();

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
    const timerId = window.setInterval(() => {
      attempts += 1;
      if (installPathfinderPatch() || attempts >= 80) {
        window.clearInterval(timerId);
      }
    }, 250);
    bot.addCleanup?.(() => window.clearInterval(timerId));
  }

  function status() {
    return {
      ...state,
      config: { ...config },
    };
  }

  function destroy() {
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
    matrixCache.clear();
    state.dpadButtons = null;
    state.pendingStep = null;
  }

  bot.caveArrowKeys = { status, destroy, ensureDropdownOption: () => {} };
  ensurePathfinderPatch();
  return bot.caveArrowKeys;
};