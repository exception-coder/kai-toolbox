package com.exceptioncoder.toolbox.foreconsult.service;

import java.util.List;

/**
 * 创建业务咨询 Agent 候选版本的应用层命令。
 */
public record CreateAgentVersionCommand(
        String model,
        double temperature,
        String promptRef,
        String orchestrationVersion,
        List<String> tools,
        List<String> mcpServers,
        List<String> skills,
        String evaluationRunId,
        Double evaluationScore,
        boolean evaluationPassed
) {
}

