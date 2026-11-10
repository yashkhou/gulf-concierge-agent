#!/usr/bin/env node
// Mac relay: the Cloudflare Worker posts a turn here; this runs `claude -p` with the four MCP tools
// and returns the reply plus every tool call. One process, no dependencies, bearer-token auth.
//
//   RELAY_TOKEN=... node relay/relay.mjs            (PORT 4630)
//
// Env
//   RELAY_TOKEN        required; the Worker sends Authorization: Bearer <token>
//   PORT               default 4630
//   CLAUDE_BIN         default "claude"
//   CONCIERGE_MODEL    default "sonnet"   (Claude Code model alias)
//   MAX_CONCURRENT     default 3
//   NOTIFY_TO          email for hand-offs (sent with ~/bin/gmail); empty = no email
//   GMAIL_BIN          default ~/bin/gmail
//   NOTIFY_ACCOUNT     gmail account to send from
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const PORT = Number(process.env.PORT || 4630);
const TOKEN = process.env.RELAY_TOKEN;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const MODEL = process.env.CONCIERGE_MODEL || 'sonnet';
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 3);
const NOTIFY_TO = process.env.NOTIFY_TO || '';
const NOTIFY_ACCOUNT = process.env.NOTIFY_ACCOUNT || '';
const GMAIL_BIN = process.env.GMAIL_BIN || join(homedir(), 'bin', 'gmail');
const DATA_DIR = resolve(ROOT, 'data');
const PROMPT = readFileSync(resolve(here, 'prompt.md'), 'utf8');
const VERSION = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;
const TURN_TIMEOUT_MS = 90_000;
const MAX_HISTORY = 24;

if (!TOKEN) {
  console.error('RELAY_TOKEN is required');
  process.exit(1);
}

// ---------- tiny semaphore ----------
let running = 0;
const waiting = [];
const acquire = () =>
  new Promise((res, rej) => {
    if (running < MAX_CONCURRENT) {
      running++;
      return res();
    }
    const t = setTimeout(() => {
      const i = waiting.indexOf(entry);
      if (i >= 0) waiting.splice(i, 1);
      rej(new Error('busy'));
    }, 45_000);
    const entry = () => {
      clearTimeout(t);
      running++;
      res();
    };
    waiting.push(entry);
  });
const release = () => {
  running--;
  const next = waiting.shift();
  if (next) next();
};

