CREATE TABLE IF NOT EXISTS mail_inbox (
    id          TEXT    PRIMARY KEY,
    message_id  TEXT,
    from_addr   TEXT    NOT NULL,
    to_addr     TEXT    NOT NULL,
    subject     TEXT,
    body_text   TEXT,
    body_html   TEXT,
    attachments TEXT,
    received_at INTEGER NOT NULL,
    is_read     INTEGER NOT NULL DEFAULT 0,
    raw_size    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_mail_to_addr     ON mail_inbox(to_addr);
CREATE INDEX IF NOT EXISTS idx_mail_received_at ON mail_inbox(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_is_read     ON mail_inbox(is_read);
