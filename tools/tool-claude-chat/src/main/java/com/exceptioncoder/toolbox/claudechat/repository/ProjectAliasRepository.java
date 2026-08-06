package com.exceptioncoder.toolbox.claudechat.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.Map;

/**
 * 项目别名持久层，以规范化绝对路径作为稳定键。
 */
@Repository
public class ProjectAliasRepository {

    private final JdbcTemplate jdbc;

    public ProjectAliasRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 查询全部路径别名，供工作区列表统一装饰。
     *
     * @return 项目路径到别名的映射
     */
    public Map<String, String> findAll() {
        Map<String, String> aliases = new HashMap<>();
        jdbc.query("SELECT project_path, alias FROM claude_chat_project_alias", resultSet -> {
            aliases.put(resultSet.getString("project_path"), resultSet.getString("alias"));
        });
        return aliases;
    }

    /**
     * 幂等保存项目别名。
     *
     * @param projectPath 规范化绝对路径
     * @param alias       已去除首尾空白的别名
     */
    public void upsert(String projectPath, String alias) {
        jdbc.update("""
                INSERT INTO claude_chat_project_alias (project_path, alias, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(project_path) DO UPDATE SET alias = excluded.alias, updated_at = excluded.updated_at
                """, projectPath, alias, System.currentTimeMillis());
    }

    /**
     * 清除指定项目路径的别名。
     *
     * @param projectPath 规范化绝对路径
     */
    public void delete(String projectPath) {
        jdbc.update("DELETE FROM claude_chat_project_alias WHERE project_path = ?", projectPath);
    }
}
