package com.exceptioncoder.toolbox.claudechat.domain.delegation;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SessionAccessGrantTest {

    private static final Instant NOW = Instant.parse("2026-09-05T10:00:00Z");

    @Test
    void createsBoundActiveGrantAndConsumesQuota() {
        SessionAccessGrant grant = grant();

        SessionAccessGrant consumed = grant.requireAccess(20, "session-1", NOW)
                .consumeTurn(256, 0, NOW.plusSeconds(1));

        assertThat(consumed.status()).isEqualTo(SessionGrantStatus.ACTIVE);
        assertThat(consumed.usedTurns()).isEqualTo(1);
        assertThat(consumed.version()).isEqualTo(1);
    }

    @Test
    void rejectsSubjectSessionAndExpiredAccessWithoutLeakingAnotherSession() {
        SessionAccessGrant grant = grant();

        assertCode(() -> grant.requireAccess(21, "session-1", NOW),
                SessionClientErrorCode.AUTHENTICATION_REQUIRED);
        assertCode(() -> grant.requireAccess(20, "session-2", NOW),
                SessionClientErrorCode.AUTHENTICATION_REQUIRED);
        assertCode(() -> grant.requireAccess(20, "session-1", NOW.plusSeconds(3_601)),
                SessionClientErrorCode.GRANT_EXPIRED);
    }

    @Test
    void pauseResumeAndRevokeRequireCurrentVersion() {
        SessionAccessGrant paused = grant().pause(0, NOW.plusSeconds(1));
        assertThat(paused.status()).isEqualTo(SessionGrantStatus.PAUSED);
        assertCode(() -> paused.resume(0, NOW.plusSeconds(2)),
                SessionClientErrorCode.SESSION_VERSION_CONFLICT);

        SessionAccessGrant resumed = paused.resume(1, NOW.plusSeconds(2));
        SessionAccessGrant revoked = resumed.revoke(2, NOW.plusSeconds(3));

        assertThat(revoked.status()).isEqualTo(SessionGrantStatus.REVOKED);
        assertCode(() -> revoked.requireAccess(20, "session-1", NOW.plusSeconds(4)),
                SessionClientErrorCode.GRANT_REVOKED);
    }

    @Test
    void rejectsInputAndTurnLimit() {
        SessionAccessGrant first = grant().consumeTurn(1_024, 0, NOW.plusSeconds(1));
        SessionAccessGrant second = first.consumeTurn(1_024, 1, NOW.plusSeconds(2));

        assertCode(() -> second.consumeTurn(1, 2, NOW.plusSeconds(3)),
                SessionClientErrorCode.LIMIT_EXCEEDED);
        assertCode(() -> grant().consumeTurn(1_025, 0, NOW.plusSeconds(1)),
                SessionClientErrorCode.LIMIT_EXCEEDED);
    }

    @Test
    void onlyKnownWireCommandsEnterPublicWhitelist() {
        assertThat(SessionParticipantCommand.fromWire("answer-question"))
                .contains(SessionParticipantCommand.ANSWER_QUESTION);
        assertThat(SessionParticipantCommand.fromWire("switchEngine")).isEmpty();
    }

    @Test
    void invitationCanOnlyBeConsumedByBoundSubjectBeforeExpiry() {
        SessionInvitation invitation = new SessionInvitation("invite-1", "grant-1", "hash",
                NOW.plusSeconds(60), null, null, false, NOW, NOW);

        invitation.requireConsumable(grant(), 20, NOW.plusSeconds(1));
        assertCode(() -> invitation.requireConsumable(grant(), 21, NOW.plusSeconds(1)),
                SessionClientErrorCode.INVITATION_INVALID);

        SessionInvitation consumed = new SessionInvitation("invite-1", "grant-1", "hash",
                NOW.plusSeconds(60), NOW.plusSeconds(2), 20L, false, NOW, NOW.plusSeconds(2));
        assertCode(() -> consumed.requireConsumable(grant(), 20, NOW.plusSeconds(3)),
                SessionClientErrorCode.INVITATION_INVALID);
    }

    private SessionAccessGrant grant() {
        return SessionAccessGrant.create("grant-1", "session-1", 20, 10,
                SessionDelegationProfile.DELEGATED_DEVELOPMENT, NOW.plusSeconds(3_600),
                2, 1_024, NOW);
    }

    private void assertCode(Runnable action, SessionClientErrorCode expected) {
        assertThatThrownBy(action::run)
                .isInstanceOf(SessionGrantException.class)
                .extracting(error -> ((SessionGrantException) error).code())
                .isEqualTo(expected);
    }
}
