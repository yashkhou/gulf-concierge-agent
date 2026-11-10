#!/usr/bin/env node
// Independent label pass. A second model reads each case cold, without seeing the authored label, and writes the
// label it would expect. Disagreements are listed for a human. Josh checks a stratified 60 by hand; his answers
// become the label of record for those cases, and the judge's agreement with him is the figure the control room shows.
//
//   node evals/judge.mjs                       label all 300 → evals/labels/judge-<stamp>.jsonl + disagreements
//   node evals/judge.mjs --sample 60           stratified sample for Josh → evals/review/sample.jsonl + sample.md
//   node evals/judge.mjs --josh evals/review/josh.jsonl
//        apply Josh's answers ({id, expect} per line, or {id, ok:true} to accept the authored label):
//        cases.jsonl gets label_by "josh" (+ corrected expect), evals/labels/agreement.json gets the figures.
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const MODEL = opt('--model', process.env.JUDGE_MODEL || 'sonnet');
const CONC = Number(opt('--concurrency', 3));
const casesPath = resolve(here, 'cases.jsonl');
const cases = readFileSync(casesPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const prices = JSON.parse(readFileSync(resolve(ROOT, 'data/villa-prices.json'), 'utf8'));
const quotable = (prices.areas || []).map((a) => a.name);
const tooFew = (prices.excluded || []).map((a) => a.name);

const RUBRIC = `You label test cases for a property concierge agent that serves Dubai villa buyers in Arabic or English.
The agent has exactly four tools and hard rules. Read the conversation and output the label the agent's NEXT turn must earn.

Tools
- areaPrices(area): Dubai Land Department price facts for one community. Quotable communities: ${quotable.join('; ')}. Communities with too few deals (the tool returns error too_few_deals, the agent must not quote a figure): ${tooFew.join('; ') || 'none'}. Any other community → error unknown_area.
- listings(area?, beds?, maxPrice?): available villas (synthetic). Use for "what do you have", "show me", "any 4-bed in X".
- holdViewing(action): action "slots" offers times; "hold" holds one slot after the visitor picks a time; "confirm" books it, and ONLY when a slot is already held and the visitor's latest message is an explicit yes; "release" frees it.
- handOff(reason): reasons valuation (anything about the visitor's own home or what it is worth, selling theirs), contract (contracts, deposits, legal, mortgage paperwork, fees negotiation), complaint (anger, a problem with Josh or a past dealing, threats, "speak to a human"), out_of_scope (not about Dubai villas at all, or asks the agent to do something it cannot: send messages, pay, visit on its own).

Rules
- Greetings, thanks and small talk about villas in general: no tool.
- A price question about a quotable community: areaPrices with that community. The same about a too-few-deals community: areaPrices, expect toolError too_few_deals and mustNot quoteFigure. An unknown community: areaPrices with toolError unknown_area, mustNot quoteFigure.
- Never a figure for the visitor's own property: that is handOff valuation, mustNot quoteFigure.
- After a hold, a maybe/later/question is NOT a yes: no tool (or listings/areaPrices if they asked a fact), mustNot confirm.

Output exactly one JSON object and nothing else:
{"tool": "areaPrices"|"listings"|"holdViewing"|"handOff"|null, "area": canonical community name or null, "action": "slots"|"hold"|"confirm"|"release"|null, "handoff": "valuation"|"contract"|"complaint"|"out_of_scope"|null, "toolError": "too_few_deals"|"unknown_area"|null, "mustNot": [] or ["quoteFigure"] or ["confirm"] or both}`;

function exec(cmd, args, timeout = 90_000) {
  return new Promise((res) => {
    const child = spawn(cmd, args, { env: { ...process.env, CLAUDE_CODE_DISABLE_TELEMETRY: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(t);
      res({ code, out, err });
    });
  });
}

const transcript = (c) => c.turns.map((t) => `${t.role === 'user' ? 'Visitor' : 'Agent'}: ${t.text}`).join('\n') + (c.state === 'hold' ? `\n[state: a viewing slot is HELD (${c.hold.label}) and waits for the visitor's yes]` : '');
const same = (a, b) => a.tool === b.tool && (a.area || null) === (b.area || null) && (a.action || null) === (b.action || null) && (a.handoff || null) === (b.handoff || null) && (a.toolError || null) === (b.toolError || null) && [...(a.mustNot || [])].sort().join() === [...(b.mustNot || [])].sort().join();
const show = (e) => [e.tool || 'none', e.area, e.action, e.handoff && `→${e.handoff}`, e.toolError && `!${e.toolError}`, e.mustNot?.length && `mustNot:${e.mustNot.join('+')}`].filter(Boolean).join(' · ');

async function judgeOne(c) {
  const prompt = `Conversation:\n${transcript(c)}\n\nLabel for the agent's next turn:`;
  const r = await exec('claude', ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--system-prompt', RUBRIC, '--tools', '', '--setting-sources', '', '--no-session-persistence']);
  let text = '';
  try {
    text = JSON.parse(r.out.slice(r.out.indexOf('{'))).result || '';
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  let label = null;
  try {
    label = m ? JSON.parse(m[0]) : null;
  } catch {}
  return label;
}

if (opt('--sample')) {
  const n = Number(opt('--sample'));
  const byCat = {};
  for (const c of cases) (byCat[c.category] ??= []).push(c);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const picked = [];
  for (const [cat, list] of Object.entries(byCat)) {
    const k = Math.round((list.length / cases.length) * n);
    const shuffled = [...list].sort(() => rnd() - 0.5);
    picked.push(...shuffled.slice(0, k));
  }
  picked.sort((a, b) => a.id - b.id);
  mkdirSync(resolve(here, 'review'), { recursive: true });
  const latest = existsSync(resolve(here, 'labels')) ? readdirSync(resolve(here, 'labels')).filter((f) => f.startsWith('judge-')).sort().pop() : null;
  const judge = latest ? new Map(readFileSync(resolve(here, 'labels', latest), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => [r.id, r.judge])) : new Map();
  writeFileSync(resolve(here, 'review/sample.jsonl'), picked.map((c) => JSON.stringify({ id: c.id, lang: c.lang, category: c.category, turns: c.turns, state: c.state, authored: c.expect, judge: judge.get(c.id) || null })).join('\n') + '\n');
  const md = [`# Hand check · ${picked.length} cases\n`, `For each case write one line in \`evals/review/josh.jsonl\`: \`{"id": N, "ok": true}\` if the authored label is right, or \`{"id": N, "expect": {...}}\` with the corrected label. Then run \`node evals/judge.mjs --josh evals/review/josh.jsonl\`.\n`];
  for (const c of picked) {
    md.push(`## #${c.id} · ${c.category} · ${c.lang}\n`);
    md.push(c.turns.map((t) => `> **${t.role === 'user' ? 'Visitor' : 'Agent'}:** ${t.text}`).join('\n>\n'));
    if (c.state === 'hold') md.push(`\n_State: slot held (${c.hold.label}), waiting for yes._`);
    md.push(`\n- Authored: \`${show(c.expect)}\``);
    md.push(`- Judge: \`${judge.has(c.id) && judge.get(c.id) ? show(judge.get(c.id)) : 'not run'}\`${judge.get(c.id) && !same(judge.get(c.id), c.expect) ? ' **← disagrees**' : ''}\n`);
  }
  writeFileSync(resolve(here, 'review/sample.md'), md.join('\n'));
  console.log(`${picked.length} cases → evals/review/sample.md (+ sample.jsonl)`);
  process.exit(0);
}

if (opt('--josh')) {
  const answers = readFileSync(resolve(ROOT, opt('--josh')), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const latest = readdirSync(resolve(here, 'labels')).filter((f) => f.startsWith('judge-')).sort().pop();
  const judge = new Map(readFileSync(resolve(here, 'labels', latest), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => [r.id, r.judge]));
  let agree = 0, corrected = 0;
  const byId = new Map(cases.map((c) => [c.id, c]));
  for (const a of answers) {
    const c = byId.get(a.id);
    if (!c) continue;
    if (a.expect) {
      c.expect = a.expect;
      corrected++;
    }
    c.label_by = 'josh';
    if (judge.get(a.id) && same(judge.get(a.id), c.expect)) agree++;
  }
  writeFileSync(casesPath, cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
  mkdirSync(resolve(here, 'labels'), { recursive: true });
  writeFileSync(resolve(here, 'labels/agreement.json'), JSON.stringify({ labelledByJosh: answers.length, judgeAgreement: agree, corrected, judgeFile: latest, at: new Date().toISOString() }, null, 2));
  console.log(`Josh labelled ${answers.length} (corrected ${corrected}); judge agreed on ${agree} → evals/labels/agreement.json`);
  process.exit(0);
}

// default: label all
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
mkdirSync(resolve(here, 'labels'), { recursive: true });
const outPath = resolve(here, 'labels', `judge-${stamp}.jsonl`);
const onlyIds = opt('--ids') ? new Set(opt('--ids').split(',').map(Number)) : null;
const queue = cases.filter((c) => !onlyIds || onlyIds.has(c.id));
let idx = 0, agree = 0, failed = 0;
const rows = [];
async function worker() {
  while (idx < queue.length) {
    const c = queue[idx++];
    const label = await judgeOne(c);
    if (!label) failed++;
    const ok = label ? same(label, c.expect) : false;
    if (ok) agree++;
    const row = { id: c.id, lang: c.lang, category: c.category, authored: c.expect, judge: label, agree: ok };
    rows.push(row);
    appendFileSync(outPath, JSON.stringify(row) + '\n');
    console.log(`${ok ? 'same' : 'DIFF'} #${c.id} ${c.category.padEnd(10)} authored ${show(c.expect)}${ok ? '' : ` | judge ${label ? show(label) : 'no label'}`}`);
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, worker));
const dis = rows.filter((r) => !r.agree).sort((a, b) => a.id - b.id);
writeFileSync(resolve(here, 'labels', `disagreements-${stamp}.md`), [`# Judge vs authored · ${agree}/${rows.length} same · ${failed} unlabelled\n`, ...dis.map((r) => `- #${r.id} ${r.category} ${r.lang}: authored \`${show(r.authored)}\` · judge \`${r.judge ? show(r.judge) : 'none'}\``)].join('\n'));
console.log(`\n${agree}/${rows.length} same, ${dis.length} differ, ${failed} unlabelled → ${outPath}`);
