/**
 * ui.js — Injected panel: styles, HTML structure, event wiring, and render loop.
 * Depends on: config.js, utils.js (escapeHtml, fmtTime), bettor.js (manualBet)
 * T.log, T.logChanged, T.startAutomationPolling, T.stopAutomationPolling,
 * T.restartDiscoveryLoop, T.logModeSnapshot are from runner.js, resolved at call-time.
 */
(function () {
  "use strict";

  const T = window.TPRED;

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
        width: 760px;
        max-height: 70vh;
        overflow: hidden;
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
      .tpred-body {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        gap: .75rem;
        align-items: start;
      }
      .tpred-main {
        min-width: 0;
        max-height: calc(70vh - 68px);
        overflow: auto;
        padding-right: .1rem;
      }
      .tpred-logs-pane {
        min-width: 0;
        max-height: calc(70vh - 68px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        border-right: 1px solid rgba(255,255,255,.06);
        padding-right: .75rem;
      }
      .tpred-logs-pane.tpred-hidden-pane {
        display: none;
      }
      .tpred-caption { color: var(--color-text-alt-2); font-size: 12px; line-height: 1.2; }
      .tpred-row { margin: .35rem 0; }
      .tpred-inline { display: flex; gap: .5rem; align-items: center; }
      .tpred-inline > label { min-width: 130px; color: var(--color-text-alt-2); font-size: 12px; }
      .tpred-inline input {
        width: 140px;
        height: 30px;
        border: 1px solid var(--color-border-input, #3b3b44);
        border-radius: 6px;
        background: var(--color-background-input, #18181b);
        color: var(--color-text-input, var(--color-text-base));
        padding: 0 .55rem;
        outline: none;
        transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
      }
      .tpred-inline input:hover {
        border-color: #6d6d7a;
      }
      .tpred-inline input:focus {
        border-color: #9147ff;
        box-shadow: 0 0 0 2px rgba(145, 71, 255, .22);
      }
      .tpred-inline input::placeholder {
        color: var(--color-text-alt-2);
      }
      .tpred-toggle {
        display: inline-flex;
        align-items: center;
        gap: .6rem;
        cursor: pointer;
        user-select: none;
        padding: .3rem .4rem;
        border-radius: var(--border-radius-small);
        transition: background .15s ease;
      }
      .tpred-toggle:hover { background: var(--color-background-alt-2); }
      .tpred-toggle input[type="checkbox"] {
        width: 18px;
        height: 18px;
        margin: 0;
        appearance: none;
        -webkit-appearance: none;
        border: 2px solid var(--color-border-input);
        border-radius: 4px;
        position: relative;
        background: var(--color-background-input);
        transition: border-color .15s ease, background .15s ease, box-shadow .15s ease, transform .12s ease;
      }
      .tpred-toggle input[type="checkbox"]::before {
        content: "";
        position: absolute;
        left: 4px;
        top: 1px;
        width: 5px;
        height: 10px;
        border-right: 2px solid #ffffff;
        border-bottom: 2px solid #ffffff;
        transform: rotate(45deg) scale(0);
        transform-origin: center;
        opacity: 0;
        transition: transform .12s ease-in-out, opacity .12s ease-in-out;
      }
      .tpred-toggle input[type="checkbox"]:checked {
        background: #9147ff;
        border-color: #9147ff;
        box-shadow: 0 0 0 2px rgba(145, 71, 255, .28);
      }
      .tpred-toggle input[type="checkbox"]:checked::before {
        transform: rotate(45deg) scale(1);
        opacity: 1;
      }
      .tpred-toggle input[type="checkbox"]:active { transform: scale(.96); }
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
        margin-bottom: .5rem;
        padding: .55rem;
        border: 1px solid var(--color-border-input);
        border-radius: var(--border-radius-small);
        background: linear-gradient(180deg, var(--color-background-base), var(--color-background-alt));
      }
      .tpred-status-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: .35rem;
      }
      .tpred-status-item {
        background: var(--color-background-alt-2);
        border: 1px solid var(--color-border-base);
        border-radius: var(--border-radius-small);
        padding: .32rem .4rem;
      }
      .tpred-status-label {
        display: block;
        color: var(--color-text-alt-2);
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .tpred-status-value {
        display: block;
        color: var(--color-text-base);
        font-size: 12px;
        margin-top: .1rem;
        font-weight: 600;
      }
      .tpred-status-flags {
        margin-top: .45rem;
        display: flex;
        flex-wrap: wrap;
        gap: .35rem;
      }
      .tpred-flag {
        padding: .14rem .45rem;
        border-radius: 999px;
        font-size: 11px;
        border: 1px solid var(--color-border-base);
      }
      .tpred-flag-on {
        background: rgba(14, 122, 62, .18);
        border-color: rgba(14, 122, 62, .45);
      }
      .tpred-flag-off {
        background: rgba(224, 58, 62, .14);
        border-color: rgba(224, 58, 62, .4);
      }
      .tpred-reason {
        margin-top: .45rem;
        font-size: 12px;
        color: var(--color-text-alt-2);
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
      .tpred-logs-header {
        margin-top: 0;
        margin-bottom: .35rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .35rem;
      }
      .tpred-logs-actions {
        display: flex;
        align-items: center;
        gap: .35rem;
      }
      .tpred-clear-btn {
        min-height: 26px;
        padding: 0 .65rem;
        border-radius: var(--border-radius-small);
        font-size: 12px;
      }
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
        flex: 1;
      }
      .tpred-log-line { margin: .2rem 0; }
      #tpred-github { text-decoration: none; }
      @media (max-width: 900px) {
        .tpred-panel { width: min(96vw, 760px); right: -8px; }
      }
      @media (max-width: 700px) {
        .tpred-panel {
          width: min(96vw, 420px);
          right: -8px;
          overflow: auto;
        }
        .tpred-body {
          grid-template-columns: 1fr;
        }
        .tpred-main,
        .tpred-logs-pane {
          max-height: none;
          overflow: visible;
        }
        .tpred-logs-pane {
          border-right: 0;
          border-bottom: 1px solid rgba(255,255,255,.06);
          padding-right: 0;
          padding-bottom: .6rem;
          margin-bottom: .1rem;
        }
      }
      @media (max-width: 620px) {
        .tpred-status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    if (T.runtime.ui.root && document.contains(T.runtime.ui.root)) return;

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
      <div id="tpred-panel" class="tpred-panel${T.settings.panelOpen ? "" : " tpred-hidden"}">
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
        <div class="tpred-body">
          <div id="tpred-logs-pane" class="tpred-logs-pane">
            <div class="tpred-logs-header">
              <div class="tpred-subtitle CoreText-sc-1txzju1-0">Logs</div>
              <div class="tpred-logs-actions">
                <button id="tpred-toggle-logs" class="ScCoreButton-sc-ocjdkq-0 glPhvE tpred-clear-btn" type="button">Hide</button>
                <button id="tpred-clear-logs" class="ScCoreButton-sc-ocjdkq-0 glPhvE tpred-clear-btn" type="button">Clear</button>
              </div>
            </div>
            <div id="tpred-logs" class="tpred-logs"></div>
          </div>
          <div id="tpred-main" class="tpred-main">
            <div id="tpred-status" class="CoreText-sc-1txzju1-0"></div>
            <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-enabled" type="checkbox"> <span>Enable Auto-Bet</span></label></div>
            <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-dry-run" type="checkbox"> <span>Dry Run (No bet clicks)</span></label></div>
            <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-force-min-on-skip" type="checkbox"> <span>Disable Skip (bet Auto Min on skips)</span></label></div>
            <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-auto-popover" type="checkbox"> <span>Auto Open Channel Points</span></label></div>
            <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-auto-details" type="checkbox"> <span>Auto Open Prediction Details</span></label></div>
            <div class="tpred-row tpred-inline">
              <label>Discovery Probe (ms)</label>
              <input id="tpred-discovery-ms" type="number" min="5000" step="1000" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
            </div>
            <div class="tpred-row tpred-inline">
              <label>Active Eval (ms)</label>
              <input id="tpred-eval-ms" type="number" min="1000" step="250" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
            </div>
            <div class="tpred-row tpred-inline">
              <label>Manual Amount</label>
              <input id="tpred-manual-amount" type="number" min="1" step="1" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
            </div>
            <div class="tpred-row tpred-inline">
              <label>Auto Min Bet</label>
              <input id="tpred-auto-min-bet" type="number" min="1" step="1" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
            </div>
            <div class="tpred-row tpred-inline">
              <label>Auto Max Bet</label>
              <input id="tpred-auto-max-bet" type="number" min="1" step="1" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
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
          </div>
        </div>
      </div>
    `;

    rightGroup.prepend(root);

    T.runtime.ui.root = root;
    T.runtime.ui.panel = root.querySelector("#tpred-panel");
    T.runtime.ui.panelMain = root.querySelector("#tpred-main");
    T.runtime.ui.logsPane = root.querySelector("#tpred-logs-pane");
    T.runtime.ui.status = root.querySelector("#tpred-status");
    T.runtime.ui.prediction = root.querySelector("#tpred-prediction");
    T.runtime.ui.logs = root.querySelector("#tpred-logs");
    T.runtime.ui.clearLogs = root.querySelector("#tpred-clear-logs");
    T.runtime.ui.toggleLogs = root.querySelector("#tpred-toggle-logs");
    T.runtime.ui.manualAmount = root.querySelector("#tpred-manual-amount");
    T.runtime.ui.autoMinBet = root.querySelector("#tpred-auto-min-bet");
    T.runtime.ui.autoMaxBet = root.querySelector("#tpred-auto-max-bet");
    T.runtime.ui.discoveryInterval = root.querySelector("#tpred-discovery-ms");
    T.runtime.ui.evalInterval = root.querySelector("#tpred-eval-ms");
    T.runtime.ui.toggleEnabled = root.querySelector("#tpred-enabled");
    T.runtime.ui.toggleDryRun = root.querySelector("#tpred-dry-run");
    T.runtime.ui.toggleForceMinOnSkip = root.querySelector("#tpred-force-min-on-skip");
    T.runtime.ui.toggleAutoOpenPopover = root.querySelector("#tpred-auto-popover");
    T.runtime.ui.toggleAutoOpenDetails = root.querySelector("#tpred-auto-details");

    root.querySelector("#tpred-toggle")?.addEventListener("click", () => {
      T.settings.panelOpen = !T.settings.panelOpen;
      T.saveSettings();
      renderUi();
    });

    root.querySelector("#tpred-close")?.addEventListener("click", () => {
      T.settings.panelOpen = false;
      T.saveSettings();
      renderUi();
    });

    T.runtime.ui.clearLogs?.addEventListener("click", () => {
      T.runtime.logs = [];
      T.runtime.lastLogByKey = Object.create(null);
      renderUi();
    });

    T.runtime.ui.toggleLogs?.addEventListener("click", () => {
      T.settings.logsVisible = !T.settings.logsVisible;
      T.saveSettings();
      renderUi();
    });

    if (T.runtime.ui.toggleEnabled) T.runtime.ui.toggleEnabled.checked = T.settings.enabled;
    if (T.runtime.ui.toggleDryRun) T.runtime.ui.toggleDryRun.checked = T.settings.dryRun;
    if (T.runtime.ui.toggleForceMinOnSkip) T.runtime.ui.toggleForceMinOnSkip.checked = Boolean(T.settings.forceMinOnSkip);
    if (T.runtime.ui.toggleAutoOpenPopover) T.runtime.ui.toggleAutoOpenPopover.checked = T.settings.autoOpenPopover;
    if (T.runtime.ui.toggleAutoOpenDetails) T.runtime.ui.toggleAutoOpenDetails.checked = T.settings.autoOpenDetails;
    if (T.runtime.ui.discoveryInterval) T.runtime.ui.discoveryInterval.value = String(T.getDiscoveryIntervalMs());
    if (T.runtime.ui.evalInterval) T.runtime.ui.evalInterval.value = String(T.getEvalIntervalMs());
    if (T.runtime.ui.manualAmount) T.runtime.ui.manualAmount.value = String(T.settings.manualAmount || 100);
    if (T.runtime.ui.autoMinBet) T.runtime.ui.autoMinBet.value = String(T.getAutoMinBet());
    if (T.runtime.ui.autoMaxBet) T.runtime.ui.autoMaxBet.value = String(T.getAutoMaxBet());

    T.runtime.ui.toggleEnabled?.addEventListener("change", () => {
      T.settings.enabled = T.runtime.ui.toggleEnabled.checked;
      T.saveSettings();
      if (T.settings.enabled) {
        T.startAutomationPolling();
        T.log("Auto-Bet enabled. Discovery polling resumed.");
      } else {
        T.stopAutomationPolling();
        T.log("Auto-Bet disabled. Stopped active loops and discovery polling.");
      }
      T.logModeSnapshot("Mode updated");
    });

    T.runtime.ui.toggleDryRun?.addEventListener("change", () => {
      T.settings.dryRun = T.runtime.ui.toggleDryRun.checked;
      T.saveSettings();
      T.log(`Dry Run ${T.settings.dryRun ? "enabled" : "disabled"}.`);
      T.logModeSnapshot("Mode updated");
    });

    T.runtime.ui.toggleForceMinOnSkip?.addEventListener("change", () => {
      T.settings.forceMinOnSkip = T.runtime.ui.toggleForceMinOnSkip.checked;
      T.saveSettings();
      T.log(`Disable Skip ${T.settings.forceMinOnSkip ? "enabled" : "disabled"}.`);
    });

    T.runtime.ui.toggleAutoOpenPopover?.addEventListener("change", () => {
      T.settings.autoOpenPopover = T.runtime.ui.toggleAutoOpenPopover.checked;
      T.saveSettings();
      T.log(`Auto Open Channel Points ${T.settings.autoOpenPopover ? "enabled" : "disabled"}.`);
    });

    T.runtime.ui.toggleAutoOpenDetails?.addEventListener("change", () => {
      T.settings.autoOpenDetails = T.runtime.ui.toggleAutoOpenDetails.checked;
      T.saveSettings();
      T.log(`Auto Open Prediction Details ${T.settings.autoOpenDetails ? "enabled" : "disabled"}.`);
    });

    T.runtime.ui.discoveryInterval?.addEventListener("change", () => {
      const val = Math.max(5000, parseInt(T.runtime.ui.discoveryInterval.value || String(T.CONFIG.DISCOVERY_INTERVAL_MS), 10) || T.CONFIG.DISCOVERY_INTERVAL_MS);
      T.settings.discoveryIntervalMs = val;
      T.runtime.ui.discoveryInterval.value = String(val);
      T.saveSettings();
      if (T.runtime.discoveryIntervalId) {
        T.restartDiscoveryLoop();
      }
      T.log(`Discovery probe updated: ${val} ms.`);
    });

    T.runtime.ui.evalInterval?.addEventListener("change", () => {
      const val = Math.max(1000, parseInt(T.runtime.ui.evalInterval.value || String(T.CONFIG.EVAL_INTERVAL_MS), 10) || T.CONFIG.EVAL_INTERVAL_MS);
      T.settings.evalIntervalMs = val;
      T.runtime.ui.evalInterval.value = String(val);
      T.saveSettings();
      if (T.runtime.evalIntervalId) {
        clearInterval(T.runtime.evalIntervalId);
        T.runtime.evalIntervalId = setInterval(T.evaluate, T.getEvalIntervalMs());
      }
      T.log(`Active evaluation updated: ${val} ms.`);
    });

    T.runtime.ui.manualAmount?.addEventListener("change", () => {
      const val = Math.max(1, parseInt(T.runtime.ui.manualAmount.value || "100", 10) || 100);
      T.settings.manualAmount = val;
      T.runtime.ui.manualAmount.value = String(val);
      T.saveSettings();
    });

    T.runtime.ui.autoMinBet?.addEventListener("change", () => {
      const parsedMin = Number(T.runtime.ui.autoMinBet.value);
      const rawMin = Number.isNaN(parsedMin) ? 1 : Math.round(parsedMin);
      const currentMax = T.getAutoMaxBet();
      const minVal = Math.max(1, Math.min(currentMax, rawMin));
      T.settings.autoMinBet = minVal;
      T.runtime.ui.autoMinBet.value = String(minVal);
      T.saveSettings();
      T.log(`Auto Min Bet updated: ${minVal}.`);
    });

    T.runtime.ui.autoMaxBet?.addEventListener("change", () => {
      const parsedMax = Number(T.runtime.ui.autoMaxBet.value);
      const rawMax = Number.isNaN(parsedMax) ? T.getAutoMaxBet() : Math.round(parsedMax);
      const maxVal = Math.max(1, Math.min(T.CONFIG.MAX_AUTO_BET, rawMax));
      T.settings.autoMaxBet = maxVal;
      if (T.getAutoMinBet() > maxVal) {
        T.settings.autoMinBet = maxVal;
        if (T.runtime.ui.autoMinBet) T.runtime.ui.autoMinBet.value = String(maxVal);
      }
      T.runtime.ui.autoMaxBet.value = String(maxVal);
      T.saveSettings();
      T.log(`Auto Max Bet updated: ${maxVal}.`);
    });

    root.querySelector("#tpred-bet-0")?.addEventListener("click", () => {
      const amount = Math.max(1, parseInt(T.runtime.ui.manualAmount.value || "100", 10) || 100);
      void T.manualBet("0", amount);
    });

    root.querySelector("#tpred-bet-1")?.addEventListener("click", () => {
      const amount = Math.max(1, parseInt(T.runtime.ui.manualAmount.value || "100", 10) || 100);
      void T.manualBet("1", amount);
    });

    renderUi();
    T.log("Injected control panel into top nav.");
  }

  function renderUi() {
    if (!T.runtime.ui.root) return;

    T.runtime.ui.panel.classList.toggle("tpred-hidden", !T.settings.panelOpen);
    T.runtime.ui.logsPane?.classList.toggle("tpred-hidden-pane", !T.settings.logsVisible);
    if (T.runtime.ui.panel) {
      T.runtime.ui.panel.style.width = T.settings.logsVisible ? "760px" : "460px";
    }
    if (T.runtime.ui.toggleLogs) {
      T.runtime.ui.toggleLogs.textContent = T.settings.logsVisible ? "Hide" : "Show";
    }

    const st = T.runtime.latestState;
    const pending = T.runtime.pendingDecision;
    const predictionKey = st ? T.makePredictionKey(st) : null;
    const botPlaced = predictionKey && T.runtime.lastPlacedBet?.predictionKey === predictionKey
      ? T.runtime.lastPlacedBet
      : null;
    const skipEnabled = !T.settings.forceMinOnSkip;
    const stateLabel = st ? st.status : "IDLE";
    const timeLabel = st ? (Number.isFinite(st.secondsLeft) ? `${st.secondsLeft}s` : "-") : "-";
    const pointsLabel = st ? String(st.myAvailablePoints) : "-";
    let underdogTitle = "none";
    let targetLabel = "skip";
    if (st?.outcomes?.length >= 2) {
      const [a, b] = st.outcomes;
      const underdog = a.totalPoints <= b.totalPoints ? a : b;
      const liveAmount = pending?.shouldBet && pending.outcomeId === underdog.id ? pending.amount : 0;
      underdogTitle = `${underdog.title} (${underdog.totalPoints})`;
      targetLabel = liveAmount > 0 ? String(liveAmount) : "skip";
    }
    const pendingLabel = pending
      ? (pending.shouldBet ? `${pending.outcomeTitle} / ${pending.amount}` : "skip")
      : "none";
    const placedLabel = botPlaced
      ? `${botPlaced.outcomeId === "0" ? st?.outcomes?.[0]?.title ?? "A" : st?.outcomes?.[1]?.title ?? "B"} / ${botPlaced.amount}`
      : "none";
    const reasonLabel = pending?.reason || "Waiting for a prediction signal.";
    const flagChip = (label, on) => `<span class="tpred-flag ${on ? "tpred-flag-on" : "tpred-flag-off"}">${label}: ${on ? "ON" : "OFF"}</span>`;
    T.runtime.ui.status.innerHTML = `
      <div class="tpred-status-grid">
        <div class="tpred-status-item"><span class="tpred-status-label">State</span><span class="tpred-status-value">${T.escapeHtml(stateLabel)}</span></div>
        <div class="tpred-status-item"><span class="tpred-status-label">Time Left</span><span class="tpred-status-value">${T.escapeHtml(timeLabel)}</span></div>
        <div class="tpred-status-item"><span class="tpred-status-label">Points</span><span class="tpred-status-value">${T.escapeHtml(pointsLabel)}</span></div>
        <div class="tpred-status-item"><span class="tpred-status-label">Underdog</span><span class="tpred-status-value">${T.escapeHtml(underdogTitle)}</span></div>
        <div class="tpred-status-item"><span class="tpred-status-label">Target</span><span class="tpred-status-value">${T.escapeHtml(targetLabel)}</span></div>
        <div class="tpred-status-item"><span class="tpred-status-label">Pending</span><span class="tpred-status-value">${T.escapeHtml(pendingLabel)}</span></div>
        <div class="tpred-status-item"><span class="tpred-status-label">Placed</span><span class="tpred-status-value">${T.escapeHtml(placedLabel)}</span></div>
      </div>
      <div class="tpred-status-flags">
        ${flagChip("Auto-Bet", T.settings.enabled)}
        ${flagChip("Dry-Run", T.settings.dryRun)}
        ${flagChip("Skip", skipEnabled)}
      </div>
      <div class="tpred-reason">Reason: ${T.escapeHtml(reasonLabel)}</div>
    `;

    if (st) {
      const [a, b] = st.outcomes;
      const botPending = pending?.shouldBet ? pending : null;

      const btn0 = T.runtime.ui.root.querySelector("#tpred-bet-0");
      const btn1 = T.runtime.ui.root.querySelector("#tpred-bet-1");
      const btn0Label = T.runtime.ui.root.querySelector("#tpred-bet-0 [data-a-target='tw-core-button-label-text']");
      const btn1Label = T.runtime.ui.root.querySelector("#tpred-bet-1 [data-a-target='tw-core-button-label-text']");

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

      T.runtime.ui.prediction.innerHTML = `
        <div class="tpred-outcome"><span>${a.title}</span><span>${a.totalPoints}</span></div>
        <div class="tpred-outcome"><span>${b.title}</span><span>${b.totalPoints}</span></div>
      `;
    } else {
      const btn0 = T.runtime.ui.root.querySelector("#tpred-bet-0");
      const btn1 = T.runtime.ui.root.querySelector("#tpred-bet-1");
      const btn0Label = T.runtime.ui.root.querySelector("#tpred-bet-0 [data-a-target='tw-core-button-label-text']");
      const btn1Label = T.runtime.ui.root.querySelector("#tpred-bet-1 [data-a-target='tw-core-button-label-text']");
      if (btn0Label) btn0Label.textContent = "Predict A";
      if (btn1Label) btn1Label.textContent = "Predict B";
      btn0?.classList.remove("tpred-bot-pending", "tpred-bot-placed");
      btn1?.classList.remove("tpred-bot-pending", "tpred-bot-placed");
      T.runtime.ui.prediction.innerHTML = `<div class="CoreText-sc-1txzju1-0">No prediction state detected.</div>`;
    }

    T.runtime.ui.logs.innerHTML = T.runtime.logs
      .slice(0, 60)
      .map((l) => `<div class="tpred-log-line">[${T.fmtTime(l.ts)}] ${T.escapeHtml(l.msg)}</div>`)
      .join("");
  }

  T.injectUiStyles = injectUiStyles;
  T.ensureUi = ensureUi;
  T.renderUi = renderUi;
})();
