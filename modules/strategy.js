/**
 * strategy.js — Betting decision logic: underdog tier selection and skip override.
 * Depends on: config.js (CONFIG, getAutoMinBet, getAutoMaxBet, settings)
 */
(function () {
  "use strict";

  const T = window.TPRED;

  function getStrategyMode() {
    return T.settings.strategyMode === "dynamic" ? "dynamic" : "fixed";
  }

  function getFixedTierBaseBet(tier, autoMinBet, autoMaxBet) {
    const tierBet = Number(tier?.bet);
    const fallback = autoMinBet;
    if (Number.isNaN(tierBet)) return fallback;
    return Math.max(autoMinBet, Math.min(autoMaxBet, Math.round(tierBet)));
  }

  function getDynamicTierBaseBet(ratio, autoMinBet, autoMaxBet) {
    const tiers = T.CONFIG.TIERS;
    if (!Array.isArray(tiers) || tiers.length === 0) return autoMinBet;

    const lowestTier = tiers[tiers.length - 1];
    const highestTier = tiers[0];
    const minRatio = Math.max(1, lowestTier.minRatio);
    const maxRatio = Math.max(minRatio, highestTier.minRatio);
    const clampedRatio = Math.max(minRatio, Math.min(ratio, maxRatio));

    if (autoMaxBet <= autoMinBet) return autoMinBet;

    const minLog = Math.log(minRatio);
    const maxLog = Math.log(maxRatio);
    const ratioLog = Math.log(clampedRatio);
    const normalized = maxLog === minLog ? 1 : (ratioLog - minLog) / (maxLog - minLog);

    const scaled = autoMinBet + normalized * (autoMaxBet - autoMinBet);
    return Math.max(autoMinBet, Math.min(autoMaxBet, Math.round(scaled)));
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
    const tier = T.CONFIG.TIERS.find((t) => ratio >= t.minRatio);

    if (!tier) {
      return NO_BET(
        `Near 50/50 (ratio ${ratio.toFixed(2)}, underdog ${(underdogShare * 100).toFixed(1)}%)`
      );
    }

    const autoMinBet = T.getAutoMinBet();
    const autoMaxBet = T.getAutoMaxBet();
    const strategyMode = getStrategyMode();
    const tierBaseBet = strategyMode === "dynamic"
      ? getDynamicTierBaseBet(ratio, autoMinBet, autoMaxBet)
      : getFixedTierBaseBet(tier, autoMinBet, autoMaxBet);

    let amount = Math.min(tierBaseBet, autoMaxBet, state.myAvailablePoints);
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
      reason: `Underdog ${underdog.title}, mode ${strategyMode}, ratio ${ratio.toFixed(1)}:1, tier ${tier.minRatio}+, base ${tierBaseBet}, amount ${amount}`,
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
