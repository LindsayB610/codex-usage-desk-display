#!/usr/bin/env node
import { createInterface } from 'node:readline';

const hang = process.argv.includes('--hang');
const usedPercent = Number(process.env.FAKE_CODEX_USED_PERCENT ?? 56);
let subscribed = false;
let creditBalance = process.env.FAKE_CODEX_CREDIT_BALANCE;
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    subscribed = !message.params.capabilities?.optOutNotificationMethods?.includes('account/rateLimits/updated');
    process.stdout.write(`${JSON.stringify({ id: message.id, result: { userAgent: 'fake' } })}\n`);
  } else if (message.method === 'account/rateLimits/read' && !hang) {
    process.stdout.write(`${JSON.stringify({
      id: message.id,
      result: {
        ordinaryUsageAllowed: true,
        rateLimits: {
          primary: { usedPercent, resetsAt: 2000, windowDurationMins: 10080 },
          ...(creditBalance === undefined ? {} : {
            credits: { hasCredits: Number(creditBalance) > 0, unlimited: false, balance: creditBalance },
          }),
        },
        rateLimitResetCredits: { availableCount: 2, credits: null },
      },
    })}\n`);
    if (subscribed && process.env.FAKE_REFILL && creditBalance !== process.env.FAKE_REFILL) {
      setTimeout(() => {
        creditBalance = process.env.FAKE_REFILL;
        // The hint can be older than the fresh balance returned by the next read.
        const rateLimits = { limitId: 'codex', credits: { balance: '999' } };
        process.stdout.write(JSON.stringify({ method: 'account/rateLimits/updated', params: { rateLimits } }) + '\n');
      }, 100);
    }
  }
});
