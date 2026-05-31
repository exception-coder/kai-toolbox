-- 通用工具级配置 KV 表
-- 每个 feature 一行，value_json 存任意 JSON；后端不校验内部结构，由调用方各自定义 schema
CREATE TABLE IF NOT EXISTS feature_config (
    feature_id  TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
