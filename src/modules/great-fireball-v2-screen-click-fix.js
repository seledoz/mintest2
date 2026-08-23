(() => {
  const clickDelayMs = 50;
  let installedBot = null;
  let originalClickHotbar = null;
  let pendingClickId = null;
  let pendingModuleName = null;
  let lastGfbCastAt = 0;
  let lastFireballCastAt = 0;
  let lastFireballV2CastAt = 0;

  function getGameCanvas() {
    return Array.from(document.querySelectorAll("canvas"))
      .map((canvas) => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 200 && rect.height >= 150)
      .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height))[0] || null;
  }

  function getPosition(value) {
    const raw = value?.getPosition?.() || value?.__position || value?.position || value;
    if (!raw) return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    const z = Number(raw.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return { x: Math.trunc(Number(raw.x)), y: Math.trunc(Number(raw.y)), z: Math.trunc(Number(raw.z)) };
  }

  function dispatchScreenClick(canvas, clientX, clientY) {
    const common = { bubbles: true, cancelable: true, composed: true, clientX, clientY, screenX: clientX, screenY: clientY, button: 0, buttons: 1, detail: 1, view: window };
    try {
      if (typeof PointerEvent === "function") {
        canvas.dispatchEvent(new PointerEvent("pointermove", { ...common, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        canvas.dispatchEvent(new PointerEvent("pointerdown", { ...common, pointerId: 1, pointerType: "mouse", isPrimary: true }));
        canvas.dispatchEvent(new PointerEvent("pointerup", { ...common, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      }
      canvas.dispatchEvent(new MouseEvent("mousemove", common));
      canvas.dispatchEvent(new MouseEvent("mousedown", common));
      canvas.dispatchEvent(new MouseEvent("mouseup", { ...common, buttons: 0 }));
      canvas.dispatchEvent(new MouseEvent("click", { ...common, buttons: 0 }));
      return true;
    } catch (_) { return false; }
  }

  function clickBestTile(bot, moduleName, logName) {
    const module = bot?.[moduleName];
    const best = module?.getBestCandidate?.();
    const player = getPosition(bot?.getPlayerPosition?.());
    const target = getPosition(best?.position);
    const canvasInfo = getGameCanvas();
    if (!module || !module.status?.().running || !player || !target || !canvasInfo) return false;
    if (target.z !== player.z || (best?.count || 0) < Number(module.config?.minMonsters || 1)) return false;
    const { canvas, rect } = canvasInfo;
    const tileWidth = rect.width / 17;
    const tileHeight = rect.height / 13;
    const clientX = rect.left + ((target.x - player.x + 8.5) * tileWidth);
    const clientY = rect.top + ((target.y - player.y + 6.5) * tileHeight);
    const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (!inside) { bot.log?.(`${logName} target tile is outside game screen`, { player, target, clientX, clientY }); return false; }
    const clicked = dispatchScreenClick(canvas, clientX, clientY);
    bot.log?.(clicked ? `${logName} clicked target tile on screen` : `${logName} screen click failed`, { monsterCount: best.count, target, clientX: Math.round(clientX), clientY: Math.round(clientY), delayMs: clickDelayMs });
    return clicked;
  }

  function scheduleScreenClick(bot, moduleName, logName) {
    if (pendingClickId != null) {
      if (pendingModuleName === moduleName) return true;
      window.clearTimeout(pendingClickId);
    }
    pendingModuleName = moduleName;
    pendingClickId = window.setTimeout(() => {
      pendingClickId = null;
      pendingModuleName = null;
      clickBestTile(bot, moduleName, logName);
    }, clickDelayMs);
    return true;
  }

  function install() {
    const bot = window.minibiaBot;
    if (!bot?.clickHotbar || !bot?.greatFireballV2 || !bot?.fireball || !bot?.fireballV2 || bot === installedBot) return false;
    if (installedBot && originalClickHotbar && installedBot.clickHotbar !== originalClickHotbar) installedBot.clickHotbar = originalClickHotbar;
    installedBot = bot;
    lastGfbCastAt = 0;
    lastFireballCastAt = 0;
    lastFireballV2CastAt = 0;
    pendingModuleName = null;
    originalClickHotbar = bot.clickHotbar.bind(bot);
    bot.clickHotbar = (...args) => {
      const slotIndex = Number(args[0]);
      if (!Number.isFinite(slotIndex)) return originalClickHotbar(...args);
      const gfbSlotIndex = Number(bot.greatFireballV2?.config?.hotbarSlot) - 1;
      const fireballSlotIndex = Number(bot.fireball?.config?.hotbarSlot) - 1;
      const fireballV2SlotIndex = Number(bot.fireballV2?.config?.hotbarSlot) - 1;
      const gfbRunning = !!bot.greatFireballV2?.status?.().running;
      const fireballRunning = !!bot.fireball?.status?.().running;
      const fireballV2Running = !!bot.fireballV2?.status?.().running;
      const isGfbSlot = gfbRunning && slotIndex === gfbSlotIndex;
      const isFireballSlot = fireballRunning && slotIndex === fireballSlotIndex;
      const isFireballV2Slot = fireballV2Running && slotIndex === fireballV2SlotIndex;

      if (isFireballV2Slot) {
        if (pendingClickId != null && pendingModuleName === "fireballV2") {
          bot.logDebug?.("blocked duplicate Fireball 2.0 hotbar click while screen shot is pending");
          return false;
        }
        const now = Date.now();
        const cooldownMs = Math.max(0, Number(bot.fireballV2?.config?.cooldownMs) || 0);
        if (lastFireballV2CastAt && now - lastFireballV2CastAt < cooldownMs) {
          bot.logDebug?.("blocked Fireball 2.0 cast during configured cooldown", { cooldownMs, remainingMs: Math.max(0, cooldownMs - (now - lastFireballV2CastAt)) });
          return false;
        }
      }
      if (isGfbSlot) {
        const now = Date.now();
        const cooldownMs = Math.max(0, Number(bot.greatFireballV2?.config?.cooldownMs) || 0);
        if (lastGfbCastAt && now - lastGfbCastAt < cooldownMs) {
          bot.logDebug?.("blocked GFB 2.0 cast during configured cooldown", { cooldownMs, remainingMs: Math.max(0, cooldownMs - (now - lastGfbCastAt)) });
          return false;
        }
      }
      if (isFireballSlot && !isFireballV2Slot) {
        const now = Date.now();
        const cooldownMs = Math.max(0, Number(bot.fireball?.config?.cooldownMs) || 0);
        if (lastFireballCastAt && now - lastFireballCastAt < cooldownMs) {
          bot.logDebug?.("blocked Fireball cast during configured cooldown", { cooldownMs, remainingMs: Math.max(0, cooldownMs - (now - lastFireballCastAt)) });
          return false;
        }
      }

      const result = originalClickHotbar(...args);
      if (!result) return result;

      if (isGfbSlot) {
        lastGfbCastAt = Date.now();
        scheduleScreenClick(bot, "greatFireballV2", "great fireball 2.0");
      } else if (isFireballV2Slot) {
        lastFireballV2CastAt = Date.now();
        scheduleScreenClick(bot, "fireballV2", "fireball 2.0");
      } else if (isFireballSlot) {
        lastFireballCastAt = Date.now();
        scheduleScreenClick(bot, "fireball", "fireball");
      }
      return result;
    };
    bot.__fireballScreenClickHelperInstalled = true;
    bot.addCleanup?.(() => {
      if (pendingClickId != null) window.clearTimeout(pendingClickId);
      pendingClickId = null;
      pendingModuleName = null;
      lastGfbCastAt = 0;
      lastFireballCastAt = 0;
      lastFireballV2CastAt = 0;
      bot.__fireballScreenClickHelperInstalled = false;
      if (bot.clickHotbar !== originalClickHotbar) bot.clickHotbar = originalClickHotbar;
      if (installedBot === bot) installedBot = null;
    });
    return true;
  }

  install();
  const installerId = window.setInterval(() => { if (install()) window.clearInterval(installerId); }, 100);
})();