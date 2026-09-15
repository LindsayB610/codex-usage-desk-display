import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { encodeDisplayMessage } from './protocol.mjs';

const CANDIDATE = /^(?:cu\.(?:usbmodem|usbserial|wchusbserial|SLAB_USBtoUART).*)$/;

function serialError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

export function selectSerialDevice(entries, exactDevicePath = null) {
  if (exactDevicePath !== null) {
    if (typeof exactDevicePath !== 'string' || !path.isAbsolute(exactDevicePath) || !exactDevicePath.startsWith('/dev/cu.')) {
      throw serialError('INVALID_SERIAL_DEVICE');
    }
    return exactDevicePath;
  }
  const matches = entries.filter(name => CANDIDATE.test(name)).sort().map(name => `/dev/${name}`);
  if (matches.length === 0) return null;
  if (matches.length > 1) throw serialError('AMBIGUOUS_SERIAL_DEVICE', `Pin devicePath; candidates: ${matches.join(', ')}`);
  return matches[0];
}

async function configureSerialDevice(devicePath, baudRate, spawnProcess = spawn) {
  await new Promise((resolve, reject) => {
    const child = spawnProcess('/bin/stty', ['-f', devicePath, String(baudRate), 'raw', '-echo'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-1024); });
    child.once('error', error => reject(serialError('SERIAL_CONFIG_FAILED', error.message)));
    child.once('exit', code => code === 0 ? resolve() : reject(serialError('SERIAL_CONFIG_FAILED', stderr.trim() || `stty exited ${code}`)));
  });
}

export class SerialTransport {
  constructor({
    devicePath = null,
    baudRate = 115200,
    connectDelayMs = 1500,
    configure = true,
    readDirectory = fs.readdir,
    openFile = fs.open,
    spawnProcess = spawn,
  } = {}) {
    this.exactDevicePath = devicePath;
    this.baudRate = baudRate;
    this.connectDelayMs = connectDelayMs;
    this.configure = configure;
    this.readDirectory = readDirectory;
    this.openFile = openFile;
    this.spawnProcess = spawnProcess;
    this.devicePath = null;
    this.handle = null;
  }

  async #connect() {
    const entries = this.exactDevicePath ? [] : await this.readDirectory('/dev');
    const devicePath = selectSerialDevice(entries, this.exactDevicePath);
    if (!devicePath) return null;
    if (this.handle && this.devicePath === devicePath) return devicePath;
    await this.close();
    if (this.configure) await configureSerialDevice(devicePath, this.baudRate, this.spawnProcess);
    const flags = constants.O_WRONLY | (constants.O_NOCTTY ?? 0) | (constants.O_NONBLOCK ?? 0);
    this.handle = await this.openFile(devicePath, flags);
    this.devicePath = devicePath;
    if (this.connectDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.connectDelayMs));
    return devicePath;
  }

  async send(message) {
    const devicePath = await this.#connect();
    if (!devicePath) return { status: 'waiting_for_device' };
    const line = encodeDisplayMessage(message);
    try {
      await this.handle.writeFile(line, 'utf8');
      return { status: 'written', devicePath, byteLength: Buffer.byteLength(line) };
    } catch (error) {
      await this.close();
      throw serialError('SERIAL_WRITE_FAILED', error.message);
    }
  }

  async close() {
    const handle = this.handle;
    this.handle = null;
    this.devicePath = null;
    if (handle) await handle.close().catch(() => {});
  }
}
