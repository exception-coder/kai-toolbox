package com.exceptioncoder.toolbox.mediaparser.parser;

import com.exceptioncoder.toolbox.mediaparser.config.PageDumpWriter;
import com.exceptioncoder.toolbox.mediaparser.config.PlaywrightManager;
import com.exceptioncoder.toolbox.mediaparser.domain.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Response;
import com.microsoft.playwright.options.WaitUntilState;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 抖音 fallback 解析器：
 * 1. 主路径：v.douyin.com/{shortcode} → 跟随重定向取 aweme_id → 直接打开 iesdouyin 分享页（仍然有完整 RENDER_DATA）
 * 2. 兜底：iesdouyin 也提取不到时，回到 www.douyin.com 等 /aweme/v1/web/aweme/detail/ XHR 拦截响应
 * 3. 失败时把页面 + JSON 转储到 PageDumpWriter，便于离线对比字段
 */
@Slf4j
@Component
@Order(20)
@ConditionalOnBean(PlaywrightManager.class)
public class DouyinPlaywrightParser implements PlatformParser {

    private static final String DOUYIN_REFERER = "https://www.douyin.com/";
    private static final Pattern AWEME_ID_PATTERN = Pattern.compile("/(?:share/)?video/(\\d+)");
    private static final Pattern AWEME_DETAIL_API = Pattern.compile("/aweme/v\\d/web/aweme/detail/?");

    private final PlaywrightManager pw;
    private final ObjectMapper om;
    private final PageDumpWriter dumper;

    public DouyinPlaywrightParser(PlaywrightManager pw, ObjectMapper om, PageDumpWriter dumper) {
        this.pw = pw;
        this.om = om;
        this.dumper = dumper;
    }

    @Override
    public Set<Platform> supports() {
        return Set.of(Platform.DOUYIN);
    }

    @Override
    public ParseResult parse(String url) {
        log.info("[Douyin-PW] parse: {}", url);
        return pw.withPage(page -> doParse(page, url));
    }

