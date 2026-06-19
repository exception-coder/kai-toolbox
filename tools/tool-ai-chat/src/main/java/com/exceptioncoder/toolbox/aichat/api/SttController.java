package com.exceptioncoder.toolbox.aichat.api;

import com.exceptioncoder.toolbox.common.speech.SpeechTranscriptionService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

/**
 * AI 对话的语音转写：录音音频以 raw body 上传，同步返回纯文本，复用 common 的转写编排。
 */
@RestController("aiChatSttController")
@RequestMapping("/api/ai-chat/stt")
public class SttController {

    private final SpeechTranscriptionService stt;

    public SttController(SpeechTranscriptionService stt) {
        this.stt = stt;
    }

    /** 前端据此启用/禁用麦克风按钮。 */
    @GetMapping("/available")
    public Map<String, Boolean> available() {
        return Map.of("available", stt.isAvailable());
    }

    @PostMapping
    public Map<String, String> transcribe(InputStream body,
                                          @RequestParam(defaultValue = "auto") String language) {
        if (!stt.isAvailable()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "ASR_UNAVAILABLE");
        }
        try {
            return Map.of("text", stt.transcribe(body, language));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "TRANSCRIBE_INTERRUPTED");
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "TRANSCRIBE_FAILED", e);
        }
    }
}
