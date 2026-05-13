package com.exceptioncoder.toolbox.webterm.repository;

import com.exceptioncoder.toolbox.webterm.domain.ClaudeSession;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public class ClaudeSessionRepository {

    private final JdbcTemplate jdbc;

    public ClaudeSessionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<ClaudeSession> ROW = (rs, i) -> ClaudeSession.builder()
            .id(rs.getString("id"))
            .cwd(rs.getString("cwd"))
            .shell(rs.getString("shell"))
            .title(rs.getString("title"))
            .startedAt(rs.getLong("started_at"))
            .lastSeenAt(rs.getLong("last_seen_at"))
            .build();

    public List<ClaudeSession> findAll() {
        return jdbc.query(
                "SELECT * FROM webterm_claude_session ORDER BY last_seen_at DESC",
                ROW);
    }

    public Optional<ClaudeSession> findByCwdAndShell(String cwd, String shell) {
        return jdbc.query(
                "SELECT * FROM webterm_claude_session WHERE cwd = ? AND shell = ?",
                ROW, cwd, shell)
                .stream().findFirst();
    }

    public void insert(ClaudeSession s) {
        jdbc.update("""
                INSERT INTO webterm_claude_session
                  (id, cwd, shell, title, started_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                s.getId(), s.getCwd(), s.getShell(), s.getTitle(),
                s.getStartedAt(), s.getLastSeenAt());
    }

    public void touch(String id, long lastSeenAt) {
        jdbc.update(
                "UPDATE webterm_claude_session SET last_seen_at = ? WHERE id = ?",
                lastSeenAt, id);
    }

    public void updateTitle(String id, String title) {
        jdbc.update(
                "UPDATE webterm_claude_session SET title = ? WHERE id = ?",
                title, id);
    }

    public void deleteById(String id) {
        jdbc.update("DELETE FROM webterm_claude_session WHERE id = ?", id);
    }
}
