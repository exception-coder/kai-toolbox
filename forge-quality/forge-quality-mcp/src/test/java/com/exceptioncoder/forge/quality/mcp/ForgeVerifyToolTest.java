package com.exceptioncoder.forge.quality.mcp;

import io.modelcontextprotocol.spec.McpSchema;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ForgeVerifyToolTest {
    @TempDir
    Path project;

    @Test
    void exposesOnlyUnifiedToolContract() {
        McpSchema.Tool specification = new ForgeVerifyTool().specification();

        assertEquals("forge_verify", specification.name());
        assertEquals(Boolean.FALSE, specification.inputSchema().get("additionalProperties"));
    }

    @Test
    void returnsStaticVerificationAsSuccessfulToolInvocation() throws IOException {
        Files.writeString(project.resolve("pom.xml"), "<project/>");

        McpSchema.CallToolResult result = new ForgeVerifyTool().call(Map.of(
                "project", project.toString(), "phase", "static"));

        assertFalse(result.isError());
        assertTrue(result.structuredContent() instanceof Map<?, ?>);
        assertEquals("PASSED", ((Map<?, ?>) result.structuredContent()).get("status"));
    }

    @Test
    void reportsInvalidInvocationAsToolError() {
        McpSchema.CallToolResult result = new ForgeVerifyTool().call(Map.of("phase", "unknown"));

        assertTrue(result.isError());
        assertEquals("ERROR", ((Map<?, ?>) result.structuredContent()).get("status"));
    }
}
