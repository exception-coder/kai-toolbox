package com.exceptioncoder.toolbox.prdclarify.api.dto;

import com.exceptioncoder.toolbox.prdclarify.domain.PrdDiscoveryRun;

/** 前端轮询的后台探索运行视图，不暴露模型原始正文。 */
public record PrdDiscoveryRunView(
        String id,
        String sessionId,
        String status,
        String stage,
        int progress,
        int attempt,
        int maxAttempts,
        String criteriaVersion,
        String promptVersion,
        String vibeSessionId,
        String traceId,
        String evidenceTraceJson,
        String validationJson,
        String lastError,
        long startedAt,
        Long completedAt,
        long updatedAt
) {
    public static PrdDiscoveryRunView from(PrdDiscoveryRun run) {
        return new PrdDiscoveryRunView(
                run.id(), run.sessionId(), run.status(), run.stage(), run.progress(), run.attempt(),
                run.maxAttempts(), run.criteriaVersion(), run.promptVersion(), run.vibeSessionId(),
                run.traceId(), run.evidenceTraceJson(), run.validationJson(), run.lastError(), run.startedAt(),
                run.completedAt(), run.updatedAt());
    }
}
