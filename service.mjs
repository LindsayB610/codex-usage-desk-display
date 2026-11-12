import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CodexAppServerClient } from './app-server.mjs';
import { buildDisplayMessage, parseCreditBalance, selectCodexSnapshot } from './core.mjs';
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
    paidCreditFullBalance: value.paidCreditFullBalance ?? null,
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
  if (config.paidCreditFullBalance !== null
      && (!Number.isFinite(config.paidCreditFullBalance)
        || config.paidCreditFullBalance <= 0
        || config.paidCreditFullBalance > 1000000000)) throw serviceError('INVALID_CONFIG');
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

async function writePrivateJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temp = filePath + '.tmp-' + randomUUID();
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await fs.rename(temp, filePath);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

async function readCreditTracker(statePath) {
  let raw;
  try {
    raw = await fs.readFile(statePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let state;
  try { state = JSON.parse(raw); }
  catch { throw serviceError('INVALID_CREDIT_TRACKER'); }
  const automatic = state?.seed === null;
  if ((!automatic && (!Number.isFinite(state?.seed) || state.seed <= 0)) ||
      (!(automatic && state.full === null) && (!Number.isFinite(state.full) || state.full <= 0)) ||
      !Number.isFinite(state.balance) || state.balance < 0 || (state.full !== null && state.balance > state.full)) {
    throw serviceError('INVALID_CREDIT_TRACKER');
  }
  return state;
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

// Only the service writes this file. Snapshot and preview use the same calculation read-only.
export async function trackedDisplayMessage(response, config, options = {}, persist = false, onTrackerError = () => {}) {
  const message = buildDisplayMessage(response, { ...config, ...options });
  const seed = config.paidCreditFullBalance ?? null;
  const credits = selectCodexSnapshot(response).credits;
  const balance = parseCreditBalance(credits?.balance);
  if (balance === null || credits?.unlimited === true) return message;

  const statePath = config.healthPath + (seed == null ? '.auto-credits.json' : '.credits.json');
  let full;
  try {
    const previous = await readCreditTracker(statePath);
    const tracked = previous?.seed === seed;
    if (tracked) {
      full = balance > previous.balance ? balance : previous.full;
    } else {
      full = seed === null ? null : Math.max(seed, balance);
    }
    if (persist && (!tracked || balance !== previous.balance)) {
      await writePrivateJson(statePath, { seed, balance, full });
    }
  } catch (error) {
    onTrackerError(error.code === 'INVALID_CREDIT_TRACKER' ? error.code : 'CREDIT_TRACKER_IO_ERROR');
    // A storage error is different from waiting to observe a refill.
    return buildDisplayMessage(response, { ...config, ...options, paidCreditFullBalance: 0 });
  }
  return buildDisplayMessage(response, { ...config, ...options, paidCreditFullBalance: full });
}

async function collectReading({ client, config, nowEpochSeconds }) {
  const response = await client.readRateLimits();
  let trackerError = null;
  const message = await trackedDisplayMessage(response, config, { nowEpochSeconds }, true, code => { trackerError = code; });
  return { message, trackerError, balance: parseCreditBalance(selectCodexSnapshot(response).credits?.balance) };
}

export async function pollOnce({ client, transport, config, nowEpochSeconds = Math.floor(Date.now() / 1000) }) {
  const { message, trackerError } = await collectReading({ client, config, nowEpochSeconds });
  return { message, trackerError, delivery: await transport.send(message) };
}

export function nextDeliveryTimestamps(previous, generatedAt, status) {
  const sent = status === 'written' || status === 'displayed';
  return Object.freeze({
    lastSentSnapshotAt: sent ? generatedAt : previous.lastSentSnapshotAt,
    lastGoodSnapshotAt: status === 'displayed' ? generatedAt : previous.lastGoodSnapshotAt,
  });
}

export async function runService(config, { signal = null } = {}) {
  const value = validateConfig(config);
  let lastBalance = null;
  let lastHint = null;
  let hintPending = false;
  let wake = null;
  const clientOptions = {
    command: value.codexPath,
    onBalanceHint(raw) {
      const hint = parseCreditBalance(raw);
      if (hint !== null && hint !== lastBalance && hint !== lastHint) {
        lastHint = hint;
        hintPending = true;
        wake?.abort();
      }
    },
  };
  let client = new CodexAppServerClient(clientOptions);
  let nextDisplayAt = 0;
  const sampleIntervalMs = Math.min(60, value.pollIntervalSeconds) * 1000;
  const transport = value.transport === 'direct_ch340_usb'
    ? new DirectUsbTransport({ pythonPath: value.directUsbPythonPath })
    : new SerialTransport({
        devicePath: value.devicePath,
        baudRate: value.baudRate,
        connectDelayMs: value.connectDelayMs,
      });
  let stopped = signal?.aborted ?? false;
  let lastSentSnapshotAt = null;
  let lastGoodSnapshotAt = null;
  const stop = () => { stopped = true; wake?.abort(); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    while (!stopped) {
      const attemptedAt = Math.floor(Date.now() / 1000);
      try {
        hintPending = false;
        const result = await collectReading({ client, config: value, nowEpochSeconds: attemptedAt });
        if (lastBalance !== result.balance) lastHint = null;
        lastBalance = result.balance;
        if (Date.now() >= nextDisplayAt) {
          const delivery = await transport.send(result.message);
          ({ lastSentSnapshotAt, lastGoodSnapshotAt } = nextDeliveryTimestamps(
            { lastSentSnapshotAt, lastGoodSnapshotAt },
            result.message.generatedAt,
            delivery.status,
          ));
          await writePrivateJson(value.healthPath, {
            schemaVersion: 1,
            attemptedAt,
            status: delivery.status,
            devicePath: delivery.devicePath ?? null,
            lastSentSnapshotAt,
            lastGoodSnapshotAt,
            error: null,
            trackerError: result.trackerError,
          });
          nextDisplayAt = Date.now() + value.pollIntervalSeconds * 1000;
        } else if (result.trackerError) {
          const health = JSON.parse(await fs.readFile(value.healthPath, 'utf8'));
          await writePrivateJson(value.healthPath, { ...health, trackerError: result.trackerError });
        }
      } catch (error) {
        await client.close().catch(() => {});
        client = new CodexAppServerClient(clientOptions);
        nextDisplayAt = 0;
        await writePrivateJson(value.healthPath, {
          schemaVersion: 1,
          attemptedAt,
          status: 'error',
          devicePath: null,
          lastSentSnapshotAt,
          lastGoodSnapshotAt,
          error: { code: /^[A-Z0-9_]{1,64}$/.test(error.code ?? '') ? error.code : 'SERVICE_FAILED' },
        });
      }
      if (stopped) break;
      wake = new AbortController();
      const delay = Math.min(sampleIntervalMs, nextDisplayAt ? Math.max(0, nextDisplayAt - Date.now()) : sampleIntervalMs);
      if (!hintPending) await waitForDelay(delay, wake.signal);
      wake = null;
      // Coalesce bursts and bound read frequency, even if a read itself emits a hint.
      if (hintPending && !stopped) await waitForDelay(1000, signal);
    }
  } finally {
    await Promise.allSettled([client.close(), transport.close()]);
  }
}
