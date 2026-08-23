package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/** 持久化主项目与依赖项目之间的有序引用关系。 */
@Repository
public class ProjectDependencyRepository {

    private final JdbcTemplate jdbc;

    public ProjectDependencyRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<String> findPaths(String primaryProjectPath) {
        return jdbc.queryForList("""
                SELECT dependency_project_path
                FROM claude_chat_project_dependency
                WHERE primary_project_path = ?
                ORDER BY sort_order, create_time
                """, String.class, primaryProjectPath);
    }

    public void replace(String primaryProjectPath, List<String> dependencyPaths, long now) {
        jdbc.update("DELETE FROM claude_chat_project_dependency WHERE primary_project_path = ?", primaryProjectPath);
        for (int index = 0; index < dependencyPaths.size(); index++) {
            jdbc.update("""
                    INSERT INTO claude_chat_project_dependency
                        (id, primary_project_path, dependency_project_path, sort_order, create_time, update_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, UUID.randomUUID().toString(), primaryProjectPath, dependencyPaths.get(index), index, now, now);
        }
    }
}
