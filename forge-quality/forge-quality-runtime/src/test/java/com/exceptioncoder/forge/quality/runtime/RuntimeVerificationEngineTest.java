package com.exceptioncoder.forge.quality.runtime;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RuntimeVerificationEngineTest {
    @Test
    void emptyScenarioSetDoesNotClaimRuntimePassed() {
        RuntimeVerificationReport report = new RuntimeVerificationEngine(List.of()).verify(List.of());

        assertEquals(RuntimeStatus.FAILED, report.status());
        assertEquals("RUNTIME-000", report.results().getFirst().ruleId());
    }

    @Test
    void unsupportedScenarioTypeIsReported() {
        RuntimeScenario scenario = new RuntimeScenario("unknown", "queue", Map.of());

        RuntimeVerificationReport report = new RuntimeVerificationEngine(List.of()).verify(List.of(scenario));

        assertEquals(RuntimeStatus.FAILED, report.status());
        assertEquals("RUNTIME-001", report.results().getFirst().ruleId());
    }
}
