package com.exceptioncoder.toolbox.mediaparser.config;

import com.microsoft.playwright.Page;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 把解析失败时的页面状态（最终 URL / 页面 HTML / 抽出的 JSON）写到磁盘，
 * 便于事后逐字节比对结构变化，不用每次都看日志截断片段。
 *
 * 默认目录：${user.home}/.kai-toolbox/media-parser/dumps/
 * 文件名格式：{时间戳}-{label}.txt
 */
@Slf4j
@Component
public class PageDumpWriter {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS");

    private final Path dumpDir;

    public PageDumpWriter(MediaParserProperties props) {
        String configured = props.getDumpDir();
        this.dumpDir = (configured != null && !configured.isBlank())
                ? Paths.get(configured)
                : Paths.get(System.getProperty("user.home"), ".kai-toolbox", "media-parser", "dumps");
        try {
            Files.createDirectories(dumpDir);
            log.info("[PageDumpWriter] dump dir: {}", dumpDir.toAbsolutePath());
        } catch (IOException e) {
            log.warn("[PageDumpWriter] 创建目录失败 {}: {}", dumpDir, e.getMessage());
        }
    }

    /**
     * 转储页面状态。任意 IO 异常只记日志，不向上抛——dump 是辅助，不能影响主流程的异常传播。
     *
     * @param label 文件名片段（建议用 platform-shortname，如 "douyin-no-item"）
     * @param sourceUrl 原始解析的 URL
     * @param page 当前 Playwright 页面
     * @param extractedJson 已抽出的 JSON（pretty-print），可为 null
     * @return 写入的文件路径，失败返回 null
     */
    public Path dump(String label, String sourceUrl, Page page, String extractedJson) {
        String safeLabel = label.replaceAll("[^a-zA-Z0-9-]", "_");
        String filename = LocalDateTime.now().format(TS) + "-" + safeLabel + ".txt";
        Path file = dumpDir.resolve(filename);
        try {
            StringBuilder sb = new StringBuilder(4096);
            sb.append("=== Source URL ===\n").append(sourceUrl).append("\n\n");
            sb.append("=== Final URL ===\n").append(safe(() -> page.url())).append("\n\n");
            sb.append("=== Page Title ===\n").append(safe(() -> page.title())).append("\n\n");
            if (extractedJson != null) {
                sb.append("=== Extracted JSON ===\n").append(extractedJson).append("\n\n");
            }
            sb.append("=== Page HTML ===\n").append(safe(() -> page.content())).append("\n");
            Files.writeString(file, sb.toString());
            log.warn("[PageDumpWriter] dumped to {}", file.toAbsolutePath());
            return file;
        } catch (Exception e) {
            log.warn("[PageDumpWriter] dump 失败 {}: {}", file, e.getMessage());
            return null;
        }
    }

    private interface ThrowingSupplier<T> { T get() throws Exception; }

    private String safe(ThrowingSupplier<String> s) {
        try { return s.get(); } catch (Exception e) { return "<error: " + e.getMessage() + ">"; }
    }
}
