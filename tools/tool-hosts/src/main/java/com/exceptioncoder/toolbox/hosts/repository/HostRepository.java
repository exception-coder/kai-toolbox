package com.exceptioncoder.toolbox.hosts.repository;

import com.exceptioncoder.toolbox.hosts.domain.Host;
import com.exceptioncoder.toolbox.hosts.domain.HostAuthType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class HostRepository {

    private final JdbcTemplate jdbc;

    public HostRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<Host> ROW = (rs, i) -> Host.builder()
            .id(rs.getString("id"))
            .name(rs.getString("name"))
            .host(rs.getString("host"))
            .port(rs.getInt("port"))
            .username(rs.getString("username"))
            .authType(HostAuthType.valueOf(rs.getString("auth_type")))
            .password(rs.getString("password"))
            .privateKey(rs.getString("private_key"))
            .passphrase(rs.getString("passphrase"))
            .tag(rs.getString("tag"))
            .note(rs.getString("note"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<Host> findAll() {
        return jdbc.query("SELECT * FROM host ORDER BY updated_at DESC, name ASC", ROW);
    }

    public Optional<Host> findById(String id) {
        return jdbc.query("SELECT * FROM host WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    public int countAll() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM host", Integer.class);
        return n == null ? 0 : n;
    }

    public boolean tableExists(String tableName) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
                Integer.class, tableName);
        return n != null && n > 0;
    }

    public void insert(Host h) {
        jdbc.update("""
                INSERT INTO host
                  (id, name, host, port, username, auth_type, password, private_key, passphrase, tag, note, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                h.getId(), h.getName(), h.getHost(), h.getPort(), h.getUsername(),
                h.getAuthType().name(), h.getPassword(), h.getPrivateKey(), h.getPassphrase(),
                h.getTag(), h.getNote(),
                h.getCreatedAt(), h.getUpdatedAt());
    }

    public void update(Host h) {
        jdbc.update("""
                UPDATE host
                   SET name = ?, host = ?, port = ?, username = ?, auth_type = ?,
                       password = ?, private_key = ?, passphrase = ?, tag = ?, note = ?,
                       updated_at = ?
                 WHERE id = ?
                """,
                h.getName(), h.getHost(), h.getPort(), h.getUsername(), h.getAuthType().name(),
                h.getPassword(), h.getPrivateKey(), h.getPassphrase(),
                h.getTag(), h.getNote(),
                h.getUpdatedAt(), h.getId());
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM host WHERE id = ?", id);
    }

    /**
     * 从旧表 {@code treesize_ssh_host} 迁移数据到 {@code host}。
     * 仅在 host 表为空且旧表存在时执行；用 INSERT OR IGNORE 兜底避免冲突。
     */
    public int migrateFromTreesizeIfNeeded() {
        if (!tableExists("treesize_ssh_host")) return 0;
        if (countAll() > 0) return 0;
        return jdbc.update("""
                INSERT OR IGNORE INTO host
                  (id, name, host, port, username, auth_type, password, private_key, passphrase, tag, note, created_at, updated_at)
                SELECT id, name, host, port, username, auth_type, password, private_key, passphrase,
                       NULL AS tag, NULL AS note, created_at, updated_at
                FROM treesize_ssh_host
                """);
    }
}
