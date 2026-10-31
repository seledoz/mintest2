// Adaptive Minibia client compatibility discovery (v5).
// Finds the live client from the loaded game's own startup source. No scrambled
// client, world, pathfinder, or packet-constructor identifiers are hardcoded.
(() => {
  if (window.__minibiaBotAdaptive?.installed && window.__minibiaBotAdaptive.version >= 5) return;

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
      const names = new Set(ownDataValues(value, 1).map(entry => entry.key));
      return names.has("SERVER_VERSION") && names.has("CLIENT_VERSION") && names.has("player");
    } catch (_) { return false; }
  };

  let cachedClient = null;
  let cachedBindingName = null;
  let cachedIndexUrl = null;
  let indexSourcePromise = null;
  let lastDiscoveryError = null;

  const findIndexScriptUrl = () => {
    try {
      for (const script of Array.from(document.scripts || [])) {
        const src = String(script?.src || "");
        if (src && /\/src\/core\/index\.js(?:[?#]|$)/.test(src)) return src;
      }
    } catch (_) {}
    try {
      const resources = performance.getEntriesByType("resource");
      for (let i = resources.length - 1; i >= 0; i -= 1) {
        const name = String(resources[i]?.name || "");
        if (/\/src\/core\/index\.js(?:[?#]|$)/.test(name)) return name;
      }
    } catch (_) {}
    return null;
  };

  const loadIndexSource = async () => {
    const url = findIndexScriptUrl();
    if (!url) throw new Error("Loaded core/index.js script was not found");
    if (cachedIndexUrl === url && indexSourcePromise) return indexSourcePromise;
    cachedIndexUrl = url;
    indexSourcePromise = fetch(url, { cache: "no-store", credentials: "same-origin" })
      .then(response => {
        if (!response.ok) throw new Error("Could not read core/index.js: HTTP " + response.status);
        return response.text();
      })
      .catch(error => {
        indexSourcePromise = null;
        throw error;
      });
    return indexSourcePromise;
  };

  const extractClientBindingName = (source) => {
    const marker = source.indexOf("gameclient-ctor");
    if (marker < 0) throw new Error("Game-client startup marker was not found in core/index.js");
    const startup = source.slice(marker, marker + 700);
    const match = startup.match(/([A-Za-z_$][\w$]*)\s*=\s*new\s+[A-Za-z_$][\w$]*\s*\(/);
    if (!match) throw new Error("Could not extract the game-client binding from startup code");
    return match[1];
  };

  const resolveLexicalClient = async () => {
    if (isClientLike(cachedClient)) return cachedClient;
    const source = await loadIndexSource();
    const bindingName = extractClientBindingName(source);
    // Direct eval can read the page's global lexical binding (unlike window[key]).
    let candidate = null;
    try { candidate = eval(bindingName); } catch (error) {
      lastDiscoveryError = "Could not resolve lexical client binding: " + String(error?.message || error);
    }
    if (!isClientLike(candidate)) {
      throw new Error(lastDiscoveryError || "Extracted binding is not the live game client");
    }
    cachedBindingName = bindingName;
    cachedClient = candidate;
    lastDiscoveryError = null;
    return candidate;
  };

  const resolveClient = (seed) => {
    if (isClientLike(seed)) {
      cachedClient = seed;
      return seed;
    }
    return isClientLike(cachedClient) ? cachedClient : null;
  };

  const waitForClient = async (options = {}) => {
    const timeoutMs = Math.max(1000, Math.min(60000, Number(options.timeoutMs) || 20000));
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const client = await resolveLexicalClient();
        if (client) return client;
      } catch (error) {
        lastError = error;
      }
      await new Promise(resolve => window.setTimeout(resolve, 300));
    }
    throw lastError || new Error("Timed out waiting for the live game client");
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

  const resolvePathfinder = (client = resolveClient()) => {
    if (!client) return null;
    let world = null;
    try { world = client.world || null; } catch (_) {}
    if (!world) return null;
    return ownDataValues(world, 2).find(entry => isPathfinderLike(entry.value))?.value || null;
  };

  const getDataProperty = (object, property) => {
    let current = object;
    for (let depth = 0; current && depth < 4; depth += 1) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(current, property);
        if (descriptor) return Object.prototype.hasOwnProperty.call(descriptor, "value") ? descriptor.value : undefined;
        current = Object.getPrototypeOf(current);
      } catch (_) { return undefined; }
    }
    return undefined;
  };

  let cachedMinimapClient = null;
  let cachedMinimap = null;
  let lastMinimapScanAt = 0;
  const isMinimapLike = candidate => {
    if (!candidate || typeof candidate !== "object") return false;
    const renderLayer = getDataProperty(candidate, "__renderLayer");
    const zoomLevel = getDataProperty(candidate, "__zoomLevel");
    const center = getDataProperty(candidate, "center");
    const canvasOwner = getDataProperty(candidate, "minimap");
    const canvas = getDataProperty(canvasOwner, "canvas");
    return Number.isFinite(Number(renderLayer)) && Number.isFinite(Number(zoomLevel)) &&
      !!center && Number.isFinite(Number(getDataProperty(center, "x"))) &&
      Number.isFinite(Number(getDataProperty(center, "y"))) &&
      !!canvas && typeof canvas.getBoundingClientRect === "function";
  };

  const resolveMinimap = client => {
    if (!client) return null;
    if (cachedMinimapClient === client && isMinimapLike(cachedMinimap)) return cachedMinimap;
    if (cachedMinimapClient === client && Date.now() - lastMinimapScanAt < 1000) return null;
    cachedMinimapClient = client;
    lastMinimapScanAt = Date.now();
    cachedMinimap = null;
    const queue = [{ value: client, depth: 0 }];
    const seen = new Set();
    let inspected = 0;
    while (queue.length && inspected < 2500) {
      const entry = queue.shift(), value = entry?.value;
      if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) continue;
      seen.add(value); inspected += 1;
      if (isMinimapLike(value)) { cachedMinimap = value; return value; }
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

  let cachedDispatchClient = null;
  let cachedDispatch = null;
  const unwrapDispatch = fn => {
    let current = fn;
    for (let i = 0; i < 3 && typeof current === "function"; i += 1) {
      let original;
      try { original = Object.getOwnPropertyDescriptor(current, "__minibiaAdaptiveOriginal")?.value; } catch (_) {}
      if (typeof original !== "function") break;
      current = original;
    }
    return current;
  };

  const resolvePacketDispatch = client => {
    if (!client) return null;
    if (cachedDispatchClient === client && cachedDispatch) return cachedDispatch;
    for (const candidate of ownDataValues(client, 4).filter(entry => typeof entry.value === "function")) {
      const source = safeSource(unwrapDispatch(candidate.value));
      const access = source.match(/this\[['"]([^'"]+)['"]\]\[['"]([^'"]+)['"]\]\(/);
      if (!access) continue;
      let manager, sender;
      try { manager = client[access[1]]; sender = manager?.[access[2]]; } catch (_) { continue; }
      const senderSource = safeSource(sender);
      if (typeof sender === "function" && /getBuffer/.test(senderSource) && /socket/.test(senderSource) && /send/.test(senderSource)) {
        cachedDispatchClient = client;
        cachedDispatch = {
          key: candidate.key,
          verifiedBy: "client-forwarder-to-native-network-sender",
          call(packet) {
            const active = client[candidate.key];
            const method = typeof active === "function" ? active : candidate.value;
            return method.call(client, packet);
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

  const resolveAutoWalkConstructor = pathfinder => {
    if (!pathfinder) return null;
    for (const entry of ownDataValues(pathfinder, 2)) {
      if (typeof entry.value !== "function") continue;
      const source = safeSource(entry.value);
      if (!source.includes("noteAutowalk") || !source.includes("performance")) continue;
      const matches = [...source.matchAll(/new\s+([A-Za-z_$][\w$]*)\s*\(/g)];
      for (let i = matches.length - 1; i >= 0; i -= 1) {
        try {
          const constructor = eval(matches[i][1]);
          if (typeof constructor === "function") {
            observedAutoWalkConstructorName = matches[i][1];
            return constructor;
          }
        } catch (_) {}
      }
    }
    return null;
  };

  const installPacketObserver = (client, dispatch) => {
    if (!client || !dispatch) return false;
    try {
      const key = dispatch.key, current = client[key];
      if (typeof current !== "function") throw new Error("Native packet dispatcher is not callable");
      if (current.__minibiaAdaptiveObserver) { packetObserverInstalled = true; return true; }
      const original = unwrapDispatch(current);
      const wrapper = function minibiaAdaptivePacketObserver(packet) {
        try {
          if (!observedAutoWalkConstructor) {
            const pf = resolvePathfinder(client);
            observedAutoWalkConstructor = resolveAutoWalkConstructor(pf);
          }
          const ctor = packet?.constructor;
          if (ctor && typeof ctor === "function") {
            if (observedAutoWalkConstructor && ctor === observedAutoWalkConstructor) {
              observedAutoWalkConstructorName = ctor.name || observedAutoWalkConstructorName;
            }
            const name = ctor.name || "(anonymous)";
            if (!observedPacketTypes.some(item => item.name === name)) {
              observedPacketTypes.push({ name, ownFields: ownDataValues(packet, 1).map(item => item.key).slice(0, 16) });
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
      Object.defineProperty(client, key, { configurable: true, enumerable: false, writable: true, value: wrapper });
      packetObserverInstalled = client[key] === wrapper;
      if (!packetObserverInstalled) throw new Error("Could not install passive packet observer");
      return true;
    } catch (error) {
      packetObserverError = String(error?.message || error);
      return false;
    }
  };

  const inspect = seed => {
    const client = resolveClient(seed);
    const world = (() => { try { return client?.world || null; } catch (_) { return null; } })();
    const pathfinder = resolvePathfinder(client);
    const dispatch = resolvePacketDispatch(client);
    const observerInstalled = installPacketObserver(client, dispatch);
    if (!observedAutoWalkConstructor) observedAutoWalkConstructor = resolveAutoWalkConstructor(pathfinder);
    return {
      version: 5,
      clientFound: !!client,
      clientBindingDiscovered: !!cachedBindingName,
      clientBindingName: cachedBindingName,
      indexSourceFound: !!cachedIndexUrl,
      worldFound: !!world,
      pathfinderFound: !!pathfinder,
      minimapFound: !!resolveMinimap(client),
      packetDispatchFound: !!dispatch,
      packetDispatchMethod: dispatch?.key || null,
      packetObserverInstalled: observerInstalled,
      packetObserverError,
      autoWalkConstructorName: observedAutoWalkConstructorName,
      autoWalkConstructorCaptured: typeof observedAutoWalkConstructor === "function",
      observedPacketTypes: observedPacketTypes.slice(),
      lastDiscoveryError,
      capabilities: {
        player: !!client?.player,
        world: !!world,
        pathfinding: !!pathfinder,
        nativePacketDispatch: !!dispatch,
        autoWalkPacketConstruction: typeof observedAutoWalkConstructor === "function"
      }
    };
  };

  const api = {
    installed: true,
    version: 5,
    resolveClient,
    waitForClient,
    resolvePathfinder,
    resolveMinimap,
    resolvePacketDispatch,
    createAutoWalkPacket: directions => typeof observedAutoWalkConstructor === "function" ? new observedAutoWalkConstructor(directions) : null,
    isAutoWalkPacket: packet => !!packet && typeof observedAutoWalkConstructor === "function" && packet.constructor === observedAutoWalkConstructor,
    getAutoWalkConstructor: () => observedAutoWalkConstructor,
    getObservedPacketTypes: () => observedPacketTypes.slice(),
    inspect,
    refresh: async () => { try { await resolveLexicalClient(); } catch (_) {} return inspect(); },
    safeSource,
    get bindingName() { return cachedBindingName; }
  };
  window.__minibiaBotAdaptive = api;
  try { inspect(); } catch (_) {}
  // Low-frequency retry handles the game creating its client after the bot loader.
  const retryId = window.setInterval(() => {
    if (isClientLike(cachedClient)) { window.clearInterval(retryId); try { inspect(cachedClient); } catch (_) {} return; }
    resolveLexicalClient().then(client => {
      window.clearInterval(retryId);
      try { inspect(client); } catch (_) {}
    }).catch(() => {});
  }, 1500);
  console.info("[minibia-bot] adaptive client discovery v5 installed");
})();
