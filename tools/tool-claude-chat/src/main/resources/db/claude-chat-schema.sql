-- 移动端 Claude 客户端的会话元数据。
-- 不持久化完整对话（对话由 Claude Agent SDK 落在 ~/.claude/projects/*.jsonl）；
-- 这里只存让用户在列表里切回去 / resume 续跑所需的最小元数据。
CREATE TABLE IF NOT EXISTS claude_chat_session (
    id              TEXT PRIMARY KEY,
    cwd             TEXT NOT NULL,
    title           TEXT,
    -- SDK 侧 session_id，用于 query({ resume }) 续跑历史会话
    sdk_session_id  TEXT,
    -- 会话引擎：claude / codex / gemini（既有库由迁移 bean 补列，旧行默认 claude）
    engine          TEXT DEFAULT 'claude',
    -- 本会话先后用过的引擎有序列（逗号分隔，如 'claude,codex'）；切 agent 时追加，用于列表标记
    engines         TEXT,
    -- 各引擎各自的 SDK 会话句柄映射 JSON（如 {"claude":"sid-A","codex":"sid-B"}）；
    -- 切 agent 持久化，跨 sidecar 重启也能精准 resume 回原引擎、只补增量
    engine_sessions TEXT,
    -- 第三方 Anthropic 兼容网关（如 4sapi）：仅本会话生效，空=走官方登录。
    -- 持久化以便断连重连 / sidecar 重启后 resume 仍指向同一网关。auth_token 本地明文存（单机单用户）。
    api_base_url    TEXT,
    auth_token      TEXT,
    -- RUNNING / IDLE / INTERRUPTED / DONE
    status          TEXT NOT NULL,
    started_at      INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claude_chat_session_seen
    ON claude_chat_session(last_seen_at DESC);

-- 本机历史会话（transcript jsonl）的自定义别名，叠加显示，不改文件。
CREATE TABLE IF NOT EXISTS claude_chat_session_alias (
    sdk_session_id  TEXT PRIMARY KEY,
    alias           TEXT NOT NULL,
    updated_at      INTEGER NOT NULL
);

-- 模块级 KV 设置：单行配置存这里（payload 存 JSON 串），如 ERP 需求开发的测试库(erp-db)/本地实例(erp-app)连接。
-- 早期这些配置存 ~/.kai-toolbox/*.json，现统一落 SQLite（ConfigService 首次读时自动从旧 json 导入并改名 .bak）。
CREATE TABLE IF NOT EXISTS claude_chat_setting (
    name        TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
