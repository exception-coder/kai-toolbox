package com.exceptioncoder.toolbox.eval.assertion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AssertionEngineTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final AssertionEngine engine = new AssertionEngine();

    @Test
    void evaluatesBusinessEvidenceAndTrajectoryDeterministically() throws Exception {
        JsonNode actual = mapper.readTree("""
                {
                  "answer":"根据采购订单规则，当前证据不足，无法确认数据根因。",
                  "evidence":[{"sourceType":"domain_knowledge","evidenceIds":["rule-1"]}],
                  "trajectory":{"toolCalls":2,"repeatedToolCalls":0,"sourceTypes":["domain_knowledge"]}
                }
                """);
        List<AssertionSpec> specs = List.of(
                spec(AssertionType.REQUIRED_FACT, "answer", mapper.getNodeFactory().textNode("采购订单规则")),
                spec(AssertionType.REQUIRED_SOURCE_TYPE, "trajectory.sourceTypes",
                        mapper.getNodeFactory().textNode("domain_knowledge")),
                spec(AssertionType.REQUIRED_EVIDENCE_ID, "evidence", mapper.getNodeFactory().textNode("rule-1")),
                spec(AssertionType.MAX_TOOL_CALLS, "trajectory.toolCalls", mapper.getNodeFactory().numberNode(3)),
                spec(AssertionType.NO_REPEATED_TOOL_CALL, "trajectory.repeatedToolCalls",
                        mapper.getNodeFactory().numberNode(0)),
                spec(AssertionType.MUST_DECLARE_INSUFFICIENT_EVIDENCE, "answer",
                        mapper.getNodeFactory().booleanNode(true)));

        AssertionEngine.Verdict verdict = engine.evaluate(actual, specs);

        assertThat(verdict.passed()).isTrue();
        assertThat(verdict.score()).isEqualTo(1.0);
    }

    @Test
    void doesNotPassMaxModelCallsWhenRuntimeCannotObserveModelCalls() throws Exception {
        JsonNode actual = mapper.readTree("{\"trajectory\":{\"modelCalls\":null}}");
        AssertionEngine.Verdict verdict = engine.evaluate(actual, List.of(
                spec(AssertionType.MAX_MODEL_CALLS, "trajectory.modelCalls", mapper.getNodeFactory().numberNode(4))));

        assertThat(verdict.passed()).isFalse();
        assertThat(verdict.outcomes().getFirst().message()).contains("不能推测通过");
    }

    private static AssertionSpec spec(AssertionType type, String path, JsonNode expected) {
        return new AssertionSpec(type.name(), path, expected, 1.0);
    }
}
