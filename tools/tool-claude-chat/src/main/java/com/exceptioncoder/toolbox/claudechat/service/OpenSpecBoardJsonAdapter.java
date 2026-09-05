package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** 校验并适配 OpenSpec CLI 的结构化看板输出。 */
@Component
public class OpenSpecBoardJsonAdapter {

    private static final int SUPPORTED_MAJOR_VERSION = 1;
    private final ObjectMapper objectMapper;

    public OpenSpecBoardJsonAdapter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 解析并校验 context 输出。 */
    public JsonNode context(String output) {
        return object(output, "context");
    }

    /** 解析活动 change 列表。 */
    public List<JsonNode> changes(String output) {
        JsonNode root = object(output, "list");
        JsonNode changes = root.get("changes");
        if (changes == null || !changes.isArray()) {
            throw incompatible("list", "缺少 changes 数组");
        }
        List<JsonNode> result = new ArrayList<>();
        changes.forEach(change -> {
            if (!change.isObject() || change.path("name").asText().isBlank()) {
                throw incompatible("list", "change 缺少 name");
            }
            result.add(change);
        });
        return List.copyOf(result);
    }

    /** 解析并校验 status 输出。 */
    public JsonNode status(String output) {
        JsonNode root = object(output, "status");
        if (!root.path("artifactPaths").isObject()) {
            throw incompatible("status", "缺少 artifactPaths 对象");
        }
        return root;
    }

    /** 解析并校验 instructions apply 输出。 */
    public JsonNode apply(String output) {
        JsonNode root = object(output, "instructions apply");
        if (!root.path("tasks").isArray() || !root.path("progress").isObject()) {
            throw incompatible("instructions apply", "缺少 tasks 数组或 progress 对象");
        }
        return root;
    }

    private JsonNode object(String output, String command) {
        try {
            JsonNode root = objectMapper.readTree(output);
            if (root == null || !root.isObject()) {
                throw incompatible(command, "根节点不是对象");
            }
            validateVersion(root, command);
            return root;
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw incompatible(command, "JSON 无法解析", exception);
        }
    }

    private void validateVersion(JsonNode root, String command) {
        String version = root.path("version").asText(root.path("cliVersion").asText(""));
        if (version.isBlank()) {
            return;
        }
        String majorText = version.startsWith("v") ? version.substring(1).split("\\.")[0]
                : version.split("\\.")[0];
        try {
            if (Integer.parseInt(majorText) != SUPPORTED_MAJOR_VERSION) {
                throw incompatible(command, "不支持的 CLI 版本 " + version);
            }
        } catch (NumberFormatException exception) {
            throw incompatible(command, "无法识别 CLI 版本 " + version, exception);
        }
    }

    private IllegalArgumentException incompatible(String command, String reason) {
        return new IllegalArgumentException("OpenSpec " + command + " 输出不兼容：" + reason);
    }

    private IllegalArgumentException incompatible(String command, String reason, Exception cause) {
        return new IllegalArgumentException("OpenSpec " + command + " 输出不兼容：" + reason, cause);
    }
}
