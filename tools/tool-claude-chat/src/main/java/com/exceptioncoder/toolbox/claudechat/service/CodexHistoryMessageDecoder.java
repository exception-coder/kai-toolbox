package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

/** 兼容两种消息表示，排除启动上下文并在同一回合内匹配重复事件。 */
final class CodexHistoryMessageDecoder {
    private final Map<String, Boolean> unmatched = new HashMap<>();
    private boolean turnContextSeen;

    boolean hasTurnContext() {
        return turnContextSeen;
    }

    void observe(JsonNode node) {
        if ("task_started".equals(node.path("payload").path("type").asText())) {
            unmatched.clear();
            turnContextSeen = false;
        }
        if ("turn_context".equals(node.path("type").asText())) {
            turnContextSeen = true;
        }
    }

    boolean accept(JsonNode node, String role) {
        JsonNode payload = node.path("payload");
        boolean response = "response_item".equals(node.path("type").asText());
        if (response && (!turnContextSeen || !("user".equals(role) || "assistant".equals(role)))) {
            return false;
        }
        if (response && "analysis".equals(payload.path("channel").asText())) {
            return false;
        }
        String content = text(payload);
        if (content.isBlank()) {
            return false;
        }
        String key = role + ":" + digest(content);
        Boolean previous = unmatched.get(key);
        if (previous != null && previous != response) {
            unmatched.remove(key);
            return false;
        }
        unmatched.put(key, response);
        return true;
    }

    static String text(JsonNode payload) {
        if (!"message".equals(payload.path("type").asText())) {
            return payload.path("message").asText("");
        }
        StringBuilder content = new StringBuilder();
        for (JsonNode block : payload.path("content")) {
            String type = block.path("type").asText();
            if ("input_text".equals(type) || "output_text".equals(type)) {
                if (!content.isEmpty()) {
                    content.append('\n');
                }
                content.append(block.path("text").asText(""));
            }
        }
        return content.toString();
    }

    private String digest(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}
