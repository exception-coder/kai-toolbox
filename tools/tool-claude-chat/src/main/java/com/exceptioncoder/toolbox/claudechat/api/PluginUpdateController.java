package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.PluginStatusView;
import com.exceptioncoder.toolbox.claudechat.api.dto.SuiteStatusView;
import com.exceptioncoder.toolbox.claudechat.service.PluginUpdateService;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.UUID;

/**
 * team-standards 插件双端版本检测 + 一键更新。
 * 更新走 SSE GET（EventSource 只能 GET）:create 并返回 emitter 后再启 worker,实时回显双端 4 条命令。
 */
@RestController
@RequestMapping("/api/claude-chat/plugins")
public class PluginUpdateController {

    private final PluginUpdateService service;
    private final SseEmitterRegistry sse;

    public PluginUpdateController(PluginUpdateService service, SseEmitterRegistry sse) {
        this.service = service;
        this.sse = sse;
    }

    /** 查 team-standards 在 Claude/Codex 两端版本。 */
    @GetMapping("/status")
    public PluginStatusView status() {
        return service.readStatus();
    }

    /**
     * 列团队套件状态（3 插件 + 2 MCP）：插件带版本，MCP 带知识库 git 状态。
     * fetch=true 时先对 MCP 知识库仓 git fetch，使「落后远端」数准确（较慢，按需调用）。
     */
    @GetMapping("/suites")
    public List<SuiteStatusView> suites(@RequestParam(defaultValue = "false") boolean fetch) {
        return service.readSuites(fetch);
    }

    /** 触发双端更新并以 SSE 实时回显输出。先 create+返回 emitter(挂 HTTP),再启 worker。 */
    @GetMapping(value = "/update/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter updateStream() {
        String taskId = UUID.randomUUID().toString();
        SseEmitter emitter = sse.create(taskId);
        service.startUpdate(taskId);
        return emitter;
    }
}
