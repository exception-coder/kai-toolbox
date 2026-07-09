package com.exceptioncoder.toolbox.ops.api.dto;

import com.exceptioncoder.toolbox.ops.domain.QueryHistory;

public record HistoryView(
        String id,
        String datasourceId,
        String kind,
        String content,
        String status,
        Integer rowCount,
        Long elapsedMs,
        String errorMsg,
        boolean hasResult,
        long executedAt
) {
    public static HistoryView from(QueryHistory h) {
        return new HistoryView(
                h.getId(), h.getDatasourceId(), h.getKind(), h.getContent(), h.getStatus(),
                h.getRowCount(), h.getElapsedMs(), h.getErrorMsg(), h.isHasResult(), h.getExecutedAt());
    }
}
