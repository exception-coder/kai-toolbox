CREATE TABLE IF NOT EXISTS browser_request_session (
    id              TEXT    PRIMARY KEY,
    name            TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    has_storage     INTEGER NOT NULL DEFAULT 0,
    last_active_at  INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_request_session_updated ON browser_request_session(updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_request_saved (
    id          TEXT    PRIMARY KEY,
    session_id  TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    curl        TEXT,
    method      TEXT,
    url         TEXT,
    headers     TEXT,
    body        TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_request_saved_session ON browser_request_saved(session_id, updated_at DESC);

-- 已保存请求附带的 outputs 配置（OutputSpec[] 序列化为 JSON）。SQLite 无 IF NOT EXISTS for column，
-- SchemaInitializer 已容忍重复 ADD COLUMN 错误。
ALTER TABLE browser_request_saved ADD COLUMN outputs_json TEXT;
-- 最近一次执行的响应体（用作编排时的参考样本，配 outputs 用），最大 256KB 截断
ALTER TABLE browser_request_saved ADD COLUMN last_response_body TEXT;
ALTER TABLE browser_request_saved ADD COLUMN last_response_at INTEGER;
-- 每条 output 最近一次提取的值（Map<output_name, value_string>），编排时合并所有 saved 的值供模板渲染
ALTER TABLE browser_request_saved ADD COLUMN last_extracted_values_json TEXT;

CREATE TABLE IF NOT EXISTS browser_request_var (
    session_id  TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    value       TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (session_id, name)
);

CREATE INDEX IF NOT EXISTS idx_browser_request_var_session ON browser_request_var(session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_request_pipeline (
    id          TEXT    PRIMARY KEY,
    session_id  TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    steps_json  TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_request_pipeline_session
  ON browser_request_pipeline(session_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_request_pipeline_run (
    id           TEXT    PRIMARY KEY,
    pipeline_id  TEXT    NOT NULL,
    session_id   TEXT    NOT NULL,
    started_at   INTEGER NOT NULL,
    finished_at  INTEGER,
    status       TEXT    NOT NULL,         -- running / done / cancelled / failed
    dry_run      INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT,                      -- { totalSteps, okSteps, failedSteps, abortedAtStep, ... }
    failures_json TEXT                      -- [{ stepIndex, stepName, itemIndex, error, urlSample, itemSample }, ...]
);

CREATE INDEX IF NOT EXISTS idx_browser_request_pipeline_run_pipeline
  ON browser_request_pipeline_run(pipeline_id, started_at DESC);
