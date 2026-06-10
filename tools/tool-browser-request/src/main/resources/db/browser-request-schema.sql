-- 保留：会话表（沿用旧字段，本次不动）
CREATE TABLE IF NOT EXISTS browser_request_session (
    id              TEXT    PRIMARY KEY,
    name            TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    has_storage     INTEGER NOT NULL DEFAULT 0,
    last_active_at  INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    engine          TEXT
);

CREATE INDEX IF NOT EXISTS idx_browser_request_session_updated ON browser_request_session(updated_at DESC);

-- 一次性清理：旧编排链相关表（saved / var / pipeline / pipeline_run）整体废弃，
-- 由「站点录制编排」recording / http_call / task / task_run 替代
DROP TABLE IF EXISTS browser_request_saved;
DROP TABLE IF EXISTS browser_request_var;
DROP TABLE IF EXISTS browser_request_pipeline;
DROP TABLE IF EXISTS browser_request_pipeline_run;

-- 录制元数据
CREATE TABLE IF NOT EXISTS browser_request_recording (
    id              TEXT    PRIMARY KEY,
    session_id      TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    status          TEXT    NOT NULL,                    -- RECORDING / STOPPED / ABANDONED / AUTO_STOPPED
    capture_script  INTEGER NOT NULL DEFAULT 0,
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER,
    call_count      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recording_session ON browser_request_recording(session_id, started_at DESC);
-- 单 session 单 active recording 守门：仅对 RECORDING 行做唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_recording_active
    ON browser_request_recording(session_id) WHERE status = 'RECORDING';

-- 每条 HTTP 调用
CREATE TABLE IF NOT EXISTS browser_request_http_call (
    id                  TEXT    PRIMARY KEY,
    recording_id        TEXT    NOT NULL,
    seq                 INTEGER NOT NULL,
    method              TEXT    NOT NULL,
    url                 TEXT    NOT NULL,
    resource_type       TEXT    NOT NULL,                -- XHR / FETCH / DOCUMENT / SCRIPT
    request_headers     TEXT,                            -- JSON
    request_body        TEXT,
    status              INTEGER,
    response_headers    TEXT,                            -- JSON
    response_body       TEXT,
    response_truncated  INTEGER NOT NULL DEFAULT 0,
    sensitive           INTEGER NOT NULL DEFAULT 0,
    started_at          INTEGER NOT NULL,
    elapsed_ms          INTEGER,
    initiator           TEXT
);

CREATE INDEX IF NOT EXISTS idx_call_recording ON browser_request_http_call(recording_id, seq ASC);

-- 编排好的任务
CREATE TABLE IF NOT EXISTS browser_request_task (
    id            TEXT    PRIMARY KEY,
    session_id    TEXT    NOT NULL,
    recording_id  TEXT,                                  -- 可空：adhoc / 录制被删后置 NULL
    name          TEXT    NOT NULL,
    steps_json    TEXT    NOT NULL,
    params_json   TEXT    NOT NULL,
    options_json  TEXT,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_session ON browser_request_task(session_id, updated_at DESC);

-- 回放历史
CREATE TABLE IF NOT EXISTS browser_request_task_run (
    id                 TEXT    PRIMARY KEY,
    task_id            TEXT    NOT NULL,
    status             TEXT    NOT NULL,                 -- RUNNING / DONE / FAILED / CANCELLED
    started_at         INTEGER NOT NULL,
    finished_at        INTEGER,
    inputs_json        TEXT,
    step_results_json  TEXT,
    error_message      TEXT
);

CREATE INDEX IF NOT EXISTS idx_run_task ON browser_request_task_run(task_id, started_at DESC);

-- AI 用例：自然语言 → LLM 生成并经人工确认的动作脚本（steps_json 为 FlowAction 列表）
CREATE TABLE IF NOT EXISTS browser_request_ai_flow (
    id           TEXT    PRIMARY KEY,
    session_id   TEXT    NOT NULL,
    name         TEXT    NOT NULL,
    instruction  TEXT,
    steps_json   TEXT    NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_flow_session ON browser_request_ai_flow(session_id, updated_at DESC);
