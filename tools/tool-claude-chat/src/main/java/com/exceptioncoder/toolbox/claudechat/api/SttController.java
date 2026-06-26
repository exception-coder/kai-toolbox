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
@RestController("claudeChatSttController")
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
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "语音识别服务未就绪：请先启动 python-services/faster-whisper");
        }
        try {
            return new SttResult(stt.transcribe(body, language));
        } catch (IllegalArgumentException e) {
            // 入参/音频问题（如空录音）→ 400 + 原因
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    e.getMessage() == null ? "录音无效" : e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "转写被中断");
        } catch (IOException e) {
            // 把真实失败原因带回前端（ASR 连接失败 / HTTP 状态 / 转写错误等，已由 SpeechToTextClient 拼好）
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    e.getMessage() == null ? "转写失败" : e.getMessage(), e);
        }
    }
}
