package com.exceptioncoder.toolbox.prdclarify.service;

import com.exceptioncoder.toolbox.llm.spi.AgentOneShotRunner;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.function.Consumer;

/** 可版本化的需求规格分析 Agent 运行边界。 */
@Component
public class RequirementSpecificationAgent {

    public static final String AGENT_ID = "requirement-specification";
    public static final String ORCHESTRATION_VERSION = "v3";

    private final AgentOneShotRunner runner;

    public RequirementSpecificationAgent(AgentOneShotRunner runner) {
        this.runner = runner;
    }

    public AgentOneShotRunner.ObservedResult discover(
            AgentOneShotRunner.ExecutionRequest request,
            List<AgentOneShotRunner.ImageInput> images
    ) {
        return runner.runObserved(request, images);
    }

    public String generate(Request input, Consumer<String> chunkConsumer) {
        return runner.stream(input.systemPrompt(), input.userPrompt(), input.model(), input.engine(),
                chunkConsumer, input.images());
    }

    public record Request(String systemPrompt, String userPrompt, String model, String engine,
                          List<AgentOneShotRunner.ImageInput> images) {
        public Request {
            images = images == null ? List.of() : List.copyOf(images);
        }
    }
}
