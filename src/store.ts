// D1 access. Every write the agent causes goes through here.
export type Role = 'user' | 'assistant';
export interface Msg {
  role: Role;
  text: string;
  tools?: string[];
  latencyMs?: number;
  costUsd?: number;
  model?: string;
  handoff?: string | null;
  error?: number;
}
export interface Hold {
  slot: string;
  label?: string;
  listingId?: string | null;
  confirmed: number;
}
export interface Thread {
  id: string;
  state: 'open' | 'hold' | 'human' | 'closed';
  hold: Hold | null;
  lang: string | null;
}

export class Store {
  constructor(private db: D1Database) {}

  static newId(): string {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('') + Date.now().toString(36).slice(-4);
  }

  async getThread(id: string): Promise<Thread | null> {
    const row = await this.db.prepare('SELECT id, state, hold_json, lang FROM threads WHERE id = ?').bind(id).first<{ id: string; state: Thread['state']; hold_json: string | null; lang: string | null }>();
    if (!row) return null;
    return { id: row.id, state: row.state, hold: row.hold_json ? (JSON.parse(row.hold_json) as Hold) : null, lang: row.lang };
  }

  async getOrCreateThread(id: string, lang: string): Promise<Thread> {
    const t = await this.getThread(id);
    if (t) return t;
    await this.db.prepare("INSERT INTO threads (id, channel, lang) VALUES (?, 'web', ?)").bind(id, lang).run();
    return { id, state: 'open', hold: null, lang };
  }

  async messages(threadId: string): Promise<Msg[]> {
    const { results } = await this.db
      .prepare('SELECT role, text, tools, handoff, error FROM turns WHERE thread_id = ? ORDER BY id')
      .bind(threadId)
      .all<{ role: Role; text: string; tools: string | null; handoff: string | null; error: number }>();
    return results.map((r) => ({ role: r.role, text: r.text, tools: r.tools ? (JSON.parse(r.tools) as string[]) : [], handoff: r.handoff, error: r.error }));
  }

  async addTurn(threadId: string, m: Msg): Promise<void> {
    await this.db
      .prepare('INSERT INTO turns (thread_id, role, text, tools, latency_ms, cost_usd, model, handoff, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(threadId, m.role, m.text, m.tools ? JSON.stringify(m.tools) : null, m.latencyMs ?? null, m.costUsd ?? null, m.model ?? null, m.handoff ?? null, m.error ?? 0)
      .run();
  }

  async setState(threadId: string, state: Thread['state'], hold: Hold | null): Promise<void> {
    await this.db
      .prepare("UPDATE threads SET state = ?, hold_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
      .bind(state, hold ? JSON.stringify(hold) : null, threadId)
      .run();
  }

  async recordHold(threadId: string, hold: Hold): Promise<void> {
    await this.db.prepare('INSERT INTO holds (thread_id, slot, listing_id, confirmed) VALUES (?, ?, ?, ?)').bind(threadId, hold.slot, hold.listingId ?? null, hold.confirmed).run();
  }

  async handoffThreads() {
    const { results } = await this.db
      .prepare(
        `SELECT t.id, t.state, t.lang, t.updated_at, x.handoff, x.text AS last_text
         FROM threads t JOIN turns x ON x.thread_id = t.id AND x.handoff IS NOT NULL
         WHERE t.state = 'human' ORDER BY t.updated_at DESC LIMIT 100`,
      )
      .all();
    return results;
  }

  async insertEvalRun(run: {
    ranAt: string;
    model: string;
    cases: { id: number; lang: string; category: string; labelBy: string; passed: boolean; expected: string; got: string; cause?: string; fix?: string; handoffExpected: boolean; handoffCaught: boolean }[];
    labelledByJosh: number;
    judgeAgreement: number | null;
    p50Ms: number;
    costUsd: number;
    gitSha: string;
    reportUrl: string;
  }): Promise<number> {
    const passed = run.cases.filter((c) => c.passed).length;
    const handoffsTotal = run.cases.filter((c) => c.handoffExpected).length;
    const handoffsCaught = run.cases.filter((c) => c.handoffExpected && c.handoffCaught).length;
    // One row per run: the report URL carries the run stamp, so a regrade of the same run replaces its row and cases.
    const existing = await this.db.prepare('SELECT id FROM eval_runs WHERE report_url = ?').bind(run.reportUrl).first<{ id: number }>();
    let id: number;
    if (existing) {
      id = existing.id;
      await this.db.batch([
        this.db
          .prepare('UPDATE eval_runs SET ran_at = ?, model = ?, cases = ?, passed = ?, handoffs_total = ?, handoffs_caught = ?, labelled_by_josh = ?, judge_agreement = ?, p50_ms = ?, cost_usd = ?, git_sha = ? WHERE id = ?')
          .bind(run.ranAt, run.model, run.cases.length, passed, handoffsTotal, handoffsCaught, run.labelledByJosh, run.judgeAgreement, run.p50Ms, run.costUsd, run.gitSha, id),
        this.db.prepare('DELETE FROM eval_cases WHERE run_id = ?').bind(id),
      ]);
    } else {
      const res = await this.db
        .prepare(
          'INSERT INTO eval_runs (ran_at, model, cases, passed, handoffs_total, handoffs_caught, labelled_by_josh, judge_agreement, p50_ms, cost_usd, git_sha, report_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
        )
        .bind(run.ranAt, run.model, run.cases.length, passed, handoffsTotal, handoffsCaught, run.labelledByJosh, run.judgeAgreement, run.p50Ms, run.costUsd, run.gitSha, run.reportUrl)
        .first<{ id: number }>();
      id = res!.id;
    }
    const stmt = this.db.prepare('INSERT INTO eval_cases (run_id, case_id, lang, category, label_by, passed, expected, got, cause, fix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (let i = 0; i < run.cases.length; i += 50) {
      await this.db.batch(run.cases.slice(i, i + 50).map((c) => stmt.bind(id, c.id, c.lang, c.category, c.labelBy, c.passed ? 1 : 0, c.expected, c.got, c.cause ?? null, c.fix ?? null)));
    }
    return id;
  }
}
