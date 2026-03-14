// ==UserScript==
// @name         Twitch Prediction Auto-Bet (Underdog)
// @namespace    https://twitch.tv/
// @version      1.0.0
// @description  Twitch prediction assistant with live odds panel, logs, manual controls, and optional auto-bet at T-5s.
// @author       https://github.com/HimanM
// @homepageURL  https://github.com/HimanM
// @supportURL   https://github.com/HimanM
// @source       https://github.com/HimanM
// @license      MIT
// @match        https://www.twitch.tv/*
// @grant        none
// @run-at       document-idle
// @icon         https://i.ibb.co/gbWGc64j/UNDERDOG-TW-PRED.png
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Twitch Prediction Auto-Bet (Underdog)
   * -------------------------------------
   * Features:
   * - Detects predictions and tracks live odds
   * - Optional auto-bet at T-5 seconds
   * - Manual betting controls from injected Twitch-style panel
   * - Persistent settings + discovery probe for future predictions
   */

  const LOG_PREFIX = "[TwitchPred]";
  const SETTINGS_KEY = "tpred.settings.v1";

  const CONFIG = {
    BET_TRIGGER_SECONDS: 5,
    EVAL_INTERVAL_MS: 5000,
    WATCH_INTERVAL_MS: 250,
    DISCOVERY_INTERVAL_MS: 20000,
    MAX_BET: 1000,
    TIERS: [
      { minRatio: 100, bet: 500 },
      { minRatio: 20, bet: 400 },
      { minRatio: 10, bet: 300 },
      { minRatio: 5, bet: 200 },
      { minRatio: 2, bet: 100 },
    ],
  };

  const runtime = {
    pendingDecision: null,
    latestState: null,
    lastPlacedBet: null,
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
      status: null,
      prediction: null,
      logs: null,
      manualAmount: null,
      discoveryInterval: null,
      toggleEnabled: null,
      toggleDryRun: null,
      toggleAutoOpenPopover: null,
      toggleAutoOpenDetails: null,
    },
  };

  const settings = loadSettings();

  function log(...args) {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    const entry = { ts: Date.now(), msg };
    runtime.logs.unshift(entry);
    if (runtime.logs.length > 120) runtime.logs.length = 120;
    console.log(LOG_PREFIX, ...args);
    renderUi();
  }

  function logChanged(key, ...args) {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    if (runtime.lastLogByKey[key] === msg) return;
    runtime.lastLogByKey[key] = msg;
    log(...args);
  }

  function loadSettings() {
    const defaults = {
      enabled: true,
      dryRun: false,
      autoOpenPopover: true,
      autoOpenDetails: true,
      discoveryIntervalMs: CONFIG.DISCOVERY_INTERVAL_MS,
      panelOpen: false,
      manualAmount: 100,
    };

    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage failures
    }
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString();
  }

  function getDiscoveryIntervalMs() {
    const n = parseInt(settings.discoveryIntervalMs, 10);
    if (Number.isNaN(n)) return CONFIG.DISCOVERY_INTERVAL_MS;
    return Math.max(5000, Math.min(300000, n));
  }

  function ensureUi() {
    if (runtime.ui.root && document.contains(runtime.ui.root)) return;

    const nav = document.querySelector('nav[data-a-target="top-nav-container"]');
    if (!nav) return;

    const rightGroup = nav.querySelector(".bZYcrx") || nav.querySelector(".top-nav__search-container")?.parentElement;
    if (!rightGroup) return;

    injectUiStyles();

    const root = document.createElement("div");
    root.id = "tpred-root";
    root.className = "Layout-sc-1xcs6mc-0 AoXTY";
    root.innerHTML = `
      <div class="InjectLayout-sc-1i43xsx-0 iDMNUO">
        <button id="tpred-toggle" class="ScCoreButton-sc-ocjdkq-0 glPhvE ScButtonIcon-sc-9yap0r-0 dgVYJo" aria-label="Prediction Bot" title="Prediction Bot">
          <div class="ButtonIconFigure-sc-1emm8lf-0 lnTwMD">
            <div class="ScSvgWrapper-sc-wkgzod-0 kccyMt tw-svg">
              <svg width="24" height="24" viewBox="0 0 24 24" focusable="false" aria-hidden="true" role="presentation">
                <path d="M7.771 5.229 11 6.5 7.771 7.771 6.5 11 5.229 7.771 2 6.5l3.229-1.271L6.5 2l1.271 3.229Z"></path>
                <path d="M3 11c0-.82.11-1.615.315-2.37l.757.298.934 2.373a7 7 0 1 0 4.708-6.92l-.786-.309-.522-1.326a9 9 0 0 1 7.637 16.297L17 20a2 2 0 0 1 2 2H5a2 2 0 0 1 2-2l.957-.957A9 9 0 0 1 3 11Z"></path>
              </svg>
            </div>
          </div>
        </button>
      </div>
      <div id="tpred-panel" class="tpred-panel${settings.panelOpen ? "" : " tpred-hidden"}">
        <div class="tpred-header">
          <div class="tpred-header-left">
            <p class="CoreText-sc-1txzju1-0 ScTitleText-sc-d9mj2s-0 bqyYtA lbYztg tw-title">Prediction Bot</p>
            <p class="CoreText-sc-1txzju1-0 tpred-caption">Underdog strategy + live monitor</p>
          </div>
          <div class="tpred-header-actions">
            <a id="tpred-github" href="https://github.com/HimanM" target="_blank" rel="noopener noreferrer" class="ScCoreButton-sc-ocjdkq-0 glPhvE ScButtonIcon-sc-9yap0r-0 dgVYJo" aria-label="Open GitHub">
              <div class="ButtonIconFigure-sc-1emm8lf-0 lnTwMD">
                <div class="ScSvgWrapper-sc-wkgzod-0 kccyMt tw-svg">
                  <svg width="20" height="20" viewBox="0 0 24 24" focusable="false" aria-hidden="true" role="presentation">
                    <path fill-rule="evenodd" d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.3 9.4 7.87 10.92.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.97-3.2.7-3.88-1.54-3.88-1.54-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.35.96.1-.76.4-1.27.72-1.56-2.55-.29-5.23-1.28-5.23-5.69 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.03 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.62 1.57.23 2.74.12 3.03.73.8 1.18 1.83 1.18 3.08 0 4.42-2.69 5.4-5.26 5.68.42.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.2.68.8.56A11.53 11.53 0 0 0 23.5 12C23.5 5.66 18.35.5 12 .5Z" clip-rule="evenodd"></path>
                  </svg>
                </div>
              </div>
            </a>
            <button id="tpred-close" class="ScCoreButton-sc-ocjdkq-0 glPhvE ScButtonIcon-sc-9yap0r-0 dgVYJo" aria-label="Close panel">✕</button>
          </div>
        </div>
        <div id="tpred-status" class="CoreText-sc-1txzju1-0"></div>
        <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-enabled" type="checkbox"> <span>Enable Auto-Bet</span></label></div>
        <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-dry-run" type="checkbox"> <span>Dry Run (No bet clicks)</span></label></div>
        <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-auto-popover" type="checkbox"> <span>Auto Open Channel Points</span></label></div>
        <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-auto-details" type="checkbox"> <span>Auto Open Prediction Details</span></label></div>
        <div class="tpred-row tpred-inline">
          <label>Discovery Probe (ms)</label>
          <input id="tpred-discovery-ms" type="number" min="5000" step="1000" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
        </div>
        <div class="tpred-row tpred-inline">
          <label>Manual Amount</label>
          <input id="tpred-manual-amount" type="number" min="1" step="1" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
        </div>
        <div id="tpred-prediction" class="tpred-prediction"></div>
        <div class="tpred-row tpred-inline">
          <button id="tpred-bet-0" class="ScCoreButton-sc-ocjdkq-0 yezmM tpred-native-btn">
            <div class="ScCoreButtonLabel-sc-s7h2b7-0 OyGFd">
              <div data-a-target="tw-core-button-label-text" class="Layout-sc-1xcs6mc-0 iBachR">Predict A</div>
              <div class="ScCoreButtonIcon-sc-ypak37-0 gcsIzP tw-core-button-icon">
                <div class="ScSvgWrapper-sc-wkgzod-0 kccyMt tw-svg" data-a-selector="tw-core-button-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7Z"></path><path fill-rule="evenodd" d="M1 12C1 5.925 5.925 1 12 1s11 4.925 11 11-4.925 11-11 11S1 18.075 1 12Zm11 9a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" clip-rule="evenodd"></path></svg>
                </div>
              </div>
            </div>
          </button>
          <button id="tpred-bet-1" class="ScCoreButton-sc-ocjdkq-0 yezmM tpred-native-btn">
            <div class="ScCoreButtonLabel-sc-s7h2b7-0 OyGFd">
              <div data-a-target="tw-core-button-label-text" class="Layout-sc-1xcs6mc-0 iBachR">Predict B</div>
              <div class="ScCoreButtonIcon-sc-ypak37-0 gcsIzP tw-core-button-icon">
                <div class="ScSvgWrapper-sc-wkgzod-0 kccyMt tw-svg" data-a-selector="tw-core-button-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7Z"></path><path fill-rule="evenodd" d="M1 12C1 5.925 5.925 1 12 1s11 4.925 11 11-4.925 11-11 11S1 18.075 1 12Zm11 9a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" clip-rule="evenodd"></path></svg>
                </div>
              </div>
            </div>
          </button>
        </div>
        <div class="tpred-subtitle CoreText-sc-1txzju1-0">Logs</div>
        <div id="tpred-logs" class="tpred-logs"></div>
      </div>
    `;

    rightGroup.prepend(root);

    runtime.ui.root = root;
    runtime.ui.panel = root.querySelector("#tpred-panel");
    runtime.ui.status = root.querySelector("#tpred-status");
    runtime.ui.prediction = root.querySelector("#tpred-prediction");
    runtime.ui.logs = root.querySelector("#tpred-logs");
    runtime.ui.manualAmount = root.querySelector("#tpred-manual-amount");
    runtime.ui.discoveryInterval = root.querySelector("#tpred-discovery-ms");
    runtime.ui.toggleEnabled = root.querySelector("#tpred-enabled");
    runtime.ui.toggleDryRun = root.querySelector("#tpred-dry-run");
    runtime.ui.toggleAutoOpenPopover = root.querySelector("#tpred-auto-popover");
    runtime.ui.toggleAutoOpenDetails = root.querySelector("#tpred-auto-details");

    root.querySelector("#tpred-toggle")?.addEventListener("click", () => {
      settings.panelOpen = !settings.panelOpen;
      saveSettings();
      renderUi();
    });

    root.querySelector("#tpred-close")?.addEventListener("click", () => {
      settings.panelOpen = false;
      saveSettings();
      renderUi();
    });

    runtime.ui.toggleEnabled.checked = settings.enabled;
    runtime.ui.toggleDryRun.checked = settings.dryRun;
    runtime.ui.toggleAutoOpenPopover.checked = settings.autoOpenPopover;
    runtime.ui.toggleAutoOpenDetails.checked = settings.autoOpenDetails;
    runtime.ui.discoveryInterval.value = String(getDiscoveryIntervalMs());
    runtime.ui.manualAmount.value = String(settings.manualAmount || 100);

    runtime.ui.toggleEnabled.addEventListener("change", () => {
      settings.enabled = runtime.ui.toggleEnabled.checked;
      saveSettings();
      log(`Auto-Bet ${settings.enabled ? "enabled" : "disabled"}.`);
    });

    runtime.ui.toggleDryRun.addEventListener("change", () => {
      settings.dryRun = runtime.ui.toggleDryRun.checked;
      saveSettings();
      log(`Dry Run ${settings.dryRun ? "enabled" : "disabled"}.`);
    });

    runtime.ui.toggleAutoOpenPopover.addEventListener("change", () => {
      settings.autoOpenPopover = runtime.ui.toggleAutoOpenPopover.checked;
      saveSettings();
      log(`Auto Open Channel Points ${settings.autoOpenPopover ? "enabled" : "disabled"}.`);
    });

    runtime.ui.toggleAutoOpenDetails.addEventListener("change", () => {
      settings.autoOpenDetails = runtime.ui.toggleAutoOpenDetails.checked;
      saveSettings();
      log(`Auto Open Prediction Details ${settings.autoOpenDetails ? "enabled" : "disabled"}.`);
    });

    runtime.ui.discoveryInterval.addEventListener("change", () => {
      const val = Math.max(5000, parseInt(runtime.ui.discoveryInterval.value || String(CONFIG.DISCOVERY_INTERVAL_MS), 10) || CONFIG.DISCOVERY_INTERVAL_MS);
      settings.discoveryIntervalMs = val;
      runtime.ui.discoveryInterval.value = String(val);
      saveSettings();
      restartDiscoveryLoop();
      log(`Discovery probe updated: ${val} ms.`);
    });

    runtime.ui.manualAmount.addEventListener("change", () => {
      const val = Math.max(1, parseInt(runtime.ui.manualAmount.value || "100", 10) || 100);
      settings.manualAmount = val;
      runtime.ui.manualAmount.value = String(val);
      saveSettings();
    });

    root.querySelector("#tpred-bet-0")?.addEventListener("click", () => {
      const amount = Math.max(1, parseInt(runtime.ui.manualAmount.value || "100", 10) || 100);
      manualBet("0", amount);
    });

    root.querySelector("#tpred-bet-1")?.addEventListener("click", () => {
      const amount = Math.max(1, parseInt(runtime.ui.manualAmount.value || "100", 10) || 100);
      manualBet("1", amount);
    });

    renderUi();
    log("Injected control panel into top nav.");
  }

  function injectUiStyles() {
    if (document.getElementById("tpred-style")) return;
    const style = document.createElement("style");
    style.id = "tpred-style";
    style.textContent = `
      #tpred-root { position: relative; margin-right: .5rem; }
      .tpred-panel {
        position: absolute;
        right: 0;
        top: 2.75rem;
        width: 380px;
        max-height: 70vh;
        overflow: auto;
        background: var(--color-background-base);
        border: 1px solid var(--color-border-base);
        border-radius: var(--border-radius-medium);
        z-index: 999999;
        padding: .75rem;
        box-shadow: 0 8px 24px rgba(0,0,0,.35);
      }
      .tpred-hidden { display: none; }
      .tpred-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: .5rem; gap: .5rem; }
      .tpred-header-left { display: flex; flex-direction: column; gap: .2rem; }
      .tpred-header-actions { display: flex; align-items: center; gap: .35rem; }
      .tpred-caption { color: var(--color-text-alt-2); font-size: 12px; line-height: 1.2; }
      .tpred-row { margin: .35rem 0; }
      .tpred-inline { display: flex; gap: .5rem; align-items: center; }
      .tpred-inline > label { min-width: 130px; color: var(--color-text-alt-2); font-size: 12px; }
      .tpred-inline input { width: 140px; }
      .tpred-toggle { display: inline-flex; align-items: center; gap: .5rem; cursor: pointer; user-select: none; }
      .tpred-toggle input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--color-brand-accent); }
      .tpred-toggle span { color: var(--color-text-base); font-size: 13px; }
      .tpred-native-btn { flex: 1; }
      .tpred-native-btn .ScCoreButtonLabel-sc-s7h2b7-0 { display: inline-flex; align-items: center; gap: .35rem; }
      .tpred-native-btn:hover { filter: brightness(1.06); }
      .tpred-native-btn.tpred-bot-pending {
        border-color: #0e7a3e;
        box-shadow: inset 0 0 0 1px rgba(14,122,62,.45), 0 0 0 1px rgba(14,122,62,.35);
      }
      .tpred-native-btn.tpred-bot-placed {
        border-color: #1f69ff;
        box-shadow: inset 0 0 0 1px rgba(31,105,255,.5), 0 0 0 1px rgba(31,105,255,.45);
        filter: brightness(1.04);
      }
      #tpred-status {
        margin-bottom: .4rem;
        padding: .4rem .5rem;
        border: 1px solid var(--color-border-base);
        border-radius: var(--border-radius-small);
        background: var(--color-background-alt-2);
        white-space: pre-line;
      }
      .tpred-prediction {
        border: 1px solid var(--color-border-base);
        border-radius: var(--border-radius-small);
        padding: .5rem;
        margin: .5rem 0;
        background: var(--color-background-alt);
      }
      .tpred-outcome { display: flex; justify-content: space-between; font-size: .9rem; margin: .15rem 0; }
      .tpred-subtitle { margin-top: .65rem; margin-bottom: .35rem; font-weight: 600; }
      .tpred-logs {
        font-family: monospace;
        font-size: 12px;
        line-height: 1.35;
        background: var(--color-background-body);
        border: 1px solid var(--color-border-base);
        border-radius: var(--border-radius-small);
        max-height: 220px;
        overflow: auto;
        padding: .35rem;
        white-space: pre-wrap;
      }
      .tpred-log-line { margin: .2rem 0; }
      #tpred-github { text-decoration: none; }
    `;
    document.head.appendChild(style);
  }

  function renderUi() {
    if (!runtime.ui.root) return;

    runtime.ui.panel.classList.toggle("tpred-hidden", !settings.panelOpen);

    const st = runtime.latestState;
    const pending = runtime.pendingDecision;
    const status = st
      ? `State: ${st.status} | Time: ${Number.isFinite(st.secondsLeft) ? `${st.secondsLeft}s` : "?"} | Points: ${st.myAvailablePoints}`
      : "State: idle";
    const pendingText = pending
      ? `\nPending: ${pending.shouldBet ? `${pending.outcomeTitle} / ${pending.amount}` : "skip"}`
      : "\nPending: none";
    runtime.ui.status.textContent = `${status}${pendingText}`;

    if (st) {
      const [a, b] = st.outcomes;
      const predictionKey = makePredictionKey(st);
      const botPending = pending?.shouldBet ? pending : null;
      const botPlaced = runtime.lastPlacedBet?.predictionKey === predictionKey
        ? runtime.lastPlacedBet
        : null;

      const btn0 = runtime.ui.root.querySelector("#tpred-bet-0");
      const btn1 = runtime.ui.root.querySelector("#tpred-bet-1");
      const btn0Label = runtime.ui.root.querySelector("#tpred-bet-0 [data-a-target='tw-core-button-label-text']");
      const btn1Label = runtime.ui.root.querySelector("#tpred-bet-1 [data-a-target='tw-core-button-label-text']");

      const pendingText0 = botPending?.outcomeId === "0" ? `  BOT ${botPending.amount}` : "";
      const pendingText1 = botPending?.outcomeId === "1" ? `  BOT ${botPending.amount}` : "";
      const placedText0 = botPlaced?.outcomeId === "0" ? `  BET ${botPlaced.amount}` : "";
      const placedText1 = botPlaced?.outcomeId === "1" ? `  BET ${botPlaced.amount}` : "";

      if (btn0Label) btn0Label.textContent = `Predict ${a.title}${placedText0 || pendingText0}`;
      if (btn1Label) btn1Label.textContent = `Predict ${b.title}${placedText1 || pendingText1}`;

      btn0?.classList.toggle("tpred-bot-pending", botPending?.outcomeId === "0");
      btn1?.classList.toggle("tpred-bot-pending", botPending?.outcomeId === "1");
      btn0?.classList.toggle("tpred-bot-placed", botPlaced?.outcomeId === "0");
      btn1?.classList.toggle("tpred-bot-placed", botPlaced?.outcomeId === "1");

      runtime.ui.prediction.innerHTML = `
        <div class="tpred-outcome"><span>${a.title}</span><span>${a.totalPoints}</span></div>
        <div class="tpred-outcome"><span>${b.title}</span><span>${b.totalPoints}</span></div>
      `;
    } else {
      const btn0 = runtime.ui.root.querySelector("#tpred-bet-0");
      const btn1 = runtime.ui.root.querySelector("#tpred-bet-1");
      const btn0Label = runtime.ui.root.querySelector("#tpred-bet-0 [data-a-target='tw-core-button-label-text']");
      const btn1Label = runtime.ui.root.querySelector("#tpred-bet-1 [data-a-target='tw-core-button-label-text']");
      if (btn0Label) btn0Label.textContent = "Predict A";
      if (btn1Label) btn1Label.textContent = "Predict B";
      btn0?.classList.remove("tpred-bot-pending", "tpred-bot-placed");
      btn1?.classList.remove("tpred-bot-pending", "tpred-bot-placed");
      runtime.ui.prediction.innerHTML = `<div class="CoreText-sc-1txzju1-0">No prediction state detected.</div>`;
    }

    runtime.ui.logs.innerHTML = runtime.logs
      .slice(0, 60)
      .map((l) => `<div class="tpred-log-line">[${fmtTime(l.ts)}] ${escapeHtml(l.msg)}</div>`)
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function parsePoints(text) {
    if (!text) return 0;
    const s = String(text).trim().replace(/,/g, "");
    const num = parseFloat(s);
    if (Number.isNaN(num)) return 0;
    if (/k$/i.test(s)) return Math.round(num * 1_000);
    if (/m$/i.test(s)) return Math.round(num * 1_000_000);
    return Math.round(num);
  }

  function parseStatusText(text) {
    const t = (text ?? "").toLowerCase();
    if (t.includes("closing in")) return "ACTIVE";
    if (t.includes("closed") || t.includes("waiting for result")) return "LOCKED";
    if (t.includes("resolved") || t.includes("winner") || t.includes("ended")) return "RESOLVED";
    if (t.includes("cancel")) return "CANCELED";
    if (/\d/.test(t)) return "ACTIVE";
    return "UNKNOWN";
  }

  function parseTimerText(text) {
    if (!text) return Infinity;
    const t = text.toLowerCase();

    const colon = t.match(/(\d+):(\d{2})/);
    if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);

    const ms = t.match(/(\d+)\s*m\w*\s+(\d+)\s*s/);
    if (ms) return parseInt(ms[1], 10) * 60 + parseInt(ms[2], 10);

    const mins = t.match(/(\d+)\s*min/);
    if (mins) return parseInt(mins[1], 10) * 60;

    const secs = t.match(/(\d+)\s*s/);
    if (secs) return parseInt(secs[1], 10);

    return Infinity;
  }

  function isRegionRestricted() {
    return Boolean(
      document.querySelector(
        '[data-test-selector="prediction-checkout-active-footer__region-restriction-message"]'
      )
    );
  }

  function readAvailablePoints() {
    // Strongest selector from current Twitch markup.
    const balance = document.querySelector('[data-test-selector="copo-balance-string"] span');
    const direct = parsePoints(balance?.textContent);
    if (direct > 0) return direct;

    // The page has multiple point icons. We choose the largest parsed value near
    // small point icons; quick-bet buttons are usually 10, while wallet is larger.
    const icons = document.querySelectorAll(".channel-points-icon--small");
    let best = 0;

    for (const icon of icons) {
      const container = icon.parentElement?.parentElement;
      const nodes = container?.querySelectorAll("span, p") ?? [];
      for (const node of nodes) {
        const value = parsePoints(node.textContent);
        if (value > best) best = value;
      }
    }

    return best;
  }

  function hasPredictionDetailsOpen() {
    return Boolean(document.querySelector("#channel-points-reward-center-body .prediction-checkout-details-header"));
  }

  function hasPredictionListOpen() {
    return Boolean(document.querySelector(".predictions-list-item"));
  }

  function findChannelPointsButton() {
    // Preferred anchor: balance string nearest clickable button.
    const balanceHost = document.querySelector('[data-test-selector="copo-balance-string"]');
    const fromBalance = balanceHost?.closest("button");
    if (fromBalance) return fromBalance;

    // Fallback: button containing the medium points icon.
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.querySelector(".channel-points-icon--medium")) return btn;
    }
    return null;
  }

  function ensurePredictionUiOpen() {
    if (!settings.autoOpenPopover) return;
    if (hasPredictionListOpen() || hasPredictionDetailsOpen()) return;

    const now = Date.now();
    if (now - runtime.lastOpenAttemptAt < 1500) return;

    const button = findChannelPointsButton();
    if (!button) return;

    runtime.lastOpenAttemptAt = now;
    click(button);
    log("Opened Channel Points popover.");
  }

  function ensurePredictionDetailsOpen() {
    if (!settings.autoOpenDetails) return;
    if (hasPredictionDetailsOpen()) return;
    if (!hasPredictionListOpen()) return;

    const now = Date.now();
    if (now - runtime.lastDetailsAttemptAt < 1500) return;

    const listButton = document.querySelector(".predictions-list-item")?.closest("button");
    if (!listButton) return;

    runtime.lastDetailsAttemptAt = now;
    click(listButton);
    log("Opened prediction details view.");
  }

  function hasAlreadyVoted() {
    return Boolean(document.querySelector('[data-test-selector="user-prediction-string__outcome-title"]'));
  }

  function closeRewardCenterPanel(options) {
    const silent = Boolean(options?.silent);
    const closeBtn = document.querySelector(
      '#channel-points-reward-center-body button[aria-label="Close"], button[aria-label="Close"]'
    );
    if (closeBtn) {
      click(closeBtn);
      if (!silent) {
        logChanged("closePanel", "Closed reward center panel.");
      }
      return true;
    }
    return false;
  }

  function readDetailPoints() {
    const sections = document.querySelectorAll(
      '[data-test-selector="prediction-summary-outcome__statistics"]'
    );
    const values = Array.from(sections)
      .slice(0, 2)
      .map((section) => {
        const svg = section.querySelector('svg[aria-label="Total Channel Points"]');
        const span = svg
          ?.closest('[data-test-selector="prediction-summary-stat__content"]')
          ?.querySelector("span");
        return parsePoints(span?.textContent);
      });

    while (values.length < 2) values.push(0);
    return [values[0], values[1]];
  }

  function readDetailPercents() {
    const bars = document.querySelectorAll(
      '[data-test-selector="prediction-summary-outcome__bar"]'
    );
    const values = Array.from(bars)
      .slice(0, 2)
      .map((bar) => {
        const label = bar.getAttribute("aria-label") ?? "";
        const match = label.match(/([\d.]+)%\s+of votes/i);
        return match ? parseFloat(match[1]) : 0;
      });

    while (values.length < 2) values.push(0);
    return [values[0], values[1]];
  }

  function readOutcomeTitles() {
    const titleEls = document.querySelectorAll(
      '[data-test-selector="prediction-summary-outcome__title"] p'
    );
    if (titleEls.length >= 2) {
      return [
        titleEls[0]?.textContent?.trim() || "?",
        titleEls[1]?.textContent?.trim() || "?",
      ];
    }

    const bars = document.querySelectorAll(
      '[data-test-selector="prediction-summary-outcome__bar"]'
    );
    const values = Array.from(bars)
      .slice(0, 2)
      .map((bar) => {
        const label = bar.getAttribute("aria-label") ?? "";
        const match = label.match(/of votes for (.+)$/i);
        return match?.[1]?.trim() ?? "?";
      });

    while (values.length < 2) values.push("?");
    return [values[0], values[1]];
  }

  function getPredictionButtons() {
    const blueButton = document
      .querySelector(
        ".spectator-prediction-button--blue, .fixedPredictionButton--jEmiF.blue--z7K6N"
      )
      ?.closest("button");

    const pinkButton = document
      .querySelector(
        ".spectator-prediction-button--pink, .fixedPredictionButton--jEmiF.pink--TRx6x"
      )
      ?.closest("button");

    return { blueButton: blueButton ?? null, pinkButton: pinkButton ?? null };
  }

  function makePredictionKey(state) {
    const title = document
      .querySelector(".prediction-checkout-details-header p:first-of-type")
      ?.textContent?.trim() || "prediction";
    const o0 = state?.outcomes?.[0]?.title || "A";
    const o1 = state?.outcomes?.[1]?.title || "B";
    return `${title}::${o0}::${o1}`;
  }

  function readPredictionState() {
    const listItem = document.querySelector(".predictions-list-item");
    const detailRoot = document.querySelector("#channel-points-reward-center-body");
    if (!listItem && !detailRoot) return null;

    const listSubtitle = listItem
      ?.querySelector('[data-test-selector="predictions-list-item__subtitle"]')
      ?.textContent
      ?.trim() ?? "";

    const detailSubtitle = document
      .querySelector(".prediction-checkout-details-header p:nth-of-type(2)")
      ?.textContent
      ?.trim() ?? "";

    const subtitleText = detailSubtitle || listSubtitle;
    const status = parseStatusText(subtitleText);
    const secondsLeft = parseTimerText(subtitleText);

    const listBars = listItem?.querySelectorAll(".predictions-list-item__outcomes--bar") ?? [];
    const listPcts = Array.from(listBars).map((el) => parseFloat(el.style.width) || 0);
    const detailPcts = readDetailPercents();
    const pct0 = listPcts[0] || detailPcts[0] || 50;
    const pct1 = listPcts[1] || detailPcts[1] || 50;

    const poolEl = listItem?.querySelector(
      '[data-test-selector="predictions-list-item__total-points"]'
    );
    let totalPool = parsePoints(poolEl?.textContent);

    const detailPts = readDetailPoints();
    if (!totalPool) totalPool = detailPts[0] + detailPts[1];

    const pts0 = detailPts[0] || Math.round((totalPool * pct0) / 100);
    const pts1 = detailPts[1] || Math.round((totalPool * pct1) / 100);

    const titles = readOutcomeTitles();

    return {
      status,
      secondsLeft,
      myAvailablePoints: isRegionRestricted() ? 0 : readAvailablePoints(),
      outcomes: [
        { id: "0", title: titles[0] ?? "?", totalPoints: pts0, totalUsers: 0 },
        { id: "1", title: titles[1] ?? "?", totalPoints: pts1, totalUsers: 0 },
      ],
    };
  }

  function decideBet(state) {
    const NO_BET = (reason) => ({
      shouldBet: false,
      outcomeId: null,
      outcomeTitle: null,
      amount: 0,
      reason,
    });

    if (!state) return NO_BET("No prediction state.");
    if (state.myAvailablePoints === 0) {
      return NO_BET("Region blocked or no points available — skipping.");
    }

    if (state.status !== "ACTIVE") {
      return NO_BET(`Prediction is not active (status: ${state.status}).`);
    }

    const [a, b] = state.outcomes;
    if (!a || !b) return NO_BET("Could not read two outcomes.");

    if (a.totalPoints === 0 || b.totalPoints === 0) {
      return NO_BET("One outcome has 0 points — not enough data yet.");
    }

    const underdog = a.totalPoints < b.totalPoints ? a : b;
    const favorite = a.totalPoints < b.totalPoints ? b : a;

    const ratio = favorite.totalPoints / underdog.totalPoints;
    const underdogShare = underdog.totalPoints / (underdog.totalPoints + favorite.totalPoints);
    const tier = CONFIG.TIERS.find((t) => ratio >= t.minRatio);

    if (!tier) {
      return NO_BET(
        `Near 50/50 (ratio ${ratio.toFixed(2)}, underdog ${(underdogShare * 100).toFixed(1)}%)`
      );
    }

    let amount = Math.min(tier.bet, CONFIG.MAX_BET, state.myAvailablePoints);
    amount = Math.min(amount, Math.floor(state.myAvailablePoints * 0.5));

    if (amount <= 0) return NO_BET("Calculated amount <= 0");

    return {
      shouldBet: true,
      outcomeId: underdog.id,
      outcomeTitle: underdog.title,
      amount,
      reason: `Underdog ${underdog.title}, ratio ${ratio.toFixed(1)}:1, amount ${amount}`,
    };
  }

  function click(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  function findCustomAmountInput() {
    // Fallback heuristics: Twitch UI can switch between fixed amount chips and custom input.
    const candidates = [
      'input[type="number"]',
      'input[inputmode="numeric"]',
      '[data-test-selector*="prediction"] input',
      '#channel-points-reward-center-body input',
    ];

    for (const sel of candidates) {
      const input = document.querySelector(sel);
      if (input && input.offsetParent !== null) return input;
    }
    return null;
  }

  function findConfirmButton() {
    const buttons = Array.from(document.querySelectorAll("#channel-points-reward-center-body button"));
    for (const btn of buttons) {
      const txt = (btn.textContent || "").trim().toLowerCase();
      if (!txt) continue;
      if (txt.includes("predict") || txt.includes("place") || txt.includes("confirm") || txt.includes("submit")) {
        return btn;
      }
    }
    return null;
  }

  function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function executeBet(outcomeId, amount, sourceLabel) {
    if (hasAlreadyVoted()) {
      log("Already voted on this prediction; skipping.");
      return false;
    }

    if (settings.dryRun) {
      log(`Dry-run: would place ${amount} on outcome ${outcomeId} (${sourceLabel}).`);
      return true;
    }

    const { blueButton, pinkButton } = getPredictionButtons();
    const targetButton = outcomeId === "0" ? blueButton : pinkButton;
    if (!targetButton) {
      log("Outcome button not found for", outcomeId);
      return false;
    }

    if (!click(targetButton)) {
      log("Failed to click outcome button.");
      return false;
    }

    const customToggle = document.querySelector(
      '[data-test-selector="prediction-checkout-active-footer__input-type-toggle"]'
    );
    if (customToggle) click(customToggle);

    const input = findCustomAmountInput();
    const confirmButton = findConfirmButton();

    if (input && confirmButton) {
      setNativeInputValue(input, amount);
      click(confirmButton);
      log(`Predicted ${amount} via ${sourceLabel}.`);
      return true;
    }

    if (amount >= 10) {
      log(
        "Custom amount controls not found; used fixed-button fallback (likely 10 points).",
        "Target amount was",
        amount
      );
      return true;
    }

    log("Unable to place bet: missing custom controls and target amount < fixed minimum.");
    return false;
  }

  function manualBet(outcomeId, amount) {
    ensurePredictionUiOpen();
    ensurePredictionDetailsOpen();
    const st = runtime.latestState || readPredictionState();
    if (!st) {
      log("Manual bet aborted: prediction state not detected.");
      return;
    }
    const title = st.outcomes[outcomeId === "0" ? 0 : 1]?.title ?? outcomeId;
    log(`Manual bet requested: ${amount} on ${title}.`);
    executeBet(outcomeId, amount, "manual");
  }

  function placeBet(decision) {
    if (!decision?.shouldBet) {
      log("No bet decision; skipping.");
      return false;
    }
    log(`Auto bet trigger: ${decision.outcomeTitle}, amount ${decision.amount}.`);
    return executeBet(decision.outcomeId, decision.amount, "auto");
  }

  function clearIntervals() {
    if (runtime.evalIntervalId) {
      clearInterval(runtime.evalIntervalId);
      runtime.evalIntervalId = null;
    }
    if (runtime.watchIntervalId) {
      clearInterval(runtime.watchIntervalId);
      runtime.watchIntervalId = null;
    }
  }

  function evaluate() {
    ensureUi();
    ensurePredictionUiOpen();
    ensurePredictionDetailsOpen();

    const state = readPredictionState();
    if (!state) return;

    runtime.latestState = state;

    const decision = decideBet(state);
    runtime.pendingDecision = {
      ...decision,
      snapshotAt: Date.now(),
      secondsLeft: state.secondsLeft,
      predictionKey: makePredictionKey(state),
    };

    const sig = [
      state.status,
      state.secondsLeft,
      state.outcomes[0]?.totalPoints,
      state.outcomes[1]?.totalPoints,
      runtime.pendingDecision.outcomeId,
      runtime.pendingDecision.amount,
    ].join("|");

    if (sig !== runtime.lastStateSignature) {
      runtime.lastStateSignature = sig;
      const [a, b] = state.outcomes;
      const underdog = a.totalPoints <= b.totalPoints ? a : b;
      log(
        `Update: ${a.title}=${a.totalPoints}, ${b.title}=${b.totalPoints}, ` +
        `time=${Number.isFinite(state.secondsLeft) ? state.secondsLeft : "?"}s, ` +
        `underdog=${underdog.title}, pending=${runtime.pendingDecision.shouldBet ? `${runtime.pendingDecision.outcomeTitle}/${runtime.pendingDecision.amount}` : "skip"}`
      );
    }

    renderUi();
  }

  function watchAndExecute() {
    ensureUi();
    ensurePredictionUiOpen();
    ensurePredictionDetailsOpen();

    const state = readPredictionState();
    if (!state) return;

    const key = makePredictionKey(state);
    if (runtime.placedForPredictionKey === key) return;

    if (!settings.enabled) {
      return;
    }

    if (state.status !== "ACTIVE") {
      clearIntervals();
      closeRewardCenterPanel();
      log(`Prediction no longer active (${state.status}); switched back to discovery mode.`);
      return;
    }

    if (state.secondsLeft <= CONFIG.BET_TRIGGER_SECONDS) {
      const decision = runtime.pendingDecision;
      if (!decision) {
        log("No pendingDecision at trigger; skipping.");
        clearIntervals();
        return;
      }

      const success = placeBet(decision);
      if (success) {
        runtime.lastPlacedBet = {
          predictionKey: key,
          outcomeId: decision.outcomeId,
          amount: decision.amount,
          at: Date.now(),
        };
        runtime.placedForPredictionKey = key;
      }
      clearIntervals();
    }
  }

  function startLoopsIfNeeded() {
    if (runtime.evalIntervalId || runtime.watchIntervalId) return;

    // Pre-run once so pendingDecision exists quickly.
    evaluate();
    watchAndExecute();

    runtime.evalIntervalId = setInterval(evaluate, CONFIG.EVAL_INTERVAL_MS);
    runtime.watchIntervalId = setInterval(watchAndExecute, CONFIG.WATCH_INTERVAL_MS);
    log("Prediction loops started.");
  }

  function checkListStateAndMaybeStart() {
    const listItem = document.querySelector(".predictions-list-item");
    if (!listItem) {
      logChanged("discoveryStatus", "Discovery: no prediction card found.");
      closeRewardCenterPanel({ silent: true });
      return;
    }

    const subtitle = listItem
      .querySelector('[data-test-selector="predictions-list-item__subtitle"]')
      ?.textContent
      ?.trim() ?? "";
    const status = parseStatusText(subtitle);
    const discoverySig = `${status}|${subtitle}`;
    if (discoverySig !== runtime.lastDiscoveryStatusSignature) {
      runtime.lastDiscoveryStatusSignature = discoverySig;
      log(`Discovery: prediction status ${status}${subtitle ? ` (${subtitle})` : ""}.`);
    }

    if (status === "ACTIVE") {
      startLoopsIfNeeded();
      if (settings.autoOpenDetails) ensurePredictionDetailsOpen();
      return;
    }

    closeRewardCenterPanel({ silent: true });
  }

  function runDiscoveryProbe() {
    if (!settings.enabled) return;
    if (!settings.autoOpenPopover) return;
    if (runtime.evalIntervalId || runtime.watchIntervalId) return;
    if (runtime.discoveryPending) return;

    runtime.discoveryPending = true;

    const alreadyOpen = hasPredictionListOpen() || hasPredictionDetailsOpen();
    if (!alreadyOpen) {
      const button = findChannelPointsButton();
      if (!button) {
        runtime.discoveryPending = false;
        return;
      }
      click(button);
      logChanged("discoveryOpen", "Discovery: opened channel points popover.");
    }

    setTimeout(() => {
      try {
        checkListStateAndMaybeStart();
      } finally {
        runtime.discoveryPending = false;
      }
    }, 450);
  }

  function startDiscoveryLoop() {
    if (runtime.discoveryIntervalId) return;
    runtime.discoveryIntervalId = setInterval(runDiscoveryProbe, getDiscoveryIntervalMs());
    runDiscoveryProbe();
  }

  function restartDiscoveryLoop() {
    if (runtime.discoveryIntervalId) {
      clearInterval(runtime.discoveryIntervalId);
      runtime.discoveryIntervalId = null;
    }
    startDiscoveryLoop();
  }

  function setupObserver() {
    if (runtime.observer) return;

    runtime.observer = new MutationObserver(() => {
      ensureUi();
      const state = readPredictionState();
      if (state?.status === "ACTIVE") {
        startLoopsIfNeeded();
      }
    });

    runtime.observer.observe(document.body, { subtree: true, childList: true });
  }

  ensureUi();
  setInterval(ensureUi, 3000);
  setupObserver();
  startLoopsIfNeeded();
  startDiscoveryLoop();
  log("Script initialized.");
})();
