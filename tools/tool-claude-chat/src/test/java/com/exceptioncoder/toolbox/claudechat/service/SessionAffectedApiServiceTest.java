package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.domain.SessionAffectedApi;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.repository.SessionAffectedApiRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SessionAffectedApiServiceTest {

    private SessionAffectedApiRepository repository;
    private SessionAffectedApiService service;

    @BeforeEach
    void setUp() {
        repository = mock(SessionAffectedApiRepository.class);
        ClaudeChatSessionRepository sessionRepository = mock(ClaudeChatSessionRepository.class);
        when(sessionRepository.findById("session-1")).thenReturn(Optional.of(mock(ClaudeChatSession.class)));
        service = new SessionAffectedApiService(repository, sessionRepository);
    }

    @Test
    void normalizesAndUpsertsAffectedApi() {
        when(repository.findBySessionId("session-1")).thenAnswer(invocation -> List.of());

        service.register("session-1", List.of(new SessionAffectedApiService.Registration(
                "put", "/api/orders/{id}/", "modified", "src/OrderController.java",
                "OrderController#update", "更新订单", null, null, null, null)));

        org.mockito.ArgumentCaptor<SessionAffectedApi> captor = org.mockito.ArgumentCaptor.forClass(SessionAffectedApi.class);
        verify(repository).upsert(captor.capture());
        assertThat(captor.getValue().httpMethod()).isEqualTo("PUT");
        assertThat(captor.getValue().apiPath()).isEqualTo("/api/orders/{id}");
        assertThat(captor.getValue().verificationStatus()).isEqualTo(SessionAffectedApi.UNVERIFIED);
    }

    @Test
    void validatesEntireBatchBeforeWriting() {
        List<SessionAffectedApiService.Registration> registrations = List.of(
                registration("GET", "/api/orders"),
                registration("GET", "/api/orders"));

        assertThatThrownBy(() -> service.register("session-1", registrations))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("重复");
        verify(repository, never()).upsert(any());
    }

    @Test
    void rejectsPassedStatusWithoutEvidence() {
        SessionAffectedApiService.Registration registration = new SessionAffectedApiService.Registration(
                "POST", "/api/orders", "ADDED", "src/OrderController.java",
                null, null, "PASSED", null, null, null);

        assertThatThrownBy(() -> service.register("session-1", List.of(registration)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("verificationMethod");
        verify(repository, never()).upsert(any());
    }

    @Test
    void rejectsNotApplicableWithoutReason() {
        SessionAffectedApiService.Registration registration = new SessionAffectedApiService.Registration(
                "DELETE", "/api/legacy", "REMOVED", "src/LegacyController.java",
                null, null, "NOT_APPLICABLE", null, null, null);

        assertThatThrownBy(() -> service.register("session-1", List.of(registration)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("说明原因");
    }

    @Test
    void readinessRequiresEvidenceForEveryEntry() {
        when(repository.findBySessionId("session-1")).thenReturn(List.of(
                affected("PASSED"), affected("NOT_APPLICABLE")));
        assertThat(service.readiness("session-1").ready()).isTrue();

        when(repository.findBySessionId("session-1")).thenReturn(List.of(
                affected("PASSED"), affected("UNVERIFIED")));
        SessionAffectedApiService.Readiness readiness = service.readiness("session-1");
        assertThat(readiness.ready()).isFalse();
        assertThat(readiness.unverified()).isEqualTo(1);
    }

    private static SessionAffectedApiService.Registration registration(String method, String path) {
        return new SessionAffectedApiService.Registration(method, path, "MODIFIED",
                "src/OrderController.java", null, null, null, null, null, null);
    }

    private static SessionAffectedApi affected(String status) {
        return new SessionAffectedApi("id-" + status, "session-1", "GET", "/api/orders",
                "MODIFIED", "src/OrderController.java", null, null, status,
                "PASSED".equals(status) ? "AUTOMATED_TEST" : null, null,
                "PASSED".equals(status) ? "passed" : "NOT_APPLICABLE".equals(status) ? "removed endpoint" : null, 1, 1,
                "UNVERIFIED".equals(status) ? null : 1L);
    }
}
