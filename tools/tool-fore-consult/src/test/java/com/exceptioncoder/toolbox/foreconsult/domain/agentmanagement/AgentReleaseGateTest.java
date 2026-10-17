package com.exceptioncoder.toolbox.foreconsult.domain.agentmanagement;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AgentReleaseGateTest {

    @Test
    void failsClosedWithoutEvaluationAndAllowsQualifiedCandidate() {
        AgentVersion missingEvaluation = version(null, null, false);
        AgentVersion qualified = version("eval-1", 98.1, true,
                List.of("source_read"), List.of("consult-readonly"));

        assertThat(AgentReleaseGate.evaluate(missingEvaluation).releasable()).isFalse();
        assertThat(AgentReleaseGate.evaluate(qualified).releasable()).isTrue();
    }

    @Test
    void optionalEvaluationAllowsMissingFailedAndLowScoresWithoutRewritingEvidence() {
        AgentVersion missing = version(null, null, false);
        assertThat(AgentReleaseGate.evaluate(missing, false).releasable()).isTrue();
        assertThat(AgentReleaseGate.evaluate(missing, false).reason()).contains("未评测");
        assertThat(AgentReleaseGate.evaluate(version("failed", 10.0, false), false).releasable()).isTrue();
        assertThat(AgentReleaseGate.evaluate(version("low", 80.0, true), false).releasable()).isTrue();
        assertThat(missing.evaluationPassed()).isFalse();
        assertThat(AgentReleaseGate.evaluate(null, false).releasable()).isFalse();
        assertThat(AgentReleaseGate.evaluate(version(null, null, false,
                List.of("source_read"), List.of()), false).releasable()).isFalse();
        assertThat(AgentReleaseGate.evaluate(version(null, null, false,
                List.of("write_source"), List.of()), false).releasable()).isFalse();
    }

    @Test
    void rejectsUnknownCapabilityAndToolWithoutProviderBinding() {
        AgentVersion unknown = version("eval-1", 98.1, true, List.of("write_source"), List.of());
        AgentVersion missingProvider = version("eval-1", 98.1, true, List.of("source_read"), List.of());

        assertThat(AgentReleaseGate.evaluate(unknown).reason()).contains("未登记能力");
        assertThat(AgentReleaseGate.evaluate(missingProvider).reason()).contains("缺少提供方 MCP");
    }

    private AgentVersion version(String runId, Double score, boolean passed) {
        return version(runId, score, passed, List.of(), List.of());
    }

    private AgentVersion version(String runId, Double score, boolean passed,
                                 List<String> tools, List<String> mcpServers) {
        return new AgentVersion(
                2,
                "CANDIDATE",
                "gpt-5.6",
                0.1,
                "fore-consult-v4",
                "v4",
                tools,
                mcpServers,
                List.of(),
                runId,
                score,
                passed,
                0,
                null);
    }
}
