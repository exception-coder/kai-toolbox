-- Fore- 业务系统咨询归档 schema（SQLite）
-- 复用 claude-chat 会话引擎回答业务咨询，本表只做归档 + 查询，不含独立回答引擎。
-- archive_status: PENDING（会话进行中）| SUCCESS（归档成功）| FAILED（写库/解析失败待补偿）
CREATE TABLE IF NOT EXISTS consult_session (
    session_id          TEXT    PRIMARY KEY,              -- UUID，会话唯一标识
    user_id             TEXT,                             -- 发起咨询的用户（沿用现有登录体系）
    question_title      TEXT,                             -- 首个明确问题生成的归档标题
    system_name         TEXT    NOT NULL,                 -- 所选系统名（来自 workspaces）
    system_source_path  TEXT    NOT NULL,                 -- 所选系统源码路径快照（会话 cwd）
    module_names        TEXT,                             -- 所选模块名列表，JSON 数组字符串 ["采购","退货"]
    prompt_snapshot     TEXT,                             -- 变量替换后的约束提示词快照（可追溯）
    dev_session_id      TEXT,                             -- 关联的 claude-chat 会话 id（chat.sessionId）
    raw_reference_json  TEXT,                             -- 引擎回吐的引用清单原始 JSON（容错留档）
    parse_status        TEXT    DEFAULT 'NONE',           -- NONE|OK|FAILED，引用清单解析状态
    archive_status      TEXT    NOT NULL DEFAULT 'PENDING',
    role                TEXT    DEFAULT 'IT',             -- 回答对象角色：IT（IT 客服）| BIZ（业务员），决定回答约束
    engine              TEXT    NOT NULL DEFAULT 'codex', -- 会话使用的引擎快照
    model               TEXT,                             -- 会话使用的模型快照
    codex_reasoning_effort TEXT,                          -- Codex 推理强度快照
    codex_speed         TEXT,                             -- Codex 速度快照
    codex_home          TEXT,                             -- Codex 授权目录快照
    orchestration_version TEXT NOT NULL DEFAULT 'v4',    -- v1 经典版 | v2 优化版 | v3 生产备库校验版 | v4 动态证据版，会话内固定
    error_msg           TEXT,                             -- 归档失败原因
    created_at          INTEGER NOT NULL,                 -- 会话创建时间（Unix 毫秒）
    ended_at            INTEGER                           -- 会话结束时间
);

-- 存量数据库兼容：补充 role 列（SchemaInitializer 忽略 "duplicate column" 错误）
ALTER TABLE consult_session ADD COLUMN role TEXT DEFAULT 'IT';
ALTER TABLE consult_session ADD COLUMN question_title TEXT;
ALTER TABLE consult_session ADD COLUMN engine TEXT NOT NULL DEFAULT 'codex';
ALTER TABLE consult_session ADD COLUMN model TEXT;
ALTER TABLE consult_session ADD COLUMN codex_reasoning_effort TEXT;
ALTER TABLE consult_session ADD COLUMN codex_speed TEXT;
ALTER TABLE consult_session ADD COLUMN codex_home TEXT;
ALTER TABLE consult_session ADD COLUMN orchestration_version TEXT NOT NULL DEFAULT 'v4';

CREATE TABLE IF NOT EXISTS consult_turn (
    turn_id              TEXT    PRIMARY KEY,             -- UUID
    session_id           TEXT    NOT NULL,                -- 关联 consult_session（应用层维护，不建外键）
    turn_index           INTEGER NOT NULL,                -- 轮次序号，从 1 开始
    question             TEXT,                            -- 用户提问原文
    answer               TEXT,                            -- 返回给用户的自然语言业务解答原文
    ref_menu_paths       TEXT,                            -- 命中的前端菜单路径/菜单名，JSON 数组
    ref_graphify_nodes   TEXT,                            -- 命中的 graphify 图谱节点，JSON 数组
    ref_domain_knowledge TEXT,                            -- 命中的 domain-knowledge 条目，JSON 数组
    recognized_system_name TEXT,                         -- 识别系统展示名，由服务端使用会话系统快照写入
    recognized_module_names TEXT,                        -- 识别模块展示名/路径，JSON 数组
    problem_category     TEXT,                            -- V4 受控问题分类
    recognition_status   TEXT,                            -- CONFIRMED|PARTIAL|UNRECOGNIZED
    recognition_evidence TEXT,                            -- 识别依据，JSON 数组
    attachments          TEXT,                            -- 本轮用户附件，JSON 数组 [{name,path,mime}]
    created_at           INTEGER NOT NULL
);

