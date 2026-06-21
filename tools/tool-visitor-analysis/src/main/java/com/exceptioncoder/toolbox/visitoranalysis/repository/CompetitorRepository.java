package com.exceptioncoder.toolbox.visitoranalysis.repository;

import com.exceptioncoder.toolbox.visitoranalysis.api.dto.CompetitorDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/** 竞品名单仓储：按归一化名匹配 + 列表 / 新增 / 删除。 */
@Repository
public class CompetitorRepository {

    private static final RowMapper<CompetitorDto> MAPPER = (rs, n) -> new CompetitorDto(
            rs.getLong("id"),
            rs.getString("raw_name"),
            rs.getString("name_norm"),
            rs.getString("source"),
            rs.getString("note"),
            rs.getLong("created_at"));

    private final JdbcTemplate jdbc;

    public CompetitorRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 命中返回原始竞品名（含别名匹配），未命中返回 null。
     * 同时查主名（va_competitor.name_norm = companyNorm）
     * 和别名（va_company_alias.alias_norm = companyNorm → canonical → va_competitor）。
     */
    public String matchName(String companyNorm) {
        if (companyNorm == null || companyNorm.isEmpty()) return null;
        List<String> hits = jdbc.queryForList("""
                SELECT c.raw_name
                  FROM va_competitor c
                 WHERE c.name_norm = ?
                UNION ALL
                SELECT c.raw_name
                  FROM va_competitor c
                  JOIN va_company_alias a ON a.canonical_norm = c.name_norm
                 WHERE a.alias_norm = ?
                 LIMIT 1
                """, String.class, companyNorm, companyNorm);
        return hits.isEmpty() ? null : hits.get(0);
    }

    public List<CompetitorDto> list() {
        return jdbc.query("SELECT * FROM va_competitor ORDER BY created_at DESC", MAPPER);
    }

    /** 幂等新增：同 name_norm 冲突则忽略。 */
    public void add(String rawName, String nameNorm, String source, String note) {
        jdbc.update("""
                INSERT INTO va_competitor (name_norm, raw_name, source, note, created_at)
                VALUES (?,?,?,?,?)
                ON CONFLICT(name_norm) DO NOTHING
                """, nameNorm, rawName, source, note, System.currentTimeMillis());
    }

    public void delete(long id) {
        jdbc.update("DELETE FROM va_competitor WHERE id = ?", id);
    }
}
