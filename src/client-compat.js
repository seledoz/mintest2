// Minibia client compatibility bridge for client build 2026-10-30-1003.
// Install before core.js and all modules. The native World is created only
// after server data arrives, so world/pathfinder access must remain lazy.
window.__minibiaBotClientCompatReady = (async () => {
  if (window.__minibiaBotClientCompat?.installed && window.__minibiaBotClientCompat?.version >= 5) return;

  let nativeClient = null;
  let NativePosition = null;
  let NativeAutoWalkPacket = null;

  try {
    const adaptive = window.__minibiaBotAdaptive;
    if (!adaptive?.installed || adaptive.version < 5) throw new Error("Adaptive discovery v5 is unavailable");
    nativeClient = adaptive.resolveClient?.() || await adaptive.waitForClient({ timeoutMs: 20000 });
    NativePosition = nativeClient?.player?.__position?.constructor || null;
  } catch (error) {
    console.error("[minibia-bot] client compatibility discovery failed", error);
    window.__minibiaBotClientCompat = { installed: false, version: 5, reason: "client-discovery-failed", error: String(error?.message || error) };
    throw error;
  }

  if (!nativeClient) {
    console.warn("[minibia-bot] client compatibility unavailable: native client binding not found");
    window.__minibiaBotClientCompat = { installed: false, reason: "missing-client-binding" };
    return;
  }

  const bindMethod = (target, value) =>
    typeof value === "function" ? value.bind(target) : value;

  const resolveWorld = () => nativeClient.world || null;

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
      const hasSetIteration = /\.values\s*\(/.test(source) && /\.next\s*\(/.test(source);
      if (!hasSetIteration) continue;
      let score = 4;
      if (/new Set\s*\(/.test(source)) score += 2;
      if (/Creature/.test(source)) score += 1;
      if (/\.setTarget\s*\(/.test(source)) score += 1;
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
    const world = resolveWorld();
    if (!world) return null;
    try {
    } catch (_) {}
    const adaptivePathfinder = window.__minibiaBotAdaptive?.resolvePathfinder?.(nativeClient);
    if (isNativePathfinder(adaptivePathfinder)) return adaptivePathfinder;
    return getPropertyValues(world).find(isNativePathfinder) || null;
  };

  const resolveNativePathfindMethod = (target) => {
    for (const value of getPropertyValues(target)) {
      if (typeof value !== "function") continue;
      let source = "";
      try { source = Function.prototype.toString.call(value); } catch (_) {}
      if (source.includes("__isAutoWalking") &&
          source.includes("__pathfindCache") &&
          source.includes("getTileFromWorldPosition") &&
          source.includes("search")) return value;
    }
    return null;
  };

  const resolveNativeClearMethod = (target) => {
    for (const value of getPropertyValues(target)) {
      if (typeof value !== "function") continue;
      let source = "";
      try { source = Function.prototype.toString.call(value); } catch (_) {}
      if (source.includes("__finalDestination") &&
          source.includes("__pathfindCache") &&
          source.includes("__autoWalkStepsRemaining") &&
          source.includes("__pendingUseObject") &&
          source.includes("__autoWalkStepsRemaining")) return value;
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
          const nativeFindPath = current && resolveNativePathfindMethod(current);
          if (typeof nativeFindPath !== "function") return false;
          if (!from || !destination ||
              !Number.isFinite(Number(from.x)) ||
              !Number.isFinite(Number(from.y)) ||
              !Number.isFinite(Number(from.z)) ||
              !Number.isFinite(Number(destination.x)) ||
              !Number.isFinite(Number(destination.y)) ||
              !Number.isFinite(Number(destination.z))) return false;
          return nativeFindPath.call(current, from, destination, true);
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

  const nativeChatManager =
    findNestedObject(nativeClient, candidate => {
      const sendText = getDataProperty(candidate, "HVtvgeiqmk");
      const channels = getDataProperty(candidate, "channels");
      return typeof sendText === "function" ||
        (Array.isArray(channels) && channels.some(channel =>
          Array.isArray(getDataProperty(channel, "__contents"))
        ));
    }) || null;
  const nativeHotbarManager =
    findNestedObject(nativeClient, candidate => {
      const slots = getDataProperty(candidate, "slots");
      return Array.isArray(slots) && slots.some(slot => {
        const canvas = getDataProperty(slot, "canvas");
        const element = getDataProperty(canvas, "canvas");
        return !!element && typeof element.click === "function";
      });
    }) || null;
  const nativeMouse = (() => {
    try {
      return nativeClient.mouse ||
        findNestedObject(nativeClient, candidate =>
          typeof getDataProperty(candidate, "__handleItemUseWith") === "function" &&
          (typeof getDataProperty(candidate, "use") === "function" ||
           typeof getDataProperty(candidate, "move") === "function")
        );
    } catch (_) { return null; }
  })();

  // Keep native chat handling intact (commands, channel selection, PMs, etc.).
  const channelManager = nativeChatManager ? new Proxy(nativeChatManager, {
    get(target, property) {
      if (property === "sendMessageText") {
        return (message) => {
          if (typeof target.HVtvgeiqmk !== "function") return false;
          const text = String(message ?? "").trim();
          if (!text) return false;
          target.HVtvgeiqmk(text, undefined, true);
          return true;
        };
      }
      return bindMethod(target, Reflect.get(target, property, target));
    }
  }) : null;

  const interfaceBridge = {
    channelManager,
    hotbarManager: nativeHotbarManager || null
  };

  const clientBridge = new Proxy(nativeClient, {
    get(target, property) {
      if (property === "world") return world;
      if (property === "mouse") return nativeMouse || bindMethod(target, Reflect.get(target, property, target));
      if (property === "interface") return interfaceBridge;
      if (property === "itemDefinitionsByCid" || property === "itemDefinitions") {
        return null;
      }
      if (property === "itemDefinitionsBySid") return null;
      if (property === "send") return undefined;
      return bindMethod(target, Reflect.get(target, property, target));
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

  const adaptivePacketDispatch = window.__minibiaBotAdaptive?.resolvePacketDispatch?.(nativeClient) || null;
  // Keep the existing call sites stable while routing through the verified
  // native client -> network-manager packet dispatch method.
  const nativeSend = adaptivePacketDispatch
    ? function verifiedNativePacketDispatch(packet) { return adaptivePacketDispatch.call(packet); }
    : null;
  window.__minibiaBotClientCompat = {
    installed: true,
    version: 5,
    build: "adaptive",
    client: clientBridge,
    nativeClient,
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
        playerAvailable: !!nativeClient?.player,
        playerTargetAvailable: !!nativeClient?.player &&
          ("__target" in nativeClient.player || typeof nativeClient.player.setTarget === "function"),
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
    itemDefinitionsAvailable: false,
    get adaptiveDiscovery() { return window.__minibiaBotAdaptive?.inspect?.(nativeClient) || null; },
    packetDispatchMethod: adaptivePacketDispatch?.key || null,
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
      nativeSend.call(nativeClient, packet);
      return true;
    }
  };

  console.info("[minibia-bot] client compatibility bridge installed", {
    build: "adaptive",
    worldAvailable: !!resolveWorld(),
    pathfinderAvailable: !!resolvePathfinder(),
    itemDefinitionsAvailable: false,
    autoWalkAvailable: typeof nativeSend === "function" && (typeof window.__minibiaBotAdaptive?.getAutoWalkConstructor?.() === "function" || typeof NativeAutoWalkPacket === "function")
  });
})();
