window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaveArrowKeysModule = function installCaveArrowKeysModule(bot) {
  if (!bot || bot.caveArrowKeys?.destroy) return bot?.caveArrowKeys;

  const state = {
    installed: false,
    originalFindPath: null,
    lastStepAt: 0,
    lastKey: null,
    stepCount: 0,
    uiTimerId: null,
    lastPathLength: 0,
    lastNextTile: null,
    lastError: null,
    lastWalkMethod: null,
  };

  const config = {
    stepCooldownMs: 180,
    matrixCacheMs: 750,
  };

  const matrixCache = new Map();

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

  function getMatrix(z) {
    const key = String(z);
    const cached = matrixCache.get(key);
    if (cached && Date.now() - cached.at <= config.matrixCacheMs) return cached.matrix;

    const matrix = new Map();
    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;
      for (const tile of chunk.tiles) {
        const pos = normalizePosition(tile?.__position);
        if (!pos || pos.z !== z) continue;
        matrix.set(`${pos.x},${pos.y}`, tile.isWalkable ? tile.isWalkable() : false);
      }
    }

    matrixCache.set(key, { matrix, at: Date.now() });
    return matrix;
  }

  function getNeighbors(node, matrix) {
    // Arrow keys only move one cardinal tile at a time. Do not let A* select
    // diagonal steps that a single physical arrow-key walk cannot reproduce.
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

  function directionInfoForKey(key) {
    if (key === "ArrowUp") return { name: "North", lower: "north", numeric: 0 };
    if (key === "ArrowRight") return { name: "East", lower: "east", numeric: 1 };
    if (key === "ArrowDown") return { name: "South", lower: "south", numeric: 2 };
    if (key === "ArrowLeft") return { name: "West", lower: "west", numeric: 3 };
    return null;
  }

  function tryNamedWalkMethod(owner, ownerName, methodName) {
    const method = owner?.[methodName];
    if (typeof method !== "function") return false;
    method.call(owner);
    state.lastWalkMethod = `${ownerName}.${methodName}()`;
    return true;
  }

  function tryGenericWalkMethod(owner, ownerName, methodName, direction) {
    const method = owner?.[methodName];
    if (typeof method !== "function") return false;

    // Minibia client builds have exposed movement helpers with both textual
    // direction names and Tibia's standard 0=N,1=E,2=S,3=W direction values.
    // Prefer the readable direction first and only use the numeric form when
    // the textual call explicitly returns false.
    const result = method.call(owner, direction.lower);
    if (result === false) {
      const numericResult = method.call(owner, direction.numeric);
      if (numericResult === false) return false;
      state.lastWalkMethod = `${ownerName}.${methodName}(${direction.numeric})`;
      return true;
    }

    state.lastWalkMethod = `${ownerName}.${methodName}("${direction.lower}")`;
    return true;
  }

  function walkWithArrowKey(key) {
    const direction = directionInfoForKey(key);
    if (!direction) return false;

    const client = window.gameClient;
    const owners = [
      [client?.player, "gameClient.player"],
      [client?.world, "gameClient.world"],
      [client, "gameClient"],
      [client?.protocol, "gameClient.protocol"],
      [client?.network, "gameClient.network"],
    ];

    const namedMethods = [
      `walk${direction.name}`,
      `move${direction.name}`,
      `sendWalk${direction.name}`,
      `step${direction.name}`,
    ];

    for (const [owner, ownerName] of owners) {
      for (const methodName of namedMethods) {
        try {
          if (tryNamedWalkMethod(owner, ownerName, methodName)) return true;
        } catch (error) {
          state.lastError = `${ownerName}.${methodName}: ${error?.message || error}`;
        }
      }
    }

    const genericMethods = ["walk", "move", "sendWalk", "step"];
    for (const [owner, ownerName] of owners) {
      for (const methodName of genericMethods) {
        try {
          if (tryGenericWalkMethod(owner, ownerName, methodName, direction)) return true;
        } catch (error) {
          state.lastError = `${ownerName}.${methodName}: ${error?.message || error}`;
        }
      }
    }

    state.lastWalkMethod = null;
    state.lastError = `No native game walk method found for ${key}`;
    bot.log("cave Smart A* arrow walk unavailable", {
      key,
      error: state.lastError,
    });
    return false;
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
      state.lastError = "Smart A* produced a non-cardinal arrow step";
      return false;
    }

    if (!walkWithArrowKey(key)) return false;

    state.lastStepAt = now;
    state.lastKey = key;
    state.stepCount += 1;
    bot.log("cave Smart A* arrow-key walk step", {
      key,
      walkMethod: state.lastWalkMethod,
      from: fromPosition,
      nextTile,
      waypoint: toPosition,
      pathLength: state.lastPathLength,
      stepCount: state.stepCount,
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
    arrowOption.textContent = "Smart A* + Arrow Keys";

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
      lastPathLength: state.lastPathLength,
      lastNextTile: state.lastNextTile,
      lastError: state.lastError,
      lastWalkMethod: state.lastWalkMethod,
    };
  }

  function destroy() {
    uninstallPathInterceptor();
    if (state.uiTimerId != null) window.clearInterval(state.uiTimerId);
    state.uiTimerId = null;
  }

  bot.caveArrowKeys = {
    installPathInterceptor,
    uninstallPathInterceptor,
    ensureDropdownOption,
    status,
    destroy,
    config,
  };

  installPathInterceptor();
  ensureDropdownOption();
  state.uiTimerId = window.setInterval(ensureDropdownOption, 1000);
  bot.addCleanup(destroy);
  return bot.caveArrowKeys;
};