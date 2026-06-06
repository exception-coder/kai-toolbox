-- 运行时动态配置中心：SQLite 覆盖层。
-- 扁平 key（如 toolbox.claude-chat.workspace.cache-ttl-seconds 或 ...roots[0]）→ 字符串值。
-- yml 提供默认，本表提供覆盖（优先级最高），重启从本表装载，与 Spring relaxed binding 对齐。
-- 注意：SchemaInitializer 按分号朴素切分，所有语句必须 IF NOT EXISTS，注释里不能出现分号。

CREATE TABLE IF NOT EXISTS dynamic_config_override (
    config_key TEXT    PRIMARY KEY,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
);
