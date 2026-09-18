#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodexAppServerClient } from './app-server.mjs';
import { buildDisplayMessage } from './core.mjs';
import { renderDisplaySvg } from './render.mjs';
import { readConfig, runService } from './service.mjs';

const DEFAULT_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex';

function safeError(error) {
  const value = {
    code: /^[A-Z0-9_]{1,64}$/.test(error.code ?? '') ? error.code : 'CODEX_USAGE_DISPLAY_FAILED',
  };
  if (process.env.CODEX_USAGE_DISPLAY_DEBUG === '1') {
    value.detail = String(error.message ?? error).slice(0, 4096);
  }
  return { error: value };
}

async function snapshot() {
  const config = process.env.CODEX_USAGE_DISPLAY_CONFIG
    ? await readConfig(path.resolve(process.env.CODEX_USAGE_DISPLAY_CONFIG))
    : null;
  const codexPath = config?.codexPath ?? process.env.CODEX_BIN ?? DEFAULT_CODEX;
  const client = new CodexAppServerClient({ command: codexPath });
  try {
    return buildDisplayMessage(await client.readRateLimits(), {
      timeZone: config?.timeZone,
      paidCreditFullBalance: config?.paidCreditFullBalance,
    });
  }
  finally { await client.close(); }
}

export async function main(argv = process.argv.slice(2)) {
  const [command, argument] = argv;
  if (command === 'snapshot' && argv.length === 1) {
    process.stdout.write(`${JSON.stringify(await snapshot(), null, 2)}\n`);
    return;
  }
  if (command === 'preview' && argv.length <= 2) {
    const svg = renderDisplaySvg(await snapshot());
    if (!argument) process.stdout.write(svg);
    else {
      const output = path.resolve(argument);
      if (output === '/' || !output.endsWith('.svg')) throw Object.assign(new Error('Preview path must end in .svg'), { code: 'INVALID_PREVIEW_PATH' });
      await fs.writeFile(output, svg, { flag: 'wx', mode: 0o600 });
      process.stdout.write(`${JSON.stringify({ status: 'created', output })}\n`);
    }
    return;
  }
  if (command === 'serve' && argv.length === 2) {
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    await runService(await readConfig(path.resolve(argument)), { signal: controller.signal });
    return;
  }
  throw Object.assign(new Error('Usage: cli.mjs snapshot | preview [new.svg] | serve /absolute/config.json'), { code: 'INVALID_COMMAND' });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify(safeError(error))}\n`);
    process.exitCode = 1;
  }
}
