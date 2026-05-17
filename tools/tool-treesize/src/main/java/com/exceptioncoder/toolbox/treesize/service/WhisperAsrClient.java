package com.exceptioncoder.toolbox.treesize.service;

import com.exceptioncoder.toolbox.treesize.config.WhisperProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 通过 HTTP / SSE 调用本地 faster-whisper Python 服务跑字幕生成。
 * 跟 {@link WhisperRunner} 的 CLI 路径完全等价 ——
 * {@link #run} 方法签名也对齐，{@link SubtitleService} 根据 yml 的 {@code mode} 切换。
 *
 * <p>协议（无 multipart，绕开 starlette 的 multipart 解析器 size 限制）：
 * <ul>
 *   <li>{@code POST /asr?language=...&initial_prompt=...&vad_filter=true}
 *       query string URL 编码;{@code Content-Type: audio/wav};body = 原始 wav 字节</li>
 *   <li>响应 text/event-stream，依次发 {@code language} / {@code progress} / {@code segment} / {@code done}</li>
 *   <li>错误时发 {@code error} 事件，HTTP 状态码仍是 200</li>
 * </ul>
 *
 * <p>历史：原先用 multipart/form-data 上传 wav,试过 readAllBytes / concat / SequenceInputStream
 * 三种 body publisher 路径,都在大 wav 文件上撞到 starlette 的 multipart parser 上限
 * (1MB max_part_size,改 class 属性在新版未生效),Python 端中途 close socket 导致
 * Java "Connection reset by peer"。换 raw body 后没有任何 size 限制。
 *
 * <p>取消：调用方传 {@code cancelled} 标志，本类在后台读 SSE 流，主线程每 250ms 轮询标志，
 * 标志置位时 {@link InputStream#close()} 让读线程提前退出。
 */
@Component
public class WhisperAsrClient {

    private static final Logger log = LoggerFactory.getLogger(WhisperAsrClient.class);
    /** SSE 帧轮询粒度；同时也是取消标志的检测频率。 */
    private static final long POLL_INTERVAL_MS = 250;
    /** 健康检查超时；用于启动期判定服务是否在线。 */
    private static final Duration HEALTH_TIMEOUT = Duration.ofSeconds(2);

    private final WhisperProperties props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public WhisperAsrClient(WhisperProperties props) {
        this.props = props;
    }

    /** 探测 ASR 服务是否在线（{@code GET /health}）。失败时返回 null。 */
    public String pingHealth() {
        if (props.getServiceUrl().isBlank()) return null;
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(props.getServiceUrl() + "/health"))
                    .timeout(HEALTH_TIMEOUT)
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            return resp.statusCode() == 200 ? resp.body() : null;
        } catch (Exception e) {
            log.debug("ASR /health 探测失败 {}: {}", props.getServiceUrl(), e.toString());
            return null;
        }
    }

    /**
     * 跑一次字幕生成。签名故意跟 {@link WhisperRunner#run} 对齐，让 SubtitleService 切换无感。
     *
     * @param wav            16kHz mono PCM 的 wav 输入
     * @param outputPrefix   最终 VTT 路径前缀；本方法会把 done 事件里的 VTT 文本写到
     *                       {@code <outputPrefix>.vtt}
     * @param language       ISO 639-1 code 或 "auto"
     * @param initialPrompt  专有名词 prompt；null/空时不传
     * @param listener       进度 / 语言回调
     * @param cancelled      取消标志，本方法每 250 ms 检查
     */
    public Path run(Path wav, Path outputPrefix, String language, String initialPrompt,
                    WhisperRunner.ProgressListener listener, AtomicBoolean cancelled)
            throws IOException, InterruptedException {
        if (props.getServiceUrl().isBlank()) {
            throw new IllegalStateException(
                    "ASR 服务地址未配置：请在 application.yml 设置 toolbox.whisper.service-url");
        }
        Files.createDirectories(outputPrefix.getParent());

        // 参数走 query string,wav 直接作为 raw body 发出去:
        //   POST /asr?language=ja&initial_prompt=xxx&vad_filter=true
        //   Content-Type: audio/wav
        //   body: <wav 原始字节>
        // BodyPublishers.ofFile 在 JDK 内部走 FileChannel,Content-Length 自动按文件大小填,
        // 不进 Java 堆。Python 端用 request.stream() 异步迭代 chunk 落盘,绕开所有 multipart
        // 解析器的 size 限制。
        String lang = (language == null || language.isBlank()) ? "auto" : language;
        String query = "language=" + urlEncode(lang)
                + "&initial_prompt=" + urlEncode(initialPrompt == null ? "" : initialPrompt)
                + "&vad_filter=true";

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(props.getServiceUrl() + "/asr?" + query))
                .header("Content-Type", "audio/wav")
                .timeout(props.getTimeoutSeconds() > 0
                        ? Duration.ofSeconds(props.getTimeoutSeconds())
                        : Duration.ofHours(6))
                .POST(HttpRequest.BodyPublishers.ofFile(wav))
                .build();

        log.info("ASR 调用开始 url={} wav={} ({}MB) language={}",
                props.getServiceUrl(), wav.getFileName(),
                Files.size(wav) / (1024 * 1024), lang);

        HttpResponse<InputStream> resp;
        try {
            resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException e) {
            throw new IOException(
                    "ASR 服务连接失败（" + props.getServiceUrl() + "）：" + e.getMessage()
                            + "。请先启动 python-services/faster-whisper/start.bat", e);
        }
        if (resp.statusCode() != 200) {
            try (InputStream in = resp.body()) {
                String errBody = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                throw new IOException("ASR 服务返回 HTTP " + resp.statusCode() + "：" + errBody);
            }
        }

        InputStream stream = resp.body();
        AtomicReference<String> vttRef = new AtomicReference<>();
        AtomicReference<Exception> errRef = new AtomicReference<>();
        Thread reader = Thread.ofVirtual().name("asr-sse-reader").start(() -> {
            try {
                parseSseStream(stream, listener, vttRef);
            } catch (Exception e) {
                errRef.set(e);
            }
        });

        // 主线程轮询取消标志；SSE 流阻塞读时通过 close() 让读线程退出。
        while (reader.isAlive()) {
            if (cancelled != null && cancelled.get()) {
                try { stream.close(); } catch (IOException ignored) { /* close 抛错无害 */ }
                reader.join(TimeUnit.SECONDS.toMillis(2));
                throw new InterruptedException("ASR 任务被取消");
            }
            reader.join(POLL_INTERVAL_MS);
        }

        if (errRef.get() != null) {
            Exception e = errRef.get();
            if (e instanceof IOException io) throw io;
            throw new IOException("ASR 调用失败：" + e.getMessage(), e);
        }
        String vtt = vttRef.get();
        if (vtt == null || vtt.isBlank()) {
            throw new IOException("ASR 服务未返回 VTT 内容（done 事件缺失）");
        }

        Path vttPath = Path.of(outputPrefix.toAbsolutePath() + ".vtt");
        Files.writeString(vttPath, vtt, StandardCharsets.UTF_8);
        log.info("ASR 调用结束 写入 {} ({} 字符)", vttPath, vtt.length());
        return vttPath;
    }

    private static String urlEncode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    /** 解析 SSE 流并按事件类型分发。{@code done} 事件的 vtt 字段写到 vttRef。 */
    private void parseSseStream(InputStream stream, WhisperRunner.ProgressListener listener,
                                 AtomicReference<String> vttRef) throws IOException {
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            String currentEvent = null;
            StringBuilder dataBuf = new StringBuilder();
            int lastReportedPercent = -1;
            while ((line = br.readLine()) != null) {
                if (line.isEmpty()) {
                    // 空行 = 事件帧结束。SSE 协议规定每帧以双换行收尾，readLine 看到空行就分发。
                    if (currentEvent != null) {
                        handleEvent(currentEvent, dataBuf.toString(), listener, vttRef, lastReportedPercent);
                        if ("progress".equals(currentEvent)) {
                            // 进度去重：相同百分比不重复 callback，避免 SSE 流被刷屏。
                            int pct = extractProgressPercent(dataBuf.toString());
                            if (pct >= 0) lastReportedPercent = pct;
                        }
                    }
                    currentEvent = null;
                    dataBuf.setLength(0);
                } else if (line.startsWith("event:")) {
                    currentEvent = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                    if (dataBuf.length() > 0) dataBuf.append('\n');
                    dataBuf.append(line.substring(5).trim());
                }
                // 其它前缀（id: / retry: / comment）忽略
            }
            // 处理流末尾未以空行收尾的最后一帧（生产环境不该出现，但兜底）
            if (currentEvent != null && dataBuf.length() > 0) {
                handleEvent(currentEvent, dataBuf.toString(), listener, vttRef, lastReportedPercent);
            }
        }
    }

    private void handleEvent(String event, String dataJson, WhisperRunner.ProgressListener listener,
                              AtomicReference<String> vttRef, int lastReportedPercent) throws IOException {
        if (dataJson.isBlank()) return;
        JsonNode data;
        try {
            data = mapper.readTree(dataJson);
        } catch (IOException e) {
            log.warn("ASR SSE JSON 解析失败 event={} data={}", event, dataJson);
            return;
        }
        switch (event) {
            case "language" -> {
                String lang = data.path("language").asText("");
                if (!lang.isEmpty() && listener != null) {
                    try { listener.onLanguageDetected(lang); }
                    catch (Exception cb) { log.warn("listener.onLanguageDetected 抛异常: {}", cb.toString()); }
                }
            }
            case "progress" -> {
                int pct = (int) Math.min(99, Math.max(0, data.path("progress").asDouble(0) * 100));
                if (pct != lastReportedPercent && listener != null) {
                    try { listener.onProgress(pct); }
                    catch (Exception cb) { log.warn("listener.onProgress 抛异常: {}", cb.toString()); }
                }
            }
            case "segment" -> {
                // segments 我们不单独处理 —— done 事件会带完整 VTT；DEBUG 日志方便调试。
                if (log.isDebugEnabled()) {
                    log.debug("ASR segment {}-{}: {}",
                            data.path("start").asDouble(), data.path("end").asDouble(),
                            data.path("text").asText(""));
                }
            }
            case "done" -> {
                String vtt = data.path("vtt").asText("");
                vttRef.set(vtt);
                if (listener != null) {
                    try { listener.onProgress(100); } catch (Exception ignored) { /* 末尾 callback 失败无害 */ }
                }
            }
            case "error" -> throw new IOException(
                    "ASR 服务转写失败：" + data.path("message").asText("未知错误"));
            default -> log.debug("ASR 未知事件类型 event={} data={}", event, dataJson);
        }
    }

    private int extractProgressPercent(String dataJson) {
        try {
            JsonNode node = mapper.readTree(dataJson);
            return (int) Math.min(99, Math.max(0, node.path("progress").asDouble(0) * 100));
        } catch (IOException e) {
            return -1;
        }
    }

}
