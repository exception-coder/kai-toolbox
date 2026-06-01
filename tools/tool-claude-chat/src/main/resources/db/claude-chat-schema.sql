-- 移动端 Claude 客户端的会话元数据。
-- 不持久化完整对话（对话由 Claude Agent SDK 落在 ~/.claude/projects/*.jsonl）；
-- 这里只存让用户在列表里切回去 / resume 续跑所需的最小元数据。
CREATE TABLE IF NOT EXISTS claude_chat_session (
    id              TEXT PRIMARY KEY,
    cwd             TEXT NOT NULL,
    title           TEXT,
    -- SDK 侧 session_id，用于 query({ resume }) 续跑历史会话
    sdk_session_id  TEXT,
    -- RUNNING / IDLE / INTERRUPTED / DONE
    status          TEXT NOT NULL,
    started_at      INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claude_chat_session_seen
    ON claude_chat_session(last_seen_at DESC);
