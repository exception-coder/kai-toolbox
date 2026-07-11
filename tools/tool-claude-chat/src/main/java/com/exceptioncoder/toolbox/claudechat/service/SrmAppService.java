package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ErpAppCallResult;
import com.exceptioncoder.toolbox.claudechat.service.SrmAppConfigService.SrmAppConn;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SRM 本地实例（yudao 网关，验证用）探测执行器：供 agent 经 sidecar 的 srm_app MCP 回灌，在自闭环验证时
 * 以 OAuth2 登录态实发 REST 接口，校验改动是否符合预期。
 *
 * <p>安全边界（与只读查库链路互补，但这是「会经网关真写测试库」的新信任面，故收窄到本地/测试实例）：
 * <ul>
 *   <li><b>host 白名单</b>：目标 URL 的 host:port 必须与配置 baseUrl 一致，禁跨站；</li>
 *   <li><b>拒生产域</b>：命中已知生产域名（wyoooni.net）直接拒绝；</li>
 *   <li>连接/请求超时、响应体上限，防拖垮。</li>
 * </ul>
 * 与 ERP 的 {@code *.action} cookie 会话不同：SRM 走芋道 OAuth2——JSON 登录拿 accessToken，
 * 后续带 {@code Authorization: Bearer} + 可选 {@code tenant-id} 头（无 cookie）。</p>
 */
@Slf4j
@Service
public class SrmAppService {

    private static final Duration TIMEOUT = Duration.ofSeconds(20);
    private static final int MAX_BODY = 20_000;
    /** 生产域名黑名单（子串命中即拒）：自闭环验证只允许打本地/测试实例，绝不碰生产。 */
    private static final List<String> PROD_DENY = List.of("wyoooni.net");
    private static final List<String> ALLOWED_METHODS = List.of("GET", "POST", "PUT", "DELETE");

    private final SrmAppConfigService config;
    private final ObjectMapper mapper;

    /** 单用户：缓存 client + 登录态 token，跨调用复用；配置变化则重建。 */
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private String accessToken;
    private String tokenSignature;

    public SrmAppService(SrmAppConfigService config, ObjectMapper mapper) {
        this.config = config;
        this.mapper = mapper;
    }

