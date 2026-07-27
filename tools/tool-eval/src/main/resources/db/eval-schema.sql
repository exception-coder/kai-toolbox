-- tool-eval L0 平台层：与被测能力无关的通用评测底座
-- 分层约定见模块 javadoc：L0 存储/执行/报告（本文件）· L1 适配层 EvalAdapter · L2 断言层 · L3 数据集（eval_case 行）
--
-- scenario（任务形态，决定用哪套默认断言，不按业务系统划分）：
--   EXTRACTION  抽取/分类型 —— 结构化输出，字段级 diff，全确定性断言，不调 judge
--   RAG_QA      检索问答型 —— recall@k / 引用真实性 / 该拒答时是否拒答
--   GENERATION  生成改写型 —— rubric judge + 成对比较
--   AGENT_TRACE Agent 多步型 —— 断言工具调用轨迹
-- 首版仅实现 EXTRACTION，其余形态占位，靠 L1/L2 扩展而非新建表。

-- ---------------------------------------------------------------------------
-- 黄金集用例（L3 数据集层）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eval_case (
    id            TEXT    PRIMARY KEY,          -- UUID
    scenario      TEXT    NOT NULL,             -- 任务形态，见上
    dataset       TEXT    NOT NULL,             -- 数据集名，同 scenario 下可并存多份（如 bug-extract-v1）
    title         TEXT    NOT NULL,
    input_json    TEXT    NOT NULL,             -- adapter 入参 JSON 对象
    expected_json TEXT    NOT NULL,             -- 黄金答案 JSON 对象
    assert_json   TEXT,                         -- 断言配置 JSON 数组；为空则由 scenario 默认策略从 expected_json 推导
    tags          TEXT,                         -- JSON 数组
    source_ref    TEXT,                         -- 来源溯源，如 consult_bug:<id> / consult_turn:<sid>#<idx>
    enabled       INTEGER NOT NULL DEFAULT 1,   -- 0 停用，跑批时跳过
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_case_scenario ON eval_case(scenario);
CREATE INDEX IF NOT EXISTS idx_eval_case_dataset  ON eval_case(dataset);
CREATE INDEX IF NOT EXISTS idx_eval_case_enabled  ON eval_case(enabled);
-- source_ref 幂等由 DB 兜底：应用层「先查后插」在并发/重跑下拦不住重复回捞。
-- 用偏索引而非普通唯一索引——手工建的用例没有来源，source_ref 为 NULL 或空串是正常的，不该互斥。
CREATE UNIQUE INDEX IF NOT EXISTS uk_eval_case_source_ref ON eval_case(source_ref)
    WHERE source_ref IS NOT NULL AND source_ref <> '';

-- ---------------------------------------------------------------------------
-- 版本化提示词：被测链路的 prompt 必须可版本化，否则「回归」无从谈起
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eval_prompt (
    id         TEXT    PRIMARY KEY,
    prompt_key TEXT    NOT NULL,                -- 如 bug-extraction
    version    INTEGER NOT NULL,                -- 从 1 递增，内容变更即新版本，不原地改
    content    TEXT    NOT NULL,
    note       TEXT,
    active     INTEGER NOT NULL DEFAULT 0,      -- 同 key 下仅一条为 1，跑批默认取它
    created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_eval_prompt_key_ver ON eval_prompt(prompt_key, version);
CREATE INDEX IF NOT EXISTS idx_eval_prompt_active ON eval_prompt(prompt_key, active);

-- ---------------------------------------------------------------------------
-- 一次评测运行
-- status: RUNNING | SUCCESS | FAILED
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eval_run (
    id             TEXT    PRIMARY KEY,
    scenario       TEXT    NOT NULL,
    dataset        TEXT    NOT NULL,
    adapter        TEXT    NOT NULL,            -- EvalAdapter.id()
    model          TEXT,                        -- 空表示走引擎默认模型
    prompt_key     TEXT,
    prompt_version INTEGER,
    status         TEXT    NOT NULL DEFAULT 'RUNNING',
    total          INTEGER NOT NULL DEFAULT 0,
    passed         INTEGER NOT NULL DEFAULT 0,
    failed         INTEGER NOT NULL DEFAULT 0,
    errored        INTEGER NOT NULL DEFAULT 0,  -- 调用异常，与「答错」区分统计
    note           TEXT,
    error          TEXT,                        -- 整轮失败原因
    started_at     INTEGER NOT NULL,
    finished_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_eval_run_dataset ON eval_run(dataset, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_run_started ON eval_run(started_at DESC);

-- ---------------------------------------------------------------------------
-- 单用例结果
-- verdict: PASS | FAIL | ERROR
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eval_result (
    id              TEXT    PRIMARY KEY,
    run_id          TEXT    NOT NULL,
    case_id         TEXT    NOT NULL,
    case_title      TEXT,                       -- 冗余快照：用例改名/删除后历史 run 仍可读
    verdict         TEXT    NOT NULL,
    score           REAL    NOT NULL DEFAULT 0, -- 加权通过率 0~1，用于看「错得多严重」而非只看红绿
    output_json     TEXT,                       -- adapter 归一化后的结构化输出
    raw_output      TEXT,                       -- 原始文本，排查解析失败用
    assertions_json TEXT,                       -- 每条断言明细 JSON 数组
    error           TEXT,
    latency_ms      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_eval_result_run_case ON eval_result(run_id, case_id);
CREATE INDEX IF NOT EXISTS idx_eval_result_run ON eval_result(run_id);
