#!/usr/bin/env node
// Eval runner. Every case in evals/cases.jsonl goes through the real agent turn (relay/relay.mjs → claude -p → the
// four MCP tools), then a deterministic grader compares what the tools actually did with the case's label.
// Nothing here is judged by a model: a case passes or fails on tool calls, resolved area, action, hand-off reason,
// tool error and the must-not rules. Results land in evals/runs/<stamp>/ and, with --post, in the control room.
//
//   node evals/run.mjs                         all 300, 3 at a time
//   node evals/run.mjs --ids 1,2,171           a few cases
//   node evals/run.mjs --category viewing      one category
//   node evals/run.mjs --resume evals/runs/X   finish an interrupted run (done cases are skipped)
//   node evals/run.mjs --regrade evals/runs/X  re-grade a finished run with the current grader and labels (no model calls)
//   node evals/run.mjs --post                  also POST the run to $BASE_URL/api/eval-runs
//
// Hand-off emails are disabled for eval runs (NOTIFY_TO is blanked before the relay module loads).
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const flag = (k) => argv.includes(k);

const NOW = opt('--now', '2026-11-10T09:00:00+04:00'); // fixed clock so slot offers are stable
const CONC = Number(opt('--concurrency', 3));
const onlyIds = opt('--ids') ? new Set(opt('--ids').split(',').map(Number)) : null;
const onlyCat = opt('--category');
const limit = Number(opt('--limit', 0));
const resumeDir = opt('--resume');
const regradeDir = opt('--regrade');

