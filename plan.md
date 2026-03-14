# Twitch Predictions Auto-Bet — Tampermonkey Script Plan

## Goal

Automatically place a channel-points bet 5 seconds before a Twitch Prediction closes,
using the underdog-betting algorithm defined in `algorithm.js`.

---

## Betting Strategy (Summary)

| Situation | Action |
|---|---|
| Region blocked (0 pts available) | Skip entirely |
| Prediction not active | Do nothing |
| More than 5 seconds left | Poll every 5 s, re-run algo, update pending decision |
| Near 50/50 odds (ratio < 2:1) | Skip — low payout, not worth the risk |
| Moderate underdog (2:1 – 5:1) | Bet **100 pts** |
| Strong underdog (5:1 – 10:1) | Bet **200 pts** |
| Heavy underdog (10:1 – 20:1) | Bet **300 pts** |
| Very heavy underdog (20:1 – 100:1) | Bet **400 pts** |
| Extreme underdog (100:1+) | Bet **500 pts** |
| Hard cap | Never exceed **1 000 pts** per bet |
| Safety floor | Never bet more than **50 % of available points** |

The "bet size" is ultimately `min(tierAmount, 1000, availablePoints * 0.5)`.

---

## Architecture

```
userscript.js          ← Tampermonkey entry point (coordinates everything)
  ├── detector.js      ← Watches the Twitch DOM for a prediction UI appearing
  ├── reader.js        ← Reads prediction state (outcomes, timer, your balance)
  ├── timer.js         ← Polls / observes the countdown, fires at T-5s
  ├── bettor.js        ← Clicks the correct UI elements to place the bet
  └── algorithm.js     ← Pure decision logic (this file, already done ✓)
```

All modules will be inlined into a single Tampermonkey `// @require`-less file
for portability.

> **Key design principle:** The algorithm runs continuously throughout the prediction
> (every 5 seconds) and its latest output is stored in a global `pendingDecision`
> variable. At T−5 s the script simply reads that variable and fires the bet —
> it never makes a fresh decision at the last moment.

---

## Implementation Phases

### Phase 1 — Algorithm (DONE ✓)
- [x] `decideBet(state)` — returns `{ shouldBet, outcomeId, amount, reason }`
- [x] `summarizeOdds(state)` — human-readable odds snapshot
- [x] Self-test suite runnable with `node algorithm.js`

---

### Phase 2 — DOM Inspection *(list view, detail view, and active voting footer mapped)*

#### ✅ Channel Points Balance (selector solved)

The balance HTML looks like this:

```html
<div class="... channel-points-icon channel-points-icon--small">...SVG...</div>
<!-- sibling in the same outer container: -->
<span class="ScAnimatedNumber-...">6.6K</span>
```

Twitch uses CSS-in-JS so the hash-suffixed class names (e.g. `eynyeD`, `fHdBNk`,
`ScAnimatedNumber-sc-1iib0w9-0`) **change between builds** and cannot be used as
selectors. However, `channel-points-icon--small` is a hand-written BEM class and
is stable.

**Selector strategy:**

```js
// 1. Anchor on the stable BEM class
// 2. Walk up 2 levels to the shared outer container
// 3. Grab the first <span> sibling — that's the animated number
const pointsSpan = document
  .querySelector('.channel-points-icon--small')
  ?.parentElement   // color-wrapper div
  ?.parentElement   // outer container div
  ?.querySelector('span');

const rawText = pointsSpan?.textContent?.trim(); // e.g. "6.6K"
const availablePoints = parsePoints(rawText);    // → 6600
```

`parsePoints()` handles all Twitch abbreviated formats:

| Raw text | Parsed value |
|---|---|
| `"500"` | 500 |
| `"1,234"` | 1234 |
| `"6.6K"` | 6600 |
| `"1.2M"` | 1200000 |

This utility is already implemented in `algorithm.js`.

#### ✅ Prediction List Item (always visible in sidebar)

All selectors use `data-test-selector` attributes or BEM classes — both are stable
across Twitch builds (unlike the hash-suffixed CSS-in-JS class names).

| What | Selector | Notes |
|---|---|---|
| Prediction container | `.predictions-list-item` | One element per active prediction |
| Status / timer text | `[data-test-selector="predictions-list-item__subtitle"]` | e.g. "Prediction submissions closed" or countdown |
| Combined pool total | `[data-test-selector="predictions-list-item__total-points"]` | e.g. "22,150" → `parsePoints()` |
| Vote % bars | `.predictions-list-item__outcomes--bar` | `style.width` is the vote % for each outcome |

