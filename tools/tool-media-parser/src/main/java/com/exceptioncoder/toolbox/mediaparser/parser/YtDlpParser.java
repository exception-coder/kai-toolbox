package com.exceptioncoder.toolbox.mediaparser.parser;

import com.exceptioncoder.toolbox.mediaparser.config.MediaParserProperties;
import com.exceptioncoder.toolbox.mediaparser.config.ProxyConfig;
import com.exceptioncoder.toolbox.mediaparser.domain.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 通过本地 yt-dlp 解析分享链接，提取元数据与可用格式。
 * 实际文件下载由 MediaParserController.download() 代理完成，不在此处暴露 CDN 直链。
 */
@Slf4j
@Component
@Order(1)
public class YtDlpParser implements PlatformParser {

    public static final String FORMAT_VIDEO = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
    public static final String FORMAT_AUDIO = "bestaudio[ext=m4a]/bestaudio";

    private final String binary;
    private final int timeoutSeconds;
    private final ObjectMapper objectMapper;
    private final ProxyConfig proxyConfig;

    public YtDlpParser(MediaParserProperties props, ProxyConfig proxyConfig, ObjectMapper objectMapper) {
        this.binary = props.getYtDlpBinary();
        this.timeoutSeconds = props.getReadTimeoutSeconds();
        this.objectMapper = objectMapper;
        this.proxyConfig = proxyConfig;
    }

    @Override
    public Set<Platform> supports() {
        return Set.of(
                Platform.TIKTOK, Platform.DOUYIN, Platform.INSTAGRAM,
                Platform.YOUTUBE, Platform.TWITTER, Platform.REDDIT,
                Platform.PINTEREST, Platform.FACEBOOK, Platform.BILIBILI,
                Platform.XIAOHONGSHU
        );
    }

    @Override
    public ParseResult parse(String url) {
        log.debug("yt-dlp parse: {}", url);
        // 不加 --quiet/--no-warnings：JSON 走 stdout，extractor 提示和警告都留在 stderr 便于诊断。
        List<String> cmd = new ArrayList<>(List.of(binary, "--dump-json", "--no-playlist"));
        if (proxyConfig.isEnabled()) {
            cmd.add("--proxy");
            cmd.add(proxyConfig.getRawUrl());
        }
        cmd.add(url.trim());
        log.info("[yt-dlp] cmd = {}", cmd);

        Process process;
        try {
            process = new ProcessBuilder(cmd).start();
        } catch (IOException e) {
            throw new RuntimeException("启动 yt-dlp 失败，请检查 toolbox.media-parser.yt-dlp-binary 配置: " + e.getMessage(), e);
        }

        String stdout, stderr;
        try {
            stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            stderr = new String(process.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new RuntimeException("yt-dlp 解析超时（>" + timeoutSeconds + "s）");
            }
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException("读取 yt-dlp 输出失败: " + e.getMessage(), e);
        }

        log.info("[yt-dlp] exit={} url={}\n--- stdout ({} chars) ---\n{}\n--- stderr ---\n{}\n--- end ---",
                process.exitValue(), url, stdout.length(),
                stdout.length() > 4000 ? stdout.substring(0, 4000) + "\n...(truncated)..." : stdout,
                stderr.isBlank() ? "(empty)" : stderr);

        if (process.exitValue() != 0) {
            String msg = stderr.lines()
                    .filter(l -> !l.isBlank() && !l.startsWith("["))
                    .findFirst()
                    .orElseGet(() -> stderr.lines().filter(l -> !l.isBlank()).findFirst().orElse("unknown error"));
            throw new RuntimeException("yt-dlp 解析失败: " + msg);
        }

        try {
            JsonNode root = objectMapper.readTree(stdout.trim());
            return mapToResult(url.trim(), root);
        } catch (Exception e) {
            throw new RuntimeException("解析 yt-dlp 输出失败: " + e.getMessage(), e);
        }
    }

    private ParseResult mapToResult(String url, JsonNode root) {
        Platform platform = Platform.detect(url);
        String title = root.path("title").asText(null);
        String author = firstNonNull(
                root.path("uploader").asText(null),
                root.path("channel").asText(null),
                root.path("creator").asText(null)
        );
        String thumbnail = root.path("thumbnail").asText(null);
        List<MediaItem> items = buildItems(root);

        return ParseResult.builder()
                .platform(platform)
                .type(ResultType.VIDEO)
                .title(title)
                .author(author)
                .thumbnail(thumbnail)
                .items(items)
                .originalUrl(url)
                .build();
    }

    private List<MediaItem> buildItems(JsonNode root) {
        List<MediaItem> items = new ArrayList<>();

        // 视频：找最高分辨率用于质量标签展示
        String videoQuality = bestVideoQuality(root);
        items.add(MediaItem.builder()
                .type(MediaItemType.VIDEO)
                .quality(videoQuality)
                .formatSelector(FORMAT_VIDEO)
                .mimeType("video/mp4")
                .build());

        // 音频：始终提供，方便提取背景音乐
        items.add(MediaItem.builder()
                .type(MediaItemType.AUDIO)
                .quality("仅音频")
                .formatSelector(FORMAT_AUDIO)
                .mimeType("audio/mp4")
                .build());

        return items;
    }

    private String bestVideoQuality(JsonNode root) {
        JsonNode formats = root.path("formats");
        if (!formats.isArray()) return "best";
        int maxHeight = 0;
        for (JsonNode fmt : formats) {
            String vcodec = fmt.path("vcodec").asText("none");
            if ("none".equals(vcodec) || vcodec.isBlank()) continue;
            int h = fmt.path("height").asInt(0);
            if (h > maxHeight) maxHeight = h;
        }
        return maxHeight > 0 ? maxHeight + "p" : "best";
    }

    private String firstNonNull(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }
}
