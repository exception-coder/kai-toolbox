package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Set;

/** 当前轮的原生进度证据，不替代 Sidecar 清理及发送门禁。 */
public record NativeSessionStatus(String source, String state, String turnId,
                                  Integer attempt, Integer maxAttempts, Long retryDelayMs) {
    private static final Set<String> STATES = Set.of("running", "idle", "awaitingApproval", "awaitingInput",
            "requiresAction", "retrying", "unavailable", "failed");

    public static NativeSessionStatus read(JsonNode node, String activeTurnId) {
        if (node == null || activeTurnId == null || !activeTurnId.equals(node.path("turnId").asText())
                || !STATES.contains(node.path("state").asText())
                || !Set.of("codex", "claude").contains(node.path("source").asText())) return null;
        return new NativeSessionStatus(node.path("source").asText(), node.path("state").asText(), activeTurnId,
                count(node.get("attempt")), count(node.get("maxAttempts")),
                node.path("retryDelayMs").canConvertToLong() && node.path("retryDelayMs").asLong(-1) >= 0
                        ? node.path("retryDelayMs").asLong() : null);
    }

    private static Integer count(JsonNode node) {
        return node != null && node.canConvertToInt() && node.asInt(-1) >= 0 ? node.asInt() : null;
    }
}
