package com.exceptioncoder.toolbox.claudechat.api;

import com.exceptioncoder.toolbox.claudechat.service.ErpServiceManager;
import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * ERP 服务启停 + 前台启动日志：供「ERP 需求开发」工作台直接起停 Yoooni(Resin) 并实时看控制台日志，
 * 也服务于自闭环验证的「生效」步（改完重启让改动生效）。日志经 SSE 实时推送。
 */
@RestController
@RequestMapping("/api/claude-chat/erp-service")
public class ErpServiceController {

    private final ErpServiceManager manager;
    private final SseEmitterRegistry sse;

    public ErpServiceController(ErpServiceManager manager, SseEmitterRegistry sse) {
        this.manager = manager;
        this.sse = sse;
    }

    public record StartRequest(String cwd, String command) {
    }

    public record StopRequest(String stopCommand) {
    }

    public record RestartRequest(String cwd, String command, String stopCommand) {
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return manager.status();
    }

    /** 启动服务。成功回状态；失败回 {ok:false,error}。 */
    @PostMapping("/start")
    public Object start(@RequestBody StartRequest req) {
        String err = manager.start(req.cwd(), req.command());
        return err == null ? manager.status() : Map.of("ok", false, "error", err);
    }

    /** 停止服务。 */
    @PostMapping("/stop")
    public Object stop(@RequestBody(required = false) StopRequest req) {
        String err = manager.stop(req == null ? null : req.stopCommand());
        return err == null ? manager.status() : Map.of("ok", false, "error", err);
    }

    /** 重启：先停（若在运行）再起，用于让改动生效。 */
    @PostMapping("/restart")
    public Object restart(@RequestBody RestartRequest req) {
        if (manager.isRunning()) {
            String stopErr = manager.stop(req.stopCommand());
            if (stopErr != null) {
                return Map.of("ok", false, "error", "停止失败：" + stopErr);
            }
        }
        String err = manager.start(req.cwd(), req.command());
        return err == null ? manager.status() : Map.of("ok", false, "error", err);
    }

    /** 当前日志快照（初次加载，随后走 /logs/stream 增量）。 */
    @GetMapping("/logs")
    public List<String> logs() {
        return manager.snapshot();
    }

    /**
     * 实时日志流（SSE）：事件 log=一行日志，status=状态变化，exit=进程退出。
     * 连上即回放当前环形缓冲（前端每次连接前清空，避免重复），再推一次状态——
     * 这样无论何时打开/重连页面都能立刻看到已有日志，不受"连上前的输出丢失"的时序影响。
     */
    @GetMapping(value = "/logs/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        SseEmitter emitter = sse.create(ErpServiceManager.KEY);
        for (String line : manager.snapshot()) {
            sse.publish(ErpServiceManager.KEY, "log", line);
        }
        sse.publish(ErpServiceManager.KEY, "status", manager.status());
        return emitter;
    }
}
