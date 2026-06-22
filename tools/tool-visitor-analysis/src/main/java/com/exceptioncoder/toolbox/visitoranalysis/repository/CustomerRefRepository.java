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
}
