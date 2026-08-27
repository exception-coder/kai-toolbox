package com.exceptioncoder.toolbox.reqpool.domain;

/** 单条价值判定的可恢复后台运行快照。 */
public record ReqInsightRun(
        String id,
        String itemId,
        String titleSnapshot,
        String descriptionSnapshot,
        String projectSnapshot,
        String moduleSnapshot,
        String sourceHash,
        String evidenceTraceJson,
        String engine,
        String status,
        String stage,
        String errorMessage,
        long startedAt,
        Long completedAt,
        long createdAt,
        long updatedAt
) {
}
