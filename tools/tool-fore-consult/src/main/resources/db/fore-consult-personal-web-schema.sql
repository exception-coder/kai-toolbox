-- Personal application credentials belong to a Forge user and system, never a shared resource.
CREATE TABLE IF NOT EXISTS fore_consult_personal_web_account (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    site_url TEXT NOT NULL,
    environment TEXT NOT NULL,
    username TEXT NOT NULL,
    password_cipher TEXT NOT NULL,
    login_page TEXT,
    login_status TEXT NOT NULL,
    checked_at INTEGER NOT NULL,
    UNIQUE(owner_id, source_path)
);
