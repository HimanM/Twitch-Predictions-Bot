/**
 * config.js — Shared constants, runtime state, settings persistence, and derived getters.
 * Must be the first @require module loaded.
 */
(function () {
  "use strict";

  window.TPRED = window.TPRED || {};
  const T = window.TPRED;

  T.LOG_PREFIX = "[TwitchPred]";
  T.SETTINGS_KEY = "tpred.settings.v1";

  T.CONFIG = {
    BET_TRIGGER_SECONDS: 7,
    EVAL_INTERVAL_MS: 1000,
    WATCH_INTERVAL_MS: 250,
    DISCOVERY_INTERVAL_MS: 40000,
    MAX_BET: 1000,
    MAX_AUTO_BET: 1000000,
    TIERS: [
      { minRatio: 100, bet: 500 },
      { minRatio: 20, bet: 400 },
      { minRatio: 10, bet: 300 },
      { minRatio: 5, bet: 200 },
      { minRatio: 2, bet: 100 },
    ],
  };

  T.runtime = {
    pendingDecision: null,
    latestState: null,
    lastPlacedBet: null,
    betInFlight: false,
    evalIntervalId: null,
    watchIntervalId: null,
    discoveryIntervalId: null,
    discoveryPending: false,
    placedForPredictionKey: null,
    observer: null,
    lastOpenAttemptAt: 0,
    lastDetailsAttemptAt: 0,
    lastStateSignature: "",
    lastDiscoveryStatusSignature: "",
    lastLogByKey: Object.create(null),
    logs: [],
    ui: {
      root: null,
      panel: null,
      panelMain: null,
      logsPane: null,
      status: null,
      prediction: null,
      logs: null,
      clearLogs: null,
      toggleLogs: null,
      manualAmount: null,
      autoMinBet: null,
      autoMaxBet: null,
      discoveryInterval: null,
      evalInterval: null,
      toggleEnabled: null,
      toggleDryRun: null,
      toggleForceMinOnSkip: null,
      toggleAutoOpenPopover: null,
      toggleAutoOpenDetails: null,
    },
  };

  function loadSettings() {
    const defaults = {
      enabled: true,
      dryRun: false,
      forceMinOnSkip: false,
      autoOpenPopover: true,
      autoOpenDetails: true,
      discoveryIntervalMs: T.CONFIG.DISCOVERY_INTERVAL_MS,
      evalIntervalMs: T.CONFIG.EVAL_INTERVAL_MS,
      autoMinBet: 1,
      autoMaxBet: T.CONFIG.MAX_BET,
      logsVisible: true,
      panelOpen: false,
      manualAmount: 100,
    };

    try {
      const raw = localStorage.getItem(T.SETTINGS_KEY);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(T.SETTINGS_KEY, JSON.stringify(T.settings));
    } catch {
      // ignore storage failures
    }
  }

  function getDiscoveryIntervalMs() {
    const n = parseInt(T.settings.discoveryIntervalMs, 10);
    if (Number.isNaN(n)) return T.CONFIG.DISCOVERY_INTERVAL_MS;
    return Math.max(5000, Math.min(300000, n));
  }

  function getEvalIntervalMs() {
    const n = parseInt(T.settings.evalIntervalMs, 10);
    if (Number.isNaN(n)) return T.CONFIG.EVAL_INTERVAL_MS;
    return Math.max(1000, Math.min(60000, n));
  }

  function getAutoMinBet() {
    const n = Number(T.settings.autoMinBet);
    if (Number.isNaN(n)) return 1;
    return Math.max(1, Math.min(T.CONFIG.MAX_AUTO_BET, Math.round(n)));
  }

  function getAutoMaxBet() {
    const n = Number(T.settings.autoMaxBet);
    if (Number.isNaN(n)) return T.CONFIG.MAX_BET;
    return Math.max(1, Math.min(T.CONFIG.MAX_AUTO_BET, Math.round(n)));
  }

  T.loadSettings = loadSettings;
  T.saveSettings = saveSettings;
  T.getDiscoveryIntervalMs = getDiscoveryIntervalMs;
  T.getEvalIntervalMs = getEvalIntervalMs;
  T.getAutoMinBet = getAutoMinBet;
  T.getAutoMaxBet = getAutoMaxBet;

  // Load settings last so getters are available if loadSettings needs them.
  T.settings = loadSettings();
})();
