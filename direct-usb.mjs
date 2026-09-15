import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeDisplayMessage } from './protocol.mjs';

const DEFAULT_TOOL_PATH = fileURLToPath(new URL('./firmware/crowpanel_tool.py', import.meta.url));

function directUsbError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

export class DirectUsbTransport {
  constructor({
    pythonPath,
    toolPath = DEFAULT_TOOL_PATH,
    timeoutMs = 45000,
    spawnProcess = spawn,
  } = {}) {
    if (typeof pythonPath !== 'string' || !path.isAbsolute(pythonPath)) {
      throw directUsbError('INVALID_DIRECT_USB_PYTHON');
    }
    if (typeof toolPath !== 'string' || !path.isAbsolute(toolPath)) {
      throw directUsbError('INVALID_DIRECT_USB_TOOL');
    }
    this.pythonPath = pythonPath;
    this.toolPath = toolPath;
    this.timeoutMs = timeoutMs;
    this.spawnProcess = spawnProcess;
  }

  async send(message) {
    const line = encodeDisplayMessage(message);
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(this.pythonPath, [this.toolPath, 'send', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish(reject, directUsbError('DIRECT_USB_TIMEOUT'));
      }, this.timeoutMs);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-4096); });
      child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4096); });
      child.once('error', error => finish(reject, directUsbError('DIRECT_USB_START_FAILED', error.message)));
      child.once('exit', code => {
        if (settled) return;
        if (code !== 0) {
          finish(reject, directUsbError('DIRECT_USB_SEND_FAILED', stderr.trim() || `USB helper exited ${code}`));
          return;
        }
        let acknowledgement;
        try { acknowledgement = JSON.parse(stdout); }
        catch { finish(reject, directUsbError('DIRECT_USB_INVALID_ACK')); return; }
        if (acknowledgement.status !== 'displayed' || acknowledgement.generatedAt !== message.generatedAt) {
          finish(reject, directUsbError('DIRECT_USB_INVALID_ACK'));
          return;
        }
        finish(resolve, {
          status: 'displayed',
          devicePath: 'usb:1a86:7522',
          byteLength: Buffer.byteLength(line),
          generatedAt: acknowledgement.generatedAt,
        });
      });
      child.stdin.end(line, 'utf8');
    });
  }

  async close() {}
}
