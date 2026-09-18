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

-- 功能：Forge 通用应用资源；变更：幂等创建应用站点与服务端登录凭据表；目的：按系统配置多个可发现的测试应用
CREATE TABLE IF NOT EXISTS ops_application_resource (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    environment TEXT NOT NULL,
    base_url TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    login_path TEXT,
    username TEXT,
    password TEXT,
    username_field TEXT,
    password_field TEXT,
    token_json_path TEXT,
    tenant_header TEXT,
    tenant_value TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
