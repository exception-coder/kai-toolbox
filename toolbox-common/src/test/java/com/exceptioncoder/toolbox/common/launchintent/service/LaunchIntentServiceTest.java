package com.exceptioncoder.toolbox.common.launchintent.service;

import com.exceptioncoder.toolbox.common.launchintent.domain.LaunchIntent;
import com.exceptioncoder.toolbox.common.launchintent.domain.LaunchIntentState;
import com.exceptioncoder.toolbox.common.launchintent.repository.LaunchIntentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LaunchIntentServiceTest {

    private static final long NOW = 1_700_000_000_000L;

    @Test
    void createsFailsRetriesAndAcknowledgesIntent() {
        Map<String, LaunchIntent> store = new HashMap<>();
        LaunchIntentRepository repository = inMemoryRepository(store);
        LaunchIntentService service = new LaunchIntentService(
                repository, Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC));

        LaunchIntent created = service.create(1, "CHAT_OPEN_AND_SEND", "{\"cwd\":\"x\",\"seed\":\"go\"}");
        assertThat(created.state()).isEqualTo(LaunchIntentState.PENDING);

        LaunchIntent failed = service.fail(created.id(), "temporary");
        assertThat(failed.state()).isEqualTo(LaunchIntentState.FAILED);
        assertThat(service.getExecutable(created.id()).state()).isEqualTo(LaunchIntentState.FAILED);

        LaunchIntent acknowledged = service.acknowledge(created.id());
        assertThat(acknowledged.state()).isEqualTo(LaunchIntentState.ACKED);
        assertThat(service.acknowledge(created.id()).state()).isEqualTo(LaunchIntentState.ACKED);
        assertThatThrownBy(() -> service.getExecutable(created.id()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("已经消费");
    }

    @Test
    void rejectsUnknownContractAndOversizedPayload() {
        LaunchIntentService service = new LaunchIntentService(
                mock(LaunchIntentRepository.class),
                Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC));

        assertThatThrownBy(() -> service.create(2, "CHAT_OPEN_PANEL", "{}"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.create(1, "UNKNOWN", "{}"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.create(1, "CHAT_OPEN_PANEL", "x".repeat(65_537)))
                .isInstanceOf(ResponseStatusException.class);
    }

    private LaunchIntentRepository inMemoryRepository(Map<String, LaunchIntent> store) {
        LaunchIntentRepository repository = mock(LaunchIntentRepository.class);
        doAnswer(invocation -> {
            LaunchIntent intent = invocation.getArgument(0);
            store.put(intent.id(), intent);
            return null;
        }).when(repository).insert(any());
        when(repository.findById(any())).thenAnswer(invocation -> Optional.ofNullable(store.get(invocation.getArgument(0))));
        doAnswer(invocation -> {
            String id = invocation.getArgument(0);
            LaunchIntent current = store.get(id);
            store.put(id, new LaunchIntent(
                    current.id(), current.protocolVersion(), current.type(), current.payloadJson(),
                    invocation.getArgument(1), invocation.getArgument(2), current.createdAt(),
                    current.expiresAt(), invocation.getArgument(3), invocation.getArgument(4)));
            return null;
        }).when(repository).updateState(any(), any(), any(), any(), any(Long.class));
        return repository;
    }
}
