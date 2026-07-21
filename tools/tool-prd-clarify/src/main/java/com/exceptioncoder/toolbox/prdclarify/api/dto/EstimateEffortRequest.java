package com.exceptioncoder.toolbox.prdclarify.api.dto;

/**
 * AI 工时评估请求体。
 *
 * @param extraContext 用户在确认弹框里补充的上下文（如团队人力、技术栈熟悉度），可为空
 */
public record EstimateEffortRequest(String extraContext) {
}
