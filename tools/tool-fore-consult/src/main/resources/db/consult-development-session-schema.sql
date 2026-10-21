CREATE TABLE IF NOT EXISTS consult_development_session (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS consult_development_message (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES consult_development_session(id),
    suggestion_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    content TEXT NOT NULL,
    engine_session_id TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consult_development_messages ON consult_development_message(session_id, sequence);
