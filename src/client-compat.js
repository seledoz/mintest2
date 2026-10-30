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
    nativeClient = eval("typeof YPXHlIjOD !== 'undefined' ? YPXHlIjOD : null")
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
  if (NativeAutoWalkPacket && typeof window.AutoWalkPacket !== "function") {
    window.AutoWalkPacket = function AutoWalkPacket(directions) {
      return new NativeAutoWalkPacket(directions);
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
    supportedPackets: ["AutoWalkPacket", "ItemMovePacket"],
    itemMoveAvailable: typeof nativeSend === "function" && Number.isInteger(thingMoveOpcode),
    sendItemMove,
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
