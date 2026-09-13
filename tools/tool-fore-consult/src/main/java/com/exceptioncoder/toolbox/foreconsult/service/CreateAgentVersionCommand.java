package com.exceptioncoder.toolbox.foreconsult.service;

import java.util.List;
import com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement.ConsultWorkflow;

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
        boolean evaluationPassed,
        ConsultWorkflow workflow
) {
    public CreateAgentVersionCommand(
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
        this(model, temperature, promptRef, orchestrationVersion, tools, mcpServers, skills, evaluationRunId, evaluationScore, evaluationPassed, null);
    }

}

