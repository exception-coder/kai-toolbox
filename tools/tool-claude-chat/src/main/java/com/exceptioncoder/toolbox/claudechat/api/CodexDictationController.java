package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.claudechat.service.ClaudeChatSessionAccessPolicy;
import com.exceptioncoder.toolbox.claudechat.service.SidecarClient;
import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

/** Codex 普通听写：账号仅从已授权的原会话解析，音频与文本不写入聊天历史。 */
@RestController
@RequireAuth
@RequestMapping("/api/claude-chat/sessions/{id}/dictation")
public class CodexDictationController {
    private static final int MAX_PCM_BYTES = 16000 * 2 * 120;
    private final ClaudeChatSessionRepository sessions;
    private final ClaudeChatSessionAccessPolicy access;
    private final SidecarClient sidecar;

    public CodexDictationController(ClaudeChatSessionRepository sessions,
                                   ClaudeChatSessionAccessPolicy access, SidecarClient sidecar) {
        this.sessions = sessions;
        this.access = access;
        this.sidecar = sidecar;
    }

    @GetMapping("/available")
    public Map<String, Object> available(@PathVariable String id) {
        var session = requireCodexSession(id);
        var result = sidecar.codexDictation(session.getCodexHome(), null);
        return result.<Map<String, Object>>map(value -> Map.of("available", value.path("available").asBoolean(),
                "message", value.path("error").asText("")))
                .orElseGet(() -> Map.of("available", false, "message", "听写服务未连接，请稍后重试"));
    }

    /** 输入必须为 16kHz、单声道 PCM16LE，最多 120 秒；先授权再读取有界请求体。 */
    @PostMapping(consumes = "application/octet-stream")
    public Map<String, String> transcribe(@PathVariable String id, InputStream body) throws IOException {
        var session = requireCodexSession(id);
        byte[] pcm = body.readNBytes(MAX_PCM_BYTES + 1);
        if (pcm.length == 0 || pcm.length > MAX_PCM_BYTES || pcm.length % 2 != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "听写音频无效或超过 120 秒，请分段录音");
        }
        var result = sidecar.codexDictation(session.getCodexHome(), pcm)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "听写服务未响应，请稍后重新录音"));
        String error = result.path("error").asText("");
        String text = result.path("text").asText("").trim();
        if (!error.isBlank() || text.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    error.isBlank() ? "没有识别到语音，请重新录音" : error);
        }
        return Map.of("text", text);
    }

    private ClaudeChatSession requireCodexSession(String id) {
        if (!access.canAccessCurrentUser(id)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "无权访问该会话");
        }
        var session = sessions.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "会话不存在"));
        if (!"codex".equals(session.getEngine())
                || (session.getApiBaseUrl() != null && !session.getApiBaseUrl().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "听写仅支持官方 Codex 引擎会话");
        }
        return session;
    }
}
