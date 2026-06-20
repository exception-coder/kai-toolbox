-- LLM 网关监控：每次 chat() 调用一条记录（含每次故障转移尝试）。
-- 所有 DDL 必须 IF NOT EXISTS（SchemaInitializer 每次启动都跑，split(";") 朴素切分）。
CREATE TABLE IF NOT EXISTS llm_call_log (
    id               TEXT PRIMARY KEY,
    created_at       TEXT    NOT NULL,           -- ISO-8601（带时区），调用发起时刻
    epoch_ms         INTEGER NOT NULL,           -- 毫秒时间戳，便于时间桶聚合
    tier             TEXT    NOT NULL,
    model_id         TEXT    NOT NULL,           -- ModelSpec.id（池成员标识）
    model_name       TEXT,                       -- 实际模型名
    tool_id          TEXT,                       -- 归因：工具（可空）
    agent            TEXT,                       -- 归因：agent（可空）
    stage            TEXT,                       -- 归因：阶段（可空）
    input_tokens     INTEGER,
    output_tokens    INTEGER,
    total_tokens     INTEGER,
    tokens_estimated INTEGER NOT NULL DEFAULT 0, -- 0=模型回传 1=代码估算
    cost             REAL    NOT NULL DEFAULT 0, -- 估算成本（元）
    latency_ms       INTEGER NOT NULL DEFAULT 0,
    status           TEXT    NOT NULL,           -- success / error / quota_blocked
    finish_reason    TEXT,
    attempt          INTEGER NOT NULL DEFAULT 1, -- 第几次尝试（故障转移链）
    error_type       TEXT,
    error_message    TEXT,
    request_chars    INTEGER NOT NULL DEFAULT 0,
    response_chars   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_llm_call_log_created  ON llm_call_log(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_call_log_epoch    ON llm_call_log(epoch_ms);
CREATE INDEX IF NOT EXISTS idx_llm_call_log_model    ON llm_call_log(model_id, epoch_ms);
CREATE INDEX IF NOT EXISTS idx_llm_call_log_tier     ON llm_call_log(tier, epoch_ms);
CREATE INDEX IF NOT EXISTS idx_llm_call_log_tool     ON llm_call_log(tool_id, epoch_ms);
CREATE INDEX IF NOT EXISTS idx_llm_call_log_status   ON llm_call_log(status, epoch_ms);
