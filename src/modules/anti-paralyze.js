window.__minibiaBotBundle = window.__minibiaBotBundle || {};

window.__minibiaBotBundle.installAntiParalyzeModule = function installAntiParalyzeModule(bot) {
  const configStorageKey = "minibiaBot.antiParalyzeV2.config";
  const PARALYZE_PATTERN = /(paraly|paralys|paralis)/i;
  const state = { running: false, timerId: null, lastCastAt: 0, detectionSource: null, detectedElement: null, uiObserver: null, uiRetryTimerId: null };
  const config = Object.assign({ enabled: false, spellWords: "", ignoreMonsterGuard: false, tickMs: 250, recastCooldownMs: 2100 }, bot.storage.get(configStorageKey, {}));
  config.ignoreMonsterGuard = !!config.ignoreMonsterGuard; config.tickMs = 250; config.recastCooldownMs = 2100;
  function persistConfig() { bot.storage.set(configStorageKey, { ...config }); }
  function isVisible(element) { if (!(element instanceof Element)) return false; if (element.closest("#minibia-bot-panel")) return false; const rect = element.getBoundingClientRect?.(); if (!rect || rect.width < 8 || rect.height < 8) return false; const style = window.getComputedStyle?.(element); return !style || (style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0); }
  function getElementSignals(element) { if (!(element instanceof Element)) return ""; const values = [element.id, element.className, element.getAttribute("title"), element.getAttribute("aria-label"), element.getAttribute("alt"), element.getAttribute("name"), element.getAttribute("src"), element.getAttribute("data-condition"), element.getAttribute("data-status"), element.getAttribute("data-effect"), element.getAttribute("data-tooltip"), element.getAttribute("style")]; try { values.push(window.getComputedStyle(element).backgroundImage); } catch (_error) {} return values.filter(Boolean).map(String).join(" "); }
  function findParalyzeStatusIcon() {
    if (!state.running || !config.enabled) return null; state.detectionSource = null; state.detectedElement = null;
    const directSelector = ['[title*="paraly" i]','[aria-label*="paraly" i]','[alt*="paraly" i]','[id*="paraly" i]','[class*="paraly" i]','[src*="paraly" i]','[data-condition*="paraly" i]','[data-status*="paraly" i]','[data-effect*="paraly" i]','[title*="paralis" i]','[aria-label*="paralis" i]','[alt*="paralis" i]','[src*="paralis" i]'].join(",");
    for (const element of document.querySelectorAll(directSelector)) { if (!isVisible(element)) continue; state.detectedElement = element; state.detectionSource = `direct:${element.id || element.className || element.tagName}`; return element; }
    const candidates = document.querySelectorAll('img, [class*="status" i], [class*="condition" i], [class*="effect" i], [class*="debuff" i], [class*="icon" i], [style*="background" i]');
    for (const element of candidates) { if (!isVisible(element) || !PARALYZE_PATTERN.test(getElementSignals(element))) continue; state.detectedElement = element; state.detectionSource = `status-icon:${element.id || element.className || element.tagName}`; return element; }
    return null;
  }
  function isParalyzedActive() { return !!findParalyzeStatusIcon(); }
  function shouldPrioritizeHpHeal() { const healStatus = bot.heal?.status?.(); const hp = Number(healStatus?.stats?.hp?.current); const minHp = Math.max(0, Number(bot.heal?.config?.minHp) || 0); return !!healStatus?.running && !!bot.heal?.config?.enabled && Number.isFinite(hp) && hp > 0 && hp <= minHp; }
  function tryAntiParalyze(now = Date.now()) { if (!state.running || !config.enabled) return false; const spellWords = String(config.spellWords || "").trim(); if (!spellWords || !isParalyzedActive()) return false; if (shouldPrioritizeHpHeal()) { bot.heal?.tryHeal?.(); return false; } if (now - state.lastCastAt < 2100) return false; const sent = bot.sendChat(spellWords); if (sent) { state.lastCastAt = now; bot.log("cast anti-paralyze spell", { spellWords, cooldownMs: 2100, detectionSource: state.detectionSource, ignoreMonsterGuard: !!config.ignoreMonsterGuard }); } return sent; }
  function scheduleNextTick() { if (!state.running || !config.enabled) return; state.timerId = window.setTimeout(tick, 250); }
  function tick() { if (!state.running || !config.enabled) return; try { tryAntiParalyze(); } catch (error) { bot.log("anti-paralyze tick failed", error?.message || error); } finally { scheduleNextTick(); } }
  function stopUiObserver() { state.uiObserver?.disconnect(); state.uiObserver = null; }
  function startUiObserver() {
    if (!state.running || state.uiObserver) return;
    if (installUi()) return;
    state.uiObserver = new MutationObserver(() => { if (installUi()) stopUiObserver(); });
    state.uiObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  function start(overrides = {}) { Object.assign(config, overrides, { enabled: true, tickMs: 250, recastCooldownMs: 2100 }); config.spellWords = String(config.spellWords || "").trim(); config.ignoreMonsterGuard = !!config.ignoreMonsterGuard; persistConfig(); if (state.running) { syncUi(); return false; } state.running = true; startUiObserver(); tick(); syncUi(); bot.log("anti-paralyze started", { ...config }); return true; }
  function stop(options = {}) { state.running = false; if (state.timerId != null) { window.clearTimeout(state.timerId); state.timerId = null; } stopUiObserver(); state.detectionSource = null; state.detectedElement = null; if (options.persistEnabled !== false) { config.enabled = false; persistConfig(); } syncUi(); bot.log("anti-paralyze stopped"); return true; }
  function updateConfig(nextConfig = {}) { if (Object.prototype.hasOwnProperty.call(nextConfig, "spellWords")) nextConfig.spellWords = String(nextConfig.spellWords || "").trim(); if (Object.prototype.hasOwnProperty.call(nextConfig, "ignoreMonsterGuard")) nextConfig.ignoreMonsterGuard = !!nextConfig.ignoreMonsterGuard; Object.assign(config, nextConfig, { tickMs: 250, recastCooldownMs: 2100 }); persistConfig(); syncUi(); return { ...config }; }
  function syncUi() { const toggle = document.getElementById("minibia-bot-anti-paralyze-enabled"); const ignoreGuardToggle = document.getElementById("minibia-bot-anti-paralyze-ignore-guard"); const spellInput = document.getElementById("minibia-bot-anti-paralyze-spell"); if (toggle) toggle.checked = state.running; if (ignoreGuardToggle) ignoreGuardToggle.checked = !!config.ignoreMonsterGuard; if (spellInput && document.activeElement !== spellInput) spellInput.value = config.spellWords || ""; }
  function installUi() {
    if (document.getElementById("minibia-bot-anti-paralyze-enabled")) { syncUi(); return true; }
    const autoHealToggle = document.getElementById("minibia-bot-auto-heal-enabled"); const autoHealStack = autoHealToggle?.closest?.(".mb-section")?.querySelector?.(".mb-stack"); if (!autoHealStack) return false;
    const wrapper = document.createElement("div"); wrapper.className = "mb-stack"; wrapper.style.paddingTop = "8px"; wrapper.style.borderTop = "1px solid rgba(224, 200, 148, 0.16)";
    wrapper.innerHTML = `<div class="mb-row"><label class="mb-toggle"><input type="checkbox" id="minibia-bot-anti-paralyze-enabled" /><span>Anti Paralyze</span></label><label class="mb-toggle"><input type="checkbox" id="minibia-bot-anti-paralyze-ignore-guard" /><span>Ignore Guard</span></label><input type="text" id="minibia-bot-anti-paralyze-spell" placeholder="Spell words" /></div><div class="mb-small-note">Detects the paralyze status icon. Ignore Guard lets Anti Paralyze cast with monsters nearby. Auto Heal still takes priority at or below Minimum HP. Cooldown: 2100 ms.</div>`;
    autoHealStack.appendChild(wrapper);
    const toggle = wrapper.querySelector("#minibia-bot-anti-paralyze-enabled"); const ignoreGuardToggle = wrapper.querySelector("#minibia-bot-anti-paralyze-ignore-guard"); const spellInput = wrapper.querySelector("#minibia-bot-anti-paralyze-spell");
    spellInput.value = config.spellWords || ""; toggle.checked = state.running; toggle.dataset.antiParalyzeToggleFix = "true"; ignoreGuardToggle.checked = !!config.ignoreMonsterGuard;
    spellInput.addEventListener("change", () => updateConfig({ spellWords: spellInput.value })); ignoreGuardToggle.addEventListener("change", () => updateConfig({ ignoreMonsterGuard: ignoreGuardToggle.checked }));
    toggle.addEventListener("change", () => { const spellWords = String(spellInput.value || "").trim(); updateConfig({ spellWords, ignoreMonsterGuard: ignoreGuardToggle.checked }); if (toggle.checked) start({ spellWords, ignoreMonsterGuard: ignoreGuardToggle.checked }); else stop(); toggle.checked = state.running; });
    return true;
  }
  function status() { const active = !!state.running && !!config.enabled; const paralyzed = active ? isParalyzedActive() : false; return { running: state.running, config: { ...config }, paralyzed, healPriorityActive: active ? shouldPrioritizeHpHeal() : false, detectionSource: active ? state.detectionSource : null, detectedElement: active && state.detectedElement ? { tag: state.detectedElement.tagName, id: state.detectedElement.id || null, className: String(state.detectedElement.className || "") || null } : null, lastCastAt: state.lastCastAt }; }
  function installUiOnce() { if (installUi()) return; let attempts = 0; state.uiRetryTimerId = window.setInterval(() => { attempts += 1; if (installUi() || attempts >= 40) { window.clearInterval(state.uiRetryTimerId); state.uiRetryTimerId = null; } }, 250); }
  bot.addCleanup?.(() => { stop({ persistEnabled: false }); if (state.uiRetryTimerId != null) window.clearInterval(state.uiRetryTimerId); state.uiRetryTimerId = null; });
  bot.antiParalyze = { start, stop, status, updateConfig, isParalyzedActive, shouldPrioritizeHpHeal, tryAntiParalyze, config };
  window.setTimeout(installUiOnce, 0); if (config.enabled) start();
};