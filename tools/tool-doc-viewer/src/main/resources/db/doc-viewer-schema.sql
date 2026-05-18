CREATE TABLE IF NOT EXISTS doc_source (
    id                 TEXT PRIMARY KEY,
    owner              TEXT NOT NULL,
    repo               TEXT NOT NULL,
    ref_name           TEXT NOT NULL,
    sub_path           TEXT NOT NULL DEFAULT '',
    ref_sha            TEXT NOT NULL,
    alias              TEXT NOT NULL,
    pat                TEXT,
    tree_etag          TEXT,
    rate_limit_until   INTEGER,
    last_refreshed_at  INTEGER NOT NULL,
    created_at         INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_doc_source_coord
    ON doc_source(owner, repo, ref_name, sub_path);

CREATE TABLE IF NOT EXISTS doc_tree_cache (
    source_id     TEXT NOT NULL,
    path          TEXT NOT NULL,
    name          TEXT NOT NULL,
    kind          TEXT NOT NULL,
    sha           TEXT NOT NULL,
    size          INTEGER,
    parent_path   TEXT NOT NULL DEFAULT '',
    depth         INTEGER NOT NULL,
    PRIMARY KEY (source_id, path)
);

CREATE INDEX IF NOT EXISTS idx_tree_parent
    ON doc_tree_cache(source_id, parent_path);

CREATE TABLE IF NOT EXISTS doc_file_cache (
    sha          TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,
    size         INTEGER NOT NULL,
    content      TEXT,
    cached_at    INTEGER NOT NULL
);

-- 本地 markdown 目录源：记录用户允许的根目录绝对路径，文件不入库，直读磁盘
CREATE TABLE IF NOT EXISTS local_doc_source (
    id                 TEXT PRIMARY KEY,
    alias              TEXT NOT NULL,
    root_path          TEXT NOT NULL,
    last_visited_at    INTEGER NOT NULL,
    created_at         INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_local_doc_source_root
    ON local_doc_source(root_path);
