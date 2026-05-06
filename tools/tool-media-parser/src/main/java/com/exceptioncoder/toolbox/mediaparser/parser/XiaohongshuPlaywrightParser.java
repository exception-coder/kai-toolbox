package com.exceptioncoder.toolbox.mediaparser.parser;

import com.exceptioncoder.toolbox.mediaparser.config.PageDumpWriter;
import com.exceptioncoder.toolbox.mediaparser.config.PlaywrightManager;
import com.exceptioncoder.toolbox.mediaparser.domain.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.options.WaitUntilState;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Set;

/**
 * 小红书 fallback：
 * - XHS web 客户端是纯 SPA，__INITIAL_STATE__ 由框架先 = {} 占位、运行时 XHR 拉数据再 hydrate
 * - 主路径：监听 /api/sns/ 返回的 JSON，拿到笔记直接解析
 * - 兜底：周期检查 __INITIAL_STATE__ 是否真的填上数据（hydration 完成）
 * - 失败转储页面 + 已抓到的 XHR JSON 便于离线对比字段
 */
@Slf4j
@Component
@Order(20)
@ConditionalOnBean(PlaywrightManager.class)
public class XiaohongshuPlaywrightParser implements PlatformParser {

    private static final String XHS_REFERER = "https://www.xiaohongshu.com/";
    private static final long HYDRATE_DEADLINE_MS = 12_000;
    private static final long POLL_INTERVAL_MS = 400;

    private final PlaywrightManager pw;
    private final ObjectMapper om;
    private final PageDumpWriter dumper;

    public XiaohongshuPlaywrightParser(PlaywrightManager pw, ObjectMapper om, PageDumpWriter dumper) {
        this.pw = pw;
        this.om = om;
        this.dumper = dumper;
    }

    @Override
    public Set<Platform> supports() {
        return Set.of(Platform.XIAOHONGSHU);
    }

    @Override
    public ParseResult parse(String url) {
        log.info("[XHS-PW] parse: {}", url);
        return pw.withPage(page -> doParse(page, url));
    }

    private ParseResult doParse(Page page, String url) {
        // 提前装上响应监听，捕获 XHS 接口 JSON。注意：onResponse 在 Playwright worker 线程上回调
        List<JsonNode> capturedJson = Collections.synchronizedList(new ArrayList<>());
        List<String> capturedUrls = Collections.synchronizedList(new ArrayList<>());

        page.onResponse(resp -> {
            String u = resp.url();
            if (resp.status() != 200) return;
            // /api/sns/ 是 XHS web 接口前缀；只关心 JSON 响应
            if (!u.contains("/api/sns/")) return;
            try {
                String body = resp.text();
                if (body == null || body.isBlank()) return;
                String trimmed = body.stripLeading();
                if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
                JsonNode json = om.readTree(body);
                capturedJson.add(json);
                capturedUrls.add(u);
                log.info("[XHS-PW] captured XHR: {} ({} bytes)", u, body.length());
            } catch (Exception e) {
                log.debug("[XHS-PW] skip XHR {}: {}", u, e.getMessage());
            }
        });

        page.navigate(url, new Page.NavigateOptions().setWaitUntil(WaitUntilState.DOMCONTENTLOADED));
        log.info("[XHS-PW] landed at: {} | title: {}", page.url(), page.title());

        // 周期检查：__INITIAL_STATE__ 已 hydrate？XHR 已抓到含 note 的响应？
        long deadline = System.currentTimeMillis() + HYDRATE_DEADLINE_MS;
        JsonNode note = null;
        String foundIn = null;

        while (System.currentTimeMillis() < deadline) {
            // 1) 已抓到的 XHR 里找
            synchronized (capturedJson) {
                for (int i = 0; i < capturedJson.size(); i++) {
                    JsonNode candidate = findNoteNode(capturedJson.get(i));
                    if (candidate != null) {
                        note = candidate;
                        foundIn = "XHR " + capturedUrls.get(i);
                        break;
                    }
                }
            }
            if (note != null) break;

            // 2) __INITIAL_STATE__ 是否真的有 keys 了
            JsonNode state = readInitialState(page);
            if (state != null && state.size() > 0) {
                JsonNode candidate = findNoteNode(state);
                if (candidate != null) {
                    note = candidate;
                    foundIn = "__INITIAL_STATE__";
                    break;
                }
            }

            page.waitForTimeout(POLL_INTERVAL_MS);
        }

        if (note == null) {
            // 转储所有抓到的 XHR JSON 拼一起，便于事后翻
            StringBuilder allCaptured = new StringBuilder();
            synchronized (capturedJson) {
                for (int i = 0; i < capturedJson.size(); i++) {
                    allCaptured.append("--- XHR ").append(i).append(": ").append(capturedUrls.get(i)).append(" ---\n");
                    allCaptured.append(capturedJson.get(i).toPrettyString()).append("\n\n");
                }
            }
            String extracted = allCaptured.length() > 0 ? allCaptured.toString() : null;
            Path dump = dumper.dump("xhs-no-note", url, page, extracted);
            throw new RuntimeException("小红书页面未找到笔记数据（已等 " + HYDRATE_DEADLINE_MS + "ms，"
                    + "捕获 " + capturedJson.size() + " 个 XHR）"
                    + (dump != null ? "（已转储 " + dump.toAbsolutePath() + "）" : ""));
        }

        log.info("[XHS-PW] note found via {}, keys={}, type={}",
                foundIn, fieldNames(note), note.path("type").asText("?"));
        log.debug("[XHS-PW] note JSON sample (truncated 4000):\n{}",
                truncate(note.toPrettyString(), 4000));

        return extract(url, note);
    }

    private JsonNode readInitialState(Page page) {
        try {
            Object stateObj = page.evaluate("() => window.__INITIAL_STATE__");
            return stateObj != null ? om.valueToTree(stateObj) : null;
        } catch (Exception e) {
            return null;
        }
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

        return ParseResult.builder()
                .platform(Platform.XIAOHONGSHU)
                .type(ResultType.VIDEO)
                .title(title)
                .author(author)
                .thumbnail(thumbnail)
                .items(items)
                .originalUrl(url)
                .build();
    }

    /** 递归找含 imageList 或 video 的节点。 */
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
        // 再看 data.items[*].note_card / data.note_list[*] 等 XHR feed 常见结构
        JsonNode dataItems = root.path("data").path("items");
        if (dataItems.isArray()) {
            for (JsonNode item : dataItems) {
                JsonNode card = item.path("note_card");
                if (looksLikeNote(card)) return card;
                if (looksLikeNote(item)) return item;
            }
        }
        return findFirst(root, this::looksLikeNote);
    }

    private boolean looksLikeNote(JsonNode n) {
        if (n == null || !n.isObject()) return false;
        boolean hasMedia = (n.has("video") && !n.path("video").isNull())
                || (n.has("imageList") && n.path("imageList").isArray() && n.path("imageList").size() > 0)
                || (n.has("image_list") && n.path("image_list").isArray() && n.path("image_list").size() > 0);
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
