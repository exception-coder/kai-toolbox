package com.exceptioncoder.toolbox.ops.api.dto;

/** 历史详情：含当次执行的结果快照（result 为 null 表示 DML/出错/超限未存）。 */
public record HistoryDetailView(
        String id,
        String datasourceId,
        String kind,
        String content,
        String status,
        Integer rowCount,
        Long elapsedMs,
        String errorMsg,
        Object result,
        long executedAt
) {}
