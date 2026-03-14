/**
 * Twitch Predictions Auto-Bet Algorithm
 * ======================================
 * Strategy: Bet on the least-favored outcome (underdog) using
 * a risk-scaled bet size based on how lopsided the prediction is.
 *
 * Core logic:
 *  - Extreme underdog  → higher bet (high payout justifies risk)
 *  - Near 50/50        → skip (low payout, not worth the risk)
 *  - Max bet cap       → 1000 points
 *  - Region blocked    → available points === 0, skip entirely
 */

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Parse Twitch's abbreviated point strings into integers.
 * Handles: "500", "1,234", "6.6K", "1.2M"
 *
 * @param {string|null|undefined} text
 * @returns {number}  0 if the input cannot be parsed
 */
function parsePoints(text) {
  if (!text) return 0;
  const s = text.trim().replace(/,/g, "");
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  if (/k$/i.test(s)) return Math.round(num * 1_000);
  if (/m$/i.test(s)) return Math.round(num * 1_000_000);
  return Math.round(num);
}

/**
 * Read the viewer's available channel-point balance from the Twitch DOM.
 * Anchors on the stable BEM class "channel-points-icon--small", walks up
 * two levels to the shared container, then grabs the first <span>.
 *
 * @returns {number}  0 if the element is not found (region-blocked or not loaded)
 */
function readAvailablePoints() {
  // There can be many small channel-points icons (header + prediction buttons).
  // Choose the largest numeric value near these icons; header balance is usually
  // the maximum while prediction quick-buttons are tiny (e.g. 10).
  const icons = document.querySelectorAll(".channel-points-icon--small");
  let best = 0;

  for (const icon of icons) {
    const container = icon.parentElement?.parentElement;
    const spans = container?.querySelectorAll("span, p") ?? [];
    for (const node of spans) {
      const value = parsePoints(node.textContent);
      if (value > best) best = value;
    }
  }

  return best;
}

/**
 * Infer prediction status from the list-item subtitle text.
 * Twitch uses plain English: "Prediction submissions closed", "Waiting for result",
 * or a countdown (any string containing digits) when the prediction is still open.
 *
 * @param {string} text
 * @returns {"ACTIVE"|"LOCKED"|"RESOLVED"|"CANCELED"|"UNKNOWN"}
 */
function parseStatusText(text) {
  const t = (text ?? "").toLowerCase();
  if (t.includes("closed") || t.includes("waiting for result")) return "LOCKED";
  if (t.includes("resolved") || t.includes("winner"))           return "RESOLVED";
  if (t.includes("cancel"))                                      return "CANCELED";
  if (/\d/.test(t)) return "ACTIVE"; // any digits → countdown
  return "UNKNOWN";
}

/**
 * Parse the prediction countdown text from the list-item subtitle into seconds.
 *
 * Handled formats (Twitch uses plain English, exact format needs live verification):
 *   "2:30"          → 150
 *   "1m 30s"        → 90
 *   "2 minutes"     → 120
 *   "30 seconds"    → 30
 *   "30s"           → 30
 *
 * @param {string} text
 * @returns {number}  Infinity if no countdown is detected
 */
function parseTimerText(text) {
  if (!text) return Infinity;
  const t = text.toLowerCase();

  // "mm:ss" — e.g. "2:30"
  const colon = t.match(/(\d+):(\d{2})/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);

  // "Xm Ys" — e.g. "1m 30s"
  const ms = t.match(/(\d+)\s*m\w*\s+(\d+)\s*s/);
  if (ms) return parseInt(ms[1], 10) * 60 + parseInt(ms[2], 10);

  // "X minutes" / "X minute"
  const mins = t.match(/(\d+)\s*min/);
  if (mins) return parseInt(mins[1], 10) * 60;

  // "X seconds" / "Xs"
  const secs = t.match(/(\d+)\s*s/);
  if (secs) return parseInt(secs[1], 10);

  return Infinity;
}

