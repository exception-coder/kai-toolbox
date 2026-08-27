package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.reqpool.domain.ReqInsight;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightRun;
import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightType;
import com.exceptioncoder.toolbox.reqpool.domain.ReqItem;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqInsightRunRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqItemRepository;
import com.exceptioncoder.toolbox.reqpool.repository.ReqPlanningAssessmentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.core.task.AsyncTaskExecutor;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReqInsightTaskServiceTest {

    private final ReqInsightRunRepository runs = mock(ReqInsightRunRepository.class);
    private final ReqInsightRepository insights = mock(ReqInsightRepository.class);
    private final ReqItemRepository items = mock(ReqItemRepository.class);
    private final ReqPlanningAssessmentRepository planning = mock(ReqPlanningAssessmentRepository.class);
    private final ReqInsightApplicationService application = mock(ReqInsightApplicationService.class);
    private final ReqProjectEvidenceService projectEvidence = mock(ReqProjectEvidenceService.class);
    private final ReqInsightFingerprint fingerprint = new ReqInsightFingerprint();
    private final ReqEvaluationRefreshOrchestrator refresh = mock(ReqEvaluationRefreshOrchestrator.class);
    private final AsyncTaskExecutor executor = mock(AsyncTaskExecutor.class);
    private final ReqInsightTaskService service = new ReqInsightTaskService(
            runs, insights, items, planning, application, projectEvidence, fingerprint, refresh, executor);

    @Test
    void reusesActiveRunWithoutSubmittingAnotherTask() {
        ReqItem item = item();
        ReqInsightRun active = run(item, "running-1");
        when(runs.findActiveByItemId(item.getId())).thenReturn(Optional.of(active));

        assertThat(service.schedule(item, "claude")).isSameAs(active);

        verify(runs, never()).insert(any());
        verify(executor, never()).execute(any(Runnable.class));
    }

    @Test
    void recoveryCompletesPersistedInsightWithoutCallingModelAgain() {
        ReqItem item = item();
        ReqInsightRun run = run(item, "run-1");
        ReqInsight insight = new ReqInsight(
                run.id(), item.getId(), ReqInsightType.ITEM, "req-item-v1", run.sourceHash(), null,
                "{}", run.evidenceTraceJson(), "codex", null, 2L);
        when(runs.findById(run.id())).thenReturn(Optional.of(run));
        when(insights.findById(run.id())).thenReturn(Optional.of(insight));
        when(items.findById(item.getId())).thenReturn(Optional.of(item));

        service.execute(run.id());

        verify(application, never()).analyzeItem(any(), any(), any(), any());
        verify(runs).complete(org.mockito.ArgumentMatchers.eq(run.id()), any(Long.class));
        verify(refresh).refreshPlanningAfterInsight(item.getId());
    }

    private ReqInsightRun run(ReqItem item, String id) {
        return new ReqInsightRun(id, item.getId(), item.getTitle(), item.getDescription(),
                item.getProject(), item.getModule(), fingerprint.sourceHash(item), "{\"sources\":[]}",
                "codex", "RUNNING", "ANALYZING", null, 1L, null, 1L, 1L);
    }

    private static ReqItem item() {
        return ReqItem.builder().id("item-1").title("新品进度").description("统一进度")
                .project("yoooni-one").module("大货跟单").build();
    }
}
