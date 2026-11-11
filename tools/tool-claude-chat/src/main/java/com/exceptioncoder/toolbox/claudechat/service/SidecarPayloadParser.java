package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ClaudeSessionOptions;
import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

/**
 * Sidecar 事件载荷到会话 DTO 的纯转换：MCP 目录、Skill / 插件能力、来源证据、后台任务等。
 *
 * <p>无状态、不依赖 ObjectMapper；从 ClaudeChatService 拆出，旧 Sidecar 缺少字段时保持兼容。</p>
 */
final class SidecarPayloadParser {

    private SidecarPayloadParser() { }

    static List<String> parseStringList(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<String> out = new ArrayList<>();
        n.forEach(e -> { if (e != null && e.isTextual()) out.add(e.asText()); });
        return out;
    }

    /** 解析 init 的 MCP 运行时目录；旧 Sidecar 缺少扩展字段时保持兼容。 */
    static List<ServerMessage.McpServer> parseMcpServers(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<ServerMessage.McpServer> out = new ArrayList<>();
        for (JsonNode e : n) {
            if (e != null && e.isObject()) {
                List<ServerMessage.McpTool> tools = new ArrayList<>();
                JsonNode toolNodes = e.path("tools");
                if (toolNodes.isArray()) {
                    for (JsonNode tool : toolNodes) {
                        if (tool.isObject()) {
                            tools.add(new ServerMessage.McpTool(
                                    tool.path("name").asText(""), tool.path("title").asText(null),
                                    tool.path("description").asText(null),
                                    parseCapabilityProvenance(tool.get("provenance"))));
                        }
                    }
                }
                out.add(new ServerMessage.McpServer(
                        e.path("name").asText(""), e.path("status").asText(""),
                        e.path("runtimeStatus").asText(null), e.path("authStatus").asText(null),
                        e.path("pluginId").asText(null), e.path("serverTitle").asText(null),
                        e.path("serverVersion").asText(null), e.path("verified").asBoolean(false),
                        e.path("toolInventoryComplete").asBoolean(false), List.copyOf(tools),
                        parseCapabilityProvenance(e.get("provenance"))));
            }
        }
        return out;
    }

    static List<ServerMessage.SkillCapability> parseSkillCapabilities(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<ServerMessage.SkillCapability> out = new ArrayList<>();
        for (JsonNode e : n) {
            if (e != null && e.isObject()) {
                out.add(new ServerMessage.SkillCapability(
                        e.path("name").asText(""), e.path("description").asText(""),
                        e.path("enabled").asBoolean(true), e.path("scope").asText("unknown"),
                        e.path("pluginId").asText(null), e.path("path").asText(null),
                        e.path("version").asText(null), e.path("contentFingerprint").asText(null),
                        parseStringList(e.get("toolDependencies")),
                        parseCapabilityProvenance(e.get("provenance"))));
            }
        }
        return out;
    }

    static List<ServerMessage.PluginCapability> parsePluginCapabilities(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<ServerMessage.PluginCapability> out = new ArrayList<>();
        for (JsonNode e : n) {
            if (e != null && e.isObject()) {
                out.add(new ServerMessage.PluginCapability(
                        e.path("id").asText(""), e.path("name").asText(""),
                        e.path("marketplace").asText(null), e.path("installed").asBoolean(false),
                        e.path("enabled").asBoolean(false), e.path("localVersion").asText(null),
                        e.path("remoteVersion").asText(null), e.path("updateAvailable").asBoolean(false),
                        parseCapabilityProvenance(e.get("provenance"))));
            }
        }
        return out;
    }

    /** 解析逐项来源证据；旧 Sidecar 没有该字段时返回空集合。 */
    static List<ServerMessage.CapabilityProvenance> parseCapabilityProvenance(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<ServerMessage.CapabilityProvenance> out = new ArrayList<>();
        for (JsonNode e : n) {
            if (e != null && e.isObject()) {
                out.add(new ServerMessage.CapabilityProvenance(
                        e.path("origin").asText("unknown"), e.path("scope").asText("unknown"),
                        e.path("sourceId").asText(null), e.path("effective").asBoolean(false),
                        e.path("evidence").asText("configuration")));
            }
        }
        return List.copyOf(out);
    }

    /** 解析 sidecar 的 backgroundTasks 数组（{taskId,taskType,description}）。 */
    static List<ServerMessage.BackgroundTaskInfo> parseBackgroundTasks(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<ServerMessage.BackgroundTaskInfo> out = new ArrayList<>();
        for (JsonNode e : n) {
            if (e != null && e.isObject()) {
                out.add(new ServerMessage.BackgroundTaskInfo(
                        e.path("taskId").asText(""), e.path("taskType").asText(""), e.path("description").asText("")));
            }
        }
        return out;
    }

    /** 解析 SDK supportedModels 数组（{value, displayName, description, …}）为前端 ModelInfo。 */
    static List<ModelInfo> parseModels(JsonNode n) {
        if (n == null || !n.isArray()) return List.of();
        List<ModelInfo> out = new ArrayList<>();
        for (JsonNode e : n) {
            String value = e.path("value").asText(null);
            if (value == null || value.isBlank()) continue;
            List<String> efforts = new ArrayList<>();
            JsonNode effortNodes = e.path("reasoningEfforts");
            if (effortNodes.isArray()) effortNodes.forEach(item -> efforts.add(item.asText()));
            List<String> claudeEfforts = new ArrayList<>();
            JsonNode claudeEffortNodes = e.path("supportedEffortLevels");
            if (claudeEffortNodes.isArray()) claudeEffortNodes.forEach(item -> {
                if (ClaudeSessionOptions.isEffort(item.asText()) && !"auto".equals(item.asText())) claudeEfforts.add(item.asText());
            });
            out.add(new ModelInfo(value, e.path("displayName").asText(value), e.path("description").asText(""),
                    efforts, e.path("defaultReasoningEffort").asText(null),
                    e.path("fastSupported").isBoolean() ? e.path("fastSupported").asBoolean() : null,
                    e.path("isDefault").asBoolean(false),
                    e.path("supportsEffort").isBoolean() ? e.path("supportsEffort").asBoolean() : null, claudeEfforts,
                    e.path("resolvedModel").asText(null)));
        }
        return out;
    }
}