Timer text format is now confirmed from live HTML, e.g.
`"Submissions closing in 1:38"`. The `parseTimerText()` function handles this
because it extracts `mm:ss` anywhere in the text.

#### ✅ Prediction Detail Panel (visible when user clicks the widget)

| What | Selector | Notes |
|---|---|---|
| Detail panel root | `#channel-points-reward-center-body` | Stable `id` attribute |
| Outcome title | `[data-test-selector="prediction-summary-outcome__title"] p` | Two elements, order matches bar order |
| Per-outcome points | `svg[aria-label="Total Channel Points"]` → `.closest([data-test-selector="prediction-summary-stat__content"])` → `span` | Navigate via stable `aria-label` on SVG |
| Outcome vote % | `[data-test-selector="prediction-summary-outcome__bar"]` | `aria-label="99.9% of votes for yes :)"` — also used to parse outcome title |

#### ✅ Active Prediction Voting Footer (live mapped)

| What | Selector | Notes |
|---|---|---|
| Active footer root | `.hidBUB` container under `#channel-points-reward-center-body` | Class hash may vary, so do not anchor here |
| Blue outcome button | `.spectator-prediction-button--blue` → `.closest('button')` | Stable BEM class |
| Pink outcome button | `.spectator-prediction-button--pink` → `.closest('button')` | Stable BEM class |
| Region-blocked notice | `[data-test-selector="prediction-checkout-active-footer__region-restriction-message"]` | If present, treat available points as 0 |
| Active countdown text | `.prediction-checkout-details-header p:nth-of-type(2)` | Example: `Submissions closing in 1:38` |

#### ⏳ Still needed — Unblocked Betting Input/Confirm Controls

In your sample, Twitch shows a region restriction message and both action buttons
display `0`, so the real amount-input + confirm controls are not present.

Need one more HTML sample from a non-restricted prediction checkout containing:
- Amount input field selector
- Final confirm/place button selector

---

### Phase 3 — Reader Module *(DONE ✓)*

All reader functions are implemented in `algorithm.js`:

| Function | Purpose |
|---|---|
| `parsePoints(text)` | "6.6K" → 6600, "1,234" → 1234, "1.2M" → 1200000 |
| `readAvailablePoints()` | Reads your channel-point balance from the sidebar icon |
| `parseStatusText(text)` | Subtitle text → `"ACTIVE"` / `"LOCKED"` / `"RESOLVED"` / `"CANCELED"` |
| `parseTimerText(text)` | Subtitle countdown text → seconds remaining |
| `readDetailPoints()` | Per-outcome point totals from the open detail panel |
| `readOutcomeTitles()` | Outcome names parsed from bar `aria-label` attributes |
| `isRegionRestricted()` | Detects region block via active footer restriction message |
| `getPredictionButtons()` | Resolves blue/pink outcome buttons in the active footer |
| `readDetailPercents()` | Reads percentages from detail panel bar aria-label text |
| `readPredictionState()` | Combines all of the above into a `PredictionState` object |

`readPredictionState()` uses a two-source strategy:
- **Primary (always available):** `.predictions-list-item` sidebar → status, timer, bar %s, pool total
- **Secondary (when detail panel is open):** per-outcome exact point totals and outcome titles
- **Fallback:** if detail panel is closed, per-outcome points are synthesised from `pool × barWidthPercent`
  (gives the same ratio, which is all the algorithm needs)

---

### Phase 4 — Detector + Two-Phase Timer

The timer now runs in **two distinct phases** after the prediction widget is detected:

#### How we detect a prediction opening

Twitch is a React SPA — pages don't reload when you navigate between channels.
Two viable approaches:

**Option A — MutationObserver (recommended for Phase 2)**

