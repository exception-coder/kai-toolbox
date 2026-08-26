package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ProjectRouteBinding;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** 本机项目路由显式绑定持久层。 */
@Slf4j
@Repository
public class ProjectRouteBindingRepository {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public ProjectRouteBindingRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    /** 返回全部显式绑定，按 knowledge projectKey 排序。 */
    public List<ProjectRouteBinding> findAll() {
        return jdbc.query("""
                SELECT id, project_key, project_path, aliases_json, create_time, update_time
                FROM claude_chat_project_route_binding
                ORDER BY project_key COLLATE NOCASE
                """, (resultSet, rowNumber) -> new ProjectRouteBinding(
                resultSet.getString("id"),
                resultSet.getString("project_key"),
                resultSet.getString("project_path"),
                parseAliases(resultSet.getString("aliases_json")),
                resultSet.getLong("create_time"),
                resultSet.getLong("update_time")));
    }

    /** 按 knowledge projectKey 查询显式绑定。 */
    public Optional<ProjectRouteBinding> findByProjectKey(String projectKey) {
        return findAll().stream()
                .filter(binding -> binding.projectKey().equalsIgnoreCase(projectKey))
                .findFirst();
    }

    /** 幂等保存显式绑定。 */
    public void upsert(ProjectRouteBinding binding) {
        jdbc.update("""
                INSERT INTO claude_chat_project_route_binding
                    (id, project_key, project_path, aliases_json, create_time, update_time)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_key) DO UPDATE SET
                    project_path = excluded.project_path,
                    aliases_json = excluded.aliases_json,
                    update_time = excluded.update_time
                """,
                binding.id(), binding.projectKey(), binding.projectPath(), writeAliases(binding.aliases()),
                binding.createTime(), binding.updateTime());
    }

    /** 删除一个显式绑定。 */
    public void delete(String projectKey) {
        jdbc.update("DELETE FROM claude_chat_project_route_binding WHERE lower(project_key) = lower(?)", projectKey);
    }

    private List<String> parseAliases(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<String> aliases = objectMapper.readValue(json, STRING_LIST);
            return aliases == null ? List.of() : List.copyOf(aliases);
        } catch (Exception exception) {
            log.warn("[project-route] 绑定别名 JSON 无法解析", exception);
            return List.of();
        }
    }

    private String writeAliases(List<String> aliases) {
        try {
            return objectMapper.writeValueAsString(aliases);
        } catch (Exception exception) {
            throw new IllegalStateException("项目路由别名无法序列化", exception);
        }
    }
}
