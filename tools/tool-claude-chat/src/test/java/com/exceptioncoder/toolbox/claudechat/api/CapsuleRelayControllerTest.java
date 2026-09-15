package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.CapsuleRelayIdentityService;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CapsuleRelayControllerTest {
    private final CapsuleRelayIdentityService identities = mock(CapsuleRelayIdentityService.class);
    private final ClaudeChatSessionAccessPolicy access = mock(ClaudeChatSessionAccessPolicy.class);
    private final CapsuleRelayController controller = new CapsuleRelayController(identities, access);

    private MockHttpServletRequest request(String target) {
        var request = new MockHttpServletRequest("GET", CapsuleRelayController.PREFIX + target);
        request.addHeader("Authorization", "Basic host");
        request.addHeader("X-Forge-Participant-Id", "12");
        when(identities.authenticate("Basic host", 12)).thenReturn(new CapsuleRelayIdentityService.Identity(
                "yoooni-one", new AuthPrincipal(101, "capsule", List.of(), List.of(), "capsule", 9999999999L)));
        return request;
    }

    @AfterEach
    void clearContext() {
        AuthContext.clear();
    }

    @Test
    void forwardsHistoryAndRestoresCallerContext() throws Exception {
        var previous = new AuthPrincipal(2, "owner", List.of(), List.of(), "owner", 9999999999L);
        AuthContext.set(previous);
        var response = new MockHttpServletResponse();
        controller.forward(request("/api/assistant/conversations"), response);
        assertThat(response.getForwardedUrl()).isEqualTo("/api/assistant/conversations");
        assertThat(AuthContext.current()).contains(previous);
    }

    @Test
    void attachmentForwardUsesCapsuleOwnerAndClearsContext() throws Exception {
        when(access.canAccessCurrentUser("session-1")).thenAnswer(invocation -> {
            assertThat(AuthContext.current().orElseThrow().userId()).isEqualTo(101);
            return true;
        });
        var response = new MockHttpServletResponse();
        controller.forward(request("/api/claude-chat/sessions/session-1/attachments"), response);
        assertThat(response.getForwardedUrl()).endsWith("/session-1/attachments");
        assertThat(AuthContext.current()).isEmpty();
    }

    @Test
    void refusesOtherOwnersAttachmentsAndClearsContext() {
        assertThatThrownBy(() -> controller.forward(
                request("/api/claude-chat/sessions/other/attachments"), new MockHttpServletResponse()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(AuthContext.current()).isEmpty();
    }

    @Test
    void cannotProxyDelegationOrArbitraryApis() {
        assertThatThrownBy(() -> controller.forward(
                request("/api/session-client/v1/invitations/exchange"), new MockHttpServletResponse()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));
        verifyNoInteractions(identities, access);
    }

    @Test
    void authenticationFailureReturnsForbiddenInsteadOfServerError() {
        var request = request("/api/assistant/conversations");
        when(identities.authenticate("Basic host", 12)).thenThrow(new IllegalArgumentException("invalid"));
        assertThatThrownBy(() -> controller.forward(request, new MockHttpServletResponse()))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(AuthContext.current()).isEmpty();
    }
}
