import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDeliveryTimestamps, pollOnce, validateConfig } from '../service.mjs';

const config = {
  schemaVersion: 1,
  codexPath: '/Applications/ChatGPT.app/Contents/Resources/codex',
  transport: 'serial',
  directUsbPythonPath: null,
  devicePath: null,
  baudRate: 115200,
  connectDelayMs: 1500,
  pollIntervalSeconds: 300,
  timeZone: 'America/Los_Angeles',
  healthPath: '/private/tmp/codex-display-health.json',
};

test('validates the durable polling contract', () => {
  assert.deepEqual(validateConfig(config), config);
  assert.throws(() => validateConfig({ ...config, pollIntervalSeconds: 10 }), { code: 'INVALID_CONFIG' });
  assert.throws(() => validateConfig({ ...config, codexPath: 'codex' }), { code: 'INVALID_CONFIG' });
  assert.throws(() => validateConfig({ ...config, transport: 'direct_ch340_usb' }), { code: 'INVALID_CONFIG' });
  assert.equal(validateConfig({
    ...config,
    transport: 'direct_ch340_usb',
    directUsbPythonPath: '/private/tmp/venv/bin/python',
  }).transport, 'direct_ch340_usb');
});

test('polls, transforms, and delivers one complete vertical slice', async () => {
  const deliveries = [];
  const client = {
    async readRateLimits() {
      return {
        ordinaryUsageAllowed: true,
        rateLimits: {
          limitId: 'codex',
          primary: { usedPercent: 56, resetsAt: 1789816511, windowDurationMins: 10080 },
        },
        rateLimitResetCredits: { availableCount: 2, credits: null },
      };
    },
  };
  const transport = {
    async send(message) { deliveries.push(message); return { status: 'written', devicePath: '/dev/cu.test' }; },
  };
  const result = await pollOnce({ client, transport, config, nowEpochSeconds: 1789311720 });
  assert.equal(result.message.remainingPercent, 44);
  assert.equal(result.delivery.status, 'written');
  assert.deepEqual(deliveries, [result.message]);
});

test('records positive acknowledgement separately from an unverified serial write', () => {
  const initial = { lastSentSnapshotAt: 100, lastGoodSnapshotAt: 90 };
  assert.deepEqual(nextDeliveryTimestamps(initial, 200, 'waiting_for_device'), initial);
  assert.deepEqual(nextDeliveryTimestamps(initial, 200, 'written'), {
    lastSentSnapshotAt: 200,
    lastGoodSnapshotAt: 90,
  });
  assert.deepEqual(nextDeliveryTimestamps(initial, 200, 'displayed'), {
    lastSentSnapshotAt: 200,
    lastGoodSnapshotAt: 200,
  });
});
