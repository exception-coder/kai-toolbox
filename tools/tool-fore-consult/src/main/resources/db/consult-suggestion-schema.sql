-- 应用启动时幂等创建业务咨询需求建议清单，不需要人工执行。
CREATE TABLE IF NOT EXISTS consult_suggestion (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    original TEXT NOT NULL,
    title TEXT NOT NULL,
    problem TEXT NOT NULL,
    expected TEXT NOT NULL,
    acceptance TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_consult_suggestion_recent ON consult_suggestion(created_at DESC, id DESC);
