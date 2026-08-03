-- PRD 澄清会话表（产品需求澄清工具）
-- status: DRAFT（草稿，仅存了标题/关联项目模块/需求描述，尚未发起澄清）|
--         CLARIFYING（等待答题）| GENERATING（生成中）| DONE（完成）| ERROR（出错）
-- 草稿态不需要新增列——role/req_type/max_questions/clarify_mode 沿用列默认值占位，
-- 真正点「开始澄清」把草稿转正式时才会被重新赋值（见 PrdClarifyService#startClarifyFromDraft）。
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
    engine      TEXT,                           -- 草稿为空；开始澄清后写入 claude | codex
    error_msg   TEXT,                           -- ERROR 状态时的错误信息
    created_at  INTEGER NOT NULL,               -- Unix 毫秒
    updated_at  INTEGER NOT NULL
);

-- 存量数据库兼容：为已有表补充 role 列（SchemaInitializer 会忽略"duplicate column"错误）
ALTER TABLE prd_session ADD COLUMN role TEXT NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE prd_session ADD COLUMN engine TEXT;

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

-- TDD 技术澄清暂存：用户提交答案时立即保存，文档生成失败或连接中断后可恢复继续生成。
-- 成功生成并写入 dev_doc_history 后清空；纯暂存字段不 touch updated_at。
ALTER TABLE prd_session ADD COLUMN dev_doc_qa_draft TEXT;
-- TDD 点按作业状态：BUILDING_QUESTIONS | AWAITING_ANSWERS | GENERATING | ERROR | DONE。
ALTER TABLE prd_session ADD COLUMN dev_doc_work_status TEXT;
ALTER TABLE prd_session ADD COLUMN dev_doc_work_error TEXT;

-- 需求中枢节点时间线：分别记录 PRD/TDD 澄清问题真正生成完成的时间。
-- created_at 是需求登记时间；PRD 输出时间复用 DONE 时的 updated_at；TDD 输出时间复用
-- dev_doc_generated_at。单独落库避免用 updated_at 猜测问题何时返回。
ALTER TABLE prd_session ADD COLUMN prd_questions_generated_at INTEGER;
ALTER TABLE prd_session ADD COLUMN prd_generated_at INTEGER;
ALTER TABLE prd_session ADD COLUMN dev_doc_questions_generated_at INTEGER;

-- AI 工时评估结果：JSON {hoursMin,hoursMax,confidence,reasoning,breakdown:[{item,hours}],estimatedAt}。
-- 只对应「当前」开发文档（开发文档一定基于最新 PRD 生成），不按版本存多份。故意不 touch
-- updated_at（原因同 dev_doc_history）；是否过期由前端/视图层比较 estimatedAt 与 dev_doc_generated_at。
ALTER TABLE prd_session ADD COLUMN dev_doc_estimation TEXT;

-- 创建者（auth_user.id），用于历史列表按用户隔离（ADMIN 角色不受限，可见全部）。
-- 只加列，不在这里做存量数据回填——SchemaInitializer 跨模块扫描 *-schema.sql 不保证执行顺序，
-- 这里直接 UPDATE 引用 auth_user 表可能在它建表前执行而报错、拖垮整个应用启动。存量回填改在
-- PrdSessionOwnerMigration（@DependsOn("schemaInitializer")，保证所有模块建表完成后再跑）里做。
ALTER TABLE prd_session ADD COLUMN created_by_user_id INTEGER;

-- 澄清模式：progressive（渐进式，逐题追问，默认，兼容存量数据）| batch（批量，一次性生成
-- max_questions 道题，用户一次性填完）。「开始澄清前确认」弹框里选，恢复未完成会话
-- （status=CLARIFYING）时前端据此决定渲染哪种澄清面板，不会中途变来变去。
ALTER TABLE prd_session ADD COLUMN clarify_mode TEXT NOT NULL DEFAULT 'progressive';

-- 进度评估文档：结构对齐开发文档——独立落盘 + 按版本追加（不是覆盖），每次评估都基于当时
-- 最新的 PRD + 开发文档核对代码库实际实现进度，追加一份新版本，可回看历次评估。
-- progress_path：~/.kai-toolbox/prd/{id}-progress.md 绝对路径（非 null 表示已评估过）。
ALTER TABLE prd_session ADD COLUMN progress_path TEXT;
-- 最后一次评估时间（毫秒），用于跟 dev_doc_generated_at/updated_at 比较判断是否已过期。
ALTER TABLE prd_session ADD COLUMN progress_generated_at INTEGER;
-- 评估历史：JSON 数组 [{"version":1,"extraContext":"...","generatedAt":...}]，version 与磁盘上
-- 备份出的 {id}-progress-v{n}.md 对应，用法完全对齐 dev_doc_history（含"故意不 touch
-- updated_at"的理由）。
ALTER TABLE prd_session ADD COLUMN progress_history TEXT;

-- 需求拆分：一个较大的需求可以先让 Claude 判断能否拆成多个可独立澄清/开发的子需求
-- （见 PrdClarifyService#splitRequirement/adoptSplit），用户确认采纳后，每个子需求各自
-- 落一条 DRAFT 草稿记录，parent_id 指回原会话——原会话本身不受影响，原始需求描述原样保留，
-- 只是历史列表里多了几条挂在它下面的子记录，PRD 因此有了层级结构；修订版也通过
-- parent_id 挂在其来源版本下面，形成可折叠的版本树。
ALTER TABLE prd_session ADD COLUMN parent_id TEXT;

