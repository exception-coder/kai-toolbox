package com.exceptioncoder.toolbox.visitoranalysis.repository;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CustomerRefView;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 客户资料去重参照库（{@code va_customer_ref}）的读写。
 * 列表给前端展示，插入供播种/导入用；归一化键由调用方(Normalizer 统一口径)算好传入。
 */
@Repository
public class CustomerRefRepository {

    private final JdbcTemplate jdbc;

    public CustomerRefRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 可空整数列安全读取：SQLite 小整数走 Integer，统一过 Number 转 Long，避免强转异常。 */
    private static Long longOrNull(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        Object v = rs.getObject(col);
        return v == null ? null : ((Number) v).longValue();
    }

    /** 可空浮点列安全读取：SQLite 数值类型不固定，统一过 Number 转 Double。 */
    private static Double doubleOrNull(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        Object v = rs.getObject(col);
        return v == null ? null : ((Number) v).doubleValue();
    }

    private static final RowMapper<CustomerRefView> MAPPER = (rs, n) -> new CustomerRefView(
            rs.getLong("id"),
            longOrNull(rs, "cust_id"),
            rs.getString("cust_name"),
            rs.getString("keyword"),
            rs.getString("brand_name"),
            rs.getString("cust_type"),
            rs.getString("cust_category"),
            rs.getString("biz_major"),
            rs.getString("province"),
            rs.getString("city"),
            rs.getString("district"),
            rs.getString("cust_addr"),
            rs.getString("checkin_addr"),
            doubleOrNull(rs, "lng"),
            doubleOrNull(rs, "lat"),
            rs.getString("level"),
            rs.getString("cust_property"),
            rs.getString("creator"),
            rs.getString("note"),
            rs.getLong("created_at"),
            longOrNull(rs, "synced_at"));

    public List<CustomerRefView> list() {
        return jdbc.query("""
                SELECT id, cust_id, cust_name, keyword, brand_name, cust_type, cust_category, biz_major,
                       province, city, district, cust_addr, checkin_addr, lng, lat, level, cust_property,
                       creator, note, created_at, synced_at
                  FROM va_customer_ref
                 ORDER BY id ASC
                """, MAPPER);
    }

    /** 标记某客户已同步进向量库（记同步时间）。 */
    public void markSynced(Long custId, long syncedAt) {
        if (custId == null) return;
        jdbc.update("UPDATE va_customer_ref SET synced_at = ? WHERE cust_id = ?", syncedAt, custId);
    }

    /** 清空全部同步标记（向量库被清空后调用）。 */
    public int clearSyncedAll() {
        return jdbc.update("UPDATE va_customer_ref SET synced_at = NULL");
    }

