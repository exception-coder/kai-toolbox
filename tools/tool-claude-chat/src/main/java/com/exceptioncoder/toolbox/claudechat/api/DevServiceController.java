package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.DevServiceManager;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * 通用「开发服务」启停 + 前台日志：供各项目的「XX 需求开发」工作台模块按 {@code id} 起停对应服务并实时看日志，
 * 也服务于自闭环验证的「生效」步。一个 id 一条 SSE 流。是脚手架生成模块的公共后端。
 */
@RestController
@RequestMapping("/api/claude-chat/dev-service")
public class DevServiceController {

    private final DevServiceManager manager;
    private final SseEmitterRegistry sse;

    public DevServiceController(DevServiceManager manager, SseEmitterRegistry sse) {
        this.manager = manager;
        this.sse = sse;
    }

    public record StartRequest(String cwd, String command) {
    }

    public record StopRequest(String stopCommand) {
    }

    public record RestartRequest(String cwd, String command, String stopCommand) {
    }

    @GetMapping("/{id}/status")
    public Map<String, Object> status(@PathVariable String id) {
        return manager.status(id);
    }

    @PostMapping("/{id}/start")
    public Object start(@PathVariable String id, @RequestBody StartRequest req) {
        String err = manager.start(id, req.cwd(), req.command());
        return err == null ? manager.status(id) : Map.of("ok", false, "error", err);
    }

    @PostMapping("/{id}/stop")
    public Object stop(@PathVariable String id, @RequestBody(required = false) StopRequest req) {
        String err = manager.stop(id, req == null ? null : req.stopCommand());
        return err == null ? manager.status(id) : Map.of("ok", false, "error", err);
    }

    @PostMapping("/{id}/restart")
    public Object restart(@PathVariable String id, @RequestBody RestartRequest req) {
        if (manager.isRunning(id)) {
            String stopErr = manager.stop(id, req.stopCommand());
            if (stopErr != null) {
                return Map.of("ok", false, "error", "停止失败：" + stopErr);
            }
        }
        String err = manager.start(id, req.cwd(), req.command());
        return err == null ? manager.status(id) : Map.of("ok", false, "error", err);
    }

    @GetMapping("/{id}/logs")
    public List<String> logs(@PathVariable String id) {
        return manager.snapshot(id);
    }

    /**
     * 实时日志流（SSE）：事件 log=一行日志，status=状态变化，exit=进程退出。
     * 连上即回放当前环形缓冲（前端每次连接前清空，避免重复），再推一次状态——不受"连上前输出丢失"的时序影响。
     */
    @GetMapping(value = "/{id}/logs/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String id) {
        String key = DevServiceManager.sseKey(id);
        SseEmitter emitter = sse.create(key);
        for (String line : manager.snapshot(id)) {
            sse.publish(key, "log", line);
        }
        sse.publish(key, "status", manager.status(id));
        return emitter;
    }
}
