package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ProjectDependencyBinding;

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

    public List<ProjectDependencyBinding> findBindings(String primaryProjectPath) {
        return jdbc.query("""
                SELECT dependency_project_path, dependency_project_key, relation_type
                FROM claude_chat_project_dependency
                WHERE primary_project_path = ?
                ORDER BY sort_order, create_time
                """, (rs, row) -> new ProjectDependencyBinding(
                rs.getString("dependency_project_path"),
                rs.getString("dependency_project_key"),
                rs.getString("relation_type")), primaryProjectPath);
    }

    public void replace(String primaryProjectPath, List<ProjectDependencyBinding> bindings, long now) {
        jdbc.update("DELETE FROM claude_chat_project_dependency WHERE primary_project_path = ?", primaryProjectPath);
        for (int index = 0; index < bindings.size(); index++) {
            ProjectDependencyBinding binding = bindings.get(index);
            jdbc.update("""
                    INSERT INTO claude_chat_project_dependency
                        (id, primary_project_path, dependency_project_path, dependency_project_key,
                         relation_type, sort_order, create_time, update_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, UUID.randomUUID().toString(), primaryProjectPath, binding.projectPath(),
                    binding.projectKey(), binding.relation(), index, now, now);
        }
    }
}
