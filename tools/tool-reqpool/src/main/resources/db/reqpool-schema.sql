-- 需求管理池主表
-- status: DRAFT（草稿）| CLARIFYING（澄清中）| PRD_READY（PRD就绪）| IN_DEV（开发中）| DONE（已完成）| CANCELLED（已取消）
-- priority: HIGH | MEDIUM | LOW
CREATE TABLE IF NOT EXISTS req_pool_item (
    id             TEXT    PRIMARY KEY,             -- UUID
    title          TEXT    NOT NULL,                -- 需求标题（简短）
    description    TEXT,                            -- 详细描述（输入给 PRD 澄清的原始需求）
    project        TEXT,                            -- 关联项目名
    module         TEXT,                            -- 关联模块名
    priority       TEXT    NOT NULL DEFAULT 'MEDIUM',
    status         TEXT    NOT NULL DEFAULT 'DRAFT',
    assignee       TEXT,                            -- 负责人
    deadline       TEXT,                            -- 截止日期（yyyy-MM-dd）
    prd_session_id TEXT,                            -- 关联的 prd_session.id（澄清完成后回写）
    tags           TEXT,                            -- JSON 数组，如 ["前端","数据库"]
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_req_pool_status   ON req_pool_item(status);
CREATE INDEX IF NOT EXISTS idx_req_pool_priority ON req_pool_item(priority);
CREATE INDEX IF NOT EXISTS idx_req_pool_created  ON req_pool_item(created_at DESC);

-- AI 洞察分析：存储 Claude 对需求的价值/优先级分析（JSON），存量数据库兼容
ALTER TABLE req_pool_item ADD COLUMN ai_insight TEXT;
