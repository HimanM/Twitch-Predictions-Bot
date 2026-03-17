/**
 * dom.js — All Twitch DOM reading, state detection, and UI interaction helpers.
 * Depends on: config.js, utils.js
 * Cross-module calls (T.log, T.logChanged, T.click) are resolved at call-time.
 */
(function () {
  "use strict";

  const T = window.TPRED;

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
    const direct = T.parsePoints(balance?.textContent);
    if (direct > 0) return direct;

    // The page has multiple point icons. We choose the largest parsed value near
    // small point icons; quick-bet buttons are usually 10, while wallet is larger.
    const icons = document.querySelectorAll(".channel-points-icon--small");
    let best = 0;

    for (const icon of icons) {
      const container = icon.parentElement?.parentElement;
      const nodes = container?.querySelectorAll("span, p") ?? [];
      for (const node of nodes) {
        const value = T.parsePoints(node.textContent);
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
    if (!T.settings.autoOpenPopover) return;
    if (hasPredictionListOpen() || hasPredictionDetailsOpen()) return;

    const now = Date.now();
    if (now - T.runtime.lastOpenAttemptAt < 1500) return;

    const button = findChannelPointsButton();
    if (!button) return;

    T.runtime.lastOpenAttemptAt = now;
    T.click(button);
    T.log("Opened Channel Points popover.", "info");
  }

  function ensurePredictionDetailsOpen() {
    if (!T.settings.autoOpenDetails) return;
    if (hasPredictionDetailsOpen()) return;
    if (!hasPredictionListOpen()) return;

    const now = Date.now();
    if (now - T.runtime.lastDetailsAttemptAt < 1500) return;

    const listButton = document.querySelector(".predictions-list-item")?.closest("button");
    if (!listButton) return;

    T.runtime.lastDetailsAttemptAt = now;
    T.click(listButton);
    T.log("Opened prediction details view.", "info");
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
      T.click(closeBtn);
      if (!silent) {
        T.logChanged("closePanel", "Closed reward center panel.", "info");
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
        // Total points is always the first stat in each outcome section.
        // Match any "Total ..." SVG label to support custom point names
        // (e.g. "Total Pebbles", "Total Channel Points").
        const svg = section.querySelector('svg[aria-label^="Total"]');
        const span = svg
          ?.closest('[data-test-selector="prediction-summary-stat__content"]')
          ?.querySelector("span");
        if (!span) return Number.NaN;
        return T.parsePoints(span.textContent);
      });

    while (values.length < 2) values.push(Number.NaN);
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
        return match ? parseFloat(match[1]) : Number.NaN;
      });

    while (values.length < 2) values.push(Number.NaN);
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
      ?.textContent?.trim();
    // Cache the title so DOM transitions (detail view closing/reopening)
    // don't produce a mismatched key between evaluate and watchAndExecute.
    if (title) {
      T.runtime._lastPredTitle = title;
    }
    const resolvedTitle = title || T.runtime._lastPredTitle || "prediction";
    const o0 = state?.outcomes?.[0]?.title || "A";
    const o1 = state?.outcomes?.[1]?.title || "B";
    return `${resolvedTitle}::${o0}::${o1}`;
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
    const status = T.parseStatusText(subtitleText);
    const secondsLeft = T.parseTimerText(subtitleText);

    const listBars = listItem?.querySelectorAll(".predictions-list-item__outcomes--bar") ?? [];
    const listPcts = Array.from(listBars).map((el) => {
      const parsed = parseFloat(el.style.width);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    });
    const detailPcts = readDetailPercents();
    const pickPercent = (a, b) => {
      if (Number.isFinite(a)) return a;
      if (Number.isFinite(b)) return b;
      return 50;
    };
    const pct0 = pickPercent(listPcts[0], detailPcts[0]);
    const pct1 = pickPercent(listPcts[1], detailPcts[1]);

    const poolEl = listItem?.querySelector(
      '[data-test-selector="predictions-list-item__total-points"]'
    );
    let totalPool = T.parsePoints(poolEl?.textContent);

    const detailPts = readDetailPoints();
    if (!totalPool) totalPool = detailPts[0] + detailPts[1];

    const pickPoints = (points, percent) => {
      if (Number.isFinite(points)) return points;
      return Math.round((totalPool * percent) / 100);
    };
    const pts0 = pickPoints(detailPts[0], pct0);
    const pts1 = pickPoints(detailPts[1], pct1);

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

  T.isRegionRestricted = isRegionRestricted;
  T.readAvailablePoints = readAvailablePoints;
  T.hasPredictionDetailsOpen = hasPredictionDetailsOpen;
  T.hasPredictionListOpen = hasPredictionListOpen;
  T.findChannelPointsButton = findChannelPointsButton;
  T.ensurePredictionUiOpen = ensurePredictionUiOpen;
  T.ensurePredictionDetailsOpen = ensurePredictionDetailsOpen;
  T.hasAlreadyVoted = hasAlreadyVoted;
  T.closeRewardCenterPanel = closeRewardCenterPanel;
  T.readDetailPoints = readDetailPoints;
  T.readDetailPercents = readDetailPercents;
  T.readOutcomeTitles = readOutcomeTitles;
  T.getPredictionButtons = getPredictionButtons;
  T.makePredictionKey = makePredictionKey;
  T.readPredictionState = readPredictionState;
})();
