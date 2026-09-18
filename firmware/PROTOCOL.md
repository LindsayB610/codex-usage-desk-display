# USB serial protocol

The Mac writes one UTF-8 JSON object followed by `\n` at 115200 baud. Messages
are capped at 2 KiB. Unknown fields, invalid values, and unsupported protocol
versions must be rejected without replacing the last valid screen.

Example:

```json
{"schemaVersion":2,"type":"codex_usage","state":"live","usageMode":"included","generatedAt":1789311720,"usedPercent":56,"remainingPercent":44,"resetAt":1789816511,"resetInLabel":"5d 15h","resetAtLabel":"SAT · 4:15 AM","resetCredits":2,"updatedAtLabel":"8:02 AM"}
```

The firmware must:

1. leave the retained e-paper frame untouched during boot and serial reconnect;
2. retain only the privacy-minimized fields above;
3. redraw after each valid host snapshot so `LAST REFRESH` remains accurate;
4. preserve the last frame when messages stop;
5. treat `resetCredits: null` as unknown (`—`), never zero;
6. show `LIMITED` when `state` is `limited`;
7. show `CODEX / WEEK` and `REMAINING` for `usageMode: "included"`;
8. show `CODEX / CREDITS` and `CREDITS LEFT` for `usageMode: "paid"`;
9. reject malformed input and continue listening.

Firmware protocol v2 accepts the previous v1 host message during a rolling
upgrade and treats it as `usageMode: "included"`. The firmware acknowledgement
remains v1 because that response contract did not change.

Every frame must show `LAST REFRESH` plus `updatedAtLabel` beneath the percentage
bar. If USB power disappears, the physical e-paper image and its absolute
timestamp remain visible without power. If power remains while host messages
stop, the firmware leaves that frame alone. A reboot must not clear or replace
the retained frame before a valid host message arrives. The physical firmware
returns a positive acknowledgement tied to `generatedAt` only after the e-paper
redraw completes. The host records `displayed` only when that acknowledgement
matches the snapshot it sent.

The Elecrow-specific display adapter and exact pin mapping are bound from the
vendor example for this precise 2.13-inch SKU. The Mac reaches the board through
the CH340K bridge with the local libusb adapter; no third-party kernel or system
extension is required.
