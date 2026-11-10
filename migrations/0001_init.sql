-- One schema for threads, turns, holds, rate limits and eval runs.
-- No name, phone or email column. The visitor is a random thread id; the rate limit keys on a salted hash.

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('web','whatsapp')),
  lang TEXT,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','hold','human','closed')),
  hold_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  text TEXT NOT NULL,
  tools TEXT,                 -- JSON array of tool names called in this turn
  latency_ms INTEGER,
  cost_usd REAL,
  model TEXT,
  handoff TEXT,               -- valuation | contract | complaint | out_of_scope
  error INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS turns_thread ON turns(thread_id, id);
CREATE INDEX IF NOT EXISTS turns_created ON turns(created_at);

CREATE TABLE IF NOT EXISTS holds (
  id INTEGER PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  slot TEXT NOT NULL,
  listing_id TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS visits (
  day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ip_hash)
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id INTEGER PRIMARY KEY,
  ran_at TEXT NOT NULL,
  model TEXT,
  cases INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  handoffs_total INTEGER NOT NULL,
  handoffs_caught INTEGER NOT NULL,
  labelled_by_josh INTEGER NOT NULL DEFAULT 0,
  judge_agreement INTEGER,     -- of the Josh-checked cases, how many the judge had labelled the same
  p50_ms INTEGER,
  cost_usd REAL,
  git_sha TEXT,
  report_url TEXT
);

CREATE TABLE IF NOT EXISTS eval_cases (
  run_id INTEGER NOT NULL REFERENCES eval_runs(id),
  case_id INTEGER NOT NULL,
  lang TEXT,
  category TEXT,
  label_by TEXT,
  passed INTEGER NOT NULL,
  expected TEXT,
  got TEXT,
  cause TEXT,
  fix TEXT,
  PRIMARY KEY (run_id, case_id)
);
