#!/usr/bin/env node
import { createInterface } from 'node:readline';

const hang = process.argv.includes('--hang');
const usedPercent = Number(process.env.FAKE_CODEX_USED_PERCENT ?? 56);
const creditBalance = process.env.FAKE_CODEX_CREDIT_BALANCE;
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
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
  }
});
