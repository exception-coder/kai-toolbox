package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QueuedChatMessageRepositoryTest {

    private QueuedChatMessageRepository repository;

    @BeforeEach
    void setUp() {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("""
                CREATE TABLE claude_chat_queued_message (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    text TEXT NOT NULL,
                    display_text TEXT,
                    developer_instructions TEXT,
                    attachments_json TEXT,
                    created_at INTEGER NOT NULL
                )
                """);
        repository = new QueuedChatMessageRepository(jdbc, new ObjectMapper());
    }

    @Test
    void persistsAttachmentsAndRestoresOriginalOrder() {
        repository.upsert(message("message-2", "second", 200L));
        repository.upsert(message("message-1", "first", 100L));

        List<QueuedChatMessage> messages = repository.findBySessionId("session-1");

        assertEquals(List.of("message-1", "message-2"), messages.stream().map(QueuedChatMessage::id).toList());
        assertEquals("image/png", messages.get(0).attachments().get(0).mime());
        assertEquals("C:/workspace/.kai-chat-attachments/session-1/image.png",
                messages.get(0).attachments().get(0).path());
    }

    @Test
    void deleteIsScopedBySession() {
        repository.upsert(message("message-1", "first", 100L));

        assertFalse(repository.delete("other-session", "message-1"));
        assertEquals(1, repository.findBySessionId("session-1").size());

        assertTrue(repository.delete("session-1", "message-1"));
        assertTrue(repository.findBySessionId("session-1").isEmpty());
    }

    @Test
    void findsOldestMessageForAtomicDispatch() {
        repository.upsert(message("message-2", "second", 200L));
        repository.upsert(message("message-1", "first", 100L));

        assertEquals("message-1", repository.findFirstBySessionId("session-1").orElseThrow().id());
    }

    private static QueuedChatMessage message(String id, String text, long createdAt) {
        return new QueuedChatMessage(
                id,
                "session-1",
                text,
                null,
                null,
                List.of(new QueuedChatMessage.Attachment(
                        "image.png",
                        "C:/workspace/.kai-chat-attachments/session-1/image.png",
                        "image/png")),
                createdAt);
    }
}
