package com.exceptioncoder.toolbox.llm.spi;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/** Production consultation capability exposed to tool-eval without reversing module dependencies. */
public interface BusinessConsultEvaluationRunner {

    Result run(Input input);

    record Input(
            String question,
            String system,
            String sourcePath,
            List<String> modules,
            String role,
            String orchestrationVersion,
            String model,
            String engine,
            String codexHome,
            String reasoningEffort,
            String speed
    ) {
    }

    record Result(String answer, String traceId, JsonNode evidence, JsonNode trajectory, long latencyMs) {
    }
}
