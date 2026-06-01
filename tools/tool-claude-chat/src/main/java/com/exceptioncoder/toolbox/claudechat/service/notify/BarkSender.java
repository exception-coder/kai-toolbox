package com.exceptioncoder.toolbox.claudechat.service.notify;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * iPhone Bark 推送。
 * 形如 GET {baseUrl}/{deviceKey}/{title}/{body}，baseUrl 默认 https://api.day.app。
 */
@Slf4j
@Component
public class BarkSender implements NotificationSender {

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();

    @Override
    public String channel() {
        return "bark";
    }

    @Override
    public void send(Map<String, Object> cfg, String title, String body) {
        String baseUrl = str(cfg, "baseUrl", "https://api.day.app");
        String deviceKey = str(cfg, "deviceKey", null);
        if (deviceKey == null || deviceKey.isBlank()) {
            log.warn("[claude-chat] bark deviceKey 未配置，跳过推送");
            return;
        }
        String url = trimEnd(baseUrl) + "/" + deviceKey
                + "/" + enc(title) + "/" + enc(body);
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                log.warn("[claude-chat] bark 推送失败 HTTP {}", resp.statusCode());
            }
        } catch (Exception e) {
            log.warn("[claude-chat] bark 推送异常：{}", e.getMessage());
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8)
                .replace("+", "%20");
    }

    private static String trimEnd(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    private static String str(Map<String, Object> cfg, String key, String def) {
        Object v = cfg == null ? null : cfg.get(key);
        return v == null ? def : String.valueOf(v);
    }
}
