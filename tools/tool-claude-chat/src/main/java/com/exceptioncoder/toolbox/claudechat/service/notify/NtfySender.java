package com.exceptioncoder.toolbox.claudechat.service.notify;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * Android ntfy 推送。
 * 形如 POST {baseUrl}/{topic}，正文为 body，Title header 为标题，baseUrl 默认 https://ntfy.sh。
 */
@Slf4j
@Component
public class NtfySender implements NotificationSender {

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();

    @Override
    public String channel() {
        return "ntfy";
    }

    @Override
    public void send(Map<String, Object> cfg, String title, String body) {
        String baseUrl = str(cfg, "baseUrl", "https://ntfy.sh");
        String topic = str(cfg, "topic", null);
        if (topic == null || topic.isBlank()) {
            log.warn("[claude-chat] ntfy topic 未配置，跳过推送");
            return;
        }
        String url = trimEnd(baseUrl) + "/" + topic;
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    // Title header 仅允许 ASCII，非 ASCII 标题降级放进正文
                    .header("Title", asciiOr(title, "Claude"))
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
            String token = str(cfg, "token", null);
            if (token != null && !token.isBlank()) {
                b.header("Authorization", "Bearer " + token);
            }
            HttpResponse<String> resp = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                log.warn("[claude-chat] ntfy 推送失败 HTTP {}", resp.statusCode());
            }
        } catch (Exception e) {
            log.warn("[claude-chat] ntfy 推送异常：{}", e.getMessage());
        }
    }

    private static String asciiOr(String s, String fallback) {
        if (s == null) return fallback;
        return s.chars().allMatch(c -> c < 128) ? s : fallback;
    }

    private static String trimEnd(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    private static String str(Map<String, Object> cfg, String key, String def) {
        Object v = cfg == null ? null : cfg.get(key);
        return v == null ? def : String.valueOf(v);
    }
}
