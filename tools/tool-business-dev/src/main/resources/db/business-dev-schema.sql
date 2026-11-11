-- 业务系统开发模块表（自 tool-claude-chat 迁出，表名与结构不变，已有数据原样沿用）。
-- ===== SRM 需求开发：开发任务 + 变更登记（纯台账，只登记不执行）=====
-- 一个开发任务下累积「SQL 变更」与「配置变更」两类登记，供发布时人工照单执行/交接。
-- 后端只做结构化存储与展示，绝不连库执行任何 DDL/DML。
CREATE TABLE IF NOT EXISTS srm_dev_task (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    module_name TEXT,
    requirement TEXT,
    owner       TEXT,
    -- open / developing / done / archived
    status      TEXT NOT NULL DEFAULT 'open',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_srm_dev_task_updated
    ON srm_dev_task(updated_at DESC);

-- SQL 变更登记：DDL/DML 脚本 + 目标库 + 说明。executed 为人工勾选「已在某环境执行」的标记，非后端真执行。
CREATE TABLE IF NOT EXISTS srm_dev_sql_change (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    title       TEXT,
    db_name     TEXT,
    -- DDL / DML
    change_type TEXT,
    sql_text    TEXT NOT NULL,
    author      TEXT,
    -- 人工标记：是否已在环境执行（0/1）
    executed    INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_srm_dev_sql_change_task
    ON srm_dev_sql_change(task_id, sort_order);

-- 配置变更登记：配置项 + 作用域 + 旧值/新值 + 备注。applied 为人工勾选「已应用」标记。
CREATE TABLE IF NOT EXISTS srm_dev_config_change (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL,
    config_key  TEXT NOT NULL,
    scope       TEXT,
    old_value   TEXT,
    new_value   TEXT,
    remark      TEXT,
    -- 人工标记：是否已应用（0/1）
    applied     INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_srm_dev_config_change_task
    ON srm_dev_config_change(task_id, sort_order);
