CREATE TABLE IF NOT EXISTS procurement_seed (
    id TEXT PRIMARY KEY, create_time TEXT NOT NULL, update_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS procurement_site (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, host TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1, list_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '', create_time TEXT NOT NULL, update_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS procurement_rule (
    id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, fields TEXT NOT NULL,
    create_time TEXT NOT NULL, update_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS procurement_notice (
    id TEXT PRIMARY KEY, site_id TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL, capture_status TEXT NOT NULL DEFAULT 'PENDING',
    parse_status TEXT NOT NULL DEFAULT 'PENDING', raw_text TEXT NOT NULL DEFAULT '',
    final_url TEXT NOT NULL DEFAULT '', frame_url TEXT NOT NULL DEFAULT '',
    http_status INTEGER, captured_at TEXT, error TEXT NOT NULL DEFAULT '',
    candidates TEXT NOT NULL DEFAULT '{}', analysis TEXT NOT NULL DEFAULT '{}',
    source_data TEXT NOT NULL DEFAULT '{}', run_id TEXT,
    create_time TEXT NOT NULL, update_time TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_procurement_notice_site ON procurement_notice(site_id, capture_status);
CREATE INDEX IF NOT EXISTS idx_procurement_notice_updated ON procurement_notice(update_time);
CREATE TABLE IF NOT EXISTS procurement_run (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, total INTEGER NOT NULL DEFAULT 0,
    processed INTEGER NOT NULL DEFAULT 0, succeeded INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
    rule_snapshot TEXT NOT NULL, create_time TEXT NOT NULL, update_time TEXT NOT NULL
);
