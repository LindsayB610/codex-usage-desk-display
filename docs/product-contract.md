# Product contract

## Job

Provide a passive, glanceable view of the current Codex allowance: percentage
remaining, the next automatic reset, available full-reset credits, and the last
successful refresh time. The weekly allowance owns the primary meter until it
reaches zero. The meter then switches to the remaining percentage of purchased
credits once a full mark is known, showing “Learning refill” while it is learning.

## Ownership boundary

The Mac owns Codex authentication, account reads, timezone formatting, and USB
transport. The ESP32 receives a privacy-minimized display message and owns
rendering. Account tokens, account IDs, and reset-credit IDs never cross the USB
boundary.

## Source and failure behavior

The local Codex app-server method `account/rateLimits/read` supplies usage. The
`codex` bucket is preferred when multiple buckets exist. Within that bucket,
the host selects the window whose reported duration is exactly seven days
(`10080` minutes), whether Codex calls it `primary` or `secondary`. It fails
closed if no weekly window exists rather than putting a weekly label on a
shorter allowance. Weekly remaining percentage is `100 - usedPercent`; the
reset-credit count is used only when the response contains an integer
`availableCount`.

The Mac saves the first valid balance privately and learns the full mark on
an observed rise. It samples at most 60 seconds apart during ordinary operation,
with an earlier read when a balance-bearing notification arrives. Notifications
are hints to read the authoritative Codex bucket. They never cause a panel
refresh by themselves. The panel follows its configured refresh interval.

Until the first observed increase, positive paid credit use shows “Learning
refill” with no percentage or bar. Known percentages use the observed full
balance and round up. Existing seeded installations retain their saved state.
Missing, unlimited, or malformed readings do not modify the mark. A tracker
failure falls back to the weekly screen. Raw balances stay on the Mac.

When the included bucket is exhausted, Codex may report ordinary usage as
denied even while purchased credits remain available. A positive paid-credit
balance therefore remains a live state. `LIMITED` appears only when neither the
included allowance nor paid credits can fund more usage.

The parser fails closed on unknown or malformed responses. It does not invent
zero usage, a reset time, or a credit count. When an update fails, the e-paper
panel retains the last successfully acknowledged frame and its absolute local
`LAST REFRESH` time.

Routine five-minute updates use the panel's partial-refresh waveform and retain
the previous framebuffer on the ESP32. After 24 partial updates, and after any
board restart that loses that buffer, firmware performs one full cleanup
refresh to limit ghosting.

## Non-goals

- redeeming reset credits or purchasing paid credits
- predicting how many Codex messages a paid-credit balance will fund
- putting Codex credentials on the ESP32
- cloud hosting, remote access, or telemetry
- guessing among multiple USB devices
- supporting unverified e-paper controllers or panel sizes
