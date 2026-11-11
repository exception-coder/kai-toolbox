package com.exceptioncoder.toolbox.claudechat.api.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Set;

/** 失败分类只承载已归一的代码；不复制原生错误中的凭据或请求内容。 */
public record TurnFailure(String category, String code) {
    private static final Set<String> CATEGORIES = Set.of("quota", "context", "authentication", "network",
            "request", "refusal", "limit", "incomplete", "unknown");
    private static final Set<String> NON_FAILURES = Set.of("success", "end_turn", "completed", "stop",
            "interrupted", "cancelled", "user_cancelled", "user_paused", "admission_rejected");

    public static TurnFailure read(JsonNode node, String stopReason) {
        if (stopReason == null || NON_FAILURES.contains(stopReason)) return null;
        if (node == null || !CATEGORIES.contains(node.path("category").asText())) {
            return new TurnFailure(Set.of("incomplete", "queue_check_unconfirmed").contains(stopReason)
                    ? "incomplete" : "unknown", null);
        }
        String code = node.path("code").asText("");
        return new TurnFailure(node.path("category").asText(), code.matches("[A-Za-z][A-Za-z0-9_]{0,79}") ? code : null);
    }
}
