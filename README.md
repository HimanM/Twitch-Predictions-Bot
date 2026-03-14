<div align="center">
  <img src="pics/UNDERDOG_TW_PRED_ICON.png" width="96" alt="Twitch Prediction Bot Icon" />
  <h1>Twitch Prediction Auto-Bet (Underdog)</h1>
  <p>A Tampermonkey userscript that monitors Twitch Predictions, tracks live odds, and auto-bets on the underdog at T-5 seconds - with a native-feeling top-nav control panel, live logs, and dry-run mode.</p>
  <img src="https://img.shields.io/badge/Tampermonkey-Compatible-brightgreen?logo=tampermonkey" alt="Tampermonkey" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT License" />
  <img src="https://img.shields.io/badge/Platform-Twitch-9146ff?logo=twitch" alt="Twitch" />
</div>

---

## Preview

![Twitch Prediction Bot Control Panel](pics/PREDICTION_MENU.png)

---

## Features

| Feature | Description |
| --- | --- |
| **Auto-Bet** | Automatically places a bet at T-5 seconds using the best evaluated decision |
| **Underdog Strategy** | Always bets on the lower-pooled side with tiered sizing |
| **Discovery Probe** | Periodically checks for new predictions without leaving the panel open |
| **Top-Nav Panel** | Injected Twitch-style panel with status, logs, and manual controls |
| **Dry Run Mode** | Simulates all actions in the log without placing any real clicks |
| **Persistent Settings** | All toggles and values saved across sessions via `localStorage` |
| **Region Safety** | Skips automatically when region restrictions are detected |
| **Duplicate Guard** | Places at most one bet per detected prediction key |

---

## Installation (Tampermonkey)

### One-Click Install

