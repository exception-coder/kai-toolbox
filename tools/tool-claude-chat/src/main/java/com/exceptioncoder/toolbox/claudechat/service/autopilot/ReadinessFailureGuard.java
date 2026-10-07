package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import com.exceptioncoder.toolbox.claudechat.domain.autopilot.SessionAutopilotRun;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;

/** 仅检测同一任务上下文内重复的前置拒绝；不把正常测试失败或暂态网络错误变成人工阻塞。 */
public final class ReadinessFailureGuard {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final Map<String, Streak> streaks = new LinkedHashMap<>(16, .75f, true);

    public static boolean supports(String tool) {
        return tool != null && tool.contains("forge")
                && (tool.endsWith("check_execution_readiness") || tool.endsWith("check_change_readiness"));
    }

    public static String scope(SessionAutopilotRun run) {
        var context = run.context();
        return String.join("|", run.id(), Long.toString(context.generation()), context.changeId(),
                context.changeRevision(), context.phase().name(), String.valueOf(context.currentTaskId()));
    }

    public synchronized boolean observe(SessionAutopilotRun run, SessionReadinessResultEvent event) {
        if (!supports(event.toolName()) || event.toolCallId() == null || event.toolCallId().isBlank()) return false;
        String scope = scope(run);
        Streak streak = streaks.computeIfAbsent(scope, ignored -> new Streak());
        while (streaks.size() > 256) streaks.remove(streaks.keySet().iterator().next());
        String call = event.turnId() + ":" + event.toolCallId();
        if (!streak.calls.add(call)) return false;
        while (streak.calls.size() > 256) streak.calls.remove(streak.calls.iterator().next());
        Outcome outcome = decode(event.output(), event.error(), 0);
        if (!outcome.failed()) {
            streak.fingerprint = null;
            streak.count = 0;
            return false;
        }
        String message = outcome.message().toLowerCase(Locale.ROOT);
        if (message.matches("(?s).*(timeout|timed out|at capacity|rate.limit|too many requests|econnreset|econnrefused|暂时|超时|容量不足).*")) {
            streak.fingerprint = null;
            streak.count = 0;
            return false;
        }
        String fingerprint = digest(event.toolName() + "\n" + outcome.message().replaceAll("\\s+", " ").trim());
        streak.count = fingerprint.equals(streak.fingerprint) ? streak.count + 1 : 1;
        streak.fingerprint = fingerprint;
        return streak.count >= 2;
    }

    private static Outcome decode(String output, boolean error, int depth) {
        String text = output == null ? "" : output;
        if (depth > 3 || text.length() > 32_768) return new Outcome(error, text.substring(0, Math.min(text.length(), 32_768)));
        try {
            JsonNode node = JSON.readTree(text);
            if (node == null) return new Outcome(error, text);
            boolean failed = error || node.path("isError").asBoolean(false)
                    || (node.has("allowed") && !node.path("allowed").asBoolean(true))
                    || (node.has("ready") && !node.path("ready").asBoolean(true))
                    || "FAILED".equalsIgnoreCase(node.path("status").asText());
            if (node.path("content").isArray()) {
                StringBuilder messages = new StringBuilder();
                for (JsonNode block : node.path("content")) {
                    if (!block.has("text")) continue;
                    Outcome nested = decode(block.path("text").asText(), failed, depth + 1);
                    failed |= nested.failed();
                    messages.append(nested.message()).append('\n');
                }
                return new Outcome(failed, messages.toString());
            }
            String message = node.path("code").asText() + ":" + node.path("message").asText();
            return new Outcome(failed, message.equals(":") ? text : message);
        } catch (Exception ignored) {
            return new Outcome(error, text);
        }
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private record Outcome(boolean failed, String message) { }
    private static final class Streak {
        private final LinkedHashSet<String> calls = new LinkedHashSet<>();
        private String fingerprint;
        private int count;
    }
}
