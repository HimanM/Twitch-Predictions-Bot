/**
 * strategy.js — Betting decision logic: underdog tier selection and skip override.
 * Depends on: config.js (CONFIG, getAutoMinBet, getAutoMaxBet, settings)
 */
(function () {
  "use strict";

  const T = window.TPRED;

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
    const tier = T.CONFIG.TIERS.find((t) => ratio >= t.minRatio);

    if (!tier) {
      return NO_BET(
        `Near 50/50 (ratio ${ratio.toFixed(2)}, underdog ${(underdogShare * 100).toFixed(1)}%)`
      );
    }

    const autoMinBet = T.getAutoMinBet();
    const autoMaxBet = T.getAutoMaxBet();

    let amount = Math.min(tier.bet, autoMaxBet, state.myAvailablePoints);
    amount = Math.min(amount, Math.floor(state.myAvailablePoints * 0.5));

    if (amount < autoMinBet) {
      return NO_BET(`Computed amount ${amount} is below Auto Min Bet ${autoMinBet}.`);
    }

    if (amount <= 0) return NO_BET("Calculated amount <= 0");

    return {
      shouldBet: true,
      outcomeId: underdog.id,
      outcomeTitle: underdog.title,
      amount,
      reason: `Underdog ${underdog.title}, ratio ${ratio.toFixed(1)}:1, amount ${amount}`,
    };
  }

  function applyForceMinBetIfEnabled(state, decision) {
    if (!T.settings.forceMinOnSkip) return decision;
    if (!state || decision?.shouldBet) return decision;
    if (state.status !== "ACTIVE") return decision;
    if (!Array.isArray(state.outcomes) || state.outcomes.length < 2) return decision;

    const [a, b] = state.outcomes;
    if (!a || !b) return decision;
    if (a.totalPoints <= 0 || b.totalPoints <= 0) return decision;
    if (state.myAvailablePoints <= 0) return decision;

    const underdog = a.totalPoints <= b.totalPoints ? a : b;
    const minBet = T.getAutoMinBet();
    const maxBet = T.getAutoMaxBet();
    let amount = Math.min(minBet, maxBet, state.myAvailablePoints);
    amount = Math.min(amount, Math.floor(state.myAvailablePoints * 0.5));

    if (amount <= 0) return decision;

    return {
      shouldBet: true,
      outcomeId: underdog.id,
      outcomeTitle: underdog.title,
      amount,
      reason: `Disable Skip enabled: betting Auto Min ${amount} on ${underdog.title}`,
    };
  }

  T.decideBet = decideBet;
  T.applyForceMinBetIfEnabled = applyForceMinBetIfEnabled;
})();
