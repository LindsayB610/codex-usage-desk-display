# Product contract

## Job

Provide a passive, glanceable view of the current Codex allowance: percentage
remaining, the next automatic reset, available full-reset credits, and the last
successful refresh time.

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
shorter allowance. Remaining percentage is `100 - usedPercent`; the
reset-credit count is used only when the response contains an integer
`availableCount`.

The parser fails closed on unknown or malformed responses. It does not invent
zero usage, a reset time, or a credit count. When an update fails, the e-paper
panel retains the last successfully acknowledged frame and its absolute local
`LAST REFRESH` time.

Routine five-minute updates use the panel's partial-refresh waveform and retain
the previous framebuffer on the ESP32. After 24 partial updates, and after any
board restart that loses that buffer, firmware performs one full cleanup
refresh to limit ghosting.

## Non-goals

- redeeming or purchasing reset credits
- putting Codex credentials on the ESP32
- cloud hosting, remote access, or telemetry
- guessing among multiple USB devices
- supporting unverified e-paper controllers or panel sizes
