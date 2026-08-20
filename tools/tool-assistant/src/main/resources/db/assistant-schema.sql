-- 功能：嵌入式 AI 助手草稿；变更：创建 Bug 与建议草稿表；目的：确认前持久化可编辑草稿且不写需求中枢
CREATE TABLE IF NOT EXISTS assistant_draft (
    id                    TEXT PRIMARY KEY,
    creator_user_id       INTEGER NOT NULL,
    session_id            TEXT NOT NULL,
    kind                  TEXT NOT NULL,
    title                 TEXT NOT NULL,
    description           TEXT NOT NULL,
    context_snapshot_json TEXT NOT NULL,
    evidence_json         TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'DRAFT',
    create_time           INTEGER NOT NULL,
    update_time           INTEGER NOT NULL
);

-- 功能：嵌入式 AI 助手草稿；变更：创建创建者时间索引；目的：按当前用户高效查询草稿
CREATE INDEX IF NOT EXISTS idx_assistant_draft_creator
    ON assistant_draft(creator_user_id, create_time DESC);

-- 功能：嵌入式 AI 助手需求登记；变更：创建草稿到 ReqPool 的幂等映射表；目的：重复确认返回首次登记结果
CREATE TABLE IF NOT EXISTS assistant_registration (
    id                    TEXT PRIMARY KEY,
    draft_id              TEXT NOT NULL,
    idempotency_key       TEXT NOT NULL UNIQUE,
    requirement_id        TEXT,
    status                TEXT NOT NULL DEFAULT 'RESERVED',
    create_time           INTEGER NOT NULL,
    update_time           INTEGER NOT NULL
);

-- 功能：嵌入式 AI 助手需求登记；变更：创建草稿登记索引；目的：按草稿追踪正式需求记录
CREATE INDEX IF NOT EXISTS idx_assistant_registration_draft
    ON assistant_registration(draft_id, create_time DESC);

-- 功能：嵌入式 AI 助手需求登记；变更：约束每份草稿最多生成一条正式需求；目的：不同幂等键也不能绕过草稿级去重
CREATE UNIQUE INDEX IF NOT EXISTS uk_assistant_registration_draft
    ON assistant_registration(draft_id);

-- 功能：嵌入式 AI 助手上下文；变更：创建不可变上下文快照表；目的：历史消息与请求时页面状态解耦
CREATE TABLE IF NOT EXISTS assistant_context_snapshot (
    id                    TEXT PRIMARY KEY,
    session_id            TEXT NOT NULL,
    creator_user_id       INTEGER NOT NULL,
    protocol_version      TEXT NOT NULL,
    snapshot_json         TEXT NOT NULL,
    create_time           INTEGER NOT NULL,
    update_time           INTEGER NOT NULL
);

-- 功能：嵌入式 AI 助手上下文；变更：创建会话时间索引；目的：高效读取指定会话最新快照
CREATE INDEX IF NOT EXISTS idx_assistant_context_session
    ON assistant_context_snapshot(session_id, create_time DESC);
