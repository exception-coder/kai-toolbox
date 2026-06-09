package com.exceptioncoder.toolbox.browserrequest.repository;

import com.exceptioncoder.toolbox.browserrequest.domain.BrowserSession;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class BrowserSessionRepository {

    private final JdbcTemplate jdbc;

    private final RowMapper<BrowserSession> ROW = (rs, i) -> BrowserSession.builder()
            .id(rs.getString("id"))
            .name(rs.getString("name"))
            .url(rs.getString("url"))
            .hasStorage(rs.getInt("has_storage") == 1)
            .lastActiveAt(rs.getObject("last_active_at") != null ? rs.getLong("last_active_at") : null)
            .createdAt(rs.getLong("created_at"))
            .updatedAt(rs.getLong("updated_at"))
            .engine(rs.getString("engine"))
            .build();

    public BrowserSessionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(BrowserSession s) {
        jdbc.update("""
                INSERT INTO browser_request_session
                  (id, name, url, has_storage, last_active_at, created_at, updated_at, engine)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                s.getId(), s.getName(), s.getUrl(),
                s.isHasStorage() ? 1 : 0,
                s.getLastActiveAt(),
                s.getCreatedAt(), s.getUpdatedAt(), s.getEngine());
    }

    public Optional<BrowserSession> findById(String id) {
        List<BrowserSession> rows = jdbc.query(
                "SELECT * FROM browser_request_session WHERE id = ?", ROW, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public List<BrowserSession> findAll() {
        return jdbc.query(
                "SELECT * FROM browser_request_session ORDER BY updated_at DESC", ROW);
    }

    public void touchActive(String id, long now) {
        jdbc.update("UPDATE browser_request_session SET last_active_at = ?, updated_at = ? WHERE id = ?",
                now, now, id);
    }

    public void markStorageSaved(String id, boolean saved, long now) {
        jdbc.update("UPDATE browser_request_session SET has_storage = ?, updated_at = ? WHERE id = ?",
                saved ? 1 : 0, now, id);
    }

    public void rename(String id, String name, long now) {
        jdbc.update("UPDATE browser_request_session SET name = ?, updated_at = ? WHERE id = ?",
                name, now, id);
    }

    public boolean deleteById(String id) {
        return jdbc.update("DELETE FROM browser_request_session WHERE id = ?", id) > 0;
    }
}
