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
    depth        INTEGER NOT NULL,
    -- ext: lowercase file extension without the leading dot, NULL for directories
    -- (TreeSizeMigration adds this column on pre-existing databases)
    ext          TEXT
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
    -- User-supplied whisper --prompt seed (proper nouns / domain vocabulary). Stored so a
    -- regenerate request can prefill the input with what produced the prior VTT.
    initial_prompt       TEXT,
    error_msg            TEXT,
    created_at           INTEGER NOT NULL,
    started_at           INTEGER,
    finished_at          INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subtitle_video_hash ON subtitle_job(video_path_hash);
CREATE INDEX IF NOT EXISTS idx_subtitle_scan_path ON subtitle_job(scan_id, video_path);
CREATE INDEX IF NOT EXISTS idx_subtitle_status ON subtitle_job(status);

CREATE TABLE IF NOT EXISTS treesize_video_favorite (
    path        TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL
);

-- Last-access timestamp per video path, upserted on every HLS playlist / raw stream request.
-- Drives the "最近访问" panel via ORDER BY last_access_at DESC LIMIT N.
CREATE TABLE IF NOT EXISTS treesize_video_recent (
    path            TEXT PRIMARY KEY,
    last_access_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_recent_at ON treesize_video_recent(last_access_at DESC);

-- 视频独立表：把"视频"从 treesize_node 的 ext 过滤子集提升为一等公民。
-- 列分 7 大类：basic（同步填）/ media（duration_* 由"视频时长区间分类"填，其它下期）/
-- language（视频语言识别模块）/ thumbnail_grid（九宫格预览图模块）/ person_age（人物年龄识别模块）/
-- series（名称归类模块）/ visual_cluster（嵌入与相似聚类模块）。
-- path 跨 scan 持久化，重扫不丢衍生数据。
CREATE TABLE IF NOT EXISTS treesize_video (
    -- 标识
    path                          TEXT PRIMARY KEY,
    -- basic
    name                          TEXT NOT NULL,
    parent_path                   TEXT,
    ext                           TEXT,
    size                          INTEGER NOT NULL,
    source_scan_id                TEXT,
    first_synced_at               INTEGER NOT NULL,
    last_synced_at                INTEGER NOT NULL,
    -- media
    duration_s                    REAL,
    duration_bucket               TEXT,
    width                         INTEGER,
    height                        INTEGER,
    video_codec                   TEXT,
    audio_codec                   TEXT,
    audio_lang_tag                TEXT,
    -- language
    language                      TEXT,
    language_confidence           REAL,
    language_detected_at          INTEGER,
    -- thumbnail_grid
    thumbnail_grid_path           TEXT,
    thumbnail_grid_generated_at   INTEGER,
    -- person_age
    person_main_age_group         TEXT,
    person_main_age               INTEGER,
    person_main_gender            TEXT,
    person_age_confidence         REAL,
    person_age_detected_at        INTEGER,
    person_age_reason             TEXT,
    -- series
    series_signature              TEXT,
    series_episode                INTEGER,
    -- visual_cluster
    visual_cluster_id             INTEGER,
    visual_cluster_label          TEXT,
    visual_clustered_at           INTEGER
);

CREATE INDEX IF NOT EXISTS idx_video_size            ON treesize_video(size);
CREATE INDEX IF NOT EXISTS idx_video_name            ON treesize_video(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_video_ext             ON treesize_video(ext);
CREATE INDEX IF NOT EXISTS idx_video_language        ON treesize_video(language);
CREATE INDEX IF NOT EXISTS idx_video_duration_bucket ON treesize_video(duration_bucket);
CREATE INDEX IF NOT EXISTS idx_video_series_sig      ON treesize_video(series_signature);
CREATE INDEX IF NOT EXISTS idx_video_cluster         ON treesize_video(visual_cluster_id);
-- partial index：让各子任务"还没识别/还没生成"的扫描永远不需要全表
CREATE INDEX IF NOT EXISTS idx_video_language_null    ON treesize_video(size DESC) WHERE language IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_grid_null        ON treesize_video(size DESC) WHERE thumbnail_grid_path IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_duration_null    ON treesize_video(size DESC) WHERE duration_s IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_series_null      ON treesize_video(size DESC) WHERE series_signature IS NULL;
CREATE INDEX IF NOT EXISTS idx_video_person_age_null  ON treesize_video(size DESC) WHERE thumbnail_grid_path IS NOT NULL AND person_main_age_group IS NULL;

-- 视频处理任务跟踪表：语言识别 / 九宫格 / 时长分类 / 名称归类 / 人物年龄 / 视觉嵌入 / 聚类
-- 所有任务统一通过 VideoProcessingJobService + ProcessingJobRepository 调度。
-- 同一种 type 同一时间只允许一个 RUNNING（应用层保证）。
CREATE TABLE IF NOT EXISTS video_processing_job (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,
    status          TEXT NOT NULL,
    total           INTEGER NOT NULL DEFAULT 0,
    processed       INTEGER NOT NULL DEFAULT 0,
    succeeded       INTEGER NOT NULL DEFAULT 0,
    failed          INTEGER NOT NULL DEFAULT 0,
    current_path    TEXT,
    error_msg       TEXT,
    started_at      INTEGER NOT NULL,
    finished_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_job_type_status ON video_processing_job(type, status);
CREATE INDEX IF NOT EXISTS idx_job_started     ON video_processing_job(started_at DESC);

-- 视频视觉嵌入表：由"视频嵌入与相似聚类"模块写入。
-- vector 列以 little-endian float32 字节序列化（dim * 4 bytes）。
-- 与 treesize_video 通过 path 关联（不外键），方便单独清空重新嵌入而不动主表。
CREATE TABLE IF NOT EXISTS video_embedding (
    path           TEXT PRIMARY KEY,
    model          TEXT NOT NULL,
    dim            INTEGER NOT NULL,
    vector         BLOB NOT NULL,
    generated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_embedding_model ON video_embedding(model);
