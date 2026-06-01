package com.exceptioncoder.toolbox.common.speech;

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
import java.nio.file.Path;
import java.time.Duration;

/**
 * 共享的「音频 → 文本」客户端，调用本机 faster-whisper ASR 服务的 {@code POST /asr}。
 *
 * <p>协议与 tool-treesize 的字幕客户端一致（raw wav body + SSE），但本类只取纯文本：
 * 累积每个 {@code segment} 事件的 text 拼接返回，不落 VTT、不写文件，适合「录音转文字回填输入框」。
 *
 * <p>请求：{@code POST /asr?language=..&vad_filter=true}，{@code Content-Type: audio/wav}，body 为原始 wav。
 * 响应 text/event-stream：依次 {@code language / progress / segment / done}，错误时发 {@code error}。
 */
@Component
public class SpeechToTextClient {

    private static final Logger log = LoggerFactory.getLogger(SpeechToTextClient.class);
    private static final Duration HEALTH_TIMEOUT = Duration.ofSeconds(2);

    private final SpeechProperties props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public SpeechToTextClient(SpeechProperties props) {
        this.props = props;
    }

    /** ASR 服务是否可用（{@code GET /health} 返回 200）。 */
    public boolean isAvailable() {
        if (props.getAsrBaseUrl().isBlank()) return false;
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(props.getAsrBaseUrl() + "/health"))
                    .timeout(HEALTH_TIMEOUT)
                    .GET()
                    .build();
            return http.send(req, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            log.debug("ASR /health 探测失败 {}: {}", props.getAsrBaseUrl(), e.toString());
            return false;
        }
    }

    /**
     * 把 16kHz mono PCM wav 转写成纯文本。
     *
     * @param wav      16kHz mono wav 文件
     * @param language ISO 639-1 码或 "auto"
     * @return 转写文本（多段以空格拼接）；无语音时返回空串
     */
    public String transcribeToText(Path wav, String language) throws IOException, InterruptedException {
        if (props.getAsrBaseUrl().isBlank()) {
            throw new IllegalStateException("ASR 服务地址未配置：toolbox.speech.asr-base-url");
        }
        String lang = (language == null || language.isBlank()) ? "auto" : language;
        String query = "language=" + urlEncode(lang) + "&vad_filter=true";

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(props.getAsrBaseUrl() + "/asr?" + query))
                .header("Content-Type", "audio/wav")
                .timeout(props.getTimeoutSeconds() > 0
                        ? Duration.ofSeconds(props.getTimeoutSeconds())
                        : Duration.ofHours(1))
                .POST(HttpRequest.BodyPublishers.ofFile(wav))
                .build();

        HttpResponse<InputStream> resp;
        try {
            resp = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException e) {
            throw new IOException("ASR 服务连接失败（" + props.getAsrBaseUrl()
                    + "）：" + e.getMessage() + "。请先启动 python-services/faster-whisper 服务", e);
        }
        if (resp.statusCode() != 200) {
            try (InputStream in = resp.body()) {
                String err = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                throw new IOException("ASR 服务返回 HTTP " + resp.statusCode() + "：" + err);
            }
        }
        try (InputStream in = resp.body()) {
            return parseSegments(in);
        }
    }

    /** 解析 SSE 流，累积 segment.text；done 结束；error 抛异常。 */
    private String parseSegments(InputStream stream) throws IOException {
        StringBuilder text = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            String event = null;
            StringBuilder data = new StringBuilder();
            while ((line = br.readLine()) != null) {
                if (line.isEmpty()) {
                    if (event != null) appendEvent(event, data.toString(), text);
                    event = null;
                    data.setLength(0);
                } else if (line.startsWith("event:")) {
                    event = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                    if (data.length() > 0) data.append('\n');
                    data.append(line.substring(5).trim());
                }
            }
            if (event != null && data.length() > 0) appendEvent(event, data.toString(), text);
        }
        return text.toString().trim();
    }

    private void appendEvent(String event, String dataJson, StringBuilder text) throws IOException {
        if (dataJson.isBlank()) return;
        JsonNode data;
        try {
            data = mapper.readTree(dataJson);
        } catch (IOException e) {
            log.warn("ASR SSE JSON 解析失败 event={} data={}", event, dataJson);
            return;
        }
        switch (event) {
            case "segment" -> {
                String seg = data.path("text").asText("").trim();
                if (!seg.isEmpty()) {
                    if (text.length() > 0) text.append(' ');
                    text.append(seg);
                }
            }
            case "error" -> throw new IOException(
                    "ASR 服务转写失败：" + data.path("message").asText("未知错误"));
            default -> { /* language / progress / done 不影响纯文本累积 */ }
        }
    }

    private static String urlEncode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
