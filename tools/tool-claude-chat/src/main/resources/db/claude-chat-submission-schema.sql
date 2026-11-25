-- 服务端接单原文独立于引擎 transcript，连接切换不改变消息归属。
CREATE TABLE IF NOT EXISTS claude_chat_submission (
    session_id TEXT NOT NULL,
    id TEXT NOT NULL,
    text TEXT NOT NULL,
    attachments_json TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    turn_id TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, id),
    FOREIGN KEY (session_id) REFERENCES claude_chat_session(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chat_submission_created
    ON claude_chat_submission(session_id, created_at DESC);
