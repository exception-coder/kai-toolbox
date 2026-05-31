package com.exceptioncoder.toolbox.vscodetunnel.api;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.vscodetunnel.api.dto.StartRequest;
import com.exceptioncoder.toolbox.vscodetunnel.config.VsCodeTunnelProperties;
import com.exceptioncoder.toolbox.vscodetunnel.domain.TunnelStatus;
import com.exceptioncoder.toolbox.vscodetunnel.service.TunnelLauncher;
import com.exceptioncoder.toolbox.vscodetunnel.service.TunnelManager;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/vscode-tunnel")
public class TunnelController {

    private static final Pattern TUNNEL_NAME = Pattern.compile("^[a-zA-Z0-9][a-zA-Z0-9-]{0,31}$");
    private static final String SSE_KEY_PREFIX = "vscode-tunnel:";

    private final TunnelManager manager;
    private final SseEmitterRegistry sseRegistry;
    private final VsCodeTunnelProperties props;

    public TunnelController(TunnelManager manager,
                            SseEmitterRegistry sseRegistry,
                            VsCodeTunnelProperties props) {
        this.manager = manager;
        this.sseRegistry = sseRegistry;
        this.props = props;
    }

    @GetMapping("/status")
    public TunnelStatus status() {
        return manager.status();
    }

    @PostMapping("/start")
    public TunnelStatus start(@RequestBody(required = false) StartRequest req) {
        ensureEnabled();
        String name = req == null ? null : req.tunnelName();
        if (name != null && !name.isBlank() && !TUNNEL_NAME.matcher(name).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "tunnelName 仅允许字母数字与 -，开头需为字母数字，长度 1-32");
        }
        return manager.start(name);
    }

    @PostMapping("/stop")
    public TunnelStatus stop() {
        return manager.stop();
    }

    /**
     * 扫描本机是否存在 `code tunnel` daemon（含上次 JVM 强退留下的孤儿）。
     * 直接把 `code tunnel status` 的原始输出回传给前端，由用户判断。
     */
    @GetMapping("/residue")
    public TunnelLauncher.CommandResult residue() {
        ensureEnabled();
        return manager.scanResidue();
    }

    /**
     * 杀掉本机所有 `code tunnel` daemon（包括本进程当前正在运行的）。
     * 前端应在内存状态 STOPPED 时才暴露此按钮，避免误杀正常的本期隧道。
     */
    @PostMapping("/residue/kill")
    public TunnelLauncher.CommandResult killResidue() {
        ensureEnabled();
        return manager.killResidue();
    }

    @GetMapping("/events")
    public SseEmitter events() {
        ensureEnabled();
        String key = SSE_KEY_PREFIX + UUID.randomUUID();
        SseEmitter emitter = sseRegistry.create(key);
        emitter.onCompletion(() -> manager.unsubscribe(key));
        emitter.onTimeout(() -> manager.unsubscribe(key));
        emitter.onError(e -> manager.unsubscribe(key));
        manager.subscribe(key);
        return emitter;
    }

    private void ensureEnabled() {
        if (!props.enabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "VS Code Tunnel 工具已禁用 (toolbox.vscode-tunnel.enabled=false)");
        }
    }
}