/**
 * Detect whether the current active prediction is region-restricted.
 *
 * Twitch renders this footer in blocked regions:
 *   [data-test-selector="prediction-checkout-active-footer__region-restriction-message"]
 *
 * @returns {boolean}
 */
function isRegionRestricted() {
  const el = document.querySelector(
    '[data-test-selector="prediction-checkout-active-footer__region-restriction-message"]'
  );
  return Boolean(el);
}

/**
 * Resolve the two clickable prediction outcome buttons in the active checkout.
 *
 * @returns {{ blueButton: HTMLButtonElement|null, pinkButton: HTMLButtonElement|null }}
 */
function getPredictionButtons() {
  const blueButton = document
    .querySelector(".spectator-prediction-button--blue, .fixedPredictionButton--jEmiF.blue--z7K6N")
    ?.closest("button") ?? null;

  const pinkButton = document
    .querySelector(".spectator-prediction-button--pink, .fixedPredictionButton--jEmiF.pink--TRx6x")
    ?.closest("button") ?? null;

  return { blueButton, pinkButton };
}

/**
 * Read per-outcome point totals from the expanded detail panel.
 * Anchors on the SVG aria-label="Total Channel Points" inside each outcome's
 * statistics block, then grabs the adjacent animated-number span.
 *
 * Returns [0, 0] if the detail panel is not currently open.
 *
 * @returns {[number, number]}
 */
function readDetailPoints() {
  const sections = document.querySelectorAll(
    '[data-test-selector="prediction-summary-outcome__statistics"]'
  );
  const values = Array.from(sections).slice(0, 2).map((section) => {
    const svg  = section.querySelector('svg[aria-label="Total Channel Points"]');
    const span = svg
      ?.closest('[data-test-selector="prediction-summary-stat__content"]')
      ?.querySelector("span");
    return parsePoints(span?.textContent);
  });

  while (values.length < 2) values.push(0);
  return [values[0], values[1]];
}

/**
 * Read outcome titles from the detail panel's progress bar aria-labels.
 * Each bar has:  aria-label="99.95% of votes for yes :)"
 * so we parse the part after "of votes for".
 *
 * Returns ['?', '?'] if the detail panel is closed.
 *
 * @returns {[string, string]}
 */
function readOutcomeTitles() {
  // Preferred source: explicit title nodes in the detail panel.
  const titleEls = document.querySelectorAll(
    '[data-test-selector="prediction-summary-outcome__title"] p'
  );
  if (titleEls.length >= 2) {
    return [
      titleEls[0]?.textContent?.trim() || "?",
      titleEls[1]?.textContent?.trim() || "?",
    ];
  }

  // Fallback source: parse "... of votes for <title>" from bar aria-label.
  const bars = document.querySelectorAll(
    '[data-test-selector="prediction-summary-outcome__bar"]'
  );
  const values = Array.from(bars).slice(0, 2).map((bar) => {
    const label = bar.getAttribute("aria-label") ?? "";
    const match = label.match(/of votes for (.+)$/i);
    return match?.[1]?.trim() ?? "?";
  });

  while (values.length < 2) values.push("?");
  return [values[0], values[1]];
}

/**
 * Read outcome percentages from the detail panel bars.
 *
 * The aria-label is typically:
 *   "99.95% of votes for yes :)"
 *
 * @returns {[number, number]} percentages in 0-100 range
 */
function readDetailPercents() {
  const bars = document.querySelectorAll(
    '[data-test-selector="prediction-summary-outcome__bar"]'
  );
  const values = Array.from(bars).slice(0, 2).map((bar) => {
    const label = bar.getAttribute("aria-label") ?? "";
    const match = label.match(/([\d.]+)%\s+of votes/i);
    return match ? parseFloat(match[1]) : 0;
  });

  while (values.length < 2) values.push(0);
  return [values[0], values[1]];
}

