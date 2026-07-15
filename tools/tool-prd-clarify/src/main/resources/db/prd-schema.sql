-- PRD 澄清会话表（产品需求澄清工具）
-- status: CLARIFYING（等待答题）| GENERATING（生成中）| DONE（完成）| ERROR（出错）
-- questions 存 JSON 数组，格式 [{"id":1,"question":"...","answer":"..."}]
CREATE TABLE IF NOT EXISTS prd_session (
    id          TEXT    PRIMARY KEY,            -- UUID
    title       TEXT    NOT NULL,               -- 用户输入的需求标题
    project     TEXT,                           -- 关联项目名（来自 GET /api/projects）
    module      TEXT,                           -- 关联模块名（来自工作区 modules API）
    raw_input   TEXT    NOT NULL,               -- 原始需求描述（大段文本）
    questions   TEXT,                           -- JSON: [{id,question,answer}]，澄清阶段产出
    status      TEXT    NOT NULL DEFAULT 'CLARIFYING',
    md_path     TEXT,                           -- ~/.kai-toolbox/prd/{id}.md 绝对路径
    model       TEXT,                           -- 使用的模型（null 走 sidecar 默认模型）
    error_msg   TEXT,                           -- ERROR 状态时的错误信息
    created_at  INTEGER NOT NULL,               -- Unix 毫秒
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prd_session_created ON prd_session(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prd_session_status  ON prd_session(status);
