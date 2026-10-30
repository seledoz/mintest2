// Minibia client compatibility bridge for client build 2026-10-30-1003.
// Install before core.js and all modules. The native World is created only
// after server data arrives, so world/pathfinder access must remain lazy.
(() => {
  if (window.__minibiaBotClientCompat?.installed) return;

  let nativeClient = null;
  let NativePosition = null;
  let NativeAutoWalkPacket = null;

  try {
    nativeClient = eval("typeof vfdOywKJESRq !== 'undefined' ? vfdOywKJESRq : null");
    NativePosition = eval("typeof zeOvojmNkQxY === 'function' ? zeOvojmNkQxY : null");
    NativeAutoWalkPacket = eval("typeof twTOLoGSHp === 'function' ? twTOLoGSHp : null");
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

  const resolveWorld = () => nativeClient.world || null;
  const resolvePathfinder = () => resolveWorld()?.JRdXiDhlI || null;

  // These proxies intentionally exist before login/world initialization.
  // Each access resolves the current native instance, avoiding a stale
  // undefined world captured during early loader startup.
  const pathfinder = new Proxy({}, {
    get(_proxy, property) {
      const target = resolvePathfinder();
      if (!target) return undefined;
      if (property === "findPath") {
        return (from, destination) => {
          const current = resolvePathfinder();
          if (typeof current?.jPGVnvNRwfr !== "function") return false;
          return current.jPGVnvNRwfr(from, destination, true);
        };
      }
      if (property === "setPathfindCache") {
        return (...args) => {
          const current = resolvePathfinder();
          if (typeof current?.dHXHTcuFKROf !== "function") return false;
          return current.dHXHTcuFKROf(...args);
        };
      }
      if (property === "stop") {
        return () => {
          const current = resolvePathfinder();
          if (typeof current?.dHXHTcuFKROf !== "function") return false;
          return current.dHXHTcuFKROf(null);
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

  const nativeUi = nativeClient.kYgIgXceQLD;
  const nativeChatManager = nativeUi?.uVvWDBBxDT;
  const nativeHotbarManager = nativeUi?.RocGUBNConYq;

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
      if (property === "interface") return interfaceBridge;
      if (property === "itemDefinitionsByCid" || property === "itemDefinitions") {
        return target.TPWhmLyqyrg || null;
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

  if (NativePosition && typeof window.Position !== "function") {
    window.Position = NativePosition;
  }
  if (NativeAutoWalkPacket && typeof window.AutoWalkPacket !== "function") {
    window.AutoWalkPacket = function AutoWalkPacket(directions) {
      return new NativeAutoWalkPacket(directions);
    };
  }

  const nativeSend = nativeClient.aWSxdABvSpX;
  window.__minibiaBotClientCompat = {
    installed: true,
    build: "2026-10-30-1003",
    client: clientBridge,
    nativeClient,
    world,
    pathfinder,
    get worldAvailable() { return !!resolveWorld(); },
    get pathfinderAvailable() { return !!resolvePathfinder(); },
    itemDefinitionsAvailable: !!nativeClient.TPWhmLyqyrg,
    autoWalkAvailable: !!NativeAutoWalkPacket && typeof nativeSend === "function",
    supportedPackets: ["AutoWalkPacket"],
    sendAutoWalk(packet) {
      if (!NativeAutoWalkPacket || typeof nativeSend !== "function" ||
          !(packet instanceof NativeAutoWalkPacket)) return false;
      nativeSend.call(nativeClient, packet);
      return true;
    }
  };

  console.info("[minibia-bot] client compatibility bridge installed", {
    build: "2026-10-30-1003",
    worldAvailable: !!resolveWorld(),
    pathfinderAvailable: !!resolvePathfinder(),
    itemDefinitionsAvailable: !!nativeClient.TPWhmLyqyrg,
    autoWalkAvailable: !!NativeAutoWalkPacket && typeof nativeSend === "function"
  });
})();
