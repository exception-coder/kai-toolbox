-- 功能：Vibe Coding 轮次变更；变更：创建观察记录表；目的：保留 Git 基线和结束记录供会话检索
CREATE TABLE IF NOT EXISTS claude_chat_turn_change (
    session_id TEXT NOT NULL REFERENCES claude_chat_session(id) ON DELETE CASCADE,
    turn_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (session_id, turn_id)
);
CREATE INDEX IF NOT EXISTS idx_claude_chat_turn_change_time ON claude_chat_turn_change(session_id, started_at DESC);
