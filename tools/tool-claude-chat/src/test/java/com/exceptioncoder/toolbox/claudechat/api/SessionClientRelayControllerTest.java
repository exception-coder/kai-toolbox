package com.exceptioncoder.toolbox.claudechat.api;

import org.springframework.mock.env.MockEnvironment;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionDelegationService;
import com.exceptioncoder.toolbox.claudechat.service.delegation.SessionRelayClientAuthenticator;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SessionClientRelayControllerTest {
    @Test
    void authenticatesBeforeInvitationLookupAndPassesOnlyLocalParticipant() {
        var properties = new MockEnvironment();
        properties.setProperty("toolbox.claude-chat.session-client.relay.enabled", "true");
        properties.setProperty("toolbox.claude-chat.session-client.relay.client-id", "client");
        properties.setProperty("toolbox.claude-chat.session-client.relay.client-secret", "secret");
        var service = mock(SessionDelegationService.class);
        var controller = new SessionClientRelayController(new SessionRelayClientAuthenticator(properties), service);
        var request = new SessionClientRelayController.RelayPairRequest(85, "invite");
        assertThatThrownBy(() -> controller.pair(null, request)).isInstanceOf(SessionGrantException.class);
        verifyNoInteractions(service);
        controller.pair("Basic Y2xpZW50OnNlY3JldA==", request);
        verify(service).pairForRelay(eq(85L), eq("client"), eq("invite"), any());
    }
}
