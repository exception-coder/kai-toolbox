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
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.function.Supplier;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 取 Claude 官方 5h/周用量额度：调 {@code GET https://api.anthropic.com/api/oauth/usage}
 * （{@code /usage} 背后的未公开端点），读取 CLAUDE_CONFIG_DIR 或默认 ~/.claude 的 OAuth 凭据。
 *
 * <p>该端点对 User-Agent 敏感、且 429 极凶——必须带 {@code User-Agent: claude-code/<ver>} +
 * {@code anthropic-beta: oauth-2025-04-20}，缓存成功 10 分钟、失败 5 分钟以减少限流。
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
    private final HttpClient http;
    private final Path configRoot;
    private final Supplier<String> credentialsReader;
    private final LongSupplier clock;

    private volatile long fetchedAt;
    private volatile boolean lastFailed = true;
    private volatile QuotaSnapshot cached;
    private String credentialFingerprint;

    @Autowired
    ClaudeQuotaClient(ObjectMapper mapper) {
        this(mapper, HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5)).build(), configRoot(), null, System::currentTimeMillis);
    }

    ClaudeQuotaClient(ObjectMapper mapper, HttpClient http, Path configRoot,
                      Supplier<String> credentialsReader, LongSupplier clock) {
        this.mapper = mapper;
        this.http = http;
        this.configRoot = configRoot;
        this.credentialsReader = credentialsReader == null ? this::readCredentials : credentialsReader;
        this.clock = clock;
    }

    synchronized QuotaSnapshot get() {
        String credentials = credentialsReader.get();
        String fingerprint = fingerprint(credentials);
        if (!java.util.Objects.equals(fingerprint, credentialFingerprint)) {
            cached = null;
            fetchedAt = 0;
            credentialFingerprint = fingerprint;
        }
        if (credentials == null) {
            cached = null;
            return null;
        }
        long now = clock.getAsLong();
        long ttl = lastFailed ? ERR_TTL : OK_TTL;
        if (fetchedAt > 0 && now - fetchedAt < ttl) {
            return cached;
        }
        fetchedAt = now;
        QuotaSnapshot q = doFetch(credentials);
        if (!java.util.Objects.equals(fingerprint, fingerprint(credentialsReader.get()))) {
            cached = null;
            credentialFingerprint = null;
            return null;
        }
        lastFailed = q == null;
        cached = q;
        return q;
    }

    private QuotaSnapshot doFetch(String credentials) {
        try {
            JsonNode c = mapper.readTree(credentials);
            String token = c.path("claudeAiOauth").path("accessToken").asText(null);
            if (token == null || token.isBlank()) return null;

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.anthropic.com/api/oauth/usage"))
                    .timeout(Duration.ofSeconds(8))
                    .header("Authorization", "Bearer " + token)
                    .header("anthropic-beta", "oauth-2025-04-20")
                    .header("User-Agent", "claude-code/" + readVersion(configRoot))
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
            // 增量(delta)由 UsageService 统一按「较上次构建」计算
            return new QuotaSnapshot(
                    p1, 300, resetSec(fh),
                    p2, 10080, resetSec(sd),
                    planLabel(c), clock.getAsLong());
        } catch (Exception e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.debug("[usage] claude oauth usage 失败：{}", e.getClass().getSimpleName());
            return null;
        }
    }

    private static Path configRoot() {
        String configured = System.getenv("CLAUDE_CONFIG_DIR");
        return configured == null || configured.isBlank()
                ? Path.of(System.getProperty("user.home"), ".claude") : Path.of(configured);
    }

    private String readCredentials() {
        // 独立OAuth环境令牌无法与文件里的订阅身份核对，拒绝读错账号。
        if (System.getenv("CLAUDE_CODE_OAUTH_TOKEN") != null) {
            return null;
        }
        try {
            return Files.readString(configRoot.resolve(".credentials.json"));
        } catch (Exception error) {
            return null;
        }
    }

    private static String fingerprint(String credentials) {
        if (credentials == null) {
            return null;
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(credentials.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 unavailable", error);
        }
    }

    private static Double pct(JsonNode n) {
        if (!n.path("utilization").isNumber()) {
            return null;
        }
        double value = n.path("utilization").asDouble();
        return Double.isFinite(value) && value >= 0 && value <= 100 ? value : null;
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

    /**
     * 友好套餐名：以 subscriptionType 为准（team/enterprise/pro 等是真实订阅），
     * 仅个人 Max 用 rateLimitTier 细分 5x/20x。rateLimitTier 是内部限流档，不等于套餐名（如 team 的档位是 max_5x，但套餐是 Team）。
     */
    private static String planLabel(JsonNode cred) {
        JsonNode o = cred.path("claudeAiOauth");
        String sub = o.path("subscriptionType").asText("").trim();
        String tier = o.path("rateLimitTier").asText("").toLowerCase();
        switch (sub.toLowerCase()) {
            case "team":
                return "Team";
            case "enterprise":
                return "Enterprise";
            case "pro":
                return "Pro";
            case "max":
                if (tier.contains("20x")) return "Max 20x";
                if (tier.contains("5x")) return "Max 5x";
                return "Max";
            default:
                return sub.isBlank() ? null : sub;
        }
    }

    private String readVersion(Path root) {
        try {
            Path f = root.resolve(".last-update-result.json");
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
