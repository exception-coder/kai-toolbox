package com.exceptioncoder.toolbox.reqpool.service;

import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ReqEvaluationRefreshOrchestratorTest {

    @Test
    void refreshesPlanningAfterValueAnalysisCompletes() {
        ReqPlanningAssessmentTaskService planning = mock(ReqPlanningAssessmentTaskService.class);
        ReqEvaluationRefreshOrchestrator orchestrator =
                new ReqEvaluationRefreshOrchestrator(planning);

        orchestrator.refreshPlanningAfterInsight("item-1");

        verify(planning).refreshAfterInsight("item-1");
    }
}
