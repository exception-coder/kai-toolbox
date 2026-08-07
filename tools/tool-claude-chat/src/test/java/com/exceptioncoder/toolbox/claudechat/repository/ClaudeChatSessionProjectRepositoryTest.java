package com.exceptioncoder.toolbox.claudechat.repository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 会话项目批量重命名持久化测试。
 */
class ClaudeChatSessionProjectRepositoryTest {

    private JdbcTemplate jdbc;
    private ClaudeChatSessionRepository repository;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE claude_chat_session (
                    id TEXT PRIMARY KEY,
                    group_name TEXT,
                    subgroup_name TEXT
                )
                """);
        jdbc.update("INSERT INTO claude_chat_session (id, group_name, subgroup_name) VALUES (?, ?, ?)",
                "session-1", "ERP", "报价管理");
        jdbc.update("INSERT INTO claude_chat_session (id, group_name, subgroup_name) VALUES (?, ?, ?)",
                "session-2", "ERP", "库存管理");
        repository = new ClaudeChatSessionRepository(jdbc);
    }

    /** 单条更新迁移全部会话且不改变需求子分组。 */
    @Test
    void renamesAllSessionsWithoutChangingSubgroups() {
        int updated = repository.renameGroup("ERP", "YOOONI ERP");

        assertThat(updated).isEqualTo(2);
        assertThat(repository.groupExists("ERP")).isFalse();
        assertThat(repository.groupExists("YOOONI ERP")).isTrue();
        assertThat(jdbc.queryForList(
                "SELECT subgroup_name FROM claude_chat_session ORDER BY id", String.class))
                .containsExactly("报价管理", "库存管理");
    }
}

