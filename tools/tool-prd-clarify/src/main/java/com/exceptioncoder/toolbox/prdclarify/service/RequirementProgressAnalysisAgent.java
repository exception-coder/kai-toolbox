package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import org.springframework.stereotype.Component;

import java.util.function.Consumer;

/** 可版本化的需求进度分析 Agent 运行边界。 */
@Component
public class RequirementProgressAnalysisAgent {

    public static final String AGENT_ID = "requirement-progress";
    public static final String ORCHESTRATION_VERSION = "v3";

    private final AgentOneShotRunner runner;

    public RequirementProgressAnalysisAgent(AgentOneShotRunner runner) {
        this.runner = runner;
    }

    public String analyze(Request input, Consumer<String> chunkConsumer) {
        AgentOneShotRunner.ExecutionRequest request = new AgentOneShotRunner.ExecutionRequest(
                input.systemPrompt(), input.userPrompt(), input.projectPath(), input.model(), input.engine(),
                "codex".equals(input.engine()) ? "medium" : null,
                null, null, null, null, AgentOneShotRunner.TOOL_POLICY_CONSULT_READONLY);
        return runner.stream(request, chunkConsumer);
    }

    public record Request(String systemPrompt, String userPrompt, String projectPath,
                          String model, String engine) {
    }
}
