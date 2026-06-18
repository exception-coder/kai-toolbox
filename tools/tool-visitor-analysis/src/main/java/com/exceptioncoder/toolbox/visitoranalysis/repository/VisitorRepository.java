package com.exceptioncoder.toolbox.visitoranalysis.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;

/** 访客台账仓储：落库原始记录 + 自比对（同手机/同公司历史出现次数）。 */
@Repository
public class VisitorRepository {

    private final JdbcTemplate jdbc;

    public VisitorRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long insert(String name, String phone, String phoneNorm, String company,
                       String companyNorm, String companyAddr, String email,
                       String purpose, String source) {
        KeyHolder kh = new GeneratedKeyHolder();
        long now = System.currentTimeMillis();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO va_visitor
                      (name, phone, phone_norm, company, company_norm, company_addr, email, purpose, source, created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, name);
            ps.setString(2, phone);
            ps.setString(3, phoneNorm);
            ps.setString(4, company);
            ps.setString(5, companyNorm);
            ps.setString(6, companyAddr);
            ps.setString(7, email);
            ps.setString(8, purpose);
            ps.setString(9, source);
            ps.setLong(10, now);
            return ps;
        }, kh);
        Number key = kh.getKey();
        return key == null ? -1L : key.longValue();
    }

    /** 历史出现次数（按归一化手机或公司任一命中）。用于"曾来访"弱信号。 */
    public int countPrior(String phoneNorm, String companyNorm) {
        Integer n = jdbc.queryForObject("""
                SELECT COUNT(*) FROM va_visitor
                WHERE (? <> '' AND phone_norm = ?)
                   OR (? <> '' AND company_norm = ?)
                """, Integer.class,
                phoneNorm, phoneNorm, companyNorm, companyNorm);
        return n == null ? 0 : n;
    }
}
