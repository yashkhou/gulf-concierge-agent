// Control room. Renders /api/stats. Single hue for magnitude, tomato only for failures.
const $ = (s) => document.querySelector(s);
const fmtPct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const fmtMs = (ms) => (ms == null ? '–' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function tile(id, value, small, scope) {
  const el = $(id);
  el.classList.remove('empty');
  el.querySelector('.v').innerHTML = `${esc(value)}${small ? `<small>${esc(small)}</small>` : ''}`;
  if (scope) el.querySelector('.s').textContent = scope;
}

function bars(el, rows, { fail = false } = {}) {
  if (!rows.length) return;
  const max = Math.max(...rows.map((r) => r.total ?? r.n), 1);
  el.innerHTML = rows
    .map((r) => {
      const n = r.n, total = r.total ?? max;
      const w = total ? Math.max(2, Math.round((n / total) * 100)) : 0;
      const label = r.total != null ? `${n}/${r.total}` : String(n);
      return `<div class="bar" title="${esc(r.label)}: ${esc(label)}"><span class="lab">${esc(r.label)}</span><span class="trk"><span class="fil${fail && n < total ? '' : ''}" style="width:${w}%"></span>${r.total != null && n < total ? `<span class="fil fail" style="left:${w}%;width:${100 - w}%;border-radius:0 4px 4px 0;margin-left:2px"></span>` : ''}</span><span class="val">${esc(label)}</span></div>`;
    })
    .join('');
}

function spark(el, rows) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const r = rows.find((x) => x.day === d);
    days.push({ day: d, n: r ? r.conversations : 0 });
  }
  const max = Math.max(...days.map((d) => d.n), 1);
  el.innerHTML = days
    .map((d) => `<div class="col" title="${d.day}: ${d.n} conversation${d.n === 1 ? '' : 's'}"><span class="c" style="height:${Math.max(2, Math.round((d.n / max) * 60))}px"></span><span class="d">${new Date(d.day).toLocaleDateString('en-GB', { weekday: 'narrow' })}</span></div>`)
    .join('');
}

async function load() {
  const s = await (await fetch('/api/stats')).json();
  const { live, evalRun, evalFailures, evalByCategory, evalHistory } = s;

  if (evalRun) {
    const ran = fmtDate(evalRun.ran_at);
    tile('#tile-pass', fmtPct(evalRun.passed, evalRun.cases), '', `${evalRun.passed} of ${evalRun.cases} cases · run ${ran}${evalRun.labelled_by_josh ? ` · ${evalRun.labelled_by_josh} checked by Josh` : ''}`);
    tile('#tile-handoff', fmtPct(evalRun.handoffs_caught, evalRun.handoffs_total), '', `${evalRun.handoffs_caught} of ${evalRun.handoffs_total} cases that needed a human · run ${ran}`);
    $('#cat-scope').textContent = `run ${ran} · ${evalRun.model || ''}`;
    bars($('#cats'), evalByCategory.map((c) => ({ label: c.category.replace('_', ' '), n: c.passed, total: c.cases })), { fail: true });
    const tb = $('#fails tbody');
    tb.innerHTML = evalFailures.length
      ? evalFailures
          .map(
            (f) =>
              `<tr><td class="mono">${f.case_id}</td><td>${esc(f.lang)}</td><td><span class="tag">${esc(f.category)}</span></td><td class="mono">${esc(f.expected)}</td><td class="mono">${esc(f.got)}</td><td>${esc(f.cause || '')}</td><td>${f.fix ? `<span class="tag ok">${esc(f.fix)}</span>` : '<span class="tag hot">open</span>'}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="7" class="empty-note">No failures in the last run.</td></tr>`;
    $('#fail-scope').textContent = `${evalFailures.length} of ${evalRun.cases} cases failed in the run on ${ran}. Each names the cause and the fix.`;
    if (evalRun.judge_agreement != null && evalRun.labelled_by_josh) {
      $('#labels').children[1].textContent = `Josh checked ${evalRun.labelled_by_josh} by hand; the judge had labelled ${evalRun.judge_agreement} of those the same way (${fmtPct(evalRun.judge_agreement, evalRun.labelled_by_josh)}).`;
    }
  }
  if (evalHistory?.length) {
    $('#history tbody').innerHTML = evalHistory.map((r) => `<tr><td>${fmtDate(r.ran_at)}</td><td class="mono">${r.passed}/${r.cases}</td><td class="mono">${r.handoffs_caught}/${r.handoffs_total}</td><td class="mono">${fmtMs(r.p50_ms)}</td></tr>`).join('');
  }

  if (live.turns > 0) {
    tile('#tile-p50', fmtMs(live.p50Ms), '', `p90 ${fmtMs(live.p90Ms)} · ${live.turns} replies in ${live.conversations} conversations · last 30 days`);
    tile('#tile-cost', live.costPerConversationUsd != null ? `$${live.costPerConversationUsd.toFixed(3)}` : '–', '', `$${(live.costUsd || 0).toFixed(2)} across ${live.conversations} conversations · Claude list price · last 30 days`);
  }
  if (live.handoffsByReason?.length) bars($('#reasons'), live.handoffsByReason.map((r) => ({ label: r.reason.replace('_', ' '), n: r.n })));
  spark($('#spark'), live.last7 || []);
  const tools = Object.entries(live.toolCounts || {}).sort((a, b) => b[1] - a[1]);
  if (tools.length) bars($('#tools'), tools.map(([k, n]) => ({ label: k, n })));

  $('#updated').className = 'pill up';
  $('#updated-t').textContent = `updated ${new Date(s.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

async function health() {
  const pill = $('#status'), t = $('#status-t');
  try {
    const r = await (await fetch('/api/health')).json();
    pill.className = `pill ${r.relay === 'up' ? 'up' : 'down'}`;
    t.textContent = r.relay === 'up' ? `relay up · ${r.model || 'claude'} · ${r.relayMs} ms` : 'relay offline';
  } catch {
    pill.className = 'pill down';
    t.textContent = 'relay offline';
  }
}

load().catch(() => {
  $('#updated').className = 'pill down';
  $('#updated-t').textContent = 'stats unavailable';
});
health();
