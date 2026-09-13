package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.ForgeEnvironmentView;
import com.exceptioncoder.toolbox.claudechat.service.ForgeEnvironmentBootstrapService;
import com.exceptioncoder.toolbox.claudechat.service.ForgeEnvironmentService;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;
import java.util.concurrent.CompletionException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Forge 研发环境快照与一键初始化的 HTTP 适配器。 */
@RestController("claudeChatForgeEnvironmentController")
@RequestMapping("/api/claude-chat/forge-environment")
public class ForgeEnvironmentController {

    private final ForgeEnvironmentService environmentService;
    private final ForgeEnvironmentBootstrapService bootstrapService;
    private final SseEmitterRegistry sse;

    public ForgeEnvironmentController(ForgeEnvironmentService environmentService,
                                      ForgeEnvironmentBootstrapService bootstrapService,
                                      SseEmitterRegistry sse) {
        this.environmentService = environmentService;
        this.bootstrapService = bootstrapService;
        this.sse = sse;
    }

    /** 返回本机 Forge 环境的分层就绪度。 */
    @GetMapping
    public ForgeEnvironmentView readiness(
            @RequestParam(required = false) String sessionId,
            @RequestParam(defaultValue = "gitee") String source,
            @RequestParam(defaultValue = "false") boolean fetch,
            @RequestParam(defaultValue = "java") String engine,
            @RequestParam(defaultValue = "false") boolean refresh) {
        try {
            return environmentService.inspect(sessionId, source, fetch, engine, refresh);
        } catch (CompletionException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    exception.getCause().getMessage(), exception.getCause());
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, exception.getMessage(), exception);
        }
    }

    /** 用户点击后启动固定白名单的一键初始化。 */
    @GetMapping(value = "/bootstrap/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter bootstrap(
            @RequestParam(required = false) String sessionId,
            @RequestParam(defaultValue = "gitee") String source) {
        String taskId = UUID.randomUUID().toString();
        SseEmitter emitter = sse.create(taskId);
        bootstrapService.start(taskId, sessionId, source);
        return emitter;
    }
}
