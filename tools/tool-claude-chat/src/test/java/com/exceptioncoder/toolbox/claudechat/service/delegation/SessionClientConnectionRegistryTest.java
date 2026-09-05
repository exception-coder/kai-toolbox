package com.exceptioncoder.toolbox.claudechat.service.delegation;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionClientConnectionRegistryTest {

    @Test
    void revocationClosesEveryOpenGrantConnectionAndClearsTurnOwnership() throws Exception {
        SessionClientConnectionRegistry registry = new SessionClientConnectionRegistry();
        WebSocketSession first = openSession();
        WebSocketSession second = openSession();
        registry.register("grant-1", first);
        registry.register("grant-1", second);
        registry.markTurnStarted("grant-1");

        registry.closeGrant("grant-1", "GRANT_REVOKED");

        ArgumentCaptor<CloseStatus> firstStatus = ArgumentCaptor.forClass(CloseStatus.class);
        ArgumentCaptor<CloseStatus> secondStatus = ArgumentCaptor.forClass(CloseStatus.class);
        verify(first).close(firstStatus.capture());
        verify(second).close(secondStatus.capture());
        assertThat(firstStatus.getValue().getCode()).isEqualTo(4003);
        assertThat(secondStatus.getValue().getCode()).isEqualTo(4003);
        assertThat(registry.ownsActiveTurn("grant-1")).isFalse();
        assertThat(registry.connectionCount("grant-1")).isZero();
    }

    private WebSocketSession openSession() {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
        return session;
    }
}
