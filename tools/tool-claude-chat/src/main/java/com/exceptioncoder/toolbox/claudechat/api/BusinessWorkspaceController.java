package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.api.dto.BusinessSystemWorkspaceView;
import com.exceptioncoder.toolbox.claudechat.service.BusinessOpenSpecService;
import com.exceptioncoder.toolbox.claudechat.service.BusinessWorkspaceService;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.UUID;

/** 团队依赖面板中的固定业务系统源码状态与安全同步入口。 */
@RestController
@RequestMapping("/api/claude-chat/plugins/business-systems")
public class BusinessWorkspaceController {

    private final BusinessWorkspaceService service;
    private final BusinessOpenSpecService openSpecService;
    private final SseEmitterRegistry sse;

    public BusinessWorkspaceController(BusinessWorkspaceService service,
                                       BusinessOpenSpecService openSpecService,
                                       SseEmitterRegistry sse) {
        this.service = service;
        this.openSpecService = openSpecService;
        this.sse = sse;
    }

    @GetMapping
    public List<BusinessSystemWorkspaceView> list(
            @RequestParam(defaultValue = "false") boolean fetch) {
        return service.readStatuses(fetch);
    }

    @GetMapping(value = "/sync/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter sync(@RequestParam(defaultValue = "all") String system) {
        String taskId = UUID.randomUUID().toString();
        SseEmitter emitter = sse.create(taskId);
        service.startSync(taskId, system);
        return emitter;
    }

    @GetMapping(value = "/openspec/init/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter initializeOpenSpec(@RequestParam(defaultValue = "all") String system) {
        String taskId = UUID.randomUUID().toString();
        SseEmitter emitter = sse.create(taskId);
        openSpecService.startInitialization(taskId, system);
        return emitter;
    }
}
