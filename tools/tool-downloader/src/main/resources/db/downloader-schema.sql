-- 智能加速下载器 schema
-- 由 toolbox-common SchemaInitializer 启动时自动加载（classpath*:db/*-schema.sql）
-- 所有语句必须幂等：CREATE ... IF NOT EXISTS

CREATE TABLE IF NOT EXISTS tool_downloader_task (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    url                     TEXT    NOT NULL,
    save_path               TEXT    NOT NULL,
    filename                TEXT    NOT NULL,
    total_size              INTEGER NOT NULL DEFAULT -1,         -- -1 表示未知
    accept_ranges           INTEGER NOT NULL DEFAULT 0,          -- 0/1
    state                   TEXT    NOT NULL,                    -- QUEUED/PROBING/DOWNLOADING/PAUSED/COMPLETED/FAILED
    route_type              TEXT,                                -- DIRECT/PROXY/NULL
    route_proxy             TEXT,                                -- http://host:port
    probe_direct_ttfb_ms    INTEGER,
    probe_direct_bps        INTEGER,
    probe_proxy_ttfb_ms     INTEGER,
    probe_proxy_bps         INTEGER,
    last_error              TEXT,
    http_engine             TEXT    NOT NULL DEFAULT 'JDK',      -- JDK / OKHTTP
    created_at              TEXT    NOT NULL,                    -- ISO-8601 UTC
    updated_at              TEXT    NOT NULL
);

-- v1.1 升级：给已存在的表加 http_engine 列（SQLite ALTER TABLE ADD COLUMN 没有 IF NOT EXISTS，
-- 但 SchemaInitializer 会捕获 duplicate column 异常并降级为 debug 日志，所以幂等）
ALTER TABLE tool_downloader_task ADD COLUMN http_engine TEXT NOT NULL DEFAULT 'JDK';

CREATE TABLE IF NOT EXISTS tool_downloader_segment (
    task_id                 INTEGER NOT NULL,
    seq_no                  INTEGER NOT NULL,
    offset_bytes            INTEGER NOT NULL,
    length_bytes            INTEGER NOT NULL,
    bytes_downloaded        INTEGER NOT NULL DEFAULT 0,
    state                   TEXT    NOT NULL,                    -- PENDING/DOWNLOADING/DONE/FAILED
    attempts                INTEGER NOT NULL DEFAULT 0,
    last_error              TEXT,
    PRIMARY KEY (task_id, seq_no),
    FOREIGN KEY (task_id) REFERENCES tool_downloader_task(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_downloader_segment_task ON tool_downloader_segment(task_id);
CREATE INDEX IF NOT EXISTS idx_downloader_task_state ON tool_downloader_task(state);
