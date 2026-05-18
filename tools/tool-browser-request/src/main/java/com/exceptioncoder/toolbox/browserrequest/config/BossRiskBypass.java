package com.exceptioncoder.toolbox.browserrequest.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.microsoft.playwright.APIResponse;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Route;
import lombok.extern.slf4j.Slf4j;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * BOSS 直聘风控错误码拦截器。
 *
 * <h3>问题根因</h3>
 * BOSS 直聘的前端 main.js 注册了 jQuery 全局钩子 {@code $.ajaxPrefilter}，
 * 对**所有** AJAX 响应回调 {@code ajaxGetaway(code, data)}：
 * <pre>
 *   code = 31 / 32 → window.location.href = "/web/common/403.html?code=XX"
 *   code = 35 / 36 → 跳滑块验证页
 *   code = 37      → 跳安全检查页
 *   code = 5012    → 跳求职者安全验证
 * </pre>
 * 后端服务端基于 IP / TLS 指纹 / Cookie 组合 / 请求频率等做风控判定，
 * 异常会话即使 cookies 正常也会被返 {@code {code: 31, ...}}，前端钩子立刻跳走，
 * 表现就是「点登录扫码 → 被弹回首页」、「正常访问页面 → 突然 403」。
 *
 * <h3>解决方案（本类）</h3>
 * 在 BrowserContext 注册 {@code ctx.route("**\/*", ...)} HTTP 拦截层，
 * 截获 zhipin 域名下的 JSON 响应，把 {@code code} 字段是上述风控码的改成 {@code 0}，
 * 让 ajaxGetaway 走 {@code setGatewayCookie()} 正常分支。前端业务**完全感知不到风控**，
 * 扫码 polling / 用户信息 / 业务接口都能正常工作。
 *
 * <h3>边界</h3>
 * <ul>
 *   <li>仅对 zhipin 系域名生效，不影响 yuque 等其他 session</li>
 *   <li>仅改 JSON 响应；HTML / 二进制 / 非 JSON 直接透传</li>
 *   <li>失败时降级为透传——绝不阻断请求</li>
 *   <li>后端依然认为你异常——cookie 拿到后用 APIRequestContext 重放业务接口才是终极方案</li>
 * </ul>
 */
@Slf4j
public final class BossRiskBypass {

    private BossRiskBypass() {}

    /** zhipin 系域名（hostname 后缀匹配）。 */
    private static final Set<String> HOST_SUFFIXES = Set.of(
            "zhipin.com", "bosszhipin.com", "weizhipin.com");

    /** ajaxGetaway 里会触发跳转的风控错误码。 */
    private static final Set<Integer> RISK_CODES = Set.of(31, 32, 35, 36, 37, 5012);

    /** 安装拦截器到指定 ctx。每个 ctx 调一次即可，无需重复。 */
    public static void install(BrowserContext ctx, ObjectMapper mapper) {
        ctx.route("**/*", route -> handle(route, mapper));
        log.info("[BossRiskBypass] 已注册响应拦截器（仅 zhipin 系域名生效）");
    }

    private static void handle(Route route, ObjectMapper mapper) {
        String url = route.request().url();
        if (!isTargetHost(url)) {
            // 非 zhipin 域名一律透传，零额外开销
            route.resume();
            return;
        }
        try {
            APIResponse resp = route.fetch();
            String ct = resp.headers().get("content-type");
            // 只处理 JSON 响应；HTML / JS / 图片等透传
            if (ct == null || !ct.toLowerCase().contains("json")) {
                forward(route, resp);
                return;
            }
            byte[] body = resp.body();
            if (body == null || body.length == 0) {
                forward(route, resp);
                return;
            }
            String text = new String(body, StandardCharsets.UTF_8);
            Integer originalCode = extractCode(text, mapper);
            if (originalCode != null && RISK_CODES.contains(originalCode)) {
                String rewritten = rewriteCode(text, mapper);
                if (rewritten != null) {
                    log.info("[BossRiskBypass] 拦截风控码 code={} → 0  url={}", originalCode, url);
                    fulfillWithBody(route, resp, rewritten);
                    return;
                }
            }
            forward(route, resp);
        } catch (Exception e) {
            log.debug("[BossRiskBypass] handler 异常（已降级透传） url={} err={}", url, e.getMessage());
            try { route.resume(); } catch (Exception ignored) {}
        }
    }

    private static boolean isTargetHost(String url) {
        try {
            String host = new URI(url).getHost();
            if (host == null) return false;
            for (String s : HOST_SUFFIXES) {
                if (host.equals(s) || host.endsWith("." + s)) return true;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    /** 从 JSON 文本快速抽 {@code code} 字段，不是 int 类型/对象就返 null。 */
    private static Integer extractCode(String text, ObjectMapper mapper) {
        try {
            JsonNode node = mapper.readTree(text);
            if (!node.isObject()) return null;
            JsonNode codeNode = node.get("code");
            if (codeNode == null || !codeNode.isInt()) return null;
            return codeNode.asInt();
        } catch (Exception e) {
            return null;
        }
    }

    /** 把 code 改成 0；同时清掉 message（避免前端弹错误条）。 */
    private static String rewriteCode(String text, ObjectMapper mapper) {
        try {
            ObjectNode obj = (ObjectNode) mapper.readTree(text);
            obj.put("code", 0);
            if (obj.has("message")) obj.put("message", "");
            return mapper.writeValueAsString(obj);
        } catch (Exception e) {
            return null;
        }
    }

    private static void forward(Route route, APIResponse resp) {
        try {
            Map<String, String> headers = sanitize(resp.headers());
            route.fulfill(new Route.FulfillOptions()
                    .setStatus(resp.status())
                    .setHeaders(headers)
                    .setBodyBytes(resp.body()));
        } catch (Exception e) {
            try { route.resume(); } catch (Exception ignored) {}
        }
    }

    private static void fulfillWithBody(Route route, APIResponse resp, String newBody) {
        try {
            Map<String, String> headers = sanitize(resp.headers());
            // 透传 Content-Type，但 status/length 由 Playwright 重算
            String ct = resp.headers().get("content-type");
            route.fulfill(new Route.FulfillOptions()
                    .setStatus(resp.status())
                    .setHeaders(headers)
                    .setContentType(ct == null ? "application/json" : ct)
                    .setBody(newBody));
        } catch (Exception e) {
            log.debug("[BossRiskBypass] fulfill 失败，降级透传: {}", e.getMessage());
            try { route.resume(); } catch (Exception ignored) {}
        }
    }

    /**
     * 移除会导致重压失败 / 长度错误的 hop-by-hop 头：
     *   Content-Encoding —— Playwright.body() 已经解压过，再带 'gzip' 浏览器会二次解压挂掉
     *   Content-Length   —— 我们改了 body，原长度无效；Playwright 会按新 body 自动设
     *   Transfer-Encoding —— chunked 由 Playwright 自己决定
     */
    private static Map<String, String> sanitize(Map<String, String> headers) {
        if (headers == null) return new HashMap<>();
        Map<String, String> out = new HashMap<>();
        for (Map.Entry<String, String> e : headers.entrySet()) {
            String k = e.getKey().toLowerCase();
            if (k.equals("content-encoding") || k.equals("content-length")
                    || k.equals("transfer-encoding")) continue;
            out.put(e.getKey(), e.getValue());
        }
        return out;
    }
}
