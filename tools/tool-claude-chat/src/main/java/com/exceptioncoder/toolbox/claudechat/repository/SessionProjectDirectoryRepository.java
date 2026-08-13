package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/** 持久化开发会话额外关联的项目目录；主目录仍由 claude_chat_session.cwd 管理。 */
@Repository
public class SessionProjectDirectoryRepository {

    private final JdbcTemplate jdbc;

    public SessionProjectDirectoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<String> findPaths(String sessionId) {
        return jdbc.queryForList("""
                SELECT project_path
                FROM claude_chat_session_project_directory
                WHERE session_id = ?
                ORDER BY sort_order, create_time
                """, String.class, sessionId);
    }

    public void replace(String sessionId, List<String> paths, long now) {
        jdbc.update("DELETE FROM claude_chat_session_project_directory WHERE session_id = ?", sessionId);
        for (int index = 0; index < paths.size(); index++) {
            jdbc.update("""
                    INSERT INTO claude_chat_session_project_directory
                        (id, session_id, project_path, sort_order, create_time, update_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, UUID.randomUUID().toString(), sessionId, paths.get(index), index, now, now);
        }
    }

    public void copy(String sourceSessionId, String targetSessionId, long now) {
        replace(targetSessionId, findPaths(sourceSessionId), now);
    }

    public void deleteBySessionId(String sessionId) {
        jdbc.update("DELETE FROM claude_chat_session_project_directory WHERE session_id = ?", sessionId);
    }
}
