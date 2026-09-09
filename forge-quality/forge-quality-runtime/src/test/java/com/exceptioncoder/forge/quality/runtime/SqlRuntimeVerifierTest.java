package com.exceptioncoder.forge.quality.runtime;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SqlRuntimeVerifierTest {
    @Test
    void preparesBindsAndExecutesAgainstRealDatabase() {
        RuntimeScenario scenario = new RuntimeScenario("select-value", "sql", Map.of(
                "jdbcUrl", "jdbc:h2:mem:forge_quality;DB_CLOSE_DELAY=-1",
                "sql", "SELECT ? AS verified_value",
                "params", List.of(42)
        ));

        RuntimeVerificationResult result = new SqlRuntimeVerifier().verify(scenario);

        assertEquals(RuntimeStatus.PASSED, result.status());
        assertEquals("rowsObserved=1", result.evidence());
    }

    @Test
    void returnsDatabaseSyntaxErrorAsRuntimeEvidence() {
        RuntimeScenario scenario = new RuntimeScenario("bad-sql", "sql", Map.of(
                "jdbcUrl", "jdbc:h2:mem:forge_quality",
                "sql", "SELECT missing_column FROM missing_table"
        ));

        RuntimeVerificationResult result = new SqlRuntimeVerifier().verify(scenario);

        assertEquals(RuntimeStatus.FAILED, result.status());
        assertEquals("SQL-RUNTIME-001", result.ruleId());
    }

    @Test
    void rejectsMutationBeforeOpeningConnection() {
        RuntimeScenario scenario = new RuntimeScenario("unsafe", "sql", Map.of(
                "jdbcUrl", "jdbc:h2:mem:forge_quality",
                "sql", "UPDATE quote SET price = 1"
        ));

        assertThrows(IllegalArgumentException.class, () -> new SqlRuntimeVerifier().verify(scenario));
    }
}
