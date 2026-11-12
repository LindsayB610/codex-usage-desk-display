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

test('a fresh collector process and CLI diagnostics share the durable refill mark', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'credit-restart-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, 'config.json');
  const healthPath = path.join(directory, 'health.json');
  const tracker = healthPath + '.credits.json';
  await fs.writeFile(configPath, JSON.stringify({
    schemaVersion: 1, codexPath: fakeCodex, paidCreditFullBalance: 100, healthPath,
  }));
  const env = { ...process.env, CODEX_USAGE_DISPLAY_CONFIG: configPath, FAKE_CODEX_USED_PERCENT: '100' };
  // Each invocation starts fresh. A transport error happens after the balance was observed.
  const poll = async (balance, failDelivery = false) => {
    const script = `
      import { readConfig, pollOnce } from './service.mjs';
      import { CodexAppServerClient } from './app-server.mjs';
      const config = await readConfig(process.env.CODEX_USAGE_DISPLAY_CONFIG);
      const client = new CodexAppServerClient({ command: config.codexPath });
      const transport = { async send(message) {
        if (process.env.FAIL_DELIVERY === 'true') throw new Error('offline');
        console.log(message.remainingPercent);
        return { status: 'displayed' };
      }};
      try { await pollOnce({ config, client, transport }); } finally { await client.close(); }
    `;
    return execute(process.execPath, ['--input-type=module', '-e', script], {
      cwd: repository, env: { ...env, FAKE_CODEX_CREDIT_BALANCE: balance, FAIL_DELIVERY: String(failDelivery) },
      timeout: 5000,
    });
  };
  assert.equal((await poll('80')).stdout.trim(), '80');
  await assert.rejects(poll('240', true), /offline/);
  assert.equal((await poll('180')).stdout.trim(), '75');
  const before = await fs.readFile(tracker, 'utf8');
  assert.equal((await fs.stat(tracker)).mode & 0o777, 0o600);
  const diagnostic = async command => (await execute(process.execPath, ['cli.mjs', command], {
    cwd: repository, env: { ...env, FAKE_CODEX_CREDIT_BALANCE: '120' }, timeout: 5000,
  })).stdout;
  assert.equal(JSON.parse(await diagnostic('snapshot')).remainingPercent, 50);
  assert.match(await diagnostic('preview'), /50%/);
  assert.equal(await fs.readFile(tracker, 'utf8'), before);
  assert.equal((await poll('150')).stdout.trim(), '63');
});

test('the running collector verifies a refill hint between screen refreshes and persists it for a new process', async t => {
  const { spawn } = await import('node:child_process');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'desk-hint-'));
  const configPath = path.join(directory, 'config.json');
  const healthPath = path.join(directory, 'health.json');
  const helper = path.join(directory, 'ack.mjs');
  const frames = path.join(directory, 'frames.jsonl');
  await fs.writeFile(helper, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
let line = '';
for await (const chunk of process.stdin) line += chunk;
appendFileSync(process.env.FAKE_FRAMES, line);
console.log(JSON.stringify({status:'displayed', generatedAt:JSON.parse(line).generatedAt}));
`, { mode: 0o700 });
  await fs.writeFile(configPath, JSON.stringify({ schemaVersion: 1, healthPath, codexPath: fakeCodex,
    transport: 'direct_ch340_usb', directUsbPythonPath: helper }));
  const env = { ...process.env, CODEX_USAGE_DISPLAY_CONFIG: configPath, FAKE_CODEX_USED_PERCENT: '100',
    FAKE_CODEX_CREDIT_BALANCE: '25', FAKE_REFILL: '200', FAKE_FRAMES: frames };
  const child = spawn(process.execPath, ['cli.mjs', 'serve', configPath], { cwd: repository, env, stdio: 'ignore' });
  const exited = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => { child.kill(); await exited; await fs.rm(directory, { recursive: true, force: true }); });
  const deadline = Date.now() + 8000;
  for (;;) {
    let state;
    try { state = JSON.parse(await fs.readFile(healthPath + '.auto-credits.json', 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (state?.full === 200) break;
    assert.ok(Date.now() < deadline, 'notification did not trigger a verified balance read');
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  child.kill();
  await exited;
  const sent = (await fs.readFile(frames, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(sent.map(frame => frame.usageMode), ['learning']);
  const { stdout } = await execute(process.execPath, ['cli.mjs', 'snapshot'], {
    cwd: repository, env: { ...env, FAKE_REFILL: '', FAKE_CODEX_CREDIT_BALANCE: '100' },
  });
  assert.equal(JSON.parse(stdout).remainingPercent, 50);
});
