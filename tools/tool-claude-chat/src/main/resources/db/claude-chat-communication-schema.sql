-- 功能：会话沟通流水；变更：创建会话资料与时间索引；目的：回顾原文截图并保留整理备注
CREATE TABLE IF NOT EXISTS claude_chat_communication_record (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    occurred_at INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    participants TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',
    original_text TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    attachment_ids TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cc_communication_session_time
    ON claude_chat_communication_record(session_id, deleted_at, occurred_at, id);
