-- 功能：业务咨询后端认证；变更：保存应用企业授权与凭据摘要；目的：隔离服务身份并支持轮换撤销
CREATE TABLE IF NOT EXISTS consult_service_client (
    client_id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    secret_hash TEXT NOT NULL,
    project_ids TEXT NOT NULL,
    version INTEGER NOT NULL,
    enabled INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    changed_by TEXT NOT NULL,
    changed_at INTEGER NOT NULL
);
-- 功能：业务咨询后端认证；变更：保存限时票据摘要和凭据版本；目的：避免明文落库并使旧版本票据失效
CREATE TABLE IF NOT EXISTS consult_service_token (
    token_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    client_version INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (client_id) REFERENCES consult_service_client(client_id)
);
CREATE INDEX IF NOT EXISTS idx_consult_service_token_expiry ON consult_service_token(expires_at);
-- 功能：业务咨询问题分析；变更：保存应用内幂等任务与执行结果；目的：断线可查询且取消后迟到结果不能覆盖
CREATE TABLE IF NOT EXISTS consult_analysis_task (
    task_id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    input_json TEXT NOT NULL,
    status TEXT NOT NULL,
    result_json TEXT,
    error_code TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    policy_version INTEGER,
    UNIQUE (client_id, request_id),
    FOREIGN KEY (client_id) REFERENCES consult_service_client(client_id)
);
CREATE INDEX IF NOT EXISTS idx_consult_analysis_queue ON consult_analysis_task(status, created_at);
-- 功能：IT客服原图分析；变更：原子保存应用归属、上传摘要与图片字节；目的：隔离原图并支持幂等恢复及定期清理
CREATE TABLE IF NOT EXISTS consult_analysis_attachment (
    attachment_id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    upload_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    media_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    image_bytes BLOB,
    UNIQUE (client_id, upload_id),
    FOREIGN KEY (client_id) REFERENCES consult_service_client(client_id)
);
CREATE INDEX IF NOT EXISTS idx_consult_analysis_attachment_expiry ON consult_analysis_attachment(expires_at);
