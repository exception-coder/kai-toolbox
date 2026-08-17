CREATE TABLE IF NOT EXISTS supplier_quote_oauth_state (
    state_hash TEXT PRIMARY KEY,
    return_to TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_oauth_state_expiry ON supplier_quote_oauth_state(expires_at);

CREATE TABLE IF NOT EXISTS supplier_quote_wechat_session (
    token_hash TEXT PRIMARY KEY,
    wechat_subject_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplier_quote_session_subject ON supplier_quote_wechat_session(wechat_subject_hash);

CREATE TABLE IF NOT EXISTS supplier_quote_scm_binding (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wechat_subject_hash TEXT NOT NULL UNIQUE,
    scm_user_id TEXT NOT NULL UNIQUE,
    scm_username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS supplier_quote_draft (
    quote_ticket TEXT NOT NULL,
    scm_user_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    draft_version INTEGER NOT NULL,
    saved_at INTEGER NOT NULL,
    PRIMARY KEY (quote_ticket, scm_user_id)
);

CREATE TABLE IF NOT EXISTS supplier_quote_submission (
    quote_ticket TEXT NOT NULL,
    scm_user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    submission_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    submitted_at INTEGER NOT NULL,
    PRIMARY KEY (quote_ticket, scm_user_id)
);