[![Install on Tampermonkey](https://img.shields.io/badge/Install-Tampermonkey-brightgreen?logo=tampermonkey)](https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/main/twitch-predictions.user.js)

Direct install link:

`https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/main/twitch-predictions.user.js`

If Tampermonkey is installed, opening this link should immediately show the install prompt.

### Manual Install

### Step 1 - Install Tampermonkey

Install the Tampermonkey browser extension:

- **Chrome / Edge / Brave:** [Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)

### Step 2 - Create the Script

1. Click the **Tampermonkey icon** in your toolbar.
2. Select **Create a new script**.
3. Delete all default template content in the editor.

### Step 3 - Paste the Script

1. Open `twitch-predictions.user.js` from this repository.
2. Copy the entire file contents.
3. Paste into the Tampermonkey editor.

### Step 4 - Save and Enable

1. Press **Ctrl+S** (or Cmd+S on Mac) to save.
2. Confirm the script appears in your **Tampermonkey Dashboard** with the toggle set to **Enabled**.

### Step 5 - Use It

1. Navigate to any Twitch channel (`https://www.twitch.tv/<channel>`).
2. Look for the **prediction bot icon** added to the top navigation bar.
3. Click the icon to open the control panel.

> **Tip:** Enable **Dry Run** on first use to verify detection without placing any bets.

---

## Control Panel Settings

| Setting | Default | Description |
| --- | --- | --- |
| **Enable Auto-Bet** | On | Master switch for automated betting |
| **Dry Run** | Off | Simulates all actions in logs, no real clicks |
| **Auto Open Channel Points** | On | Opens the Channel Points popover automatically |
| **Auto Open Prediction Details** | On | Clicks into the prediction detail view automatically |
| **Discovery Probe (ms)** | 20000 | Interval to check for new predictions while idle. Min 5000, max 300000 |
| **Manual Amount** | 100 | Point amount used by the Predict A / Predict B buttons |

All settings are saved to `localStorage` key `tpred.settings.v1` and persist across browser sessions.

---

## Algorithm Explained

### Core Idea

The strategy exploits an asymmetry in Twitch's pari-mutuel (pool-based) system: when one side has a significantly larger pool than the other, betting on the underdog (smaller pool) returns a higher multiplier if it wins. This script waits until the last few seconds before the prediction closes - when pools are close to final - to get a stable read on the odds before committing.

### Step 1 - Detect and Read

Every 5 seconds while a prediction is open, the script reads from the Twitch DOM:

- The total points pooled on each outcome.
- The timer (seconds remaining).
- Your available channel points balance.
- Whether a region restriction is active.

### Step 2 - Calculate the Underdog

```
ratio = favorite.totalPoints / underdog.totalPoints
```

The side with the smaller pool is the **underdog**. A ratio of 5 means the favorite has 5× more points, so underdog bettors share a larger prize pool if they win.

### Step 3 - Tier-Based Bet Sizing

The script bets more aggressively when the underdog is a bigger longshot:

| Ratio (favorite : underdog) | Bet Amount |
| --- | ---: |
| 100 : 1 or more | 500 pts |
| 20 : 1 or more | 400 pts |
| 10 : 1 or more | 300 pts |
| 5 : 1 or more | 200 pts |
| 2 : 1 or more | 100 pts |
| Less than 2 : 1 | **Skip** (near 50/50) |

Near 50/50 outcomes are skipped - the payout multiplier is too low to justify the risk.

### Step 4 - Safety Caps

Before placing, the calculated amount is clamped:

```
final amount = min(tier amount, 1000, 50% of available points)
```

- **Hard cap:** Never bets more than 1000 points regardless of tier.
- **Wallet cap:** Never bets more than 50% of your current balance.
- **Zero guard:** If available points read as 0 (region restriction or wallet empty), skip entirely.

### Step 5 - Execute at T-5 Seconds

A fast watch loop (every 250ms) fires the placement once the timer drops to 5 seconds or below. The decision was already computed ahead of time - the last-second task is just clicking. After placing, the prediction key is recorded to prevent any duplicate bet on the same prediction.

---

## Runtime Flow

```
Script starts
   │
   ├── MutationObserver (watches DOM for prediction UI)
   │
   └── Discovery Probe (every N ms while idle)
         │
         ├── Open Channel Points popover (if needed)
         ├── Read list card → parse status
         │
         ├── Status: ACTIVE
         │     ├── Evaluation loop (every 5000ms)
         │     │     └── readPredictionState() → decideBet() → pendingDecision
         │     └── Watch loop (every 250ms)
         │           └── secondsLeft <= 5 → placeBet(pendingDecision)
         │                 └── Record prediction key → clear loops
         │
         └── Status: not ACTIVE
               └── Close popover → return to idle
```

---

## Debugging

1. Open browser **DevTools** (`F12`).
2. Go to the **Console** tab.
3. Filter by: `[TwitchPred]`

You will see timestamped entries for:

- Discovery probe events (open, status read, close)
- Odds and timer updates every 5 seconds
- Pending decision changes (which side, how much)
- Bet placement attempts - success, dry-run, or failure reason

All log lines are also visible live in the **Logs** section of the in-page control panel.

---

## Repository Files

| File | Description |
| --- | --- |
| `twitch-predictions.user.js` | Main installable Tampermonkey userscript |
| `algorithm.js` | Standalone algorithm helpers and Node-runnable tests |
| `plan.md` | Implementation notes, selector strategy, architecture |
| `pics/` | Screenshots and icon assets |

---

## Known Limitations

- Twitch's UI is dynamically generated and can change without notice. If the script stops detecting predictions, class names or DOM structure may have shifted.
- The custom amount + confirm button path is heuristic-based; in some layouts it may fall back to a fixed quick-bet amount.
- The script cannot intercept Twitch's internal WebSocket; all reads are DOM-based.

---

## Safety and Behavior Guarantees

- Bets once per prediction - duplicate placements are blocked by key tracking.
- No repeated retries after a failed placement attempt.
- Automatically skips locked, resolved, or canceled predictions.
- Does not bet when pool data is incomplete or one side reads as zero.

---

## Legal and Risk Notice

This script is unofficial and not affiliated with Twitch Interactive, Inc. Use at your own risk. Channel Points have no real monetary value. Automated interactions with platform UIs may be subject to platform terms of service.
