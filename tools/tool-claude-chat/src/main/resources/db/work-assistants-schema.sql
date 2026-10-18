-- 功能：轻量工作助理；变更：保存用户独立会话及Skill快照；目的：唤醒不抢占编码会话
CREATE TABLE IF NOT EXISTS chat_work_assistant_session (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, assistant_id TEXT NOT NULL,
    title TEXT NOT NULL, skill_text TEXT NOT NULL, skill_hash TEXT NOT NULL,
    engine TEXT NOT NULL, model TEXT, evidence TEXT NOT NULL, created_at INTEGER NOT NULL,
    request_id TEXT NOT NULL, creation_hash TEXT NOT NULL, UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_work_assistant_owner ON chat_work_assistant_session(user_id,assistant_id,created_at DESC);
-- 功能：助理任务；变更：保存输入结果与幂等身份；目的：重连恢复及防止重复推理
CREATE TABLE IF NOT EXISTS chat_work_assistant_turn (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES chat_work_assistant_session(id),
    request_id TEXT NOT NULL, input TEXT NOT NULL, output TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL, error TEXT, created_at INTEGER NOT NULL,
    UNIQUE(session_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_assistant_running ON chat_work_assistant_turn(session_id) WHERE status='RUNNING';
