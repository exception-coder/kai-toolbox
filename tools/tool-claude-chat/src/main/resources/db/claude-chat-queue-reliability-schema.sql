-- 功能：Vibe Coding 无人值守队列；变更：保存轮次完成准入；目的：重启后恢复真实完成状态
CREATE TABLE IF NOT EXISTS claude_chat_queue_runtime (
    session_id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL,
    release_ready INTEGER NOT NULL DEFAULT 0,
    stop_reason TEXT,
    task_text TEXT,
    check_attempts INTEGER NOT NULL DEFAULT 0,
    checking INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);
-- 功能：Vibe Coding 无人值守队列；变更：保存派发与接收回执；目的：发送确认前不删除原文并防止盲重放
CREATE TABLE IF NOT EXISTS claude_chat_queue_delivery (
    session_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    turn_id TEXT NOT NULL,
    store_id TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    retry_at INTEGER NOT NULL DEFAULT 0,
    note TEXT
);
