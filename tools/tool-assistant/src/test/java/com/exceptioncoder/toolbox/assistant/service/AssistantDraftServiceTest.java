package com.exceptioncoder.toolbox.assistant.service;

import com.exceptioncoder.toolbox.assistant.domain.AssistantDraft;
import com.exceptioncoder.toolbox.assistant.domain.AssistantRegistration;
import com.exceptioncoder.toolbox.assistant.repository.AssistantDraftRepository;
import com.exceptioncoder.toolbox.assistant.repository.AssistantRegistrationRepository;
import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.common.requirement.RequirementRegistrationPort;
import com.exceptioncoder.toolbox.common.session.SessionOwnershipPort;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import com.exceptioncoder.toolbox.common.auth.repository.AuthUserRepository;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Assistant 草稿和幂等登记用例测试。 */
class AssistantDraftServiceTest {

    private final AtomicInteger registrations = new AtomicInteger();
    private AssistantDraftService service;

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource("jdbc:sqlite::memory:", true));
        jdbc.execute("""
                CREATE TABLE assistant_draft (
                    id TEXT PRIMARY KEY, creator_user_id INTEGER NOT NULL, session_id TEXT NOT NULL,
                    kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
                    context_snapshot_json TEXT NOT NULL, evidence_json TEXT NOT NULL,
                    status TEXT NOT NULL, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL)
                """);
        jdbc.execute("""
                CREATE TABLE assistant_registration (
                    id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
                    requirement_id TEXT, status TEXT NOT NULL, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL)
                """);
        jdbc.execute("CREATE UNIQUE INDEX uk_assistant_registration_draft ON assistant_registration(draft_id)");
        RequirementRegistrationPort requirementPort = command -> "req-" + registrations.incrementAndGet();
        SessionOwnershipPort ownership = sessionId -> "session-1".equals(sessionId);
        service = new AssistantDraftService(
                new AssistantDraftRepository(jdbc), new AssistantRegistrationRepository(jdbc),
                requirementPort, ownership, new ObjectMapper(),
                new StaticListableBeanFactory().getBeanProvider(AuthUserRepository.class));
        AuthContext.set(new AuthPrincipal(7L, "user", List.of("USER"), List.of(), "jti", Long.MAX_VALUE));
    }

    @AfterEach
    void tearDown() {
        AuthContext.clear();
    }

    @Test
    void createsDraftWithoutRegisteringRequirement() {
        AssistantDraft draft = createDraft();

        assertThat(draft.status()).isEqualTo("DRAFT");
        assertThat(registrations).hasValue(0);
    }

    @Test
    void returnsOriginalRequirementForRepeatedConfirmation() {
        AssistantDraft draft = createDraft();
        String idempotencyKey = UUID.randomUUID().toString();

        AssistantRegistration first = service.confirm(draft.id(), idempotencyKey, null);
        AssistantRegistration repeated = service.confirm(draft.id(), idempotencyKey, null);

        assertThat(first.requirementId()).isEqualTo("req-1");
        assertThat(first.alreadySaved()).isFalse();
        assertThat(repeated.requirementId()).isEqualTo("req-1");
        assertThat(repeated.alreadySaved()).isTrue();
        assertThat(registrations).hasValue(1);
    }

    @Test
    void draftCannotCreateAnotherRequirementWithDifferentIdempotencyKey() {
        AssistantDraft draft = createDraft();

        AssistantRegistration first = service.confirm(draft.id(), UUID.randomUUID().toString(), null);
        AssistantRegistration repeated = service.confirm(draft.id(), UUID.randomUUID().toString(), null);

        assertThat(repeated.requirementId()).isEqualTo(first.requirementId());
        assertThat(repeated.alreadySaved()).isTrue();
        assertThat(registrations).hasValue(1);
    }

    @Test
    void rejectsOversizedContextBeforePersistence() {
        assertThatThrownBy(() -> service.create(new AssistantDraftService.CreateDraftCommand(
                "session-1", "BUG", "审核失败", "订单审核返回 500",
                Map.of("payload", "x".repeat(64_001)), List.of())))
                .hasMessageContaining("64000");
    }

    private AssistantDraft createDraft() {
        return service.create(new AssistantDraftService.CreateDraftCommand(
                "session-1", "BUG", "审核失败", "订单审核返回 500",
                Map.of("application", Map.of("appId", "ERP"),
                        "page", Map.of("routeName", "order-detail")), List.of()));
    }
}
