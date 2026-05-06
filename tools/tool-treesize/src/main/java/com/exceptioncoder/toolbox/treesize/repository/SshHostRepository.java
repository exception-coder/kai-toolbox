package com.exceptioncoder.toolbox.treesize.repository;

import com.exceptioncoder.toolbox.treesize.domain.SshAuthType;
import com.exceptioncoder.toolbox.treesize.domain.SshHost;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class SshHostRepository {

    private final JdbcTemplate jdbc;

    public SshHostRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<SshHost> ROW = (rs, i) -> SshHost.builder()
            .id(rs.getString("id"))
            .name(rs.getString("name"))
            .host(rs.getString("host"))
            .port(rs.getInt("port"))
            .username(rs.getString("username"))
            .authType(SshAuthType.valueOf(rs.getString("auth_type")))
            .password(rs.getString("password"))
            .privateKey(rs.getString("private_key"))
            .passphrase(rs.getString("passphrase"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<SshHost> findAll() {
        return jdbc.query("SELECT * FROM treesize_ssh_host ORDER BY updated_at DESC, name ASC", ROW);
    }

    public Optional<SshHost> findById(String id) {
        return jdbc.query("SELECT * FROM treesize_ssh_host WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    public void insert(SshHost h) {
        jdbc.update("""
                INSERT INTO treesize_ssh_host
                  (id, name, host, port, username, auth_type, password, private_key, passphrase, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                h.getId(), h.getName(), h.getHost(), h.getPort(), h.getUsername(),
                h.getAuthType().name(), h.getPassword(), h.getPrivateKey(), h.getPassphrase(),
                h.getCreatedAt(), h.getUpdatedAt());
    }

    public void update(SshHost h) {
        jdbc.update("""
                UPDATE treesize_ssh_host
                   SET name = ?, host = ?, port = ?, username = ?, auth_type = ?,
                       password = ?, private_key = ?, passphrase = ?, updated_at = ?
                 WHERE id = ?
                """,
                h.getName(), h.getHost(), h.getPort(), h.getUsername(), h.getAuthType().name(),
                h.getPassword(), h.getPrivateKey(), h.getPassphrase(), h.getUpdatedAt(), h.getId());
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM treesize_ssh_host WHERE id = ?", id);
    }
}
