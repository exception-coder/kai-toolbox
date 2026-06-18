package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.TtsService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 文字转语音：待合成文本以 raw body 上传（text/plain），返回 audio/wav 字节。
 * 供「云团语音模式」把 AI 回复读出来，并用真实音频振幅驱动云团。
 */
@RestController
@RequestMapping("/api/claude-chat/tts")
public class TtsController {

    private final TtsService tts;

    public TtsController(TtsService tts) {
        this.tts = tts;
    }

    /** 前端据此决定语音回复用真实 TTS 还是回落合成动画。 */
    @GetMapping("/available")
    public Map<String, Boolean> available() {
        return Map.of("available", tts.isAvailable());
    }

    @PostMapping(produces = "audio/wav")
    public ResponseEntity<byte[]> synthesize(@RequestBody(required = false) byte[] body,
                                             @RequestParam(required = false) String voice) {
        if (!tts.isAvailable()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "TTS_UNAVAILABLE");
        }
        String text = body == null ? "" : new String(body, StandardCharsets.UTF_8);
        try {
            byte[] wav = tts.synthesize(text, voice);
            return ResponseEntity.ok().contentType(MediaType.parseMediaType("audio/wav")).body(wav);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "TTS_INTERRUPTED");
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "TTS_FAILED", e);
        }
    }
}
