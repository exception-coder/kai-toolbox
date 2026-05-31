package com.exceptioncoder.toolbox.docker.repository;

import com.exceptioncoder.toolbox.docker.domain.DockerApp;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class DockerAppRepository {

    private final JdbcTemplate jdbc;

    public DockerAppRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<DockerApp> ROW = (rs, i) -> DockerApp.builder()
            .id(rs.getString("id"))
            .hostId(rs.getString("host_id"))
            .name(rs.getString("name"))
            .baseDir(rs.getString("base_dir"))
            .composeFile(rs.getString("compose_file"))
            .note(rs.getString("note"))
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .build();

    public List<DockerApp> findAllByHost(String hostId) {
        return jdbc.query(
                "SELECT * FROM docker_app WHERE host_id = ? ORDER BY updated_at DESC, name ASC",
                ROW, hostId);
    }

    public Optional<DockerApp> findById(String id) {
        return jdbc.query("SELECT * FROM docker_app WHERE id = ?", ROW, id)
                .stream().findFirst();
    }

    public boolean existsByHostAndBaseDir(String hostId, String baseDir) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM docker_app WHERE host_id = ? AND base_dir = ?",
                Integer.class, hostId, baseDir);
        return n != null && n > 0;
    }

    public Optional<DockerApp> findByHostAndBaseDir(String hostId, String baseDir) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(
                    "SELECT * FROM docker_app WHERE host_id = ? AND base_dir = ?",
                    ROW, hostId, baseDir));
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public void insert(DockerApp app) {
        jdbc.update("""
                INSERT INTO docker_app (id, host_id, name, base_dir, compose_file, note, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                app.getId(), app.getHostId(), app.getName(), app.getBaseDir(),
                app.getComposeFile(), app.getNote(),
                app.getCreatedAt(), app.getUpdatedAt());
    }

    public void update(DockerApp app) {
        jdbc.update("""
                UPDATE docker_app
                   SET name = ?, base_dir = ?, compose_file = ?, note = ?, updated_at = ?
                 WHERE id = ?
                """,
                app.getName(), app.getBaseDir(), app.getComposeFile(), app.getNote(),
                app.getUpdatedAt(), app.getId());
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM docker_app WHERE id = ?", id);
    }
}
