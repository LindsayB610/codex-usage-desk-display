import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDisplaySvg } from '../render.mjs';

const message = {
  schemaVersion: 1, type: 'codex_usage', state: 'live', generatedAt: 1000,
  usedPercent: 56, remainingPercent: 44, resetAt: 2000, resetInLabel: '5d 15h',
  resetAtLabel: 'SAT · 4:15 AM', resetCredits: 2, updatedAtLabel: '12:42 PM',
};

test('renders the approved 250 by 122 landscape hierarchy', () => {
  const svg = renderDisplaySvg(message);
  assert.match(svg, /width="250" height="122"/);
  assert.match(svg, />44%</);
  assert.match(svg, />5d 15h</);
  assert.match(svg, />FULL RESETS</);
  assert.match(svg, />2</);
  assert.match(svg, />CODEX \/ WEEK</);
  assert.match(svg, />LAST REFRESH 12:42 PM</);
  assert.match(svg, /width="41" height="4"/);
});

test('renders a limited account state without dropping the last values', () => {
  const svg = renderDisplaySvg({ ...message, state: 'limited' });
  assert.match(svg, />LIMITED</);
  assert.match(svg, />LAST REFRESH 12:42 PM</);
  assert.match(svg, />44%</);
});

test('renders an unavailable reset count as an em dash', () => {
  assert.match(renderDisplaySvg({ ...message, resetCredits: null }), />—</);
});
