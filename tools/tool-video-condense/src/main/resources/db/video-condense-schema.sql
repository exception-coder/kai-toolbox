CREATE TABLE IF NOT EXISTS video_condense_job (
    id           TEXT PRIMARY KEY,
    input_path   TEXT NOT NULL,
    status       TEXT NOT NULL,           -- JobStatus.name()
    duration_sec REAL,                    -- 探测时长（秒），未知为 NULL
    curve_json   TEXT,                    -- List<SegmentView> JSON；ANALYZED 后有值
    error        TEXT,                    -- FAILED 时简短原因
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vcj_status  ON video_condense_job(status);
CREATE INDEX IF NOT EXISTS idx_vcj_created ON video_condense_job(created_at);
