-- 具名只读共享，不改变会话所有者或已有执行权限。
CREATE TABLE IF NOT EXISTS claude_chat_session_reader (
    session_id TEXT NOT NULL REFERENCES claude_chat_session(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    granted_by INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_reader_user ON claude_chat_session_reader(user_id, created_at);
