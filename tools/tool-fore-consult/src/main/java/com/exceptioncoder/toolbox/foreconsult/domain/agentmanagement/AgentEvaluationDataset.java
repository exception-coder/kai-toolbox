package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.List;

/** Agent 管理页可安全展示的评测数据集摘要。 */
public record AgentEvaluationDataset(
        String id,
        String name,
        String baselineStatus,
        List<AgentEvaluationCase> cases
) {
}
