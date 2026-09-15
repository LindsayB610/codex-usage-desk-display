import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SerialTransport, selectSerialDevice } from '../serial.mjs';

const message = {
  schemaVersion: 1, type: 'codex_usage', state: 'live', generatedAt: 1000,
  usedPercent: 56, remainingPercent: 44, resetAt: 2000, resetInLabel: '16m',
  resetAtLabel: 'SAT · 4:15 AM', resetCredits: 2, updatedAtLabel: '12:42',
};

test('autodetection accepts one candidate and refuses ambiguity', () => {
  assert.equal(selectSerialDevice(['tty.Bluetooth', 'cu.usbmodem1101']), '/dev/cu.usbmodem1101');
  assert.equal(selectSerialDevice(['tty.Bluetooth']), null);
  assert.throws(() => selectSerialDevice(['cu.usbmodem1', 'cu.usbserial2']), { code: 'AMBIGUOUS_SERIAL_DEVICE' });
});

test('exact device paths must remain within the callout-device namespace', () => {
  assert.equal(selectSerialDevice([], '/dev/cu.usbserial-test'), '/dev/cu.usbserial-test');
  assert.throws(() => selectSerialDevice([], '/private/tmp/not-a-device'), { code: 'INVALID_SERIAL_DEVICE' });
});

test('transport writes one protocol line without reopening its sink', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-display-'));
  const file = path.join(directory, 'serial.txt');
  await fs.writeFile(file, '');
  const handle = await fs.open(file, 'a');
  let opens = 0;
  const transport = new SerialTransport({
    devicePath: '/dev/cu.test', configure: false, connectDelayMs: 0,
    openFile: async () => { opens += 1; return handle; },
  });
  t.after(async () => { await transport.close(); await fs.rm(directory, { recursive: true }); });
  assert.equal((await transport.send(message)).status, 'written');
  assert.equal((await transport.send(message)).status, 'written');
  assert.equal(opens, 1);
  const lines = (await fs.readFile(file, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
});
