import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexAppServerClient } from '../app-server.mjs';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-app-server.mjs');

test('initializes and reads rate limits over newline-delimited JSON-RPC', async t => {
  const client = new CodexAppServerClient({ command: process.execPath, args: [fixture], timeoutMs: 2000 });
  t.after(() => client.close());
  const response = await client.readRateLimits();
  assert.equal(response.rateLimits.primary.usedPercent, 56);
  assert.equal(response.rateLimitResetCredits.availableCount, 2);
});

test('surfaces request timeout without exposing process stderr', async t => {
  const client = new CodexAppServerClient({ command: process.execPath, args: [fixture, '--hang'], timeoutMs: 50 });
  t.after(() => client.close());
  await assert.rejects(client.readRateLimits(), { code: 'APP_SERVER_TIMEOUT' });
});
