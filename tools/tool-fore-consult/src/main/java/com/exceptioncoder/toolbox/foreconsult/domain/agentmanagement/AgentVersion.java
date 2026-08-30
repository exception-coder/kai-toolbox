package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import java.util.List;

/**
 * 业务咨询 Agent 的不可变配置版本快照。
 */
public record AgentVersion(
        long version,
        String status,
        String model,
        double temperature,
        String promptRef,
        String orchestrationVersion,
        List<String> tools,
        List<String> mcpServers,
        List<String> skills,
        String evaluationRunId,
        Double evaluationScore,
        boolean evaluationPassed,
        long createdAt,
        Long releasedAt
) {
}

