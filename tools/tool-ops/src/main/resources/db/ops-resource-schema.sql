-- 功能：AI交付系统资源关系；变更：幂等创建资源引用表；目的：关联系统与已有资源且不复制凭据
CREATE TABLE IF NOT EXISTS ops_resource_binding (
    id TEXT PRIMARY KEY,
    system_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    UNIQUE(system_id, provider_id, resource_id)
);
