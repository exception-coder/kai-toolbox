package com.exceptioncoder.toolbox.mediaparser.parser;

import com.exceptioncoder.toolbox.mediaparser.config.PlaywrightManager;
import com.exceptioncoder.toolbox.mediaparser.domain.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.options.WaitUntilState;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 抖音 fallback：用 Playwright Chromium 加载分享页，从 _ROUTER_DATA / RENDER_DATA 提取视频 CDN 直链。
 */
@Slf4j
@Component
@Order(20)  // 比 SnapCdn fallback (10) 优先级再低，仅在 yt-dlp 真没救时启用
@ConditionalOnBean(PlaywrightManager.class)
public class DouyinPlaywrightParser implements PlatformParser {

    private static final String DOUYIN_REFERER = "https://www.douyin.com/";

    private final PlaywrightManager pw;
    private final ObjectMapper om;

    public DouyinPlaywrightParser(PlaywrightManager pw, ObjectMapper om) {
        this.pw = pw;
        this.om = om;
    }

    @Override
    public Set<Platform> supports() {
        return Set.of(Platform.DOUYIN);
    }

    @Override
    public ParseResult parse(String url) {
        log.info("[Douyin-PW] parse: {}", url);

        return pw.withPage(page -> {
            page.navigate(url, new com.microsoft.playwright.Page.NavigateOptions()
                    .setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
            log.info("[Douyin-PW] landed at: {} | title: {}", page.url(), page.title());

            // 抖音用了好几代结构：先尝试 _ROUTER_DATA，再尝试 RENDER_DATA <script>
            Object routerData = null;
            try {
                routerData = page.evaluate("() => window._ROUTER_DATA ?? null");
            } catch (Exception ignored) {}

            String renderDataRaw = null;
            try {
                renderDataRaw = (String) page.evaluate(
                        "() => document.getElementById('RENDER_DATA')?.textContent ?? null");
            } catch (Exception ignored) {}

            log.info("[Douyin-PW] _ROUTER_DATA present={}, RENDER_DATA present={}",
                    routerData != null, renderDataRaw != null);

            JsonNode root = null;
            try {
                if (routerData != null) {
                    root = om.valueToTree(routerData);
                } else if (renderDataRaw != null) {
                    String decoded = URLDecoder.decode(renderDataRaw, StandardCharsets.UTF_8);
                    root = om.readTree(decoded);
                }
            } catch (Exception e) {
                log.warn("[Douyin-PW] parse JSON failed: {}", e.getMessage());
            }

            if (root == null) {
                String html = page.content();
                log.warn("[Douyin-PW] no data found, page.content length={}\n{}",
                        html.length(), html.length() > 4000 ? html.substring(0, 4000) : html);
                throw new RuntimeException("抖音页面没有找到 _ROUTER_DATA 或 RENDER_DATA，结构可能已变");
            }

            log.info("[Douyin-PW] root JSON top-level keys: {}", fieldNames(root));
            return extract(url, root);
        });
    }

    private ParseResult extract(String url, JsonNode root) {
        // 在树里递归找第一个 play_addr.url_list；不同结构层次都行得通
        JsonNode itemNode = findFirstItemNode(root);
        if (itemNode == null) {
            log.warn("[Douyin-PW] cannot find item node. Full root JSON dump (truncated 8000):\n{}",
                    truncate(root.toPrettyString(), 8000));
            throw new RuntimeException("抖音页面 JSON 中未找到视频条目");
        }
        log.info("[Douyin-PW] found item node, keys: {}", fieldNames(itemNode));
        log.debug("[Douyin-PW] item node JSON sample (truncated 4000):\n{}",
                truncate(itemNode.toPrettyString(), 4000));

        String videoUrl = firstUrlIn(itemNode.path("video").path("play_addr").path("url_list"));
        // 优先使用无水印（playwm vs playwm。play 通常是无水印；play_addr 是带水印的）
        String videoUrlNoWatermark = firstUrlIn(itemNode.path("video").path("play_addr_lowbr").path("url_list"));
        if (videoUrlNoWatermark == null) videoUrlNoWatermark = videoUrl;
        // 抖音老套路：把 play_addr 中的 playwm 换成 play 拿无水印
        if (videoUrlNoWatermark != null && videoUrlNoWatermark.contains("playwm")) {
            videoUrlNoWatermark = videoUrlNoWatermark.replace("playwm", "play");
        }

        String title     = firstNonBlank(itemNode.path("desc").asText(null), itemNode.path("title").asText(null));
        String author    = itemNode.path("author").path("nickname").asText(null);
        String thumbnail = firstUrlIn(itemNode.path("video").path("cover").path("url_list"));

        if (videoUrlNoWatermark == null && videoUrl == null) {
            log.warn("[Douyin-PW] no playable URL in item: {}", itemNode);
            throw new RuntimeException("抖音条目中未找到视频直链");
        }

        List<MediaItem> items = new ArrayList<>();
        items.add(MediaItem.builder()
                .type(MediaItemType.VIDEO)
                .quality("无水印")
                .directUrl(videoUrlNoWatermark != null ? videoUrlNoWatermark : videoUrl)
                .referer(DOUYIN_REFERER)
                .mimeType("video/mp4")
                .build());
        log.info("[Douyin-PW] extracted: title={} author={} videoUrl={}", title, author,
                items.get(0).getDirectUrl());

        return ParseResult.builder()
                .platform(Platform.DOUYIN)
                .type(ResultType.VIDEO)
                .title(title)
                .author(author)
                .thumbnail(thumbnail)
                .items(items)
                .originalUrl(url)
                .build();
    }

    /** 递归找第一个像 video item 的节点（同时含 video.play_addr 和 author 字段）。 */
    private JsonNode findFirstItemNode(JsonNode node) {
        if (node == null || node.isMissingNode()) return null;
        if (node.has("video") && node.path("video").has("play_addr")) return node;
        if (node.isArray()) {
            for (JsonNode child : node) {
                JsonNode hit = findFirstItemNode(child);
                if (hit != null) return hit;
            }
        } else if (node.isObject()) {
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

    private String truncate(String s, int max) {
        if (s == null || s.length() <= max) return s;
        return s.substring(0, max) + "\n...(truncated, total " + s.length() + " chars)";
    }
}
