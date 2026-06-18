package com.exceptioncoder.toolbox.visitoranalysis.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

/**
 * 历史客户库（参照数据）查询。手机优先于公司：手机命中是最强信号。
 * 返回首条命中的 status / last_deal_at,供区分熟客/流失客户。
 */
@Repository
public class CustomerRepository {

    private final JdbcTemplate jdbc;

    public CustomerRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 命中返回 [status, lastDealAt]，未命中返回 null。 */
    public Map<String, Object> findByPhoneOrCompany(String phoneNorm, String companyNorm) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT status, last_deal_at,
                       CASE WHEN ? <> '' AND phone_norm = ? THEN 0 ELSE 1 END AS rank
                FROM va_customer
                WHERE (? <> '' AND phone_norm = ?)
                   OR (? <> '' AND company_norm = ?)
                ORDER BY rank ASC
                LIMIT 1
                """,
                phoneNorm, phoneNorm,
                phoneNorm, phoneNorm, companyNorm, companyNorm);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
