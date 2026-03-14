/**
 * bettor.js — UI interaction layer: clicking outcome buttons, entering amounts, confirming bets.
 * Depends on: config.js, utils.js (sleep, parsePoints), dom.js (hasAlreadyVoted, getPredictionButtons,
 *             ensurePredictionUiOpen, ensurePredictionDetailsOpen, readPredictionState)
 * T.log / T.logChanged are supplied by runner.js and resolved at call-time.
 */
(function () {
  "use strict";

  const T = window.TPRED;

  function click(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return true;
  }

  function isVisible(el) {
    return Boolean(el && el.offsetParent !== null);
  }

  function getRewardCenterBody() {
    return document.querySelector("#channel-points-reward-center-body");
  }

  function getCustomModeToggleButton() {
    const body = getRewardCenterBody();
    if (!body) return null;
    return body.querySelector('[data-test-selector="prediction-checkout-active-footer__input-type-toggle"]');
  }

  function getQuickOutcomeButton(outcomeId) {
    const { blueButton, pinkButton } = T.getPredictionButtons();
    return outcomeId === "0" ? blueButton : pinkButton;
  }

  function findCustomAmountInput() {
    // Fallback helper used by legacy flow and diagnostics.
    const candidates = [
      '#channel-points-reward-center-body input[data-a-target="tw-input"][type="number"]',
      '#channel-points-reward-center-body .custom-prediction-button input[type="number"]',
      'input[data-a-target="tw-input"][type="number"]',
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

  function isQuickAmountButton(btn) {
    const txt = (btn.textContent || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!txt) return false;
    if (/^\d+([.,]\d+)?\s*[km]?$/i.test(txt)) return true;
    if (/^\d+\s*(point|points|channel points)$/i.test(txt)) return true;
    if (txt.includes("custom amount") || txt.includes("predict with custom")) return true;
    return false;
  }

  function findConfirmButton(input) {
    const buttons = Array.from(document.querySelectorAll("#channel-points-reward-center-body button"));
    const visibleButtons = buttons.filter((btn) => isVisible(btn));

    const rankedButtons = visibleButtons
      .filter((btn) => {
        const txt = (btn.textContent || "").trim().toLowerCase();
        if (!txt) return false;
        if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return false;
        if (isQuickAmountButton(btn)) return false;
        return txt.includes("place") || txt.includes("confirm") || txt.includes("submit") || txt.includes("predict");
      })
      .map((btn) => {
        const txt = (btn.textContent || "").trim().toLowerCase();
        const relationScore = input && (input.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) ? 0 : 100;
        const verbScore = txt.includes("place") || txt.includes("confirm") || txt.includes("submit") ? 0 : 10;
        return { btn, score: relationScore + verbScore };
      })
      .sort((a, b) => a.score - b.score);

    if (rankedButtons.length > 0) {
      return rankedButtons[0].btn;
    }

    for (const btn of buttons) {
      const txt = (btn.textContent || "").trim().toLowerCase();
      if (!txt) continue;
      if (btn.disabled || btn.getAttribute("aria-disabled") === "true") continue;
      if (isQuickAmountButton(btn)) continue;
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

  function getCustomOutcomeControls() {
    const body = getRewardCenterBody();
    if (!body) return [];

    const wrappers = Array.from(
      body.querySelectorAll(
        '.custom-prediction-button, [class*="custom-prediction-button"]'
      )
    ).filter(isVisible);

    const controls = wrappers
      .map((wrapper) => {
        const input = wrapper.querySelector('input[data-a-target="tw-input"][type="number"], input[type="number"]');
        const voteButton = wrapper.querySelector("button");
        if (!input || !voteButton || !isVisible(input) || !isVisible(voteButton)) return null;

        const voteText = (voteButton.textContent || "").toLowerCase();
        if (!voteText.includes("vote")) return null;

        return { input, voteButton };
      })
      .filter(Boolean);

    return controls;
  }

  async function ensureCustomModeAndGetControls() {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const controls = getCustomOutcomeControls();
      if (controls.length >= 2) {
        return controls;
      }

      const customToggle = getCustomModeToggleButton();
      if (customToggle && isVisible(customToggle) && (attempt === 0 || attempt % 3 === 0)) {
        click(customToggle);
        if (attempt === 0) {
          T.log("Opened custom amount mode.");
        }
      }

      await T.sleep(120);
    }

    return [];
  }

  function diagnoseCustomControlFailure(outcomeId) {
    const body = getRewardCenterBody();
    const toggle = getCustomModeToggleButton();
    const controls = getCustomOutcomeControls();
    const outcomeIndex = outcomeId === "0" ? 0 : 1;
    const target = controls[outcomeIndex] ?? null;
    const quickButton = getQuickOutcomeButton(outcomeId);

    return {
      bodyFound: Boolean(body),
      toggleFound: Boolean(toggle),
      toggleVisible: isVisible(toggle),
      controlsCount: controls.length,
      targetFound: Boolean(target),
      quickFound: Boolean(quickButton),
      quickVisible: isVisible(quickButton),
    };
  }

  function formatFailureCause(cause) {
    return [
      `body=${cause.bodyFound ? "yes" : "no"}`,
      `toggle=${cause.toggleFound ? "yes" : "no"}`,
      `toggleVisible=${cause.toggleVisible ? "yes" : "no"}`,
      `customControls=${cause.controlsCount}`,
      `targetControl=${cause.targetFound ? "yes" : "no"}`,
      `quickButton=${cause.quickFound ? "yes" : "no"}`,
      `quickVisible=${cause.quickVisible ? "yes" : "no"}`,
    ].join(", ");
  }

  function logFirstManualFailure(causeText) {
    if (T.runtime.manualFailureLogged) return;
    T.runtime.manualFailureLogged = true;
    T.log(`Manual placement failed (first report): ${causeText}`);
  }

  async function waitForCustomBetControls() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const input = findCustomAmountInput();
      const confirmButton = findConfirmButton(input);
      if (input && confirmButton) {
        return { input, confirmButton };
      }

      if (attempt === 2 || attempt === 5) {
        const customToggle = document.querySelector(
          '[data-test-selector="prediction-checkout-active-footer__input-type-toggle"]'
        );
        if (customToggle) click(customToggle);
      }

      await T.sleep(150);
    }

    return { input: null, confirmButton: null };
  }

  async function executeBet(outcomeId, amount, sourceLabel) {
    if (T.runtime.betInFlight) {
      T.log("Bet action already in progress; skipping duplicate trigger.");
      return false;
    }

    if (T.hasAlreadyVoted()) {
      T.log("Already voted on this prediction; skipping.");
      return false;
    }

    if (T.settings.dryRun) {
      T.log(`Dry-run: would place ${amount} on outcome ${outcomeId} (${sourceLabel}).`);
      return true;
    }

    T.runtime.betInFlight = true;

    try {
      const controls = await ensureCustomModeAndGetControls();
      const outcomeIndex = outcomeId === "0" ? 0 : 1;
      const target = controls[outcomeIndex] ?? null;

      if (target?.input && target?.voteButton) {
        const { input, voteButton } = target;
        input.focus();
        setNativeInputValue(input, amount);
        if (T.parsePoints(input.value) !== amount) {
          await T.sleep(60);
          setNativeInputValue(input, amount);
        }
        input.dispatchEvent(new Event("blur", { bubbles: true }));
        await T.sleep(80);
        click(voteButton);
        T.log(`Predicted ${amount} via ${sourceLabel} using custom amount.`);
        if (sourceLabel === "manual") {
          T.runtime.manualFailureLogged = false;
        }
        return true;
      }

      const cause = diagnoseCustomControlFailure(outcomeId);
      const causeText = formatFailureCause(cause);

      if (sourceLabel === "manual") {
        logFirstManualFailure(causeText);
      } else {
        T.log(`Custom placement unavailable for ${amount} on outcome ${outcomeId}: ${causeText}`);
      }

      const quickButton = getQuickOutcomeButton(outcomeId);
      if (quickButton && isVisible(quickButton)) {
        click(quickButton);
        T.log(
          `Fallback used: clicked quick outcome button for ${sourceLabel} on outcome ${outcomeId}. Intended amount=${amount}.`
        );
        return true;
      }

      T.log(`Unable to place ${amount}: custom path failed and fallback button was unavailable.`);
      return false;
    } finally {
      T.runtime.betInFlight = false;
    }
  }

  async function manualBet(outcomeId, amount) {
    T.runtime.manualFailureLogged = false;
    T.ensurePredictionUiOpen();
    T.ensurePredictionDetailsOpen();
    const st = T.runtime.latestState || T.readPredictionState();
    if (!st) {
      T.log("Manual bet aborted: prediction state not detected.");
      return;
    }
    const title = st.outcomes[outcomeId === "0" ? 0 : 1]?.title ?? outcomeId;
    T.log(`Manual bet requested: ${amount} on ${title}.`);
    await executeBet(outcomeId, amount, "manual");
  }

  async function placeBet(decision) {
    if (!decision?.shouldBet) {
      T.log("No bet decision; skipping.");
      return false;
    }
    T.log(`Auto bet trigger: ${decision.outcomeTitle}, amount ${decision.amount}.`);
    return executeBet(decision.outcomeId, decision.amount, "auto");
  }

  T.click = click;
  T.findCustomAmountInput = findCustomAmountInput;
  T.findConfirmButton = findConfirmButton;
  T.setNativeInputValue = setNativeInputValue;
  T.getCustomOutcomeControls = getCustomOutcomeControls;
  T.ensureCustomModeAndGetControls = ensureCustomModeAndGetControls;
  T.waitForCustomBetControls = waitForCustomBetControls;
  T.executeBet = executeBet;
  T.manualBet = manualBet;
  T.placeBet = placeBet;
})();
