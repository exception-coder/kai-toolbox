-- 功能：业务咨询账号切换；变更：记录已验证策略版本和管理员审计；目的：逐轮固定账号并保留切换证据，不存储凭据
CREATE TABLE IF NOT EXISTS consult_account_policy_audit (
    version INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id TEXT NOT NULL,
    previous_home TEXT,
    target_home TEXT NOT NULL,
    model TEXT NOT NULL,
    result_code TEXT NOT NULL,
    checked_at INTEGER NOT NULL
);
