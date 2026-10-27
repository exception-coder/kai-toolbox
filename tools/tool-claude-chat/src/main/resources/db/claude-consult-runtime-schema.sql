-- 功能：业务咨询跨账号接续；变更：独立保存平台历史；目的：原账号失效后仍可阅读并分页读取关键原文
CREATE TABLE IF NOT EXISTS claude_consult_history (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    payload TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE (session_id, entry_key)
);
CREATE INDEX IF NOT EXISTS idx_consult_history_session ON claude_consult_history(session_id, seq);
-- 功能：咨询运行账号；变更：保留每个原生线程段和完整导入状态；目的：不跨账号恢复原线程，不删除旧账号历史
CREATE TABLE IF NOT EXISTS claude_consult_segment (
    segment_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    codex_home TEXT NOT NULL,
    native_id TEXT,
    policy_version INTEGER NOT NULL,
    context_index_seq INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consult_segment_session ON claude_consult_segment(session_id, created_at);
CREATE TABLE IF NOT EXISTS claude_consult_history_state (
    session_id TEXT PRIMARY KEY,
    imported INTEGER NOT NULL DEFAULT 0,
    gap TEXT
);
-- 功能：咨询逐轮执行；变更：持久请求去重和账号快照；目的：并发与未知发送结果不重复执行业务问题
CREATE TABLE IF NOT EXISTS claude_consult_request (
    session_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    segment_id TEXT NOT NULL,
    codex_home TEXT NOT NULL,
    policy_version INTEGER NOT NULL,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, request_id)
);
