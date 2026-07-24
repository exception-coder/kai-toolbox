package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * 进度评估请求体。
 *
 * @param extraContext 用户在确认弹框里补充的上下文（如"重点核对库存流水是否已实现"），可为空
 */
public record EvaluateProgressRequest(String extraContext) {
}
