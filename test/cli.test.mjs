import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fakeCodex = path.join(repository, 'test', 'fixtures', 'fake-app-server.mjs');
const failingCodex = path.join(repository, 'test', 'fixtures', 'fake-failing-codex.mjs');

test('snapshot command waits for its app-server response before exiting', async () => {
  const { stdout, stderr } = await execute(process.execPath, ['cli.mjs', 'snapshot'], {
    cwd: repository,
    env: { ...process.env, CODEX_BIN: fakeCodex },
    timeout: 5000,
  });
  assert.equal(stderr, '');
  const snapshot = JSON.parse(stdout);
  assert.equal(snapshot.remainingPercent, 44);
  assert.equal(snapshot.usageMode, 'included');
  assert.equal(snapshot.resetCredits, 2);
});

test('snapshot can use the installed config for paid-credit mode', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-display-cli-'));
  const configPath = path.join(directory, 'config.json');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    codexPath: fakeCodex,
    transport: 'serial',
    directUsbPythonPath: null,
    devicePath: null,
    baudRate: 115200,
    connectDelayMs: 1500,
    pollIntervalSeconds: 300,
    timeZone: 'America/Los_Angeles',
    paidCreditFullBalance: 2000,
    healthPath: path.join(directory, 'health.json'),
  }));
  const { stdout } = await execute(process.execPath, ['cli.mjs', 'snapshot'], {
    cwd: repository,
    env: {
      ...process.env,
      CODEX_USAGE_DISPLAY_CONFIG: configPath,
      FAKE_CODEX_USED_PERCENT: '100',
      FAKE_CODEX_CREDIT_BALANCE: '1000',
    },
    timeout: 5000,
  });
  const snapshot = JSON.parse(stdout);
  assert.equal(snapshot.usageMode, 'paid');
  assert.equal(snapshot.remainingPercent, 50);
});

test('command errors hide app-server diagnostics unless debug mode is explicit', async () => {
  await assert.rejects(execute(process.execPath, ['cli.mjs', 'snapshot'], {
    cwd: repository,
    env: { ...process.env, CODEX_BIN: failingCodex },
    timeout: 5000,
  }), error => {
    assert.match(error.stderr, /"code":"APP_SERVER_EXITED"/);
    assert.doesNotMatch(error.stderr, /sensitive diagnostic/);
    return true;
  });
});
