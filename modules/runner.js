/**
 * runner.js — Core logging, all polling loops, MutationObserver wiring, and init().
 * Depends on: all other modules.
 * Exports T.log, T.logChanged, T.isPollingActive, T.logModeSnapshot,
 *         T.clearIntervals, T.stopAutomationPolling, T.startAutomationPolling,
 *         T.evaluate, T.watchAndExecute, T.startLoopsIfNeeded,
 *         T.checkListStateAndMaybeStart, T.runDiscoveryProbe,
 *         T.startDiscoveryLoop, T.restartDiscoveryLoop, T.setupObserver,
 *         T.runner.init
 */
(function () {
  "use strict";

  const T = window.TPRED;

  function createTabId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `tpred-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readAutoBetLock() {
    try {
      const raw = localStorage.getItem(T.CONFIG.AUTO_BET_LOCK_KEY);
      if (!raw) return null;
      const lock = JSON.parse(raw);
      if (!lock || typeof lock.tabId !== "string" || typeof lock.ts !== "number") return null;
      return lock;
    } catch {
      return null;
    }
  }

  function isLockFresh(lock) {
    if (!lock) return false;
    return (Date.now() - lock.ts) <= T.CONFIG.AUTO_BET_LOCK_TTL_MS;
  }

  function writeAutoBetLock() {
    if (!T.runtime.tabId) return;
    try {
      localStorage.setItem(
        T.CONFIG.AUTO_BET_LOCK_KEY,
        JSON.stringify({ tabId: T.runtime.tabId, ts: Date.now() })
      );
    } catch {
      // ignore lock write failures
    }
  }

  function stopAutoBetLockHeartbeat() {
    if (T.runtime.autoBetLockHeartbeatId) {
      clearInterval(T.runtime.autoBetLockHeartbeatId);
      T.runtime.autoBetLockHeartbeatId = null;
    }
  }

  function hasAutoBetLock() {
    const lock = readAutoBetLock();
    return Boolean(lock && isLockFresh(lock) && lock.tabId === T.runtime.tabId);
  }

  function startAutoBetLockHeartbeat() {
    if (T.runtime.autoBetLockHeartbeatId) return;
    T.runtime.autoBetLockHeartbeatId = setInterval(() => {
      if (!T.settings.enabled) {
        stopAutoBetLockHeartbeat();
        return;
      }
      if (hasAutoBetLock()) {
        writeAutoBetLock();
      }
    }, T.CONFIG.AUTO_BET_LOCK_HEARTBEAT_MS);
  }

  function claimAutoBetLock(forceClaim) {
    if (!T.runtime.tabId) T.runtime.tabId = createTabId();

    const current = readAutoBetLock();
    const canClaim = Boolean(forceClaim) || !current || !isLockFresh(current) || current.tabId === T.runtime.tabId;
    if (!canClaim) return false;

    writeAutoBetLock();
    const verify = readAutoBetLock();
    const ok = Boolean(verify && verify.tabId === T.runtime.tabId);
    if (ok) startAutoBetLockHeartbeat();
    return ok;
  }

  function releaseAutoBetLock() {
    stopAutoBetLockHeartbeat();
    const current = readAutoBetLock();
    if (!current || current.tabId !== T.runtime.tabId) return;
    try {
      localStorage.removeItem(T.CONFIG.AUTO_BET_LOCK_KEY);
    } catch {
      // ignore lock release failures
    }
  }

  function handleAutoBetLockLost(reason) {
    if (!T.settings.enabled) return;
    T.settings.enabled = false;
    T.saveSettings();
    stopAutomationPolling();
    stopAutoBetLockHeartbeat();
    if (T.runtime.ui.toggleEnabled) {
      T.runtime.ui.toggleEnabled.checked = false;
    }
    log(`Auto-Bet disabled in this tab (${reason}). Another tab is active.`, "warn");
    logModeSnapshot("Mode updated");
    T.renderUi();
  }

  function initAutoBetLock() {
    if (!T.runtime.tabId) T.runtime.tabId = createTabId();

    if (T.runtime.autoBetStorageHandler) {
      window.removeEventListener("storage", T.runtime.autoBetStorageHandler);
    }

    T.runtime.autoBetStorageHandler = (event) => {
      if (event.key !== T.CONFIG.AUTO_BET_LOCK_KEY) return;
      if (!T.settings.enabled) return;
      if (hasAutoBetLock()) return;
      handleAutoBetLockLost("lock claimed by another tab");
    };
    window.addEventListener("storage", T.runtime.autoBetStorageHandler);

    if (T.runtime.beforeUnloadHandler) {
      window.removeEventListener("beforeunload", T.runtime.beforeUnloadHandler);
    }
    T.runtime.beforeUnloadHandler = () => {
      releaseAutoBetLock();
    };
    window.addEventListener("beforeunload", T.runtime.beforeUnloadHandler);
  }

  function setAutoBetEnabled(enabled, sourceLabel, forceClaim) {
    if (!enabled) {
      T.settings.enabled = false;
      T.saveSettings();
      stopAutomationPolling();
      releaseAutoBetLock();
      log(`Auto-Bet disabled${sourceLabel ? ` (${sourceLabel})` : ""}. Stopped active loops and discovery polling.`, "warn");
      logModeSnapshot("Mode updated");
      T.renderUi();
      return false;
    }

    const claimed = claimAutoBetLock(forceClaim);
    if (!claimed) {
      T.settings.enabled = false;
      T.saveSettings();
      stopAutomationPolling();
      if (T.runtime.ui.toggleEnabled) {
        T.runtime.ui.toggleEnabled.checked = false;
      }
      log("Auto-Bet enable blocked: another tab already owns the auto-bet lock.", "error");
      logModeSnapshot("Mode updated");
      T.renderUi();
      return false;
    }

    T.settings.enabled = true;
    T.saveSettings();
    startAutomationPolling();
    log(`Auto-Bet enabled${sourceLabel ? ` (${sourceLabel})` : ""}. Discovery polling resumed.`, "success");
    logModeSnapshot("Mode updated");
    T.renderUi();
    return true;
  }

  function log(msg, level) {
    if (T.settings.logsDisabled) return;
    const lvl = level || "info";
    const entry = { ts: Date.now(), msg: String(msg), level: lvl };
    T.runtime.logs.unshift(entry);
    if (T.runtime.logs.length > 80) T.runtime.logs.length = 80;
    T.renderUi();
  }

  function logChanged(key, msg, level) {
    if (T.runtime.lastLogByKey[key] === msg) return;
    T.runtime.lastLogByKey[key] = msg;
    log(msg, level);
  }

  function isPollingActive() {
    return Boolean(T.runtime.evalIntervalId || T.runtime.watchIntervalId || T.runtime.discoveryIntervalId);
  }

  function logModeSnapshot(contextLabel) {
    const strategyMode = T.settings.strategyMode === "dynamic" ? "DYNAMIC" : "FIXED";
    log(
      `${contextLabel} | Auto-Bet=${T.settings.enabled ? "ON" : "OFF"} | ` +
      `Dry-Run=${T.settings.dryRun ? "ON" : "OFF"} | ` +
      `Strategy=${strategyMode} | Polling=${isPollingActive() ? "ON" : "OFF"}`
    );
  }

  function clearIntervals() {
    if (T.runtime.evalIntervalId) {
      clearInterval(T.runtime.evalIntervalId);
      T.runtime.evalIntervalId = null;
    }
    if (T.runtime.watchIntervalId) {
      clearInterval(T.runtime.watchIntervalId);
      T.runtime.watchIntervalId = null;
    }
  }

  function stopAutomationPolling() {
    clearIntervals();
    if (T.runtime.discoveryIntervalId) {
      clearInterval(T.runtime.discoveryIntervalId);
      T.runtime.discoveryIntervalId = null;
    }
    if (T.runtime.postBetTimerId) {
      clearTimeout(T.runtime.postBetTimerId);
      T.runtime.postBetTimerId = null;
    }
    T.runtime.discoveryPending = false;
  }

  function startAutomationPolling() {
    const state = T.readPredictionState();
    if (state?.status === "ACTIVE") {
      startLoopsIfNeeded();
      logChanged("modeSwitch", "Active prediction detected. Switched to active monitoring mode.");
      return;
    }
    startDiscoveryLoop();
    logChanged("modeSwitch", `Idle mode active. Discovery probe running every ${T.getDiscoveryIntervalMs()} ms.`);
  }

  function evaluate() {
    T.ensureUi();
    T.ensurePredictionUiOpen();
    T.ensurePredictionDetailsOpen();

    const state = T.readPredictionState();
    if (!state) return;

    T.runtime.latestState = state;

    const rawDecision = T.decideBet(state);
    const decision = T.applyForceMinBetIfEnabled(state, rawDecision);
    T.runtime.pendingDecision = {
      ...decision,
      snapshotAt: Date.now(),
      secondsLeft: state.secondsLeft,
      predictionKey: T.makePredictionKey(state),
    };

    if (state.status === "ACTIVE" && T.runtime.pendingDecision.shouldBet) {
      T.runtime.lastBettableDecision = { ...T.runtime.pendingDecision };
    }

    const sig = [
      state.status,
      state.secondsLeft,
      state.outcomes[0]?.totalPoints,
      state.outcomes[1]?.totalPoints,
      T.runtime.pendingDecision.outcomeId,
      T.runtime.pendingDecision.amount,
    ].join("|");

    if (sig !== T.runtime.lastStateSignature) {
      T.runtime.lastStateSignature = sig;
      const [a, b] = state.outcomes;
      const underdog = a.totalPoints <= b.totalPoints ? a : b;
      log(
        `Update: ${a.title}=${a.totalPoints}, ${b.title}=${b.totalPoints}, ` +
        `time=${Number.isFinite(state.secondsLeft) ? state.secondsLeft : "?"}s, ` +
        `underdog=${underdog.title}, pending=${T.runtime.pendingDecision.shouldBet ? `${T.runtime.pendingDecision.outcomeTitle}/${T.runtime.pendingDecision.amount}` : "skip"}`
      );
    }

    T.renderUi();
  }

  function selectTriggerDecision(state, key) {
    const pending = T.runtime.pendingDecision;
    if (pending?.shouldBet && pending.predictionKey === key) {
      return { decision: pending, source: "pending", ageMs: 0 };
    }

    const fallback = T.runtime.lastBettableDecision;
    if (!fallback?.shouldBet) return null;
    if (fallback.predictionKey !== key) return null;

    const ageMs = Date.now() - (fallback.snapshotAt || 0);
    if (ageMs > 15000) return null;

    return { decision: fallback, source: "fallback", ageMs };
  }

  async function watchAndExecute() {
    T.ensureUi();
    T.ensurePredictionUiOpen();
    T.ensurePredictionDetailsOpen();

    const state = T.readPredictionState();
    if (!state) return;

    const key = T.makePredictionKey(state);
    if (T.runtime.placedForPredictionKey === key) return;

    if (!T.settings.enabled) {
      return;
    }

    if (!hasAutoBetLock()) {
      handleAutoBetLockLost("lock ownership changed");
      return;
    }

    if (T.runtime.betInFlight) {
      return;
    }

    const secondsLeft = Number(state.secondsLeft);
    const pendingSeconds = Number(T.runtime.pendingDecision?.secondsLeft);
    const withinTrigger = (
      Number.isFinite(secondsLeft) && secondsLeft <= T.CONFIG.BET_TRIGGER_SECONDS
    ) || (
      Number.isFinite(pendingSeconds) &&
      pendingSeconds <= T.CONFIG.BET_TRIGGER_SECONDS &&
      T.runtime.pendingDecision?.predictionKey === key
    );

    // Last-chance trigger: if the prediction JUST locked but we had a recent
    // bettable decision within the trigger window, attempt to bet anyway.
    const lastBettable = T.runtime.lastBettableDecision;
    const lastChanceTrigger = Boolean(
      !withinTrigger &&
      state.status !== "ACTIVE" &&
      lastBettable?.shouldBet &&
      lastBettable.predictionKey === key &&
      Number.isFinite(lastBettable.secondsLeft) &&
      lastBettable.secondsLeft <= T.CONFIG.BET_TRIGGER_SECONDS &&
      (Date.now() - (lastBettable.snapshotAt || 0)) <= 15000
    );

    if (withinTrigger || lastChanceTrigger) {
      const picked = selectTriggerDecision(state, key);
      if (!picked?.decision) {
        log(
          lastChanceTrigger
            ? `Last-chance trigger (${state.status}) but no bettable decision; giving up.`
            : "No bettable decision at trigger; skipping.",
          "warn"
        );
        clearIntervals();
        if (state.status !== "ACTIVE" && T.settings.enabled) {
          T.closeRewardCenterPanel();
          restartDiscoveryLoop();
        }
        return;
      }
      const { decision, source, ageMs } = picked;

      log(
        `Trigger decision: source=${source}, outcome=${decision.outcomeTitle}, amount=${decision.amount}` +
        `${source === "fallback" ? `, ageMs=${ageMs}` : ""}` +
        `${lastChanceTrigger ? ` (last-chance, status=${state.status})` : ""}.`
      );

      clearIntervals();
      log(`Bet exec: placing ${decision.amount} on ${decision.outcomeTitle}.`, "info");
      const success = await T.placeBet(decision);
      log(`Bet exec result: ${success ? "success" : "failed"}.`, success ? "success" : "error");
      if (success) {
        T.runtime.lastPlacedBet = {
          predictionKey: key,
          outcomeId: decision.outcomeId,
          amount: decision.amount,
          at: Date.now(),
        };
        T.runtime.placedForPredictionKey = key;
      }
      if (T.settings.enabled) {
        // Wait for the prediction to expire + 5s buffer before resuming discovery
        const waitSec = (Number.isFinite(secondsLeft) ? secondsLeft : 0) + 5;
        if (T.runtime.postBetTimerId) clearTimeout(T.runtime.postBetTimerId);
        log(`Bet placed. Waiting ${waitSec}s before resuming discovery.`, "info");
        T.runtime.postBetTimerId = setTimeout(() => {
          T.runtime.postBetTimerId = null;
          if (T.settings.enabled) {
            T.closeRewardCenterPanel();
            restartDiscoveryLoop();
            log("Post-bet wait complete. Discovery resumed.", "success");
          }
        }, waitSec * 1000);
      }
      return;
    }

    if (state.status !== "ACTIVE") {
      clearIntervals();
      T.closeRewardCenterPanel();
      log(`Prediction no longer active (${state.status}); switched back to discovery mode.`, "warn");
      if (T.settings.enabled) {
        restartDiscoveryLoop();
      }
      return;
    }
  }

  function startLoopsIfNeeded() {
    if (!T.settings.enabled) return;
    if (T.runtime.evalIntervalId || T.runtime.watchIntervalId) return;
    if (T.runtime.postBetTimerId) return; // waiting for post-bet cooldown
    if (T.runtime.betInFlight) return; // bet is being placed right now

    // Don't restart loops if we already placed for this prediction
    const state = T.readPredictionState();
    if (state && T.runtime.placedForPredictionKey === T.makePredictionKey(state)) return;

    if (T.runtime.discoveryIntervalId) {
      clearInterval(T.runtime.discoveryIntervalId);
      T.runtime.discoveryIntervalId = null;
    }

    // Set intervals FIRST so that clearIntervals() inside watchAndExecute
    // (which is async) can actually clear them during bet placement.
    T.runtime.evalIntervalId = setInterval(evaluate, T.getEvalIntervalMs());
    T.runtime.watchIntervalId = setInterval(watchAndExecute, T.CONFIG.WATCH_INTERVAL_MS);
    log("Prediction loops started.", "success");

    // Pre-run once so pendingDecision exists quickly.
    evaluate();
    watchAndExecute();
  }

  function checkListStateAndMaybeStart() {
    const listItem = document.querySelector(".predictions-list-item");
    if (!listItem) {
      logChanged("discoveryStatus", "Discovery: no prediction card found.");
      T.closeRewardCenterPanel({ silent: true });
      return;
    }

    const subtitle = listItem
      .querySelector('[data-test-selector="predictions-list-item__subtitle"]')
      ?.textContent
      ?.trim() ?? "";
    const status = T.parseStatusText(subtitle);
    const discoverySig = `${status}|${subtitle}`;
    if (discoverySig !== T.runtime.lastDiscoveryStatusSignature) {
      T.runtime.lastDiscoveryStatusSignature = discoverySig;
      log(`Discovery: prediction status ${status}${subtitle ? ` (${subtitle})` : ""}.`);
    }

    if (status === "ACTIVE") {
      startLoopsIfNeeded();
      if (T.settings.autoOpenDetails) T.ensurePredictionDetailsOpen();
      return;
    }

    T.closeRewardCenterPanel({ silent: true });
  }

  function runDiscoveryProbe() {
    if (!T.settings.enabled) return;
    if (!T.settings.autoOpenPopover) return;
    if (T.runtime.evalIntervalId || T.runtime.watchIntervalId) return;
    if (T.runtime.discoveryPending) return;

    T.runtime.discoveryPending = true;

    const alreadyOpen = T.hasPredictionListOpen() || T.hasPredictionDetailsOpen();
    if (!alreadyOpen) {
      const button = T.findChannelPointsButton();
      if (!button) {
        T.runtime.discoveryPending = false;
        return;
      }
      T.click(button);
      logChanged("discoveryOpen", "Discovery: opened channel points popover.");
    }

    setTimeout(() => {
      try {
        checkListStateAndMaybeStart();
      } finally {
        T.runtime.discoveryPending = false;
      }
    }, 450);
  }

  function startDiscoveryLoop() {
    if (!T.settings.enabled) return;
    if (T.runtime.discoveryIntervalId) return;
    T.runtime.discoveryIntervalId = setInterval(runDiscoveryProbe, T.getDiscoveryIntervalMs());
    runDiscoveryProbe();
  }

  function restartDiscoveryLoop() {
    if (T.runtime.discoveryIntervalId) {
      clearInterval(T.runtime.discoveryIntervalId);
      T.runtime.discoveryIntervalId = null;
    }
    startDiscoveryLoop();
  }

  function setupObserver() {
    if (T.runtime.observer) return;

    T.runtime.observer = new MutationObserver(() => {
      if (!T.settings.enabled) return;
      if (T.runtime.evalIntervalId || T.runtime.watchIntervalId) return;
      if (T.runtime.postBetTimerId) return;
      if (T.runtime.betInFlight) return;
      T.ensureUi();
      const state = T.readPredictionState();
      if (state?.status === "ACTIVE") {
        if (T.runtime.placedForPredictionKey === T.makePredictionKey(state)) return;
        startLoopsIfNeeded();
      }
    });

    T.runtime.observer.observe(document.body, { subtree: true, childList: true });
  }

  function init() {
    T.ensureUi();
    setInterval(T.ensureUi, 3000);
    initAutoBetLock();
    setupObserver();
    if (T.settings.enabled) {
      if (claimAutoBetLock()) {
        startAutomationPolling();
        log("Auto-Bet is enabled in settings. Automation started.", "success");
      } else {
        T.settings.enabled = false;
        T.saveSettings();
        log("Auto-Bet was enabled in settings, but another tab owns the lock. This tab is observe-only.", "warn");
      }
    } else {
      log("Auto-Bet is disabled in settings. Polling is paused.", "warn");
    }
    logModeSnapshot("Startup mode");
    log("Script initialized.", "success");
  }

  T.log = log;
  T.logChanged = logChanged;
  T.isPollingActive = isPollingActive;
  T.logModeSnapshot = logModeSnapshot;
  T.clearIntervals = clearIntervals;
  T.stopAutomationPolling = stopAutomationPolling;
  T.startAutomationPolling = startAutomationPolling;
  T.evaluate = evaluate;
  T.watchAndExecute = watchAndExecute;
  T.startLoopsIfNeeded = startLoopsIfNeeded;
  T.checkListStateAndMaybeStart = checkListStateAndMaybeStart;
  T.runDiscoveryProbe = runDiscoveryProbe;
  T.startDiscoveryLoop = startDiscoveryLoop;
  T.restartDiscoveryLoop = restartDiscoveryLoop;
  T.setupObserver = setupObserver;
  T.hasAutoBetLock = hasAutoBetLock;
  T.claimAutoBetLock = claimAutoBetLock;
  T.releaseAutoBetLock = releaseAutoBetLock;
  T.setAutoBetEnabled = setAutoBetEnabled;
  T.runner = { init };
})();
