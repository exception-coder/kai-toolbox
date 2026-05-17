CREATE TABLE IF NOT EXISTS browser_request_session (
    id              TEXT    PRIMARY KEY,
    name            TEXT    NOT NULL,
    url             TEXT    NOT NULL,
    has_storage     INTEGER NOT NULL DEFAULT 0,
    last_active_at  INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_request_session_updated ON browser_request_session(updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_request_saved (
    id          TEXT    PRIMARY KEY,
    session_id  TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    curl        TEXT,
    method      TEXT,
    url         TEXT,
    headers     TEXT,
    body        TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_browser_request_saved_session ON browser_request_saved(session_id, updated_at DESC);
