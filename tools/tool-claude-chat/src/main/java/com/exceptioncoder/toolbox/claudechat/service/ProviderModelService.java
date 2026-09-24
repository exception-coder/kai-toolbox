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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 拉取第三方 Anthropic 兼容网关（如 4sapi）的可用模型目录。
 *
 * <p>由后端代理请求服务商的模型目录（DeepSeek 官方使用根路径 {@code /models}，通用网关使用
 * {@code /v1/models}），避免浏览器 CORS。
 * 通用网关同时发 {@code x-api-key} 与 {@code Authorization: Bearer}；DeepSeek 官方只发 Bearer。
 * 返回体也按两种结构解析（{@code data[]} / {@code models[]}，取 {@code id}/{@code name} 与可选展示名）。
 * 拉取失败时返回空表 + 可读错误原因（供前端提示，而非静默吞掉）。按 baseUrl 与凭据摘要缓存短 TTL。
 *
 * <p>强制 HTTP/1.1：部分网关（new-api 等常挂 nginx）在 Java HttpClient 默认 HTTP/2 协商下偶发连不上
 * （表现为 “连接被关闭/无响应”）。模型列表是低频小请求，用 1.1 更稳。
 */
@Slf4j
@Service
public class ProviderModelService {

    private static final long TTL_MS = 60_000;

    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(8))
            .build();
    private final Map<String, Cached> cache = new ConcurrentHashMap<>();

    private record Cached(long at, List<ModelInfo> models) {}

    /** 拉取结果：models 为空时 error 给出可读原因（HTTP 状态 / 网关错误消息 / 异常）。 */
    public record FetchResult(List<ModelInfo> models, String error) {
        static FetchResult ok(List<ModelInfo> m) { return new FetchResult(m, null); }
        static FetchResult fail(String e) { return new FetchResult(List.of(), e); }
    }

    public ProviderModelService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** 取网关模型目录列表（内部/会话内用，不关心错误原因）；失败回空表。 */
    public List<ModelInfo> fetchModels(String baseUrl, String key) {
        return fetch(baseUrl, key).models();
    }

    /** 取网关模型目录 + 错误原因；按地址和凭据摘要缓存成功结果 60 秒。 */
    public FetchResult fetch(String baseUrl, String key) {
        if (baseUrl == null || baseUrl.isBlank()) return FetchResult.fail("未配置网关 baseURL");
        String base = baseUrl.trim().replaceAll("/+$", "");
        long now = System.currentTimeMillis();
        String cacheKey = cacheKey(base, key);
        Cached c = cache.get(cacheKey);
        if (c != null && now - c.at() < TTL_MS && !c.models().isEmpty()) return FetchResult.ok(c.models());
        FetchResult r = doFetch(base, key);
        if (!r.models().isEmpty()) cache.put(cacheKey, new Cached(now, r.models()));
        return r;
    }

    private FetchResult doFetch(String base, String key) {
        String url = base;
        try {
            URI endpoint = modelCatalogUri(base);
            url = endpoint.toString();
            HttpRequest.Builder b = HttpRequest.newBuilder()
                    .uri(endpoint)
                    .timeout(Duration.ofSeconds(10))
                    .GET();
            if (!isOfficialDeepSeek(endpoint)) {
                b.header("anthropic-version", "2023-06-01");
            }
            if (key != null && !key.isBlank()) {
                if (!isOfficialDeepSeek(endpoint)) {
                    b.header("x-api-key", key);
                }
                b.header("Authorization", "Bearer " + key);
            }
            HttpResponse<String> resp = http.send(b.build(), HttpResponse.BodyHandlers.ofString());
            String body = resp.body() == null ? "" : resp.body();
            if (resp.statusCode() / 100 != 2) {
                String detail = extractErrorMessage(body);
                String msg = isOfficialDeepSeek(endpoint) && resp.statusCode() == 401
                        ? "DeepSeek API Key 未通过认证；请核对开放平台 Key 与当前档案，模型目录和对话均不可用"
                        : "网关返回 HTTP " + resp.statusCode() + (detail == null ? "" : "：" + detail);
                log.warn("[claude-chat] 拉网关模型目录失败 {} -> {}", url, msg);
                return FetchResult.fail(msg);
            }
            JsonNode root = mapper.readTree(body);
            JsonNode data = root.path("data");
            if (!data.isArray()) data = root.path("models"); // 个别网关用 models[]
            List<ModelInfo> out = new ArrayList<>();
            if (data.isArray()) {
                for (JsonNode m : data) {
                    String id = firstNonBlank(m.path("id").asText(null), m.path("name").asText(null));
                    if (id == null) continue;
                    String disp = firstNonBlank(
                            m.path("display_name").asText(null), m.path("displayName").asText(null), id);
                    out.add(new ModelInfo(id, disp, "", List.of(), null, false, false));
                }
            }
            if (out.isEmpty()) {
                log.warn("[claude-chat] 网关 {} 返回 2xx 但无可解析模型，原始体首段：{}", url,
                        body.substring(0, Math.min(200, body.length())));
                return FetchResult.fail("网关返回成功但没有可识别的模型列表（返回结构不是 data[]/models[]）");
            }
            return FetchResult.ok(out);
        } catch (Exception e) {
            String msg = e.getClass().getSimpleName() + (e.getMessage() == null ? "" : "：" + e.getMessage());
            log.warn("[claude-chat] 拉网关模型目录异常 {} -> {}", url, msg);
            return FetchResult.fail("请求网关失败：" + msg);
        }
    }

    /** 将配置地址映射为该服务商真正支持的模型目录端点。 */
    static URI modelCatalogUri(String base) {
        URI uri = URI.create(base);
        if (isOfficialDeepSeek(uri)) {
            return URI.create("https://api.deepseek.com/models");
        }
        return URI.create(base + "/v1/models");
    }

    private static boolean isOfficialDeepSeek(URI uri) {
        return "api.deepseek.com".equalsIgnoreCase(uri.getHost());
    }

    private static String cacheKey(String base, String key) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((key == null ? "" : key).getBytes(StandardCharsets.UTF_8));
            return base + ':' + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    /** 从网关错误体里抽人类可读消息：兼容 {error:{message}} / {message} / {error:"..."}。 */
    private String extractErrorMessage(String body) {
        if (body == null || body.isBlank()) return null;
        try {
            JsonNode n = mapper.readTree(body);
            JsonNode err = n.path("error");
            if (err.isObject() && err.hasNonNull("message")) return err.get("message").asText();
            if (err.isTextual()) return err.asText();
            if (n.hasNonNull("message")) return n.get("message").asText();
        } catch (Exception ignore) {
            // 非 JSON：截断原文
        }
        return body.length() > 160 ? body.substring(0, 160) + "…" : body;
    }

    private static String firstNonBlank(String... vals) {
        for (String v : vals) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }
}
