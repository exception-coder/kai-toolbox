package com.exceptioncoder.toolbox.prdclarify.domain;

/** 一次可恢复的初始化规格后台探索运行。 */
public record PrdDiscoveryRun(
        String id,
        String sessionId,
        String status,
        String stage,
        int progress,
        int attempt,
        int maxAttempts,
        String criteriaVersion,
        String promptVersion,
        String inputHash,
        String engine,
        String model,
        String vibeSessionId,
        String traceId,
        String evidenceTraceJson,
        String lastOutput,
        String validationJson,
        String lastError,
        long startedAt,
        Long completedAt,
        long createdAt,
        long updatedAt
) {
}
