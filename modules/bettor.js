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
      if (btn.disabled || btn.getAttribute("aria-disabled") === "true") continue;
      if (txt.includes("custom amount") || txt.includes("predict with custom")) continue;
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

  async function waitForCustomBetControls() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const input = findCustomAmountInput();
      const confirmButton = findConfirmButton();
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
      const { blueButton, pinkButton } = T.getPredictionButtons();
      const targetButton = outcomeId === "0" ? blueButton : pinkButton;
      if (!targetButton) {
        T.log("Outcome button not found for", outcomeId);
        return false;
      }

      if (!click(targetButton)) {
        T.log("Failed to click outcome button.");
        return false;
      }

      await T.sleep(120);

      const customToggle = document.querySelector(
        '[data-test-selector="prediction-checkout-active-footer__input-type-toggle"]'
      );
      if (customToggle) {
        click(customToggle);
        T.log(`Opened custom amount entry for ${amount} (${sourceLabel}).`);
      }

      const { input, confirmButton } = await waitForCustomBetControls();

      if (input && confirmButton) {
        setNativeInputValue(input, amount);
        if (T.parsePoints(input.value) !== amount) {
          await T.sleep(60);
          setNativeInputValue(input, amount);
        }
        await T.sleep(60);
        click(confirmButton);
        T.log(`Predicted ${amount} via ${sourceLabel} using custom amount.`);
        return true;
      }

      if (sourceLabel === "manual") {
        T.log(
          `Manual bet cancelled: could not open custom amount input for ${amount}. No default quick-bet was placed.`
        );
        return false;
      }

      if (amount >= 10) {
        T.log(
          `Custom amount UI did not appear in time; Twitch likely fell back to quick bet. Intended amount: ${amount}.`
        );
        return true;
      }

      T.log("Unable to place bet: missing custom controls and target amount < fixed minimum.");
      return false;
    } finally {
      T.runtime.betInFlight = false;
    }
  }

  async function manualBet(outcomeId, amount) {
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
  T.waitForCustomBetControls = waitForCustomBetControls;
  T.executeBet = executeBet;
  T.manualBet = manualBet;
  T.placeBet = placeBet;
})();
