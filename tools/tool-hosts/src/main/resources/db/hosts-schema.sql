-- 全局 SSH 主机表（被 treesize / frp 等多个工具共用）
CREATE TABLE IF NOT EXISTS host (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    host           TEXT NOT NULL,
    port           INTEGER NOT NULL DEFAULT 22,
    username       TEXT NOT NULL,
    auth_type      TEXT NOT NULL,
    password       TEXT,
    private_key    TEXT,
    passphrase     TEXT,
    tag            TEXT,
    note           TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_host_name ON host(name);
