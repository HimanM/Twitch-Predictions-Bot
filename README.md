# Twitch Prediction Auto-Bet Userscript

This project includes a Tampermonkey userscript that:

- Opens the Channel Points popover automatically
- Clicks the prediction list card to open prediction details automatically
- Detects Twitch predictions in the channel points/reward center UI
- Re-evaluates odds every 5 seconds while prediction is active
- Stores a global pending decision
- Places a bet at T-5 seconds using the latest decision
- Skips betting when region restrictions are detected

## Files

- `algorithm.js`: algorithm and DOM reader helpers
- `twitch-predictions.user.js`: installable Tampermonkey userscript
- `plan.md`: implementation notes and selector mapping

## Strategy Summary

- Bet on the **underdog** (lower points side)
- Recompute every 5 seconds while timer > 5s
- Execute once when timer <= 5s
- Tiered amount based on favorite:underdog ratio
- Never exceed:
  - 1000 points hard cap
  - 50% of available channel points

Tier table:

- ratio >= 100: 500 points
- ratio >= 20: 400 points
- ratio >= 10: 300 points
- ratio >= 5: 200 points
- ratio >= 2: 100 points
- ratio < 2: skip

## Install On Tampermonkey

1. Install Tampermonkey extension in your browser.
2. Open Tampermonkey dashboard.
3. Click `Create a new script...`.
4. Remove default template content.
5. Copy full content from `twitch-predictions.user.js` and paste.
6. Save the script (Ctrl+S).
7. Ensure script is enabled.
8. Open a Twitch channel page (`https://www.twitch.tv/<channel>`).

## How It Works At Runtime

1. A `MutationObserver` watches for UI changes on Twitch.
2. Script ensures navigation path automatically:
   - Click Channel Points button (wallet icon)
   - Click prediction list item card
   - Open prediction details view
3. Two timers run:
   - Evaluation loop every 5000ms updates `pendingDecision`
   - Watch loop every 250ms checks timer for T-5 execution
4. At T-5 seconds:
   - Script uses latest pending decision
   - Selects blue/pink outcome button
   - Attempts custom amount path:
     - click `Predict with Custom Amount`
     - fill numeric input
     - click confirm/predict button
   - Falls back to fixed quick-button path when custom controls are unavailable

## Key Selectors

- Channel Points balance: `[data-test-selector="copo-balance-string"] span`
- Prediction list card: `.predictions-list-item`
- Prediction detail root: `#channel-points-reward-center-body`
- Active timer text: `.prediction-checkout-details-header p:nth-of-type(2)`
- Outcome buttons:
  - `.spectator-prediction-button--blue` or `.fixedPredictionButton--jEmiF.blue--z7K6N`
  - `.spectator-prediction-button--pink` or `.fixedPredictionButton--jEmiF.pink--TRx6x`
- Region block message:
  - `[data-test-selector="prediction-checkout-active-footer__region-restriction-message"]`
- Already voted marker:
  - `[data-test-selector="user-prediction-string__outcome-title"]`

## Region Restriction Handling

If Twitch shows:

- `[data-test-selector="prediction-checkout-active-footer__region-restriction-message"]`

the script treats available points as 0 and skips betting.

## Debugging

Open browser devtools console and filter for:

- `[TwitchPred]`

You can see decision updates, trigger timing, and placement logs.

## Notes / Limitations

- Twitch UI is dynamic; class hashes change frequently.
- Script intentionally prefers stable selectors (`data-test-selector`, aria-labels, semantic class fragments).
- In some active layouts, custom amount + confirm controls may not render immediately; script includes a quick-button fallback.

## Safety

- Script places at most one bet per detected prediction key.
- Script does not retry repeatedly after failed placement.
- Script skips if odds data is incomplete or zero on one side.
