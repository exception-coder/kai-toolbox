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
ALTER TABLE va_visitor ADD COLUMN company_addr TEXT;
ALTER TABLE va_visitor ADD COLUMN addr_norm TEXT;
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
ALTER TABLE va_customer ADD COLUMN addr_norm TEXT;
ALTER TABLE va_customer ADD COLUMN status TEXT;
ALTER TABLE va_customer ADD COLUMN last_deal_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_va_customer_phone_norm   ON va_customer(phone_norm);
CREATE INDEX IF NOT EXISTS idx_va_customer_company_norm ON va_customer(company_norm);
CREATE INDEX IF NOT EXISTS idx_va_customer_addr_norm    ON va_customer(addr_norm);

-- 客户资料去重参照库（V1 客户新增申请去重的检索底库）。
-- 镜像原系统"客户资料"的字段：关键字/品牌名/客户名是名称轴信号，省市区+地址+经纬度是地址轴信号。
-- name_norm / keyword_norm / addr_norm 是预算好的归一化匹配键(由 Normalizer 统一口径)。
-- cust_id 是原系统客户主键,唯一,重复导入按它幂等(INSERT OR IGNORE / 按空表播种)。
CREATE TABLE IF NOT EXISTS va_customer_ref (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cust_id       INTEGER,                     -- 原系统客户主键(custId)
    cust_name     TEXT,                        -- 客户名称
    keyword       TEXT,                        -- 客户关键字(原系统去重键)
    brand_name    TEXT,                        -- 公司(品牌)名称
    cust_type     TEXT,                        -- 客户类型:市场/品牌/电商/供应链/贸易商/外贸
    cust_category TEXT,                        -- 客户类别:女装等
    biz_major     TEXT,                        -- 经营大类:服装等
    province      TEXT,
    city          TEXT,
    district      TEXT,
    cust_addr     TEXT,                        -- 客户地址(门牌级,地址轴向量主输入)
    checkin_addr  TEXT,                        -- 打卡地址
    lng           REAL,                        -- 经度(Haversine 距离用)
    lat           REAL,                        -- 纬度
    level         TEXT,                        -- 客户等级:线索库等
    cust_property TEXT,                        -- 客户属性:普通客户等
    creator       TEXT,                        -- 创建人
    note          TEXT,                        -- 备注
    name_norm     TEXT,                        -- 归一化名称键
    keyword_norm  TEXT,                        -- 归一化关键字键
    addr_norm     TEXT,                        -- 归一化地址键(城市+区)
    tel           TEXT,                        -- 企业电话(CRM_CUSTOMER.tel)
    tel_norm      TEXT,                        -- 归一化企业电话(纯数字)
    contact_mobile TEXT,                       -- 联系人手机(CRM_CUSLINKER.mobile，代表性一个)
    contact_mobile_norm TEXT,                  -- 归一化联系人手机(纯数字)
    src_lastdate  INTEGER,                     -- 源客户最后修改时间(epoch ms)，客户同步增量水位
    created_at    INTEGER NOT NULL,
    synced_at     INTEGER                      -- 同步进向量库的时间;NULL=未同步(老库由 CustomerRefMigration 追加该列)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_va_customer_ref_cust_id ON va_customer_ref(cust_id);
CREATE INDEX IF NOT EXISTS idx_va_customer_ref_keyword_norm ON va_customer_ref(keyword_norm);
CREATE INDEX IF NOT EXISTS idx_va_customer_ref_name_norm    ON va_customer_ref(name_norm);
CREATE INDEX IF NOT EXISTS idx_va_customer_ref_addr_norm    ON va_customer_ref(addr_norm);
CREATE INDEX IF NOT EXISTS idx_va_customer_ref_mobile_norm  ON va_customer_ref(contact_mobile_norm);
CREATE INDEX IF NOT EXISTS idx_va_customer_ref_tel_norm     ON va_customer_ref(tel_norm);

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

-- 客户新增审批同步台账。定时从 Yoooni ERP 拉取未审批的「客户新增审批」记录登记于此，
-- 再异步走判别核心标记是否重复客户。flowcheckid 是 Yoooni 审批记录主键,唯一,INSERT OR IGNORE 幂等。
-- analyze_status: PENDING(待判别)/ANALYZING(占用中)/DONE(已判别)/FAILED(判别失败)。
CREATE TABLE IF NOT EXISTS va_cust_add_audit (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    flowcheckid            INTEGER NOT NULL,           -- Yoooni erp_flowcheck.id（幂等键 / 回写状态用）
    apply_no               INTEGER,                    -- 申请单号 erp_flowapply.id
    apply_title            TEXT,                       -- 申请标题
    applicant              TEXT,                       -- 申请人
    apply_dept             TEXT,                       -- 申请部门
    make_date              INTEGER,                    -- 生成日期(epoch ms，水位推进用；解析失败为 NULL)
    make_date_raw          TEXT,                       -- 生成日期原始字符串(保真)
    customerup_apply_logid INTEGER,                    -- 申请详情主键 erp_flowapply.srcid
    company_brand_name     TEXT,                       -- 公司(品牌)名称 crm_customerupapplylog.name
    customer_name          TEXT,                       -- 客户关键字/简称 crm_customerupapplylog.briefname
    checkin_address        TEXT,                       -- 打卡地址
    customer_address       TEXT,                       -- 客户地址(门牌级 doorcode)
    analyze_status         TEXT    NOT NULL DEFAULT 'PENDING',
    verdict_id             INTEGER,                    -- 关联 va_verdict.id
    visitor_id             INTEGER,                    -- 关联 va_visitor.id
    identity               TEXT,                       -- 判别身份(CUSTOMER/COMPETITOR/...)
    relationship           TEXT,                       -- 客户关系(EXISTING/CHURNED/NONE)
    confidence             REAL,                       -- 置信度
    is_duplicate           INTEGER,                    -- 是否重复客户 1/0
    dup_cust_id            INTEGER,                    -- 命中底库的 custId(best-effort，可空)
    needs_review           INTEGER NOT NULL DEFAULT 0, -- 是否需人工复核
    analyze_error          TEXT,                       -- 判别失败原因
    fetched_at             INTEGER NOT NULL,           -- 拉取登记时间
    analyzed_at            INTEGER,                    -- 判别完成时间
    created_at             INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_va_cust_add_audit_flowcheckid ON va_cust_add_audit(flowcheckid);
CREATE INDEX IF NOT EXISTS idx_va_cust_add_audit_status    ON va_cust_add_audit(analyze_status);
CREATE INDEX IF NOT EXISTS idx_va_cust_add_audit_make_date ON va_cust_add_audit(make_date);

-- ERP 反馈回写：ERP 审批确认/驳回后，把「AI 判定是否正确 + 不正确原因 + 正确结果」回灌于此。
-- 与 va_feedback（按 verdict_id 的人工纠正）并存：这里按申请单(apply_no/flowcheckid)定位、回写台账，
-- 让后续回查/报表能看到「人工已校正」，verdict 维度的明细仍落 va_feedback。裸 ALTER 幂等（SchemaInitializer 吞 duplicate column）。
ALTER TABLE va_cust_add_audit ADD COLUMN erp_feedback_correct INTEGER;      -- AI 判定是否正确：1 正确 / 0 不正确 / NULL 未反馈
ALTER TABLE va_cust_add_audit ADD COLUMN erp_feedback_reason TEXT;          -- 不正确原因（correct=0 时由 ERP 提供）
ALTER TABLE va_cust_add_audit ADD COLUMN erp_corrected_identity TEXT;       -- 人工认定的正确身份（可空）
ALTER TABLE va_cust_add_audit ADD COLUMN erp_corrected_relationship TEXT;   -- 人工认定的正确关系（可空）
ALTER TABLE va_cust_add_audit ADD COLUMN erp_feedback_operator TEXT;        -- 反馈操作人（ERP 审批人）
ALTER TABLE va_cust_add_audit ADD COLUMN erp_feedback_at INTEGER;           -- 反馈时间 epoch ms
CREATE INDEX IF NOT EXISTS idx_va_cust_add_audit_feedback ON va_cust_add_audit(erp_feedback_correct);

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
