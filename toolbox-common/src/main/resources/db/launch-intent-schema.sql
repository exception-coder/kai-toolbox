CREATE TABLE IF NOT EXISTS platform_launch_intent (
    id TEXT PRIMARY KEY,
    protocol_version INTEGER NOT NULL,
    intent_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    state TEXT NOT NULL,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    acknowledged_at INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_launch_intent_state_expiry
    ON platform_launch_intent(state, expires_at);
