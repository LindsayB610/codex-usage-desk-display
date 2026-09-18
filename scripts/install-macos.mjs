#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const label = 'com.example.codex-usage-display';
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = path.join(os.homedir(), 'Library', 'Application Support', 'Codex Usage Desk Display');
const launchAgents = path.join(os.homedir(), 'Library', 'LaunchAgents');
const plistPath = path.join(launchAgents, `${label}.plist`);
const configPath = path.join(state, 'config.json');
const dryRun = process.argv.includes('--dry-run');
const replace = process.argv.includes('--replace');

function executable(name) {
  try { return execFileSync('/usr/bin/which', [name], { encoding: 'utf8' }).trim(); }
  catch { return null; }
}

function xml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function validPaidCreditFullBalance(value) {
  return Number.isFinite(value) && value > 0 && value <= 1000000000;
}

function readExistingPaidCreditFullBalance() {
  if (!replace || !fs.existsSync(configPath)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(configPath, 'utf8')).paidCreditFullBalance;
    return validPaidCreditFullBalance(value) ? value : null;
  } catch {
    return null;
  }
}

function resolvePaidCreditFullBalance() {
  const raw = process.env.CODEX_PAID_CREDIT_FULL_BALANCE;
  if (raw === undefined) return readExistingPaidCreditFullBalance();
  if (raw === '' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'none') return null;
  const value = Number(raw);
  if (!validPaidCreditFullBalance(value)) {
    throw new Error('CODEX_PAID_CREDIT_FULL_BALANCE must be a positive number, null, or none.');
  }
  return value;
}

const codexPath = process.env.CODEX_BIN
  || executable('codex')
  || '/Applications/ChatGPT.app/Contents/Resources/codex';
if (!path.isAbsolute(codexPath) || !fs.existsSync(codexPath)) {
  throw new Error('Could not find Codex. Set CODEX_BIN to its absolute path.');
}
const appServerCheck = spawnSync(codexPath, ['app-server', '--help'], {
  encoding: 'utf8',
  timeout: 10000,
});
if (appServerCheck.status !== 0) throw new Error('This Codex build does not provide app-server.');

const python = executable('python3');
if (!python) throw new Error('python3 is required.');
const venvPython = path.join(repository, '.venv', 'bin', 'python');
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const paidCreditFullBalance = resolvePaidCreditFullBalance();
const config = {
  schemaVersion: 1,
  codexPath,
  transport: 'direct_ch340_usb',
  directUsbPythonPath: venvPython,
  devicePath: null,
  baudRate: 115200,
  connectDelayMs: 1500,
  pollIntervalSeconds: 300,
  timeZone,
  paidCreditFullBalance,
  healthPath: path.join(state, 'health.json'),
};
const template = fs.readFileSync(
  path.join(repository, 'launchd', 'com.example.codex-usage-display.plist.template'),
  'utf8',
);
const plist = template
  .replaceAll('__NODE_PATH__', xml(process.execPath))
  .replaceAll('__REPOSITORY_PATH__', xml(repository))
  .replaceAll('__STATE_PATH__', xml(state));

if (dryRun) {
  process.stdout.write(`${JSON.stringify({ repository, state, plistPath, codexPath, nodePath: process.execPath, python, timeZone, paidCreditFullBalance }, null, 2)}\n`);
  process.exit(0);
}
if (!replace && (fs.existsSync(configPath) || fs.existsSync(plistPath))) {
  throw new Error('An installation already exists. Re-run with --replace to update it.');
}

fs.mkdirSync(state, { recursive: true, mode: 0o700 });
fs.mkdirSync(launchAgents, { recursive: true });
fs.chmodSync(state, 0o700);
execFileSync(python, ['-m', 'venv', path.join(repository, '.venv')], { stdio: 'inherit' });
execFileSync(venvPython, ['-m', 'pip', 'install', '-r', path.join(repository, 'requirements.txt')], { stdio: 'inherit' });
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
fs.writeFileSync(plistPath, plist, { mode: 0o600 });
fs.chmodSync(configPath, 0o600);
fs.chmodSync(plistPath, 0o600);

const domain = `gui/${process.getuid()}`;
spawnSync('/bin/launchctl', ['bootout', `${domain}/${label}`], { stdio: 'ignore' });
execFileSync('/bin/launchctl', ['bootstrap', domain, plistPath], { stdio: 'inherit' });
process.stdout.write(`${JSON.stringify({ status: 'installed', plistPath, configPath }, null, 2)}\n`);