    public int count() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM va_customer_ref", Integer.class);
        return n == null ? 0 : n;
    }

    /** 一键清空客户底库（同步 + 导入），返回删除条数。清完判定会失去去重底库，直至重新同步。 */
    public int clearAll() {
        int before = count();
        jdbc.update("DELETE FROM va_customer_ref");
        return before;
    }

    /**
     * 公司名归一化精确命中底库（确定性去重：公司名完全一致 → 重复客户）。命中返回 {cust_id, cust_name}，否则 null。
     */
    public java.util.Map<String, Object> findExactByName(String nameNorm) {
        if (nameNorm == null || nameNorm.isBlank()) return null;
        var rows = jdbc.queryForList(
                "SELECT cust_id, cust_name FROM va_customer_ref WHERE name_norm = ? LIMIT 1", nameNorm);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 导入 upsert：cust_id 已存在则用最新字段+归一化键覆盖，保证重导可刷新归一化结果。 */
    public void upsert(CustomerRefView c, String nameNorm, String keywordNorm, String addrNorm, long now) {
        jdbc.update("""
                INSERT INTO va_customer_ref
                    (cust_id, cust_name, keyword, brand_name, cust_type, cust_category, biz_major,
                     province, city, district, cust_addr, checkin_addr, lng, lat, level, cust_property,
                     creator, note, name_norm, keyword_norm, addr_norm, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(cust_id) DO UPDATE SET
                    cust_name=excluded.cust_name, keyword=excluded.keyword, brand_name=excluded.brand_name,
                    cust_type=excluded.cust_type, cust_category=excluded.cust_category, biz_major=excluded.biz_major,
                    province=excluded.province, city=excluded.city, district=excluded.district,
                    cust_addr=excluded.cust_addr, checkin_addr=excluded.checkin_addr, lng=excluded.lng, lat=excluded.lat,
                    level=excluded.level, cust_property=excluded.cust_property, creator=excluded.creator, note=excluded.note,
                    name_norm=excluded.name_norm, keyword_norm=excluded.keyword_norm, addr_norm=excluded.addr_norm,
                    synced_at=NULL
                """,
                c.custId(), c.custName(), c.keyword(), c.brandName(), c.custType(), c.custCategory(), c.bizMajor(),
                c.province(), c.city(), c.district(), c.custAddr(), c.checkinAddr(), c.lng(), c.lat(), c.level(),
                c.custProperty(), c.creator(), c.note(), nameNorm, keywordNorm, addrNorm, now);
    }

    /** 插入一条参照客户。cust_id 唯一,已存在则跳过(INSERT OR IGNORE),保证导入幂等。 */
    public void insert(CustomerRefView c, String nameNorm, String keywordNorm, String addrNorm, long now) {
        jdbc.update("""
                INSERT OR IGNORE INTO va_customer_ref
                    (cust_id, cust_name, keyword, brand_name, cust_type, cust_category, biz_major,
                     province, city, district, cust_addr, checkin_addr, lng, lat, level, cust_property,
                     creator, note, name_norm, keyword_norm, addr_norm, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                c.custId(), c.custName(), c.keyword(), c.brandName(), c.custType(), c.custCategory(), c.bizMajor(),
                c.province(), c.city(), c.district(), c.custAddr(), c.checkinAddr(), c.lng(), c.lat(), c.level(),
                c.custProperty(), c.creator(), c.note(), nameNorm, keywordNorm, addrNorm, now);
    }

    /** 按主键 id 取一条（CRUD 编辑回填 / 删除前校验用）。不存在返回 null。 */
    public CustomerRefView findById(long id) {
        var rows = jdbc.query("""
                SELECT id, cust_id, cust_name, keyword, brand_name, cust_type, cust_category, biz_major,
                       province, city, district, cust_addr, checkin_addr, lng, lat, level, cust_property,
                       creator, note, created_at, synced_at
                  FROM va_customer_ref WHERE id = ?
                """, MAPPER, id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 人工新增一条参照客户，返回自增主键 id。
     * 与导入的 {@link #insert} 区别：不依赖 cust_id 幂等（手工录入通常无原系统 custId），
     * cust_id 可空，主键由 SQLite 自增。归一化键由调用方算好传入。
     */
    public long insertManual(CustomerRefView c, String nameNorm, String keywordNorm, String addrNorm, long now) {
        org.springframework.jdbc.support.GeneratedKeyHolder kh =
                new org.springframework.jdbc.support.GeneratedKeyHolder();
        jdbc.update(con -> {
            var ps = con.prepareStatement("""
                    INSERT INTO va_customer_ref
                        (cust_id, cust_name, keyword, brand_name, cust_type, cust_category, biz_major,
                         province, city, district, cust_addr, checkin_addr, lng, lat, level, cust_property,
                         creator, note, name_norm, keyword_norm, addr_norm, created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """, new String[]{"id"});
            int i = 1;
            ps.setObject(i++, c.custId());
            ps.setString(i++, c.custName());
            ps.setString(i++, c.keyword());
            ps.setString(i++, c.brandName());
            ps.setString(i++, c.custType());
            ps.setString(i++, c.custCategory());
            ps.setString(i++, c.bizMajor());
            ps.setString(i++, c.province());
            ps.setString(i++, c.city());
            ps.setString(i++, c.district());
            ps.setString(i++, c.custAddr());
            ps.setString(i++, c.checkinAddr());
            ps.setObject(i++, c.lng());
            ps.setObject(i++, c.lat());
            ps.setString(i++, c.level());
            ps.setString(i++, c.custProperty());
            ps.setString(i++, c.creator());
            ps.setString(i++, c.note());
            ps.setString(i++, nameNorm);
            ps.setString(i++, keywordNorm);
            ps.setString(i++, addrNorm);
            ps.setLong(i, now);
            return ps;
        }, kh);
        Number key = kh.getKey();
        return key == null ? 0L : key.longValue();
    }

    /**
     * 按主键 id 更新一条。归一化键同步刷新；synced_at 置 NULL（资料改动后需重新同步向量库）。
     * 返回受影响行数（0 表示 id 不存在）。
     */
    public int update(long id, CustomerRefView c, String nameNorm, String keywordNorm, String addrNorm) {
        return jdbc.update("""
                UPDATE va_customer_ref SET
                    cust_id=?, cust_name=?, keyword=?, brand_name=?, cust_type=?, cust_category=?, biz_major=?,
                    province=?, city=?, district=?, cust_addr=?, checkin_addr=?, lng=?, lat=?, level=?, cust_property=?,
                    creator=?, note=?, name_norm=?, keyword_norm=?, addr_norm=?, synced_at=NULL
                 WHERE id=?
                """,
                c.custId(), c.custName(), c.keyword(), c.brandName(), c.custType(), c.custCategory(), c.bizMajor(),
                c.province(), c.city(), c.district(), c.custAddr(), c.checkinAddr(), c.lng(), c.lat(), c.level(),
                c.custProperty(), c.creator(), c.note(), nameNorm, keywordNorm, addrNorm, id);
    }

    /** 按主键 id 删除一条。返回受影响行数。 */
    public int delete(long id) {
        return jdbc.update("DELETE FROM va_customer_ref WHERE id = ?", id);
    }

    // ── 客户底库同步（从 Yoooni cust 模块）─────────────────────────────

    /**
     * 客户同步 upsert：按 cust_id 幂等。只覆盖同步带来的字段（含 tel/contact_mobile 及其归一化、src_lastdate），
     * 不动 CSV 导入维护的 brand_name/cust_type 等其它列。归一化键由调用方(Normalizer)算好传入。
     */
    public void upsertFromSync(Long custId, String custName, String keyword, String custAddr, String checkinAddr,
                               String tel, String contactMobile, Double lng, Double lat,
                               String nameNorm, String keywordNorm, String addrNorm,
                               String telNorm, String mobileNorm, Long srcLastdate, long now) {
        jdbc.update("""
                INSERT INTO va_customer_ref
                    (cust_id, cust_name, keyword, cust_addr, checkin_addr, lng, lat,
                     tel, contact_mobile, name_norm, keyword_norm, addr_norm, tel_norm, contact_mobile_norm,
                     src_lastdate, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(cust_id) DO UPDATE SET
                    cust_name=excluded.cust_name, keyword=excluded.keyword, cust_addr=excluded.cust_addr,
                    checkin_addr=excluded.checkin_addr, lng=excluded.lng, lat=excluded.lat,
                    tel=excluded.tel, contact_mobile=excluded.contact_mobile,
                    name_norm=excluded.name_norm, keyword_norm=excluded.keyword_norm, addr_norm=excluded.addr_norm,
                    tel_norm=excluded.tel_norm, contact_mobile_norm=excluded.contact_mobile_norm,
                    src_lastdate=excluded.src_lastdate
                """,
                custId, custName, keyword, custAddr, checkinAddr, lng, lat,
                tel, contactMobile, nameNorm, keywordNorm, addrNorm, telNorm, mobileNorm, srcLastdate, now);
    }

    /** 客户同步增量水位：最大 src_lastdate（epoch ms）。无则 null。 */
    public Long maxSrcLastdate() {
        return jdbc.queryForObject("SELECT MAX(src_lastdate) FROM va_customer_ref", Long.class);
    }

    /**
     * 本地精准去重（确定性）。优先级：联系手机/企业电话 &gt; 客户名(公司名) &gt; 关键字，命中即重复客户。
     * 命中返回 {cust_id, cust_name, hit}（hit ∈ phone/name/keyword），否则 null（交向量层）。
     */
    public java.util.Map<String, Object> findDuplicatePrecise(String nameNorm, String mobileNorm) {
        if (mobileNorm != null && !mobileNorm.isBlank()) {
            var rows = jdbc.queryForList(
                    "SELECT cust_id, cust_name, 'phone' AS hit FROM va_customer_ref "
                            + "WHERE contact_mobile_norm = ? OR tel_norm = ? LIMIT 1", mobileNorm, mobileNorm);
            if (!rows.isEmpty()) return rows.get(0);
        }
        if (nameNorm != null && !nameNorm.isBlank()) {
            var byName = jdbc.queryForList(
                    "SELECT cust_id, cust_name, 'name' AS hit FROM va_customer_ref WHERE name_norm = ? LIMIT 1", nameNorm);
            if (!byName.isEmpty()) return byName.get(0);
            var byKeyword = jdbc.queryForList(
                    "SELECT cust_id, cust_name, 'keyword' AS hit FROM va_customer_ref WHERE keyword_norm = ? LIMIT 1", nameNorm);
            if (!byKeyword.isEmpty()) return byKeyword.get(0);
        }
        return null;
    }
}
