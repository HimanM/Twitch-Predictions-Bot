// ==UserScript==
// @name         Twitch Prediction Auto-Bet (Underdog)
// @namespace    https://twitch.tv/
// @version      1.0.0
// @description  Auto-bet on Twitch predictions 5s before lock using underdog ratio strategy
// @author       you
// @match        https://www.twitch.tv/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const LOG_PREFIX = "[TwitchPred]";

  const CONFIG = {
    BET_TRIGGER_SECONDS: 5,
    EVAL_INTERVAL_MS: 5000,
    WATCH_INTERVAL_MS: 250,
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
    evalIntervalId: null,
    watchIntervalId: null,
    placedForPredictionKey: null,
    observer: null,
    lastOpenAttemptAt: 0,
    lastDetailsAttemptAt: 0,
  };

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
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
    if (t.includes("resolved") || t.includes("winner")) return "RESOLVED";
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

  function placeBet(decision) {
    if (!decision?.shouldBet) {
      log("No bet decision; skipping.");
      return false;
    }

    if (hasAlreadyVoted()) {
      log("Already voted on this prediction; skipping.");
      return false;
    }

    const { blueButton, pinkButton } = getPredictionButtons();
    const targetButton = decision.outcomeId === "0" ? blueButton : pinkButton;
    if (!targetButton) {
      log("Outcome button not found for", decision.outcomeId);
      return false;
    }

    if (!click(targetButton)) {
      log("Failed to click outcome button.");
      return false;
    }

    // Try switching to custom amount mode if toggle exists.
    const customToggle = document.querySelector(
      '[data-test-selector="prediction-checkout-active-footer__input-type-toggle"]'
    );
    if (customToggle) click(customToggle);

    const input = findCustomAmountInput();
    const confirmButton = findConfirmButton();

    // Full flow: custom amount + explicit confirm.
    if (input && confirmButton) {
      setNativeInputValue(input, decision.amount);
      click(confirmButton);
      log("Placed custom bet:", decision.amount, "on", decision.outcomeTitle);
      return true;
    }

    // Fallback flow: fixed quick amount button only.
    // On some layouts each outcome button itself submits a fixed amount.
    if (decision.amount >= 10) {
      log(
        "Custom amount controls not found; used fixed-button fallback (likely 10 points).",
        "Target amount was",
        decision.amount
      );
      return true;
    }

    log("Unable to place bet: missing custom controls and target amount < fixed minimum.");
    return false;
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
    ensurePredictionUiOpen();
    ensurePredictionDetailsOpen();

    const state = readPredictionState();
    if (!state) return;

    const decision = decideBet(state);
    runtime.pendingDecision = {
      ...decision,
      snapshotAt: Date.now(),
      secondsLeft: state.secondsLeft,
      predictionKey: makePredictionKey(state),
    };

    log("Decision updated:", runtime.pendingDecision);
  }

  function watchAndExecute() {
    ensurePredictionUiOpen();
    ensurePredictionDetailsOpen();

    const state = readPredictionState();
    if (!state) return;

    const key = makePredictionKey(state);
    if (runtime.placedForPredictionKey === key) return;

    if (state.status !== "ACTIVE") {
      clearIntervals();
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

  function setupObserver() {
    if (runtime.observer) return;

    runtime.observer = new MutationObserver(() => {
      const hasPredictionUi =
        Boolean(document.querySelector(".predictions-list-item")) ||
        Boolean(document.querySelector("#channel-points-reward-center-body"));

      ensurePredictionUiOpen();
      ensurePredictionDetailsOpen();

      if (hasPredictionUi) {
        startLoopsIfNeeded();
      }
    });

    runtime.observer.observe(document.body, { subtree: true, childList: true });
  }

  setupObserver();
  startLoopsIfNeeded();
  log("Script initialized.");
})();
