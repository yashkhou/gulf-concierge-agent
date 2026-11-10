// One Cloudflare Worker: static pages from /public, JSON API under /api, D1 for state.
// The model turn itself runs on a Mac relay (see relay/relay.mjs); this Worker never holds a model key.
import { rateLimit } from './limits';
import { callRelay } from './relay';
import { stats } from './stats';
import { Store } from './store';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  RELAY_URL: string;
  RELAY_TOKEN: string;
  ADMIN_TOKEN: string;
  IP_SALT: string;
  DAILY_CAP_VISITOR: string;
  DAILY_CAP_TOTAL: string;
  MAX_USER_TURNS: string;
}

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (request.method === 'POST' && url.pathname === '/api/chat') return await chat(request, env, ctx);
      if (request.method === 'GET' && url.pathname.startsWith('/api/thread/')) return await thread(url.pathname.slice('/api/thread/'.length), env);
      if (request.method === 'GET' && url.pathname === '/api/stats') return json(await stats(env.DB), 200, { 'cache-control': 'public, max-age=30' });
      if (request.method === 'GET' && url.pathname === '/api/health') return await health(env);
      if (request.method === 'POST' && url.pathname === '/api/eval-runs') return await postEvalRun(request, env);
      if (request.method === 'GET' && url.pathname === '/api/handoffs') return await handoffs(request, env);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      console.error('api error', e);
      return json({ error: 'server_error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function chat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { threadId?: string; text?: string } | null;
  const text = String(body?.text ?? '').trim().slice(0, 600);
  if (!text) return json({ error: 'empty' }, 400);
  const lang = isArabic(text) ? 'ar' : 'en';

  const limit = await rateLimit(env, request);
  if (!limit.ok) {
    return json(
      {
        error: 'rate_limited',
        scope: limit.scope,
        reply:
          lang === 'ar'
            ? limit.scope === 'visitor'
              ? 'وصلت إلى حد 20 رسالة لليوم. تعود الخدمة غداً.'
              : 'الوكيل وصل إلى حده اليومي من المحادثات. جرّب غداً.'
            : limit.scope === 'visitor'
              ? 'You have reached today’s limit of 20 messages. Come back tomorrow.'
              : 'The agent has reached its daily conversation cap. Please try again tomorrow.',
      },
      429,
    );
  }

  const store = new Store(env.DB);
  const threadId = body?.threadId && /^[a-z0-9]{10,16}$/.test(body.threadId) ? body.threadId : Store.newId();
  const t = await store.getOrCreateThread(threadId, lang);
  const messages = await store.messages(threadId);
  const userTurns = messages.filter((m) => m.role === 'user').length;
  if (userTurns >= Number(env.MAX_USER_TURNS || 20)) return json({ error: 'thread_full', threadId, reply: lang === 'ar' ? 'انتهت هذه المحادثة. ابدأ محادثة جديدة.' : 'This conversation is full. Start a new one.' }, 409);

  await store.addTurn(threadId, { role: 'user', text });
  const history = [...messages, { role: 'user' as const, text }];

  const started = Date.now();
  const r = await callRelay(env, { threadId, messages: history, state: t.state, hold: t.hold });
  const latencyMs = Date.now() - started;

  const assistantTurn = {
    role: 'assistant' as const,
    text: r.reply,
    tools: r.toolCalls.map((c) => c.tool),
    latencyMs,
    costUsd: r.costUsd,
    model: r.model,
    handoff: r.handoff?.reason ?? null,
    error: r.isError ? 1 : 0,
  };
  await store.addTurn(threadId, assistantTurn);
  if (!r.isError) {
    await store.setState(threadId, r.state, r.hold);
    if (r.hold && JSON.stringify(r.hold) !== JSON.stringify(t.hold)) ctx.waitUntil(store.recordHold(threadId, r.hold));
  }

  return json({
    threadId,
    reply: r.reply,
    state: r.isError ? t.state : r.state,
    hold: r.isError ? t.hold : r.hold,
    handoff: r.handoff,
    tools: r.toolCalls.map((c) => ({ tool: c.tool, ok: c.ok, area: (c.args as { area?: string })?.area ?? null, action: (c.args as { action?: string })?.action ?? null })),
    latencyMs,
    offline: r.offline ?? false,
    remaining: limit.remaining,
  });
}

async function thread(id: string, env: Env): Promise<Response> {
  if (!/^[a-z0-9]{10,16}$/.test(id)) return json({ error: 'bad_id' }, 400);
  const store = new Store(env.DB);
  const t = await store.getThread(id);
  if (!t) return json({ error: 'not_found' }, 404);
  const messages = await store.messages(id);
  return json({ threadId: id, state: t.state, hold: t.hold, messages: messages.map((m) => ({ role: m.role, text: m.text, tools: m.tools ?? [], handoff: m.handoff ?? null })) });
}

async function health(env: Env): Promise<Response> {
  const started = Date.now();
  try {
    const res = await fetch(`${env.RELAY_URL}/healthz`, { signal: AbortSignal.timeout(6000) });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return json({ relay: res.ok ? 'up' : 'down', relayMs: Date.now() - started, ...body });
  } catch {
    return json({ relay: 'down', relayMs: Date.now() - started });
  }
}

function isAdmin(request: Request, env: Env) {
  return Boolean(env.ADMIN_TOKEN) && request.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`;
}

async function postEvalRun(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  const run = (await request.json()) as {
    ranAt: string;
    model: string;
    cases: { id: number; lang: string; category: string; labelBy: string; passed: boolean; expected: string; got: string; cause?: string; fix?: string; handoffExpected: boolean; handoffCaught: boolean }[];
    labelledByJosh: number;
    judgeAgreement: number | null;
    p50Ms: number;
    costUsd: number;
    gitSha: string;
    reportUrl: string;
  };
  const store = new Store(env.DB);
  const id = await store.insertEvalRun(run);
  return json({ ok: true, runId: id });
}

async function handoffs(request: Request, env: Env): Promise<Response> {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  const store = new Store(env.DB);
  return json(await store.handoffThreads());
}
