import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

function appError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

export class CodexAppServerClient {
  constructor({
    command = process.env.CODEX_BIN || 'codex',
    args = ['app-server', '--stdio'],
    timeoutMs = 15000,
    spawnProcess = spawn,
  } = {}) {
    this.command = command;
    this.args = args;
    this.timeoutMs = timeoutMs;
    this.spawnProcess = spawnProcess;
    this.nextId = 1;
    this.pending = new Map();
    this.child = null;
    this.startPromise = null;
    this.stderr = '';
    this.closing = false;
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.#start();
    try { await this.startPromise; }
    catch (error) { this.startPromise = null; throw error; }
  }

  async #start() {
    this.closing = false;
    const child = this.spawnProcess(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { this.stderr = `${this.stderr}${chunk}`.slice(-4096); });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', line => this.#onLine(line));
    child.once('error', error => this.#failAll(appError('APP_SERVER_START_FAILED', error.message)));
    child.once('exit', (code, signal) => {
      this.child = null;
      if (!this.closing) this.#failAll(appError('APP_SERVER_EXITED', `Codex app-server exited (${code ?? signal ?? 'unknown'})`));
    });
    await this.#request('initialize', {
      clientInfo: { name: 'codex-usage-desk-display', title: 'Codex Usage Desk Display', version: '0.1.0' },
      capabilities: { optOutNotificationMethods: ['account/rateLimits/updated'] },
    });
    this.#notify('initialized');
  }

  #onLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (!Object.hasOwn(message, 'id')) return;
    const pending = this.pending.get(String(message.id));
    if (!pending) return;
    this.pending.delete(String(message.id));
    clearTimeout(pending.timer);
    if (message.error) pending.reject(appError('APP_SERVER_REQUEST_FAILED', message.error.message ?? 'Codex request failed'));
    else pending.resolve(message.result);
  }

  #notify(method, params) {
    if (!this.child?.stdin?.writable) throw appError('APP_SERVER_NOT_RUNNING');
    const message = params === undefined ? { method } : { method, params };
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #request(method, params = null) {
    if (!this.child?.stdin?.writable) return Promise.reject(appError('APP_SERVER_NOT_RUNNING'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(appError('APP_SERVER_TIMEOUT', `${method} timed out`));
      }, this.timeoutMs);
      this.pending.set(String(id), { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  #failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async readRateLimits() {
    await this.start();
    return this.#request('account/rateLimits/read', { excludeResetCreditDetails: true });
  }

  async close() {
    this.closing = true;
    const child = this.child;
    this.child = null;
    this.startPromise = null;
    this.#failAll(appError('APP_SERVER_CLOSED'));
    if (!child) return;
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 1000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
