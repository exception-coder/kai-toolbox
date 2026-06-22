-- ============================================================
-- 访客分析模块 · 测试夹具数据
-- 应用启动后执行：
--   sqlite3 "%USERPROFILE%\.kai-toolbox\toolbox.db" < test-fixtures.sql
-- 或 PowerShell：
--   sqlite3 "$env:USERPROFILE\.kai-toolbox\toolbox.db" ".read test-fixtures.sql"
-- ============================================================
-- 覆盖路径：
--   Path A: 手机精确命中客户库 → rule:customer
--   Path B: 公司名精确命中客户库 → rule:customer
--   Path C: 公司别名命中客户库 → rule:customer:alias
--   Path D: 竞品名单命中 → rule:competitor
--   Path E: 无命中 → 灰区 → Python sidecar (vector+LLM)
-- ============================================================

-- ── 客户库（va_customer）────────────────────────────────────────────
-- company_norm 由 Normalizer.company() 产生：去"有限公司/集团"等后缀
-- addr_norm 由 Normalizer.addr() 产生：提取城市+区

INSERT OR IGNORE INTO va_customer
  (company, company_norm, phone, phone_norm, addr_norm, status, last_deal_at, created_at)
VALUES
  -- Path A: 手机精确命中
  ('腾讯', '腾讯', '13811111111', '13811111111',
   '深圳南山', 'active', NULL, 1700000000000),

  -- Path B: 公司名精确命中（注：Normalizer 会把"华为技术有限公司"→"华为技术"）
  ('华为技术', '华为技术', '13822222222', '13822222222',
   '深圳龙岗', 'active', NULL, 1700000000001),

  -- Path B2: 流失客户（最近成交 2020-01-01，超过 365 天）
  ('阿里巴巴', '阿里巴巴', '13833333333', '13833333333',
   '杭州西湖', 'active', 1577836800000, 1700000000002);

-- ── 竞品名单（va_competitor）─────────────────────────────────────────
INSERT OR IGNORE INTO va_competitor (name_norm, raw_name, source, note, created_at)
VALUES
  -- Path D: 竞品直接命中
  ('字节跳动', '字节跳动科技有限公司', 'test', '短视频竞品', 1700000000003),
  ('美团', '美团点评', 'test', '本地生活竞品', 1700000000004);

-- ── 公司别名（va_company_alias）──────────────────────────────────────
-- canonical_norm 必须与 va_customer 或 va_competitor 里的字段一致
INSERT OR IGNORE INTO va_company_alias (canonical_norm, alias_norm, source, created_at)
VALUES
  -- Path C: 英文别名命中腾讯
  ('腾讯', 'Tencent',   'test', 1700000000005),
  ('腾讯', 'TX',        'test', 1700000000006),
  -- 竞品别名
  ('字节跳动', '抖音',   'test', 1700000000007),
  ('字节跳动', 'TikTok', 'test', 1700000000008);

SELECT '✅ 夹具写入完成' AS status,
       (SELECT COUNT(*) FROM va_customer)         AS customers,
       (SELECT COUNT(*) FROM va_competitor)        AS competitors,
       (SELECT COUNT(*) FROM va_company_alias)     AS aliases;
