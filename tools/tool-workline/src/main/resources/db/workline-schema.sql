-- 工作线模块：记录本人工作的核心内容与作出的成果
-- 两级结构：workline_line（工作线，一条主线）→ workline_entry（条目，挂在某条工作线下）
-- 单用户单机使用，无 user 维度；时间戳为 epoch millis
-- 所有 DDL 必须 IF NOT EXISTS：SchemaInitializer 每次启动重跑

CREATE TABLE IF NOT EXISTS workline_line (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

-- parent_id：NULL=顶层摘要条目；非空=明细子条目，指向父条目 id（仅两级）
-- 注：parent_id 为 v2 新增列。SQLite 无 ADD COLUMN IF NOT EXISTS，且本文件每次启动重跑，
--     故存量库的列补齐由 WorklineSchemaMigration（CommandLineRunner）幂等 ALTER 完成；
--     全新库由此 CREATE TABLE 直接带出该列。
CREATE TABLE IF NOT EXISTS workline_entry (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    line_id      INTEGER NOT NULL,
    parent_id    INTEGER,
    title        TEXT    NOT NULL,
    core_content TEXT,
    achievement  TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workline_entry_line ON workline_entry(line_id);
-- idx_workline_entry_parent 不在此创建：存量库执行本文件时 parent_id 列尚未补齐（列由
-- WorklineSchemaMigration 在启动后 ALTER 补上），故该索引也在迁移 Runner 内、加列之后创建。
