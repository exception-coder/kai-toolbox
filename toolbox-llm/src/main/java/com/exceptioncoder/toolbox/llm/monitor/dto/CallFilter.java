package com.exceptioncoder.toolbox.llm.monitor.dto;

/** /calls 查询过滤条件，各字段可空。 */
public record CallFilter(
        Long fromMs,
        Long toMs,
        String status,
        String modelId,
        String toolId) {
}
