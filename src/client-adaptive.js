// Adaptive Minibia client compatibility discovery.
// Uses passive structural inspection and observes only packets the native game sends.
// It never calls unknown methods or injects probe packets.
(() => {
  if (window.__minibiaBotAdaptive?.installed && window.__minibiaBotAdaptive?.version >= 12) return;

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

  // The live GameClient is a global lexical binding, not necessarily a window
  // property. Resolve its randomized name from the currently loaded core/index.js
  // source instead of keeping a build-specific identifier in this module.
  let capturedClient = null;
  let capturedBindingName = null;
  let capturedSourceUrl = null;
  let bindingRefreshPromise = null;

  const isClientLike = (value) => {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
    try {
      const props = ownDataValues(value, 2);
      const hasServerVersion = props.some(x => x.key === "SERVER_VERSION");
      const hasPlayerSlot = props.some(x => x.key === "player");
      const hasConnect = props.some(x => x.key === "connect" && typeof x.value === "function");
      const hasNetworkManager = props.some(x => x.value && typeof x.value === "object" &&
        ownDataValues(x.value, 2).some(y => y.key === "isConnected" && typeof y.value === "function"));
      return hasServerVersion && hasPlayerSlot && hasConnect && hasNetworkManager;
    } catch (_) { return false; }
  };

  const findCoreIndexResourceUrl = () => {
    try {
      const entries = performance.getEntriesByType("resource");
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const name = String(entries[index]?.name || "");
        if (/\/src\/core\/index\.js(?:[?#]|$)/.test(name)) return name;
      }
    } catch (_) {}
    try {
      const build = window.__CLIENT_BUILD;
      const launcher = String(window.__ccBoot?.launcher || "");
      const match = launcher.match(/(c\/[^/]+\/)launcher\.js(?:[?#]|$)/);
      if (build && match) return new URL(`/b/${build}/${match[1]}src/core/index.js`, location.href).href;
    } catch (_) {}
    return null;
  };

  const captureClient = (candidate, bindingName = null, sourceUrl = null) => {
    if (!isClientLike(candidate)) return null;
    capturedClient = candidate;
    if (bindingName) capturedBindingName = bindingName;
    if (sourceUrl) capturedSourceUrl = sourceUrl;
    return candidate;
  };

  const refreshClientBinding = (resourceUrl = null, force = false) => {
    const url = resourceUrl || findCoreIndexResourceUrl();
    if (!url) return Promise.resolve(capturedClient);
    if (!force && url === capturedSourceUrl && isClientLike(capturedClient)) {
      return Promise.resolve(capturedClient);
    }
    if (bindingRefreshPromise) return bindingRefreshPromise;

    bindingRefreshPromise = (async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`core/index.js fetch failed: HTTP ${response.status}`);
        const source = await response.text();
        // Current launcher form: randomizedClient = new RandomizedGameClient(), new RandomizedUi().
        const match = source.match(/\b([A-Za-z_$][\w$]*)\s*=\s*new\s+[A-Za-z_$][\w$]*\s*\(\s*\)\s*,\s*new\s+[A-Za-z_$][\w$]*\s*\(\s*\)/);
        if (!match) throw new Error("Could not extract the GameClient binding from core/index.js");
        const bindingName = match[1];
        let candidate = null;
        try {
          candidate = eval("typeof " + bindingName + " !== 'undefined' ? " + bindingName + " : null");
        } catch (_) {}
        if (!isClientLike(candidate)) {
          throw new Error("Extracted client binding did not pass structural validation");
        }
        captureClient(candidate, bindingName, url);
        return candidate;
      } catch (error) {
        api.lastBindingError = String(error?.message || error);
        return capturedClient;
      }
    })().finally(() => {
      bindingRefreshPromise = null;
    });
    return bindingRefreshPromise;
  };

  const resolveClient = (seed) => {
    if (isClientLike(seed)) return captureClient(seed);
    if (isClientLike(capturedClient)) return capturedClient;
    let keys = [];
    try { keys = Object.getOwnPropertyNames(window); } catch (_) {}
    for (const key of keys) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(window, key);
        if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") &&
            isClientLike(descriptor.value)) return captureClient(descriptor.value);
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
  let observerClient = null;
  let discoveryClient = null;
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
    if (cachedClient === client && cachedDispatch) {
      // Revalidate the cached method before reusing it. The scrambler can rename
      // or replace a dispatcher without replacing the client object itself.
      const dispatchTarget = cachedDispatch.target || client;
      let currentMethod = null;
      try { currentMethod = dispatchTarget[cachedDispatch.key]; } catch (_) {}
      const currentSource = safeSource(unwrapDispatch(currentMethod));
      if (typeof currentMethod === "function" &&
          currentSource &&
          currentSource === cachedDispatch.source) return cachedDispatch;
      cachedClient = null;
      cachedDispatch = null;
    }

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
      if (typeof sender === "function" && /getBuffer/.test(senderSource) &&
          /socket/.test(senderSource) && /send/.test(senderSource)) {
        cachedClient = client;
        cachedDispatch = {
          key: candidate.key,
          source,
          verifiedBy: "client-forwarder-to-network-serializer",
          call: (packet) => client[candidate.key](packet)
        };
        return cachedDispatch;
      }
    }

    const pathfinder = resolvePathfinder(client);
    if (pathfinder) {
      const directCall = /([A-Za-z_$][\w$]*)\s*(?:\[['"]([^'"]+)['"]\]|\.([A-Za-z_$][\w$]*))\s*\(\s*new\s+([A-Za-z_$][\w$]*)\s*\(/g;
      for (const entry of ownDataValues(pathfinder, 5)) {
        if (typeof entry.value !== "function") continue;
        directCall.lastIndex = 0;
        let match;
        while ((match = directCall.exec(safeSource(entry.value)))) {
          const lexicalClientName = match[1];
          const key = match[2] || match[3];
          if (!key) continue;
          let lexicalClient = null;
          try { lexicalClient = eval("typeof " + lexicalClientName + " === 'undefined' ? null : " + lexicalClientName); } catch (_) {}
          // The window-discovered client may be a bound wrapper around the
          // lexical singleton used by native pathfinder methods. Validate the
          // lexical object structurally, then dispatch through that exact object.
          if (!lexicalClient ||
              (typeof lexicalClient !== "object" && typeof lexicalClient !== "function")) continue;
          // Native pathfinder source proves this lexical singleton is the packet
          // dispatcher owner. Confirm its live player/world and that the resolved
          // pathfinder belongs to that same world; do not require a network-handler
          // source signature that can change across client replacements.
          let lexicalPlayer = null;
          let lexicalWorld = null;
          let dispatcher;
          try {
            lexicalPlayer = lexicalClient.player;
            lexicalWorld = lexicalClient.world;
            dispatcher = lexicalClient[key];
          } catch (_) { continue; }
          if (!lexicalPlayer || typeof lexicalPlayer !== "object" ||
              !lexicalWorld || typeof lexicalWorld !== "object" ||
              typeof dispatcher !== "function") continue;
          let lexicalPathfinder = null;
          try { lexicalPathfinder = resolvePathfinder(lexicalClient); } catch (_) {}
          if (!lexicalPathfinder || lexicalPathfinder !== pathfinder) continue;
          cachedClient = client;
          cachedDispatch = {
            key,
            target: lexicalClient,
            source: safeSource(dispatcher),
            verifiedBy: "native-pathfinder-to-lexical-client-dispatcher",
            call: (packet) => lexicalClient[key](packet)
          };
          return cachedDispatch;
        }
      }
    }
    return null;
  };

  let observedAutoWalkConstructor = null;
  let observedAutoWalkConstructorName = null;
  let packetObserverInstalled = false;
  let packetObserverError = null;
  const observedPacketTypes = [];

  // Discover packet constructors from native pathfinder dispatch calls.
  // Names are extracted from native source, validated, then resolved lexically.
  // This does not invoke or dispatch any packet.
  let observedStopWalkConstructor = null;
  let observedStopWalkConstructorName = null;

  const escapeRegExp = (value) => String(value).replace(/[.*+?^$()|[\]\\]/g, "\\$&");

  const resolveLexicalConstructor = (name) => {
    if (typeof name !== "string" || !/^[A-Za-z_$][\w$]*$/.test(name)) return null;
    try {
      const candidate = eval("typeof " + name + " === 'function' ? " + name + " : null");
      return typeof candidate === "function" ? candidate : null;
    } catch (_) {
      return null;
    }
  };

  const findNativePacketConstructorCalls = (pathfinder, dispatch) => {
    if (!pathfinder || !dispatch?.key) return [];
    const dispatchKey = escapeRegExp(dispatch.key);
    const dispatchCall = new RegExp(
      "(?:\\[['\\\"]" + dispatchKey + "['\\\"]\\]|\\." + dispatchKey +
      ")\\s*\\(\\s*new\\s+([A-Za-z_$][\\w$]*)\\s*\\(([^)]*)\\)\\s*\\)",
      "g"
    );
    const calls = [];
    for (const entry of ownDataValues(pathfinder, 5)) {
      if (typeof entry.value !== "function") continue;
      const source = safeSource(entry.value);
      if (!source) continue;
      dispatchCall.lastIndex = 0;
      let match;
      while ((match = dispatchCall.exec(source))) {
        calls.push({
          method: entry.key,
          constructorName: match[1],
          argumentSource: match[2].trim(),
          constructor: resolveLexicalConstructor(match[1])
        });
      }
    }
    return calls;
  };

  const resolveNativePacketConstructors = (pathfinder, client, dispatch) => {
    const calls = findNativePacketConstructorCalls(pathfinder, dispatch);
    let autoWalk = null;
    let stopWalk = null;

    for (const call of calls) {
      if (typeof call.constructor !== "function") continue;
      const constructorSource = safeSource(call.constructor);

      if (call.argumentSource &&
          /length/.test(constructorSource) &&
          /writeUInt8/.test(constructorSource) &&
          /for/.test(constructorSource)) {
        autoWalk = call;
      }

      if (!call.argumentSource && !stopWalk) stopWalk = call;
    }

    if (autoWalk) {
      observedAutoWalkConstructor = autoWalk.constructor;
      observedAutoWalkConstructorName = autoWalk.constructorName;
    }
    if (stopWalk) {
      observedStopWalkConstructor = stopWalk.constructor;
      observedStopWalkConstructorName = stopWalk.constructorName;
    }

    return { autoWalk, stopWalk, calls };
  };

  const resolveAutoWalkConstructorName = (pathfinder, client, dispatch) => {
    const found = resolveNativePacketConstructors(pathfinder, client, dispatch);
    return found.autoWalk?.constructorName || observedAutoWalkConstructorName || null;
  };

  const resolveStopWalkConstructor = (pathfinder, client, dispatch) => {
    resolveNativePacketConstructors(pathfinder, client, dispatch);
    return observedStopWalkConstructor;
  };

  const createStopWalkPacket = () => {
    if (typeof observedStopWalkConstructor !== "function") return null;
    return new observedStopWalkConstructor();
  };

  const installPacketObserver = (client, dispatch) => {
    if (!client || !dispatch) return false;
    if (observerClient === client && packetObserverInstalled) return true;
    try {
      const current = client[dispatch.key];
      if (typeof current !== "function") throw new Error("Native packet dispatcher is not callable");
      if (/\[native code\]/.test(safeSource(current))) {
        packetObserverError = "Passive observer unsupported: dispatcher is exposed as a bound native function";
        packetObserverInstalled = false;
        observerClient = null;
        return false;
      }
      if (current.__minibiaAdaptiveObserver === true) {
        observerClient = client;
        packetObserverInstalled = true;
        return true;
      }
      const original = unwrapDispatch(current);
      const wrapper = function minibiaAdaptivePacketObserver(packet) {
        try {
          const ctor = packet && packet.constructor;
          if (ctor && typeof ctor === "function") {
            if (observedAutoWalkConstructorName && ctor.name === observedAutoWalkConstructorName) observedAutoWalkConstructor = ctor;
            const packetName = ctor.name || "(anonymous)";
            if (!observedPacketTypes.some(x => x.name === packetName)) {
              observedPacketTypes.push({ name: packetName, ownFields: ownDataValues(packet, 1).map(x => x.key).slice(0, 16) });
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
      Object.defineProperty(client, dispatch.key, {
        configurable: true, enumerable: false, writable: true, value: wrapper
      });
      packetObserverInstalled = client[dispatch.key] === wrapper;
      if (!packetObserverInstalled) throw new Error("Dispatcher property does not retain observer wrapper");
      observerClient = client;
      return true;
    } catch (error) {
      packetObserverError = String(error?.message || error);
      packetObserverInstalled = false;
      observerClient = null;
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
    if (discoveryClient !== client) {
      // Drop references tied to the previous client before resolving the replacement.
      observedAutoWalkConstructor = null;
      observedAutoWalkConstructorName = null;
      observedStopWalkConstructor = null;
      observedStopWalkConstructorName = null;
      packetObserverInstalled = false;
      packetObserverError = null;
      observerClient = null;
      cachedClient = null;
      cachedDispatch = null;
      cachedMinimapClient = null;
      cachedMinimap = null;
      discoveryClient = client;
    }
    const pathfinder = resolvePathfinder(client);
    const packetDispatch = resolvePacketDispatch(client);
    resolveNativePacketConstructors(pathfinder, client, packetDispatch);
    const observerInstalled = installPacketObserver(client, packetDispatch);
    return {
      version: 12,
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
      stopWalkConstructorName: observedStopWalkConstructorName,
      stopWalkConstructorCaptured: typeof observedStopWalkConstructor === "function",
      observedPacketTypes: observedPacketTypes.slice(),
      capabilities: {
        player: !!client?.player,
        world: !!world,
        pathfinding: !!pathfinder,
        nativePacketDispatch: !!packetDispatch,
        autoWalkPacketConstruction: typeof observedAutoWalkConstructor === "function",
        stopWalkPacketConstruction: typeof observedStopWalkConstructor === "function"
      }
    };
  };

  const api = {
    installed: true,
    version: 12,
    resolveClient,
    captureClient,
    refreshClientBinding,
    getClientBindingDiagnostics: () => ({ bindingName: capturedBindingName, sourceUrl: capturedSourceUrl, clientCaptured: isClientLike(capturedClient), lastError: api.lastBindingError || null }),
    resolvePathfinder,
    resolveMinimap,
    resolvePacketDispatch,
    createAutoWalkPacket,
    isAutoWalkPacket,
    getAutoWalkConstructor: () => observedAutoWalkConstructor,
    resolveStopWalkConstructor: (seed) => { const client = resolveClient(seed); return resolveStopWalkConstructor(resolvePathfinder(client), client, resolvePacketDispatch(client)); },
    createStopWalkPacket,
    getObservedPacketTypes: () => observedPacketTypes.slice(),
    inspect,
    refresh: inspect,
    safeSource
  };
  window.__minibiaBotAdaptive = api;
  api.ready = refreshClientBinding().then(client => {
    if (client) {
      try { inspect(client); } catch (_) {}
    }
    return client;
  });
  // Resource entries are event-driven: no frame loop or repeated object-graph scan.
  try {
    const resourceObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const name = String(entry?.name || "");
        if (!/\/src\/core\/index\.js(?:[?#]|$)/.test(name)) continue;
        refreshClientBinding(name, true).then(client => {
          if (client) {
            try { inspect(client); } catch (_) {}
          }
        });
      }
    });
    resourceObserver.observe({ type: "resource", buffered: false });
    window.__minibiaBotAdaptiveResourceObserver = resourceObserver;
  } catch (_) {}
  // Install the observer as early as possible. If the world/pathfinder is not
  // ready yet, the wrapper resolves its pathfinder lazily on the first packet.
  try { inspect(); } catch (_) {}
  console.info("[minibia-bot] adaptive client discovery v12 installed");
})();
