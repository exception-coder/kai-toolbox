package com.exceptioncoder.toolbox.eval.adapter;

import com.exceptioncoder.toolbox.eval.spi.EvalAdapter;
import com.exceptioncoder.toolbox.eval.assertion.AssertionSpec;
import com.exceptioncoder.toolbox.eval.assertion.AssertionType;
import com.exceptioncoder.toolbox.llm.spi.BusinessConsultEvaluationRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** End-to-end adapter for the real V1-V4 business consultation pipeline. */
@Component
public class BusinessConsultAdapter implements EvalAdapter {

    public static final String ID = "business-consult";
    public static final String SCENARIO = "business_consult";

    private final ObjectProvider<BusinessConsultEvaluationRunner> runnerProvider;
    private final ObjectMapper mapper;

    public BusinessConsultAdapter(ObjectProvider<BusinessConsultEvaluationRunner> runnerProvider,
                                  ObjectMapper mapper) {
        this.runnerProvider = runnerProvider;
        this.mapper = mapper;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public String scenario() {
        return SCENARIO;
    }

    @Override
    public Output run(Input input) {
        JsonNode payload = input.payload();
        BusinessConsultEvaluationRunner runner = runnerProvider.getIfAvailable();
        if (runner == null) {
            throw new IllegalStateException("BusinessConsultEvaluationRunner 不可用（tool-fore-consult 未装载）");
        }
        JsonNode context = payload.path("sessionContext");
        BusinessConsultEvaluationRunner.Result result = runner.run(new BusinessConsultEvaluationRunner.Input(
                payload.path("question").asText(""),
                payload.path("system").asText(""),
                text(context, "sourcePath"),
                strings(payload.path("modules")),
                payload.path("role").asText("IT"),
                textOrDefault(context, "orchestrationVersion", "v4"),
                input.model(),
                textOrDefault(context, "engine", "codex"),
                text(context, "codexHome"),
                textOrDefault(context, "reasoningEffort", "low"),
                textOrDefault(context, "speed", "default")));

        ObjectNode normalized = mapper.createObjectNode();
        normalized.put("answer", result.answer());
        putNullable(normalized, "traceId", result.traceId());
        normalized.set("evidence", result.evidence() == null ? mapper.createArrayNode() : result.evidence());
        normalized.set("trajectory", result.trajectory() == null ? unavailableTrajectory() : result.trajectory());
        return new Output(normalized, result.answer(), result.latencyMs());
    }

    @Override
    public List<AssertionSpec> deriveAssertions(JsonNode expected) {
        List<AssertionSpec> specs = new ArrayList<>();
        for (JsonNode fact : iterable(expected.path("requiredFacts"))) {
            JsonNode value = fact.isObject() ? fact.path("expected") : fact;
            if (!value.isMissingNode() && !value.isNull()) {
                specs.add(new AssertionSpec(AssertionType.REQUIRED_FACT.name(), "answer", value, 2.0));
            }
        }
        for (JsonNode value : iterable(expected.path("forbiddenClaims"))) {
            specs.add(new AssertionSpec(AssertionType.FORBIDDEN_CLAIM.name(), "answer", value, 2.0));
        }
        for (JsonNode value : iterable(expected.path("requiredSourceTypes"))) {
            specs.add(new AssertionSpec(AssertionType.REQUIRED_SOURCE_TYPE.name(),
                    "trajectory.sourceTypes", value, 1.0));
        }
        for (JsonNode value : iterable(expected.path("requiredEvidenceIds"))) {
            specs.add(new AssertionSpec(AssertionType.REQUIRED_EVIDENCE_ID.name(), "evidence", value, 1.0));
        }
        if (expected.has("minEvidenceCount")) {
            specs.add(new AssertionSpec(AssertionType.MIN_EVIDENCE_COUNT.name(),
                    "evidence", expected.get("minEvidenceCount"), 1.0));
        }
        if (expected.has("maxToolCalls")) {
            specs.add(new AssertionSpec(AssertionType.MAX_TOOL_CALLS.name(),
                    "trajectory.toolCalls", expected.get("maxToolCalls"), 0.5));
        }
        if (expected.has("maxModelCalls")) {
            specs.add(new AssertionSpec(AssertionType.MAX_MODEL_CALLS.name(),
                    "trajectory.modelCalls", expected.get("maxModelCalls"), 0.5));
        }
        if (expected.path("noRepeatedToolCall").asBoolean(false)) {
            specs.add(new AssertionSpec(AssertionType.NO_REPEATED_TOOL_CALL.name(),
                    "trajectory.repeatedToolCalls", mapper.getNodeFactory().numberNode(0), 0.5));
        }
        if (expected.path("mustStateInsufficientEvidence").asBoolean(false)) {
            specs.add(new AssertionSpec(AssertionType.MUST_DECLARE_INSUFFICIENT_EVIDENCE.name(),
                    "answer", mapper.getNodeFactory().booleanNode(true), 2.0));
        }
        return List.copyOf(specs);
    }

    private static Iterable<JsonNode> iterable(JsonNode node) {
        return node != null && node.isArray() ? node : List.of();
    }

    private ObjectNode unavailableTrajectory() {
        ObjectNode node = mapper.createObjectNode();
        node.putNull("modelCalls");
        node.put("modelCallObservation", "UNAVAILABLE");
        node.put("toolCalls", 0);
        node.put("repeatedToolCalls", 0);
        node.set("sourceTypes", mapper.createArrayNode());
        return node;
    }

    private static List<String> strings(JsonNode node) {
        List<String> result = new ArrayList<>();
        if (node.isArray()) {
            node.forEach(item -> { if (item.isTextual() && !item.asText().isBlank()) result.add(item.asText()); });
        }
        return List.copyOf(result);
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : value;
    }

    private static String textOrDefault(JsonNode node, String field, String fallback) {
        String value = text(node, field);
        return value == null ? fallback : value;
    }

    private static void putNullable(ObjectNode node, String field, String value) {
        if (value == null) node.putNull(field); else node.put(field, value);
    }
}
