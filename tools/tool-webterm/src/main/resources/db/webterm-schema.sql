-- 已经"进入过 Claude 会话"的快捷重启列表。PTY 进程不持久化，只持久化元数据
-- （cwd / shell / 标题 / 时间戳），用户在客户端切换或刷新后能从列表点回去重连。
CREATE TABLE IF NOT EXISTS webterm_claude_session (
    id            TEXT PRIMARY KEY,
    cwd           TEXT NOT NULL,
    shell         TEXT NOT NULL,
    title         TEXT,
    started_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webterm_claude_session_seen
    ON webterm_claude_session(last_seen_at DESC);

-- cwd + shell 作为业务唯一键：同一目录同一 shell 反复"进入"应该是同一条记录
-- 仅刷新 last_seen_at，而不是不断追加重复条目
CREATE UNIQUE INDEX IF NOT EXISTS idx_webterm_claude_session_cwd_shell
    ON webterm_claude_session(cwd, shell);
