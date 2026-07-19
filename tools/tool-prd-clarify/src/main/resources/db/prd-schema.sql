-- PRD 澄清会话表（产品需求澄清工具）
-- status: CLARIFYING（等待答题）| GENERATING（生成中）| DONE（完成）| ERROR（出错）
-- role: PRODUCT（产品/开发，问设计细节和技术约束）| BUSINESS（业务员，只问业务关键问题）
-- questions 存 JSON 数组，格式 [{"id":1,"question":"...","answer":"..."}]
CREATE TABLE IF NOT EXISTS prd_session (
    id          TEXT    PRIMARY KEY,            -- UUID
    title       TEXT    NOT NULL,               -- 用户输入的需求标题
    project     TEXT,                           -- 关联项目名（来自 GET /api/projects）
    module      TEXT,                           -- 关联模块名（来自工作区 modules API）
    raw_input   TEXT    NOT NULL,               -- 原始需求描述（大段文本）
    questions   TEXT,                           -- JSON: [{id,question,answer}]，澄清阶段产出
    status      TEXT    NOT NULL DEFAULT 'CLARIFYING',
    role        TEXT    NOT NULL DEFAULT 'PRODUCT', -- 提需求方角色，决定澄清问题的深度
    md_path     TEXT,                           -- ~/.kai-toolbox/prd/{id}.md 绝对路径
    model       TEXT,                           -- 使用的模型（null 走 sidecar 默认模型）
    error_msg   TEXT,                           -- ERROR 状态时的错误信息
    created_at  INTEGER NOT NULL,               -- Unix 毫秒
    updated_at  INTEGER NOT NULL
);

-- 存量数据库兼容：为已有表补充 role 列（SchemaInitializer 会忽略"duplicate column"错误）
ALTER TABLE prd_session ADD COLUMN role TEXT NOT NULL DEFAULT 'PRODUCT';

-- 存量数据库兼容：补充开发文档路径列
ALTER TABLE prd_session ADD COLUMN dev_doc_path TEXT;
-- 关联的 Vibe Coding（claude-chat）开发会话 ID
ALTER TABLE prd_session ADD COLUMN dev_session_id TEXT;
-- 开发文档最后生成时间（用于判断开发文档是否过期：dev_doc_generated_at < updated_at 则过期）
ALTER TABLE prd_session ADD COLUMN dev_doc_generated_at INTEGER;

-- 需求类型：BUG_FIX（缺陷修复，问复现步骤/期望-实际行为，产出「缺陷修复说明」）|
-- MODULE_ADJUST（调整现有模块）| NEW_MODULE（新增模块/功能，默认值，兼容历史数据）。
-- 与 role 是正交维度：role 决定谁在问/技术深度，req_type 决定问什么、产出什么结构的文档。
ALTER TABLE prd_session ADD COLUMN req_type TEXT NOT NULL DEFAULT 'NEW_MODULE';
-- 本次澄清最多问几轮，由「开始澄清」确认弹框按 req_type 预填默认值、用户可调（原先硬编码 5）。
ALTER TABLE prd_session ADD COLUMN max_questions INTEGER NOT NULL DEFAULT 5;

-- 开发文档生成历史：JSON 数组，每次生成/重新生成/更新都追加一条，用于追溯"这版为什么长这样"。
-- 格式 [{"version":1,"mode":"generate|regenerate|update","extraInstructions":"...","generatedAt":...}]。
-- version 与磁盘上的 {id}-dev-v{n}.md 备份文件编号对应（version 对应生成出来、后续被覆盖前
-- 备份为 v{version}.md 的那一份）。故意不 touch updated_at（原因同 dev_doc_path/dev_session_id，
-- 详见 PrdSessionRepository 对应方法注释）。
ALTER TABLE prd_session ADD COLUMN dev_doc_history TEXT;

CREATE INDEX IF NOT EXISTS idx_prd_session_created ON prd_session(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prd_session_status  ON prd_session(status);
