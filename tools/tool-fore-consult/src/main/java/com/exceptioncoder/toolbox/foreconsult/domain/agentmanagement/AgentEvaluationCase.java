package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

/** 评测用例的管理视图，不包含源码路径等执行上下文。 */
public record AgentEvaluationCase(
        String id,
        String title,
        String question,
        String coverage,
        String status
) {
}
