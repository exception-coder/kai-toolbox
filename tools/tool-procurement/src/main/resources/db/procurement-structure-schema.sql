CREATE TABLE IF NOT EXISTS procurement_structure (
    id INTEGER PRIMARY KEY CHECK(id=1),
    version INTEGER NOT NULL,
    fields TEXT NOT NULL,
    update_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS procurement_structure_history (
    version INTEGER PRIMARY KEY,
    fields TEXT NOT NULL,
    create_time TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS procurement_notice_override (
    notice_id TEXT PRIMARY KEY REFERENCES procurement_notice(id),
    version INTEGER NOT NULL,
    values_json TEXT NOT NULL,
    update_time TEXT NOT NULL
);
