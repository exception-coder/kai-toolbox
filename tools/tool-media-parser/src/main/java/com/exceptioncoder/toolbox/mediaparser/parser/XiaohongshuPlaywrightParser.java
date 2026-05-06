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

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

/**
 * 小红书 fallback：用 Playwright 加载 explore 页，从 __INITIAL_STATE__ 提取视频或图集。
 */
@Slf4j
@Component
@Order(20)
@ConditionalOnBean(PlaywrightManager.class)
public class XiaohongshuPlaywrightParser implements PlatformParser {

    private static final String XHS_REFERER = "https://www.xiaohongshu.com/";

    private final PlaywrightManager pw;
    private final ObjectMapper om;

    public XiaohongshuPlaywrightParser(PlaywrightManager pw, ObjectMapper om) {
        this.pw = pw;
        this.om = om;
    }

    @Override
    public Set<Platform> supports() {
        return Set.of(Platform.XIAOHONGSHU);
    }

    @Override
    public ParseResult parse(String url) {
        log.info("[XHS-PW] parse: {}", url);

        return pw.withPage(page -> {
            page.navigate(url, new com.microsoft.playwright.Page.NavigateOptions()
                    .setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
            log.info("[XHS-PW] landed at: {} | title: {}", page.url(), page.title());

            // __INITIAL_STATE__ 是 SSR 注入的全局变量。等它出现。
            try {
                page.waitForFunction("() => !!window.__INITIAL_STATE__");
            } catch (Exception e) {
                String html = page.content();
                log.warn("[XHS-PW] __INITIAL_STATE__ never appeared (probably blocked by Cloudflare/login). page.content sample:\n{}",
                        html.length() > 4000 ? html.substring(0, 4000) : html);
                throw new RuntimeException("小红书未注入 __INITIAL_STATE__，疑似风控/登录墙: " + e.getMessage());
            }

            Object stateObj = page.evaluate("() => window.__INITIAL_STATE__");
            JsonNode state;
            try {
                state = om.valueToTree(stateObj);
            } catch (Exception e) {
                throw new RuntimeException("解析 __INITIAL_STATE__ 失败: " + e.getMessage(), e);
            }
            log.info("[XHS-PW] __INITIAL_STATE__ top-level keys: {}", fieldNames(state));

            JsonNode note = findNoteNode(state);
            if (note == null) {
                log.warn("[XHS-PW] cannot locate note. Full __INITIAL_STATE__ dump (truncated 8000):\n{}",
                        truncate(state.toPrettyString(), 8000));
                String html = page.content();
                log.warn("[XHS-PW] page.content sample:\n{}",
                        html.length() > 4000 ? html.substring(0, 4000) : html);
                throw new RuntimeException("小红书页面未找到笔记数据，可能是登录态/风控限制");
            }
            log.info("[XHS-PW] note keys: {}, type={}", fieldNames(note), note.path("type").asText("?"));
            log.debug("[XHS-PW] note JSON sample (truncated 4000):\n{}",
                    truncate(note.toPrettyString(), 4000));

            return extract(url, note);
        });
    }

    private ParseResult extract(String url, JsonNode note) {
        String title     = firstNonBlank(note.path("title").asText(null), note.path("desc").asText(null));
        String author    = firstNonBlank(
                note.path("user").path("nickname").asText(null),
                note.path("user").path("nickName").asText(null));
        String type      = note.path("type").asText("normal");
        String thumbnail = firstUrlInImageList(note.path("imageList"));

        List<MediaItem> items = new ArrayList<>();

        // 视频笔记
        JsonNode video = note.path("video");
        if (!video.isMissingNode() && !video.isNull()) {
            String videoUrl = findFirstVideoUrl(video);
            if (videoUrl != null) {
                items.add(MediaItem.builder()
                        .type(MediaItemType.VIDEO)
                        .quality("HD")
                        .directUrl(videoUrl)
                        .referer(XHS_REFERER)
                        .mimeType("video/mp4")
                        .build());
                log.info("[XHS-PW] video URL: {}", videoUrl);
            }
        }

        // 图集笔记（也可能与视频共存）
        JsonNode imageList = note.path("imageList");
        if (imageList.isArray()) {
            for (JsonNode img : imageList) {
                String imgUrl = firstNonBlank(
                        img.path("urlDefault").asText(null),
                        img.path("url").asText(null));
                if (imgUrl != null) {
                    items.add(MediaItem.builder()
                            .type(MediaItemType.IMAGE)
                            .directUrl(imgUrl)
                            .referer(XHS_REFERER)
                            .mimeType("image/jpeg")
                            .build());
                }
            }
            log.info("[XHS-PW] images count: {}", imageList.size());
        }

        if (items.isEmpty()) {
            throw new RuntimeException("小红书笔记中未找到任何可下载内容（type=" + type + "）");
        }

        ResultType resultType = items.stream().anyMatch(i -> i.getType() == MediaItemType.VIDEO)
                ? ResultType.VIDEO
                : ResultType.VIDEO; // 暂无 IMAGE 枚举值，先复用 VIDEO；后续可加

        return ParseResult.builder()
                .platform(Platform.XIAOHONGSHU)
                .type(resultType)
                .title(title)
                .author(author)
                .thumbnail(thumbnail)
                .items(items)
                .originalUrl(url)
                .build();
    }

    /** 在 __INITIAL_STATE__ 里找 note 详情节点（结构经常变，递归找含 imageList 或 video 的节点）。 */
    private JsonNode findNoteNode(JsonNode root) {
        // 优先看常见路径 note.noteDetailMap.*.note
        JsonNode detailMap = root.path("note").path("noteDetailMap");
        if (detailMap.isObject()) {
            Iterator<JsonNode> it = detailMap.elements();
            while (it.hasNext()) {
                JsonNode entry = it.next().path("note");
                if (looksLikeNote(entry)) return entry;
            }
        }
        return findFirst(root, this::looksLikeNote);
    }

    private boolean looksLikeNote(JsonNode n) {
        if (n == null || !n.isObject()) return false;
        boolean hasMedia = (n.has("video") && !n.path("video").isNull())
                || (n.has("imageList") && n.path("imageList").isArray() && n.path("imageList").size() > 0);
        boolean hasMeta = n.has("title") || n.has("desc") || n.has("user");
        return hasMedia && hasMeta;
    }

    private JsonNode findFirst(JsonNode node, java.util.function.Predicate<JsonNode> pred) {
        if (node == null || node.isMissingNode()) return null;
        if (pred.test(node)) return node;
        if (node.isArray() || node.isObject()) {
            for (JsonNode child : node) {
                JsonNode hit = findFirst(child, pred);
                if (hit != null) return hit;
            }
        }
        return null;
    }

    private String findFirstVideoUrl(JsonNode video) {
        // video.media.stream.h264[].masterUrl / backupUrls[0]
        JsonNode streams = video.path("media").path("stream");
        for (JsonNode codec : streams) {
            if (codec.isArray()) {
                for (JsonNode s : codec) {
                    String u = firstNonBlank(s.path("masterUrl").asText(null),
                            firstUrlInArray(s.path("backupUrls")));
                    if (u != null) return u;
                }
            }
        }
        // 兜底：递归找 masterUrl
        JsonNode found = findFirst(video, n -> n.has("masterUrl") && !n.path("masterUrl").asText("").isBlank());
        if (found != null) return found.path("masterUrl").asText(null);
        return null;
    }

    private String firstUrlInArray(JsonNode array) {
        if (!array.isArray()) return null;
        for (JsonNode n : array) {
            String s = n.asText(null);
            if (s != null && !s.isBlank()) return s;
        }
        return null;
    }

    private String firstUrlInImageList(JsonNode imageList) {
        if (!imageList.isArray()) return null;
        for (JsonNode img : imageList) {
            String u = firstNonBlank(
                    img.path("urlDefault").asText(null),
                    img.path("url").asText(null));
            if (u != null) return u;
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
