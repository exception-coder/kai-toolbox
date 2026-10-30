-- 功能：外部业务咨询；变更：保存用户请求与咨询关联及完整调度输入；目的：断线和重试复用原咨询及原请求
CREATE TABLE IF NOT EXISTS consult_client_request (
    user_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    consultation_id TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    prepared_prompt TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_consult_client_request_session ON consult_client_request(consultation_id);
