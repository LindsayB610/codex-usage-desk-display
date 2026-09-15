import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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
  assert.equal(snapshot.resetCredits, 2);
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
