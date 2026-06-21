-- 访客分析模块表。SchemaInitializer 每次启动按 split(";") 执行,
-- 所有语句必须 IF NOT EXISTS,保证幂等。

-- 访客原始记录（前台登记 / 历史台账）。新熟客的"自比对"信号来自这张表。
CREATE TABLE IF NOT EXISTS va_visitor (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT,
    phone         TEXT,
    phone_norm    TEXT,
    company       TEXT,
    company_norm  TEXT,
    company_addr  TEXT,
    addr_norm     TEXT,                        -- 归一化地址（城市+区），用于地址软匹配
    email         TEXT,
    purpose       TEXT,
    source        TEXT,
    created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_va_visitor_phone_norm   ON va_visitor(phone_norm);
CREATE INDEX IF NOT EXISTS idx_va_visitor_company_norm ON va_visitor(company_norm);
CREATE INDEX IF NOT EXISTS idx_va_visitor_addr_norm    ON va_visitor(addr_norm);

-- 历史客户信息库（业务侧导入的参照数据）。新客/熟客/流失客户的"真判据"来源。
-- last_deal_at / status 有则能区分熟客 vs 流失客户;无则只能给"老客户"。
CREATE TABLE IF NOT EXISTS va_customer (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT,
    phone         TEXT,
    phone_norm    TEXT,
    company       TEXT,
    company_norm  TEXT,
    addr_norm     TEXT,                        -- 归一化地址，用于地址辅助匹配
    status        TEXT,
    last_deal_at  INTEGER,
    created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_va_customer_phone_norm   ON va_customer(phone_norm);
CREATE INDEX IF NOT EXISTS idx_va_customer_company_norm ON va_customer(company_norm);
CREATE INDEX IF NOT EXISTS idx_va_customer_addr_norm    ON va_customer(addr_norm);

-- 公司别名表：同一家公司可能有多个写法（"腾讯"/"Tencent"/"腾讯科技"/"TX"）。
-- canonical_norm 是在 va_customer / va_competitor 中登记的归一化主名。
-- alias_norm 是其他写法归一化后的值。匹配时主名 + 所有别名同时查。
CREATE TABLE IF NOT EXISTS va_company_alias (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_norm TEXT    NOT NULL,
    alias_norm     TEXT    NOT NULL,
    source         TEXT,                       -- manual / feedback / import
    created_at     INTEGER NOT NULL,
    UNIQUE(canonical_norm, alias_norm)
);
CREATE INDEX IF NOT EXISTS idx_va_alias_alias_norm ON va_company_alias(alias_norm);
CREATE INDEX IF NOT EXISTS idx_va_alias_canonical  ON va_company_alias(canonical_norm);

-- 竞品名单（可选路径）。命中即确定性判定为竞争对手。name_norm 唯一,人工反馈可回流扩充。
CREATE TABLE IF NOT EXISTS va_competitor (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name_norm   TEXT NOT NULL,
    raw_name    TEXT,
    source      TEXT,
    note        TEXT,
    created_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_va_competitor_name_norm ON va_competitor(name_norm);

-- 企业工商数据缓存。同名公司查一次长期复用,降低外部 API 调用成本/延迟。
CREATE TABLE IF NOT EXISTS va_company_cache (
    company_norm  TEXT PRIMARY KEY,
    uscc          TEXT,
    industry      TEXT,
    biz_scope     TEXT,
    raw_json      TEXT,
    fetched_at    INTEGER NOT NULL
);

-- 判别结果（系统真相）。identity/relationship 为枚举字符串,evidence_json 记命中的依据。
-- needs_review=1 表示置信度低于阈值,进人工复核队列。
CREATE TABLE IF NOT EXISTS va_verdict (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id    INTEGER,
    identity      TEXT NOT NULL,
    relationship  TEXT,
    confidence    REAL NOT NULL,
    decided_by    TEXT NOT NULL,
    rationale     TEXT,
    evidence_json TEXT,
    model         TEXT,
    needs_review  INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_va_verdict_visitor ON va_verdict(visitor_id);
CREATE INDEX IF NOT EXISTS idx_va_verdict_review  ON va_verdict(needs_review);

-- 人工纠正反馈。回流后可用于扩充竞品名单 / 沉淀新的确定性规则。
CREATE TABLE IF NOT EXISTS va_feedback (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    verdict_id            INTEGER NOT NULL,
    corrected_identity    TEXT,
    corrected_relationship TEXT,
    operator              TEXT,
    note                  TEXT,
    created_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_va_feedback_verdict ON va_feedback(verdict_id);
