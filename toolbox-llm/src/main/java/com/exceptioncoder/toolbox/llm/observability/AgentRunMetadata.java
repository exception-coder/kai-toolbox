package com.exceptioncoder.toolbox.llm.observability;

import java.util.Map;

/** 由业务模块提供的低敏、受控 Agent 运行元数据。 */
public record AgentRunMetadata(
        String scope,
        String correlationId,
        Integer turnIndex,
        String engine,
        String model,
        Map<String, Object> attributes,
        TraceContext parentTraceContext
) {
    public AgentRunMetadata(String scope, String correlationId, Integer turnIndex,
                            String engine, String model, Map<String, Object> attributes) {
        this(scope, correlationId, turnIndex, engine, model, attributes, null);
    }

    public AgentRunMetadata {
        attributes = attributes == null ? Map.of() : Map.copyOf(attributes);
    }

    public static AgentRunMetadata generic(String scope, String correlationId, String engine, String model) {
        return new AgentRunMetadata(scope, correlationId, null, engine, model, Map.of());
    }

    public AgentRunMetadata withParent(TraceContext parent) {
        return new AgentRunMetadata(scope, correlationId, turnIndex, engine, model, attributes, parent);
    }
}
