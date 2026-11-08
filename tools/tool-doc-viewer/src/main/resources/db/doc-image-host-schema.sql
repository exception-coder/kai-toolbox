CREATE TABLE IF NOT EXISTS doc_image_host (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    settings_json TEXT NOT NULL,
    credentials TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_image_host_owner ON doc_image_host(owner_id);
CREATE TABLE IF NOT EXISTS doc_image_upload (
    owner_id INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    digest TEXT NOT NULL,
    object_key TEXT NOT NULL,
    image_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(owner_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_image_upload_recent ON doc_image_upload(owner_id, created_at DESC);