Watch `document.body` with `{ subtree: true, childList: true }` for the prediction
container element being inserted. Once we know the stable selector for the
prediction widget (from the HTML you'll share), we check each mutation batch
for that element. Low overhead because we only act on insertions, not all changes.

```js
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      const widget = node.matches?.(PRED_SELECTOR)
        ? node
        : node.querySelector?.(PRED_SELECTOR);
      if (widget) onPredictionDetected(widget);
    }
  }
});
observer.observe(document.body, { subtree: true, childList: true });
```

**Option B — Twitch PubSub WebSocket interception (advanced, future phase)**

Twitch pushes real-time prediction events over a WebSocket before the UI renders.
We can monkey-patch the `WebSocket` constructor to intercept these messages:

```js
// The relevant topic Twitch subscribes to:
// "predictions-channel-v1.<channelId>"
// Messages arrive with type "event-created", "event-updated", "event-ended"
```

This fires ~1–2 seconds earlier than the DOM mutation and gives us structured
data (no DOM parsing needed), but it requires extracting the channel ID and
patching `WebSocket.prototype.addEventListener` — more brittle.

**Verdict:** Use MutationObserver now. WebSocket interception can be added later
as an optional fast-path enhancement.

#### Phase A — Continuous evaluation loop (T > 5 s)

- Use a `MutationObserver` on `document.body` to detect when the prediction
  widget is injected into the DOM.
- Once detected, start a **5-second evaluation interval**.
- Every tick: call `readPredictionState()` → `decideBet()` → store result in
  the global `pendingDecision` variable. This keeps the bet decision fresh as
  the crowd's point totals shift over time.
- Log each update to `console.debug` so you can watch the decision evolve.

#### Phase B — Execution window (T ≤ 5 s)

- A separate **fast-poll interval (every 200–500 ms)** monitors `secondsLeft`.
- As soon as `secondsLeft <= 5` the evaluation interval is cleared and
  `pendingDecision` is read exactly once to call `placeBet()`.
- Both intervals are cancelled when the prediction becomes LOCKED, RESOLVED,
  or CANCELED.

```
MutationObserver (body)
  └─ prediction widget appears
       ├─ evalInterval = setInterval(5 000ms)   ← Phase A
       │    └─ readPredictionState()
       │         └─ decideBet()
       │              └─ pendingDecision = result   (global, updated each tick)
       │
       └─ watchInterval = setInterval(200ms)    ← Phase B trigger
            └─ if secondsLeft <= 5
                 └─ clearInterval(evalInterval)
                 └─ clearInterval(watchInterval)
                 └─ placeBet(pendingDecision)   ← uses the last computed decision
```

#### Why two intervals instead of one?

| Concern | Answer |
|---|---|
| Points change throughout the prediction | `evalInterval` re-runs the algo every 5 s so `pendingDecision` always reflects current odds |
| We need precise T−5 s timing | `watchInterval` runs fast (200 ms) so we don't overshoot the window |
| We don't want to spam the DOM | `evalInterval` is slow (5 s) — only the watchdog runs fast |

---

### Phase 5 — Bettor Module

Automates the UI interaction to place the bet:

1. Click the outcome button for `decision.outcomeId`
2. Clear the points input field
3. Type (or `InputEvent`) `decision.amount`
4. Click the "Confirm" / "Place Bet" button
5. Log result to console (`[TwitchPred]` prefix)

Edge cases:
- Already bet on this prediction → skip (check if the bet UI is in "voted" state)
- `pendingDecision` is `null` at T−5 s (algo never ran) → skip, log warning
- `pendingDecision.shouldBet` is `false` at T−5 s → respect it, do not bet
- Confirm dialog / extra step → handle if present
- Network error on submit → log and do not retry

---

### Phase 6 — Tampermonkey Wrapper

```js
// ==UserScript==
// @name         Twitch Prediction Auto-Bet
// @namespace    https://twitch.tv/
// @version      1.0
// @description  Automatically bets on the underdog 5 seconds before a prediction closes
// @author       you
// @match        https://www.twitch.tv/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
```

- `@match` covers all Twitch channels
- `@grant none` — no special permissions needed (same-origin DOM access)
- `@run-at document-idle` — waits for Twitch's React app to boot

---

## Edge Cases & Safety Checks

| Case | Handling |
|---|---|
| Region-blocked (0 pts) | `decideBet` returns `shouldBet: false`, `pendingDecision` is updated accordingly |
| Already voted | Check DOM for "voted" state before clicking |
| Prediction resolves before T-5 | Observer sees status change, clears both intervals |
| Prediction cancelled | Same as above |
| `pendingDecision` is null at execution | Log warning, skip bet |
| Odds flip dramatically in the last 5 s | Already handled — `pendingDecision` was updated 5 s before trigger |
| Points input validation by Twitch | Clamp amount to Twitch's min/max if needed |
| Script runs on non-channel pages | `MutationObserver` simply never fires |
| Multiple simultaneous predictions | Handle as a queue (unlikely but possible) |

---

## Next Steps

1. **You:** Share one HTML sample from a **non-region-blocked** active prediction checkout
  - We already have outcome-button and restriction selectors
  - We still need the amount input and final confirm button selectors
2. **Me:** Build the Bettor module (Phase 5) with full place-bet automation
3. **Me:** Assemble the full `userscript.js` combining all phases into one Tampermonkey file
