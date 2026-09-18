import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDisplayMessage, formatCountdown, formatResetAt, formatUpdatedAt,
  selectCodexSnapshot, selectUsageMeter, selectWeeklyWindow,
} from '../core.mjs';

const response = {
  ordinaryUsageAllowed: true,
  rateLimits: { primary: { usedPercent: 99, resetsAt: 2000, windowDurationMins: 10080 } },
  rateLimitsByLimitId: {
    codex_other: { limitId: 'codex_other', primary: { usedPercent: 2, resetsAt: 3000, windowDurationMins: 300 } },
    codex: {
      limitId: 'codex',
      primary: { usedPercent: 56, resetsAt: 1789816511, windowDurationMins: 10080 },
      credits: { hasCredits: true, unlimited: false, balance: '2000' },
    },
  },
  rateLimitResetCredits: { availableCount: 2, credits: [] },
};

test('prefers the exact codex bucket in a multi-bucket response', () => {
  assert.equal(selectCodexSnapshot(response).limitId, 'codex');
});

test('selects the seven-day window whether Codex returns it as primary or secondary', () => {
  assert.equal(selectWeeklyWindow(response.rateLimitsByLimitId.codex).usedPercent, 56);
  assert.equal(selectWeeklyWindow({
    primary: { usedPercent: 5, resetsAt: 2100, windowDurationMins: 300 },
    secondary: { usedPercent: 57, resetsAt: 3100, windowDurationMins: 10080 },
  }).usedPercent, 57);
});

test('fails closed rather than labeling a non-weekly window as weekly', () => {
  assert.throws(() => selectWeeklyWindow({
    primary: { usedPercent: 5, resetsAt: 2100, windowDurationMins: 300 },
  }), { code: 'CODEX_WEEKLY_USAGE_UNAVAILABLE' });
});

test('builds the privacy-minimized landscape message', () => {
  const message = buildDisplayMessage(response, { nowEpochSeconds: 1789311720 });
  assert.deepEqual(message, {
    schemaVersion: 2,
    type: 'codex_usage',
    state: 'live',
    usageMode: 'included',
    generatedAt: 1789311720,
    usedPercent: 56,
    remainingPercent: 44,
    resetAt: 1789816511,
    resetInLabel: '5d 20h',
    resetAtLabel: 'SAT · 4:15 AM',
    resetCredits: 2,
    updatedAtLabel: '8:02 AM',
  });
  assert.equal(JSON.stringify(message).includes('account'), false);
});

test('keeps the weekly allowance on screen until it is exhausted', () => {
  const snapshot = response.rateLimitsByLimitId.codex;
  assert.deepEqual(selectUsageMeter(snapshot, 2000), {
    usageMode: 'included',
    usedPercent: 56,
    remainingPercent: 44,
  });
});

test('does not switch to paid credits merely because weekly display rounding reaches zero', () => {
  const snapshot = {
    ...response.rateLimitsByLimitId.codex,
    primary: { usedPercent: 99.6, resetsAt: 1789816511, windowDurationMins: 10080 },
  };
  assert.deepEqual(selectUsageMeter(snapshot, 2000), {
    usageMode: 'included',
    usedPercent: 100,
    remainingPercent: 0,
  });
});

test('switches the meter to paid-credit percentage after weekly usage reaches zero', () => {
  const snapshot = {
    ...response.rateLimitsByLimitId.codex,
    primary: { usedPercent: 100, resetsAt: 1789816511, windowDurationMins: 10080 },
    credits: { hasCredits: true, unlimited: false, balance: '1000' },
  };
  const message = buildDisplayMessage({
    ...response,
    rateLimitsByLimitId: { codex: snapshot },
  }, { nowEpochSeconds: 1789311720, paidCreditFullBalance: 2000 });
  assert.equal(message.usageMode, 'paid');
  assert.equal(message.remainingPercent, 50);
  assert.equal(message.usedPercent, 50);
});

