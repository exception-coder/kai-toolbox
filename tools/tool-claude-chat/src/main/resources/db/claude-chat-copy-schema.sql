-- 功能：Vibe Coding 会话配置复制；变更：新增持久回执表；目的：重复请求复用同一副本并避免丢失确认
-- 回执与副本同一事务提交，保留已删除副本的身份以阻止重试重建。
CREATE TABLE IF NOT EXISTS claude_chat_session_copy (
    owner_key TEXT NOT NULL,
    request_id TEXT NOT NULL,
    source_session_id TEXT NOT NULL,
    target_session_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (owner_key, request_id)
);
