// Hard caps: 20 messages a visitor a day, 400 a day in total. Keyed on a salted hash of the IP, kept one day.
import type { Env } from './worker';

export async function rateLimit(env: Env, request: Request): Promise<{ ok: true; remaining: number } | { ok: false; scope: 'visitor' | 'total' }> {
  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = await sha256(`${env.IP_SALT || 'salt'}:${day}:${ip}`);
  const capVisitor = Number(env.DAILY_CAP_VISITOR || 20);
  const capTotal = Number(env.DAILY_CAP_TOTAL || 400);

  const total = await env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS n FROM visits WHERE day = ?').bind(day).first<{ n: number }>();
  if ((total?.n ?? 0) >= capTotal) return { ok: false, scope: 'total' };

  const row = await env.DB.prepare('INSERT INTO visits (day, ip_hash, n) VALUES (?, ?, 1) ON CONFLICT(day, ip_hash) DO UPDATE SET n = n + 1 RETURNING n').bind(day, ipHash).first<{ n: number }>();
  const n = row?.n ?? 1;
  if (n > capVisitor) return { ok: false, scope: 'visitor' };
  return { ok: true, remaining: capVisitor - n };
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
