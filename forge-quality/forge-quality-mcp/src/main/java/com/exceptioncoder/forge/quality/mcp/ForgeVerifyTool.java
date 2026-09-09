package com.exceptioncoder.forge.quality.mcp;

import com.exceptioncoder.forge.quality.application.ForgeVerificationService;
import com.exceptioncoder.forge.quality.application.VerificationPhase;
import com.exceptioncoder.forge.quality.application.VerificationReport;
import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.json.TypeRef;
import io.modelcontextprotocol.spec.McpSchema;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/** Implements the single agent-facing Forge Verification MCP tool. */
final class ForgeVerifyTool {
    static final String NAME = "forge_verify";
    private static final TypeRef<Map<String, Object>> MAP_TYPE = new TypeRef<>() { };

    private final ForgeVerificationService service;
    private final McpJsonMapper jsonMapper;

    ForgeVerifyTool() {
        this(new ForgeVerificationService());
    }

    ForgeVerifyTool(ForgeVerificationService service) {
        this.service = service;
        this.jsonMapper = McpJsonDefaults.getMapper();
    }

    McpSchema.Tool specification() {
        return McpSchema.Tool.builder(NAME)
                .description("Run Forge static and/or runtime verification for a project. "
                        + "The default all phase runs Static first and Runtime only after Static passes.")
                .inputSchema(inputSchema())
                .build();
    }

    McpSchema.CallToolResult call(Map<String, Object> arguments) {
        try {
            String project = requiredProject(arguments);
            VerificationPhase phase = VerificationPhase.parse(optionalText(arguments, "phase"));
            VerificationReport report = service.verify(Path.of(project), phase);
            Map<String, Object> structured = jsonMapper.convertValue(report, MAP_TYPE);
            return McpSchema.CallToolResult.builder()
                    .addTextContent(jsonMapper.writeValueAsString(report))
                    .structuredContent(structured)
                    .isError(false)
                    .build();
        } catch (IllegalArgumentException | IOException exception) {
            return errorResult(exception.getMessage());
        }
    }

    private McpSchema.CallToolResult errorResult(String message) {
        Map<String, Object> error = Map.of("status", "ERROR", "message", message);
        try {
            return McpSchema.CallToolResult.builder().addTextContent(jsonMapper.writeValueAsString(error))
                    .structuredContent(error).isError(true).build();
        } catch (IOException exception) {
            return McpSchema.CallToolResult.builder().addTextContent(message).isError(true).build();
        }
    }

    private static String requiredProject(Map<String, Object> arguments) {
        String project = optionalText(arguments, "project");
        if (project == null || project.isBlank()) {
            throw new IllegalArgumentException("project must be a non-empty path");
        }
        return project;
    }

    private static String optionalText(Map<String, Object> arguments, String name) {
        Object value = arguments == null ? null : arguments.get(name);
        if (value == null) {
            return null;
        }
        if (!(value instanceof String text)) {
            throw new IllegalArgumentException(name + " must be text");
        }
        return text;
    }

    private static Map<String, Object> inputSchema() {
        Map<String, Object> project = Map.of("type", "string", "description", "Absolute or relative project path");
        Map<String, Object> phase = Map.of("type", "string", "enum", List.of("static", "runtime", "all"),
                "default", "all", "description", "Verification phase");
        return Map.of("type", "object", "properties", Map.of("project", project, "phase", phase),
                "required", List.of("project"), "additionalProperties", false);
    }
}
