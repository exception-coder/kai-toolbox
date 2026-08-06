package com.exceptioncoder.toolbox.foreconsult.service;

import com.exceptioncoder.toolbox.common.auth.web.AuthContext;
import com.exceptioncoder.toolbox.common.auth.web.AuthPrincipal;
import com.exceptioncoder.toolbox.foreconsult.api.dto.StartSessionRequest;
import com.exceptioncoder.toolbox.foreconsult.domain.ConsultSession;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultFeedbackRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultSessionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnExtractionRepository;
import com.exceptioncoder.toolbox.foreconsult.repository.ConsultTurnRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ConsultServiceAccessTest {

    private final ConsultSessionRepository sessionRepo = mock(ConsultSessionRepository.class);
    private final ConsultTurnRepository turnRepo = mock(ConsultTurnRepository.class);
    private final ConsultFeedbackRepository feedbackRepo = mock(ConsultFeedbackRepository.class);
    private final ConsultTurnExtractionRepository extractionRepo = mock(ConsultTurnExtractionRepository.class);
    private final ConsultService service =
            new ConsultService(sessionRepo, turnRepo, feedbackRepo, extractionRepo);

    @AfterEach
    void clearAuthContext() {
        AuthContext.clear();
    }

    @Test
    void regularUserListsOnlyOwnSessions() {
        authenticate(7L, "yuy", "USER");
        ConsultSession own = session("own", "7");
        when(sessionRepo.findRecentByUserId("7", 50)).thenReturn(List.of(own));

        assertThat(service.listRecent(50)).containsExactly(own);
        verify(sessionRepo).findRecentByUserId("7", 50);
        verify(sessionRepo, never()).findRecent(50);
    }

    @Test
    void adminListsAllSessions() {
        authenticate(1L, "admin", "ADMIN");
        ConsultSession other = session("other", "7");
        when(sessionRepo.findRecent(50)).thenReturn(List.of(other));

        assertThat(service.listRecent(50)).containsExactly(other);
        verify(sessionRepo).findRecent(50);
        verify(sessionRepo, never()).findRecentByUserId("1", 50);
    }

    @Test
    void regularUserCannotReadAnotherUsersSession() {
        authenticate(7L, "yuy", "USER");
        when(sessionRepo.findById("other")).thenReturn(Optional.of(session("other", "8")));

        assertThatThrownBy(() -> service.get("other"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value())
                        .isEqualTo(404));
    }

    @Test
    void adminCanReadAnotherUsersSession() {
        authenticate(1L, "admin", "ADMIN");
        ConsultSession other = session("other", "8");
        when(sessionRepo.findById("other")).thenReturn(Optional.of(other));

        assertThat(service.get("other")).isSameAs(other);
    }

    @Test
    void newSessionAlwaysUsesAuthenticatedUserId() {
        authenticate(7L, "yuy", "USER");
        StartSessionRequest request =
                new StartSessionRequest(
                        "ERP", "D:\\erp", List.of(), "260806-采购退货单入口", "question", "forged-user", "BIZ");

        service.startSession(request, "server-built-prompt");

        ArgumentCaptor<ConsultSession> captor = ArgumentCaptor.forClass(ConsultSession.class);
        verify(sessionRepo).insert(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo("7");
        assertThat(captor.getValue().getQuestionTitle()).isEqualTo("260806-采购退货单入口");
        assertThat(captor.getValue().getPromptSnapshot()).isEqualTo("server-built-prompt");
    }

    @Test
    void renameQuestionTitlePreservesExistingDatePrefix() {
        authenticate(7L, "yuy", "USER");
        ConsultSession existing = session("own", "7");
        existing.setQuestionTitle("260805-旧标题");
        when(sessionRepo.findById("own")).thenReturn(Optional.of(existing));

        ConsultSession updated = service.renameQuestionTitle("own", "新标题");

        assertThat(updated.getQuestionTitle()).isEqualTo("260805-新标题");
        verify(sessionRepo).updateQuestionTitle("own", "260805-新标题");
    }

    @Test
    void renameLegacyQuestionTitleAddsUtcDatePrefixFromCreatedAt() {
        authenticate(7L, "yuy", "USER");
        ConsultSession existing = session("own", "7");
        existing.setQuestionTitle("旧标题");
        existing.setCreatedAt(1_775_347_200_000L);
        when(sessionRepo.findById("own")).thenReturn(Optional.of(existing));

        ConsultSession updated = service.renameQuestionTitle("own", "新标题");

        assertThat(updated.getQuestionTitle()).isEqualTo("260405-新标题");
        verify(sessionRepo).updateQuestionTitle("own", "260405-新标题");
    }

    private static void authenticate(long userId, String username, String role) {
        AuthContext.set(new AuthPrincipal(
                userId, username, List.of(role), List.of(), "jti", System.currentTimeMillis() + 60_000));
    }

    private static ConsultSession session(String sessionId, String userId) {
        return ConsultSession.builder()
                .sessionId(sessionId)
                .userId(userId)
                .systemName("ERP")
                .systemSourcePath("D:\\erp")
                .archiveStatus("PENDING")
                .createdAt(System.currentTimeMillis())
                .build();
    }
}
