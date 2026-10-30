// Minibia client compatibility bridge for client build 2026-10-30-1003.
// Keep this file before core.js and all modules in pz-bot.js.
(() => {
  if (window.__minibiaBotClientCompat?.installed) return;

  let nativeClient = null;
  let NativePosition = null;
  let NativeAutoWalkPacket = null;

  try {
    // The current client exposes these bindings in the global lexical scope,
    // while its public window.gameClient getter is intentionally gated.
    nativeClient = (0, eval)("typeof vfdOywKJESRq !== 'undefined' ? vfdOywKJESRq : null");
    NativePosition = (0, eval)("typeof zeOvojmNkQxY === 'function' ? zeOvojmNkQxY : null");
    NativeAutoWalkPacket = (0, eval)("typeof twTOLoGSHp === 'function' ? twTOLoGSHp : null");
  } catch (error) {
    console.warn("[minibia-bot] client compatibility probe failed", error);
  }

  const nativeWorld = nativeClient?.world;
  const nativePathfinder = nativeWorld?.JRdXiDhlI;
  const nativeItemDefinitions = nativeClient?.TPWhmLyqyrg;
  const nativeSend = nativeClient?.aWSxdABvSpX;

  if (!nativeClient || !nativeWorld || !nativePathfinder) {
    console.warn("[minibia-bot] client compatibility unavailable: required client/world/pathfinder bindings were not found");
    window.__minibiaBotClientCompat = { installed: false, reason: "missing-client-bindings" };
    return;
  }

  const bindMethod = (target, value) =>
    typeof value === "function" ? value.bind(target) : value;

  const pathfinder = new Proxy(nativePathfinder, {
    get(target, property) {
      if (property === "findPath") {
        return (from, destination) => {
          if (typeof target.jPGVnvNRwfr !== "function") return false;
          return target.jPGVnvNRwfr(from, destination, true);
        };
      }
      if (property === "setPathfindCache") {
        return (...args) => {
          if (typeof target.dHXHTcuFKROf !== "function") return false;
          return target.dHXHTcuFKROf(...args);
        };
      }
      if (property === "stop") {
        return () => {
          if (typeof target.dHXHTcuFKROf !== "function") return false;
          return target.dHXHTcuFKROf(null);
        };
      }
      return bindMethod(target, Reflect.get(target, property, target));
    }
  });

  const world = new Proxy(nativeWorld, {
    get(target, property) {
      if (property === "pathfinder") return pathfinder;
      return bindMethod(target, Reflect.get(target, property, target));
    }
  });

  const clientBridge = new Proxy(nativeClient, {
    get(target, property) {
      if (property === "world") return world;
      if (property === "itemDefinitionsByCid" || property === "itemDefinitions") {
        return nativeItemDefinitions || null;
      }
      if (property === "itemDefinitionsBySid") return null;
      if (property === "send") {
        // Only bridge the packet type whose native constructor and sender have
        // been verified on this build. Unknown packet types fail closed.
        return (packet) => {
          if (!NativeAutoWalkPacket || typeof nativeSend !== "function" ||
              !(packet instanceof NativeAutoWalkPacket)) return false;
          nativeSend.call(nativeClient, packet);
          return true;
        };
      }
      return bindMethod(target, Reflect.get(target, property, target));
    }
  });

  // Preserve the existing descriptor's configurability/enumerability while
  // replacing the gated getter with the verified compatibility facade.
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

  window.__minibiaBotClientCompat = {
    installed: true,
    build: "2026-10-30-1003",
    client: clientBridge,
    nativeClient,
    world,
    pathfinder,
    itemDefinitionsAvailable: !!nativeItemDefinitions,
    autoWalkAvailable: !!NativeAutoWalkPacket && typeof nativeSend === "function",
    supportedPackets: ["AutoWalkPacket"]
  };

  console.info("[minibia-bot] client compatibility bridge installed", {
    build: "2026-10-30-1003",
    itemDefinitionsAvailable: !!nativeItemDefinitions,
    autoWalkAvailable: !!NativeAutoWalkPacket && typeof nativeSend === "function"
  });
})();
