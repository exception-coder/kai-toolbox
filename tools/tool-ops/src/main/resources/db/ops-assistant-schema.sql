-- 功能：资源管家安全登记；变更：保存不含秘密的幂等回执；目的：重试不重复创建资源
CREATE TABLE IF NOT EXISTS ops_assistant_enrollment (
    user_id INTEGER NOT NULL,
    request_id TEXT NOT NULL,
    signature TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, request_id)
);
