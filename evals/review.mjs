// Builds the one-click hand-check page for the 60-case sample: evals/review/review.html.
// Josh ticks "Right", "Judge is right" or fixes the label; the page keeps answers in localStorage and copies or
// downloads evals/review/josh.jsonl, which `node evals/judge.mjs --josh evals/review/josh.jsonl` reads.
//
//   node evals/judge.mjs --sample 60 && node evals/review.mjs && open evals/review/review.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const rows = readFileSync(resolve(here, 'review/sample.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const prices = JSON.parse(readFileSync(resolve(ROOT, 'data/villa-prices.json'), 'utf8'));
const areas = [...prices.areas.map((a) => a.name), ...(prices.excluded || []).map((a) => a.name)].sort();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hand check · ${rows.length} cases · Gulf Concierge</title>
<link rel="icon" href="data:,">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400..600&family=Onest:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  --paper:#FBF8F3;--paper2:#F3ECE2;--card:#FFFEFC;--ink:#1E1B18;--ink2:#463F38;--mute:#5E554C;--line:#E9E1D6;
  --tom:#E5533D;--tomDeep:#B93A26;--tomSoft:#FCE3DA;--green:#2C7A50;--greenSoft:#DFF1E5;--amber:#9A6B14;--amberSoft:#F6E7C4;
  --sans:"Onest",system-ui,-apple-system,sans-serif;--serif:"Fraunces",Georgia,serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --r:20px;--r2:12px;--shadow:0 1px 2px rgba(30,27,24,.06),0 12px 40px -18px rgba(30,27,24,.25);
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.5}
button{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:8px 16px;min-height:44px}
button:hover{border-color:var(--ink2)}
button:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--tom);outline-offset:2px}
button.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
button.primary:hover{background:var(--ink2)}
button.accent{background:var(--tom);color:#fff;border-color:var(--tom)}
button.accent:hover{background:var(--tomDeep)}
button[disabled]{opacity:.45;cursor:default}
kbd{font-family:var(--mono);font-size:13px;background:var(--paper2);border:1px solid var(--line);border-radius:6px;padding:1px 6px;margin-left:8px;color:var(--ink2)}
.k{white-space:nowrap}
.sub .k kbd:first-child{margin-left:0}
.wrap{max-width:1120px;margin:0 auto;padding:32px 24px 64px}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:24px}
h1{font-family:var(--serif);font-weight:400;font-size:40px;line-height:1.1;margin:0;letter-spacing:-.01em}
h1 em{font-style:italic;color:var(--tom)}
.sub{color:var(--mute);margin:8px 0 0;max-width:60ch}
.tools{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.progress{display:flex;align-items:center;gap:12px;color:var(--ink2);font-size:14px}
.bar{width:160px;height:8px;background:var(--paper2);border-radius:999px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--green);width:0;transition:width .3s}
.grid{display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:28px}
.meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:14px;color:var(--mute);margin-bottom:20px}
.meta b{color:var(--ink);font-weight:600;font-size:14px}
.tag{border:1px solid var(--line);border-radius:999px;padding:3px 12px;background:var(--paper)}
.chat{display:flex;flex-direction:column;gap:12px;margin-bottom:24px}
.msg{max-width:78%;padding:12px 16px;border-radius:18px;font-size:18px;line-height:1.5}
.msg.user{align-self:flex-start;background:var(--paper2);border-bottom-left-radius:6px}
.msg.agent{align-self:flex-end;background:var(--card);border:1px solid var(--line);border-bottom-right-radius:6px}
.state{font-size:16px;color:var(--amber);background:var(--amberSoft);border-radius:var(--r2);padding:10px 14px;margin-bottom:20px}
.labels{display:grid;gap:12px;margin-bottom:24px}
.label{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;padding:14px 16px;border-radius:var(--r2);border:1px solid var(--line);background:var(--paper)}
.label .who{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);min-width:76px;font-weight:600}
.label code{font-family:var(--mono);font-size:14px;color:var(--ink)}
.label.differs{border-color:var(--tom);background:var(--tomSoft)}
.label.same{color:var(--green)}
.actions{display:flex;gap:12px;flex-wrap:wrap}
.fix{margin-top:20px;padding:20px;border-radius:var(--r2);background:var(--paper2);display:none}
.fix.open{display:block}
.row{display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:center;margin-bottom:12px}
.row label{font-size:14px;color:var(--ink2)}
.seg{display:flex;gap:6px;flex-wrap:wrap}
.seg button{padding:8px 14px;min-height:40px;font-size:14px}
.seg button[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
input[type=text],select{font:inherit;min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);width:100%;max-width:360px}
.checks{display:flex;gap:16px;flex-wrap:wrap;font-size:14px}
.checks label{display:flex;gap:8px;align-items:center;min-height:44px}
.checks input{width:20px;height:20px;accent-color:var(--tom)}
.nav{position:sticky;top:24px}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px;margin-bottom:16px}
.tile{aspect-ratio:1;border-radius:8px;border:1px solid var(--line);background:var(--card);font-size:13px;display:flex;align-items:center;justify-content:center;color:var(--mute);padding:0;min-height:44px;min-width:44px}
.tile.cur{box-shadow:0 0 0 2px var(--ink);border-color:var(--ink)}
.tile.ok{background:var(--greenSoft);border-color:var(--green);color:var(--green)}
.tile.fixed{background:var(--tomSoft);border-color:var(--tom);color:var(--tomDeep)}
.legend{font-size:14px;color:var(--mute);display:grid;gap:6px}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:8px;border:1px solid var(--line)}
.done{display:none;margin-top:24px;padding:20px 24px;border-radius:var(--r2);background:var(--greenSoft);color:var(--green)}
.done.show{display:block}
textarea{width:100%;min-height:120px;font-family:var(--mono);font-size:13px;border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--card);color:var(--ink);margin-top:12px}
.sr{position:absolute;left:-9999px}
@media (max-width:860px){
  .grid{grid-template-columns:1fr}
  .nav{position:static;order:-1}
  .card{padding:20px;border-radius:16px}
  h1{font-size:32px}
  .msg{max-width:92%}
  .row{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="wrap">
<header>
  <div>
    <h1>Hand <em>check</em> · ${rows.length} cases</h1>
    <p class="sub">For each case: is the authored label what a careful assistant should do next?<br><span class="k"><kbd>1</kbd> right</span> · <span class="k"><kbd>2</kbd> judge is right</span> · <span class="k"><kbd>3</kbd> fix</span> · <span class="k"><kbd>←</kbd><kbd>→</kbd> move</span></p>
  </div>
  <div class="tools">
    <div class="progress"><span id="count">0 / ${rows.length}</span><div class="bar"><i id="fill"></i></div></div>
    <button id="copy">Copy answers</button>
    <button id="download" class="primary">Download josh.jsonl</button>
  </div>
</header>

<div class="grid">
  <main class="card" id="case" aria-live="polite"></main>
  <aside class="nav">
    <div class="tiles" id="tiles"></div>
    <div class="legend">
      <div><i style="background:var(--card)"></i>not checked</div>
      <div><i style="background:var(--greenSoft);border-color:var(--green)"></i>label right</div>
      <div><i style="background:var(--tomSoft);border-color:var(--tom)"></i>label corrected</div>
    </div>
    <div class="done" id="done">All ${rows.length} checked. Download josh.jsonl (or copy) and send it back.<textarea id="out" readonly aria-label="Answers as JSONL"></textarea></div>
  </aside>
</div>
</div>

<script>
const CASES = ${JSON.stringify(rows)};
const AREAS = ${JSON.stringify(areas)};
const KEY = 'concierge-handcheck-v1';
const answers = JSON.parse(localStorage.getItem(KEY) || '{}');
let cur = Math.max(0, CASES.findIndex((c) => !answers[c.id]));
if (cur < 0) cur = 0;

const show = (e) => !e ? 'not run' : [e.tool || 'none', e.area, e.action, e.handoff && '→' + e.handoff, e.toolError && '!' + e.toolError, e.mustNot?.length && 'mustNot:' + e.mustNot.join('+'), e.allow?.length && 'allow:' + e.allow.join('+')].filter(Boolean).join(' · ');
const norm = (e) => ({ tool: e.tool || null, area: e.area || null, action: e.action || null, handoff: e.handoff || null, toolError: e.toolError || null, mustNot: [...(e.mustNot || [])].sort(), allow: [...(e.allow || [])].sort() });
const same = (a, b) => { const x = norm(a), y = norm(b); return x.tool === y.tool && ((x.toolError === 'unknown_area' || y.toolError === 'unknown_area') || x.area === y.area) && x.action === y.action && x.handoff === y.handoff && x.toolError === y.toolError && x.mustNot.join() === y.mustNot.join() && x.allow.join() === y.allow.join(); };
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const isAr = (s) => /[\\u0600-\\u06FF]/.test(s);

let fix = null; // draft label while the fix form is open

function render() {
  const c = CASES[cur];
  const a = answers[c.id];
  const differs = c.judge && !same(c.judge, c.authored);
  const main = document.getElementById('case');
  main.innerHTML = \`
    <div class="meta"><b>#\${c.id}</b><span class="tag">\${c.category.replace('_', ' ')}</span><span class="tag">\${c.lang === 'ar' ? 'Arabic' : 'English'}</span><span>\${cur + 1} of \${CASES.length}</span>\${a ? '<span class="tag" style="color:var(--green)">' + (a.ok ? 'you: right' : 'you: corrected') + '</span>' : ''}</div>
    <div class="chat">\${c.turns.map((t) => '<div class="msg ' + (t.role === 'user' ? 'user' : 'agent') + '" dir="' + (isAr(t.text) ? 'rtl' : 'ltr') + '"><span class="sr">' + (t.role === 'user' ? 'Visitor: ' : 'Agent: ') + '</span>' + esc(t.text) + '</div>').join('')}</div>
    \${c.state === 'hold' ? '<div class="state">A slot is held and the agent is waiting for a yes.</div>' : ''}
    <div class="labels">
      <div class="label"><span class="who">Authored</span><code>\${esc(show(c.authored))}</code></div>
      <div class="label \${differs ? 'differs' : 'same'}"><span class="who">Judge</span><code>\${esc(c.judge ? (differs ? show(c.judge) : 'agrees') : 'not run')}</code></div>
      \${a && a.expect ? '<div class="label"><span class="who">Yours</span><code>' + esc(show(a.expect)) + '</code></div>' : ''}
    </div>
    <div class="actions">
      <button class="primary" id="b-right">Right <kbd>1</kbd></button>
      <button id="b-judge" \${differs ? '' : 'disabled'}>Judge is right <kbd>2</kbd></button>
      <button id="b-fix">Fix… <kbd>3</kbd></button>
      <span style="flex:1"></span>
      <button id="b-prev" aria-label="Previous case">←</button>
      <button id="b-next" aria-label="Next case">→</button>
    </div>
    <form class="fix" id="fix" onsubmit="return false"></form>\`;
  document.getElementById('b-right').onclick = () => answer({ id: c.id, ok: true });
  document.getElementById('b-judge').onclick = () => differs && answer({ id: c.id, expect: norm(c.judge) });
  document.getElementById('b-fix').onclick = () => openFix(a?.expect || c.authored);
  document.getElementById('b-prev').onclick = () => go(cur - 1);
  document.getElementById('b-next').onclick = () => go(cur + 1);
  renderTiles();
  renderProgress();
}

function openFix(from) {
  fix = norm(from);
  const f = document.getElementById('fix');
  f.classList.add('open');
  const seg = (name, opts, val) => '<div class="seg" data-f="' + name + '">' + opts.map((o) => '<button type="button" data-v="' + (o || '') + '" aria-pressed="' + (String(val || '') === String(o || '')) + '">' + (o || 'none') + '</button>').join('') + '</div>';
  f.innerHTML = \`
    <div class="row"><label>Tool</label>\${seg('tool', [null, 'areaPrices', 'listings', 'holdViewing', 'handOff'], fix.tool)}</div>
    <div class="row"><label for="f-area">Area</label><input type="text" id="f-area" list="areas" value="\${esc(fix.area || '')}" placeholder="community, or the text the visitor typed"><datalist id="areas">\${AREAS.map((a) => '<option value="' + esc(a) + '">').join('')}</datalist></div>
    <div class="row"><label>Viewing action</label>\${seg('action', [null, 'slots', 'hold', 'confirm', 'release'], fix.action)}</div>
    <div class="row"><label>Hand-off</label>\${seg('handoff', [null, 'valuation', 'contract', 'complaint', 'out_of_scope'], fix.handoff)}</div>
    <div class="row"><label>Tool error</label>\${seg('toolError', [null, 'too_few_deals', 'unknown_area'], fix.toolError)}</div>
    <div class="row"><label>Must not</label><div class="checks"><label><input type="checkbox" id="f-quote" \${fix.mustNot.includes('quoteFigure') ? 'checked' : ''}>quote a figure</label><label><input type="checkbox" id="f-confirm" \${fix.mustNot.includes('confirm') ? 'checked' : ''}>confirm the viewing</label><label><input type="checkbox" id="f-allow" \${fix.allow.includes('areaPrices') ? 'checked' : ''}>areaPrices call is fine (tool none)</label></div></div>
    <div class="actions"><button type="button" class="accent" id="f-save">Save correction</button><button type="button" id="f-cancel">Cancel <kbd>Esc</kbd></button></div>\`;
  f.querySelectorAll('.seg').forEach((s) => s.querySelectorAll('button').forEach((b) => (b.onclick = () => { s.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); })));
  document.getElementById('f-cancel').onclick = closeFix;
  document.getElementById('f-save').onclick = () => {
    const pick = (name) => f.querySelector('.seg[data-f="' + name + '"] button[aria-pressed="true"]')?.dataset.v || null;
    const e = { tool: pick('tool'), area: f.querySelector('#f-area').value.trim() || null, action: pick('action'), handoff: pick('handoff'), toolError: pick('toolError'), mustNot: [f.querySelector('#f-quote').checked && 'quoteFigure', f.querySelector('#f-confirm').checked && 'confirm'].filter(Boolean), allow: f.querySelector('#f-allow').checked ? ['areaPrices'] : [] };
    if (e.tool === 'handOff' && !e.handoff) return alertRow(f, 'A hand-off needs a reason.');
    if (e.tool === 'holdViewing' && !e.action) return alertRow(f, 'A viewing call needs an action.');
    if (e.tool !== 'handOff') e.handoff = null;
    if (e.tool !== 'holdViewing') e.action = null;
    if (e.tool !== 'areaPrices' && e.tool !== 'listings') e.toolError = null;
    answer({ id: CASES[cur].id, expect: norm(e) });
  };
  f.querySelector('#f-area').focus();
}
function alertRow(f, msg) { let w = f.querySelector('.warn'); if (!w) { w = document.createElement('div'); w.className = 'warn state'; f.prepend(w); } w.textContent = msg; }
function closeFix() { fix = null; const f = document.getElementById('fix'); f.classList.remove('open'); f.innerHTML = ''; }

function answer(a) {
  const c = CASES[cur];
  if (a.expect && same(a.expect, c.authored)) a = { id: c.id, ok: true };
  answers[c.id] = a;
  localStorage.setItem(KEY, JSON.stringify(answers));
  closeFix();
  const next = CASES.findIndex((x, i) => i > cur && !answers[x.id]);
  go(next >= 0 ? next : CASES.findIndex((x) => !answers[x.id]) >= 0 ? CASES.findIndex((x) => !answers[x.id]) : cur);
}
function go(i) { if (i < 0 || i >= CASES.length) return; closeFix(); cur = i; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function renderTiles() {
  document.getElementById('tiles').innerHTML = CASES.map((c, i) => { const a = answers[c.id]; return '<button class="tile ' + (i === cur ? 'cur ' : '') + (a ? (a.ok ? 'ok' : 'fixed') : '') + '" data-i="' + i + '" aria-label="Case ' + c.id + (a ? (a.ok ? ', right' : ', corrected') : ', not checked') + '">' + c.id + '</button>'; }).join('');
  document.querySelectorAll('.tile').forEach((t) => (t.onclick = () => go(Number(t.dataset.i))));
}
function jsonl() { return CASES.filter((c) => answers[c.id]).map((c) => JSON.stringify(answers[c.id])).join('\\n') + '\\n'; }
function renderProgress() {
  const n = CASES.filter((c) => answers[c.id]).length;
  document.getElementById('count').textContent = n + ' / ' + CASES.length;
  document.getElementById('fill').style.width = (100 * n) / CASES.length + '%';
  const done = document.getElementById('done');
  done.classList.toggle('show', n === CASES.length);
  if (n === CASES.length) document.getElementById('out').value = jsonl();
}
document.getElementById('copy').onclick = async (ev) => { await navigator.clipboard.writeText(jsonl()); const b = ev.currentTarget; const t = b.textContent; b.textContent = 'Copied'; setTimeout(() => (b.textContent = t), 1200); };
document.getElementById('download').onclick = () => { const blob = new Blob([jsonl()], { type: 'application/x-ndjson' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'josh.jsonl'; a.click(); URL.revokeObjectURL(a.href); };
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea,select')) { if (e.key === 'Escape') closeFix(); return; }
  if (e.key === '1') document.getElementById('b-right').click();
  else if (e.key === '2') document.getElementById('b-judge').click();
  else if (e.key === '3') document.getElementById('b-fix').click();
  else if (e.key === 'ArrowRight' || e.key === 'j') go(cur + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'k') go(cur - 1);
  else if (e.key === 'Escape') closeFix();
});
render();
</script>
</body>
</html>
`;
writeFileSync(resolve(here, 'review/review.html'), html);
console.log(`${rows.length} cases → evals/review/review.html`);
