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
    assignee_user_id INTEGER,                       -- 绑定 auth_user.id，assignee 仅作展示快照
    deadline       TEXT,                            -- 截止日期（yyyy-MM-dd）
    prd_session_id TEXT,                            -- 关联的 prd_session.id（澄清完成后回写）
    tags           TEXT,                            -- JSON 数组，如 ["前端","数据库"]
    req_type       TEXT,                            -- AI 澄清策略分类
    req_type_source TEXT,                           -- EXPLICIT | AI | PRD_SESSION | UNKNOWN
    req_type_confidence REAL,                       -- 0.0..1.0
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_req_pool_status   ON req_pool_item(status);
CREATE INDEX IF NOT EXISTS idx_req_pool_priority ON req_pool_item(priority);
CREATE INDEX IF NOT EXISTS idx_req_pool_created  ON req_pool_item(created_at DESC);

-- AI 洞察分析：存储 Claude 对需求的价值/优先级分析（JSON），存量数据库兼容
ALTER TABLE req_pool_item ADD COLUMN ai_insight TEXT;

-- 负责人账号绑定。SQLite 不支持 ADD COLUMN IF NOT EXISTS，SchemaInitializer 会吞掉重复列错误。
ALTER TABLE req_pool_item ADD COLUMN assignee_user_id INTEGER;

-- 需求类型单一事实源。存量记录保持 NULL，由 API 显式投影为 UNKNOWN，禁止关键词猜测回填。
ALTER TABLE req_pool_item ADD COLUMN req_type TEXT;
ALTER TABLE req_pool_item ADD COLUMN req_type_source TEXT;
ALTER TABLE req_pool_item ADD COLUMN req_type_confidence REAL;

-- AI 洞察不可变历史；ai_insight 在兼容期继续作为最新结果投影。
CREATE TABLE IF NOT EXISTS req_pool_insight (
    id                 TEXT    PRIMARY KEY,
    item_id            TEXT    NOT NULL,
    analysis_type      TEXT    NOT NULL,
    prompt_version     TEXT    NOT NULL,
    source_hash        TEXT    NOT NULL,
    portfolio_set_hash TEXT,
    payload_json       TEXT    NOT NULL,
    engine             TEXT    NOT NULL,
    model              TEXT,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_req_pool_insight_item_created
    ON req_pool_insight(item_id, created_at DESC);

-- 用户主动从需求中枢删除某条 PRD 镜像后保留排除标记，避免下次自动同步重新导入。
-- 源 PRD 本身不受影响；源 PRD 删除后同步任务会清理对应标记。
CREATE TABLE IF NOT EXISTS req_pool_prd_exclusion (
    prd_session_id TEXT PRIMARY KEY,
    excluded_at    INTEGER NOT NULL
);

-- 初始化规格规划评估账本。保存输入快照、准则版本、模型原始结构化输出和代码归一化结果，
-- 用于后续与交付复评及实际工时做稳定偏差评测。
CREATE TABLE IF NOT EXISTS req_pool_planning_assessment (
    id                 TEXT    PRIMARY KEY,
    item_id            TEXT    NOT NULL,
    prd_session_id     TEXT    NOT NULL,
    input_hash         TEXT    NOT NULL,
    input_snapshot     TEXT    NOT NULL,
    evidence_trace_json TEXT,
    criteria_version   TEXT    NOT NULL,
    prompt_version     TEXT    NOT NULL,
    status             TEXT    NOT NULL,
    raw_output_json    TEXT,
    payload_json       TEXT,
    engine             TEXT    NOT NULL,
    model              TEXT,
    error_message      TEXT,
    started_at         INTEGER NOT NULL,
    completed_at       INTEGER,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
);

ALTER TABLE req_pool_planning_assessment ADD COLUMN evidence_trace_json TEXT;

CREATE INDEX IF NOT EXISTS idx_req_planning_item_created
    ON req_pool_planning_assessment(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_req_planning_session_created
    ON req_pool_planning_assessment(prd_session_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uk_req_planning_active_input
    ON req_pool_planning_assessment(prd_session_id, input_hash, criteria_version)
    WHERE status IN ('RUNNING', 'COMPLETED');
