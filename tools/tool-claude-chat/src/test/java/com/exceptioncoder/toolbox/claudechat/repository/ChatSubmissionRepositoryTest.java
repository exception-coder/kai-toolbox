package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClientMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ChatSubmissionRepositoryTest {
    @Test
    void durableAcceptanceSurvivesNewRepositoryAndDoesNotReplayDuplicateOrLateFailure() {
        var dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        try {
            new ResourceDatabasePopulator(new ClassPathResource("db/claude-chat-submission-schema.sql")).execute(dataSource);
            var jdbc = new JdbcTemplate(dataSource);
            var repository = new ChatSubmissionRepository(jdbc, new ObjectMapper());
            var message = new ClientMessage.Send("原文\n完整保留", List.of(new ClientMessage.Send.Attachment("图", "/owned/image.png", "image/png")), null, null, "id");
            assertTrue(repository.accept("session-a", message));
            assertFalse(repository.accept("session-a", new ClientMessage.Send("不能覆盖", null, null, null, "id")));
            var restored = new ChatSubmissionRepository(jdbc, new ObjectMapper());
            assertEquals(message.text(), restored.list("session-a").getFirst().text());
            assertEquals(message.attachments(), restored.list("session-a").getFirst().attachments());
            assertTrue(restored.list("session-b").isEmpty());
            restored.dispatched("session-a", "id", "turn");
            restored.settled("session-a", "old-turn", true, "old");
            assertEquals("DISPATCHED", restored.list("session-a").getFirst().status());
            restored.markUncertainAfterRestart();
            assertEquals("UNKNOWN", restored.list("session-a").getFirst().status());
            assertFalse(restored.accept("session-a", message));
            restored.settled("session-a", "turn", false, "CODEX_QUERY_FAILED");
            assertEquals("FAILED", restored.list("session-a").getFirst().status());
            assertEquals(message.text(), restored.list("session-a").getFirst().text());
        } finally { dataSource.destroy(); }
    }
}
