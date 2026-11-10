#!/usr/bin/env node
// Run one agent turn locally, without the Worker or the HTTP relay.
//   node scripts/turn.mjs "كم سعر الفلل في المرابع العربية؟"
//   node scripts/turn.mjs --state hold --slot 2026-11-14T10:00:00+04:00 "yes confirm"
//   echo '[{"role":"user","text":"hi"},{"role":"assistant","text":"Hello"},{"role":"user","text":"prices in springs?"}]' | node scripts/turn.mjs --json
import { runTurn } from '../relay/relay.mjs';

const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv.splice(i, 2)[1] : undefined;
};
const state = opt('--state') || 'open';
const slot = opt('--slot');
const now = opt('--now');
const json = argv.includes('--json');
let messages;
if (json) {
  argv.splice(argv.indexOf('--json'), 1);
  messages = JSON.parse(await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => r(s)); }));
} else {
  messages = [{ role: 'user', text: argv.join(' ') }];
}
const r = await runTurn({ threadId: 'local-test', messages, state, hold: slot ? { slot, confirmed: 0 } : null, now });
console.log(JSON.stringify(r, null, 2));
