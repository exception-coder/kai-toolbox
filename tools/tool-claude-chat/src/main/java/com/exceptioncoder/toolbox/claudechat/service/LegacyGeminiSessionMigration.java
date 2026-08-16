package com.exceptioncoder.toolbox.claudechat.service;

import java.util.LinkedHashMap;
import java.util.Map;

/** 为已停用的 Gemini CLI 会话生成到 Antigravity 的无损句柄迁移计划。 */
final class LegacyGeminiSessionMigration {

    private LegacyGeminiSessionMigration() {
    }

    static Plan plan(String engine, String currentSdkSessionId,
                     Map<String, String> currentEngineSessions) {
        Map<String, String> sessions = new LinkedHashMap<>(currentEngineSessions);
        if (!"gemini".equals(engine)) {
            return new Plan(false, null, Map.copyOf(sessions));
        }

        if (hasText(currentSdkSessionId)) {
            sessions.put("gemini", currentSdkSessionId.trim());
        }
        String targetSessionId = normalized(sessions.get("antigravity"));
        return new Plan(true, targetSessionId, Map.copyOf(sessions));
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String normalized(String value) {
        return hasText(value) ? value.trim() : null;
    }

    record Plan(boolean required, String targetSessionId, Map<String, String> engineSessions) {
    }
}
