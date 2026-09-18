import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DirectUsbTransport } from '../direct-usb.mjs';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-direct-usb.mjs');
const message = {
  schemaVersion: 2, type: 'codex_usage', state: 'live', usageMode: 'included', generatedAt: 1000,
  usedPercent: 56, remainingPercent: 44, resetAt: 2000, resetInLabel: '16m',
  resetAtLabel: 'SAT · 4:15 AM', resetCredits: 2, updatedAtLabel: '12:42',
};

test('direct USB transport requires an absolute Python path', () => {
  assert.throws(() => new DirectUsbTransport({ pythonPath: 'python3' }), { code: 'INVALID_DIRECT_USB_PYTHON' });
});

test('direct USB transport returns only a matching post-display acknowledgement', async () => {
  const transport = new DirectUsbTransport({
    pythonPath: process.execPath,
    toolPath: fixture,
    timeoutMs: 2000,
  });
  const result = await transport.send(message);
  assert.deepEqual(result, {
    status: 'displayed',
    devicePath: 'usb:1a86:7522',
    byteLength: Buffer.byteLength(`${JSON.stringify(message)}\n`),
    generatedAt: 1000,
  });
});