    /** 测试连通/登录：无需登录则 GET baseUrl；需登录则跑登录。返回 null=成功，否则错误信息。 */
    public synchronized String test() {
        SrmAppConn c = config.get();
        if (c == null || !c.isComplete()) {
            return "未配置或配置不完整";
        }
        String denied = denyReason(c.baseUrl());
        if (denied != null) {
            return denied;
        }
        try {
            if (c.needsLogin()) {
                return login(c);
            }
            HttpResponse<String> resp = client.send(
                    HttpRequest.newBuilder(URI.create(c.baseUrl())).timeout(TIMEOUT).GET().build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            return resp.statusCode() < 500 ? null : "实例返回 " + resp.statusCode();
        } catch (Exception e) {
            return e.getMessage();
        }
    }

    /**
     * 实发一条探测请求（自闭环验证用）。任何失败以 result.error 返回，不抛（供 MCP 回灌文本）。
     *
     * @param method   GET/POST/PUT/DELETE
     * @param path     相对 baseUrl 的路径（如 /admin-api/srm/supplier/page）或同源绝对 URL
     * @param params   参数（GET 拼 query；POST/PUT 按 bodyType 编码）
     * @param bodyType json（application/json，默认，芋道 REST 常用）或 form
     */
    public synchronized ErpAppCallResult call(String method, String path, Map<String, Object> params, String bodyType) {
        SrmAppConn c = config.get();
        if (c == null || !c.isComplete()) {
            return ErpAppCallResult.err("未配置本地 SRM 实例（请在「SRM需求开发」里填实例地址）");
        }
        String m = method == null ? "GET" : method.trim().toUpperCase();
        if (!ALLOWED_METHODS.contains(m)) {
            return ErpAppCallResult.err("不支持的方法：" + m + "（仅 " + ALLOWED_METHODS + "）");
        }
        URI target;
        try {
            target = resolve(c.baseUrl(), path, m, params);
        } catch (IllegalArgumentException e) {
            return ErpAppCallResult.err(e.getMessage());
        }
        String denied = denyReason(target.toString());
        if (denied != null) {
            return ErpAppCallResult.err(denied);
        }
        String sameOrigin = sameOriginReason(c.baseUrl(), target);
        if (sameOrigin != null) {
            return ErpAppCallResult.err(sameOrigin);
        }
        // 配置变化（换实例/账号/租户）则丢弃旧 token，强制重登。
        if (!currentSig(c).equals(tokenSignature)) {
            accessToken = null;
        }
        try {
            if (c.needsLogin() && accessToken == null) {
                String err = login(c);
                if (err != null) {
                    return ErpAppCallResult.err("登录本地实例失败：" + err);
                }
            }
            HttpRequest.Builder b = HttpRequest.newBuilder(target).timeout(TIMEOUT);
            applyAuthHeaders(b, c);
            boolean hasBody = ("POST".equals(m) || "PUT".equals(m)) && params != null && !params.isEmpty();
            if (hasBody && "form".equalsIgnoreCase(bodyType)) {
                b.header("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
                        .method(m, HttpRequest.BodyPublishers.ofString(formEncode(params), StandardCharsets.UTF_8));
            } else if (hasBody) {
                b.header("Content-Type", "application/json;charset=UTF-8")
                        .method(m, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(params), StandardCharsets.UTF_8));
            } else {
                b.method(m, HttpRequest.BodyPublishers.noBody());
            }
            long t0 = System.currentTimeMillis();
            HttpResponse<String> resp = client.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            long elapsed = System.currentTimeMillis() - t0;
            String raw = resp.body() == null ? "" : resp.body();
            boolean truncated = raw.length() > MAX_BODY;
            String body = truncated ? raw.substring(0, MAX_BODY) : raw;
            Map<String, String> headers = new LinkedHashMap<>();
            resp.headers().firstValue("content-type").ifPresent(v -> headers.put("Content-Type", v));
            resp.headers().firstValue("location").ifPresent(v -> headers.put("Location", v));
            return new ErpAppCallResult(resp.statusCode(), resp.uri().toString(), elapsed, headers, body, truncated, null);
        } catch (Exception e) {
            return ErpAppCallResult.err("请求失败：" + e.getMessage());
        }
    }

    // —— 内部 ——

    /** 配置签名：实例/登录路径/账号/租户变化即视为换连接，需重登。 */
    private static String currentSig(SrmAppConn c) {
        return c.baseUrl() + "|" + c.loginPath() + "|" + c.username() + "|" + c.tenantId();
    }

    /** 带上登录态：Bearer token + 可选 tenant-id 头。 */
    private void applyAuthHeaders(HttpRequest.Builder b, SrmAppConn c) {
        if (accessToken != null && !accessToken.isBlank()) {
            b.header("Authorization", "Bearer " + accessToken);
        }
        if (c.tenantId() != null && !c.tenantId().isBlank()) {
            b.header("tenant-id", c.tenantId());
        }
    }

    /**
     * 芋道 OAuth2 密码登录：JSON POST {username,password}（带 tenant-id 头），
     * 从响应 body 按 tokenJsonPath 取 accessToken。返回 null=成功。
     */
    private String login(SrmAppConn c) {
        String sig = currentSig(c);
        try {
            Map<String, Object> form = new LinkedHashMap<>();
            form.put("username", c.username());
            form.put("password", c.password() == null ? "" : c.password());
            URI uri = resolve(c.baseUrl(), c.loginPath(), "POST", form);
            HttpRequest.Builder b = HttpRequest.newBuilder(uri).timeout(TIMEOUT)
                    .header("Content-Type", "application/json;charset=UTF-8");
            if (c.tenantId() != null && !c.tenantId().isBlank()) {
                b.header("tenant-id", c.tenantId());
            }
            HttpResponse<String> resp = client.send(
                    b.POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(form), StandardCharsets.UTF_8)).build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() >= 400) {
                return "登录返回 " + resp.statusCode() + "：" + trim(resp.body());
            }
            String token = extractToken(resp.body(), c.effTokenJsonPath());
            if (token == null || token.isBlank()) {
                return "登录成功但未在 " + c.effTokenJsonPath() + " 取到 accessToken：" + trim(resp.body());
            }
            accessToken = token;
            tokenSignature = sig;
            return null;
        } catch (Exception e) {
            return e.getMessage();
        }
    }

    /** 按点路径（如 data.accessToken）从 JSON body 取字符串 token。 */
    private String extractToken(String body, String jsonPath) {
        try {
            JsonNode node = mapper.readTree(body == null ? "" : body);
            for (String seg : jsonPath.split("\\.")) {
                if (node == null) {
                    return null;
                }
                node = node.get(seg);
            }
            return node == null || node.isNull() ? null : node.asText();
        } catch (Exception e) {
            return null;
        }
    }

    private static String trim(String s) {
        if (s == null) {
            return "";
        }
        return s.length() > 300 ? s.substring(0, 300) : s;
    }

    /** 拼目标 URI：path 为同源绝对 URL 直接用，否则拼到 baseUrl 后；GET 把 params 拼进 query。 */
    private static URI resolve(String baseUrl, String path, String method, Map<String, Object> params) {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("path 不能为空");
        }
        String base = baseUrl.replaceAll("/+$", "");
        String full;
        if (path.startsWith("http://") || path.startsWith("https://")) {
            full = path;
        } else {
            full = base + (path.startsWith("/") ? path : "/" + path);
        }
        if ("GET".equals(method) && params != null && !params.isEmpty()) {
            full += (full.contains("?") ? "&" : "?") + formEncode(params);
        }
        try {
            return URI.create(full);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("URL 非法：" + full);
        }
    }

    private static String formEncode(Map<String, Object> params) {
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Object> e : params.entrySet()) {
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8)).append('=')
                    .append(URLEncoder.encode(e.getValue() == null ? "" : String.valueOf(e.getValue()), StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    /** 命中生产域黑名单则返回拒绝原因，否则 null。 */
    private static String denyReason(String url) {
        String lower = url == null ? "" : url.toLowerCase();
        for (String deny : PROD_DENY) {
            if (lower.contains(deny)) {
                return "拒绝：自闭环验证只允许打本地/测试实例，命中生产域名 " + deny;
            }
        }
        return null;
    }

    /** 目标必须与 baseUrl 同源（host:port 一致），否则返回原因。 */
    private static String sameOriginReason(String baseUrl, URI target) {
        try {
            URI base = URI.create(baseUrl);
            String bh = base.getHost();
            String th = target.getHost();
            if (bh == null || th == null || !bh.equalsIgnoreCase(th) || base.getPort() != target.getPort()) {
                return "拒绝：目标 " + th + ":" + target.getPort() + " 不在白名单（仅允许配置的 " + bh + ":" + base.getPort() + "）";
            }
            return null;
        } catch (Exception e) {
            return "URL 解析失败：" + e.getMessage();
        }
    }
}
