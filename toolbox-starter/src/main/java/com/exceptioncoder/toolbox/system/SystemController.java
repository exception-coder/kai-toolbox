package com.exceptioncoder.toolbox.system;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.log.RecentLogsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 系统级运维端点。{@code POST /restart} 先与外部 supervisor 或 replacement JVM
 * 完成交接握手，再让当前进程优雅退出；无法确认接管者时保留当前服务。
 *
 * <p>经公网 tunnel 暴露，故必须配置 {@code toolbox.system.restart-token} 才开放；
 * 未配置直接 503，token 不符 403——杜绝公网裸重启开关。
 */
@RestController
@RequestMapping("/api/system")
public class SystemController {

    private static final Logger log = LoggerFactory.getLogger(SystemController.class);

    private final SystemProperties props;
    private final RecentLogsService recentLogs;
    private final RestartCoordinator restartCoordinator;

    public SystemController(SystemProperties props, RecentLogsService recentLogs,
                            RestartCoordinator restartCoordinator) {
        this.props = props;
        this.recentLogs = recentLogs;
        this.restartCoordinator = restartCoordinator;
    }

    /**
     * 最近日志（含透传进来的 sidecar 日志），供 Vibe Coding 排查时一键复制贴给 AI。
     * 返回纯文本便于直接选中复制。需登录（日志可能含敏感信息）；前端 http/authFetch 自动带 JWT。
     *
     * @param mode    {@code error}（默认，最近 WARN/ERROR + 上下文）/ {@code all}（最近全量）
     * @param limit   返回行数上限（1..500）
     * @param context error 模式下每个告警前后保留的上下文行数（0..50）
     */
    @GetMapping(value = "/logs", produces = MediaType.TEXT_PLAIN_VALUE + ";charset=UTF-8")
    @RequireAuth
    public ResponseEntity<String> logs(
            @RequestParam(defaultValue = "error") String mode,
            @RequestParam(defaultValue = "200") int limit,
            @RequestParam(defaultValue = "8") int context) {
        int safeLimit = Math.max(1, Math.min(limit, 500));
        int safeContext = Math.max(0, Math.min(context, 50));
        return ResponseEntity.ok(recentLogs.recent(mode, safeLimit, safeContext));
    }

    /** token 经 query 参数或 {@code X-Restart-Token} 头传入。 */
    @PostMapping("/restart")
    public ResponseEntity<Map<String, String>> restart(
            @RequestParam(required = false) String token,
            @RequestHeader(value = "X-Restart-Token", required = false) String headerToken) {
        String configured = props.getRestartToken();
        if (configured == null || configured.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "restart 未启用：未配置 toolbox.system.restart-token"));
        }
        String provided = token != null ? token : headerToken;
        if (!configured.equals(provided)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "token 无效"));
        }
        RestartCoordinator.RestartOutcome outcome = restartCoordinator.restartCurrent();
        if (!outcome.accepted()) {
            HttpStatus status = outcome.failure() == RestartCoordinator.Failure.ALREADY_RESTARTING
                    ? HttpStatus.CONFLICT
                    : HttpStatus.SERVICE_UNAVAILABLE;
            log.warn("[system] 重启请求未交接，不退出当前服务：code={}, reason={}",
                    outcome.failure(), outcome.message());
            return ResponseEntity.status(status).body(Map.of(
                    "error", outcome.message(),
                    "code", outcome.failure().name()));
        }
        log.warn("[system] 重启接管者已确认：{}", outcome.message());
        return ResponseEntity.ok(Map.of("status", "restarting", "message", outcome.message()));
    }
}
