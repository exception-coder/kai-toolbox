package com.exceptioncoder.toolbox.integration;

import com.exceptioncoder.toolbox.prdclarify.spi.InitialSpecPlanningGateway;
import com.exceptioncoder.toolbox.prdclarify.spi.InitialSpecPlanningRequest;
import com.exceptioncoder.toolbox.reqpool.domain.ReqPlanningCommand;
import com.exceptioncoder.toolbox.reqpool.service.ReqPlanningAssessmentTaskService;
import org.springframework.stereotype.Component;

/** 在平台壳层连接规格探索与需求中枢规划能力。 */
@Component
public class InitialSpecPlanningIntegration implements InitialSpecPlanningGateway {

    private final ReqPlanningAssessmentTaskService taskService;

    public InitialSpecPlanningIntegration(ReqPlanningAssessmentTaskService taskService) {
        this.taskService = taskService;
    }

    @Override
    public void schedule(InitialSpecPlanningRequest request) {
        taskService.schedule(new ReqPlanningCommand(
                request.prdSessionId(), request.sourceReqItemId(), request.title(), request.rawInput(),
                request.project(), request.module(), request.reqType(), request.model(), request.engine(),
                request.initialSpec(), request.evidenceTraceJson()));
    }
}
