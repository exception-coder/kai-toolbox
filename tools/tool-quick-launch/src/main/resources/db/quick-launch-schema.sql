CREATE TABLE IF NOT EXISTS quick_launch_site (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    site_url        TEXT NOT NULL,
    group_name      TEXT NOT NULL DEFAULT '未分组',
    icon            TEXT NOT NULL DEFAULT 'Globe2',
    open_mode       TEXT NOT NULL DEFAULT 'POPUP'
                    CHECK (open_mode IN ('POPUP', 'TAB', 'CURRENT')),
    window_width    INTEGER NOT NULL DEFAULT 1400,
    window_height   INTEGER NOT NULL DEFAULT 900,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    pinned          INTEGER NOT NULL DEFAULT 0,
    enabled         INTEGER NOT NULL DEFAULT 1,
    open_count      INTEGER NOT NULL DEFAULT 0,
    last_opened_at  INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quick_launch_group_sort
    ON quick_launch_site(enabled, group_name, pinned DESC, sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_quick_launch_recent
    ON quick_launch_site(enabled, last_opened_at DESC);
