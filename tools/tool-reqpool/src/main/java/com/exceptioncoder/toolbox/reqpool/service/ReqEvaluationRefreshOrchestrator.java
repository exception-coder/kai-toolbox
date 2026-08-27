package com.exceptioncoder.toolbox.reqpool.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/** 串联价值判定与正式规划，使两阶段共享同一版冻结结论。 */
@Slf4j
@Service
public class ReqEvaluationRefreshOrchestrator {

    private final ReqPlanningAssessmentTaskService planningTaskService;

    public ReqEvaluationRefreshOrchestrator(ReqPlanningAssessmentTaskService planningTaskService) {
        this.planningTaskService = planningTaskService;
    }

    /** 后台价值判定完成后刷新已有规划；规划登记异常不回滚已成功的价值判定。 */
    public void refreshPlanningAfterInsight(String itemId) {
        try {
            planningTaskService.refreshAfterInsight(itemId);
        } catch (RuntimeException error) {
            log.warn("[reqpool-evaluation] 价值判定已完成，但规划刷新登记失败 itemId={}",
                    itemId, error);
        }
    }
}
