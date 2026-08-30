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
