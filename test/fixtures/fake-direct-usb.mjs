#!/usr/bin/env node
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const message = JSON.parse(input);
  process.stdout.write(`${JSON.stringify({
    status: 'displayed',
    generatedAt: message.generatedAt,
    bytesWritten: Buffer.byteLength(input),
  })}\n`);
});
