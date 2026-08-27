package com.exceptioncoder.toolbox.reqpool.api.dto;

import com.exceptioncoder.toolbox.reqpool.domain.ReqInsightRun;

/** 前端恢复价值判定后台任务所需的最小状态。 */
public record ReqInsightRunView(
        String id,
        String status,
        String stage,
        String engine,
        String errorMessage,
        long startedAt,
        Long completedAt
) {
    public static ReqInsightRunView from(ReqInsightRun run) {
        return run == null ? null : new ReqInsightRunView(
                run.id(), run.status(), run.stage(), run.engine(), run.errorMessage(),
                run.startedAt(), run.completedAt());
    }
}