    private ParseResult doParse(Page page, String url) {
        // ── 阶段 1：解析短链 → 拿 aweme_id ────────────────────────────────────
        page.navigate(url, new Page.NavigateOptions().setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
        log.info("[Douyin-PW] redirected to: {} | title: {}", page.url(), page.title());

        String awemeId = extractAwemeId(page.url());
        if (awemeId == null) {
            // 短链没把 id 暴露在 URL 里。直接尝试当前页面的方案3 兜底
            log.warn("[Douyin-PW] aweme_id not in URL, fall back to XHR interception");
            return tryXhrInterception(page, url, null);
        }
        log.info("[Douyin-PW] extracted aweme_id={}", awemeId);

        // ── 阶段 2：方案1 — 直接访问 iesdouyin 分享页 ──────────────────────
        String shareUrl = "https://www.iesdouyin.com/share/video/" + awemeId + "/";
        page.navigate(shareUrl, new Page.NavigateOptions().setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
        log.info("[Douyin-PW] iesdouyin landed at: {} | title: {}", page.url(), page.title());

        JsonNode root = readRouterAndRenderData(page);
        if (root != null) {
            log.info("[Douyin-PW] iesdouyin root keys: {}", fieldNames(root));
            JsonNode itemNode = findFirstItemNode(root);
            if (itemNode != null) {
                log.info("[Douyin-PW] item via iesdouyin, keys: {}", fieldNames(itemNode));
                return buildFromItem(url, awemeId, itemNode);
            }
            log.warn("[Douyin-PW] iesdouyin no item node, falling through to XHR");
        } else {
            log.warn("[Douyin-PW] iesdouyin had neither _ROUTER_DATA nor RENDER_DATA");
        }

        // ── 阶段 3：方案3 兜底 — 回 www.douyin.com 等 XHR ────────────────────
        return tryXhrInterception(page, url, awemeId);
    }

    /** 方案3：监听 /aweme/v1/web/aweme/detail/ 响应，从中提取 aweme_detail。 */
    private ParseResult tryXhrInterception(Page page, String url, String awemeId) {
        String navUrl = (awemeId != null)
                ? "https://www.douyin.com/video/" + awemeId
                : url;
        log.info("[Douyin-PW] XHR fallback, navigating: {}", navUrl);

        try {
            Response resp = page.waitForResponse(
                    r -> AWEME_DETAIL_API.matcher(r.url()).find() && r.status() == 200,
                    () -> page.navigate(navUrl, new Page.NavigateOptions().setWaitUntil(WaitUntilState.DOMCONTENTLOADED))
            );
            String body = resp.text();
            log.info("[Douyin-PW] captured XHR: {} ({} bytes)", resp.url(), body.length());

            JsonNode root = om.readTree(body);
            JsonNode item = root.path("aweme_detail");
            if (item.isMissingNode() || item.isNull()) item = findFirstItemNode(root);
            if (item == null) {
                Path dump = dumper.dump("douyin-xhr-no-item", url, page, root.toPrettyString());
                throw new RuntimeException("抖音 XHR 中未找到视频 detail（已转储 " + (dump != null ? dump.toAbsolutePath() : "失败") + "）");
            }
            return buildFromItem(url, awemeId, item);
        } catch (com.microsoft.playwright.PlaywrightException e) {
            // waitForResponse 超时 / 解析异常都进这里
            Path dump = dumper.dump("douyin-xhr-timeout", url, page, null);
            throw new RuntimeException("抖音 XHR 拦截失败: " + e.getMessage()
                    + (dump != null ? "（已转储 " + dump.toAbsolutePath() + "）" : ""), e);
        } catch (Exception e) {
            Path dump = dumper.dump("douyin-xhr-error", url, page, null);
            throw new RuntimeException("抖音 XHR 解析失败: " + e.getMessage()
                    + (dump != null ? "（已转储 " + dump.toAbsolutePath() + "）" : ""), e);
        }
    }

    /** 在浏览器里 JSON.stringify 断环再 marshal，避免响应式 store 的循环引用引发栈溢出。 */
    private static final String SAFE_STRINGIFY_ROUTER_DATA = """
            () => {
                const s = window._ROUTER_DATA;
                if (s === null || s === undefined) return null;
                const seen = new WeakSet();
                try {
                    return JSON.stringify(s, (k, v) => {
                        if (typeof v === 'object' && v !== null) {
                            if (seen.has(v)) return undefined;
                            seen.add(v);
                        }
                        if (typeof v === 'function') return undefined;
                        return v;
                    });
                } catch (e) { return null; }
            }
            """;

    /** 抖音页面同时可能有 _ROUTER_DATA（新版）或 RENDER_DATA（旧版/iesdouyin），都试一次。 */
    private JsonNode readRouterAndRenderData(Page page) {
        try {
            Object routerJson = page.evaluate(SAFE_STRINGIFY_ROUTER_DATA);
            if (routerJson != null) return om.readTree(routerJson.toString());
        } catch (Exception ignored) {}

        try {
            String renderData = (String) page.evaluate(
                    "() => document.getElementById('RENDER_DATA')?.textContent ?? null");
            if (renderData != null && !renderData.isBlank()) {
                return om.readTree(URLDecoder.decode(renderData, StandardCharsets.UTF_8));
            }
        } catch (Exception ignored) {}

        return null;
    }

    private String extractAwemeId(String url) {
        if (url == null) return null;
        Matcher m = AWEME_ID_PATTERN.matcher(url);
        return m.find() ? m.group(1) : null;
    }

    private ParseResult buildFromItem(String originalUrl, String awemeId, JsonNode itemNode) {
        String videoUrl = firstUrlIn(itemNode.path("video").path("play_addr").path("url_list"));
        if (videoUrl == null) videoUrl = firstUrlIn(itemNode.path("video").path("playApi").path("url_list"));
        // 抖音老套路：playwm 改 play 拿无水印
        if (videoUrl != null && videoUrl.contains("playwm")) {
            videoUrl = videoUrl.replace("playwm", "play");
        }

        if (videoUrl == null) {
            throw new RuntimeException("抖音条目中未找到视频直链 (aweme_id=" + awemeId + ")");
        }

        String title     = firstNonBlank(itemNode.path("desc").asText(null), itemNode.path("title").asText(null));
        String author    = itemNode.path("author").path("nickname").asText(null);
        String thumbnail = firstUrlIn(itemNode.path("video").path("cover").path("url_list"));

        log.info("[Douyin-PW] extracted: title={} author={} videoUrl={}", title, author, videoUrl);

        return ParseResult.builder()
                .platform(Platform.DOUYIN)
                .type(ResultType.VIDEO)
                .title(title)
                .author(author)
                .thumbnail(thumbnail)
                .items(List.of(MediaItem.builder()
                        .type(MediaItemType.VIDEO)
                        .quality("无水印")
                        .directUrl(videoUrl)
                        .referer(DOUYIN_REFERER)
                        .mimeType("video/mp4")
                        .build()))
                .originalUrl(originalUrl)
                .build();
    }

    /** 在树里递归找第一个含 video.play_addr 的节点。 */
    private JsonNode findFirstItemNode(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        if (node.has("video") && node.path("video").has("play_addr")) return node;
        if (node.isArray() || node.isObject()) {
            for (JsonNode child : node) {
                JsonNode hit = findFirstItemNode(child);
                if (hit != null) return hit;
            }
        }
        return null;
    }

    private String firstUrlIn(JsonNode urlList) {
        if (!urlList.isArray()) return null;
        for (JsonNode u : urlList) {
            String s = u.asText(null);
            if (s != null && !s.isBlank()) return s;
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        for (String v : values) if (v != null && !v.isBlank()) return v;
        return null;
    }

    private List<String> fieldNames(JsonNode node) {
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

}
