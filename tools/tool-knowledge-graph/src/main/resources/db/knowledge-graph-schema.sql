-- 项目工作台跨项目状态检测历史（Graphify / 业务图谱）：登记到本地数据库，跨重启保留。
-- 所有语句必须 IF NOT EXISTS（SchemaInitializer 每次启动都会执行）。
CREATE TABLE IF NOT EXISTS kg_status_cache (
    project_path         TEXT PRIMARY KEY,
    graphify_state       TEXT,
    business_graph_state TEXT,
    business_error       TEXT,
    checked_at           TEXT NOT NULL
);