test('paid-credit meter clamps reloads to 100 and keeps any positive balance visible', () => {
  const exhausted = balance => ({
    primary: { usedPercent: 100, resetsAt: 1789816511, windowDurationMins: 10080 },
    credits: { hasCredits: true, unlimited: false, balance },
  });
  assert.equal(selectUsageMeter(exhausted('2500'), 2000).remainingPercent, 100);
  assert.equal(selectUsageMeter(exhausted('0.01'), 2000).remainingPercent, 1);
  assert.equal(selectUsageMeter(exhausted('0'), 2000).remainingPercent, 0);
  assert.deepEqual(selectUsageMeter({
    ...exhausted('0'),
    credits: { hasCredits: false, unlimited: false, balance: '0' },
  }, 2000), {
    usageMode: 'paid',
    usedPercent: 100,
    remainingPercent: 0,
  });
  assert.equal(selectUsageMeter(exhausted('-2.5'), 2000).remainingPercent, 0);
});

test('does not invent a paid-credit percentage without a valid configured full balance', () => {
  const snapshot = {
    primary: { usedPercent: 100, resetsAt: 1789816511, windowDurationMins: 10080 },
    credits: { hasCredits: true, unlimited: false, balance: '2000' },
  };
  assert.deepEqual(selectUsageMeter(snapshot), {
    usageMode: 'included',
    usedPercent: 100,
    remainingPercent: 0,
  });
  assert.equal(selectUsageMeter({ ...snapshot, credits: { hasCredits: true, balance: 'bogus' } }, 2000).usageMode, 'included');
});

test('unknown reset-credit count stays unknown rather than becoming zero', () => {
  const value = { ...response, rateLimitResetCredits: null };
  assert.equal(buildDisplayMessage(value, { nowEpochSeconds: 1789311720 }).resetCredits, null);
});

test('backend ordinary-usage denial is represented without changing the values', () => {
  const value = { ...response, ordinaryUsageAllowed: false };
  const message = buildDisplayMessage(value, { nowEpochSeconds: 1789311720 });
  assert.equal(message.state, 'limited');
  assert.equal(message.remainingPercent, 44);
});

test('paid credits keep the display live after included usage is denied', () => {
  const snapshot = {
    ...response.rateLimitsByLimitId.codex,
    primary: { usedPercent: 100, resetsAt: 1789816511, windowDurationMins: 10080 },
    credits: { hasCredits: true, unlimited: false, balance: '1000' },
  };
  const message = buildDisplayMessage({
    ...response,
    ordinaryUsageAllowed: false,
    rateLimitsByLimitId: { codex: snapshot },
  }, { nowEpochSeconds: 1789311720, paidCreditFullBalance: 2000 });
  assert.equal(message.state, 'live');
  assert.equal(message.usageMode, 'paid');
  assert.equal(message.remainingPercent, 50);
});

test('the display becomes limited when included and paid usage are both exhausted', () => {
  const snapshot = {
    ...response.rateLimitsByLimitId.codex,
    primary: { usedPercent: 100, resetsAt: 1789816511, windowDurationMins: 10080 },
    credits: { hasCredits: false, unlimited: false, balance: '0' },
  };
  const message = buildDisplayMessage({
    ...response,
    ordinaryUsageAllowed: false,
    rateLimitsByLimitId: { codex: snapshot },
  }, { nowEpochSeconds: 1789311720, paidCreditFullBalance: 2000 });
  assert.equal(message.state, 'limited');
  assert.equal(message.usageMode, 'paid');
  assert.equal(message.remainingPercent, 0);
});

test('countdown and Pacific reset labels cover boundary states', () => {
  assert.equal(formatCountdown(1000, 1000), 'NOW');
  assert.equal(formatCountdown(1000, 1060), '1m');
  assert.equal(formatCountdown(1000, 1000 + 3660), '1h 1m');
  assert.equal(formatResetAt(1789816511), 'SAT · 4:15 AM');
  assert.equal(formatResetAt(null), 'TIME UNKNOWN');
});

test('last refresh uses Pacific 12-hour time', () => {
  assert.equal(formatUpdatedAt(1789311720), '8:02 AM');
});

test('missing Codex usage fails instead of inventing zero', () => {
  assert.throws(() => buildDisplayMessage({ rateLimits: { primary: null } }), { code: 'CODEX_WEEKLY_USAGE_UNAVAILABLE' });
});