/**
 * Read the full prediction state from the Twitch DOM.
 *
 * Two complementary data sources are combined:
 *
 *   PRIMARY   — .predictions-list-item (always visible in the sidebar)
 *               Provides: status text, countdown timer, bar percentages, pool total.
 *
 *   SECONDARY — #channel-points-reward-center-body (visible when detail panel is open)
 *               Provides: per-outcome point totals (precise), outcome titles.
 *
 * When the detail panel is closed, per-outcome points are synthesised from
 * totalPool × barWidthPercent, which gives the same ratio used by the algorithm.
 *
 * @returns {PredictionState|null}  null if no prediction widget is found in the DOM
 */
function readPredictionState() {
  const listItem = document.querySelector(".predictions-list-item");
  const detailRoot = document.querySelector("#channel-points-reward-center-body");
  if (!listItem && !detailRoot) return null;

  // ── Status & timer ──────────────────────────────────────────────────────
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

  // ── Progress bar vote percentages (always visible) ──────────────────────
  const listBarEls = listItem?.querySelectorAll(".predictions-list-item__outcomes--bar") ?? [];
  const listPcts = Array.from(listBarEls).map((el) => parseFloat(el.style.width) || 0);
  const detailPcts = readDetailPercents();

  const pct0 = listPcts[0] || detailPcts[0] || 50;
  const pct1 = listPcts[1] || detailPcts[1] || 50;

  // ── Total combined pool ─────────────────────────────────────────────────
  const poolEl = listItem?.querySelector('[data-test-selector="predictions-list-item__total-points"]');
  let totalPool = parsePoints(poolEl?.textContent);

  // ── Per-outcome points (detail panel > synthesised fallback) ────────────
  const detailPts = readDetailPoints();  // [0, 0] when panel is closed
  if (!totalPool) {
    totalPool = detailPts[0] + detailPts[1];
  }
  const pts0 = detailPts[0] || Math.round((totalPool * pct0) / 100);
  const pts1 = detailPts[1] || Math.round((totalPool * pct1) / 100);

  // ── Outcome titles ──────────────────────────────────────────────────────
  const titles = readOutcomeTitles();   // ['?', '?'] when panel is closed

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

// ---------------------------------------------------------------------------
// Types (JSDoc for IDE support)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Outcome
 * @property {string} id
 * @property {string} title
 * @property {number} totalPoints   - channel points currently wagered on this outcome
 * @property {number} totalUsers    - number of users who bet on this outcome
 */

/**
 * @typedef {Object} PredictionState
 * @property {string}    status          - "ACTIVE" | "LOCKED" | "RESOLVED" | "CANCELED"
 * @property {Outcome[]} outcomes        - exactly 2 outcomes
 * @property {number}    secondsLeft     - seconds until the prediction locks
 * @property {number}    myAvailablePoints
 */

/**
 * @typedef {Object} BetDecision
 * @property {boolean} shouldBet
 * @property {string|null} outcomeId     - which outcome to bet on
 * @property {string|null} outcomeTitle
 * @property {number} amount             - points to wager (0 if shouldBet is false)
 * @property {string} reason             - human-readable rationale
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG = {
  BET_TRIGGER_SECONDS: 5,   // how many seconds before close to place the bet
  MAX_BET: 1000,             // hard cap on any single bet

  // Ratio thresholds: ratio = favoritePoints / underdogPoints
  // Higher ratio = more lopsided = underdog has a bigger payout
  TIERS: [
    { minRatio: 100, bet: 500  },  // 99:1 or worse  → 500 pts
    { minRatio:  20, bet: 400  },  // ~95:5           → 400 pts
    { minRatio:  10, bet: 300  },  // ~90:10          → 300 pts
    { minRatio:   5, bet: 200  },  // ~83:17          → 200 pts
    { minRatio:   2, bet: 100  },  // ~67:33          → 100 pts
    // ratio < 2 (near 50/50) → skip, payout too low for the risk
  ],
};

// ---------------------------------------------------------------------------
// Core algorithm
// ---------------------------------------------------------------------------

/**
 * Determine whether to bet, on which outcome, and how many points.
 *
 * @param {PredictionState} state
 * @returns {BetDecision}
 */
function decideBet(state) {
  const NO_BET = (reason) => ({
    shouldBet: false,
    outcomeId: null,
    outcomeTitle: null,
    amount: 0,
    reason,
  });

  // --- Guard: region blocked (game allows 0-point bets but we skip) ----------
  if (state.myAvailablePoints === 0) {
    return NO_BET("Region blocked or no points available — skipping.");
  }

  // --- Guard: prediction must be ACTIVE and close to locking -----------------
  if (state.status !== "ACTIVE") {
    return NO_BET(`Prediction is not active (status: ${state.status}).`);
  }

  if (state.secondsLeft > CONFIG.BET_TRIGGER_SECONDS) {
    return NO_BET(
      `Too early — ${state.secondsLeft}s left, waiting until ${CONFIG.BET_TRIGGER_SECONDS}s.`
    );
  }

  // --- Identify the two outcomes--------------------------------------------
  const [a, b] = state.outcomes;
  if (!a || !b) {
    return NO_BET("Could not read both outcomes.");
  }

  // At least SOME points must be wagered on each side before we act
  // (avoids division-by-zero and avoids acting on an empty prediction)
  if (a.totalPoints === 0 || b.totalPoints === 0) {
    return NO_BET("One outcome has 0 points — not enough data to evaluate.");
  }

  // --- Identify underdog vs favorite ----------------------------------------
  const underdog  = a.totalPoints < b.totalPoints ? a : b;
  const favorite  = a.totalPoints < b.totalPoints ? b : a;

  const ratio = favorite.totalPoints / underdog.totalPoints;
  const underdogShare = underdog.totalPoints / (underdog.totalPoints + favorite.totalPoints);

  // --- Determine bet size from tier table ------------------------------------
  const tier = CONFIG.TIERS.find((t) => ratio >= t.minRatio);

  if (!tier) {
    return NO_BET(
      `Near 50/50 (ratio ${ratio.toFixed(2)}, underdog share ${(underdogShare * 100).toFixed(1)}%) — ` +
        "payout too low to justify the risk."
    );
  }

  // --- Apply hard cap and available-points check ----------------------------
  let amount = Math.min(tier.bet, CONFIG.MAX_BET, state.myAvailablePoints);

  // Never bet more than half of available points as a safety floor
  // (prevents wiping your balance on one prediction)
  amount = Math.min(amount, Math.floor(state.myAvailablePoints * 0.5));

  if (amount <= 0) {
    return NO_BET("Calculated bet amount is 0 after applying caps.");
  }

  // --- Build decision -------------------------------------------------------
  const payoutMultiplier = (underdog.totalPoints + favorite.totalPoints) / underdog.totalPoints;

  return {
    shouldBet: true,
    outcomeId: underdog.id,
    outcomeTitle: underdog.title,
    amount,
    reason:
      `Underdog "${underdog.title}" has ${(underdogShare * 100).toFixed(1)}% of votes. ` +
      `Ratio ${ratio.toFixed(1)}:1. ` +
      `Estimated payout multiplier ~${payoutMultiplier.toFixed(1)}x. ` +
      `Betting ${amount} pts (tier cap: ${tier.bet}, hard cap: ${CONFIG.MAX_BET}, ` +
      `available: ${state.myAvailablePoints}).`,
  };
}

// ---------------------------------------------------------------------------
// Probability summary (informational — not used for betting decisions)
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable snapshot of the current prediction odds.
 *
 * @param {PredictionState} state
 * @returns {string}
 */
function summarizeOdds(state) {
  const [a, b] = state.outcomes;
  const total = a.totalPoints + b.totalPoints;
  if (total === 0) return "No points wagered yet.";

  const pA = ((a.totalPoints / total) * 100).toFixed(1);
  const pB = ((b.totalPoints / total) * 100).toFixed(1);
  const multA = (total / a.totalPoints).toFixed(2);
  const multB = (total / b.totalPoints).toFixed(2);

  return (
    `"${a.title}": ${a.totalPoints.toLocaleString()} pts (${pA}%, ×${multA} payout)\n` +
    `"${b.title}": ${b.totalPoints.toLocaleString()} pts (${pB}%, ×${multB} payout)`
  );
}

// ---------------------------------------------------------------------------
// Self-test (run with: node algorithm.js)
// ---------------------------------------------------------------------------

function runTests() {
  const tests = [
    {
      label: "Extreme underdog (10 000 vs 100) — expect ~500 bet on B",
      state: {
        status: "ACTIVE", secondsLeft: 4, myAvailablePoints: 1000,
        outcomes: [
          { id: "a", title: "Team A wins", totalPoints: 10000, totalUsers: 300 },
          { id: "b", title: "Team B wins", totalPoints: 100,   totalUsers: 5   },
        ],
      },
    },
    {
      label: "Near 50/50 (8 000 vs 9 000) — expect NO BET",
      state: {
        status: "ACTIVE", secondsLeft: 4, myAvailablePoints: 5000,
        outcomes: [
          { id: "a", title: "Yes", totalPoints: 9000, totalUsers: 200 },
          { id: "b", title: "No",  totalPoints: 8000, totalUsers: 180 },
        ],
      },
    },
    {
      label: "Region blocked (0 points) — expect NO BET",
      state: {
        status: "ACTIVE", secondsLeft: 4, myAvailablePoints: 0,
        outcomes: [
          { id: "a", title: "Yes", totalPoints: 5000, totalUsers: 100 },
          { id: "b", title: "No",  totalPoints: 200,  totalUsers: 10  },
        ],
      },
    },
    {
      label: "Too early (20s left) — expect NO BET",
      state: {
        status: "ACTIVE", secondsLeft: 20, myAvailablePoints: 2000,
        outcomes: [
          { id: "a", title: "Yes", totalPoints: 8000, totalUsers: 200 },
          { id: "b", title: "No",  totalPoints: 200,  totalUsers: 20  },
        ],
      },
    },
    {
      label: "Moderate underdog (5 000 vs 500) — expect 300 bet",
      state: {
        status: "ACTIVE", secondsLeft: 3, myAvailablePoints: 2000,
        outcomes: [
          { id: "a", title: "Win",  totalPoints: 5000, totalUsers: 120 },
          { id: "b", title: "Lose", totalPoints: 500,  totalUsers: 15  },
        ],
      },
    },
    {
      label: "Low available points (only 80pts, tier says 100) — expect bet capped at 40",
      state: {
        status: "ACTIVE", secondsLeft: 4, myAvailablePoints: 80,
        outcomes: [
          { id: "a", title: "Yes", totalPoints: 6000, totalUsers: 140 },
          { id: "b", title: "No",  totalPoints: 1000, totalUsers: 30  },
        ],
      },
    },
  ];

  console.log("=== Twitch Prediction Algorithm — Self-Test ===\n");
  for (const t of tests) {
    const decision = decideBet(t.state);
    console.log(`TEST: ${t.label}`);
    console.log(`ODDS:\n  ${summarizeOdds(t.state).replace("\n", "\n  ")}`);
    console.log(`DECISION: shouldBet=${decision.shouldBet}, amount=${decision.amount}`);
    console.log(`REASON: ${decision.reason}`);
    console.log("---");
  }
}

// Run test suite when called directly (Node.js)
if (typeof require !== "undefined" && require.main === module) {
  runTests();
}

// Export for use in Tampermonkey userscript
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    decideBet,
    summarizeOdds,
    parsePoints,
    parseStatusText,
    parseTimerText,
    isRegionRestricted,
    getPredictionButtons,
    readAvailablePoints,
    readDetailPoints,
    readDetailPercents,
    readOutcomeTitles,
    readPredictionState,
    CONFIG,
  };
}
