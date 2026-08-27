CREATE TABLE IF NOT EXISTS scheduler_task_override (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL,
    cron TEXT,
    zone TEXT,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduler_execution (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    trigger_source TEXT NOT NULL,
    status TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    duration_ms INTEGER,
    error_summary TEXT,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduler_execution_task_start
    ON scheduler_execution(task_id, start_time DESC);
