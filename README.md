<div align="center">
  <img src="pics/UNDERDOG_TW_PRED_ICON.png" width="96" alt="Twitch Prediction Bot Icon" />
  <h1>Twitch Prediction Auto-Bet (Underdog)</h1>
  <p>
    A modular Tampermonkey userscript that monitors Twitch Predictions,
    evaluates live underdog odds, and places bets near close with a configurable
    in-page control panel.
  </p>
  <img src="https://img.shields.io/badge/Tampermonkey-Compatible-brightgreen?logo=tampermonkey" alt="Tampermonkey" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT License" />
  <img src="https://img.shields.io/badge/Platform-Twitch-9146ff?logo=twitch" alt="Twitch" />
</div>

---

## Preview

![Twitch Prediction Bot Control Panel](pics/PREDICTION_MENU.png)

---

## Current Version Notes (v1.1)

- Modular architecture via `@require` modules (no monolithic main logic file).
- Auto trigger runs at T-7 seconds by default.
- Custom amount path is attempted first for both manual and auto placement.
- Quick outcome fallback is available if custom controls are unavailable.
- Split panel UI with toggleable logs pane and persistent UI settings.

---

## Features

| Feature | Description |
| --- | --- |
| **Auto-Bet** | Places a bet near close using latest evaluated decision |
| **Underdog Strategy** | Bets the lower-pooled side using ratio tiers |
| **Custom Min/Max Limits** | `Auto Min Bet` and `Auto Max Bet` bound bet sizing |
| **Disable Skip Mode** | Forces Auto Min on low-edge spots instead of skipping |
| **Discovery Probe** | Periodically checks for new predictions while idle |
| **Top-Nav Panel** | Injected Twitch-style panel with status, controls, and logs |
| **Toggleable Logs Pane** | Show/hide logs to reduce UI noise |
| **Dry Run Mode** | Simulates actions without placing real clicks |
| **Persistent Settings** | Saved in `localStorage` (`tpred.settings.v1`) |
| **Duplicate Guard** | At most one auto placement per prediction key |

---

## Installation (Tampermonkey)

### One-Click Install

[![Install on Tampermonkey](https://img.shields.io/badge/Install-Tampermonkey-brightgreen?logo=tampermonkey)](https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/twitch-predictions.user.js)

Direct install URL:

`https://raw.githubusercontent.com/HimanM/Twitch-Predictions-Bot/master/twitch-predictions.user.js`

Fallback raw URL:

`https://github.com/HimanM/Twitch-Predictions-Bot/blob/master/twitch-predictions.user.js?raw=1`

### Manual Install

1. Install Tampermonkey in your browser.
2. Create a new userscript.
3. Replace template content with `twitch-predictions.user.js` from this repo.
4. Save and enable.
5. Open Twitch and click the bot icon in top nav.

---

## Module Layout

Main file:

- `twitch-predictions.user.js` (bootstrap header + `@require` list + init)

Modules loaded in order:

1. `modules/config.js`
2. `modules/utils.js`
3. `modules/dom.js`
4. `modules/strategy.js`
5. `modules/bettor.js`
6. `modules/ui.js`
7. `modules/runner.js`

---

## Control Panel Settings

| Setting | Default | Description |
| --- | --- | --- |
| **Enable Auto-Bet** | On | Master on/off for automation |
| **Dry Run** | Off | Simulate actions only |
| **Disable Skip** | Off | Bet Auto Min when strategy would skip |
| **Auto Open Channel Points** | On | Auto-opens reward center |
| **Auto Open Prediction Details** | On | Auto-opens prediction detail view |
| **Discovery Probe (ms)** | 40000 | Idle probe interval (clamped 5000 to 300000) |
| **Active Eval (ms)** | 1000 | Active evaluation interval (clamped 1000 to 60000) |
| **Manual Amount** | 100 | Amount used by manual A/B buttons |
| **Auto Min Bet** | 1 | Lower bound for auto size validity |
| **Auto Max Bet** | 1000 | Upper bound for auto size cap |
| **Logs Visibility** | On | Show/hide logs pane in panel |

---

## Strategy and Bet Sizing

### 1. Pick Underdog

The side with fewer pooled points is treated as underdog.

`ratio = favoritePoints / underdogPoints`

### 2. Tier Base Amount

| Ratio (favorite : underdog) | Base Amount |
| --- | ---: |
| 100:1+ | 500 |
| 20:1+ | 400 |
| 10:1+ | 300 |
| 5:1+ | 200 |
| 2:1+ | 100 |
| <2:1 | skip |

### 3. Apply Bounds and Safety

`amount = min(tierBase, autoMaxBet, availablePoints, floor(availablePoints * 0.5))`

If `amount < autoMinBet`, strategy returns skip.

When **Disable Skip** is enabled, skip decisions can be converted to a forced min-sized bet (subject to max and wallet caps).

---

## Runtime Flow

1. Startup initializes UI and observer.
2. Idle mode runs discovery probe at configured interval.
3. On active prediction:
   - Active eval loop updates `pendingDecision`.
   - Watch loop tracks timer and fires near trigger (`<= 7s`).
4. Placement sequence:
   - Prefer custom mode toggle + per-outcome input + Vote.
   - If custom controls are missing, fallback can click quick outcome button.
5. Loops clear and return to discovery mode.

---

## Logs and Diagnostics

- Browser console prefix: `[TwitchPred]`
- In-panel logs show discovery, updates, decision changes, and placement outcomes.
- Manual placement emits first-failure cause diagnostics when a path cannot be resolved.

---

## Repository Files

| File | Description |
| --- | --- |
| `twitch-predictions.user.js` | Installable userscript bootstrap |
| `modules/` | Runtime modules (`config`, `utils`, `dom`, `strategy`, `bettor`, `ui`, `runner`) |
| `algorithm.js` | Standalone strategy helper and tests |
| `plan.md` | Planning and implementation notes |
| `pics/` | UI screenshots and icon assets |

---

## Known Limitations

- Twitch DOM can change without notice, which may break selectors.
- Custom controls are preferred, but Twitch can still render alternate layouts.
- All reads and actions are DOM-driven; no direct API integration.

---

## Legal Notice

This project is unofficial and not affiliated with Twitch Interactive, Inc.
Use at your own risk. Channel Points have no cash value.
Automated UI interaction may be subject to Twitch terms.
