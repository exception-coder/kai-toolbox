package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionSharingRepository;
import com.exceptioncoder.toolbox.common.auth.domain.AuthUser;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class SessionSharingServiceTest {
    private final ClaudeChatSessionRepository sessions = mock(ClaudeChatSessionRepository.class);
    private final SessionSharingRepository shares = mock(SessionSharingRepository.class);
    private final AuthUserRepository users = mock(AuthUserRepository.class);
    private final ClaudeChatSessionAccessPolicy access = new ClaudeChatSessionAccessPolicy(sessions);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<AuthUserRepository> provider = mock(ObjectProvider.class);
    private final SessionSharingService service = new SessionSharingService(sessions, shares, access, provider);
    private final ClaudeChatSession session = ClaudeChatSession.builder().id("one").userId(7L).cwd(".")
            .title("会话").engine("codex").authToken("never-expose").sdkSessionId("native-secret").build();

    @BeforeEach
    void setup() {
        when(provider.getIfAvailable()).thenReturn(users);
        when(sessions.findById("one")).thenReturn(Optional.of(session));
        for (long id : List.of(7L, 8L, 9L)) {
            when(users.findById(id)).thenReturn(Optional.of(AuthUser.builder().id(id).enabled(true).build()));
        }
    }

    @AfterEach
    void cleanup() { AuthContext.clear(); }

    private void login(long id, String role) {
        AuthContext.set(new AuthPrincipal(id, "user", List.of(role), List.of(), "jti", Long.MAX_VALUE));
    }

    @Test
    void ownerAndAdminManageButReaderAndThirdPersonCannot() {
        login(7, "USER");
        when(shares.contains("one", 8)).thenReturn(true);
        service.grant("one", 8);
        verify(shares).grant("one", 8, 7, null);
        login(9, "ADMIN");
        service.revoke("one", 8);
        verify(shares).revoke("one", 8);
        login(8, "USER");
        assertThatThrownBy(() -> service.recipients("one", "严伟")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.grant("one", 9)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.revoke("one", 8)).isInstanceOf(ResponseStatusException.class);
        login(9, "USER");
        assertThatThrownBy(() -> service.view("one")).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void grantOnlyPermitsProjectionNotOriginalHttpOrWebsocketOwnership() {
        login(8, "USER");
        when(shares.contains("one", 8)).thenReturn(true);
        assertThat(service.view("one").title()).isEqualTo("会话");
        assertThat(access.canAccessCurrentUser("one")).isFalse();
        assertThat(access.canAccessOrClaimCurrentUser("one")).isFalse();
        var socket = mock(org.springframework.web.socket.WebSocketSession.class);
        when(socket.getAttributes()).thenReturn(java.util.Map.of(
                com.exceptioncoder.toolbox.common.auth.web.AuthenticatedHandshakeInterceptor.AUTH_PRINCIPAL_ATTRIBUTE,
                AuthContext.current().orElseThrow()));
        assertThat(access.canAccess(socket, "one")).isFalse();
        when(shares.contains("one", 8)).thenReturn(false);
        assertThatThrownBy(() -> service.view("one")).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void deniesAnonymousDisabledDeletedOwnerlessAndSpecialSessions() {
        assertThatThrownBy(() -> service.view("one")).isInstanceOf(ResponseStatusException.class);
        login(8, "USER");
        when(shares.contains("one", 8)).thenReturn(true);
        when(users.findById(8)).thenReturn(Optional.of(AuthUser.builder().enabled(false).build()));
        assertThatThrownBy(() -> service.view("one")).isInstanceOf(ResponseStatusException.class);
        when(users.findById(8)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.view("one")).isInstanceOf(ResponseStatusException.class);
        login(7, "USER");
        session.setUserId(null);
        assertThatThrownBy(() -> service.grant("one", 9)).isInstanceOf(ResponseStatusException.class);
        session.setUserId(7L);
        session.setExecutionPolicy(SessionExecutionPolicy.CONSULT_READONLY);
        assertThatThrownBy(() -> service.view("one")).isInstanceOf(ResponseStatusException.class);
        when(sessions.findById("one")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.view("one")).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void excludedProjectBlocksSharingAndReading() {
        var projectAccess = mock(com.exceptioncoder.toolbox.common.project.ProjectAccess.class);
        org.springframework.test.util.ReflectionTestUtils.setField(access, "projectAccess", projectAccess);
        when(projectAccess.allowed(any())).thenReturn(false);
        doThrow(new IllegalArgumentException("excluded")).when(projectAccess).requireAllowed(any());
        login(7, "USER");
        assertThatThrownBy(() -> service.grant("one", 8)).isInstanceOf(ResponseStatusException.class);
        login(8, "USER");
        when(shares.contains("one", 8)).thenReturn(true);
        assertThatThrownBy(() -> service.view("one")).isInstanceOf(ResponseStatusException.class);
        when(shares.sharedSessions(8)).thenReturn(List.of("one"));
        when(sessions.findByIds(List.of("one"))).thenReturn(List.of(session));
        assertThat(service.sharedWithMe()).isEmpty();
    }

    @Test
    void deletedRecipientsRemainRevocable() {
        login(7, "USER");
        when(shares.readerGrants("one")).thenReturn(List.of(new SessionSharingRepository.ReaderGrant(8L, null)));
        when(users.findRecipients(List.of(8L))).thenReturn(List.of());
        assertThat(service.readers("one")).extracting(SessionSharingService.SharedReader::id).containsExactly(8L);
        service.revoke("one", 8);
        verify(shares).revoke("one", 8);
    }

    @Test
    void recipientSearchIsBoundedAndDisabledTargetsCannotBeGranted() {
        login(7, "USER");
        assertThatThrownBy(() -> service.recipients("one", "严")).isInstanceOf(ResponseStatusException.class);
        service.recipients("one", " 严伟 ");
        verify(users).searchEnabledRecipients("严伟");
        when(users.findById(8)).thenReturn(Optional.of(AuthUser.builder().enabled(false).build()));
        assertThatThrownBy(() -> service.grant("one", 8)).isInstanceOf(ResponseStatusException.class);
        verify(shares, never()).grant(anyString(), anyLong(), anyLong(), nullable(Long.class));
    }
}
