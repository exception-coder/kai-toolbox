package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 会话访问策略测试。 */
class ClaudeChatSessionAccessPolicyTest {

    private final ClaudeChatSessionRepository repository = mock(ClaudeChatSessionRepository.class);
    private final ClaudeChatSessionAccessPolicy policy = new ClaudeChatSessionAccessPolicy(repository);

    @AfterEach
    void clearAuthContext() {
        AuthContext.clear();
    }

    @Test
    void allowsOwnerAndRejectsAnotherUser() {
        when(repository.findById("session-1"))
                .thenReturn(Optional.of(ClaudeChatSession.builder().id("session-1").userId(7L).build()));

        assertThat(policy.canAccess(socketFor(7L), "session-1")).isTrue();
        assertThat(policy.canAccess(socketFor(8L), "session-1")).isFalse();
    }

    @Test
    void rejectsLegacyOwnerlessSessionWhenAuthenticationIsEnabled() {
        when(repository.findById("legacy"))
                .thenReturn(Optional.of(ClaudeChatSession.builder().id("legacy").build()));

        assertThat(policy.canAccess(socketFor(8L), "legacy")).isFalse();
    }

    @Test
    void allowsAdminToAccessLegacyOwnerlessSession() {
        when(repository.findById("legacy"))
                .thenReturn(Optional.of(ClaudeChatSession.builder().id("legacy").build()));

        assertThat(policy.canAccess(socketFor(2L, List.of("ADMIN", "USER")), "legacy")).isTrue();
    }

    @Test
    void rejectsProjectOperationWhenProjectContainsAnotherUsersSession() {
        AuthContext.set(new AuthPrincipal(7L, "owner", List.of("USER"), List.of(), "jti", 1L));
        when(repository.findByGroupName("ERP")).thenReturn(List.of(
                ClaudeChatSession.builder().id("own").userId(7L).build(),
                ClaudeChatSession.builder().id("foreign").userId(8L).build()));

        assertThat(policy.canAccessProjectCurrentUser("ERP")).isFalse();
    }

    private WebSocketSession socketFor(long userId) {
        return socketFor(userId, List.of("USER"));
    }

    private WebSocketSession socketFor(long userId, List<String> roles) {
        WebSocketSession socket = mock(WebSocketSession.class);
        AuthPrincipal principal = new AuthPrincipal(userId, "user", roles, List.of(), "jti", 1L);
        when(socket.getAttributes()).thenReturn(Map.of(
                AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE, principal));
        return socket;
    }
}
