-- tool-ops：系统中间件台
-- 三层：系统(ops_system) -> 中间件实例(ops_datasource，带 env 维度) -> 查询历史(ops_query_history)
-- 凭据明文存储（本地单用户工具，与 host / treesize_ssh_host 一致）。

CREATE TABLE IF NOT EXISTS ops_system (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,          -- 系统展示名，如 "订单中心"
    code        TEXT,                   -- 系统英文标识/简称，如 "order-center"
    owner       TEXT,                   -- 负责人
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_datasource (
    id          TEXT PRIMARY KEY,
    system_id   TEXT NOT NULL,
    env         TEXT NOT NULL,          -- DEV | TEST | UAT | PROD | 自定义
    type        TEXT NOT NULL,          -- MYSQL | ORACLE | REDIS | RABBITMQ | KAFKA
    name        TEXT NOT NULL,          -- 实例展示名，如 "订单库-主库"
    host        TEXT NOT NULL,
    port        INTEGER NOT NULL,
    username    TEXT,
    password    TEXT,                   -- 明文，本地单用户
    -- MySQL 库名 / Oracle service_name / Redis db 索引(数字) / MQ vhost
    db_name     TEXT,
    -- 额外连接参数：JDBC 追加到 URL 的 query 串(如 useSSL=false&serverTimezone=UTC)
    params      TEXT,
    note        TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_ds_system ON ops_datasource(system_id, env);
CREATE INDEX IF NOT EXISTS idx_ops_ds_type   ON ops_datasource(type);

CREATE TABLE IF NOT EXISTS ops_query_history (
    id            TEXT PRIMARY KEY,
    datasource_id TEXT NOT NULL,
    kind          TEXT NOT NULL,        -- SQL | REDIS | MQ
    content       TEXT NOT NULL,        -- 执行的 SQL / Redis 命令
    status        TEXT NOT NULL,        -- OK | ERROR
    row_count     INTEGER,
    elapsed_ms    INTEGER,
    error_msg     TEXT,
    executed_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_hist_ds ON ops_query_history(datasource_id, executed_at DESC);
