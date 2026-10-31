// Adaptive Minibia client compatibility discovery.
// Uses passive structural inspection and observes only packets the native game sends.
// It never calls unknown methods or injects probe packets.
(() => {
  if (window.__minibiaBotAdaptive?.installed && window.__minibiaBotAdaptive?.version >= 4) return;

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
    for (const candidateWorld of ownDataValues(client, 3).map(x => x.value)) {
      if (!candidateWorld || typeof candidateWorld !== "object") continue;
      const found = ownDataValues(candidateWorld, 3).find(x => isPathfinderLike(x.value));
      if (found) return found.value;
    }
    return null;
  };


  const getDataProperty = (object, property) => {
    let current = object;
    for (let depth = 0; current && depth < 4; depth += 1) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(current, property);
        if (descriptor) {
          return Object.prototype.hasOwnProperty.call(descriptor, "value")
            ? descriptor.value : undefined;
        }
        current = Object.getPrototypeOf(current);
      } catch (_) { return undefined; }
    }
    return undefined;
  };

  // Locate the live minimap by its rendering state, not its scrambled owner key.
  // The search is bounded and reads data properties only (never invokes getters).
  let cachedMinimapClient = null;
  let cachedMinimap = null;
  let lastMinimapScanAt = 0;
  const isMinimapLike = (candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const renderLayer = getDataProperty(candidate, "__renderLayer");
    const zoomLevel = getDataProperty(candidate, "__zoomLevel");
    const center = getDataProperty(candidate, "center");
    const minimapCanvasOwner = getDataProperty(candidate, "minimap");
    const canvas = getDataProperty(minimapCanvasOwner, "canvas");
    return Number.isFinite(Number(renderLayer)) &&
      Number.isFinite(Number(zoomLevel)) &&
      !!center && Number.isFinite(Number(getDataProperty(center, "x"))) &&
      Number.isFinite(Number(getDataProperty(center, "y"))) &&
      !!canvas && typeof canvas.getBoundingClientRect === "function";
  };

  const resolveMinimap = (client) => {
    if (!client) return null;
    if (cachedMinimapClient === client && isMinimapLike(cachedMinimap)) return cachedMinimap;
    const now = Date.now();
    if (cachedMinimapClient === client && now - lastMinimapScanAt < 1000) return null;
    cachedMinimapClient = client;
    lastMinimapScanAt = now;
    cachedMinimap = null;
    const queue = [{ value: client, depth: 0 }];
    const seen = new Set();
    let inspected = 0;
    while (queue.length && inspected < 2500) {
      const entry = queue.shift();
      const value = entry?.value;
      if (!value || (typeof value !== "object" && typeof value !== "function") ||
          seen.has(value)) continue;
      seen.add(value);
      inspected += 1;
      if (isMinimapLike(value)) {
        cachedMinimapClient = client;
        cachedMinimap = value;
        return value;
      }
      if (entry.depth >= 6 || value === window || value === document ||
          (typeof Element !== "undefined" && value instanceof Element)) continue;
      for (const child of ownDataValues(value, 1)) {
        if (child.value && (typeof child.value === "object" || typeof child.value === "function")) {
          queue.push({ value: child.value, depth: entry.depth + 1 });
        }
      }
    }
    return null;
  };

  let cachedClient = null;
  let cachedDispatch = null;
  const unwrapDispatch = (fn) => {
    let current = fn;
    for (let i = 0; i < 3 && typeof current === "function"; i += 1) {
      let original;
      try { original = Object.getOwnPropertyDescriptor(current, "__minibiaAdaptiveOriginal")?.value; } catch (_) {}
      if (typeof original !== "function") break;
      current = original;
    }
    return current;
  };

  const resolvePacketDispatch = (client) => {
    if (!client) return null;
    if (cachedClient === client && cachedDispatch) return cachedDispatch;
    const methods = ownDataValues(client, 4).filter(x => typeof x.value === "function");
    for (const candidate of methods) {
      const callable = unwrapDispatch(candidate.value);
      const source = safeSource(callable);
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
        cachedClient = client;
        cachedDispatch = {
          key: candidate.key,
          verifiedBy: "client-forwarder-to-network-serializer",
          call: (packet) => {
            const activeMethod = client[candidate.key];
            const callableNow = typeof activeMethod === "function" ? activeMethod : candidate.value;
            return callableNow.call(client, packet);
          }
        };
        return cachedDispatch;
      }
    }
    return null;
  };

  let observedAutoWalkConstructor = null;
  let observedAutoWalkConstructorName = null;
  let packetObserverInstalled = false;
  let packetObserverError = null;
  const observedPacketTypes = [];

  const resolveAutoWalkConstructorName = (pathfinder) => {
    if (!pathfinder) return null;
    for (const entry of ownDataValues(pathfinder, 3)) {
      if (typeof entry.value !== "function") continue;
      const source = safeSource(entry.value);
      if (!source.includes("DMHavyabcUhA")) continue;
      const direct = source.match(/DMHavyabcUhA\s*\(\s*new\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (direct) return direct[1];
      const matches = [...source.matchAll(/new\s+([A-Za-z_$][\w$]*)\s*\(/g)];
      if (matches.length) return matches[matches.length - 1][1];
    }
    return null;
  };

  const installPacketObserver = (client, dispatch) => {
    if (!client || !dispatch) return false;
    if (packetObserverInstalled && cachedClient === client) return true;
    try {
      const key = dispatch.key;
      const current = client[key];
      if (typeof current !== "function") throw new Error("Native packet dispatcher is not callable");
      if (current.__minibiaAdaptiveObserver === true) {
        packetObserverInstalled = true;
        return true;
      }
      const original = unwrapDispatch(current);
      const wrapper = function minibiaAdaptivePacketObserver(packet) {
        try {
          if (!observedAutoWalkConstructorName) {
            observedAutoWalkConstructorName = resolveAutoWalkConstructorName(resolvePathfinder(client));
          }
          const ctor = packet && packet.constructor;
          if (ctor && typeof ctor === "function") {
            if (observedAutoWalkConstructorName && ctor.name === observedAutoWalkConstructorName) {
              observedAutoWalkConstructor = ctor;
            }
            const packetName = ctor.name || "(anonymous)";
            if (!observedPacketTypes.some(x => x.name === packetName)) {
              observedPacketTypes.push({
                name: packetName,
                ownFields: ownDataValues(packet, 1).map(x => x.key).slice(0, 16)
              });
              if (observedPacketTypes.length > 30) observedPacketTypes.shift();
            }
          }
        } catch (_) {}
        return original.apply(this, arguments);
      };
      Object.defineProperties(wrapper, {
        __minibiaAdaptiveObserver: { value: true },
        __minibiaAdaptiveOriginal: { value: original }
      });
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

  const isAutoWalkPacket = (packet) => !!packet &&
    typeof observedAutoWalkConstructor === "function" &&
    packet.constructor === observedAutoWalkConstructor;

  const inspect = (seed) => {
    const client = resolveClient(seed);
    const world = (() => { try { return client?.world || null; } catch (_) { return null; } })();
    const pathfinder = resolvePathfinder(client);
    const packetDispatch = resolvePacketDispatch(client);
    const observerInstalled = installPacketObserver(client, packetDispatch);
    if (!observedAutoWalkConstructorName) {
      observedAutoWalkConstructorName = resolveAutoWalkConstructorName(pathfinder);
    }
    return {
      version: 4,
      clientFound: !!client,
      worldFound: !!world,
      pathfinderFound: !!pathfinder,
      minimapFound: !!resolveMinimap(client),
      packetDispatchFound: !!packetDispatch,
      packetDispatchMethod: packetDispatch?.key || null,
      packetObserverInstalled: observerInstalled,
      packetObserverError,
      autoWalkConstructorName: observedAutoWalkConstructorName,
      autoWalkConstructorCaptured: typeof observedAutoWalkConstructor === "function",
      observedPacketTypes: observedPacketTypes.slice(),
      capabilities: {
        player: !!client?.player,
        world: !!world,
        pathfinding: !!pathfinder,
        nativePacketDispatch: !!packetDispatch,
        autoWalkPacketConstruction: typeof observedAutoWalkConstructor === "function"
      }
    };
  };

  const api = {
    installed: true,
    version: 4,
    resolveClient,
    resolvePathfinder,
    resolveMinimap,
    resolvePacketDispatch,
    createAutoWalkPacket,
    isAutoWalkPacket,
    getAutoWalkConstructor: () => observedAutoWalkConstructor,
    getObservedPacketTypes: () => observedPacketTypes.slice(),
    inspect,
    refresh: inspect,
    safeSource
  };
  window.__minibiaBotAdaptive = api;
  // Install the observer as early as possible. If the world/pathfinder is not
  // ready yet, the wrapper resolves its pathfinder lazily on the first packet.
  try { inspect(); } catch (_) {}
  console.info("[minibia-bot] adaptive client discovery v4 installed");
})();
