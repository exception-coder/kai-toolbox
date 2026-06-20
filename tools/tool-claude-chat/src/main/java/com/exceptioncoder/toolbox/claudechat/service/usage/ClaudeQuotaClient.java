package com.exceptioncoder.toolbox.claudechat.service.usage;

import com.exceptioncoder.toolbox.claudechat.service.usage.EngineUsageScanner.QuotaSnapshot;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.OffsetDateTime;

/**
 * 取 Claude 官方 5h/周用量额度：调 {@code GET https://api.anthropic.com/api/oauth/usage}
 * （{@code /usage} 背后的未公开端点），用本机 ~/.claude/.credentials.json 的 oauth accessToken。
 *
 * <p>该端点对 User-Agent 敏感、且 429 极凶——必须带 {@code User-Agent: claude-code/<ver>} +
 * {@code anthropic-beta: oauth-2025-04-20}，并**长缓存**（成功 5 分钟、失败 1 分钟）避免触发限流。
 * 任意失败（无凭据/401/429/超时/解析）→ 返回 null，由上层降级（不展示 Claude 额度）。
 *
 * <p>响应：{@code {"five_hour":{"utilization":33.0,"resets_at":ISO},"seven_day":{...}}}。
 */
@Component
class ClaudeQuotaClient {

    private static final Logger log = LoggerFactory.getLogger(ClaudeQuotaClient.class);
    // 该端点 429 极凶 → 极保守缓存：成功 10 分钟、失败退避 5 分钟。仅在用户点开用量面板时才可能触发一次。
    private static final long OK_TTL = 600_000L;
    private static final long ERR_TTL = 300_000L;
    private static final String FALLBACK_VER = "2.1.183";

    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private volatile long fetchedAt;
    private volatile boolean lastFailed = true;
    private volatile QuotaSnapshot cached;
    // 上一次成功拉取的窗口百分比，用于算「较上次」增量
    private volatile Double prevPrimary;
    private volatile Double prevSecondary;

    ClaudeQuotaClient(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    synchronized QuotaSnapshot get() {
        long now = System.currentTimeMillis();
        long ttl = lastFailed ? ERR_TTL : OK_TTL;
        if (now - fetchedAt < ttl) {
            return cached;
        }
        fetchedAt = now;
        QuotaSnapshot q = doFetch();
        lastFailed = q == null;
        cached = q;
        return q;
    }

    private QuotaSnapshot doFetch() {
        try {
            Path home = Path.of(System.getProperty("user.home"));
            Path cred = home.resolve(".claude").resolve(".credentials.json");
            if (!Files.exists(cred)) return null;
            JsonNode c = mapper.readTree(Files.readString(cred));
            String token = c.path("claudeAiOauth").path("accessToken").asText(null);
            if (token == null || token.isBlank()) return null;

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.anthropic.com/api/oauth/usage"))
                    .timeout(Duration.ofSeconds(8))
                    .header("Authorization", "Bearer " + token)
                    .header("anthropic-beta", "oauth-2025-04-20")
                    .header("User-Agent", "claude-code/" + readVersion(home))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.debug("[usage] claude oauth usage HTTP {}", resp.statusCode());
                return null;
            }
            JsonNode r = mapper.readTree(resp.body());
            JsonNode fh = r.path("five_hour");
            JsonNode sd = r.path("seven_day");
            Double p1 = pct(fh);
            Double p2 = pct(sd);
            if (p1 == null && p2 == null) return null;
            // 较上一次成功拉取的增量（端点为快照，无逐轮历史，故对比上次读数）
            Double d1 = (p1 != null && prevPrimary != null) ? p1 - prevPrimary : null;
            Double d2 = (p2 != null && prevSecondary != null) ? p2 - prevSecondary : null;
            prevPrimary = p1;
            prevSecondary = p2;
            return new QuotaSnapshot(
                    p1, 300, resetSec(fh),
                    p2, 10080, resetSec(sd),
                    planLabel(c), System.currentTimeMillis(), d1, d2);
        } catch (Exception e) {
            log.debug("[usage] claude oauth usage 失败：{}", e.toString());
            return null;
        }
    }

    private static Double pct(JsonNode n) {
        return n.path("utilization").isNumber() ? n.path("utilization").asDouble() : null;
    }

    private static Long resetSec(JsonNode n) {
        JsonNode t = n.path("resets_at");
        if (!t.isTextual()) return null;
        try {
            return OffsetDateTime.parse(t.asText()).toInstant().getEpochSecond();
        } catch (Exception e) {
            return null;
        }
    }

    /** 友好套餐名：rateLimitTier（default_claude_max_5x → Max 5x）回退 subscriptionType。 */
    private static String planLabel(JsonNode cred) {
        JsonNode o = cred.path("claudeAiOauth");
        String tier = o.path("rateLimitTier").asText("");
        if (tier.contains("max_20x")) return "Max 20x";
        if (tier.contains("max_5x")) return "Max 5x";
        if (tier.contains("pro")) return "Pro";
        String sub = o.path("subscriptionType").asText("");
        return sub.isBlank() ? null : sub;
    }

    private String readVersion(Path home) {
        try {
            Path f = home.resolve(".claude").resolve(".last-update-result.json");
            if (Files.exists(f)) {
                JsonNode n = mapper.readTree(Files.readString(f));
                String v = n.path("version_to").asText(null);
                if (v != null && !v.isBlank()) return v;
            }
        } catch (Exception ignore) {
            // 用兜底版本
        }
        return FALLBACK_VER;
    }
}
