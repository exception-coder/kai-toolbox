-- 最近轮次失败摘要，不复制提示词或原生日志。
CREATE TABLE IF NOT EXISTS claude_chat_last_outcome (
    session_id TEXT PRIMARY KEY REFERENCES claude_chat_session(id) ON DELETE CASCADE,
    turn_id TEXT NOT NULL,
    ended_at INTEGER,
    category TEXT,
    code TEXT
);
