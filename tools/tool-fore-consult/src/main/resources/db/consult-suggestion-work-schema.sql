CREATE TABLE IF NOT EXISTS consult_suggestion_work (
    suggestion_id TEXT PRIMARY KEY REFERENCES consult_suggestion(id),
    state TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    requirement_id TEXT,
    commit_hash TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consult_suggestion_work_queue ON consult_suggestion_work(state, updated_at);
