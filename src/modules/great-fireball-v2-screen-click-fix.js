(() => {
  const clickDelayMs = 50;
  let installedBot = null;
  let originalClickHotbar = null;
  let pendingClickId = null;
  let lastFireballCastAt = 0;

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

  function install() {
    const bot = window.minibiaBot;
    if (!bot?.clickHotbar || !bot?.greatFireballV2 || !bot?.fireball || bot === installedBot) return false;
    if (installedBot && originalClickHotbar && installedBot.clickHotbar !== originalClickHotbar) installedBot.clickHotbar = originalClickHotbar;
    installedBot = bot;
    lastFireballCastAt = 0;
    originalClickHotbar = bot.clickHotbar.bind(bot);
    bot.clickHotbar = (...args) => {
      const slotIndex = Number(args[0]);
      if (!Number.isFinite(slotIndex)) return originalClickHotbar(...args);
      const gfbSlotIndex = Number(bot.greatFireballV2?.config?.hotbarSlot) - 1;
      const fireballSlotIndex = Number(bot.fireball?.config?.hotbarSlot) - 1;
      const gfbRunning = !!bot.greatFireballV2?.status?.().running;
      const fireballStatus = bot.fireball?.status?.() || null;
      const fireballRunning = !!fireballStatus?.running;
      const isFireballSlot = fireballRunning && slotIndex === fireballSlotIndex;
      if (isFireballSlot) {
        const now = Date.now();
        const cooldownMs = Math.max(0, Number(bot.fireball?.config?.cooldownMs) || 0);
        if (lastFireballCastAt && now - lastFireballCastAt < cooldownMs) {
          bot.logDebug?.("blocked Fireball cast during configured cooldown", { cooldownMs, remainingMs: Math.max(0, cooldownMs - (now - lastFireballCastAt)) });
          return false;
        }
      }
      const result = originalClickHotbar(...args);
      if (!result) return result;
      let moduleName = null;
      let logName = null;
      if (gfbRunning && slotIndex === gfbSlotIndex) { moduleName = "greatFireballV2"; logName = "great fireball 2.0"; }
      else if (isFireballSlot) { lastFireballCastAt = Date.now(); moduleName = "fireball"; logName = "fireball"; }
      if (moduleName) {
        if (pendingClickId != null) window.clearTimeout(pendingClickId);
        pendingClickId = window.setTimeout(() => { pendingClickId = null; clickBestTile(bot, moduleName, logName); }, clickDelayMs);
      }
      return result;
    };
    bot.addCleanup?.(() => {
      if (pendingClickId != null) window.clearTimeout(pendingClickId);
      pendingClickId = null;
      lastFireballCastAt = 0;
      if (bot.clickHotbar !== originalClickHotbar) bot.clickHotbar = originalClickHotbar;
      if (installedBot === bot) installedBot = null;
    });
    return true;
  }

  install();
  const installerId = window.setInterval(() => { if (install()) window.clearInterval(installerId); }, 100);
})();