// ---------- one turn ----------
export async function runTurn({ threadId, messages, state = 'open', hold = null, now }) {
  const tmp = mkdtempSync(join(tmpdir(), 'concierge-'));
  const turnLog = join(tmp, 'tools.jsonl');
  const mcpConfig = join(tmp, 'mcp.json');
  writeFileSync(
    mcpConfig,
    JSON.stringify({
      mcpServers: {
        concierge: {
          command: process.execPath,
          args: [resolve(here, 'mcp.mjs')],
          env: {
            CONCIERGE_DATA_DIR: DATA_DIR,
            CONCIERGE_TURN_LOG: turnLog,
            CONCIERGE_THREAD_STATE: JSON.stringify({ state, hold }),
            ...(now ? { CONCIERGE_NOW: now } : {}),
          },
        },
      },
    }),
  );

  const history = messages.slice(-MAX_HISTORY);
  const transcript = history
    .map((m) => `${m.role === 'user' ? 'Visitor' : 'You'}: ${String(m.text).replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  const stateLine =
    state === 'hold' && hold?.slot
      ? `\nCurrent state: a viewing slot is HELD (${hold.label || hold.slot}${hold.listingId ? `, listing ${hold.listingId}` : ''}) and waits for the visitor's yes.`
      : state === 'human'
        ? '\nCurrent state: this thread was handed to Josh. Only say that he will reply within a working day.'
        : '';
  const userPrompt = `Conversation so far (thread ${threadId}):\n${transcript}${stateLine}\n\nWrite your next reply to the visitor. Output only the reply text.`;

  const args = [
    '-p',
    userPrompt,
    '--model',
    MODEL,
    '--output-format',
    'json',
    '--system-prompt',
    PROMPT,
    '--tools',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    mcpConfig,
    '--allowedTools',
    'mcp__concierge__areaPrices',
    'mcp__concierge__listings',
    'mcp__concierge__holdViewing',
    'mcp__concierge__handOff',
    '--setting-sources',
    '',
    '--no-session-persistence',
  ];

  const started = Date.now();
  let out;
  try {
    out = await exec(CLAUDE_BIN, args, { cwd: tmp, timeout: TURN_TIMEOUT_MS });
  } finally {
    // keep the tool log until we've read it
  }
  const latencyMs = Date.now() - started;
  let parsed = {};
  try {
    parsed = JSON.parse(out.stdout.slice(out.stdout.indexOf('{')));
  } catch {
    parsed = { result: out.stdout.trim(), is_error: true };
  }
  const toolCalls = readJsonl(turnLog);
  rmSync(tmp, { recursive: true, force: true });

  // Derive the thread state from what the tools actually did, not from the prose.
  let nextState = state;
  let nextHold = hold;
  let handoff = null;
  for (const c of toolCalls) {
    if (c.tool === 'holdViewing' && c.result?.held) {
      nextState = 'hold';
      nextHold = { ...c.result.held, confirmed: 0 };
    }
    if (c.tool === 'holdViewing' && c.result?.booked) {
      nextState = 'closed';
      nextHold = { ...c.result.booked, confirmed: 1 };
    }
    if (c.tool === 'holdViewing' && c.result?.released !== undefined) {
      nextState = 'open';
      nextHold = null;
    }
    if (c.tool === 'handOff' && c.result?.handedOff) {
      nextState = 'human';
      handoff = { reason: c.result.reason, summary: c.result.summary };
    }
  }
  if (handoff && NOTIFY_TO) notify(threadId, handoff, history).catch((e) => console.error('notify failed', e.message));

  return {
    reply: String(parsed.result || '').trim() || fallbackReply(messages),
    toolCalls: toolCalls.map((c) => ({ tool: c.tool, args: c.args, ok: !c.result?.error, error: c.result?.error || null, area: c.result?.area ?? null, action: c.args?.action ?? null })),
    state: nextState,
    hold: nextHold,
    handoff,
    latencyMs,
    costUsd: Number(parsed.total_cost_usd || 0),
    model: Object.keys(parsed.modelUsage || {})[0] || MODEL,
    isError: Boolean(parsed.is_error) || out.code !== 0,
    stderr: out.code !== 0 ? out.stderr.slice(-800) : undefined,
  };
}

function fallbackReply(messages) {
  const last = messages[messages.length - 1]?.text || '';
  return /[؀-ۿ]/.test(last)
    ? 'عذراً، لم أستطع الرد الآن. جرّب مرة أخرى بعد لحظات.'
    : 'Sorry, I could not answer just now. Please try again in a moment.';
}

async function notify(threadId, handoff, history) {
  if (!existsSync(GMAIL_BIN)) return;
  const tail = history.slice(-6).map((m) => `${m.role === 'user' ? 'Visitor' : 'Agent'}: ${m.text}`).join('\n');
  const body = `Hand-off: ${handoff.reason}\nThread: ${threadId}\n\n${handoff.summary}\n\nLast messages:\n${tail}\n\nOpen: https://agent.yashkhou.com/room#${threadId}`;
  const acct = NOTIFY_ACCOUNT ? ['--account', NOTIFY_ACCOUNT] : [];
  const draft = await exec(GMAIL_BIN, ['draft', ...acct, '--to', NOTIFY_TO, '--subject', `Concierge hand-off: ${handoff.reason}`, '--body', body], { timeout: 30_000 });
  const id = (draft.stdout.match(/\b(r[-\w]{8,}|[0-9a-f]{12,})\b/i) || [])[1] || draft.stdout.trim().split(/\s+/).pop();
  if (id) await exec(GMAIL_BIN, ['send', ...acct, '--draft-id', id, '--approved', 'true'], { timeout: 30_000 });
}

function exec(cmd, args, { cwd, timeout }) {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, CLAUDE_CODE_DISABLE_TELEMETRY: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const t = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => {
      clearTimeout(t);
      res({ code, stdout, stderr });
    });
  });
}

function readJsonl(p) {
  try {
    return readFileSync(p, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// ---------- HTTP ----------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'GET' && req.url === '/healthz') return send(200, { ok: true, version: VERSION, model: MODEL, running, waiting: waiting.length });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: 'unauthorized' });
    if (req.method === 'POST' && req.url === '/turn') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', async () => {
        let input;
        try {
          input = JSON.parse(body);
        } catch {
          return send(400, { error: 'bad_json' });
        }
        if (!input?.threadId || !Array.isArray(input.messages) || !input.messages.length) return send(400, { error: 'bad_request' });
        try {
          await acquire();
        } catch {
          return send(503, { error: 'busy' });
        }
        try {
          const result = await runTurn(input);
          send(200, result);
        } catch (e) {
          send(500, { error: 'turn_failed', message: String(e?.message || e) });
        } finally {
          release();
        }
      });
      return;
    }
    send(404, { error: 'not_found' });
  });
  server.listen(PORT, '127.0.0.1', () => console.log(`concierge relay v${VERSION} on 127.0.0.1:${PORT} model=${MODEL} max=${MAX_CONCURRENT}`));
}
