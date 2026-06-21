package com.exceptioncoder.toolbox.system;

import com.exceptioncoder.toolbox.common.auth.annotation.RequireAuth;
import com.exceptioncoder.toolbox.common.log.RecentLogsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ApplicationContext;
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
 * 系统级运维端点。{@code POST /restart} 让运行中的进程优雅退出，由外部守护脚本
 * （{@code scripts/run-supervised.ps1}）重新编译并拉起，从而远程应用新代码。
 *
 * <p>经公网 tunnel 暴露，故必须配置 {@code toolbox.system.restart-token} 才开放；
 * 未配置直接 503，token 不符 403——杜绝公网裸重启开关。
 */
@RestController
@RequestMapping("/api/system")
public class SystemController {

    private static final Logger log = LoggerFactory.getLogger(SystemController.class);

    private final ApplicationContext ctx;
    private final SystemProperties props;
    private final RecentLogsService recentLogs;

    public SystemController(ApplicationContext ctx, SystemProperties props, RecentLogsService recentLogs) {
        this.ctx = ctx;
        this.props = props;
        this.recentLogs = recentLogs;
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
        log.warn("[system] 收到远程重启请求，进程即将退出，由守护脚本重新编译并拉起");
        // 异步退出：先让本响应回写给客户端，再优雅关闭（@PreDestroy 会杀 sidecar 等），守护脚本随后重起。
        Thread.ofVirtual().name("system-restart").start(() -> {
            try {
                Thread.sleep(300);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            int code = SpringApplication.exit(ctx, () -> 0);
            System.exit(code);
        });
        return ResponseEntity.ok(Map.of("status", "restarting"));
    }
}
