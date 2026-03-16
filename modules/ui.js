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
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

      #tpred-root {
        position: relative;
        margin-right: .5rem;
        --tpred-accent: #9147ff;
        --tpred-accent-hover: #a970ff;
        --tpred-accent-muted: #bf94ff;
        --tpred-panel-bg: rgba(14, 14, 16, .97);
        --tpred-surface: rgba(31, 31, 35, .95);
        --tpred-surface-2: rgba(38, 38, 44, .92);
        --tpred-surface-hover: rgba(48, 48, 56, .9);
        --tpred-border: rgba(255, 255, 255, .08);
        --tpred-border-strong: rgba(255, 255, 255, .14);
        --tpred-text: #efeff1;
        --tpred-text-muted: #adadb8;
        --tpred-green: #00b85c;
        --tpred-red: #eb0400;
        --tpred-blue: #387aff;
        --tpred-pink: #f02b8a;
        --tpred-radius: 8px;
        --tpred-radius-lg: 12px;
        font-family: 'Inter', 'Roobert', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      }

      /* ─── Panel Shell ─── */
      .tpred-panel {
        position: absolute;
        right: 0;
        top: 2.75rem;
        width: 780px;
        max-height: calc(100vh - 84px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: var(--tpred-panel-bg);
        border: 1px solid var(--tpred-border-strong);
        border-radius: var(--tpred-radius-lg);
        z-index: 999999;
        padding: 0;
        box-shadow:
          0 20px 60px rgba(0,0,0,.55),
          0 0 0 1px rgba(145, 71, 255, .08) inset,
          0 1px 0 rgba(255,255,255,.04) inset;
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        opacity: 1;
        transform: translateY(0);
        transition: opacity .18s ease, transform .18s ease;
      }
      .tpred-hidden {
        display: none !important;
        opacity: 0;
        transform: translateY(-6px);
        pointer-events: none;
      }

      /* ─── Accent Top Bar ─── */
      .tpred-accent-bar {
        height: 3px;
        background: linear-gradient(90deg, var(--tpred-accent), var(--tpred-accent-muted), var(--tpred-accent));
        border-radius: var(--tpred-radius-lg) var(--tpred-radius-lg) 0 0;
        flex-shrink: 0;
      }

      /* ─── Header ─── */
      .tpred-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: .65rem .85rem .55rem;
        border-bottom: 1px solid var(--tpred-border);
        gap: .5rem;
        flex-shrink: 0;
      }
      .tpred-header-left { display: flex; flex-direction: column; gap: .15rem; }
      .tpred-header-actions { display: flex; align-items: center; gap: .3rem; }
      .tpred-header-btn {
        min-height: 30px;
        padding: 0 .75rem;
        border-radius: var(--tpred-radius);
        font-size: 12px;
        font-weight: 600;
        background: var(--tpred-surface);
        border: 1px solid var(--tpred-border);
        color: var(--tpred-text-muted);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        cursor: pointer;
        transition: background .15s ease, color .15s ease, border-color .15s ease;
      }
      .tpred-header-btn:hover {
        background: var(--tpred-surface-hover);
        color: var(--tpred-text);
        border-color: var(--tpred-border-strong);
      }

      /* ─── Body Grid ─── */
      .tpred-body {
        display: grid;
        grid-template-columns: 280px minmax(0, 1fr);
        gap: 0;
        align-items: stretch;
        flex: 1;
        min-height: 0;
      }

      .tpred-main {
        min-width: 0;
        max-height: none;
        min-height: 0;
        overflow: auto;
        overflow-x: hidden;
        padding: .6rem .85rem .7rem .7rem;
      }

      /* ─── Logs Pane ─── */
      .tpred-logs-pane {
        min-width: 0;
        max-height: none;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--tpred-border);
        background: rgba(10, 10, 12, .5);
        padding: .55rem .65rem .7rem;
      }
      .tpred-logs-pane.tpred-hidden-pane {
        display: none;
      }

      /* ─── Section Labels ─── */
      .tpred-section-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: var(--tpred-accent-muted);
        margin-bottom: .35rem;
        margin-top: .15rem;
        padding-left: .1rem;
      }

      .tpred-caption {
        color: var(--tpred-text-muted);
        font-size: 11px;
        line-height: 1.2;
        letter-spacing: .02em;
      }
      .tpred-row { margin: .4rem 0; }

      .tpred-settings-divider {
        height: 1px;
        margin: .55rem 0;
        background: linear-gradient(90deg, var(--tpred-border-strong), transparent);
      }

      /* ─── Inline Input Rows ─── */
      .tpred-inline { display: flex; gap: .5rem; align-items: center; }
      .tpred-inline > label {
        min-width: 140px;
        color: var(--tpred-text-muted);
        font-size: 12px;
        font-weight: 500;
      }
      .tpred-input-wrap {
        display: inline-flex;
        align-items: stretch;
        gap: .3rem;
      }
      .tpred-inline input {
        width: 120px;
        height: 32px;
        border: 1px solid var(--tpred-border);
        border-radius: var(--tpred-radius);
        background: rgba(0, 0, 0, .35);
        color: var(--tpred-text);
        padding: 0 .55rem;
        outline: none;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
      }
      .tpred-inline input:hover {
        border-color: rgba(145, 71, 255, .35);
        background: rgba(0, 0, 0, .45);
      }
      .tpred-inline input:focus {
        border-color: var(--tpred-accent);
        box-shadow: 0 0 0 3px rgba(145, 71, 255, .18), 0 0 12px rgba(145, 71, 255, .1);
        background: rgba(0, 0, 0, .5);
      }
      .tpred-inline input::placeholder {
        color: rgba(173, 173, 184, .5);
      }
      .tpred-inline input[type="number"] {
        -moz-appearance: textfield;
        appearance: textfield;
      }
      .tpred-inline input[type="number"]::-webkit-outer-spin-button,
      .tpred-inline input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      /* ─── Stepper Buttons ─── */
      .tpred-stepper {
        display: inline-flex;
        align-items: stretch;
        border: 1px solid rgba(145, 71, 255, .4);
        border-radius: var(--tpred-radius);
        overflow: hidden;
      }
      .tpred-step-btn {
        width: 28px;
        height: 32px;
        border: 0;
        background: rgba(145, 71, 255, .15);
        color: var(--tpred-accent-muted);
        padding: 0;
        line-height: 1;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background .15s ease, color .12s ease, transform .1s ease;
      }
      .tpred-step-btn + .tpred-step-btn {
        border-left: 1px solid rgba(145, 71, 255, .4);
      }
      .tpred-step-btn:hover {
        background: rgba(145, 71, 255, .3);
        color: #fff;
      }
      .tpred-step-btn:active {
        transform: scale(.92);
        background: rgba(145, 71, 255, .4);
      }

      /* ─── Timing Hint ─── */
      .tpred-timing-hint {
        margin-top: .35rem;
        text-align: right;
        font-size: 10px;
        color: var(--tpred-text-muted);
        opacity: .55;
        font-style: italic;
      }

      /* ─── Segment (Fixed / Dynamic) ─── */
      .tpred-segment-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .6rem;
        margin: .4rem 0;
      }
      .tpred-segment-label {
        min-width: 130px;
        color: var(--tpred-text-muted);
        font-size: 12px;
        font-weight: 500;
      }
      .tpred-segment {
        display: inline-flex;
        align-items: center;
        border: 1px solid rgba(145, 71, 255, .35);
        border-radius: var(--tpred-radius);
        overflow: hidden;
        background: rgba(145, 71, 255, .06);
      }
      .tpred-segment-btn {
        min-width: 90px;
        height: 32px;
        padding: 0 .6rem;
        border: 0;
        background: transparent;
        color: var(--tpred-text-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background .2s ease, color .2s ease, box-shadow .2s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        text-align: center;
        font-family: inherit;
      }
      .tpred-segment-btn + .tpred-segment-btn {
        border-left: 1px solid rgba(145, 71, 255, .35);
      }
      .tpred-segment-btn.tpred-active {
        background: linear-gradient(180deg, rgba(145, 71, 255, .7), rgba(120, 50, 220, .65));
        color: #fff;
        box-shadow: 0 0 10px rgba(145, 71, 255, .2) inset;
        text-shadow: 0 1px 2px rgba(0,0,0,.25);
      }
      .tpred-segment-btn:not(.tpred-active):hover {
        background: rgba(145, 71, 255, .15);
        color: var(--tpred-text);
      }

      /* ─── Checkbox Toggle (Mini Switch) ─── */
      .tpred-toggle {
        display: inline-flex;
        align-items: center;
        gap: .55rem;
        cursor: pointer;
        user-select: none;
        padding: .25rem .35rem;
        border-radius: 6px;
        transition: background .15s ease;
      }
      .tpred-toggle:hover { background: rgba(255, 255, 255, .04); }
      .tpred-toggle input[type="checkbox"] {
        width: 34px;
        height: 18px;
        margin: 0;
        appearance: none;
        -webkit-appearance: none;
        border: 1px solid rgba(255, 255, 255, .16);
        border-radius: 999px;
        position: relative;
        background: rgba(255, 255, 255, .08);
        cursor: pointer;
        flex-shrink: 0;
        transition: background .25s cubic-bezier(.4,0,.2,1), border-color .25s ease, box-shadow .25s ease;
      }
      .tpred-toggle input[type="checkbox"]::before {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .65);
        box-shadow: 0 1px 3px rgba(0,0,0,.3);
        transition: transform .25s cubic-bezier(.4,0,.2,1), background .2s ease, box-shadow .2s ease;
      }
      .tpred-toggle input[type="checkbox"]:checked {
        background: linear-gradient(135deg, var(--tpred-accent), #7c3aed);
        border-color: rgba(145, 71, 255, .7);
        box-shadow: 0 0 8px rgba(145, 71, 255, .2);
      }
      .tpred-toggle input[type="checkbox"]:checked::before {
        transform: translateX(16px);
        background: #fff;
        box-shadow: 0 1px 4px rgba(145, 71, 255, .3);
      }
      .tpred-toggle input[type="checkbox"]:active {
        transform: none;
      }
      .tpred-toggle input[type="checkbox"]:active::before {
        width: 15px;
      }
      .tpred-toggle span {
        color: var(--tpred-text);
        font-size: 12.5px;
        font-weight: 500;
        line-height: 1.2;
      }

      /* ─── Master Toggle (Enable Auto-Bet) ─── */
      .tpred-master-toggle {
        display: inline-flex;
        align-items: center;
        gap: .7rem;
        cursor: pointer;
        user-select: none;
        padding: .4rem .5rem;
        border-radius: var(--tpred-radius);
        transition: background .15s ease;
      }
      .tpred-master-toggle:hover {
        background: rgba(145, 71, 255, .08);
      }
      .tpred-master-toggle input[type="checkbox"] {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
        pointer-events: none;
      }
      .tpred-master-track {
        width: 46px;
        height: 24px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.16);
        background: rgba(255,255,255,.08);
        position: relative;
        transition: background .25s cubic-bezier(.4,0,.2,1), border-color .25s ease, box-shadow .25s ease;
      }
      .tpred-master-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: #fff;
        box-shadow: 0 1px 4px rgba(0,0,0,.35);
        transition: transform .25s cubic-bezier(.4,0,.2,1), box-shadow .25s ease;
      }
      .tpred-master-toggle input[type="checkbox"]:checked + .tpred-master-track {
        background: linear-gradient(135deg, var(--tpred-accent), #7c3aed);
        border-color: rgba(145,71,255,.8);
        box-shadow: 0 0 12px rgba(145, 71, 255, .25);
      }
      .tpred-master-toggle input[type="checkbox"]:checked + .tpred-master-track .tpred-master-thumb {
        transform: translateX(22px);
        box-shadow: 0 1px 6px rgba(145, 71, 255, .35);
      }
      .tpred-master-text {
        color: var(--tpred-text);
        font-size: 14px;
        font-weight: 700;
        letter-spacing: .01em;
      }

      /* ─── Bet Buttons ─── */
      .tpred-native-btn {
        flex: 1;
        transition: transform .12s ease, box-shadow .2s ease, filter .15s ease;
      }
      .tpred-native-btn .ScCoreButtonLabel-sc-s7h2b7-0 { display: inline-flex; align-items: center; gap: .35rem; }
      .tpred-native-btn:hover {
        filter: brightness(1.12);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,.3);
      }
      .tpred-native-btn:active {
        transform: translateY(0);
      }
      .tpred-native-btn.tpred-bot-pending {
        border-color: var(--tpred-green);
        box-shadow: inset 0 0 0 1px rgba(0,184,92,.4), 0 0 12px rgba(0,184,92,.15);
      }
      .tpred-native-btn.tpred-bot-placed {
        border-color: var(--tpred-blue);
        box-shadow: inset 0 0 0 1px rgba(56,122,255,.45), 0 0 12px rgba(56,122,255,.15);
        filter: brightness(1.06);
      }

      /* ─── Status Block ─── */
      #tpred-status {
        margin-bottom: .55rem;
        padding: .6rem;
        border: 1px solid var(--tpred-border);
        border-radius: var(--tpred-radius-lg);
        background: linear-gradient(180deg, rgba(31, 31, 35, .9), rgba(24, 24, 28, .9));
      }
      .tpred-status-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: .3rem;
      }
      .tpred-status-item {
        background: rgba(0, 0, 0, .25);
        border: 1px solid var(--tpred-border);
        border-radius: var(--tpred-radius);
        padding: .38rem .48rem;
        transition: background .15s ease, border-color .15s ease;
      }
      .tpred-status-item:hover {
        background: rgba(145, 71, 255, .06);
        border-color: rgba(145, 71, 255, .2);
      }
      .tpred-status-label {
        display: block;
        color: var(--tpred-text-muted);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .07em;
      }
      .tpred-status-value {
        display: block;
        color: var(--tpred-text);
        font-size: 14px;
        margin-top: .12rem;
        font-weight: 700;
        letter-spacing: .01em;
      }

      /* ─── Flags / Chips ─── */
      .tpred-status-flags {
        margin-top: .45rem;
        display: flex;
        flex-wrap: wrap;
        gap: .3rem;
      }
      .tpred-flag {
        padding: .18rem .55rem;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: .02em;
        border: 1px solid var(--tpred-border);
        background: rgba(255,255,255,.03);
        transition: background .2s ease, border-color .2s ease;
      }
      .tpred-flag-on {
        background: rgba(0, 184, 92, .12);
        border-color: rgba(0, 184, 92, .4);
        color: #5cff9e;
      }
      .tpred-flag-off {
        background: rgba(235, 4, 0, .1);
        border-color: rgba(235, 4, 0, .35);
        color: #ff7a78;
      }
      .tpred-flag-owner {
        background: rgba(145, 71, 255, .14);
        border-color: rgba(145, 71, 255, .45);
        color: var(--tpred-accent-muted);
      }
      .tpred-flag-observer {
        background: rgba(255, 255, 255, .05);
        border-color: rgba(255, 255, 255, .18);
        color: var(--tpred-text-muted);
      }
      .tpred-reason {
        margin-top: .5rem;
        font-size: 12px;
        color: var(--tpred-text-muted);
        line-height: 1.4;
        font-style: italic;
        opacity: .85;
      }

      /* ─── Prediction Card ─── */
      .tpred-prediction {
        border: 1px solid var(--tpred-border);
        border-radius: var(--tpred-radius-lg);
        padding: .55rem .6rem;
        margin: .5rem 0;
        background: linear-gradient(180deg, rgba(31, 31, 35, .7), rgba(20, 20, 24, .7));
      }
      .tpred-outcome {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        font-weight: 500;
        margin: .2rem 0;
        padding: .25rem .4rem;
        border-radius: 6px;
        transition: background .15s ease;
      }
      .tpred-outcome:hover {
        background: rgba(255, 255, 255, .04);
      }
      .tpred-subtitle {
        margin-top: .6rem;
        margin-bottom: .35rem;
        font-weight: 700;
        font-size: 13px;
      }

      /* ─── Logs Header & Container ─── */
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
        min-height: 24px;
        padding: 0 .6rem;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        background: var(--tpred-surface);
        border: 1px solid var(--tpred-border);
        color: var(--tpred-text-muted);
        transition: background .15s ease, color .15s ease;
      }
      .tpred-clear-btn:hover {
        background: rgba(235, 4, 0, .15);
        color: #ff7a78;
        border-color: rgba(235, 4, 0, .3);
      }
      .tpred-logs {
        font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
        font-size: 11px;
        line-height: 1.5;
        background: rgba(0, 0, 0, .45);
        border: 1px solid var(--tpred-border);
        border-radius: var(--tpred-radius);
        min-height: 220px;
        overflow: auto;
        padding: .5rem;
        white-space: pre-wrap;
        flex: 1;
        color: var(--tpred-text-muted);
      }

      /* ─── Scrollbar ─── */
      .tpred-main::-webkit-scrollbar,
      .tpred-logs-pane::-webkit-scrollbar,
      .tpred-logs::-webkit-scrollbar {
        width: 6px;
      }
      .tpred-main::-webkit-scrollbar-thumb,
      .tpred-logs-pane::-webkit-scrollbar-thumb,
      .tpred-logs::-webkit-scrollbar-thumb {
        background: rgba(145, 71, 255, .35);
        border-radius: 999px;
      }
      .tpred-main::-webkit-scrollbar-thumb:hover,
      .tpred-logs-pane::-webkit-scrollbar-thumb:hover,
      .tpred-logs::-webkit-scrollbar-thumb:hover {
        background: rgba(145, 71, 255, .55);
      }
      .tpred-main::-webkit-scrollbar-track,
      .tpred-logs-pane::-webkit-scrollbar-track,
      .tpred-logs::-webkit-scrollbar-track {
        background: transparent;
      }

      /* ─── Logs Footer ─── */
      .tpred-logs-footer {
        margin-top: 1rem;
        padding-top: .9rem;
        border-top: 1px dashed rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .tpred-logs-footer img {
        width: 44px;
        height: 44px;
        object-fit: contain;
        margin-bottom: .4rem;
        opacity: .95;
        filter: drop-shadow(0 2px 5px rgba(145, 71, 255, .25));
        transition: transform .2s cubic-bezier(.4, 0, .2, 1);
      }
      .tpred-logs-footer img:hover {
        transform: scale(1.08) rotate(-4deg);
      }
      .tpred-logs-footer-title {
        color: var(--tpred-text);
        font-size: 15px;
        font-weight: 800;
        letter-spacing: .02em;
        margin-bottom: .3rem;
      }
      .tpred-oss-note {
        color: var(--tpred-text-muted);
        font-size: 11px;
        line-height: 1.45;
        opacity: .85;
      }
      .tpred-oss-note p {
        margin: 0 0 .4rem 0;
      }
      .tpred-oss-author {
        color: var(--tpred-accent-muted);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .03em;
        opacity: .8;
      }

      /* ─── Bet Outcome Names ─── */
      .tpred-bet-names {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: .45rem;
        margin-top: .35rem;
      }
      .tpred-bet-name {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: .1rem;
        min-width: 0;
        overflow: hidden;
      }
      .tpred-bet-name-title {
        color: var(--tpred-accent-muted);
        font-weight: 600;
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        max-width: 100%;
      }
      .tpred-bet-name-pts {
        color: var(--tpred-text);
        font-weight: 700;
        font-size: 13px;
        line-height: 1.2;
        opacity: .9;
      }
      .tpred-log-line {
        margin: .15rem 0;
        padding: .1rem .25rem;
        border-radius: 3px;
        border-left: 2px solid transparent;
        transition: background .1s ease;
      }
      .tpred-log-line:hover {
        background: rgba(255, 255, 255, .03);
      }
      .tpred-log-line.tpred-log-success {
        color: #5cff9e;
        border-left-color: #00b85c;
      }
      .tpred-log-line.tpred-log-warn {
        color: #ffd666;
        border-left-color: #e6a817;
      }
      .tpred-log-line.tpred-log-error {
        color: #ff7a78;
        border-left-color: #eb0400;
      }
      .tpred-log-line.tpred-log-info {
        color: var(--tpred-text-muted);
        border-left-color: transparent;
      }

      /* ─── Bet Outcome Buttons ─── */
      #tpred-bet-0,
      #tpred-bet-1 {
        border: 1px solid transparent;
        border-radius: var(--tpred-radius);
        font-weight: 600;
        transition: all .15s ease;
      }
      #tpred-bet-0 {
        background: linear-gradient(135deg, rgba(56, 122, 255, .3), rgba(30, 80, 200, .25));
        border-color: rgba(56, 122, 255, .5);
      }
      #tpred-bet-0:hover {
        background: linear-gradient(135deg, rgba(56, 122, 255, .45), rgba(30, 80, 200, .38));
        box-shadow: 0 4px 16px rgba(56, 122, 255, .2);
      }
      #tpred-bet-1 {
        background: linear-gradient(135deg, rgba(240, 43, 138, .3), rgba(200, 20, 110, .25));
        border-color: rgba(240, 43, 138, .5);
      }
      #tpred-bet-1:hover {
        background: linear-gradient(135deg, rgba(240, 43, 138, .45), rgba(200, 20, 110, .38));
        box-shadow: 0 4px 16px rgba(240, 43, 138, .2);
      }
      #tpred-github { text-decoration: none; }

      /* ─── Responsive ─── */
      @media (max-width: 900px) {
        .tpred-panel { width: min(96vw, 780px); right: -8px; }
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
          border-bottom: 1px solid var(--tpred-border);
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
        <div class="tpred-accent-bar"></div>
        <div class="tpred-header">
          <div class="tpred-header-left">
            <p class="CoreText-sc-1txzju1-0 ScTitleText-sc-d9mj2s-0 bqyYtA lbYztg tw-title">Prediction Bot</p>
            <p class="CoreText-sc-1txzju1-0 tpred-caption">Underdog strategy</p>
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
            <button id="tpred-toggle-logs" class="ScCoreButton-sc-ocjdkq-0 glPhvE tpred-header-btn" type="button">Hide Logs</button>
            <button id="tpred-close" class="ScCoreButton-sc-ocjdkq-0 glPhvE ScButtonIcon-sc-9yap0r-0 dgVYJo" aria-label="Close panel">✕</button>
          </div>
        </div>
        <div class="tpred-body">
          <div id="tpred-logs-pane" class="tpred-logs-pane">
            <div class="tpred-logs-header">
              <div class="tpred-subtitle CoreText-sc-1txzju1-0">Logs</div>
              <div class="tpred-logs-actions">
                <button id="tpred-clear-logs" class="ScCoreButton-sc-ocjdkq-0 glPhvE tpred-clear-btn" type="button">Clear</button>
              </div>
            </div>
            <div class="tpred-row" style="margin-top:.15rem;margin-bottom:.3rem;display:flex;gap:.6rem;">
              <label class="tpred-toggle" style="padding:.2rem .3rem;"><input id="tpred-logs-disabled" type="checkbox"> <span>Mute Logs</span></label>
              <label class="tpred-toggle" style="padding:.2rem .3rem;"><input id="tpred-autoclear-logs" type="checkbox"> <span>Auto Clear (60s)</span></label>
            </div>
            <div id="tpred-logs" class="tpred-logs"></div>
            <div class="tpred-logs-footer">
              <img src="https://i.ibb.co/gbWGc64j/UNDERDOG-TW-PRED.png" alt="Underdog" />
              <div class="tpred-logs-footer-title">UNDERDOG</div>
              <div class="tpred-oss-note">
                <p>Open-source Twitch Predictions assistant.</p>
                <p>Underdog strategy with live monitor and auto-bet tools.</p>
              </div>
              <div class="tpred-oss-author">Author: HimanM</div>
            </div>
          </div>
          <div id="tpred-main" class="tpred-main">
            <div id="tpred-status" class="CoreText-sc-1txzju1-0"></div>
            <div class="tpred-settings-divider" aria-hidden="true"></div>
            <div class="tpred-section-label">Automation</div>
            <div class="tpred-row">
              <label class="tpred-master-toggle" for="tpred-enabled">
                <input id="tpred-enabled" type="checkbox" />
                <span class="tpred-master-track"><span class="tpred-master-thumb"></span></span>
                <span class="tpred-master-text">Enable Auto-Bet</span>
              </label>
            </div>
            <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-dry-run" type="checkbox"> <span>Dry Run (No bet clicks)</span></label></div>
            <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-force-min-on-skip" type="checkbox"> <span>Disable Skip (bet Auto Min on skips)</span></label></div>
            <div class="tpred-settings-divider" aria-hidden="true"></div>
            <div class="tpred-section-label">Strategy</div>
            <div class="tpred-segment-row">
              <span class="tpred-segment-label">Strategy Mode</span>
              <div id="tpred-strategy-mode" class="tpred-segment" role="group" aria-label="Strategy Mode">
                <button id="tpred-strategy-fixed" class="tpred-segment-btn" type="button" data-mode="fixed">Fixed</button>
                <button id="tpred-strategy-dynamic" class="tpred-segment-btn" type="button" data-mode="dynamic">Dynamic</button>
              </div>
            </div>
            <div class="tpred-settings-divider" aria-hidden="true"></div>
            <div class="tpred-section-label">Discovery</div>
            <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-auto-popover" type="checkbox"> <span>Auto Open Channel Points</span></label></div>
            <div class="tpred-row"><label class="tpred-toggle"><input id="tpred-auto-details" type="checkbox"> <span>Auto Open Prediction Details</span></label></div>
            <div class="tpred-settings-divider" aria-hidden="true"></div>
            <div class="tpred-section-label">Timing</div>
            <div class="tpred-row tpred-inline">
              <label>Discovery Probe (ms)</label>
              <div class="tpred-input-wrap">
                <input id="tpred-discovery-ms" type="number" min="5000" step="1000" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
                <div class="tpred-stepper">
                  <button class="tpred-step-btn" type="button" data-target="tpred-discovery-ms" data-dir="down">-</button>
                  <button class="tpred-step-btn" type="button" data-target="tpred-discovery-ms" data-dir="up">+</button>
                </div>
              </div>
            </div>
            <div class="tpred-row tpred-inline">
              <label>Active Eval (ms)</label>
              <div class="tpred-input-wrap">
                <input id="tpred-eval-ms" type="number" min="1000" step="250" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
                <div class="tpred-stepper">
                  <button class="tpred-step-btn" type="button" data-target="tpred-eval-ms" data-dir="down">-</button>
                  <button class="tpred-step-btn" type="button" data-target="tpred-eval-ms" data-dir="up">+</button>
                </div>
              </div>
            </div>
            <div class="tpred-row tpred-inline">
              <label>Manual Amount</label>
              <div class="tpred-input-wrap">
                <input id="tpred-manual-amount" type="number" min="1" step="1" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
                <div class="tpred-stepper">
                  <button class="tpred-step-btn" type="button" data-target="tpred-manual-amount" data-dir="down">-</button>
                  <button class="tpred-step-btn" type="button" data-target="tpred-manual-amount" data-dir="up">+</button>
                </div>
              </div>
            </div>
            <div class="tpred-row tpred-inline">
              <label>Auto Min Bet</label>
              <div class="tpred-input-wrap">
                <input id="tpred-auto-min-bet" type="number" min="1" step="1" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
                <div class="tpred-stepper">
                  <button class="tpred-step-btn" type="button" data-target="tpred-auto-min-bet" data-dir="down">-</button>
                  <button class="tpred-step-btn" type="button" data-target="tpred-auto-min-bet" data-dir="up">+</button>
                </div>
              </div>
            </div>
            <div class="tpred-row tpred-inline">
              <label>Auto Max Bet</label>
              <div class="tpred-input-wrap">
                <input id="tpred-auto-max-bet" type="number" min="1" step="1" class="ScInputBase-sc-vu7u7d-0 ScInput-sc-19xfhag-0 tw-input" />
                <div class="tpred-stepper">
                  <button class="tpred-step-btn" type="button" data-target="tpred-auto-max-bet" data-dir="down">-</button>
                  <button class="tpred-step-btn" type="button" data-target="tpred-auto-max-bet" data-dir="up">+</button>
                </div>
              </div>
            </div>
            <div class="tpred-timing-hint">Click outside field or press Enter to apply</div>
            <div class="tpred-settings-divider" aria-hidden="true"></div>
            <div class="tpred-section-label">Betting</div>
            <div class="tpred-bet-names">
              <div id="tpred-bet-name-0" class="tpred-bet-name"><span class="tpred-bet-name-title">Outcome A</span><span class="tpred-bet-name-pts"></span></div>
              <div id="tpred-bet-name-1" class="tpred-bet-name"><span class="tpred-bet-name-title">Outcome B</span><span class="tpred-bet-name-pts"></span></div>
            </div>
            <div class="tpred-row tpred-inline">
              <button id="tpred-bet-0" class="ScCoreButton-sc-ocjdkq-0 yezmM tpred-native-btn">
                <div class="ScCoreButtonLabel-sc-s7h2b7-0 OyGFd">
                  <div data-a-target="tw-core-button-label-text" class="Layout-sc-1xcs6mc-0 iBachR">Bet A</div>
                  <div class="ScCoreButtonIcon-sc-ypak37-0 gcsIzP tw-core-button-icon">
                    <div class="ScSvgWrapper-sc-wkgzod-0 kccyMt tw-svg" data-a-selector="tw-core-button-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7Z"></path><path fill-rule="evenodd" d="M1 12C1 5.925 5.925 1 12 1s11 4.925 11 11-4.925 11-11 11S1 18.075 1 12Zm11 9a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z" clip-rule="evenodd"></path></svg>
                    </div>
                  </div>
                </div>
              </button>
              <button id="tpred-bet-1" class="ScCoreButton-sc-ocjdkq-0 yezmM tpred-native-btn">
                <div class="ScCoreButtonLabel-sc-s7h2b7-0 OyGFd">
                  <div data-a-target="tw-core-button-label-text" class="Layout-sc-1xcs6mc-0 iBachR">Bet B</div>
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
    T.runtime.ui.panelBody = root.querySelector(".tpred-body");
    T.runtime.ui.status = root.querySelector("#tpred-status");
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
    T.runtime.ui.strategyMode = root.querySelector("#tpred-strategy-mode");
    T.runtime.ui.toggleForceMinOnSkip = root.querySelector("#tpred-force-min-on-skip");
    T.runtime.ui.toggleAutoOpenPopover = root.querySelector("#tpred-auto-popover");
    T.runtime.ui.toggleAutoOpenDetails = root.querySelector("#tpred-auto-details");
    T.runtime.ui.toggleLogsDisabled = root.querySelector("#tpred-logs-disabled");
    T.runtime.ui.toggleAutoClear = root.querySelector("#tpred-autoclear-logs");

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

    if (T.runtime.ui.outsideClickHandler) {
      document.removeEventListener("mousedown", T.runtime.ui.outsideClickHandler, true);
    }
    T.runtime.ui.outsideClickHandler = (event) => {
      if (!T.settings.panelOpen) return;
      if (!T.runtime.ui.root) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (T.runtime.ui.root.contains(target)) return;
      T.settings.panelOpen = false;
      T.saveSettings();
      renderUi();
    };
    document.addEventListener("mousedown", T.runtime.ui.outsideClickHandler, true);

    if (T.runtime.ui.resizeHandler) {
      window.removeEventListener("resize", T.runtime.ui.resizeHandler);
    }
    T.runtime.ui.resizeHandler = () => {
      updatePanelLayout();
    };
    window.addEventListener("resize", T.runtime.ui.resizeHandler);

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

    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;



      if (!target.classList.contains("tpred-step-btn")) return;

      const inputId = target.dataset?.target;
      const dir = target.dataset?.dir === "down" ? -1 : 1;
      if (!inputId) return;

      const input = root.querySelector(`#${inputId}`);
      if (!(input instanceof HTMLInputElement)) return;

      const step = Number(input.step) || 1;
      const min = Number(input.min);
      const hasMin = !Number.isNaN(min);
      const current = Number(input.value);
      const base = Number.isNaN(current) ? (hasMin ? min : 0) : current;
      let next = base + (step * dir);
      if (hasMin) next = Math.max(min, next);
      input.value = String(Math.round(next));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Enter key on number inputs → blur to apply
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "number") {
        target.blur();
      }
    });

    if (T.runtime.ui.toggleEnabled) T.runtime.ui.toggleEnabled.checked = T.settings.enabled;
    if (T.runtime.ui.toggleDryRun) T.runtime.ui.toggleDryRun.checked = T.settings.dryRun;
    if (T.runtime.ui.toggleForceMinOnSkip) T.runtime.ui.toggleForceMinOnSkip.checked = Boolean(T.settings.forceMinOnSkip);
    if (T.runtime.ui.toggleAutoOpenPopover) T.runtime.ui.toggleAutoOpenPopover.checked = T.settings.autoOpenPopover;
    if (T.runtime.ui.toggleAutoOpenDetails) T.runtime.ui.toggleAutoOpenDetails.checked = T.settings.autoOpenDetails;
    if (T.runtime.ui.toggleLogsDisabled) T.runtime.ui.toggleLogsDisabled.checked = Boolean(T.settings.logsDisabled);
    if (T.runtime.ui.toggleAutoClear) T.runtime.ui.toggleAutoClear.checked = Boolean(T.settings.autoClearLogs);
    if (T.runtime.ui.discoveryInterval) T.runtime.ui.discoveryInterval.value = String(T.getDiscoveryIntervalMs());
    if (T.runtime.ui.evalInterval) T.runtime.ui.evalInterval.value = String(T.getEvalIntervalMs());
    if (T.runtime.ui.manualAmount) T.runtime.ui.manualAmount.value = String(T.settings.manualAmount || 100);
    if (T.runtime.ui.autoMinBet) T.runtime.ui.autoMinBet.value = String(T.getAutoMinBet());
    if (T.runtime.ui.autoMaxBet) T.runtime.ui.autoMaxBet.value = String(T.getAutoMaxBet());

    const applyStrategyModeToUi = () => {
      const mode = T.settings.strategyMode === "dynamic" ? "dynamic" : "fixed";
      const fixedBtn = root.querySelector("#tpred-strategy-fixed");
      const dynamicBtn = root.querySelector("#tpred-strategy-dynamic");
      fixedBtn?.classList.toggle("tpred-active", mode === "fixed");
      dynamicBtn?.classList.toggle("tpred-active", mode === "dynamic");
    };
    applyStrategyModeToUi();

    T.runtime.ui.toggleEnabled?.addEventListener("change", () => {
      const nextEnabled = Boolean(T.runtime.ui.toggleEnabled?.checked);
      T.setAutoBetEnabled(nextEnabled, "UI toggle", true);
      if (T.runtime.ui.toggleEnabled) {
        T.runtime.ui.toggleEnabled.checked = T.settings.enabled;
      }
    });

    T.runtime.ui.toggleDryRun?.addEventListener("change", () => {
      T.settings.dryRun = T.runtime.ui.toggleDryRun.checked;
      T.saveSettings();
      T.log(`Dry Run ${T.settings.dryRun ? "enabled" : "disabled"}.`, "info");
      T.logModeSnapshot("Mode updated");
    });

    T.runtime.ui.toggleForceMinOnSkip?.addEventListener("change", () => {
      T.settings.forceMinOnSkip = T.runtime.ui.toggleForceMinOnSkip.checked;
      T.saveSettings();
      T.log(`Disable Skip ${T.settings.forceMinOnSkip ? "enabled" : "disabled"}.`, "info");
    });

    T.runtime.ui.strategyMode?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const nextMode = target.dataset?.mode;
      if (nextMode !== "fixed" && nextMode !== "dynamic") return;
      if (T.settings.strategyMode === nextMode) return;
      T.settings.strategyMode = nextMode;
      T.saveSettings();
      applyStrategyModeToUi();
      T.log(`Strategy mode updated: ${nextMode}.`, "info");
      T.evaluate();
      renderUi();
    });

    T.runtime.ui.toggleAutoOpenPopover?.addEventListener("change", () => {
      T.settings.autoOpenPopover = T.runtime.ui.toggleAutoOpenPopover.checked;
      T.saveSettings();
      T.log(`Auto Open Channel Points ${T.settings.autoOpenPopover ? "enabled" : "disabled"}.`, "info");
    });

    T.runtime.ui.toggleAutoOpenDetails?.addEventListener("change", () => {
      T.settings.autoOpenDetails = T.runtime.ui.toggleAutoOpenDetails.checked;
      T.saveSettings();
      T.log(`Auto Open Prediction Details ${T.settings.autoOpenDetails ? "enabled" : "disabled"}.`, "info");
    });

    T.runtime.ui.toggleLogsDisabled?.addEventListener("change", () => {
      T.settings.logsDisabled = T.runtime.ui.toggleLogsDisabled.checked;
      T.saveSettings();
    });

    T.runtime.ui.toggleAutoClear?.addEventListener("change", () => {
      T.settings.autoClearLogs = T.runtime.ui.toggleAutoClear.checked;
      T.saveSettings();
      if (T.settings.autoClearLogs && !T.runtime.autoClearTimerId) {
        T.runtime.autoClearTimerId = setInterval(() => {
          T.runtime.logs = [];
          T.runtime.lastLogByKey = Object.create(null);
          renderUi();
        }, 60000);
      } else if (!T.settings.autoClearLogs && T.runtime.autoClearTimerId) {
        clearInterval(T.runtime.autoClearTimerId);
        T.runtime.autoClearTimerId = null;
      }
    });

    // Start autoclear timer if setting was persisted
    if (T.settings.autoClearLogs && !T.runtime.autoClearTimerId) {
      T.runtime.autoClearTimerId = setInterval(() => {
        T.runtime.logs = [];
        T.runtime.lastLogByKey = Object.create(null);
        renderUi();
      }, 60000);
    }

    T.runtime.ui.discoveryInterval?.addEventListener("change", () => {
      const val = Math.max(5000, parseInt(T.runtime.ui.discoveryInterval.value || String(T.CONFIG.DISCOVERY_INTERVAL_MS), 10) || T.CONFIG.DISCOVERY_INTERVAL_MS);
      T.settings.discoveryIntervalMs = val;
      T.runtime.ui.discoveryInterval.value = String(val);
      T.saveSettings();
      if (T.runtime.discoveryIntervalId) {
        T.restartDiscoveryLoop();
      }
      T.log(`Discovery probe updated: ${val} ms.`, "info");
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
      T.log(`Active evaluation updated: ${val} ms.`, "info");
    });

    T.runtime.ui.manualAmount?.addEventListener("change", () => {
      const val = Math.max(1, parseInt(T.runtime.ui.manualAmount.value || "100", 10) || 100);
      T.settings.manualAmount = val;
      T.runtime.ui.manualAmount.value = String(val);
      T.saveSettings();
      renderUi();
    });

    T.runtime.ui.autoMinBet?.addEventListener("change", () => {
      const parsedMin = Number(T.runtime.ui.autoMinBet.value);
      const rawMin = Number.isNaN(parsedMin) ? 1 : Math.round(parsedMin);
      const currentMax = T.getAutoMaxBet();
      const minVal = Math.max(1, Math.min(currentMax, rawMin));
      T.settings.autoMinBet = minVal;
      T.runtime.ui.autoMinBet.value = String(minVal);
      T.saveSettings();
      T.log(`Auto Min Bet updated: ${minVal}.`, "info");
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
      T.log(`Auto Max Bet updated: ${maxVal}.`, "info");
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
    T.log("Injected control panel into top nav.", "success");
  }

  function updatePanelLayout() {
    const panel = T.runtime.ui.panel;
    if (!panel) return;

    if (window.innerWidth <= 700) {
      panel.style.height = "";
      panel.style.maxHeight = "";
      if (T.runtime.ui.panelBody) {
        T.runtime.ui.panelBody.style.height = "";
        T.runtime.ui.panelBody.style.maxHeight = "";
      }
      if (T.runtime.ui.panelMain) {
        T.runtime.ui.panelMain.style.height = "";
        T.runtime.ui.panelMain.style.maxHeight = "";
      }
      if (T.runtime.ui.logsPane) {
        T.runtime.ui.logsPane.style.height = "";
        T.runtime.ui.logsPane.style.maxHeight = "";
      }
      return;
    }

    const rect = panel.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 900;
    const availableHeight = Math.max(360, Math.floor(viewportHeight - rect.top - 12));
    panel.style.height = `${availableHeight}px`;
    panel.style.maxHeight = `${availableHeight}px`;

    const header = panel.querySelector(".tpred-header");
    const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 52;
    const bodyHeight = Math.max(220, availableHeight - headerHeight - 26);

    if (T.runtime.ui.panelBody) {
      T.runtime.ui.panelBody.style.height = `${bodyHeight}px`;
      T.runtime.ui.panelBody.style.maxHeight = `${bodyHeight}px`;
    }
    if (T.runtime.ui.panelMain) {
      T.runtime.ui.panelMain.style.height = `${bodyHeight}px`;
      T.runtime.ui.panelMain.style.maxHeight = `${bodyHeight}px`;
    }
    if (T.runtime.ui.logsPane) {
      T.runtime.ui.logsPane.style.height = `${bodyHeight}px`;
      T.runtime.ui.logsPane.style.maxHeight = `${bodyHeight}px`;
    }
  }

  function dynamicNameSize(text) {
    const len = (text || "").length;
    if (len <= 12) return "13px";
    if (len <= 20) return "12px";
    if (len <= 30) return "11px";
    return "10px";
  }

  function renderUi() {
    if (!T.runtime.ui.root) return;

    // Skip heavy DOM updates only while the user is typing in a number input
    const focused = document.activeElement;
    if (
      focused instanceof HTMLInputElement &&
      focused.type === "number" &&
      T.runtime.ui.panelMain?.contains(focused)
    ) {
      return;
    }

    if (T.runtime.ui.toggleEnabled) {
      T.runtime.ui.toggleEnabled.checked = Boolean(T.settings.enabled);
    }

    T.runtime.ui.panel.classList.toggle("tpred-hidden", !T.settings.panelOpen);
    T.runtime.ui.logsPane?.classList.toggle("tpred-hidden-pane", !T.settings.logsVisible);
    if (T.runtime.ui.panelBody) {
      T.runtime.ui.panelBody.style.gridTemplateColumns = T.settings.logsVisible ? "280px minmax(0, 1fr)" : "minmax(0, 1fr)";
    }
    if (T.runtime.ui.panel) {
      T.runtime.ui.panel.style.width = T.settings.logsVisible ? "780px" : "500px";
    }
    updatePanelLayout();
    if (T.runtime.ui.toggleLogs) {
      T.runtime.ui.toggleLogs.textContent = T.settings.logsVisible ? "Hide Logs" : "Show Logs";
    }

    const st = T.runtime.latestState;
    const pending = T.runtime.pendingDecision;
    const predictionKey = st ? T.makePredictionKey(st) : null;
    const botPlaced = predictionKey && T.runtime.lastPlacedBet?.predictionKey === predictionKey
      ? T.runtime.lastPlacedBet
      : null;
    const skipEnabled = !T.settings.forceMinOnSkip;
    const strategyMode = T.settings.strategyMode === "dynamic" ? "Dynamic" : "Fixed";
    const ownsLock = typeof T.hasAutoBetLock === "function" ? T.hasAutoBetLock() : false;
    const lockRole = (T.settings.enabled && ownsLock) ? "Owner" : "Observer";
    const lockRoleClass = lockRole === "Owner" ? "tpred-flag-owner" : "tpred-flag-observer";
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
        <span class="tpred-flag">Mode: ${T.escapeHtml(strategyMode)}</span>
        <span class="tpred-flag ${lockRoleClass}">Role: ${lockRole}</span>
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
      const btn0Name = T.runtime.ui.root.querySelector("#tpred-bet-name-0");
      const btn1Name = T.runtime.ui.root.querySelector("#tpred-bet-name-1");
      const manualAmount = Math.max(1, parseInt(T.runtime.ui.manualAmount?.value || String(T.settings.manualAmount || 100), 10) || 100);

      if (btn0Name) {
        const t0 = btn0Name.querySelector('.tpred-bet-name-title');
        const p0 = btn0Name.querySelector('.tpred-bet-name-pts');
        if (t0) { t0.textContent = a.title; t0.style.fontSize = dynamicNameSize(a.title); }
        if (p0) p0.textContent = a.totalPoints.toLocaleString();
      }
      if (btn1Name) {
        const t1 = btn1Name.querySelector('.tpred-bet-name-title');
        const p1 = btn1Name.querySelector('.tpred-bet-name-pts');
        if (t1) { t1.textContent = b.title; t1.style.fontSize = dynamicNameSize(b.title); }
        if (p1) p1.textContent = b.totalPoints.toLocaleString();
      }
      if (btn0Label) btn0Label.textContent = `Bet A ${manualAmount}`;
      if (btn1Label) btn1Label.textContent = `Bet B ${manualAmount}`;

      btn0?.classList.toggle("tpred-bot-pending", botPending?.outcomeId === "0");
      btn1?.classList.toggle("tpred-bot-pending", botPending?.outcomeId === "1");
      btn0?.classList.toggle("tpred-bot-placed", botPlaced?.outcomeId === "0");
      btn1?.classList.toggle("tpred-bot-placed", botPlaced?.outcomeId === "1");


    } else {
      const btn0 = T.runtime.ui.root.querySelector("#tpred-bet-0");
      const btn1 = T.runtime.ui.root.querySelector("#tpred-bet-1");
      const btn0Label = T.runtime.ui.root.querySelector("#tpred-bet-0 [data-a-target='tw-core-button-label-text']");
      const btn1Label = T.runtime.ui.root.querySelector("#tpred-bet-1 [data-a-target='tw-core-button-label-text']");
      const btn0Name = T.runtime.ui.root.querySelector("#tpred-bet-name-0");
      const btn1Name = T.runtime.ui.root.querySelector("#tpred-bet-name-1");
      const manualAmount = Math.max(1, parseInt(T.runtime.ui.manualAmount?.value || String(T.settings.manualAmount || 100), 10) || 100);
      if (btn0Name) {
        const t0 = btn0Name.querySelector('.tpred-bet-name-title');
        const p0 = btn0Name.querySelector('.tpred-bet-name-pts');
        if (t0) { t0.textContent = 'Outcome A'; t0.style.fontSize = '13px'; }
        if (p0) p0.textContent = '';
      }
      if (btn1Name) {
        const t1 = btn1Name.querySelector('.tpred-bet-name-title');
        const p1 = btn1Name.querySelector('.tpred-bet-name-pts');
        if (t1) { t1.textContent = 'Outcome B'; t1.style.fontSize = '13px'; }
        if (p1) p1.textContent = '';
      }
      if (btn0Label) btn0Label.textContent = `Bet A ${manualAmount}`;
      if (btn1Label) btn1Label.textContent = `Bet B ${manualAmount}`;
      btn0?.classList.remove("tpred-bot-pending", "tpred-bot-placed");
      btn1?.classList.remove("tpred-bot-pending", "tpred-bot-placed");

    }

    const levelClass = (lvl) => {
      if (lvl === "success") return " tpred-log-success";
      if (lvl === "warn") return " tpred-log-warn";
      if (lvl === "error") return " tpred-log-error";
      return " tpred-log-info";
    };
    T.runtime.ui.logs.innerHTML = T.runtime.logs
      .slice(0, 60)
      .map((l) => `<div class="tpred-log-line${levelClass(l.level)}">[${T.fmtTime(l.ts)}] ${T.escapeHtml(l.msg)}</div>`)
      .join("");
  }

  T.injectUiStyles = injectUiStyles;
  T.ensureUi = ensureUi;
  T.renderUi = renderUi;
})();
