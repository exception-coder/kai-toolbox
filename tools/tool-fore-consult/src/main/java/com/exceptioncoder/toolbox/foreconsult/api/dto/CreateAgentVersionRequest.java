package com.exceptioncoder.toolbox.foreconsult.api.dto;

import com.exceptioncoder.toolbox.foreconsult.service.CreateAgentVersionCommand;

import java.util.List;

/**
 * 创建业务咨询 Agent 候选版本的 HTTP 请求。
 */
public record CreateAgentVersionRequest(
        String model,
        Double temperature,
        String promptRef,
        String orchestrationVersion,
        List<String> tools,
        List<String> mcpServers,
        List<String> skills,
        String evaluationRunId,
        Double evaluationScore,
        Boolean evaluationPassed
) {

    /**
     * 转换为应用层命令。
     *
     * @return 候选版本创建命令
     */
    public CreateAgentVersionCommand toCommand() {
        return new CreateAgentVersionCommand(
                model,
                temperature == null ? 0.1 : temperature,
                promptRef,
                orchestrationVersion,
                tools,
                mcpServers,
                skills,
                evaluationRunId,
                evaluationScore,
                Boolean.TRUE.equals(evaluationPassed));
    }
}