-- 存量数据库兼容：补充 attachments 列（SchemaInitializer 忽略 "duplicate column" 错误）
ALTER TABLE consult_turn ADD COLUMN attachments TEXT;
ALTER TABLE consult_turn ADD COLUMN recognized_system_name TEXT;
ALTER TABLE consult_turn ADD COLUMN recognized_module_names TEXT;
ALTER TABLE consult_turn ADD COLUMN problem_category TEXT;
ALTER TABLE consult_turn ADD COLUMN recognition_status TEXT;
ALTER TABLE consult_turn ADD COLUMN recognition_evidence TEXT;
ALTER TABLE consult_turn ADD COLUMN trace_id TEXT;

-- 单轮回答的用户评分/反馈。独立表，按 (session_id,turn_index) 唯一——不随 consult_turn 的
-- 整表重写（增量同步/重新归档）而丢失。rating: GOOD（满意）| BAD（不满意）。
CREATE TABLE IF NOT EXISTS consult_feedback (
    session_id     TEXT    NOT NULL,                      -- 关联 consult_session
    turn_index     INTEGER NOT NULL,                      -- 第几轮问答（从 1 开始）
    rating         TEXT    NOT NULL,                       -- GOOD | BAD
    category       TEXT,                                   -- 不满意类型（BAD 时）
    reason         TEXT,                                   -- 不满意原因
    correct_answer TEXT,                                   -- 用户提供的正确答案（可选）
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    PRIMARY KEY (session_id, turn_index)
);

