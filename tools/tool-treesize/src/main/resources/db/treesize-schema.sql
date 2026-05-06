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

CREATE TABLE IF NOT EXISTS treesize_node_meta (
    scan_id      TEXT NOT NULL,
    path         TEXT NOT NULL,
    modified_at  INTEGER,
    PRIMARY KEY (scan_id, path)
);

CREATE INDEX IF NOT EXISTS idx_node_meta_modified ON treesize_node_meta(scan_id, modified_at);

CREATE TABLE IF NOT EXISTS treesize_scan_source (
    scan_id       TEXT PRIMARY KEY,
    source_type   TEXT NOT NULL,
    ssh_host_id   TEXT,
    display_name  TEXT
);

CREATE INDEX IF NOT EXISTS idx_treesize_scan_source_type ON treesize_scan_source(source_type);
CREATE INDEX IF NOT EXISTS idx_treesize_scan_source_host ON treesize_scan_source(ssh_host_id);

CREATE TABLE IF NOT EXISTS treesize_ssh_host (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    host           TEXT NOT NULL,
    port           INTEGER NOT NULL DEFAULT 22,
    username       TEXT NOT NULL,
    auth_type      TEXT NOT NULL,
    password       TEXT,
    private_key    TEXT,
    passphrase     TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_treesize_ssh_host_name ON treesize_ssh_host(name);

CREATE TABLE IF NOT EXISTS subtitle_job (
    id               TEXT PRIMARY KEY,
    scan_id          TEXT NOT NULL,
    video_path       TEXT NOT NULL,
    video_path_hash  TEXT NOT NULL,
    status           TEXT NOT NULL,
    model            TEXT NOT NULL,
    source_language  TEXT,
    progress         REAL NOT NULL DEFAULT 0,
    vtt_path             TEXT,
    translated_vtt_path  TEXT,
    error_msg            TEXT,
    created_at           INTEGER NOT NULL,
    started_at           INTEGER,
    finished_at          INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitle_video_hash ON subtitle_job(video_path_hash);
CREATE INDEX IF NOT EXISTS idx_subtitle_scan_path ON subtitle_job(scan_id, video_path);
CREATE INDEX IF NOT EXISTS idx_subtitle_status ON subtitle_job(status);
