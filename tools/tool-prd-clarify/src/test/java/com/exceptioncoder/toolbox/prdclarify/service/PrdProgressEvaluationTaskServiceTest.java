package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdSession;
import com.exceptioncoder.toolbox.prdclarify.repository.PrdSessionRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PrdProgressEvaluationTaskServiceTest {

    @Test
    void reusesPersistedRunningTaskWithoutStartingAnotherEvaluation() {
        PrdSessionRepository repository = mock(PrdSessionRepository.class);
        PrdProgressEvaluationService evaluator = mock(PrdProgressEvaluationService.class);
        PrdSession running = PrdSession.builder().id("session-1").progressWorkStatus("RUNNING").build();
        when(repository.findById("session-1")).thenReturn(Optional.of(running));

        PrdProgressEvaluationTaskService service = new PrdProgressEvaluationTaskService(repository, evaluator);

        assertThat(service.start("session-1", null)).isSameAs(running);
        verify(evaluator, never()).evaluateSynchronously(any(), any(), any());
        verify(repository, never()).updateProgressWorkSnapshot(any(), any(), any(), any(), any(), any(), anyLong());
    }

    @Test
    void persistsCompletedStateAfterBackgroundEvaluation() {
        PrdSessionRepository repository = mock(PrdSessionRepository.class);
        PrdProgressEvaluationService evaluator = mock(PrdProgressEvaluationService.class);
        PrdSession idle = PrdSession.builder().id("session-1").build();
        PrdSession running = PrdSession.builder().id("session-1").progressWorkStatus("RUNNING").build();
        when(repository.findById("session-1")).thenReturn(Optional.of(idle), Optional.of(running));
        when(evaluator.evaluateSynchronously(eq("session-1"), eq("重点核对库存"), any()))
                .thenReturn("# report");

        PrdProgressEvaluationTaskService service = new PrdProgressEvaluationTaskService(repository, evaluator);
        assertThat(service.start("session-1", "重点核对库存").getProgressWorkStatus()).isEqualTo("RUNNING");

        verify(repository, timeout(3000)).updateProgressWorkSnapshot(
                eq("session-1"), eq("COMPLETED"), eq("本地代码分析已完成"), eq(null),
                anyLong(), anyLong(), anyLong());
    }

    @Test
    void convertsInterruptedTasksToRetryableErrorOnStartup() {
        PrdSessionRepository repository = mock(PrdSessionRepository.class);
        PrdProgressEvaluationTaskService service = new PrdProgressEvaluationTaskService(
                repository, mock(PrdProgressEvaluationService.class));

        service.run(null);

        verify(repository).failInterruptedProgressWork(any(), anyLong());
    }
}
