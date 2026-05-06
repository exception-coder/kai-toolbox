package com.exceptioncoder.toolbox.mediaparser.parser;

import com.exceptioncoder.toolbox.mediaparser.config.MediaParserProperties;
import com.exceptioncoder.toolbox.mediaparser.config.ProxyConfig;
import com.exceptioncoder.toolbox.mediaparser.domain.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Abstract base for sites using the SnapCDN download API pattern:
 * 1. GET {baseUrl}/en → extract k_token + k_exp from hidden inputs / scripts
 * 2. POST {baseUrl}/api/ajaxSearch with form data → JSON response with HTML payload
 * 3. Parse HTML → collect dl.snapcdn.app download links
 */
@Slf4j
public abstract class SnapCdnParser implements PlatformParser {

    private static final Pattern K_TOKEN_PATTERN = Pattern.compile("k_token[\"']?\\s*[=:]\\s*[\"']([^\"']+)[\"']");
    private static final Pattern K_EXP_PATTERN   = Pattern.compile("k_exp[\"']?\\s*[=:]\\s*[\"']([^\"']+)[\"']");
    private static final String  USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

    private final String baseUrl;
    private final MediaParserProperties props;
    private final ProxyConfig proxyConfig;
    private final ObjectMapper objectMapper;

    protected SnapCdnParser(String baseUrl, MediaParserProperties props, ProxyConfig proxyConfig, ObjectMapper objectMapper) {
        this.baseUrl = baseUrl;
        this.props = props;
        this.proxyConfig = proxyConfig;
        this.objectMapper = objectMapper;
    }

    @Override
    public ParseResult parse(String url) {
        log.debug("SnapCdnParser[{}] parse: {}", baseUrl, url);

        Connection.Response homeResp;
        Document homePage;
        try {
            homeResp = applyProxy(Jsoup.connect(baseUrl + "/en")
                    .userAgent(USER_AGENT)
                    .timeout(props.getConnectTimeoutSeconds() * 1000)
                    .ignoreContentType(true))
                    .execute();
            log.info("[SnapCdn] GET {}/en → status={}\n--- response body (first 2000 chars) ---\n{}\n---",
                    baseUrl, homeResp.statusCode(),
                    homeResp.body().substring(0, Math.min(homeResp.body().length(), 2000)));
            homePage = homeResp.parse();
        } catch (IOException e) {
            throw new RuntimeException("无法访问 " + baseUrl + ": " + e.getMessage(), e);
        }
        String kToken = extractToken(homePage, "k_token", K_TOKEN_PATTERN);
        String kExp   = extractToken(homePage, "k_exp",   K_EXP_PATTERN);
        log.info("[SnapCdn] extracted k_token={} k_exp={}", kToken, kExp);

        if (kToken == null || kExp == null) {
            throw new RuntimeException("无法从 " + baseUrl + " 提取 token，站点结构可能已变更");
        }

        String responseBody;
        try {
            Connection.Response resp = applyProxy(Jsoup.connect(baseUrl + "/api/ajaxSearch")
                    .userAgent(USER_AGENT)
                    .header("Origin", baseUrl)
                    .header("Referer", baseUrl + "/en")
                    .header("X-Requested-With", "XMLHttpRequest")
                    .data("q", url)
                    .data("lang", "en")
                    .data("v", "v2")
                    .data("k_token", kToken)
                    .data("k_exp", kExp)
                    .method(Connection.Method.POST)
                    .timeout(props.getReadTimeoutSeconds() * 1000)
                    .ignoreContentType(true))
                    .execute();
            responseBody = resp.body();
            log.info("[SnapCdn] POST {}/api/ajaxSearch → status={}\n--- response body ---\n{}\n---",
                    baseUrl, resp.statusCode(), responseBody);
        } catch (IOException e) {
            throw new RuntimeException("调用 " + baseUrl + "/api/ajaxSearch 失败: " + e.getMessage(), e);
        }

        return buildResult(url, responseBody);
    }

    private Connection applyProxy(Connection conn) {
        return proxyConfig.isEnabled() ? conn.proxy(proxyConfig.getJavaProxy()) : conn;
    }

    private String extractToken(Document doc, String name, Pattern pattern) {
        Element input = doc.selectFirst("input[name=" + name + "]");
        if (input != null) {
            String val = input.attr("value");
            if (!val.isBlank()) return val;
        }
        for (Element script : doc.select("script")) {
            Matcher m = pattern.matcher(script.data());
            if (m.find()) return m.group(1);
        }
        return null;
    }

    private ParseResult buildResult(String url, String responseBody) {
        String dataHtml;
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            dataHtml = root.path("data").asText(null);
        } catch (Exception e) {
            throw new RuntimeException("解析 " + baseUrl + " 响应失败: " + e.getMessage(), e);
        }

        if (dataHtml == null || dataHtml.isBlank()) {
            throw new RuntimeException(baseUrl + " 返回的数据为空，链接可能无效");
        }

        Document doc = Jsoup.parse(dataHtml);
        Elements links = doc.select("a[href*=snapcdn.app/download], a.abutton[href], a[href*=/download?token]");
        if (links.isEmpty()) {
            throw new RuntimeException(baseUrl + " 未找到下载链接");
        }

        List<MediaItem> items = new ArrayList<>();
        for (Element link : links) {
            String href = link.attr("href");
            if (href.isBlank() || href.startsWith("#")) continue;

            String text = link.text().toLowerCase();
            MediaItemType itemType = inferType(href, text);
            String mimeType = switch (itemType) {
                case AUDIO -> "audio/mp4";
                case IMAGE -> "image/jpeg";
                default    -> "video/mp4";
            };

            items.add(MediaItem.builder()
                    .type(itemType)
                    .quality(inferQuality(link, text))
                    .directUrl(href)
                    .mimeType(mimeType)
                    .build());
        }

        if (items.isEmpty()) {
            throw new RuntimeException(baseUrl + " 未找到有效下载链接");
        }

        return ParseResult.builder()
                .platform(Platform.detect(url))
                .type(ResultType.VIDEO)
                .items(items)
                .originalUrl(url)
                .build();
    }

    private MediaItemType inferType(String href, String text) {
        String lhref = href.toLowerCase();
        if (text.contains("audio") || text.contains("music") || text.contains("mp3")
                || lhref.contains(".mp3")) {
            return MediaItemType.AUDIO;
        }
        if (text.contains("image") || text.contains("photo")
                || lhref.matches(".*\\.(jpg|jpeg|png|webp|gif)(\\?.*)?")) {
            return MediaItemType.IMAGE;
        }
        return MediaItemType.VIDEO;
    }

    private String inferQuality(Element link, String text) {
        String q = link.attr("data-quality");
        if (!q.isBlank()) return q;
        if (text.contains("1080") || text.contains("full hd") || text.contains("fhd")) return "1080p";
        if (text.contains("720") || text.contains(" hd")) return "HD";
        if (text.contains("480")) return "480p";
        if (text.contains("360")) return "360p";
        if (text.contains("no watermark") || text.contains("without watermark")) return "无水印";
        if (text.contains("watermark")) return "有水印";
        return null;
    }
}
