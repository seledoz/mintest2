window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installCaveArrowFieldDetectionFix = function installCaveArrowFieldDetectionFix(bot) {
  if (!bot || bot.caveArrowFieldDetectionFix?.destroy) return bot?.caveArrowFieldDetectionFix;

  const state = { timerId: null, patched: 0, lastScanAt: 0 };
  const FIELD_IDS = new Map([
    [1487, "fire field"], [1488, "fire field"], [1492, "fire field"], [1493, "fire field"],
    [1494, "fire field"], [1500, "fire field"], [1501, "fire field"],
    [1490, "poison field"], [1496, "poison field"],
    [1491, "energy field"], [1495, "energy field"],
  ]);

  function idOf(thing) {
    for (const key of ["id", "itemId", "itemID", "clientId", "clientID", "serverId", "serverID"]) {
      const value = Number(thing?.[key]);
      if (Number.isFinite(value)) return Math.trunc(value);
    }
    return null;
  }

  function isFieldThing(thing) {
    if (!thing) return null;
    const id = idOf(thing);
    if (FIELD_IDS.has(id)) return FIELD_IDS.get(id);
    const definition = window.gameClient?.itemDefinitionsByCid?.[id]
      || window.gameClient?.itemDefinitionsBySid?.[id]
      || window.gameClient?.itemDefinitions?.[id]
      || null;
    const name = String(thing.name || definition?.properties?.name || "").trim().toLowerCase();
    if (/\b(?:fire|poison|energy)\s+field\b/i.test(name)) return name;
    const field = String(thing.field || definition?.properties?.field || "").trim().toLowerCase();
    const type = String(thing.type || definition?.properties?.type || "").trim().toLowerCase();
    if ((field === "fire" || field === "poison" || field === "energy") && (type === "magicfield" || !type)) {
      return `${field} field`;
    }
    return null;
  }

  function thingsOnTile(tile) {
    if (!tile) return [];
    const result = [tile];
    for (const key of ["items", "things", "objects"]) {
      if (Array.isArray(tile[key])) result.push(...tile[key]);
    }
    for (const key of ["getItems", "getThings", "getObjects"]) {
      if (typeof tile[key] !== "function") continue;
      try {
        const values = tile[key]();
        if (Array.isArray(values)) result.push(...values);
      } catch (_) {}
    }
    return result.filter(Boolean);
  }

  function markTile(tile) {
    let fieldName = null;
    for (const thing of thingsOnTile(tile)) {
      const detected = isFieldThing(thing);
      if (!detected) continue;
      fieldName = detected;
      if (!thing.name) {
        try { thing.name = detected; } catch (_) {}
      }
    }
    return fieldName;
  }

  function scan() {
    const caveStatus = bot.cave?.status?.() || null;
    if (!caveStatus?.running || caveStatus?.config?.pathfinderMode !== "arrow") return;
    const now = Date.now();
    if (now - state.lastScanAt < 450) return;
    state.lastScanAt = now;

    const chunks = window.gameClient?.world?.chunks || [];
    let patched = 0;
    for (const chunk of chunks) {
      if (!Array.isArray(chunk?.tiles)) continue;
      for (const tile of chunk.tiles) {
        const fieldName = markTile(tile);
        if (!fieldName) continue;
        if (typeof tile.isWalkable !== "function" || tile.__minibiaArrowFieldPatched) continue;
        const original = tile.isWalkable;
        try {
          tile.isWalkable = function arrowFieldWalkableOverride(...args) {
            return true || original.apply(this, args);
          };
          tile.__minibiaArrowFieldPatched = true;
          patched += 1;
        } catch (_) {}
      }
    }
    state.patched = patched;
  }

  function destroy() {
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
  }

  bot.caveArrowFieldDetectionFix = { scan, status: () => ({ ...state }), destroy };
  scan();
  state.timerId = window.setInterval(scan, 500);
  bot.addCleanup(destroy);
  return bot.caveArrowFieldDetectionFix;
};
