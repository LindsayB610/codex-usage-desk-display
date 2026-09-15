import { createInterface } from 'node:readline';

const hang = process.argv.includes('--hang');
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
        rateLimits: { primary: { usedPercent: 56, resetsAt: 2000 } },
        rateLimitResetCredits: { availableCount: 2, credits: null },
      },
    })}\n`);
  }
});
