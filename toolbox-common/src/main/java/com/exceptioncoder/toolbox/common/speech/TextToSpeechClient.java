package com.exceptioncoder.toolbox.common.speech;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * 共享的「文本 → 语音」客户端，调用本机 Kokoro TTS 服务的 {@code POST /tts}。
 *
 * <p>请求：{@code POST /tts?voice=..&speed=..&lang=zh}，{@code Content-Type: text/plain;charset=utf-8}，
 * body 为待合成文本；响应为 {@code audio/wav} 原始字节（一次性返回，非流式——合成结果是单段音频）。
 *
 * <p>与 {@link SpeechToTextClient} 同理固定 HTTP/1.1：服务端是 uvicorn，避免 h2c 明文升级协商。
 */
@Component
public class TextToSpeechClient {

    private static final Logger log = LoggerFactory.getLogger(TextToSpeechClient.class);
    private static final Duration HEALTH_TIMEOUT = Duration.ofSeconds(2);

    private final SpeechProperties props;
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public TextToSpeechClient(SpeechProperties props) {
        this.props = props;
    }

    /** TTS 服务是否可用（{@code GET /health} 返回 200）。 */
    public boolean isAvailable() {
        if (props.getTtsBaseUrl().isBlank()) return false;
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(props.getTtsBaseUrl() + "/health"))
                    .timeout(HEALTH_TIMEOUT)
                    .GET()
                    .build();
            return http.send(req, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
        } catch (Exception e) {
            log.debug("TTS /health 探测失败 {}: {}", props.getTtsBaseUrl(), e.toString());
            return false;
        }
    }

    /**
     * 合成语音。
     *
     * @param text  待合成文本（非空）
     * @param voice 音色 id；为空用配置默认
     * @return wav 音频字节
     */
    public byte[] synthesize(String text, String voice) throws IOException, InterruptedException {
        if (props.getTtsBaseUrl().isBlank()) {
            throw new IllegalStateException("TTS 服务地址未配置：toolbox.speech.tts-base-url");
        }
        String v = (voice == null || voice.isBlank()) ? props.getTtsVoice() : voice;
        String query = "voice=" + urlEncode(v) + "&lang=zh";

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(props.getTtsBaseUrl() + "/tts?" + query))
                .header("Content-Type", "text/plain; charset=utf-8")
                .timeout(props.getTtsTimeoutSeconds() > 0
                        ? Duration.ofSeconds(props.getTtsTimeoutSeconds())
                        : Duration.ofMinutes(10))
                .POST(HttpRequest.BodyPublishers.ofString(text, StandardCharsets.UTF_8))
                .build();

        HttpResponse<byte[]> resp;
        try {
            resp = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException e) {
            throw new IOException("TTS 服务连接失败（" + props.getTtsBaseUrl()
                    + "）：" + e.getMessage() + "。请先启动 python-services/kokoro-tts 服务", e);
        }
        if (resp.statusCode() != 200) {
            throw new IOException("TTS 服务返回 HTTP " + resp.statusCode() + "："
                    + new String(resp.body(), StandardCharsets.UTF_8));
        }
        return resp.body();
    }

    private static String urlEncode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
