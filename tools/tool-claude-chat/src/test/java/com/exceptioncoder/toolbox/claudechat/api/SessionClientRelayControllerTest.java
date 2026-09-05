package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.config.SessionClientProperties;
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
        var properties = new SessionClientProperties();
        properties.getRelay().setEnabled(true);
        properties.getRelay().setClientId("client");
        properties.getRelay().setClientSecret("secret");
        var service = mock(SessionDelegationService.class);
        var controller = new SessionClientRelayController(new SessionRelayClientAuthenticator(properties), service);
        var request = new SessionClientRelayController.RelayPairRequest(85, "invite");
        assertThatThrownBy(() -> controller.pair(null, request)).isInstanceOf(SessionGrantException.class);
        verifyNoInteractions(service);
        controller.pair("Basic Y2xpZW50OnNlY3JldA==", request);
        verify(service).pairForRelay(eq(85L), eq("client"), eq("invite"), any());
    }
}
