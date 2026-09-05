package com.exceptioncoder.toolbox.claudechat.repository;

import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionAccessGrant;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionCommandReceipt;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionConnectionTicket;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionDelegationProfile;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionGrantAuditEvent;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionInvitation;
import com.exceptioncoder.toolbox.claudechat.domain.delegation.SessionParticipantCommand;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class SessionDelegationRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-09-05T10:00:00Z");

    private SessionDelegationRepository repository;

    @BeforeEach
    void setUp() throws SQLException {
        SingleConnectionDataSource dataSource = new SingleConnectionDataSource("jdbc:sqlite::memory:", true);
        ScriptUtils.executeSqlScript(dataSource.getConnection(),
                new ClassPathResource("db/claude-chat-schema.sql"));
        repository = new SessionDelegationRepository(new JdbcTemplate(dataSource));
    }

    @Test
    void persistsGrantAndRejectsStaleOptimisticUpdate() {
        SessionAccessGrant original = grant();
        repository.insertGrant(original);
        SessionAccessGrant paused = original.pause(0, NOW.plusSeconds(1));

        assertThat(repository.updateGrant(paused, 0)).isTrue();
        assertThat(repository.updateGrant(original, 0)).isFalse();
        assertThat(repository.findGrant("grant-1").orElseThrow().status()).isEqualTo(paused.status());
        assertThat(repository.findGrantsBySession("session-1")).hasSize(1);
    }

    @Test
    void invitationAndTicketAreConsumedExactlyOnce() {
        repository.insertGrant(grant());
        SessionInvitation invitation = new SessionInvitation("invite-1", "grant-1", "invite-hash",
                NOW.plusSeconds(60), null, null, false, NOW, NOW);
        repository.insertInvitation(invitation);

        assertThat(repository.consumeInvitation("invite-1", 20, NOW.plusSeconds(1))).isTrue();
        assertThat(repository.consumeInvitation("invite-1", 20, NOW.plusSeconds(2))).isFalse();
        assertThat(repository.findInvitationByHash("invite-hash").orElseThrow().consumedBy()).isEqualTo(20);

        SessionConnectionTicket ticket = new SessionConnectionTicket("ticket-1", "grant-1", 20,
                "ticket-hash", NOW.plusSeconds(30), null, NOW, NOW);
        repository.insertTicket(ticket);
        assertThat(repository.consumeTicket("ticket-1", NOW.plusSeconds(1))).isTrue();
        assertThat(repository.consumeTicket("ticket-1", NOW.plusSeconds(2))).isFalse();
    }

    @Test
    void concurrentInvitationConsumptionHasExactlyOneWinner() throws Exception {
        repository.insertGrant(grant());
        repository.insertInvitation(new SessionInvitation("invite-race", "grant-1", "race-hash",
                NOW.plusSeconds(60), null, null, false, NOW, NOW));
        int competitors = 8;
        CountDownLatch ready = new CountDownLatch(competitors);
        CountDownLatch start = new CountDownLatch(1);
        ThreadPoolExecutor executor = new ThreadPoolExecutor(competitors, competitors, 0L, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>());
        List<Future<Boolean>> results = new ArrayList<>(competitors);
        try {
            for (int index = 0; index < competitors; index++) {
                long userId = 20L + index;
                results.add(executor.submit(() -> {
                    ready.countDown();
                    start.await();
                    return repository.consumeInvitation("invite-race", userId, NOW.plusSeconds(1));
                }));
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            int winners = 0;
            for (Future<Boolean> result : results) {
                if (result.get()) {
                    winners++;
                }
            }
            assertThat(winners).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void commandReceiptIsIdempotentAndAuditIsBounded() {
        SessionCommandReceipt receipt = new SessionCommandReceipt(UUID.randomUUID().toString(), "grant-1",
                "command-1", SessionParticipantCommand.SEND, 2, "{\"accepted\":true}", NOW, NOW);

        assertThat(repository.insertCommandReceipt(receipt)).isTrue();
        assertThat(repository.insertCommandReceipt(receipt)).isFalse();
        assertThat(repository.findCommandReceipt("grant-1", "command-1")).contains(receipt);

        repository.insertAudit(new SessionGrantAuditEvent("audit-1", "grant-1", 10L,
                "GRANT_CREATED", "SUCCESS", "request-1", null, NOW, NOW));
        assertThat(repository.findAudit("grant-1", null, 10))
                .extracting(SessionGrantAuditEvent::id).containsExactly("audit-1");
    }

    @Test
    void expiredCredentialsCanBePurged() {
        repository.insertInvitation(new SessionInvitation("invite-1", "grant-1", "invite-hash",
                NOW.minusSeconds(1), null, null, false, NOW.minusSeconds(60), NOW.minusSeconds(60)));
        repository.insertTicket(new SessionConnectionTicket("ticket-1", "grant-1", 20,
                "ticket-hash", NOW.minusSeconds(1), null, NOW.minusSeconds(60), NOW.minusSeconds(60)));

        assertThat(repository.deleteExpiredCredentials(NOW)).isEqualTo(2);
        assertThat(repository.findInvitationByHash("invite-hash")).isEmpty();
        assertThat(repository.findTicketByHash("ticket-hash")).isEmpty();
    }

    private SessionAccessGrant grant() {
        return SessionAccessGrant.create("grant-1", "session-1", 20, 10,
                SessionDelegationProfile.DELEGATED_DEVELOPMENT, NOW.plusSeconds(3_600),
                20, 4_096, NOW);
    }
}
