import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeDisplayMessage, parseDisplayMessage } from '../protocol.mjs';

const message = {
  schemaVersion: 2,
  type: 'codex_usage',
  state: 'live',
  usageMode: 'included',
  generatedAt: 1000,
  usedPercent: 56,
  remainingPercent: 44,
  resetAt: 2000,
  resetInLabel: '16m',
  resetAtLabel: 'SAT · 4:15 AM',
  resetCredits: 2,
  updatedAtLabel: '12:42',
};

test('round-trips exactly one bounded JSON line', () => {
  const line = encodeDisplayMessage(message);
  assert.equal(line.endsWith('\n'), true);
  assert.deepEqual(parseDisplayMessage(line), message);
});

test('rejects unknown fields so protocol drift is visible', () => {
  assert.throws(() => encodeDisplayMessage({ ...message, accountId: 'secret' }), { code: 'INVALID_DISPLAY_MESSAGE' });
});

test('rejects unsupported versions, modes, and control characters', () => {
  assert.throws(() => encodeDisplayMessage({ ...message, schemaVersion: 1 }), { code: 'INVALID_DISPLAY_MESSAGE' });
  assert.throws(() => encodeDisplayMessage({ ...message, usageMode: 'mystery' }), { code: 'INVALID_DISPLAY_MESSAGE' });
  assert.throws(() => encodeDisplayMessage({ ...message, resetAtLabel: 'BAD\nLINE' }), { code: 'INVALID_DISPLAY_MESSAGE' });
});

test('rejects internally inconsistent percentages', () => {
  assert.throws(() => encodeDisplayMessage({ ...message, remainingPercent: 45 }), { code: 'INVALID_DISPLAY_MESSAGE' });
});
