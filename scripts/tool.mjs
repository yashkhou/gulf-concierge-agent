#!/usr/bin/env node
// Call one MCP tool directly, no model in the loop. Handy for checking area resolution and slot logic.
//   node scripts/tool.mjs areaPrices '{"area":"Emirates Hills"}'
//   node scripts/tool.mjs listings '{"area":"The Springs","beds":4}'
//   node scripts/tool.mjs holdViewing '{"action":"slots"}' --now 2026-11-10T09:00:00+04:00
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const nowIdx = argv.indexOf('--now');
const now = nowIdx >= 0 ? argv.splice(nowIdx, 2)[1] : null;
const [name, argsJson = '{}'] = argv;
if (!name) {
  console.error('usage: node scripts/tool.mjs <tool> [jsonArgs] [--now ISO]');
  process.exit(1);
}

const child = spawn(process.execPath, [resolve(here, '../relay/mcp.mjs')], {
  env: { ...process.env, CONCIERGE_DATA_DIR: resolve(here, '../data'), ...(now ? { CONCIERGE_NOW: now } : {}) },
  stdio: ['pipe', 'pipe', 'inherit'],
});
let buf = '';
child.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id === 2) {
        const text = msg.result?.content?.[0]?.text;
        console.log(text ? JSON.stringify(JSON.parse(text), null, 2) : JSON.stringify(msg, null, 2));
        child.kill();
        process.exit(0);
      }
    } catch {}
  }
});
const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'tool.mjs', version: '0' } } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: JSON.parse(argsJson) } });
setTimeout(() => {
  console.error('no reply');
  child.kill();
  process.exit(2);
}, 5000);
