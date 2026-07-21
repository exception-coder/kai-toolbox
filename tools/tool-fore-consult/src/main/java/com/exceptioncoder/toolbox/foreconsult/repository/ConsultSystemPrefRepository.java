package com.exceptioncoder.toolbox.foreconsult.repository;

import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSystemPref;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * consult_system_pref 表的数据访问层。JdbcTemplate + 静态 RowMapper，与其他工具模块保持一致。
 */
@Repository
public class ConsultSystemPrefRepository {

    private static final RowMapper<ConsultSystemPref> ROW = (rs, i) -> ConsultSystemPref.builder()
            .systemName(rs.getString("system_name"))
            .systemSourcePath(rs.getString("system_source_path"))
            .alias(rs.getString("alias"))
            .visible(rs.getInt("visible") != 0)
            .sortOrder(rs.getInt("sort_order"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    private final JdbcTemplate jdbc;

    public ConsultSystemPrefRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ConsultSystemPref> findAll() {
        return jdbc.query("SELECT * FROM consult_system_pref ORDER BY sort_order ASC, system_name ASC", ROW);
    }

    /** 以 system_name 为键 upsert（SQLite ON CONFLICT）。 */
    public void upsert(ConsultSystemPref p) {
        jdbc.update(
                "INSERT INTO consult_system_pref (system_name, system_source_path, alias, visible, sort_order, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?) " +
                "ON CONFLICT(system_name) DO UPDATE SET " +
                "system_source_path = excluded.system_source_path, alias = excluded.alias, " +
                "visible = excluded.visible, sort_order = excluded.sort_order, updated_at = excluded.updated_at",
                p.getSystemName(), p.getSystemSourcePath(), p.getAlias(),
                p.isVisible() ? 1 : 0, p.getSortOrder(), p.getUpdatedAt());
    }

    public void delete(String systemName) {
        jdbc.update("DELETE FROM consult_system_pref WHERE system_name = ?", systemName);
    }
}
