// The control room reads everything from here. Nothing on the page is typed in by hand.
export async function stats(db: D1Database) {
  const live = await db
    .prepare(
      `SELECT count(DISTINCT thread_id) AS conversations,
              count(*) AS turns,
              sum(cost_usd) AS cost_usd,
              sum(handoff IS NOT NULL) AS handoffs,
              sum(error) AS errors
       FROM turns WHERE role = 'assistant' AND created_at > datetime('now', '-30 days')`,
    )
    .first<{ conversations: number; turns: number; cost_usd: number | null; handoffs: number; errors: number }>();

  const n = await db.prepare(`SELECT count(*) AS n FROM turns WHERE role = 'assistant' AND error = 0 AND latency_ms IS NOT NULL AND created_at > datetime('now', '-30 days')`).first<{ n: number }>();
  const pct = async (p: number) =>
    n && n.n > 0
      ? (
          await db
            .prepare(`SELECT latency_ms FROM turns WHERE role = 'assistant' AND error = 0 AND latency_ms IS NOT NULL AND created_at > datetime('now', '-30 days') ORDER BY latency_ms LIMIT 1 OFFSET ?`)
            .bind(Math.min(n.n - 1, Math.floor(n.n * p)))
            .first<{ latency_ms: number }>()
        )?.latency_ms ?? null
      : null;

  const handoffsByReason = (
    await db.prepare(`SELECT handoff AS reason, count(*) AS n FROM turns WHERE handoff IS NOT NULL AND created_at > datetime('now', '-30 days') GROUP BY handoff ORDER BY n DESC`).all<{ reason: string; n: number }>()
  ).results;

  const byLang = (await db.prepare(`SELECT lang, count(*) AS n FROM threads WHERE created_at > datetime('now', '-30 days') GROUP BY lang`).all<{ lang: string; n: number }>()).results;

  const toolsRows = (await db.prepare(`SELECT tools FROM turns WHERE role = 'assistant' AND tools IS NOT NULL AND created_at > datetime('now', '-30 days')`).all<{ tools: string }>()).results;
  const toolCounts: Record<string, number> = {};
  for (const r of toolsRows) for (const t of JSON.parse(r.tools) as string[]) toolCounts[t] = (toolCounts[t] || 0) + 1;

  const last7 = (
    await db
      .prepare(`SELECT substr(created_at, 1, 10) AS day, count(DISTINCT thread_id) AS conversations, sum(handoff IS NOT NULL) AS handoffs FROM turns WHERE role = 'assistant' AND created_at > datetime('now', '-7 days') GROUP BY day ORDER BY day`)
      .all<{ day: string; conversations: number; handoffs: number }>()
  ).results;

  const evalRun = await db.prepare(`SELECT * FROM eval_runs ORDER BY id DESC LIMIT 1`).first<Record<string, unknown>>();
  let evalFailures: unknown[] = [];
  let evalByCategory: unknown[] = [];
  let evalByLang: unknown[] = [];
  if (evalRun) {
    const id = evalRun.id as number;
    evalFailures = (await db.prepare(`SELECT case_id, lang, category, label_by, expected, got, cause, fix FROM eval_cases WHERE run_id = ? AND passed = 0 ORDER BY case_id`).bind(id).all()).results;
    evalByCategory = (await db.prepare(`SELECT category, count(*) AS cases, sum(passed) AS passed FROM eval_cases WHERE run_id = ? GROUP BY category ORDER BY category`).bind(id).all()).results;
    evalByLang = (await db.prepare(`SELECT lang, count(*) AS cases, sum(passed) AS passed FROM eval_cases WHERE run_id = ? GROUP BY lang`).bind(id).all()).results;
  }
  const evalHistory = (await db.prepare(`SELECT id, ran_at, cases, passed, handoffs_total, handoffs_caught, p50_ms FROM eval_runs ORDER BY id DESC LIMIT 12`).all()).results;

  return {
    generatedAt: new Date().toISOString(),
    live: {
      windowDays: 30,
      conversations: live?.conversations ?? 0,
      turns: live?.turns ?? 0,
      costUsd: live?.cost_usd ?? 0,
      costPerConversationUsd: live && live.conversations ? (live.cost_usd ?? 0) / live.conversations : null,
      handoffs: live?.handoffs ?? 0,
      errors: live?.errors ?? 0,
      p50Ms: await pct(0.5),
      p90Ms: await pct(0.9),
      handoffsByReason,
      byLang,
      toolCounts,
      last7,
    },
    evalRun,
    evalFailures,
    evalByCategory,
    evalByLang,
    evalHistory,
  };
}
