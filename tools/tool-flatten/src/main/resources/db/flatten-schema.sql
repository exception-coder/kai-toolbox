CREATE TABLE IF NOT EXISTS flatten_scan (
    id                TEXT PRIMARY KEY,
    source_path       TEXT NOT NULL,
    target_path       TEXT NOT NULL,
    status            TEXT NOT NULL,
    started_at        INTEGER NOT NULL,
    finished_at       INTEGER,
    total_files       INTEGER NOT NULL DEFAULT 0,
    total_size        INTEGER NOT NULL DEFAULT 0,
    duplicate_groups  INTEGER NOT NULL DEFAULT 0,
    duplicate_files   INTEGER NOT NULL DEFAULT 0,
    duplicate_size    INTEGER NOT NULL DEFAULT 0,
    files_to_move     INTEGER NOT NULL DEFAULT 0,
    moved_files       INTEGER NOT NULL DEFAULT 0,
    error_msg         TEXT
);

CREATE TABLE IF NOT EXISTS flatten_file (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id           TEXT NOT NULL,
    path              TEXT NOT NULL,
    name              TEXT NOT NULL,
    size              INTEGER NOT NULL,
    hash              TEXT,
    modified_at       INTEGER NOT NULL,
    deleted           INTEGER NOT NULL DEFAULT 0,
    target_name       TEXT,
    moved             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_flatten_file_scan ON flatten_file(scan_id);
CREATE INDEX IF NOT EXISTS idx_flatten_file_hash ON flatten_file(scan_id, hash);
CREATE INDEX IF NOT EXISTS idx_flatten_file_active ON flatten_file(scan_id, deleted);
