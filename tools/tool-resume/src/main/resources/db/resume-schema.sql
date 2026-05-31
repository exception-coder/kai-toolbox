-- 简历模块的 KV 存储：单用户单机使用，整个 state / jobTarget 各存一行 JSON
-- key_name = 'state'      → 简历整体状态（basics/work/projects/education/skills/template/accent）
-- key_name = 'jobTarget'  → 目标岗位 JD 配置（targetRole + jobDescription）
-- 朴素 KV 表是 SQLite 上"个人配置型"数据的最佳实践，避免过早字段拆分

CREATE TABLE IF NOT EXISTS resume_kv (
    key_name   TEXT    PRIMARY KEY,
    value_json TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
);
