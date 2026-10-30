// Minibia client compatibility bridge for client build 2026-10-30-1003.
// Install before core.js and all modules. The native World is created only
// after server data arrives, so world/pathfinder access must remain lazy.
(() => {
  if (window.__minibiaBotClientCompat?.installed) return;

  let nativeClient = null;
  let NativePosition = null;
  let NativeAutoWalkPacket = null;

  try {
    // The 2026-10-30 client creates its live instance in index.js as
    // YPXHlIjOD = new AnkOPljisHyL(). The old obfuscated binding
    // vfdOywKJESRq no longer exists in this build.
    nativeClient = window.__minibiaBotAdaptive?.resolveClient?.()
      || eval("typeof YPXHlIjOD !== 'undefined' ? YPXHlIjOD : null")
      || eval("typeof vfdOywKJESRq !== 'undefined' ? vfdOywKJESRq : null");
    NativePosition = eval("typeof zeOvojmNkQxY === 'function' ? zeOvojmNkQxY : null") || nativeClient?.player?.__position?.constructor || null;
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
      if (isNativePathfinder(world.hNccDTwTki)) return world.hNccDTwTki;
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
          source.includes("DMHavyabcUhA") &&
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
          source.includes("DMHavyabcUhA")) return value;
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

  const nativeUi = (() => { try { return nativeClient.kYgIgXceQLD || null; } catch (_) { return null; } })();
  const nativeChatManager =
    findNestedObject(nativeClient, candidate => {
      const sendText = getDataProperty(candidate, "HVtvgeiqmk");
      const channels = getDataProperty(candidate, "channels");
      return typeof sendText === "function" ||
        (Array.isArray(channels) && channels.some(channel =>
          Array.isArray(getDataProperty(channel, "__contents"))
        ));
    }) || nativeUi?.uVvWDBBxDT || null;
  const nativeHotbarManager =
    findNestedObject(nativeClient, candidate => {
      const slots = getDataProperty(candidate, "slots");
      return Array.isArray(slots) && slots.some(slot => {
        const canvas = getDataProperty(slot, "canvas");
        const element = getDataProperty(canvas, "canvas");
        return !!element && typeof element.click === "function";
      });
    }) || nativeUi?.RocGUBNConYq || null;
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

  // The current client keeps ItemMovePacket inside its module scope, so it
  // is not available as a window/global constructor. Recreate the verified
  // THING_MOVE wire layout and pass only its getBuffer() interface to the
  // native sender. Container moves use: kind=0, reserved uint16=0,
  // containerId uint32, slot uint8. The packet ends with count uint8 and
  // the source item's id uint16 (the client includes this for slot checking).
  let NativeConst = null;
  try {
    NativeConst = eval("typeof CONST !== 'undefined' ? CONST : null");
  } catch (error) {}

  const thingMoveOpcode = Number(NativeConst?.PROTOCOL?.CLIENT?.THING_MOVE);

  function writeUInt16LE(buffer, offset, value) {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >>> 8) & 0xff;
    return offset + 2;
  }

  function writeUInt32LE(buffer, offset, value) {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >>> 8) & 0xff;
    buffer[offset + 2] = (value >>> 16) & 0xff;
    buffer[offset + 3] = (value >>> 24) & 0xff;
    return offset + 4;
  }

  function writeContainerSlot(buffer, offset, reference) {
    const container = reference?.which;
    const index = Number(reference?.index);
    const containerId = Number(container?.__containerId);

    // Equip Ring only moves between equipment and backpack containers.
    // Reject tiles and unknown location types rather than guessing a format.
    if (!container || container.constructor?.name === "Tile" ||
        !Number.isInteger(containerId) || containerId < 0 ||
        containerId > 0xffffffff || !Number.isInteger(index) ||
        index < 0 || index > 0xff) {
      return -1;
    }

    buffer[offset++] = 0;
    offset = writeUInt16LE(buffer, offset, 0);
    offset = writeUInt32LE(buffer, offset, containerId);
    buffer[offset++] = index;
    return offset;
  }

  function sendItemMove(from, to, count) {
    if (typeof nativeSend !== "function" ||
        !Number.isInteger(thingMoveOpcode) || thingMoveOpcode < 0 ||
        thingMoveOpcode > 0xff) return false;

    const amount = Number(count);
    if (!Number.isInteger(amount) || amount < 1 || amount > 0xff) return false;

    const sourceItem = from?.which?.peekItem?.(from.index) ??
      from?.which?.getSlotItem?.(from.index) ?? null;
    const sourceItemId = Number(sourceItem?.id);
    if (!sourceItem || !Number.isInteger(sourceItemId) ||
        sourceItemId < 0 || sourceItemId > 0xffff) return false;

    // Opcode + two 8-byte container references + count + source item id.
    const buffer = new Uint8Array(20);
    let offset = 0;
    buffer[offset++] = thingMoveOpcode;
    offset = writeContainerSlot(buffer, offset, from);
    if (offset < 0) return false;
    offset = writeContainerSlot(buffer, offset, to);
    if (offset < 0) return false;
    buffer[offset++] = amount;
    offset = writeUInt16LE(buffer, offset, sourceItemId);
    if (offset !== buffer.length) return false;

    // Native NetworkManager.send only consumes packet.getBuffer().
    nativeSend.call(nativeClient, { getBuffer: () => buffer });
    return true;
  }

  const adaptivePacketDispatch = window.__minibiaBotAdaptive?.resolvePacketDispatch?.(nativeClient) || null;
  // Keep the existing call sites stable while routing through the verified
  // native client -> network-manager packet dispatch method.
  const nativeSend = adaptivePacketDispatch
    ? function verifiedNativePacketDispatch(packet) { return adaptivePacketDispatch.call(packet); }
    : null;
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
    adaptiveDiscovery: window.__minibiaBotAdaptive?.inspect?.(nativeClient) || null,
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
    build: "2026-10-30-1003",
    worldAvailable: !!resolveWorld(),
    pathfinderAvailable: !!resolvePathfinder(),
    itemDefinitionsAvailable: !!nativeClient.TPWhmLyqyrg,
    autoWalkAvailable: !!NativeAutoWalkPacket && typeof nativeSend === "function"
  });
})();
