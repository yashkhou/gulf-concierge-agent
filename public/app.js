// Chat page. Plain JS, no build step. State lives in D1; the browser only keeps the thread id.
const $ = (s) => document.querySelector(s);
const msgs = $('#msgs'), form = $('#form'), input = $('#in'), sendBtn = $('#send'), starters = $('#starters'), left = $('#left'), sub = $('#sub');
const KEY = 'gca.thread';
let threadId = localStorage.getItem(KEY) || null;
let busy = false;

const isAr = (s) => /[؀-ۿ]/.test(s);
const WELCOME = 'مرحباً. أنا مساعد جوش للفلل في دبي.\nI can give you Dubai Land Department prices for an area, show available villas, or hold a viewing. Arabic or English, your call.';

function bubble(role, text, { chips = [], sys = false } = {}) {
  const m = document.createElement('div');
  m.className = `m ${sys ? 'sys' : role === 'user' ? 'me' : 'ag'}`;
  m.dir = isAr(text) ? 'rtl' : 'ltr';
  const b = document.createElement('div');
  b.className = 'bub';
  b.textContent = text;
  m.appendChild(b);
  if (chips.length) {
    const c = document.createElement('div');
    c.className = 'chips';
    for (const ch of chips) {
      const s = document.createElement('span');
      s.className = `chip ${ch.tone || ''}`;
      s.textContent = ch.text;
      c.appendChild(s);
    }
    m.appendChild(c);
  }
  msgs.appendChild(m);
  msgs.scrollTop = msgs.scrollHeight;
  return m;
}

function chipsFor(tools = [], handoff = null) {
  const out = [];
  for (const t of tools) {
    const name = typeof t === 'string' ? t : t.tool;
    const area = typeof t === 'string' ? null : t.area;
    const action = typeof t === 'string' ? null : t.action;
    const ok = typeof t === 'string' ? true : t.ok !== false;
    if (name === 'areaPrices') out.push({ text: ok ? `DLD prices · ${area || 'area'}` : `no figure · ${area || 'area'}`, tone: ok ? '' : 'amber' });
    else if (name === 'listings') out.push({ text: `listings · ${area || 'all areas'}` });
    else if (name === 'holdViewing') out.push(action === 'confirm' ? { text: 'booked', tone: 'ok' } : action === 'hold' ? { text: 'slot held · waiting for your yes', tone: 'amber' } : action === 'release' ? { text: 'slot released' } : { text: 'checked slots' });
    else if (name === 'handOff') out.push({ text: `handed to Josh · ${handoff?.reason || handoff || 'human'}`, tone: 'hot' });
  }
  return out;
}

function setState(state) {
  for (const el of document.querySelectorAll('.st')) {
    const s = el.dataset.s;
    el.classList.toggle('on', s === state);
    el.classList.toggle('done', state === 'closed' && s === 'hold');
  }
  if (state === 'human') input.placeholder = 'Josh has this thread. Start a new chat for anything else.';
  else if (state === 'closed') input.placeholder = 'Booked. Anything else?';
  else input.placeholder = 'اكتب بالعربية أو بالإنجليزية… / Type in Arabic or English…';
}

function typing() {
  const m = document.createElement('div');
  m.className = 'm ag';
  m.innerHTML = '<div class="bub typing" aria-label="Thinking"><i></i><i></i><i></i></div><span class="wait"></span>';
  msgs.appendChild(m);
  msgs.scrollTop = msgs.scrollHeight;
  const started = Date.now();
  const w = m.querySelector('.wait');
  const t = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    if (s >= 3) w.textContent = `${s} s · running on a Mac in Dubai`;
  }, 500);
  return () => {
    clearInterval(t);
    m.remove();
  };
}

async function send(text) {
  if (busy || !text.trim()) return;
  busy = true;
  sendBtn.disabled = true;
  starters.hidden = true;
  bubble('user', text);
  input.value = '';
  autosize();
  const stop = typing();
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ threadId, text }) });
    const r = await res.json();
    stop();
    if (r.threadId && r.threadId !== threadId) {
      threadId = r.threadId;
      localStorage.setItem(KEY, threadId);
    }
    if (!res.ok) {
      bubble('assistant', r.reply || 'Something went wrong. Try again.', { sys: true });
      if (res.status === 429 && r.scope === 'visitor') sendBtn.disabled = true;
      return;
    }
    bubble('assistant', r.reply, { chips: chipsFor(r.tools, r.handoff) });
    if (r.offline) sub.textContent = 'offline · the Mac is not answering';
    else sub.textContent = `live · last reply ${(r.latencyMs / 1000).toFixed(1)} s`;
    if (typeof r.remaining === 'number') left.textContent = `${r.remaining} left today`;
    setState(r.state);
  } catch {
    stop();
    bubble('assistant', 'No connection. Try again in a moment.', { sys: true });
  } finally {
    busy = false;
    if (!sendBtn.disabled || true) sendBtn.disabled = false;
    input.focus();
  }
}

async function restore() {
  if (!threadId) return bubble('assistant', WELCOME);
  try {
    const res = await fetch(`/api/thread/${threadId}`);
    if (!res.ok) throw 0;
    const t = await res.json();
    if (!t.messages.length) return bubble('assistant', WELCOME);
    starters.hidden = true;
    for (const m of t.messages) bubble(m.role, m.text, { chips: m.role === 'assistant' ? chipsFor(m.tools, m.handoff) : [] });
    setState(t.state);
  } catch {
    localStorage.removeItem(KEY);
    threadId = null;
    bubble('assistant', WELCOME);
  }
}

async function health() {
  const pill = $('#status'), t = $('#status-t');
  try {
    const r = await (await fetch('/api/health')).json();
    pill.className = `pill ${r.relay === 'up' ? 'up' : 'down'}`;
    t.textContent = r.relay === 'up' ? `live · ${r.model || 'claude'}` : 'offline';
    if (r.relay !== 'up') sub.textContent = 'offline · the Mac is not answering';
  } catch {
    pill.className = 'pill down';
    t.textContent = 'offline';
  }
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(140, input.scrollHeight) + 'px';
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  send(input.value);
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send(input.value);
  }
});
input.addEventListener('input', autosize);
starters.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-q]');
  if (b) send(b.dataset.q);
});
$('#new').addEventListener('click', () => {
  localStorage.removeItem(KEY);
  threadId = null;
  msgs.innerHTML = '';
  starters.hidden = false;
  setState('open');
  sendBtn.disabled = false;
  bubble('assistant', WELCOME);
  input.focus();
});

restore();
health();
