CREATE TABLE IF NOT EXISTS wy_oauth_state (
    id TEXT PRIMARY KEY,
    return_to TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wy_wechat_session (
    id TEXT PRIMARY KEY,
    subject_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wy_session_subject ON wy_wechat_session(subject_hash);

CREATE TABLE IF NOT EXISTS wy_account_binding (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    business_party_id TEXT NOT NULL,
    business_party_name TEXT NOT NULL,
    source_system TEXT NOT NULL,
    active INTEGER DEFAULT 1 NOT NULL,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    UNIQUE(account_id, source_system)
);