-- 咨询中 AI 判定为 BUG/数据问题时自动登记的缺陷档案（人工再核实）。
-- dedup_key 去重：同「系统+模块+标题（归一）」的重复上报只累加 occurrence_count、刷新 last_seen，不重复建单。
-- status 生命周期：NEW（AI 待核实）→ CONFIRMED / DUPLICATE / FIXED / WONTFIX / REJECTED。
CREATE TABLE IF NOT EXISTS consult_bug (
    bug_id             TEXT    PRIMARY KEY,              -- UUID
    dedup_key          TEXT    NOT NULL,                 -- 去重键（系统|模块|归一标题）
    consult_session_id TEXT,                             -- 关联咨询会话
    dev_session_id     TEXT,                             -- 关联 claude-chat 会话
    system_name        TEXT,
    module             TEXT,
    role               TEXT,                             -- 上报角色 IT|BIZ
    user_id            TEXT,
    title              TEXT    NOT NULL,                 -- 一句话标题
    type               TEXT,                             -- FUNCTION_BUG|DATA_ISSUE|CONFIG|PERMISSION|OTHER
    severity           TEXT,                             -- LOW|MEDIUM|HIGH|CRITICAL
    reproduce          TEXT,                             -- 复现步骤
    expected           TEXT,                             -- 期望行为
    actual             TEXT,                             -- 实际行为
    suspect_area       TEXT,                             -- 疑似位置（菜单路径/接口/代码/表）
    evidence           TEXT,                             -- 证据（附件路径等，JSON）
    question           TEXT,                             -- 用户提问原文
    answer             TEXT,                             -- AI 结论原文
    ai_confidence      INTEGER,                          -- AI 置信度 0-100
    refs_json          TEXT,                             -- AI 依据的图谱/知识引用（JSON）
    status             TEXT    NOT NULL DEFAULT 'NEW',
    occurrence_count   INTEGER NOT NULL DEFAULT 1,
    first_seen_at      INTEGER NOT NULL,
    last_seen_at       INTEGER NOT NULL,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consult_bug_dedup   ON consult_bug(dedup_key);
CREATE INDEX IF NOT EXISTS idx_consult_bug_created ON consult_bug(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consult_bug_status  ON consult_bug(status);

CREATE INDEX IF NOT EXISTS idx_consult_session_created ON consult_session(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consult_session_user    ON consult_session(user_id);
CREATE INDEX IF NOT EXISTS idx_consult_turn_session    ON consult_turn(session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_consult_session_dev     ON consult_session(dev_session_id);

-- 业务系统展示偏好：对工作台接口传来的项目做「别名 + 过滤 + 排序」的呈现层覆盖。
-- 只存被定制过的系统；无记录的系统默认可见、用原名。系统字典仍来自 claude-chat workspaces，本表不复制字典。
-- system_name 作为身份键（与前端 projects 去重后的 name 一致）。visible: 1 显示 | 0 过滤隐藏。
CREATE TABLE IF NOT EXISTS consult_system_pref (
    system_name         TEXT    PRIMARY KEY,              -- 系统原名（工作区项目名，身份键）
    system_source_path  TEXT,                             -- 源码路径快照（仅供配置界面展示/追溯）
    alias               TEXT,                             -- 业务别名（为空则用原名）
    visible             INTEGER NOT NULL DEFAULT 1,       -- 1 显示 | 0 过滤隐藏
    sort_order          INTEGER NOT NULL DEFAULT 0,       -- 排序权重，小的靠前
    updated_at          INTEGER NOT NULL
);

-- 每轮问答的 BUG 抽取台账：既保证不重复抽（省钱），也留下「为什么这轮没登记」的凭据。
-- 主键刻意用 (session_id, turn_index) 而非 turn_id：consult_turn 在每次增量同步时被整表重写、
-- turn_id 每次都是新 UUID，挂在 turn_id 上的状态会被冲掉（同 consult_feedback 的处理）。
-- answer_hash 是幂等依据：前端每 1.5s 防抖同步一次且整表重写，没有它就会把整段对话反复重抽。
-- 答案变长/被改写时 hash 变化，才重新抽一次。
CREATE TABLE IF NOT EXISTS consult_turn_extraction (
    session_id     TEXT    NOT NULL,
    turn_index     INTEGER NOT NULL,
    answer_hash    TEXT    NOT NULL,               -- 抽取时所依据的答案指纹
    status         TEXT    NOT NULL,               -- DONE 已判定 | FAILED 调用或解析失败
    is_bug         INTEGER,                        -- 1 判定为缺陷 | 0 非缺陷 | NULL 未判定成功
    bug_id         TEXT,                           -- 命中登记时的 consult_bug.bug_id
    prompt_version INTEGER,                        -- 本次实际使用的提示词版本，退化归因用
    raw            TEXT,                           -- 原始输出，解析失败时排查用
    error          TEXT,
    extracted_at   INTEGER NOT NULL,
    PRIMARY KEY (session_id, turn_index)
);
CREATE INDEX IF NOT EXISTS idx_consult_extraction_bug ON consult_turn_extraction(bug_id);

-- 版本化提示词：BUG 抽取口径的唯一事实源。
-- 口径原本写死在前端 buildConsultSeed 的字符串字面量里，改一次就无法复现旧行为，
-- 「本周答对、改了 prompt 后下周答错」查不出是哪一版变的。落库并只追加版本后，
-- 线上取 active 版跑，评测可固定任意版本重放，退化才归得了因。
-- 同 key 下仅一条 active=1；内容变更即新增版本，不原地改。
CREATE TABLE IF NOT EXISTS consult_prompt (
    id         TEXT    PRIMARY KEY,
    prompt_key TEXT    NOT NULL,                          -- 如 bug-extraction
    version    INTEGER NOT NULL,                          -- 从 1 递增
    content    TEXT    NOT NULL,
    note       TEXT,                                      -- 版本说明，便于人工识别这版改了什么
    active     INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_consult_prompt_key_ver ON consult_prompt(prompt_key, version);
CREATE INDEX IF NOT EXISTS idx_consult_prompt_active ON consult_prompt(prompt_key, active);

-- 系统链路分析结果（持久化）：cross-topology 引擎查出的系统间关系边，整表在每次分析时替换。
-- 全局单份拓扑，(from_system,to_system) 唯一。前端加载时读取渲染，无需重新调引擎。
CREATE TABLE IF NOT EXISTS consult_topology_link (
    from_system  TEXT    NOT NULL,                        -- 起点系统原名
    to_system    TEXT    NOT NULL,                        -- 终点系统原名
    relation     TEXT,                                    -- 关系类型短标签（调用/依赖/数据流…）
    description  TEXT,                                    -- 关系说明
    created_at   INTEGER NOT NULL,                        -- 该次分析时间（Unix 毫秒）
    PRIMARY KEY (from_system, to_system)
);
