package com.exceptioncoder.toolbox.ops.repository;

import com.exceptioncoder.toolbox.ops.domain.DatasourceType;
import com.exceptioncoder.toolbox.ops.domain.OpsDatasource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class DatasourceRepository {

    private final JdbcTemplate jdbc;

    public DatasourceRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<OpsDatasource> ROW = (rs, i) -> OpsDatasource.builder()
            .id(rs.getString("id"))
            .systemId(rs.getString("system_id"))
            .env(rs.getString("env"))
            .type(DatasourceType.valueOf(rs.getString("type")))
            .name(rs.getString("name"))
            .host(rs.getString("host"))
            .port(rs.getInt("port"))
            .username(rs.getString("username"))
            .password(rs.getString("password"))
            .dbName(rs.getString("db_name"))
            .params(rs.getString("params"))
            .note(rs.getString("note"))
            .sortOrder(rs.getInt("sort_order"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<OpsDatasource> findAll() {
        return jdbc.query("SELECT * FROM ops_datasource ORDER BY sort_order ASC, name ASC", ROW);
    }

    public List<OpsDatasource> findBySystem(String systemId) {
        return jdbc.query(
                "SELECT * FROM ops_datasource WHERE system_id = ? ORDER BY env ASC, sort_order ASC, name ASC",
                ROW, systemId);
    }

    public Optional<OpsDatasource> findById(String id) {
        return jdbc.query("SELECT * FROM ops_datasource WHERE id = ?", ROW, id).stream().findFirst();
    }

    public void insert(OpsDatasource d) {
        jdbc.update("""
                INSERT INTO ops_datasource
                  (id, system_id, env, type, name, host, port, username, password,
                   db_name, params, note, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                d.getId(), d.getSystemId(), d.getEnv(), d.getType().name(), d.getName(),
                d.getHost(), d.getPort(), d.getUsername(), d.getPassword(),
                d.getDbName(), d.getParams(), d.getNote(), d.getSortOrder(),
                d.getCreatedAt(), d.getUpdatedAt());
    }

    public void update(OpsDatasource d) {
        jdbc.update("""
                UPDATE ops_datasource
                   SET system_id = ?, env = ?, type = ?, name = ?, host = ?, port = ?,
                       username = ?, password = ?, db_name = ?, params = ?, note = ?,
                       sort_order = ?, updated_at = ?
                 WHERE id = ?
                """,
                d.getSystemId(), d.getEnv(), d.getType().name(), d.getName(), d.getHost(), d.getPort(),
                d.getUsername(), d.getPassword(), d.getDbName(), d.getParams(), d.getNote(),
                d.getSortOrder(), d.getUpdatedAt(), d.getId());
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM ops_datasource WHERE id = ?", id);
    }

    public void deleteBySystem(String systemId) {
        jdbc.update("DELETE FROM ops_datasource WHERE system_id = ?", systemId);
    }
}
