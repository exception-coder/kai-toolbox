package com.exceptioncoder.toolbox.ops.resources.application;

import com.exceptioncoder.toolbox.common.resource.ResourceCall;
import com.exceptioncoder.toolbox.ops.resources.domain.ApplicationResource;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ApplicationResourceExecutor {
    private static final Duration TIMEOUT = Duration.ofSeconds(20);
    private static final int MAX_BODY = 20_000;
    private final ObjectMapper mapper;

    public ApplicationResourceExecutor(ObjectMapper mapper) { this.mapper = mapper; }

    public Object execute(ApplicationResource resource, ResourceCall call) {
        if (!resource.configured()) throw new IllegalArgumentException("应用资源配置不完整");
        return switch (call.operation()) {
            case "TEST" -> request(resource, "GET", "/", Map.of(), null, true);
            case "CALL" -> request(resource, call.method(), call.path(), call.params(), call.bodyType(), false);
            default -> throw new IllegalArgumentException("应用资源不支持该操作");
        };
    }

    private Map<String, Object> request(ApplicationResource resource, String rawMethod, String path,
                                        Map<String, Object> rawParams, String bodyType, boolean test) {
        String method = rawMethod == null || rawMethod.isBlank() ? "GET" : rawMethod.trim().toUpperCase();
        if (!java.util.Set.of("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS").contains(method)) {
            throw new IllegalArgumentException("不支持的 HTTP 方法");
        }
        Map<String, Object> params = rawParams == null ? Map.of() : rawParams;
        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient client = HttpClient.newBuilder().connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NORMAL).cookieHandler(cookies).build();
        String token = authenticate(resource, client);
        URI target = resolve(resource.baseUrl(), test ? "/" : path, method, params);
        requireSameOrigin(resource.baseUrl(), target);
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(target).timeout(TIMEOUT);
            applyHeaders(builder, resource, token);
            boolean withBody = java.util.Set.of("POST", "PUT", "PATCH").contains(method) && !params.isEmpty();
            if (withBody && "form".equalsIgnoreCase(bodyType)) {
                builder.header("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
                        .method(method, HttpRequest.BodyPublishers.ofString(form(params), StandardCharsets.UTF_8));
            } else if (withBody) {
                builder.header("Content-Type", "application/json;charset=UTF-8")
                        .method(method, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(params), StandardCharsets.UTF_8));
            } else builder.method(method, HttpRequest.BodyPublishers.noBody());
            long started = System.currentTimeMillis();
            HttpResponse<String> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            String raw = response.body() == null ? "" : response.body();
            boolean truncated = raw.length() > MAX_BODY;
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("status", response.statusCode());
            result.put("url", response.uri().toString());
            result.put("elapsedMs", System.currentTimeMillis() - started);
            result.put("body", truncated ? raw.substring(0, MAX_BODY) : raw);
            result.put("truncated", truncated);
            return result;
        } catch (Exception exception) {
            throw new IllegalArgumentException("应用请求失败：" + exception.getMessage(), exception);
        }
    }

    private String authenticate(ApplicationResource resource, HttpClient client) {
        if (resource.authType() == ApplicationResource.AuthType.NONE) return null;
        URI login = resolve(resource.baseUrl(), resource.loginPath(), "POST", Map.of());
        requireSameOrigin(resource.baseUrl(), login);
        Map<String, Object> credentials = Map.of(resource.usernameField(), resource.username(),
                resource.passwordField(), resource.password());
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(login).timeout(TIMEOUT);
            if (resource.tenantHeader() != null && resource.tenantValue() != null) {
                builder.header(resource.tenantHeader(), resource.tenantValue());
            }
            if (resource.authType() == ApplicationResource.AuthType.FORM_COOKIE) {
                builder.header("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
                        .POST(HttpRequest.BodyPublishers.ofString(form(credentials), StandardCharsets.UTF_8));
            } else {
                builder.header("Content-Type", "application/json;charset=UTF-8")
                        .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(credentials), StandardCharsets.UTF_8));
            }
            HttpResponse<String> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400) throw new IllegalArgumentException("登录返回 " + response.statusCode());
            if (resource.authType() == ApplicationResource.AuthType.FORM_COOKIE) return null;
            JsonNode node = mapper.readTree(response.body());
            for (String segment : resource.tokenJsonPath().split("\\.")) node = node == null ? null : node.get(segment);
            if (node == null || node.asText().isBlank()) throw new IllegalArgumentException("登录响应中没有令牌");
            return node.asText();
        } catch (Exception exception) {
            if (exception instanceof IllegalArgumentException argument) throw argument;
            throw new IllegalArgumentException("应用登录失败：" + exception.getMessage(), exception);
        }
    }

    private static void applyHeaders(HttpRequest.Builder builder, ApplicationResource resource, String token) {
        if (token != null) builder.header("Authorization", "Bearer " + token);
        if (resource.tenantHeader() != null && resource.tenantValue() != null) {
            builder.header(resource.tenantHeader(), resource.tenantValue());
        }
    }

    private static URI resolve(String baseUrl, String path, String method, Map<String, Object> params) {
        if (path == null || path.isBlank()) throw new IllegalArgumentException("请求路径不能为空");
        String value = path.startsWith("http://") || path.startsWith("https://") ? path
                : baseUrl + (path.startsWith("/") ? path : "/" + path);
        if ("GET".equals(method) && !params.isEmpty()) value += (value.contains("?") ? "&" : "?") + form(params);
        try { return URI.create(value); }
        catch (IllegalArgumentException exception) { throw new IllegalArgumentException("请求地址格式不正确"); }
    }

    private static void requireSameOrigin(String baseUrl, URI target) {
        URI base = URI.create(baseUrl);
        if (base.getHost() == null || target.getHost() == null || !base.getHost().equalsIgnoreCase(target.getHost())
                || effectivePort(base) != effectivePort(target) || !base.getScheme().equalsIgnoreCase(target.getScheme())) {
            throw new IllegalArgumentException("请求目标必须与配置的应用实例同源");
        }
    }

    private static int effectivePort(URI uri) {
        return uri.getPort() >= 0 ? uri.getPort() : "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static String form(Map<String, Object> values) {
        return values.entrySet().stream().map(entry -> URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8)
                + "=" + URLEncoder.encode(entry.getValue() == null ? "" : String.valueOf(entry.getValue()), StandardCharsets.UTF_8))
                .collect(java.util.stream.Collectors.joining("&"));
    }
}
