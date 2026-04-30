CREATE TABLE IF NOT EXISTS treesize_scan (
    id           TEXT PRIMARY KEY,
    root_path    TEXT NOT NULL,
    status       TEXT NOT NULL,
    started_at   INTEGER NOT NULL,
    finished_at  INTEGER,
    total_files  INTEGER NOT NULL DEFAULT 0,
    total_dirs   INTEGER NOT NULL DEFAULT 0,
    total_size   INTEGER NOT NULL DEFAULT 0,
    error_msg    TEXT
);

CREATE TABLE IF NOT EXISTS treesize_node (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id      TEXT NOT NULL,
    parent_path  TEXT,
    path         TEXT NOT NULL,
    name         TEXT NOT NULL,
    is_dir       INTEGER NOT NULL,
    size         INTEGER NOT NULL,
    file_count   INTEGER NOT NULL DEFAULT 0,
    dir_count    INTEGER NOT NULL DEFAULT 0,
    depth        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_node_scan_parent ON treesize_node(scan_id, parent_path);
CREATE INDEX IF NOT EXISTS idx_node_scan_path   ON treesize_node(scan_id, path);
CREATE INDEX IF NOT EXISTS idx_node_size        ON treesize_node(scan_id, parent_path, size);
