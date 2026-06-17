package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ModelInfo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 拉取第三方 Anthropic 兼容网关（如 4sapi）的可用模型目录。
 *
 * <p>由后端代理请求 {@code GET {baseUrl}/v1/models}（避免浏览器 CORS、key 不必额外暴露到前端 fetch），
 * 同时发 {@code x-api-key} 与 {@code Authorization: Bearer}，兼容 Anthropic / OpenAI 两种鉴权习惯；
 * 返回体也按两种结构解析（{@code data[]} / {@code models[]}，取 {@code id}/{@code name} 与可选展示名）。
 * 失败一律返回空表（降级到手填），不抛错阻断会话。按 baseUrl 缓存短 TTL，避免反复拉取。
 */
@Slf4j
@Service
public class ProviderModelService {

    private static final long TTL_MS = 60_000;

    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    private record Cached(long at, List<ModelInfo> models) {}

    public ProviderModelService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** 取网关模型目录；baseUrl 空、或拉取失败时返回空表。带 baseUrl 维度 60s 缓存。 */
    public List<ModelInfo> fetchModels(String baseUrl, String key) {
        if (baseUrl == null || baseUrl.isBlank()) return List.of();
        String base = baseUrl.trim().replaceAll("/+$", "");
        long now = System.currentTimeMillis();
        Cached c = cache.get(base);
        if (c != null && now - c.at() < TTL_MS) return c.models();
        List<ModelInfo> models = doFetch(base, key);
        if (!models.isEmpty()) cache.put(base, new Cached(now, models));
        return models;
    }

    private List<ModelInfo> doFetch(String base, String key) {
        try {
            HttpRequest.Builder b = HttpRequest.newBuilder()
                    .uri(URI.create(base + "/v1/models"))
                    .timeout(Duration.ofSeconds(8))
                    .header("anthropic-version", "2023-06-01")
                    .GET();
            if (key != null && !key.isBlank()) {
                b.header("x-api-key", key);
                b.header("Authorization", "Bearer " + key);
            }
            HttpResponse<String> resp = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                log.debug("[claude-chat] 网关 /v1/models HTTP {}：{}", resp.statusCode(),
                        resp.body() == null ? "" : resp.body().substring(0, Math.min(200, resp.body().length())));
                return List.of();
            }
            JsonNode root = mapper.readTree(resp.body());
            JsonNode data = root.path("data");
            if (!data.isArray()) data = root.path("models"); // 个别网关用 models[]
            List<ModelInfo> out = new ArrayList<>();
            if (data.isArray()) {
                for (JsonNode m : data) {
                    String id = firstNonBlank(m.path("id").asText(null), m.path("name").asText(null));
                    if (id == null) continue;
                    String disp = firstNonBlank(
                            m.path("display_name").asText(null), m.path("displayName").asText(null), id);
                    out.add(new ModelInfo(id, disp, ""));
                }
            }
            return out;
        } catch (Exception e) {
            log.debug("[claude-chat] 拉取网关模型目录失败：{}", e.getMessage());
            return List.of();
        }
    }

    private static String firstNonBlank(String... vals) {
        for (String v : vals) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }
}