-- 业务需求来源字段：从飞书需求池导入或在 PRD 起草表单中录入。
-- business_requirement_type 是业务侧原始分类，不与 req_type（AI 澄清策略分类）混用。
ALTER TABLE prd_session ADD COLUMN requirement_detail TEXT;
ALTER TABLE prd_session ADD COLUMN business_background TEXT;
ALTER TABLE prd_session ADD COLUMN business_requirement_type TEXT;
ALTER TABLE prd_session ADD COLUMN requirement_software TEXT;
ALTER TABLE prd_session ADD COLUMN initiating_department TEXT;
ALTER TABLE prd_session ADD COLUMN requester TEXT;
ALTER TABLE prd_session ADD COLUMN requested_at TEXT;
ALTER TABLE prd_session ADD COLUMN source_attachments TEXT;
ALTER TABLE prd_session ADD COLUMN follow_up_records TEXT;

CREATE INDEX IF NOT EXISTS idx_prd_session_created ON prd_session(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prd_session_status  ON prd_session(status);
CREATE INDEX IF NOT EXISTS idx_prd_session_created_by ON prd_session(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_prd_session_parent ON prd_session(parent_id);

-- Vibe Coding 文档变更候选：AI 只负责分析和登记，用户确认后仍复用现有 PRD/TDD 生成接口。
-- decision 是用户最终采用的范围，ai_decision 保留模型原始建议，便于审计覆写。
CREATE TABLE IF NOT EXISTS prd_doc_change_candidate (
    id                          TEXT PRIMARY KEY,
    prd_session_id              TEXT NOT NULL,
    dev_session_id              TEXT NOT NULL,
    conversation_from_seq       INTEGER NOT NULL DEFAULT 0,
    conversation_to_seq         INTEGER NOT NULL DEFAULT 0,
    code_snapshot_hash          TEXT NOT NULL,
    decision                    TEXT NOT NULL,
    ai_decision                 TEXT NOT NULL,
    summary                     TEXT,
    reasoning                   TEXT,
    change_cause_type           TEXT,
    change_cause_detail         TEXT,
    evidence_json               TEXT,
    prd_patch_plan_json         TEXT,
    tdd_patch_plan_json         TEXT,
    risks_json                  TEXT,
    clarification_question      TEXT,
    clarification_history_json  TEXT,
    confidence                  INTEGER NOT NULL DEFAULT 0,
    status                      TEXT NOT NULL DEFAULT 'PENDING',
    apply_stage                 TEXT NOT NULL DEFAULT 'NONE',
    last_error                  TEXT,
    prd_applied_at              INTEGER,
    tdd_applied_at              INTEGER,
    revision_session_id         TEXT,
    diff_ledger_json            TEXT NOT NULL DEFAULT '[]',
    alignment_conclusion_json   TEXT NOT NULL DEFAULT '{}',
    verified_at                 INTEGER,
    created_at                  INTEGER NOT NULL,
    updated_at                  INTEGER NOT NULL,
    FOREIGN KEY (prd_session_id) REFERENCES prd_session(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prd_doc_candidate_snapshot
    ON prd_doc_change_candidate(prd_session_id, dev_session_id, code_snapshot_hash);
CREATE INDEX IF NOT EXISTS idx_prd_doc_candidate_latest
    ON prd_doc_change_candidate(prd_session_id, created_at DESC);

-- 存量候选兼容：变更原因由 AI 初判，用户确认更新时可补充并固化。
ALTER TABLE prd_doc_change_candidate ADD COLUMN change_cause_type TEXT;
ALTER TABLE prd_doc_change_candidate ADD COLUMN change_cause_detail TEXT;
ALTER TABLE prd_doc_change_candidate ADD COLUMN revision_session_id TEXT;

-- 每个候选分析时使用的代码事实位置；候选完成后据此推进稳定同步基线。
CREATE TABLE IF NOT EXISTS prd_doc_change_analysis_snapshot (
    candidate_id                 TEXT PRIMARY KEY,
    repository_heads_json        TEXT NOT NULL DEFAULT '{}',
    workspace_snapshot_hash      TEXT NOT NULL,
    created_at                   INTEGER NOT NULL,
    FOREIGN KEY (candidate_id) REFERENCES prd_doc_change_candidate(id) ON DELETE CASCADE
);

-- 最近一次用户已确认处理完成的文档同步点。
CREATE TABLE IF NOT EXISTS prd_doc_change_baseline (
    prd_session_id               TEXT NOT NULL,
    dev_session_id               TEXT NOT NULL,
    conversation_seq             INTEGER NOT NULL DEFAULT 0,
    repository_heads_json        TEXT NOT NULL DEFAULT '{}',
    workspace_snapshot_hash      TEXT NOT NULL,
    prd_hash                     TEXT NOT NULL,
    tdd_hash                     TEXT NOT NULL,
    updated_at                   INTEGER NOT NULL,
    PRIMARY KEY (prd_session_id, dev_session_id),
    FOREIGN KEY (prd_session_id) REFERENCES prd_session(id) ON DELETE CASCADE
);
