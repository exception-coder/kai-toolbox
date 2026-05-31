package com.exceptioncoder.toolbox.downloader.service;

import com.exceptioncoder.toolbox.downloader.service.engine.EngineHeaders;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * URL + 响应头 → 安全文件名。
 * 优先级：Content-Disposition > URL 末段 > "download-{timestamp}"。
 * 自动 sanitize Windows 非法字符。
 */
@Service
public class FilenameResolver {

    // RFC 5987 编码：filename*=UTF-8''xxx
    private static final Pattern CD_FILENAME_STAR = Pattern.compile(
            "filename\\*\\s*=\\s*UTF-8''([^;]+)", Pattern.CASE_INSENSITIVE);
    // 普通：filename="xxx" 或 filename=xxx
    private static final Pattern CD_FILENAME = Pattern.compile(
            "filename\\s*=\\s*\"?([^\";]+)\"?", Pattern.CASE_INSENSITIVE);
    private static final Pattern WINDOWS_ILLEGAL = Pattern.compile("[<>:\"|?*\\\\/\\x00-\\x1F]");

    /**
     * @param userProvided 用户在请求里显式给的 filename，可空
     * @param headers HEAD/GET 响应头，用于解析 Content-Disposition
     */
    public String resolve(URI url, EngineHeaders headers, String userProvided) {
        String chosen = firstNonBlank(
                userProvided,
                fromContentDisposition(headers),
                fromUrl(url));
        if (chosen == null || chosen.isBlank()) {
            chosen = "download-" + System.currentTimeMillis();
        }
        return sanitize(chosen);
    }

    /**
     * 在保存目录中规避同名：若 name 已存在则追加 (1) (2) ... 后缀。
     */
    public Path deduplicate(Path dir, String name) {
        Path candidate = dir.resolve(name);
        if (!Files.exists(candidate) && !Files.exists(workingFile(candidate))) {
            return candidate;
        }
        String stem;
        String ext;
        int dot = name.lastIndexOf('.');
        if (dot > 0 && dot < name.length() - 1) {
            stem = name.substring(0, dot);
            ext = name.substring(dot);
        } else {
            stem = name;
            ext = "";
        }
        for (int i = 1; i < 10_000; i++) {
            Path p = dir.resolve(stem + "(" + i + ")" + ext);
            if (!Files.exists(p) && !Files.exists(workingFile(p))) {
                return p;
            }
        }
        // 极端兜底
        return dir.resolve(stem + "-" + System.currentTimeMillis() + ext);
    }

    public static Path workingFile(Path target) {
        return target.resolveSibling(target.getFileName().toString() + ".kdownload");
    }

    // ---------- internals ----------

    private static String fromContentDisposition(EngineHeaders headers) {
        if (headers == null) return null;
        Optional<String> cd = headers.firstValue("content-disposition");
        if (cd.isEmpty()) return null;
        String value = cd.get();
        Matcher m = CD_FILENAME_STAR.matcher(value);
        if (m.find()) {
            try {
                return URLDecoder.decode(m.group(1).trim(), StandardCharsets.UTF_8);
            } catch (Exception ignored) {
                // fall through to RFC 2616 form
            }
        }
        m = CD_FILENAME.matcher(value);
        if (m.find()) {
            return m.group(1).trim();
        }
        return null;
    }

    private static String fromUrl(URI url) {
        if (url == null) return null;
        String path = url.getPath();
        if (path == null || path.isBlank() || "/".equals(path)) return null;
        int slash = path.lastIndexOf('/');
        String tail = slash >= 0 ? path.substring(slash + 1) : path;
        try {
            return URLDecoder.decode(tail, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return tail;
        }
    }

    private static String sanitize(String raw) {
        String s = WINDOWS_ILLEGAL.matcher(raw).replaceAll("_").trim();
        // 去掉 Windows 不允许的尾随空格 / 点
        while (s.endsWith(".") || s.endsWith(" ")) {
            s = s.substring(0, s.length() - 1);
        }
        if (s.isBlank()) s = "download-" + System.currentTimeMillis();
        // Windows MAX_PATH 260；文件名段建议不超 200 给路径留余地
        if (s.length() > 200) {
            int dot = s.lastIndexOf('.');
            if (dot > 0 && s.length() - dot < 20) {
                s = s.substring(0, 200 - (s.length() - dot)) + s.substring(dot);
            } else {
                s = s.substring(0, 200);
            }
        }
        return s;
    }

    private static String firstNonBlank(String... vals) {
        for (String v : vals) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }
}
