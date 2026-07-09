package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ErpAppCallResult;
import com.exceptioncoder.toolbox.claudechat.service.ErpAppConfigService.ErpAppConn;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
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
import java.util.List;
import java.util.Map;

/**
 * 本地 ERP 实例（验证用）探测执行器：供 agent 经 sidecar 的 erp_app MCP 回灌，在自闭环验证时
 * 以登录态实发 {@code *.action} 请求，校验改动是否符合预期。
 *
 * <p>安全边界（与只读查库链路互补，但这是「会经 app 真写测试库」的新信任面，故收窄到本地/测试实例）：
 * <ul>
 *   <li><b>host 白名单</b>：目标 URL 的 host:port 必须与配置 baseUrl 一致，禁跨站；</li>
 *   <li><b>拒生产域</b>：命中已知生产域名（wyoooni.net）直接拒绝，和 prod-log-query 的生产后台物理隔离；</li>
 *   <li>连接/请求超时、响应体上限，防拖垮。</li>
 * </ul>
 * 登录复用 yoooni-prod-log-query 的「账号密码换 session」范式，只是 baseUrl 指向本地测试实例。</p>
 */
@Slf4j
@Service
public class ErpAppService {

    private static final Duration TIMEOUT = Duration.ofSeconds(20);
    private static final int MAX_BODY = 20_000;
    /** 生产域名黑名单（子串命中即拒）：自闭环验证只允许打本地/测试实例，绝不碰生产。 */
    private static final List<String> PROD_DENY = List.of("wyoooni.net");
    private static final List<String> ALLOWED_METHODS = List.of("GET", "POST", "PUT", "DELETE");

    private final ErpAppConfigService config;
    private final ObjectMapper mapper;

    /** 单用户：缓存一个带 CookieManager 的 client，登录态跨调用复用；配置变化则重建。 */
    private HttpClient client;
    private String clientSignature;
    private boolean loggedIn;

    public ErpAppService(ErpAppConfigService config, ObjectMapper mapper) {
        this.config = config;
        this.mapper = mapper;
    }

    /** 测试连通/登录：无需登录则 GET baseUrl；需登录则跑登录。返回 null=成功，否则错误信息。 */
    public synchronized String test() {
        ErpAppConn c = config.get();
        if (c == null || !c.isComplete()) {
            return "未配置或配置不完整";
        }
        String denied = denyReason(c.baseUrl());
        if (denied != null) {
            return denied;
        }
        try {
            ensureClient(c);
            if (c.needsLogin()) {
                String err = login(c);
                return err;
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
     * @param path     相对 baseUrl 的路径（如 /erp/allcost/saveAllcost.action）或同源绝对 URL
     * @param params   参数（GET 拼 query；POST/PUT 按 bodyType 编码）
     * @param bodyType form（application/x-www-form-urlencoded，默认）或 json
     */
    public synchronized ErpAppCallResult call(String method, String path, Map<String, Object> params, String bodyType) {
        ErpAppConn c = config.get();
        if (c == null || !c.isComplete()) {
            return ErpAppCallResult.err("未配置本地 ERP 实例（请在「ERP 需求开发」里填实例地址）");
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
        try {
            ensureClient(c);
            if (c.needsLogin() && !loggedIn) {
                String err = login(c);
                if (err != null) {
                    return ErpAppCallResult.err("登录本地实例失败：" + err);
                }
            }
            HttpRequest.Builder b = HttpRequest.newBuilder(target).timeout(TIMEOUT);
            boolean hasBody = ("POST".equals(m) || "PUT".equals(m)) && params != null && !params.isEmpty();
            if (hasBody && "json".equalsIgnoreCase(bodyType)) {
                b.header("Content-Type", "application/json;charset=UTF-8")
                        .method(m, HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(params), StandardCharsets.UTF_8));
            } else if (hasBody) {
                b.header("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
                        .method(m, HttpRequest.BodyPublishers.ofString(formEncode(params), StandardCharsets.UTF_8));
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

    /** 按配置签名重建 client（带独立 CookieManager，登录态跟着重置）。 */
    private void ensureClient(ErpAppConn c) {
        String sig = c.baseUrl() + "|" + c.loginPath() + "|" + c.username();
        if (client == null || !sig.equals(clientSignature)) {
            client = HttpClient.newBuilder()
                    .connectTimeout(TIMEOUT)
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
                    .build();
            clientSignature = sig;
            loggedIn = false;
        }
    }

    /** 账号密码换 session：POST 登录表单，宽松判定（非 4xx/5xx 即认为拿到会话）。返回 null=成功。 */
    private String login(ErpAppConn c) {
        try {
            Map<String, Object> form = new LinkedHashMap<>();
            form.put(c.effUserField(), c.username());
            form.put(c.effPassField(), c.password() == null ? "" : c.password());
            URI uri = resolve(c.baseUrl(), c.loginPath(), "POST", form);
            HttpResponse<String> resp = client.send(
                    HttpRequest.newBuilder(uri).timeout(TIMEOUT)
                            .header("Content-Type", "application/x-www-form-urlencoded;charset=UTF-8")
                            .POST(HttpRequest.BodyPublishers.ofString(formEncode(form), StandardCharsets.UTF_8))
                            .build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() >= 400) {
                return "登录返回 " + resp.statusCode();
            }
            loggedIn = true;
            return null;
        } catch (Exception e) {
            return e.getMessage();
        }
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
