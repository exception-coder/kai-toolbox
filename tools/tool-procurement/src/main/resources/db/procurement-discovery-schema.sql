CREATE TABLE IF NOT EXISTS procurement_discovery (
 id TEXT PRIMARY KEY, date TEXT NOT NULL, status TEXT NOT NULL,
 pages INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '',
 create_time TEXT NOT NULL, update_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS procurement_discovery_scope (
 run_id TEXT NOT NULL REFERENCES procurement_discovery(id),
 source TEXT NOT NULL, province TEXT NOT NULL, status TEXT NOT NULL,
 pages INTEGER NOT NULL, seen INTEGER NOT NULL, error TEXT NOT NULL,
 PRIMARY KEY(run_id,source,province)
);
CREATE TABLE IF NOT EXISTS procurement_discovery_link (
 run_id TEXT NOT NULL REFERENCES procurement_discovery(id), url TEXT NOT NULL,
 title TEXT NOT NULL, date TEXT NOT NULL, source TEXT NOT NULL, province TEXT NOT NULL,
 region_status TEXT NOT NULL, metadata TEXT NOT NULL, page INTEGER NOT NULL,
 PRIMARY KEY(run_id,url)
);
CREATE INDEX IF NOT EXISTS idx_procurement_discovery_region ON procurement_discovery_link(run_id,region_status);
CREATE INDEX IF NOT EXISTS idx_procurement_discovery_url ON procurement_discovery_link(url,region_status);
