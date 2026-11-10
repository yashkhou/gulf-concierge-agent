// The Worker asks the Mac relay for one turn. If the Mac is down the visitor gets an honest line, not a fake answer.
import type { Env } from './worker';
import type { Hold, Msg } from './store';

export interface RelayResult {
  reply: string;
  toolCalls: { tool: string; args: unknown; ok: boolean; error: string | null }[];
  state: 'open' | 'hold' | 'human' | 'closed';
  hold: Hold | null;
  handoff: { reason: string; summary: string } | null;
  latencyMs: number;
  costUsd: number;
  model: string;
  isError: boolean;
  offline?: boolean;
}

export async function callRelay(env: Env, input: { threadId: string; messages: Msg[]; state: string; hold: Hold | null }): Promise<RelayResult> {
  const lastText = input.messages[input.messages.length - 1]?.text ?? '';
  const ar = /[؀-ۿ]/.test(lastText);
  const offline = (why: string): RelayResult => ({
    reply: ar ? 'الوكيل غير متصل الآن (يعمل على جهاز في دبي). جرّب بعد دقائق.' : 'The agent is offline right now (it runs on a machine in Dubai). Please try again in a few minutes.',
    toolCalls: [],
    state: input.state as RelayResult['state'],
    hold: input.hold,
    handoff: null,
    latencyMs: 0,
    costUsd: 0,
    model: 'none',
    isError: true,
    offline: true,
  });
  try {
    const res = await fetch(`${env.RELAY_URL}/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RELAY_TOKEN}` },
      body: JSON.stringify({ threadId: input.threadId, messages: input.messages.map((m) => ({ role: m.role, text: m.text })), state: input.state, hold: input.hold }),
      signal: AbortSignal.timeout(95_000),
    });
    if (res.status === 503) return { ...offline('busy'), reply: ar ? 'الوكيل مشغول مع زوار آخرين. جرّب بعد لحظات.' : 'The agent is busy with other visitors. Try again in a moment.' };
    if (!res.ok) return offline(`status ${res.status}`);
    const r = (await res.json()) as RelayResult;
    if (!r || typeof r.reply !== 'string') return offline('bad body');
    return { ...r, toolCalls: r.toolCalls ?? [], offline: false };
  } catch {
    return offline('fetch failed');
  }
}
