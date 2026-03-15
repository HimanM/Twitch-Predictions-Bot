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

  function log(...args) {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    const entry = { ts: Date.now(), msg };
    T.runtime.logs.unshift(entry);
    if (T.runtime.logs.length > 120) T.runtime.logs.length = 120;
    console.log(T.LOG_PREFIX, ...args);
    T.renderUi();
  }

  function logChanged(key, ...args) {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    if (T.runtime.lastLogByKey[key] === msg) return;
    T.runtime.lastLogByKey[key] = msg;
    log(...args);
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
      return pending;
    }

    const fallback = T.runtime.lastBettableDecision;
    if (!fallback?.shouldBet) return null;
    if (fallback.predictionKey !== key) return null;

    const ageMs = Date.now() - (fallback.snapshotAt || 0);
    if (ageMs > 15000) return null;

    return fallback;
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

    if (T.runtime.betInFlight) {
      return;
    }

    if (state.status !== "ACTIVE") {
      clearIntervals();
      T.closeRewardCenterPanel();
      log(`Prediction no longer active (${state.status}); switched back to discovery mode.`);
      if (T.settings.enabled) {
        restartDiscoveryLoop();
      }
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

    if (withinTrigger) {
      const decision = selectTriggerDecision(state, key);
      if (!decision) {
        log("No bettable decision at trigger; skipping.");
        clearIntervals();
        return;
      }

      clearIntervals();
      const success = await T.placeBet(decision);
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
        restartDiscoveryLoop();
      }
    }
  }

  function startLoopsIfNeeded() {
    if (!T.settings.enabled) return;
    if (T.runtime.evalIntervalId || T.runtime.watchIntervalId) return;

    if (T.runtime.discoveryIntervalId) {
      clearInterval(T.runtime.discoveryIntervalId);
      T.runtime.discoveryIntervalId = null;
    }

    // Pre-run once so pendingDecision exists quickly.
    evaluate();
    watchAndExecute();

    T.runtime.evalIntervalId = setInterval(evaluate, T.getEvalIntervalMs());
    T.runtime.watchIntervalId = setInterval(watchAndExecute, T.CONFIG.WATCH_INTERVAL_MS);
    log("Prediction loops started.");
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
      T.ensureUi();
      const state = T.readPredictionState();
      if (state?.status === "ACTIVE") {
        startLoopsIfNeeded();
      }
    });

    T.runtime.observer.observe(document.body, { subtree: true, childList: true });
  }

  function init() {
    T.ensureUi();
    setInterval(T.ensureUi, 3000);
    setupObserver();
    if (T.settings.enabled) {
      startAutomationPolling();
      log("Auto-Bet is enabled in settings. Automation started.");
    } else {
      log("Auto-Bet is disabled in settings. Polling is paused.");
    }
    logModeSnapshot("Startup mode");
    log("Script initialized.");
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
  T.runner = { init };
})();
