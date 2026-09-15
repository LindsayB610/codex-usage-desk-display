import * as fs from 'node:fs/promises';
import path from 'node:path';
import { CodexAppServerClient } from './app-server.mjs';
import { buildDisplayMessage } from './core.mjs';
import { DirectUsbTransport } from './direct-usb.mjs';
import { SerialTransport } from './serial.mjs';

function serviceError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw serviceError('INVALID_CONFIG');
  const config = {
    schemaVersion: value.schemaVersion,
    codexPath: value.codexPath,
    transport: value.transport ?? 'serial',
    directUsbPythonPath: value.directUsbPythonPath ?? null,
    devicePath: value.devicePath ?? null,
    baudRate: value.baudRate ?? 115200,
    connectDelayMs: value.connectDelayMs ?? 1500,
    pollIntervalSeconds: value.pollIntervalSeconds ?? 300,
    timeZone: value.timeZone ?? 'America/Los_Angeles',
    healthPath: value.healthPath,
  };
  if (config.schemaVersion !== 1 || typeof config.codexPath !== 'string' || !path.isAbsolute(config.codexPath)) throw serviceError('INVALID_CONFIG');
  if (!['serial', 'direct_ch340_usb'].includes(config.transport)) throw serviceError('INVALID_CONFIG');
  if (config.transport === 'direct_ch340_usb' && (typeof config.directUsbPythonPath !== 'string' || !path.isAbsolute(config.directUsbPythonPath))) throw serviceError('INVALID_CONFIG');
  if (config.transport === 'serial' && config.directUsbPythonPath !== null) throw serviceError('INVALID_CONFIG');
  if (config.devicePath !== null && (typeof config.devicePath !== 'string' || !path.isAbsolute(config.devicePath))) throw serviceError('INVALID_CONFIG');
  if (!Number.isInteger(config.baudRate) || config.baudRate < 1200 || config.baudRate > 2000000) throw serviceError('INVALID_CONFIG');
  if (!Number.isInteger(config.connectDelayMs) || config.connectDelayMs < 0 || config.connectDelayMs > 10000) throw serviceError('INVALID_CONFIG');
  if (!Number.isInteger(config.pollIntervalSeconds) || config.pollIntervalSeconds < 30 || config.pollIntervalSeconds > 3600) throw serviceError('INVALID_CONFIG');
  if (typeof config.timeZone !== 'string' || config.timeZone.length > 80) throw serviceError('INVALID_CONFIG');
  try { new Intl.DateTimeFormat('en-US', { timeZone: config.timeZone }).format(); } catch { throw serviceError('INVALID_CONFIG'); }
  if (typeof config.healthPath !== 'string' || !path.isAbsolute(config.healthPath) || !config.healthPath.endsWith('.json')) throw serviceError('INVALID_CONFIG');
  return Object.freeze(config);
}

export async function readConfig(configPath) {
  if (typeof configPath !== 'string' || !path.isAbsolute(configPath)) throw serviceError('INVALID_CONFIG_PATH');
  let value;
  try { value = JSON.parse(await fs.readFile(configPath, 'utf8')); }
  catch { throw serviceError('INVALID_CONFIG'); }
  return validateConfig(value);
}

async function writeHealth(healthPath, value) {
  await fs.mkdir(path.dirname(healthPath), { recursive: true, mode: 0o700 });
  const temp = `${healthPath}.tmp-${process.pid}`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, healthPath);
}

async function waitForDelay(milliseconds, signal) {
  if (signal?.aborted) return;
  await new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

export async function pollOnce({ client, transport, config, nowEpochSeconds = Math.floor(Date.now() / 1000) }) {
  const response = await client.readRateLimits();
  const message = buildDisplayMessage(response, {
    nowEpochSeconds,
    timeZone: config.timeZone,
  });
  const delivery = await transport.send(message);
  return { message, delivery };
}

export async function runService(config, { signal = null } = {}) {
  const value = validateConfig(config);
  let client = new CodexAppServerClient({ command: value.codexPath });
  const transport = value.transport === 'direct_ch340_usb'
    ? new DirectUsbTransport({ pythonPath: value.directUsbPythonPath })
    : new SerialTransport({
        devicePath: value.devicePath,
        baudRate: value.baudRate,
        connectDelayMs: value.connectDelayMs,
      });
  let stopped = signal?.aborted ?? false;
  let lastGoodSnapshotAt = null;
  const stop = () => { stopped = true; };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    while (!stopped) {
      const attemptedAt = Math.floor(Date.now() / 1000);
      try {
        const result = await pollOnce({ client, transport, config: value, nowEpochSeconds: attemptedAt });
        lastGoodSnapshotAt = result.message.generatedAt;
        await writeHealth(value.healthPath, {
          schemaVersion: 1,
          attemptedAt,
          status: result.delivery.status,
          devicePath: result.delivery.devicePath ?? null,
          lastGoodSnapshotAt,
          error: null,
        });
      } catch (error) {
        await client.close().catch(() => {});
        client = new CodexAppServerClient({ command: value.codexPath });
        await writeHealth(value.healthPath, {
          schemaVersion: 1,
          attemptedAt,
          status: 'error',
          devicePath: null,
          lastGoodSnapshotAt,
          error: { code: /^[A-Z0-9_]{1,64}$/.test(error.code ?? '') ? error.code : 'SERVICE_FAILED' },
        });
      }
      if (stopped) break;
      await waitForDelay(value.pollIntervalSeconds * 1000, signal);
    }
  } finally {
    await Promise.allSettled([client.close(), transport.close()]);
  }
}
