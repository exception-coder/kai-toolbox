package com.exceptioncoder.toolbox.prdclarify.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PrdSessionRepositoryTreeTest {

    private JdbcTemplate jdbc;
    private PrdSessionRepository repo;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE prd_session (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    project TEXT,
                    parent_id TEXT,
                    raw_input TEXT,
                    created_at INTEGER NOT NULL
                )
                """);
        repo = new PrdSessionRepository(jdbc);
    }

    @Test
    void updateProjectTreeMovesEveryDescendantButNotOtherTrees() {
        insert("root", "原版", "旧分组", null, "原始需求", 1);
        insert("revision", "原版（修订版）", "旧分组", "root", "修订", 2);
        insert("revision2", "原版（修订版）（修订版）", "旧分组", "revision", "再修订", 3);
        insert("other", "其它 PRD", "旧分组", null, "其它", 4);

        repo.updateProjectTree("root", "新分组");

        assertEquals("新分组", projectOf("root"));
        assertEquals("新分组", projectOf("revision"));
        assertEquals("新分组", projectOf("revision2"));
        assertEquals("旧分组", projectOf("other"));
    }

    @Test
    void backfillRevisionParentsLinksLegacyRevisionToClosestEarlierSource() {
        insert("older", "登录页风格", "Forge", null, "旧原始需求", 1);
        insert("source", "登录页风格", "Forge", null, "当前原始需求", 2);
        insert("revision", "登录页风格（修订版）", "Forge", null,
                "【修订版 PRD — 基于原版：登录页风格】\n\n=== 原版 PRD 内容 ===", 3);

        assertEquals(1, repo.backfillRevisionParents());
        assertEquals("source", parentOf("revision"));
        assertEquals(0, repo.backfillRevisionParents());
    }

    private void insert(String id, String title, String project, String parentId, String rawInput, long createdAt) {
        jdbc.update("INSERT INTO prd_session (id, title, project, parent_id, raw_input, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                id, title, project, parentId, rawInput, createdAt);
    }

    private String projectOf(String id) {
        return jdbc.queryForObject("SELECT project FROM prd_session WHERE id = ?", String.class, id);
    }

    private String parentOf(String id) {
        return jdbc.queryForObject("SELECT parent_id FROM prd_session WHERE id = ?", String.class, id);
    }
}
