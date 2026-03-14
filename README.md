# Twitch Prediction Auto-Bet (Underdog)

Tampermonkey userscript for Twitch Predictions with a native-feeling top-nav control panel.

It monitors prediction odds, keeps a pending decision updated, and can auto-place a bet near close (T-5 seconds) using an underdog strategy with hard safety caps.

## What It Does

- Injects a top-nav control panel (toggle, live status, logs, manual bet buttons).
- Detects prediction availability from Twitch Channel Points UI.
- Optionally auto-opens the Channel Points popover and prediction details.
- Re-evaluates odds continuously during active predictions.
- Places one auto-bet at T-5s using the latest decision.
- Skips when region-restricted, already voted, or data is not reliable.

## Files

- `twitch-predictions.user.js`: main installable userscript.
- `algorithm.js`: standalone algorithm helpers and tests.
- `plan.md`: implementation notes and selector strategy.

## Quick Install (Tampermonkey)

1. Install Tampermonkey in your browser.
2. Open Tampermonkey dashboard.
3. Create a new script.
4. Replace the default template with contents of `twitch-predictions.user.js`.
5. Save and enable.
6. Open any Twitch channel page: `https://www.twitch.tv/<channel>`.

## Control Panel Settings

- Enable Auto-Bet: master automation switch.
- Dry Run: logs intended action without placing clicks.
- Auto Open Channel Points: opens wallet/popover when needed.
- Auto Open Prediction Details: opens the prediction detail view.
- Discovery Probe (ms): how often to check for new predictions while idle.
- Manual Amount: value used by Predict A / Predict B manual buttons.

Notes:

- Discovery Probe is clamped to 5000-300000 ms.
- Settings persist via `localStorage` key `tpred.settings.v1`.

## Strategy (Underdog)

- Chooses the lower pooled outcome.
- Recomputes every 5000 ms while active.
- Executes once when timer is <= 5 seconds.
- Tiered size by favorite:underdog ratio:

| Ratio (favorite:underdog) | Bet |
| --- | ---: |
| >= 100 | 500 |
| >= 20 | 400 |
| >= 10 | 300 |
| >= 5 | 200 |
| >= 2 | 100 |
| < 2 | Skip |

Safety caps:

- Hard max: 1000 points.
- Soft wallet cap: max 50% of currently available points.
- If available points read as 0, skip.

## Runtime Flow

1. Observer + periodic probe discover prediction UI changes.
2. Script opens required UI path when auto-open toggles are enabled.
3. Evaluation loop updates `pendingDecision`.
4. Watch loop checks timer and fires once at trigger window.
5. Script records the prediction key to avoid duplicate placement.

## Selector Approach

The script prioritizes stable markers first:

- `data-test-selector` attributes.
- Semantic icon classes (for channel points and prediction buttons).
- ARIA labels and nearby text fallback.

Important selectors used:

- Balance: `[data-test-selector="copo-balance-string"] span`
- List card: `.predictions-list-item`
- Reward center root: `#channel-points-reward-center-body`
- Region restriction message:
  `[data-test-selector="prediction-checkout-active-footer__region-restriction-message"]`
- Already-voted marker:
  `[data-test-selector="user-prediction-string__outcome-title"]`

## Debugging

- Open browser DevTools Console.
- Filter logs by: `[TwitchPred]`

You should see:

- discovery events
- odds/timer updates
- pending decision updates
- auto/manual bet attempts and outcomes

## Known Limitations

- Twitch UI is dynamic and can change without notice.
- Confirm/custom-amount controls can vary by layout and render timing.
- Fallback click path may place a fixed quick amount when custom controls are missing.

## Safety and Behavior Guarantees

- One auto-placement max per prediction key.
- No spam retries after a failed placement path.
- Skip behavior for locked/resolved/canceled states.
- Skip when odds data is incomplete (e.g., one side is 0).

## Legal and Risk Notice

This script is unofficial and not affiliated with Twitch. Use at your own risk. Automated interactions may violate platform expectations or terms in some contexts.
