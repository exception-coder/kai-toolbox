package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.SttResult;
import com.exceptioncoder.toolbox.claudechat.service.SttService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

/**
 * 语音转写：录音音频以 raw body 上传，同步返回纯文本。契约见 api 文档 §1。
 */
@RestController
@RequestMapping("/api/claude-chat/stt")
public class SttController {

    private final SttService stt;

    public SttController(SttService stt) {
        this.stt = stt;
    }

    /** 前端据此启用/禁用麦克风按钮。 */
    @GetMapping("/available")
    public Map<String, Boolean> available() {
        return Map.of("available", stt.isAvailable());
    }

    @PostMapping
    public SttResult transcribe(InputStream body,
                                @RequestParam(defaultValue = "auto") String language) {
        if (!stt.isAvailable()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "ASR_UNAVAILABLE");
        }
        try {
            return new SttResult(stt.transcribe(body, language));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "TRANSCRIBE_INTERRUPTED");
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "TRANSCRIBE_FAILED", e);
        }
    }
}
