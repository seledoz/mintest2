// Minibia client compatibility bridge for scrambled client build 2026-11-01-1001.
// Install before core.js and all modules. The native World is created only
// after server data arrives, so world/pathfinder access must remain lazy.
(() => {
  if (window.__minibiaBotClientCompat?.installed && window.__minibiaBotClientCompat?.version >= 8) return;

  let nativeClient = null;
  let NativePosition = null;
  let NativeAutoWalkPacket = null;

  try {
    // The adaptive module resolves the randomized global-lexical GameClient
    // binding from the live core/index.js source. No scrambled identifier is
    // stored in this bridge.
    nativeClient = window.__minibiaBotAdaptive?.resolveClient?.() || null;
    NativePosition = nativeClient?.player?.__position?.constructor || null;
    NativeAutoWalkPacket = window.__minibiaBotAdaptive?.getAutoWalkConstructor?.() || null;
  } catch (error) {
    console.warn("[minibia-bot] client compatibility probe failed", error);
  }

  if (!nativeClient) {
    console.warn("[minibia-bot] client compatibility unavailable: native client binding not found");
    window.__minibiaBotClientCompat = { installed: false, reason: "missing-client-binding" };
    return;
  }

  const bindMethod = (target, value) =>
    typeof value === "function" ? value.bind(target) : value;

  // Re-read the known scrambled lexical client bindings when resolving live
  // world/pathfinder/packet references. This avoids pinning the bridge forever
  // to the client instance that existed when the module first loaded.
  const refreshNativeClient = () => {
    const adaptive = window.__minibiaBotAdaptive;
    const resolved = adaptive?.resolveClient?.() || null;
    if (resolved && resolved !== nativeClient) {
      nativeClient = resolved;
      try { adaptive?.inspect?.(nativeClient); } catch (_) {}
      try {
        NativePosition = nativeClient?.player?.__position?.constructor || NativePosition;
        NativeAutoWalkPacket = adaptive?.getAutoWalkConstructor?.() || NativeAutoWalkPacket;
      } catch (_) {}
      try { refreshNativeManagers(); } catch (_) {}
    }
    return nativeClient;
  };

  const resolveWorld = () => {
    const client = refreshNativeClient();
    try { return client?.world || null; } catch (_) { return null; }
  };

  // Discover the native attack action by stable behavior, not scrambled helper names.
  // The action iterates a Set of creatures and updates the Player target.
  // Candidate methods are inspected only; discovery never invokes them.
  const resolveNativeAttackMethod = (world) => {
    if (!world) return null;
    const candidates = [];
    for (const value of getPropertyValues(world)) {
      if (typeof value !== "function") continue;
      let source = "";
      try { source = Function.prototype.toString.call(value); } catch (_) {}
      if (!source.includes("setTarget")) continue;
      // The scrambler may rewrite member calls as bracket notation:
      // obj.values().next() -> obj['values']()['next']().
      const hasSetIteration =
        /(?:\.values|\[['"]values['"]\])\s*\(/.test(source) &&
        /(?:\.next|\[['"]next['"]\])\s*\(/.test(source);
      if (!hasSetIteration) continue;
      const callsSetTarget = /(?:\.setTarget|\[['"]setTarget['"]\])\s*\(/.test(source);
      if (!callsSetTarget) continue;
      let score = 4;
      if (/new Set\s*\(/.test(source)) score += 2;
      if (/Creature/.test(source)) score += 2;
      if (/new [A-Za-z_$][\w$]*\s*\(/.test(source)) score += 1;
      candidates.push({ method: value, score });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 1 && candidates[0].score === candidates[1].score) return null;
    return candidates[0].method;
  };
  // The game scrambles public property/method names between client builds.
  // Identify the native pathfinder by its stable state shape rather than
  // depending on one obfuscated world property name.
  const isNativePathfinder = (candidate) => {
    try {
      return !!candidate &&
        Array.isArray(candidate.__pathfindCache) &&
        typeof candidate.search === "function" &&
        typeof candidate.getNextMove === "function" &&
        typeof candidate.__isAutoWalking === "boolean" &&
        Object.prototype.hasOwnProperty.call(candidate, "__finalDestination");
    } catch (_) {
      return false;
    }
  };

  const getPropertyValues = (object) => {
    const values = [];
    const seen = new Set();
    let current = object;
    for (let depth = 0; current && depth < 3; depth += 1, current = Object.getPrototypeOf(current)) {
      for (const key of Object.getOwnPropertyNames(current)) {
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const descriptor = Object.getOwnPropertyDescriptor(current, key);
          // Do not invoke accessors while probing scrambled client internals.
          if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            values.push(descriptor.value);
          }
        } catch (_) {}
      }
    }
    return values;
  };

  const resolvePathfinder = () => {
    const client = refreshNativeClient();
    const world = resolveWorld();
    if (!client || !world) return null;
    const adaptivePathfinder = window.__minibiaBotAdaptive?.resolvePathfinder?.(client);
    if (isNativePathfinder(adaptivePathfinder)) return adaptivePathfinder;
    return getPropertyValues(world).find(isNativePathfinder) || null;
  };

  // The native pathfinder's public start method is scrambled on some builds.
  // Identify it from the stable state transitions it performs rather than its
  // randomized property name. Discovery is read-only: candidate methods are
  // inspected with Function#toString and are never invoked while probing.
  let cachedPathStartTarget = null;
  let cachedPathStartMethod = null;
  let cachedPathStartResolved = false;

  const resolveNativePathStartMethod = (target) => {
    if (!target) return null;
    // The pathfinder object is stable during normal movement. Avoid walking
    // its prototype chain and parsing function source on every Cavebot tick.
    // A new scrambled pathfinder instance automatically invalidates the cache.
    if (target === cachedPathStartTarget && cachedPathStartResolved) {
      return cachedPathStartMethod;
    }

    const candidates = [];
    const seen = new Set();
    for (const value of getPropertyValues(target)) {
      if (typeof value !== "function" || seen.has(value)) continue;
      seen.add(value);
      let source = "";
      try { source = Function.prototype.toString.call(value); } catch (_) {}
      if (!source.includes("__finalDestination") ||
          !source.includes("__isAutoWalking") ||
          !source.includes("__autowalkStartPosition") ||
          !source.includes("__lastPathfindTime")) continue;
      let score = 4;
      if (source.includes("__pathfindCooldown")) score += 2;
      if (source.includes("noteAutowalk")) score += 2;
      if (source.includes("__autoWalkStepsRemaining")) score += 1;
      if (source.includes("isServerMapclickEnabled")) score += 1;
      if (value.length === 2) score += 1;
      candidates.push({ method: value, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    const resolved = candidates.length &&
      !(candidates.length > 1 && candidates[0].score === candidates[1].score)
      ? candidates[0].method
      : null;

    cachedPathStartTarget = target;
    cachedPathStartMethod = resolved;
    cachedPathStartResolved = true;
    return resolved;
  };

  const resolveNativeClearMethod = (target) => {
    for (const value of getPropertyValues(target)) {
      if (typeof value !== "function") continue;
      let source = "";
      try { source = Function.prototype.toString.call(value); } catch (_) {}
      if (source.includes("__finalDestination") &&
          source.includes("__pathfindCache") &&
          source.includes("__autoWalkStepsRemaining") &&
          source.includes("__pendingUseObject")) return value;
    }
    return null;
  };

  // These proxies intentionally exist before login/world initialization.
  // Each access resolves the current native instance, avoiding stale
  // scrambled bindings captured during early loader startup.
  const pathfinder = new Proxy({}, {
    get(_proxy, property) {
      const target = resolvePathfinder();
      if (!target) return undefined;
      if (property === "findPath") {
        return (from, destination) => {
          const current = resolvePathfinder();
          const nativePathStart = current && resolveNativePathStartMethod(current);
          if (typeof nativePathStart !== "function") return false;
          if (!from || !destination ||
              !Number.isFinite(Number(from.x)) ||
              !Number.isFinite(Number(from.y)) ||
              !Number.isFinite(Number(from.z)) ||
              !Number.isFinite(Number(destination.x)) ||
              !Number.isFinite(Number(destination.y)) ||
              !Number.isFinite(Number(destination.z))) return false;
          nativePathStart.call(current, from, destination, false);
          return true;
        };
      }
      if (property === "setPathfindCache") {
        return (...args) => {
          const current = resolvePathfinder();
          if (!current) return false;
          if (args[0] === null) {
            const nativeClear = resolveNativeClearMethod(current);
            if (typeof nativeClear !== "function") return false;
            nativeClear.call(current, null);
            return true;
          }
          current.__pathfindCache = args[0];
          return true;
        };
      }
      if (property === "stop") {
        return () => {
          const current = resolvePathfinder();
          const nativeClear = current && resolveNativeClearMethod(current);
          if (typeof nativeClear !== "function") return false;
          nativeClear.call(current, null);
          return true;
        };
      }
      return bindMethod(target, Reflect.get(target, property, target));
    },
    set(_proxy, property, value) {
      const target = resolvePathfinder();
      if (!target) return false;
      return Reflect.set(target, property, value, target);
    },
    has(_proxy, property) {
      const target = resolvePathfinder();
      return !!target && property in target;
    }
  });

  const world = new Proxy({}, {
    get(_proxy, property) {
      if (property === "pathfinder") return pathfinder;
      const target = resolveWorld();
      if (!target) return undefined;
      return bindMethod(target, Reflect.get(target, property, target));
    },
    set(_proxy, property, value) {
      const target = resolveWorld();
      if (!target) return false;
      return Reflect.set(target, property, value, target);
    },
    has(_proxy, property) {
      const target = resolveWorld();
      return !!target && property in target;
    }
  });

  // Resolve UI/input managers by their runtime shape instead of stale scrambled keys.
  const getDataProperty = (object, property) => {
    let current = object;
    for (let depth = 0; current && depth < 4; depth += 1) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(current, property);
        if (descriptor) {
          return Object.prototype.hasOwnProperty.call(descriptor, "value")
            ? descriptor.value
            : undefined;
        }
        current = Object.getPrototypeOf(current);
      } catch (_) { return undefined; }
    }
    return undefined;
  };

  const findNestedObject = (root, predicate, maxDepth = 6) => {
    const queue = [{ value: root, depth: 0 }];
    const seen = new Set();
    let inspected = 0;
    while (queue.length && inspected < 2500) {
      const entry = queue.shift();
      const value = entry?.value;
      if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) continue;
      seen.add(value);
      inspected += 1;
      try { if (predicate(value)) return value; } catch (_) {}
      if (entry.depth >= maxDepth || value === window || value === document ||
          value instanceof Element || value instanceof Node) continue;
      let names = [];
      try { names = Object.getOwnPropertyNames(value); } catch (_) { continue; }
      for (const key of names) {
        if (key === "constructor" || key === "prototype" || key === "caller" || key === "callee") continue;
        try {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            const child = descriptor.value;
            if (child && (typeof child === "object" || typeof child === "function")) {
              queue.push({ value: child, depth: entry.depth + 1 });
            }
          }
        } catch (_) {}
      }
    }
    return null;
  };

  let nativeChatManager = null;
  let nativeHotbarManager = null;
  let nativeMouse = null;
  let channelManager = null;
  let managerClient = null;

  const refreshNativeManagers = () => {
    const currentClient = refreshNativeClient();
    if (!currentClient || managerClient === currentClient) return;
    managerClient = currentClient;

    nativeChatManager = findNestedObject(currentClient, candidate => {
      const channels = getDataProperty(candidate, "channels");
      return Array.isArray(channels) && channels.some(channel =>
        Array.isArray(getDataProperty(channel, "__contents"))
      );
    }) || null;

    nativeHotbarManager = findNestedObject(currentClient, candidate => {
      const slots = getDataProperty(candidate, "slots");
      return Array.isArray(slots) && slots.some(slot => {
        const canvas = getDataProperty(slot, "canvas");
        const element = getDataProperty(canvas, "canvas");
        return !!element && typeof element.click === "function";
      });
    }) || null;

    nativeMouse = (() => {
      try {
        return currentClient.mouse ||
          findNestedObject(currentClient, candidate =>
            typeof getDataProperty(candidate, "__handleItemUseWith") === "function" &&
            (typeof getDataProperty(candidate, "use") === "function" ||
             typeof getDataProperty(candidate, "move") === "function")
          );
      } catch (_) { return null; }
    })();

    channelManager = nativeChatManager ? new Proxy(nativeChatManager, {
      get(target, property) {
        if (property === "sendMessageText") {
          return (message) => {
            const sendText = getDataProperty(target, "sendMessageText");
            if (typeof sendText !== "function") return false;
            const text = String(message ?? "").trim();
            if (!text) return false;
            sendText.call(target, text);
            return true;
          };
        }
        return bindMethod(target, Reflect.get(target, property, target));
      }
    }) : null;
  };

  refreshNativeManagers();

  const interfaceBridge = {
    get channelManager() {
      refreshNativeManagers();
      return channelManager;
    },
    get hotbarManager() {
      refreshNativeManagers();
      return nativeHotbarManager || null;
    }
  };

  const clientBridge = new Proxy(nativeClient, {
    get(_target, property) {
      const target = refreshNativeClient();
      if (!target) return undefined;
      if (property === "world") return world;
      if (property === "mouse") { refreshNativeManagers(); return target.mouse || nativeMouse || bindMethod(target, Reflect.get(target, property, target)); }
      if (property === "interface") return interfaceBridge;
      if (property === "itemDefinitionsByCid" || property === "itemDefinitions") {
        return target.itemDefinitionsByCid || target.itemDefinitions || null;
      }
      if (property === "itemDefinitionsBySid") return null;
      if (property === "send") return undefined;
      return bindMethod(target, Reflect.get(target, property, target));
    },
    set(_target, property, value) {
      const target = refreshNativeClient();
      return !!target && Reflect.set(target, property, value, target);
    },
    has(_target, property) {
      const target = refreshNativeClient();
      return !!target && property in target;
    }
  });

  const descriptor = Object.getOwnPropertyDescriptor(window, "gameClient");
  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(window, "gameClient", {
      configurable: true,
      enumerable: descriptor?.enumerable ?? false,
      writable: false,
      value: clientBridge
    });
  } else {
    console.warn("[minibia-bot] cannot install client bridge: window.gameClient is not configurable");
    window.__minibiaBotClientCompat = { installed: false, reason: "gameClient-not-configurable" };
    return;
  }

  // Resolve Position from the live player instance as a fallback. In this
  // client build the class binding is module-scoped and may not be visible
  // to eval, even though player.__position is an instance of that class.
  // The getter also handles the bridge loading before the player exists.
  if (typeof window.Position !== "function") {
    const positionDescriptor = Object.getOwnPropertyDescriptor(window, "Position");
    if (!positionDescriptor || positionDescriptor.configurable) {
      Object.defineProperty(window, "Position", {
        configurable: true,
        enumerable: true,
        get() {
          if (typeof NativePosition !== "function") {
            const livePosition = nativeClient?.player?.__position;
            if (typeof livePosition?.constructor === "function") {
              NativePosition = livePosition.constructor;
            }
          }
          return NativePosition || undefined;
        },
        set(value) {
          if (typeof value === "function") NativePosition = value;
        }
      });
    }
  }
  // The current client keeps AutoWalk's constructor module-scoped. The adaptive
  // observer learns it from a genuine packet emitted by native client pathing.
  if (typeof window.AutoWalkPacket !== "function") {
    window.AutoWalkPacket = function AutoWalkPacket(directions) {
      const adaptivePacket = window.__minibiaBotAdaptive?.createAutoWalkPacket?.(directions);
      if (adaptivePacket) return adaptivePacket;
      if (typeof NativeAutoWalkPacket === "function") return new NativeAutoWalkPacket(directions);
      throw new Error("Native AutoWalk packet has not been observed yet. Use the game's normal click-to-walk once, then retry.");
    };
  }

  // Item movement stays disabled until the native ItemMove constructor is
  // discovered from a genuine client action; do not synthesize an unverified
  // wire packet or risk sending malformed inventory operations.
  const sendItemMove = () => false;

  // Seed the adaptive observer with the resolved lexical client immediately.
  // This installs only a passive wrapper around the verified native dispatcher;
  // it observes genuine packets and never sends or fabricates one.
  try { window.__minibiaBotAdaptive?.inspect?.(nativeClient); } catch (_) {}
  // Resolve the verified dispatcher at call time so a renamed dispatcher or
  // replacement client is not hidden behind a startup-time closure.
  const resolveCurrentPacketDispatch = () => {
    const client = refreshNativeClient();
    try { window.__minibiaBotAdaptive?.inspect?.(client); } catch (_) {}
    return window.__minibiaBotAdaptive?.resolvePacketDispatch?.(client) || null;
  };
  const nativeSend = function verifiedNativePacketDispatch(packet) {
    const dispatch = resolveCurrentPacketDispatch();
    if (!dispatch || typeof dispatch.call !== "function") return false;
    dispatch.call(packet);
    return true;
  };
  window.__minibiaBotClientCompat = {
    installed: true,
    version: 8,
    build: "adaptive-structural-v12-native-path-start",
    client: clientBridge,
    get nativeClient() { return refreshNativeClient(); },
    world,
    pathfinder,
    get nativeAttackAvailable() {
      return typeof resolveNativeAttackMethod(resolveWorld()) === "function";
    },
    get nativeAttackDiagnostics() {
      const currentWorld = resolveWorld();
      const method = resolveNativeAttackMethod(currentWorld);
      return {
        available: typeof method === "function",
        worldAvailable: !!currentWorld,
        playerAvailable: !!refreshNativeClient()?.player,
        playerTargetAvailable: !!refreshNativeClient()?.player &&
          ("__target" in refreshNativeClient().player || typeof refreshNativeClient().player.setTarget === "function"),
        methodArity: typeof method === "function" ? method.length : null
      };
    },
    attackCreature(creature) {
      const currentWorld = resolveWorld();
      const nativeAttack = resolveNativeAttackMethod(currentWorld);
      if (!creature || (typeof creature !== "object" && typeof creature !== "function") ||
          typeof nativeAttack !== "function") return false;
      try {
        nativeAttack.call(currentWorld, new Set([creature]));
        return true;
      } catch (error) {
        console.warn("[minibia-bot] native attack dispatch failed", error);
        return false;
      }
    },
    get worldAvailable() { return !!resolveWorld(); },
    get pathfinderAvailable() { return !!resolvePathfinder(); },
    get nativePathStartAvailable() {
      const current = resolvePathfinder();
      return typeof resolveNativePathStartMethod(current) === "function";
    },
    get itemDefinitionsAvailable() { const current = refreshNativeClient(); return !!(current?.itemDefinitionsByCid || current?.itemDefinitions); },
    get adaptiveDiscovery() { const client = refreshNativeClient(); return window.__minibiaBotAdaptive?.inspect?.(client) || null; },
    get packetDispatchMethod() { return resolveCurrentPacketDispatch()?.key || null; },
    get autoWalkAvailable() {
      return typeof nativeSend === "function" &&
        (typeof window.__minibiaBotAdaptive?.getAutoWalkConstructor?.() === "function" ||
         typeof NativeAutoWalkPacket === "function");
    },
    supportedPackets: ["AutoWalkPacket"],
    itemMoveAvailable: false,
    chatManagerAvailable: !!nativeChatManager,
    hotbarManagerAvailable: !!nativeHotbarManager,
    mouseAvailable: !!nativeMouse,
    sendItemMove,
    sendAutoWalk(packet) {
      const adaptiveMatch = window.__minibiaBotAdaptive?.isAutoWalkPacket?.(packet) === true;
      const legacyMatch = typeof NativeAutoWalkPacket === "function" && packet instanceof NativeAutoWalkPacket;
      if ((!adaptiveMatch && !legacyMatch) || typeof nativeSend !== "function") return false;
      return nativeSend(packet);
    }
  };

  console.info("[minibia-bot] client compatibility bridge installed", {
    build: "2026-11-01-1001",
    worldAvailable: !!resolveWorld(),
    pathfinderAvailable: !!resolvePathfinder(),
    itemDefinitionsAvailable: !!(nativeClient.itemDefinitionsByCid || nativeClient.itemDefinitions),
    autoWalkAvailable: typeof nativeSend === "function" && (typeof window.__minibiaBotAdaptive?.getAutoWalkConstructor?.() === "function" || typeof NativeAutoWalkPacket === "function")
  });
})();
