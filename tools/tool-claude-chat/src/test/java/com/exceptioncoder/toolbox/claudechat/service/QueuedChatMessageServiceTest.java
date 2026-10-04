package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.QueuedChatMessage;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.QueuedChatMessageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QueuedChatMessageServiceTest {

    private QueuedChatMessageRepository repository;
    private QueuedChatMessageService service;

    @BeforeEach
    void setUp() {
        repository = mock(QueuedChatMessageRepository.class);
        service = new QueuedChatMessageService(repository, mock(ClaudeChatSessionRepository.class));
    }

    @Test
    void takeFirstReturnsClaimedMessage() {
        QueuedChatMessage message = message();
        when(repository.findFirstBySessionId("session-1")).thenReturn(Optional.of(message));
        when(repository.delete("session-1", "message-1")).thenReturn(true);

        assertEquals(Optional.of(message), service.takeFirst("session-1"));
    }

    @Test
    void takeFirstReturnsEmptyWhenAnotherDispatcherAlreadyClaimedMessage() {
        QueuedChatMessage message = message();
        when(repository.findFirstBySessionId("session-1")).thenReturn(Optional.of(message));
        when(repository.delete("session-1", "message-1")).thenReturn(false);

        assertTrue(service.takeFirst("session-1").isEmpty());
    }

    @Test
    void restoreReinsertsMessageAfterDispatchFailure() {
        QueuedChatMessage message = message();

        service.restore(message);

        verify(repository).upsert(message);
    }

    @Test
    void initialAutopilotReleaseRequiresItsMessageAtTheHead() {
        when(repository.findFirstBySessionId("session-1"))
                .thenReturn(Optional.of(message()))
                .thenReturn(Optional.of(new QueuedChatMessage(
                        "autopilot:run-1:1:apply:1.1:0", "session-1", "continue",
                        null, null, List.of(), 2L)));

        assertFalse(service.firstIsInternal("session-1"));
        assertTrue(service.firstIsInternal("session-1"));
    }

    private static QueuedChatMessage message() {
        return new QueuedChatMessage("message-1", "session-1", "next", null, null, List.of(), 1L);
    }
}
