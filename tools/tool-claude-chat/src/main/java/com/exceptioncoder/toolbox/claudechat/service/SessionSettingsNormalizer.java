package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;

import java.util.LinkedHashSet;

/**
 * 会话设置的规范化规则：权限模式、引擎、Codex 推理强度与速度、旧引擎历史迁移、副本标题。
 *
 * <p>纯函数，无状态；从 ClaudeChatService 拆出，便于单独测试与复用。</p>
 */
final class SessionSettingsNormalizer {

    private SessionSettingsNormalizer() { }

    static boolean isValidMode(String m) {
        return "default".equals(m) || "acceptEdits".equals(m)
                || "plan".equals(m) || "bypassPermissions".equals(m);
    }

    static String normalizeMode(String m) {
        return isValidMode(m) ? m : "default";
    }

    static String persistedMode(ClaudeChatSession db) {
        return normalizeMode(db.getPermissionMode());
    }

    /** 未知引擎回退 Claude；旧 gemini 由 Antigravity 接替。 */
    static String normalizeEngine(String e) {
        if ("gemini".equals(e)) return "antigravity";
        return "pi".equals(e) || "copilot".equals(e) || "codex".equals(e) || "qwen".equals(e) || "trae".equals(e) || "antigravity".equals(e) || "opencode".equals(e)
                || "deepseekHarness".equals(e) ? e : "claude";
    }

    /** 引擎历史中的 gemini 统一改写为 antigravity，并保证 antigravity 在列。 */
    static String migrateEngineHistory(String existing) {
        LinkedHashSet<String> engines = new LinkedHashSet<>();
        if (existing != null) {
            for (String item : existing.split(",")) {
                String engine = item.trim();
                if (!engine.isBlank()) engines.add("gemini".equals(engine) ? "antigravity" : engine);
            }
        }
        engines.add("antigravity");
        return String.join(",", engines);
    }

    static String normalizeCodexReasoningEffort(String effort) {
        return effort != null && effort.matches("[a-z][a-z0-9_-]{0,31}") ? effort : "low";
    }

    static String normalizeCodexSpeed(String speed) {
        return "fast".equals(speed) ? "fast" : "default";
    }

    static String duplicateTitle(String title) {
        if (title == null || title.isBlank()) return null;
        return title.trim() + "（副本）";
    }
}
