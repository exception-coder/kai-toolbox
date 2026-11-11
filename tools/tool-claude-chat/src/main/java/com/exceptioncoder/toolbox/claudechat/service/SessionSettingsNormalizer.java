package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;

import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

/**
 * 会话设置的规范化规则：权限模式、引擎与引擎历史、Codex 推理强度与速度、咨询证据系统、
 * 认证目录键、副本标题与目录短名等。
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

    /**
     * 维护「本会话用过哪些 agent」的去重有序集合（首次出现序）。
     *
     * <p>切回曾用引擎会 resume 它的原生会话（句柄存于 engine_sessions），并非新建——故标记应是
     * 「用过的 agent 集合」而非每次切换的完整往返流水。早期实现按流水追加，来回切几次就变成
     * {@code claude,codex,claude,codex,…}，列表标记看起来像「一直新增会话」。这里改为并集去重：
     * 来回切只保留 {@code claude,codex}，与实际可 resume 的 agent 一一对应。
     */
    static String appendEngine(String existing, String base, String next) {
        String csv = (existing == null || existing.isBlank())
                ? (base == null ? "claude" : base) : existing;
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (String p : csv.split(",")) {
            String t = p.trim();
            if (!t.isEmpty()) set.add(t);
        }
        set.add(next); // 已用过则不重复（resume 续接，不算新增）
        return String.join(",", set);
    }

    static List<String> normalizeConsultEvidenceSystems(List<String> values) {
        if (values == null) return List.of();
        return values.stream().filter(value -> value != null && !value.isBlank())
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .filter(value -> "erp".equals(value) || "srm".equals(value) || "scm".equals(value))
                .distinct().limit(3).toList();
    }

    static String authKey(String codexHome) {
        String value = blankToNull(codexHome);
        if (value == null) return "__default__";
        try {
            return Path.of(value).toAbsolutePath().normalize().toString().toLowerCase(Locale.ROOT);
        } catch (RuntimeException ignored) {
            return value.trim().toLowerCase(Locale.ROOT);
        }
    }

    /** 这些引擎即使尚无原生句柄，也能在恢复后从下一轮创建新的运行时会话。 */
    static boolean canResumeWithoutNativeSessionId(String engine) {
        return "deepseekHarness".equals(engine) || "antigravity".equals(engine) || "trae".equals(engine);
    }

    /** 空白串归一为 null，避免把空网关地址当成有效配置。 */
    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    static String shortCwd(String cwd) {
        if (cwd == null) return "";
        int i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'));
        return i >= 0 && i < cwd.length() - 1 ? cwd.substring(i + 1) : cwd;
    }
}
