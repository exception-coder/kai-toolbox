CREATE TABLE IF NOT EXISTS procurement_page_cache (
    notice_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, captured_at TEXT NOT NULL,
    FOREIGN KEY(notice_id) REFERENCES procurement_notice(id)
);
CREATE TABLE IF NOT EXISTS procurement_parse_attempt (
    id TEXT PRIMARY KEY, notice_id TEXT NOT NULL, run_id TEXT NOT NULL,
    content_hash TEXT NOT NULL, engine TEXT NOT NULL, status TEXT NOT NULL,
    rule_snapshot TEXT NOT NULL, analysis TEXT NOT NULL, error TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_procurement_parse_notice ON procurement_parse_attempt(notice_id,created_at);
