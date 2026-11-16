CREATE TABLE IF NOT EXISTS claude_chat_engine_handoff (
    session_id TEXT PRIMARY KEY REFERENCES claude_chat_session(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS claude_chat_context_message (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES claude_chat_session(id) ON DELETE CASCADE,
    message_key TEXT NOT NULL,
    engine TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    UNIQUE(session_id, message_key)
);
CREATE INDEX IF NOT EXISTS idx_chat_context_session ON claude_chat_context_message(session_id, sequence);
