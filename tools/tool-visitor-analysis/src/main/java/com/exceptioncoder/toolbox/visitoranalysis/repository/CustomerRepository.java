package com.exceptioncoder.toolbox.visitoranalysis.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * 历史客户库（参照数据）查询。
 *
 * <p>匹配优先级：
 * <ol>
 *   <li>手机精确命中（最强信号）</li>
 *   <li>公司名精确命中（归一化后直接等值）</li>
 *   <li>公司别名命中（JOIN {@code va_company_alias}，识别"腾讯"="Tencent"="TX"）</li>
 *   <li>地址软匹配（城市+区相同，不作定论依据，仅作辅助信号）</li>
 * </ol>
 */
@Repository
public class CustomerRepository {

    private final JdbcTemplate jdbc;

    public CustomerRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 按手机、公司名（含别名）查客户库。命中返回首条，含 matched_alias 字段。
     * 未命中返回 null。
     */
    public Map<String, Object> findByPhoneOrCompany(String phoneNorm, String companyNorm) {
        // 主查询：手机精确 + 公司名精确 + 公司别名（三路 UNION ALL，优先级用 rank 排序）
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT c.status, c.last_deal_at, NULL AS matched_alias,
                       CASE WHEN ? <> '' AND c.phone_norm = ? THEN 0 ELSE 1 END AS rank
                  FROM va_customer c
                 WHERE (? <> '' AND c.phone_norm = ?)
                    OR (? <> '' AND c.company_norm = ?)
                UNION ALL
                SELECT c.status, c.last_deal_at, a.alias_norm AS matched_alias, 2 AS rank
                  FROM va_customer c
                  JOIN va_company_alias a ON a.canonical_norm = c.company_norm
                 WHERE ? <> '' AND a.alias_norm = ?
                ORDER BY rank ASC
                LIMIT 1
                """,
                phoneNorm, phoneNorm,
                phoneNorm, phoneNorm, companyNorm, companyNorm,
                companyNorm, companyNorm);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 地址软匹配：访客的归一化地址与客户库地址吻合，返回匹配到的客户信息。
     * 地址匹配不是定论信号，置信度低于手机/公司名——仅传入 LLM 作为补充上下文。
     */
    public Map<String, Object> findByAddr(String addrNorm) {
        if (!StringUtils.hasText(addrNorm)) return null;
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT status, last_deal_at, company, company_norm
                  FROM va_customer
                 WHERE addr_norm = ?
                 ORDER BY last_deal_at DESC NULLS LAST
                 LIMIT 1
                """, addrNorm);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
