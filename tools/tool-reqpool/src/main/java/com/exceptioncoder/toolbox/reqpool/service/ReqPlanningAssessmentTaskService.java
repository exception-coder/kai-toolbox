package com.exceptioncoder.toolbox.reqpool.service;

import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningAssessment;
import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningCommand;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.stereotype.Service;

/** 规划评估的快速登记与后台执行入口。 */
@Service
public class ReqPlanningAssessmentTaskService {

    private final ReqPlanningAssessmentService assessmentService;
    private final AsyncTaskExecutor taskExecutor;

    public ReqPlanningAssessmentTaskService(
            ReqPlanningAssessmentService assessmentService,
            AsyncTaskExecutor taskExecutor
    ) {
        this.assessmentService = assessmentService;
        this.taskExecutor = taskExecutor;
    }

    /** 登记并在应用任务执行器中启动规划评估。 */
    public ReqPlanningAssessment schedule(ReqPlanningCommand command) {
        ReqPlanningAssessmentService.PreparedAssessment prepared = assessmentService.prepare(command);
        executeIfCreated(prepared);
        return prepared.assessment();
    }

    /** 基于需求最近一次输入快照重试失败的规划评估。 */
    public ReqPlanningAssessment retry(String itemId) {
        ReqPlanningAssessmentService.PreparedAssessment prepared = assessmentService.prepare(
                assessmentService.retryCommand(itemId));
        executeIfCreated(prepared);
        return prepared.assessment();
    }

    private void executeIfCreated(ReqPlanningAssessmentService.PreparedAssessment prepared) {
        if (prepared.created()) {
            taskExecutor.execute(() -> assessmentService.execute(prepared.assessment().getId()));
        }
    }
}