const cases = readFileSync(resolve(here, 'cases.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const byId = new Map(cases.map((c) => [c.id, c]));
const aliases = JSON.parse(readFileSync(resolve(ROOT, 'data/area-aliases.json'), 'utf8'));
const prices = JSON.parse(readFileSync(resolve(ROOT, 'data/villa-prices.json'), 'utf8'));
const knownAreas = [...(prices.areas || []), ...(prices.excluded || [])].map((a) => a.name);
const fixes = existsSync(resolve(here, 'fixes.json')) ? JSON.parse(readFileSync(resolve(here, 'fixes.json'), 'utf8')) : {};

const dirArg = resumeDir || regradeDir;
const stamp = dirArg ? dirArg.replace(/\/$/, '').split('/').pop() : new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const outDir = dirArg ? resolve(ROOT, dirArg) : resolve(here, 'runs', stamp);
mkdirSync(outDir, { recursive: true });
const resultsPath = resolve(outDir, 'results.jsonl');
const readRows = () => (existsSync(resultsPath) ? readFileSync(resultsPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const done = new Map(readRows().map((r) => [r.id, r]));

// ---------- grading ----------
const norm = (s) => String(s || '').toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, ' ').trim();
function canonArea(s) {
  if (!s) return null;
  const raw = String(s).trim();
  if (aliases[raw]) return aliases[raw];
  if (aliases[raw.toLowerCase()]) return aliases[raw.toLowerCase()];
  // Exact or alias only: "Arabian Ranches II" must never grade as Arabian Ranches.
  return knownAreas.find((a) => norm(a) === norm(raw)) || raw;
}
const YEAR_OR_TIME = /\b20\d\d\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(am|pm|صباحاً|مساءً)/gi;
// Thousands, big integers, Arabic-digit figures, "2.4m / 500k", and percentages ("4%", "10 ٪") so a handed-off fee
// question that still says "the transfer fee is 4%" counts as a quoted figure.
const FIGURE = /\d{1,3}(,\d{3})+|\d{3,}|[٠-٩]{3,}|\d+(\.\d+)?\s*(m|million|مليون|k)\b|[\d٠-٩]+(\.\d+)?\s*(%|٪|بالمئة|بالمائة|percent)/i;
const quotesFigure = (text) => FIGURE.test(String(text || '').replace(YEAR_OR_TIME, ' '));

// r = { reply, toolCalls:[{tool,args,ok,error,area,action}], handoff?, isError }
export function grade(c, r) {
  const e = c.expect;
  const allow = new Set(e.allow || []);
  const calls = r.toolCalls || [];
  const names = calls.map((x) => x.tool);
  const primary = names.includes('handOff') ? 'handOff' : names.includes('holdViewing') ? 'holdViewing' : names.includes('listings') ? 'listings' : names.includes('areaPrices') ? 'areaPrices' : null;

  // The model may try an alias, get unknown_area and retry: judge the call that produced the answer, i.e. the last
  // successful call of the expected tool (else its last call, else the last call that named an area).
  const expCalls = e.tool ? calls.filter((x) => x.tool === e.tool) : calls;
  const best = [...expCalls].reverse().find((x) => x.ok) || expCalls.at(-1) || [...calls].reverse().find((x) => x.area || x.args?.area) || null;
  const gotArea = canonArea(best?.area || best?.args?.area);
  const actions = calls.filter((x) => x.tool === 'holdViewing').map((x) => x.action || x.args?.action);
  const gotAction = actions.includes('confirm') ? 'confirm' : actions.includes('hold') ? 'hold' : actions.includes('release') ? 'release' : actions.includes('slots') ? 'slots' : null;
  const gotHandoff = r.handoff?.reason || calls.find((x) => x.tool === 'handOff' && x.ok !== false)?.args?.reason || null;
  const gotErr = e.toolError ? calls.find((x) => x.error === e.toolError)?.error || expCalls.at(-1)?.error || null : best?.error || null;
  const isError = Boolean(r.isError) || (r.causes || []).includes('turn_error');

  const fails = [];
  if (isError) fails.push('turn_error');
  if (e.tool === null && primary !== null && !names.every((n) => allow.has(n))) fails.push('extra_tool');
  if (e.tool !== null && !names.includes(e.tool)) fails.push(primary ? 'wrong_tool' : 'no_tool');
  if (e.area && gotArea !== e.area) fails.push('wrong_area');
  if (e.action && gotAction !== e.action) fails.push('wrong_action');
  if (e.handoff && gotHandoff !== e.handoff) fails.push(gotHandoff ? 'wrong_handoff_reason' : 'missed_handoff');
  if (!e.handoff && gotHandoff) fails.push('false_handoff');
  if (e.toolError && gotErr !== e.toolError && !(e.tool === null && expCalls.length === 0)) fails.push('missing_tool_error');
  if (e.mustNot?.includes('confirm') && actions.includes('confirm')) fails.push('confirmed_without_yes');
  if (e.mustNot?.includes('quoteFigure') && quotesFigure(r.reply)) fails.push('quoted_figure');

  const fmt = (tool, area, action, handoff, err) => [tool || 'none', area, action, handoff && `→${handoff}`, err && `!${err}`].filter(Boolean).join(' · ');
  return {
    passed: fails.length === 0,
    cause: fails[0] || null,
    causes: fails,
    expected: fmt(e.tool, e.area, e.action, e.handoff, e.toolError),
    got: fmt(primary, gotArea, gotAction, gotHandoff, gotErr),
    handoffExpected: Boolean(e.handoff),
    handoffCaught: Boolean(e.handoff) && gotHandoff === e.handoff,
  };
}

// ---------- run or regrade ----------
const t0 = Date.now();
if (regradeDir) {
  const rows = readRows();
  const out = rows.map((row) => {
    const c = byId.get(row.id);
    if (!c) return row;
    const g = grade(c, row);
    return { ...row, labelBy: c.label_by, ...g };
  });
  writeFileSync(resultsPath, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  done.clear();
  for (const r of out) done.set(r.id, r);
  console.log(`regraded ${out.length} rows in ${outDir}`);
} else {
  process.env.RELAY_TOKEN ||= 'eval-local';
  process.env.NOTIFY_TO = '';
  const { runTurn } = await import('../relay/relay.mjs');

  let queue = cases.filter((c) => (!onlyIds || onlyIds.has(c.id)) && (!onlyCat || c.category === onlyCat) && !done.has(c.id));
  if (limit) queue = queue.slice(0, limit);
  const total = done.size + queue.length;
  console.log(`run ${stamp}: ${queue.length} to do, ${done.size} already done, ${CONC} at a time → ${outDir}`);

  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const c = queue[idx++];
      const started = Date.now();
      let r;
      try {
        r = await runTurn({ threadId: `eval-${c.id}`, messages: c.turns, state: c.state || 'open', hold: c.hold || null, now: NOW });
      } catch (err) {
        r = { reply: '', toolCalls: [], handoff: null, isError: true, latencyMs: Date.now() - started, costUsd: 0, model: null, stderr: String(err.message) };
      }
      const g = grade(c, r);
      const row = { id: c.id, lang: c.lang, category: c.category, labelBy: c.label_by, ...g, latencyMs: r.latencyMs, costUsd: r.costUsd, model: r.model, isError: Boolean(r.isError), reply: r.reply, toolCalls: r.toolCalls, handoff: r.handoff || null, stderr: r.stderr };
      done.set(c.id, row);
      appendFileSync(resultsPath, JSON.stringify(row) + '\n');
      console.log(`${g.passed ? 'PASS' : 'FAIL'} #${c.id} ${c.lang} ${c.category.padEnd(10)} ${(r.latencyMs / 1000).toFixed(1)}s ${g.passed ? '' : `(${g.causes.join(',')}) got ${g.got}`}  [${done.size}/${total}]`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, queue.length) }, worker));
}

// ---------- report ----------
const rows = [...done.values()].sort((a, b) => a.id - b.id);
const lat = rows.filter((r) => !r.causes.includes('turn_error') && r.latencyMs).map((r) => r.latencyMs).sort((a, b) => a - b);
const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : null);
const byCat = {};
for (const r of rows) {
  byCat[r.category] ??= { cases: 0, passed: 0 };
  byCat[r.category].cases++;
  if (r.passed) byCat[r.category].passed++;
}
let gitSha = '';
try {
  gitSha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {}
const model = rows.find((r) => r.model)?.model || process.env.CONCIERGE_MODEL || 'sonnet';
const prev = existsSync(resolve(outDir, 'report.json')) ? JSON.parse(readFileSync(resolve(outDir, 'report.json'), 'utf8')) : null;
const report = {
  ranAt: prev?.ranAt || new Date().toISOString(),
  regradedAt: regradeDir ? new Date().toISOString() : prev?.regradedAt,
  stamp,
  model,
  gitSha,
  cases: rows.length,
  passed: rows.filter((r) => r.passed).length,
  handoffsTotal: rows.filter((r) => r.handoffExpected).length,
  handoffsCaught: rows.filter((r) => r.handoffCaught).length,
  p50Ms: pct(0.5),
  p90Ms: pct(0.9),
  costUsd: Number(rows.reduce((s, r) => s + (r.costUsd || 0), 0).toFixed(4)),
  byCategory: byCat,
  byLang: ['ar', 'en'].map((l) => ({ lang: l, cases: rows.filter((r) => r.lang === l).length, passed: rows.filter((r) => r.lang === l && r.passed).length })),
  failures: rows.filter((r) => !r.passed).map((r) => ({ id: r.id, lang: r.lang, category: r.category, expected: r.expected, got: r.got, causes: r.causes, cause: fixes[r.id]?.cause || r.cause, fix: fixes[r.id]?.fix || null, reply: (r.reply || '').slice(0, 300) })),
  wallClockS: regradeDir ? prev?.wallClockS : Math.round((Date.now() - t0) / 1000),
};
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.passed}/${report.cases} passed · hand-offs ${report.handoffsCaught}/${report.handoffsTotal} · p50 ${report.p50Ms} ms · $${report.costUsd}${report.wallClockS ? ` · ${report.wallClockS}s` : ''}`);
for (const [k, v] of Object.entries(byCat)) console.log(`  ${k.padEnd(11)} ${v.passed}/${v.cases}`);
console.log(`report: ${resolve(outDir, 'report.json')}`);

// ---------- post ----------
if (flag('--post')) {
  const envFile = resolve(homedir(), '.config/concierge/admin.env');
  const env = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => l.split('=').map((s) => s.trim())));
  const agreement = existsSync(resolve(here, 'labels/agreement.json')) ? JSON.parse(readFileSync(resolve(here, 'labels/agreement.json'), 'utf8')) : {};
  const payload = {
    ranAt: report.ranAt,
    model,
    cases: rows.map((r) => ({ id: r.id, lang: r.lang, category: r.category, labelBy: r.labelBy, passed: r.passed, expected: r.expected, got: r.got, cause: r.passed ? null : fixes[r.id]?.cause || r.cause, fix: r.passed ? null : fixes[r.id]?.fix || null, handoffExpected: r.handoffExpected, handoffCaught: r.handoffCaught })),
    labelledByJosh: agreement.labelledByJosh ?? rows.filter((r) => r.labelBy === 'josh').length,
    judgeAgreement: agreement.judgeAgreement ?? null,
    p50Ms: report.p50Ms,
    costUsd: report.costUsd,
    gitSha,
    reportUrl: `https://github.com/yashkhou/gulf-concierge-agent/blob/main/evals/runs/${stamp}/report.json`,
  };
  const res = await fetch(`${env.BASE_URL || 'https://agent.yashkhou.com'}/api/eval-runs`, { method: 'POST', headers: { authorization: `Bearer ${env.ADMIN_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  console.log('posted:', res.status, await res.text());
}
