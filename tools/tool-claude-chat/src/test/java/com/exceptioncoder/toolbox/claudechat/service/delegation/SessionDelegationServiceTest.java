package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientErrorCode;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionClientPrincipal;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionDelegationProfile;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantException;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionInvitation;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionDelegationRepository;
import com.exceptioncoder.toolbox.common.auth.service.AuthUserService;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

class SessionDelegationServiceTest {

    private static final Instant NOW = Instant.parse("2026-09-05T10:00:00Z");

    private SessionDelegationRepository repository;
    private ClaudeChatSessionRepository sessionRepository;
    private SessionClientTokenService tokenService;
    private SessionCredentialService credentials;
    private SessionDelegationService service;

    @BeforeEach
    void setUp() {
        repository = mock(SessionDelegationRepository.class);
        sessionRepository = mock(ClaudeChatSessionRepository.class);
        tokenService = mock(SessionClientTokenService.class);
        credentials = mock(SessionCredentialService.class);
        service = new SessionDelegationService(repository, sessionRepository, mock(AuthUserService.class),
                credentials, tokenService, mock(SessionClientConnectionRegistry.class));
    }

    @Test
    void onlyOwnerOrAdminCanEnumerateDelegations() {
        when(sessionRepository.findById("session-1")).thenReturn(Optional.of(session(10L)));
        when(repository.findGrantsBySession("session-1")).thenReturn(List.of(grant()));

        assertThatThrownBy(() -> service.list(principal(11L, "USER"), "session-1"))
                .isInstanceOfSatisfying(SessionGrantException.class,
                        error -> assertThat(error.code()).isEqualTo(SessionClientErrorCode.AUTHENTICATION_REQUIRED));
        assertThat(service.list(principal(10L, "USER"), "session-1")).hasSize(1);
        assertThat(service.list(principal(99L, "ADMIN"), "session-1")).hasSize(1);
    }

    @Test
    void missingAndForeignSessionHaveSameEnumerationResistantError() {
        when(sessionRepository.findById("missing")).thenReturn(Optional.empty());
        when(sessionRepository.findById("foreign")).thenReturn(Optional.of(session(10L)));

        SessionGrantException missing = catchGrant(() -> service.list(principal(11L, "USER"), "missing"));
        SessionGrantException foreign = catchGrant(() -> service.list(principal(11L, "USER"), "foreign"));

        assertThat(missing.code()).isEqualTo(SessionClientErrorCode.AUTHENTICATION_REQUIRED);
        assertThat(foreign.code()).isEqualTo(missing.code());
        assertThat(foreign.getMessage()).isEqualTo(missing.getMessage());
    }

    @Test
    void tokenClaimsAreReboundToCurrentGrantAndRevocationIsImmediate() {
        SessionClientPrincipal wrongSession = new SessionClientPrincipal(20L, "grant-1", "other-session",
                "token-1", NOW.plusSeconds(60));
        when(tokenService.parse("wrong-session")).thenReturn(wrongSession);
        when(repository.findGrant("grant-1")).thenReturn(Optional.of(grant()));

        assertThatThrownBy(() -> service.authenticate("wrong-session", NOW))
                .isInstanceOfSatisfying(SessionGrantException.class,
                        error -> assertThat(error.code()).isEqualTo(SessionClientErrorCode.AUTHENTICATION_REQUIRED));

        SessionAccessGrant revoked = grant().revoke(0, NOW.plusSeconds(1));
        SessionClientPrincipal validClaims = new SessionClientPrincipal(20L, "grant-1", "session-1",
                "token-2", NOW.plusSeconds(60));
        when(tokenService.parse("revoked")).thenReturn(validClaims);
        when(repository.findGrant("grant-1")).thenReturn(Optional.of(revoked));

        assertThatThrownBy(() -> service.authenticate("revoked", NOW.plusSeconds(2)))
                .isInstanceOfSatisfying(SessionGrantException.class,
                        error -> assertThat(error.code()).isEqualTo(SessionClientErrorCode.GRANT_REVOKED));
    }

    @Test
    void relayExchangeKeepsSubjectBindingAndIssuesServerLifetimeToken() {
        SessionInvitation invitation = new SessionInvitation("invitation-1", "grant-1", "hash",
                NOW.plusSeconds(60), null, null, false, NOW, NOW);
        when(credentials.hash("one-time-code")).thenReturn("hash");
        when(repository.findInvitationByHash("hash")).thenReturn(Optional.of(invitation));
        when(repository.findGrant("grant-1")).thenReturn(Optional.of(grant()));
        when(repository.consumeInvitation("invitation-1", 20L, NOW)).thenReturn(true);
        when(tokenService.issueForRelay(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq(NOW)))
                .thenReturn(new SessionClientTokenService.IssuedToken("relay-token", NOW.plusSeconds(3_600)));

        SessionDelegationService.ExchangedAccess result = service.exchangeForRelay(
                20L, "business-app", "one-time-code", NOW);

        assertThat(result.accessToken()).isEqualTo("relay-token");
        verify(tokenService).issueForRelay(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq(NOW));
    }

    @Test
    void relayExchangeRejectsMismatchedSubjectWithoutConsumingInvitation() {
        SessionInvitation invitation = new SessionInvitation("invitation-1", "grant-1", "hash",
                NOW.plusSeconds(60), null, null, false, NOW, NOW);
        when(credentials.hash("one-time-code")).thenReturn("hash");
        when(repository.findInvitationByHash("hash")).thenReturn(Optional.of(invitation));
        when(repository.findGrant("grant-1")).thenReturn(Optional.of(grant()));

        assertThatThrownBy(() -> service.exchangeForRelay(99L, "business-app", "one-time-code", NOW))
                .isInstanceOfSatisfying(SessionGrantException.class,
                        error -> assertThat(error.code()).isEqualTo(SessionClientErrorCode.INVITATION_INVALID));
        verify(repository, org.mockito.Mockito.never()).consumeInvitation(
                org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.any());
    }

    private SessionGrantException catchGrant(Runnable call) {
        try {
            call.run();
            throw new AssertionError("expected SessionGrantException");
        } catch (SessionGrantException error) {
            return error;
        }
    }

    private ClaudeChatSession session(long ownerUserId) {
        return ClaudeChatSession.builder().id("session-1").userId(ownerUserId).build();
    }

    private SessionAccessGrant grant() {
        return SessionAccessGrant.create("grant-1", "session-1", 20L, 10L,
                SessionDelegationProfile.DELEGATED_DEVELOPMENT, NOW.plusSeconds(3_600), 20, 4_096, NOW);
    }

    private AuthPrincipal principal(long userId, String role) {
        return new AuthPrincipal(userId, "user", List.of(role), List.of(), "jti", Long.MAX_VALUE);
    }
}
