import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDisplayMessage, formatCountdown, formatResetAt, formatUpdatedAt,
  selectCodexSnapshot, selectWeeklyWindow,
} from '../core.mjs';

const response = {
  ordinaryUsageAllowed: true,
  rateLimits: { primary: { usedPercent: 99, resetsAt: 2000, windowDurationMins: 10080 } },
  rateLimitsByLimitId: {
    codex_other: { limitId: 'codex_other', primary: { usedPercent: 2, resetsAt: 3000, windowDurationMins: 300 } },
    codex: { limitId: 'codex', primary: { usedPercent: 56, resetsAt: 1789816511, windowDurationMins: 10080 } },
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
    schemaVersion: 1,
    type: 'codex_usage',
    state: 'live',
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
