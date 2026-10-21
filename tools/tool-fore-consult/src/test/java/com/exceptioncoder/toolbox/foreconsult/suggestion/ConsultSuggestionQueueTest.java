package com.exceptioncoder.toolbox.foreconsult.suggestion;

import com.exceptioncoder.toolbox.common.requirement.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import java.nio.file.Path;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ConsultSuggestionQueueTest {
    @TempDir Path directory;
    ConsultSuggestionRepository suggestions;
    ConsultSuggestionWorkRepository work;
    ConsultSuggestionReview review;
    ConsultSuggestionPatch patch;
    RequirementRegistrationPort registration;
    ConsultSuggestionQueue queue;

    @BeforeEach @SuppressWarnings("unchecked") void setup() {
        var ds = new DriverManagerDataSource("jdbc:sqlite:" + directory.resolve("queue.db"));
        new ResourceDatabasePopulator(new ClassPathResource("db/consult-suggestion-schema.sql"), new ClassPathResource("db/consult-suggestion-work-schema.sql")).execute(ds);
        suggestions = new ConsultSuggestionRepository(new JdbcTemplate(ds)); work = new ConsultSuggestionWorkRepository(new JdbcTemplate(ds));
        review = mock(ConsultSuggestionReview.class); patch = mock(ConsultSuggestionPatch.class); registration = mock(RequirementRegistrationPort.class);
        ObjectProvider<RequirementRegistrationPort> provider = mock(ObjectProvider.class); when(provider.getIfAvailable()).thenReturn(registration);
        when(registration.registerPendingExecutionOnce(anyString(), any())).thenReturn("task-1");
        queue = new ConsultSuggestionQueue(suggestions, work, review, patch, provider, new DataSourceTransactionManager(ds));
    }
    @AfterEach void close() { queue.close(); }

    ConsultSuggestion create(boolean enqueue) {
        String key = UUID.randomUUID().toString();
        suggestions.insert(7, new ConsultSuggestion.Submit(key, "原始建议", new ConsultSuggestion.Draft("建议", "阅读不方便", "改善阅读", "可以阅读")));
        var saved = suggestions.find(7, key).orElseThrow();
        if (enqueue) work.enqueue(saved.id());
        return saved;
    }

    @Test void reviewsBeforeQueueAndExecutesOnceWithActualCommitResult() throws Exception {
        var saved = create(true);
        when(review.review(any())).thenReturn(new ConsultSuggestionReview.Result(ConsultSuggestionReview.Decision.ACCEPT_SIMPLE, "仅调整阅读展示"));
        when(patch.develop(any())).thenReturn(new ConsultSuggestionPatch.Result("a".repeat(40), "待合并"));
        queue.consumeOne();
        assertThat(suggestions.findById(saved.id()).orElseThrow().state()).isEqualTo("QUEUED");
        verifyNoInteractions(patch);
        queue.consumeOne(); queue.consumeOne();
        var completed = suggestions.findById(saved.id()).orElseThrow();
        assertThat(completed.state()).isEqualTo("COMMITTED"); assertThat(completed.requirementId()).isEqualTo("task-1");
        assertThat(completed.commitHash()).isEqualTo("a".repeat(40));
        verify(patch, times(1)).develop(any());
        verify(registration, times(1)).registerPendingExecutionOnce(eq("consult-suggestion:" + saved.id()), any());
    }

    @Test void scopeAndPermissionRejectionsNeverReachDevelopment() throws Exception {
        for (var decision : List.of(ConsultSuggestionReview.Decision.REJECT_SCOPE, ConsultSuggestionReview.Decision.REJECT_PERMISSION)) {
            var saved = create(true);
            when(review.review(any())).thenReturn(new ConsultSuggestionReview.Result(decision, "不属于可接收范围"));
            queue.consumeOne();
            assertThat(suggestions.findById(saved.id()).orElseThrow().state()).isEqualTo("REJECTED");
        }
        verifyNoInteractions(registration, patch);
    }

    @Test void failuresStayClosedAndOnlyOwnerCanRetryReview() throws Exception {
        var saved = create(true);
        when(review.review(any())).thenThrow(new IllegalArgumentException("bad model"));
        queue.consumeOne();
        assertThat(suggestions.findById(saved.id()).orElseThrow().state()).isEqualTo("REVIEW_FAILED");
        assertThat(work.retryReview(saved.id(), 8)).isFalse(); assertThat(work.retryReview(saved.id(), 7)).isTrue();
        doReturn(new ConsultSuggestionReview.Result(ConsultSuggestionReview.Decision.ACCEPT_COMPLEX, "需要设计交互")).when(review).review(any());
        queue.consumeOne(); queue.consumeOne();
        assertThat(suggestions.findById(saved.id()).orElseThrow().state()).isEqualTo("MANUAL_QUEUED");
        verifyNoInteractions(patch);
    }

    @Test void registrationFailureAndRestartDoNotLoseOrAutoRunOldSuggestions() throws Exception {
        var legacy = create(false); var saved = create(true);
        when(review.review(any())).thenReturn(new ConsultSuggestionReview.Result(ConsultSuggestionReview.Decision.ACCEPT_SIMPLE, "展示改进"));
        when(registration.registerPendingExecutionOnce(anyString(), any())).thenThrow(new IllegalStateException("down"));
        queue.consumeOne();
        assertThat(suggestions.findById(saved.id()).orElseThrow().requirementId()).isNull();
        assertThat(suggestions.findById(saved.id()).orElseThrow().state()).isEqualTo("REVIEW_FAILED");
        assertThat(suggestions.findById(legacy.id()).orElseThrow().state()).isEqualTo("PENDING_REVIEW");
        work.finish(saved.id(), "RUNNING", "", null, null); work.recoverInterrupted();
        assertThat(suggestions.findById(saved.id()).orElseThrow().state()).isEqualTo("FAILED");
        verifyNoInteractions(patch);
    }

    @Test void invalidReviewAndPathTraversalNeverFallThrough() throws Exception {
        var model = mock(ConsultSuggestionModel.class);
        when(model.ask(anyString(), any())).thenReturn(new ObjectMapper().readTree("{\"decision\":\"ALLOW_ALL\",\"reason\":\"approved\"}"));
        assertThatThrownBy(() -> new ConsultSuggestionReview(model).review(create(false))).isInstanceOf(IllegalArgumentException.class);
        var patchJson = new ObjectMapper().readTree("{\"outcome\":\"PATCH\",\"edits\":[{\"path\":\"../../admin.ts\",\"before\":\"x\",\"after\":\"y\"}]}");
        assertThatThrownBy(() -> ConsultSuggestionPatch.apply(directory, Map.of(), patchJson)).hasMessageContaining("范围");
        verifyNoInteractions(patch);
    }
}
