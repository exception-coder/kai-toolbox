package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionStatus;
import com.exceptioncoder.toolbox.claudechat.config.ClaudeChatSchemaMigration;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import static org.assertj.core.api.Assertions.assertThat;

class ClaudeChatSessionPermissionModeTest {

    @Test
    void selectedModeSurvivesRepositoryReload() throws Exception {
        try (SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true)) {
            ScriptUtils.executeSqlScript(dataSource.getConnection(), new ClassPathResource("db/claude-chat-schema.sql"));
            JdbcTemplate jdbc = new JdbcTemplate(dataSource);
            new ClaudeChatSchemaMigration(jdbc).addEngineColumn();
            ClaudeChatSessionRepository repository = new ClaudeChatSessionRepository(jdbc);
            repository.insert(ClaudeChatSession.builder().id("session-1").cwd("D:/workspace")
                    .engine("codex").permissionMode("default").status(SessionStatus.IDLE)
                    .startedAt(1).lastSeenAt(1).build());

            repository.updatePermissionMode("session-1", "bypassPermissions");

            ClaudeChatSessionRepository reopened = new ClaudeChatSessionRepository(new JdbcTemplate(dataSource));
            assertThat(reopened.findById("session-1")).get()
                    .extracting(ClaudeChatSession::getPermissionMode).isEqualTo("bypassPermissions");
        }
    }
}
