// Adaptive Minibia client compatibility discovery.
// This module only inspects client objects and function source. It never invokes
// unknown methods or sends probe packets.
(() => {
  if (window.__minibiaBotAdaptive?.installed) return;

  const ownDataValues = (object, maxDepth = 3) => {
    const values = [];
    const seen = new Set();
    let current = object;
    for (let depth = 0; current && depth < maxDepth; depth += 1) {
      let names = [];
      try { names = Object.getOwnPropertyNames(current); } catch (_) { break; }
      for (const key of names) {
        if (seen.has(key) || key === "constructor") continue;
        seen.add(key);
        try {
          const descriptor = Object.getOwnPropertyDescriptor(current, key);
          if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            values.push({ key, value: descriptor.value, owner: current });
          }
        } catch (_) {}
      }
      try { current = Object.getPrototypeOf(current); } catch (_) { break; }
    }
    return values;
  };

  const safeSource = (fn) => {
    try { return typeof fn === "function" ? Function.prototype.toString.call(fn) : ""; }
    catch (_) { return ""; }
  };

  const isClientLike = (value) => {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
    try {
      const props = ownDataValues(value, 2);
      const hasPlayer = props.some(x => x.key === "player" && x.value && typeof x.value === "object");
      const hasNetworkHandler = props.some(x => x.value && typeof x.value === "object" &&
        ownDataValues(x.value, 2).some(y => typeof y.value === "function" &&
          /getBuffer/.test(safeSource(y.value)) && /socket/.test(safeSource(y.value))));
      return hasPlayer && hasNetworkHandler;
    } catch (_) { return false; }
  };

  const resolveClient = (seed) => {
    if (isClientLike(seed)) return seed;
    // Global data descriptors only: do not invoke getters during discovery.
    let keys = [];
    try { keys = Object.getOwnPropertyNames(window); } catch (_) {}
    for (const key of keys) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(window, key);
        if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") &&
            isClientLike(descriptor.value)) return descriptor.value;
      } catch (_) {}
    }
    return null;
  };

  const isPathfinderLike = (value) => {
    try {
      return !!value &&
        Array.isArray(value.__pathfindCache) &&
        typeof value.search === "function" &&
        typeof value.getNextMove === "function" &&
        typeof value.__isAutoWalking === "boolean" &&
        Object.prototype.hasOwnProperty.call(value, "__finalDestination");
    } catch (_) { return false; }
  };

  const resolvePathfinder = (client) => {
    if (!client) return null;
    let world = null;
    try { world = client.world || null; } catch (_) {}
    if (!world) return null;
    const direct = ownDataValues(world, 3).find(x => isPathfinderLike(x.value));
    if (direct) return direct.value;
    // A world accessor may expose the world object without a data property.
    const worldValues = ownDataValues(client, 3).map(x => x.value);
    for (const candidateWorld of worldValues) {
      if (!candidateWorld || typeof candidateWorld !== "object") continue;
      const found = ownDataValues(candidateWorld, 3).find(x => isPathfinderLike(x.value));
      if (found) return found.value;
    }
    return null;
  };

  const resolvePacketDispatch = (client) => {
    if (!client) return null;
    const methods = ownDataValues(client, 4).filter(x => typeof x.value === "function");
    for (const candidate of methods) {
      const source = safeSource(candidate.value);
      // Find a thin client method that forwards its packet argument into a
      // nested network-manager method. Then verify the nested method looks
      // like the actual serializer/socket sender.
      const match = source.match(/this\[['"]([^'"]+)['"]\]\[['"]([^'"]+)['"]\]\(/);
      if (!match) continue;
      let manager;
      try { manager = client[match[1]]; } catch (_) { continue; }
      if (!manager || typeof manager !== "object") continue;
      let sender;
      try { sender = manager[match[2]]; } catch (_) { continue; }
      const senderSource = safeSource(sender);
      if (typeof sender === "function" &&
          /getBuffer/.test(senderSource) &&
          /socket/.test(senderSource) &&
          /send/.test(senderSource)) {
        return {
          key: candidate.key,
          call: (packet) => {
            const activeMethod = client[candidate.key];
            return (typeof activeMethod === "function" ? activeMethod : candidate.value).call(client, packet);
          },
          verifiedBy: "client-forwarder-to-network-serializer"
        };
      }
    }
    return null;
  };

  let observedAutoWalkConstructor = null;
  let observedAutoWalkConstructorName = null;
  let packetObserverInstalled = false;
  let packetObserverError = null;

  const resolveAutoWalkConstructorName = (pathfinder) => {
    if (!pathfinder) return null;
    for (const entry of ownDataValues(pathfinder, 3)) {
      if (typeof entry.value !== "function") continue;
      const source = safeSource(entry.value);
      if (!source.includes("DMHavyabcUhA")) continue;
      if (!source.includes("__isAutoWalking") && !source.includes("__pathfindCache")) continue;
      const matches = [...source.matchAll(/new\\s+([A-Za-z_$][\\w$]*)\\s*\\(/g)];
      if (matches.length) return matches[matches.length - 1][1];
    }
    return null;
  };

  const installPacketObserver = (client, dispatch, pathfinder) => {
    if (!client || !dispatch) return false;
    const constructorName = resolveAutoWalkConstructorName(pathfinder || resolvePathfinder(client));
    observedAutoWalkConstructorName = constructorName || observedAutoWalkConstructorName;
    if (packetObserverInstalled) return true;
    try {
      const key = dispatch.key;
      const original = client[key];
      if (typeof original !== "function") throw new Error("Native packet dispatcher is no longer callable");
      const wrapper = function minibiaAdaptivePacketObserver(packet) {
        try {
          const ctor = packet && packet.constructor;
          if (ctor && typeof ctor === "function" &&
              observedAutoWalkConstructorName &&
              ctor.name === observedAutoWalkConstructorName) {
            observedAutoWalkConstructor = ctor;
          }
        } catch (_) {}
        return original.apply(this, arguments);
      };
      Object.defineProperty(client, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: wrapper
      });
      packetObserverInstalled = client[key] === wrapper;
      if (!packetObserverInstalled) throw new Error("Could not install passive packet observer");
      return true;
    } catch (error) {
      packetObserverError = String(error?.message || error);
      return false;
    }
  };

  const createAutoWalkPacket = (directions) => {
    if (typeof observedAutoWalkConstructor !== "function") return null;
    return new observedAutoWalkConstructor(directions);
  };

  const isAutoWalkPacket = (packet) => {
    return !!packet && typeof observedAutoWalkConstructor === "function" &&
      packet.constructor === observedAutoWalkConstructor;
  };

  const inspect = (seed) => {
    const client = resolveClient(seed);
    const world = (() => { try { return client?.world || null; } catch (_) { return null; } })();
    const pathfinder = resolvePathfinder(client);
    const packetDispatch = resolvePacketDispatch(client);
    const observerInstalled = installPacketObserver(client, packetDispatch, pathfinder);
    return {
      clientFound: !!client,
      worldFound: !!world,
      pathfinderFound: !!pathfinder,
      packetDispatchFound: !!packetDispatch,
      packetDispatchMethod: packetDispatch?.key || null,
      packetObserverInstalled: observerInstalled,
      packetObserverError,
      autoWalkConstructorName: observedAutoWalkConstructorName,
      autoWalkConstructorCaptured: typeof observedAutoWalkConstructor === "function",
      capabilities: {
        player: !!client?.player,
        world: !!world,
        pathfinding: !!pathfinder,
        nativePacketDispatch: !!packetDispatch,
        autoWalkPacketConstruction: typeof observedAutoWalkConstructor === "function"
      }
    };
  };

  window.__minibiaBotAdaptive = {
    installed: true,
    version: 1,
    resolveClient,
    resolvePathfinder,
    resolvePacketDispatch,
    createAutoWalkPacket,
    isAutoWalkPacket,
    inspect,
    safeSource
  };
  console.info("[minibia-bot] adaptive client discovery installed");
})();
