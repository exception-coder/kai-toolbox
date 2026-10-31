-- 功能：计划评审交接；变更：保存原会话评审待办与执行关联；目的：明确确认后执行并保留去重和回执。
CREATE TABLE IF NOT EXISTS claude_chat_review_todo (
    id TEXT PRIMARY KEY,
    review_space_id TEXT NOT NULL,
    source_session_id TEXT NOT NULL,
    feedback_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    source_revision INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'WAITING',
    message_id TEXT,
    note TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(review_space_id, requirement_id, source_revision)
);
-- 功能：原会话评审待办；变更：建立会话及派发关联索引；目的：会话内读取与按回执更新任务。
CREATE INDEX IF NOT EXISTS idx_review_todo_source ON claude_chat_review_todo(source_session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_review_todo_message ON claude_chat_review_todo(source_session_id, message_id);
