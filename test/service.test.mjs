import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nextDeliveryTimestamps, pollOnce, trackedDisplayMessage, validateConfig } from '../service.mjs';

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
  paidCreditFullBalance: null,
  healthPath: '/private/tmp/codex-display-health.json',
};

test('validates the durable polling contract', () => {
  assert.deepEqual(validateConfig(config), config);
  assert.throws(() => validateConfig({ ...config, pollIntervalSeconds: 10 }), { code: 'INVALID_CONFIG' });
  assert.throws(() => validateConfig({ ...config, codexPath: 'codex' }), { code: 'INVALID_CONFIG' });
  assert.throws(() => validateConfig({ ...config, paidCreditFullBalance: 0 }), { code: 'INVALID_CONFIG' });
  assert.equal(validateConfig({ ...config, paidCreditFullBalance: 2000 }).paidCreditFullBalance, 2000);
  assert.throws(() => validateConfig({ ...config, transport: 'direct_ch340_usb' }), { code: 'INVALID_CONFIG' });
  assert.equal(validateConfig({
    ...config,
    transport: 'direct_ch340_usb',
    directUsbPythonPath: '/private/tmp/venv/bin/python',
  }).transport, 'direct_ch340_usb');
});

test('passes the configured paid-credit capacity through the live poll', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credit-poll-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const client = {
    async readRateLimits() {
      return {
        ordinaryUsageAllowed: true,
        rateLimits: {
          limitId: 'codex',
          primary: { usedPercent: 100, resetsAt: 1789816511, windowDurationMins: 10080 },
          credits: { hasCredits: true, unlimited: false, balance: '1500' },
        },
        rateLimitResetCredits: { availableCount: 1, credits: null },
      };
    },
  };
  const transport = { async send(message) { return { status: 'displayed', message }; } };
  const result = await pollOnce({
    client,
    transport,
    config: { ...config, paidCreditFullBalance: 2000, healthPath: path.join(directory, 'health.json') },
    nowEpochSeconds: 1789311720,
  });
  assert.equal(result.message.usageMode, 'paid');
  assert.equal(result.message.remainingPercent, 75);
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

test('remembers each observed refill across polls and ignores missing readings', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credit-meter-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const settings = { ...config, healthPath: path.join(directory, 'health.json'), paidCreditFullBalance: 100 };
  const read = async (balance, usedPercent = 100, persist = true) => trackedDisplayMessage({
    rateLimits: { primary: { usedPercent, windowDurationMins: 10080 }, credits: { balance } },
  }, settings, {}, persist);
  assert.equal((await read(80)).remainingPercent, 80);
  assert.equal((await read(null)).usageMode, 'included');
  assert.equal((await read(75)).remainingPercent, 75);
  assert.equal((await read(200, 50)).usageMode, 'included');
  assert.equal((await read(100)).remainingPercent, 50);
  assert.equal((await read(150, 100, false)).remainingPercent, 100);
  assert.equal((await read(90)).remainingPercent, 45);
  assert.equal((await read(120)).remainingPercent, 100);
  assert.equal((await read(60)).remainingPercent, 50);
});

test('tracker failures preserve weekly readings and suppress unverified paid percentages', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credit-failure-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'health.json');
  const tracker = configPath + '.credits.json';
  const settings = { ...config, healthPath: configPath, paidCreditFullBalance: 100 };
  const poll = (usedPercent, healthPath = configPath) => pollOnce({
    config: { ...settings, healthPath },
    client: { readRateLimits: async () => ({ ordinaryUsageAllowed: false, rateLimits: {
      primary: { windowDurationMins: 10080, usedPercent }, credits: { hasCredits: true, balance: '40' },
    } }) },
    transport: { send: async () => ({ status: 'displayed' }) },
  });
  for (const damaged of ['truncated', 'null', '{}', '{"seed":100,"balance":160,"full":100}']) {
    await fs.writeFile(tracker, damaged);
    const weekly = await poll(25);
    assert.equal(weekly.message.remainingPercent, 75);
    assert.equal(weekly.delivery.status, 'displayed');
    assert.equal(weekly.trackerError, 'INVALID_CREDIT_TRACKER');
    const exhausted = await poll(100);
    assert.equal(exhausted.message.usageMode, 'included');
    assert.equal(exhausted.message.state, 'live');
    assert.equal(await fs.readFile(tracker, 'utf8'), damaged);
  }
  // A regular file in place of the parent directory makes the path inaccessible even as root.
  const blocked = await poll(25, path.join(tracker, 'health.json'));
  assert.equal(blocked.message.remainingPercent, 75);
  assert.equal(blocked.trackerError, 'CREDIT_TRACKER_IO_ERROR');
  // A filesystem component at NAME_MAX permits the read (ENOENT) but prevents
  // creation of the longer atomic-write temp file (ENAMETOOLONG).
  const longPath = path.join(directory, 'x'.repeat(235) + '.json');
  const failedSave = await poll(25, longPath);
  assert.equal(failedSave.message.remainingPercent, 75);
  assert.equal(failedSave.trackerError, 'CREDIT_TRACKER_IO_ERROR');
});

test('unlimited readings and paused metering preserve the last finite mark', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credit-mode-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const healthPath = path.join(directory, 'health.json');
  const read = (balance, seed = 100, unlimited = false) => trackedDisplayMessage({
    ordinaryUsageAllowed: false,
    rateLimits: { primary: { usedPercent: 100, windowDurationMins: 10080 },
      credits: { hasCredits: true, balance, unlimited } },
  }, { ...config, healthPath, paidCreditFullBalance: seed }, {}, true);
  await read(80);
  await read(200);
  const tracker = healthPath + '.credits.json';
  const before = await fs.readFile(tracker, 'utf8');
  const unlimited = await read(10, 100, true);
  assert.equal(unlimited.usageMode, 'included');
  assert.equal(unlimited.state, 'live');
  assert.equal((await read(5, null)).usageMode, 'included');
  assert.equal(await fs.readFile(tracker, 'utf8'), before);
  assert.equal((await read(40)).remainingPercent, 20);
  assert.equal((await read(40, 400)).remainingPercent, 10);
});
