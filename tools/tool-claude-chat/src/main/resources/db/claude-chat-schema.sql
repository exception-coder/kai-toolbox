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
    -- 会话分组名（用户自定义，空=未分组）；原在浏览器 localStorage，改后端持久化后跨端/换浏览器可见
    group_name      TEXT,
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

-- ===== SRM 需求开发：开发任务 + 变更登记（纯台账，只登记不执行）=====
-- 一个开发任务下累积「SQL 变更」与「配置变更」两类登记，供发布时人工照单执行/交接。
-- 后端只做结构化存储与展示，绝不连库执行任何 DDL/DML。
CREATE TABLE IF NOT EXISTS srm_dev_task (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    module_name TEXT,
    requirement TEXT,
    owner       TEXT,
    -- open / developing / done / archived
    status      TEXT NOT NULL DEFAULT 'open',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_srm_dev_task_updated
    ON srm_dev_task(updated_at DESC);

-- SQL 变更登记：DDL/DML 脚本 + 目标库 + 说明。executed 为人工勾选「已在某环境执行」的标记，非后端真执行。
CREATE TABLE IF NOT EXISTS srm_dev_sql_change (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    title       TEXT,
    db_name     TEXT,
    -- DDL / DML
    change_type TEXT,
    sql_text    TEXT NOT NULL,
    author      TEXT,
    -- 人工标记：是否已在环境执行（0/1）
    executed    INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_srm_dev_sql_change_task
    ON srm_dev_sql_change(task_id, sort_order);

-- 配置变更登记：配置项 + 作用域 + 旧值/新值 + 备注。applied 为人工勾选「已应用」标记。
CREATE TABLE IF NOT EXISTS srm_dev_config_change (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    config_key  TEXT NOT NULL,
    scope       TEXT,
    old_value   TEXT,
    new_value   TEXT,
    remark      TEXT,
    -- 人工标记：是否已应用（0/1）
    applied     INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_srm_dev_config_change_task
    ON srm_dev_config_change(task_id, sort_order);
