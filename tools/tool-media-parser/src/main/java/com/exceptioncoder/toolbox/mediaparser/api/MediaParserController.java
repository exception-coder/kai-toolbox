package com.exceptioncoder.toolbox.mediaparser.api;

import com.exceptioncoder.toolbox.mediaparser.api.dto.ParseRequest;
import com.exceptioncoder.toolbox.mediaparser.api.dto.ParseResultView;
import com.exceptioncoder.toolbox.mediaparser.config.MediaParserProperties;
import com.exceptioncoder.toolbox.mediaparser.config.ProxyConfig;
import com.exceptioncoder.toolbox.mediaparser.domain.ParseResult;
import com.exceptioncoder.toolbox.mediaparser.parser.YtDlpParser;
import com.exceptioncoder.toolbox.mediaparser.service.MediaParserService;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Slf4j
@RestController
@RequestMapping("/api/media-parser")
public class MediaParserController {

    private final MediaParserService service;
    private final MediaParserProperties props;
    private final ProxyConfig proxyConfig;
    private final HttpClient httpClient;

    public MediaParserController(MediaParserService service, MediaParserProperties props, ProxyConfig proxyConfig) {
        this.service = service;
        this.props = props;
        this.proxyConfig = proxyConfig;
        HttpClient.Builder builder = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofSeconds(props.getConnectTimeoutSeconds()));
        if (proxyConfig.isEnabled()) {
            builder.proxy(proxyConfig.getSelector());
        }
        this.httpClient = builder.build();
    }

    @PostMapping("/parse")
    public ParseResultView parse(@Valid @RequestBody ParseRequest request) {
        ParseResult result = service.parse(request.url());
        return ParseResultView.from(result);
    }

    /**
     * Unified download endpoint:
     * - ?cdnUrl=...         → proxy the CDN URL through the server (for fallback parser links)
     * - ?url=...&mode=...   → run yt-dlp on the server and stream the result
     */
    @GetMapping("/download")
    public void download(
            @RequestParam(required = false) String cdnUrl,
            @RequestParam(required = false) String url,
            @RequestParam(defaultValue = "video") String mode,
            @RequestParam(defaultValue = "false") boolean inline,
            @RequestParam(required = false) String referer,
            HttpServletResponse response
    ) throws IOException, InterruptedException {

        if (cdnUrl != null && !cdnUrl.isBlank()) {
            proxyFromCdn(cdnUrl, inline, referer, response);
        } else if (url != null && !url.isBlank()) {
            downloadViaYtDlp(url, mode, inline, response);
        } else {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "需要提供 url 或 cdnUrl 参数");
        }
    }

    private void proxyFromCdn(String cdnUrl, boolean inline, String referer, HttpServletResponse response) throws IOException, InterruptedException {
        log.debug("CDN proxy: {} (referer={})", cdnUrl, referer);
        HttpRequest.Builder reqBuilder = HttpRequest.newBuilder()
                .uri(URI.create(cdnUrl))
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .timeout(Duration.ofSeconds(props.getDownloadTimeoutSeconds()))
                .GET();
        if (referer != null && !referer.isBlank()) {
            reqBuilder.header("Referer", referer);
        }
        HttpRequest request = reqBuilder.build();

        HttpResponse<InputStream> httpResp;
        try {
            httpResp = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (Exception e) {
            response.sendError(HttpServletResponse.SC_BAD_GATEWAY, "CDN 请求失败: " + e.getMessage());
            return;
        }

        if (httpResp.statusCode() >= 400) {
            response.sendError(HttpServletResponse.SC_BAD_GATEWAY, "CDN 返回错误: " + httpResp.statusCode());
            return;
        }

        httpResp.headers().firstValue("Content-Type")
                .ifPresent(response::setContentType);
        httpResp.headers().firstValueAsLong("Content-Length")
                .ifPresent(len -> { if (len > 0) response.setContentLengthLong(len); });
        response.setHeader("Content-Disposition",
                (inline ? "inline" : "attachment") + "; filename=\"download\"");

        try (InputStream in = httpResp.body()) {
            in.transferTo(response.getOutputStream());
        }
        response.flushBuffer();
    }

    private void downloadViaYtDlp(String url, String mode, boolean inline, HttpServletResponse response)
            throws IOException, InterruptedException {

        boolean isAudio = "audio".equals(mode);
        String format      = isAudio ? YtDlpParser.FORMAT_AUDIO : YtDlpParser.FORMAT_VIDEO;
        String ext         = isAudio ? "m4a" : "mp4";
        String contentType = isAudio ? "audio/mp4" : "video/mp4";

        Path tempDir = Files.createTempDirectory("media-dl-");
        Path outFile = tempDir.resolve("output." + ext);
        try {
            List<String> cmd = new ArrayList<>(List.of(
                    props.getYtDlpBinary(),
                    "-f", format,
                    "--ffmpeg-location", props.getFfmpegBinary(),
                    "--merge-output-format", ext,
                    "--no-playlist",
                    "--quiet",
                    "-o", outFile.toString()
            ));
            if (proxyConfig.isEnabled()) {
                cmd.add("--proxy");
                cmd.add(proxyConfig.getRawUrl());
            }
            cmd.add(url);

            log.debug("yt-dlp download: mode={} url={}", mode, url);
            Process process = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            String output = new String(process.getInputStream().readAllBytes());
            boolean finished = process.waitFor(props.getDownloadTimeoutSeconds(), TimeUnit.SECONDS);

            if (!finished) {
                process.destroyForcibly();
                response.sendError(HttpServletResponse.SC_GATEWAY_TIMEOUT, "下载超时，视频可能过大");
                return;
            }
            if (process.exitValue() != 0) {
                log.warn("yt-dlp download failed: {}", output);
                response.sendError(HttpServletResponse.SC_BAD_GATEWAY, "yt-dlp 下载失败");
                return;
            }

            // yt-dlp may produce a different extension after merging; find the actual output file
            Path actual = Files.list(tempDir)
                    .filter(p -> !p.getFileName().toString().endsWith(".part"))
                    .max(Comparator.comparingLong(p -> {
                        try { return Files.size(p); } catch (IOException e) { return 0L; }
                    }))
                    .orElse(outFile);

            response.setContentType(contentType);
            response.setHeader("Content-Disposition",
                    (inline ? "inline" : "attachment") + "; filename=\"download." + ext + "\"");
            response.setContentLengthLong(Files.size(actual));
            Files.copy(actual, response.getOutputStream());
            response.flushBuffer();

        } finally {
            try (var stream = Files.walk(tempDir)) {
                stream.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                });
            }
        }
    }
}
