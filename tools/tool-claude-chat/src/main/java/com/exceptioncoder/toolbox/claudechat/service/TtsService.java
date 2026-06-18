package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.common.speech.TextToSpeechClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;

/**
 * 文字转语音编排：把 AI 回复文本交给本机 Kokoro TTS 服务合成为 wav，供语音模式播放。
 *
 * <p>薄封装，与 {@link SttService} 对称：可用性探测 + 合成。文本截断/清洗留给调用方（前端）。
 */
@Slf4j
@Service
public class TtsService {

    /** 单次合成的文本上限，防止超长正文把 TTS 拖死（前端通常只送一段回复）。 */
    private static final int MAX_CHARS = 2000;

    private final TextToSpeechClient tts;

    public TtsService(TextToSpeechClient tts) {
        this.tts = tts;
    }

    /** TTS 服务是否就绪，前端据此决定语音回复用真实音频还是回落合成动画。 */
    public boolean isAvailable() {
        return tts.isAvailable();
    }

    /**
     * 合成语音。
     *
     * @param text  待合成文本
     * @param voice 音色 id，可空（用默认）
     * @return wav 字节
     */
    public byte[] synthesize(String text, String voice) throws IOException, InterruptedException {
        String t = text == null ? "" : text.strip();
        if (t.isEmpty()) {
            throw new IllegalArgumentException("待合成文本为空");
        }
        if (t.length() > MAX_CHARS) {
            t = t.substring(0, MAX_CHARS);
        }
        return tts.synthesize(t, voice);
    }
}
