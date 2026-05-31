package com.exceptioncoder.toolbox.vscodetunnel.service;

import com.exceptioncoder.toolbox.common.sse.SseEmitterRegistry;
import com.exceptioncoder.toolbox.vscodetunnel.config.VsCodeTunnelProperties;
import com.exceptioncoder.toolbox.vscodetunnel.domain.TunnelState;
import com.exceptioncoder.toolbox.vscodetunnel.domain.TunnelStatus;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * 单例 code tunnel 进程的状态机 + SSE 订阅广播中心。
 *
 * 设计要点：
 * - 同时只有一个子进程；start/stop/解析回调全部进同一把锁
 * - 不持久化任何状态；Spring 关停时强制销毁子进程
 * - SseEmitterRegistry 是 key→emitter 一对一，因此本类自维护订阅 key 集合，
 *   状态切换时遍历调 publish 实现"广播"
 */
@Component
public class TunnelManager {

    private static final Logger log = LoggerFactory.getLogger(TunnelManager.class);
    private static final String SSE_EVENT_NAME = "status";

    private final VsCodeTunnelProperties props;
    private final TunnelLauncher launcher;
    private final SseEmitterRegistry sseRegistry;

    private final Set<String> subscribers = ConcurrentHashMap.newKeySet();

    private TunnelStatus current = TunnelStatus.stopped();
    private Process process;
    private Thread parserThread;
    private TunnelOutputParser.TailBuffer tail;

    public TunnelManager(VsCodeTunnelProperties props,
                         TunnelLauncher launcher,
                         SseEmitterRegistry sseRegistry) {
        this.props = props;
        this.launcher = launcher;
        this.sseRegistry = sseRegistry;
    }

    public synchronized TunnelStatus status() {
        return current;
    }

    /**
     * 启动隧道。在非 STOPPED / ERROR 状态下幂等返回当前 status（R1）。
     */
    public synchronized TunnelStatus start(String tunnelName) {
        if (current.state() != TunnelState.STOPPED && current.state() != TunnelState.ERROR) {
            log.debug("start() called but tunnel already in state {}, returning current", current.state());
            return current;
        }
        String name = (tunnelName == null || tunnelName.isBlank()) ? props.tunnelName() : tunnelName;
        this.tail = new TunnelOutputParser.TailBuffer(props.errorTailBytes());
        Process p = launcher.spawn(name);  // 失败抛 TunnelStartException
        this.process = p;
        transitionTo(new TunnelStatus(
                TunnelState.STARTING,
                null, null, null,
                name,
                p.pid(),
                Instant.now(),
                null));

        Process pRef = p;
        TunnelOutputParser.TailBuffer tailRef = this.tail;
        this.parserThread = Thread.ofVirtual()
                .name("vscode-tunnel-parser-" + p.pid())
                .start(() -> TunnelOutputParser.parse(
                        pRef.getInputStream(),
                        this::onDeviceCode,
                        this::onTunnelUrl,
                        tailRef));

        p.onExit().thenAccept(exited -> onProcessExit(exited.exitValue(), tailRef.snapshot()));

        return current;
    }

    /**
     * 优雅停止；超时强杀（R3）。在 STOPPED 状态下直接返回。
     */
    public synchronized TunnelStatus stop() {
        if (current.state() == TunnelState.STOPPED) {
            return current;
        }
        Process p = this.process;
        if (p == null || !p.isAlive()) {
            // 进程已经死了，但状态没归位 —— 强制归位
            transitionTo(TunnelStatus.stopped());
            return current;
        }
        transitionTo(current.withState(TunnelState.STOPPING));
        p.destroy();
        boolean exited;
        try {
            exited = p.waitFor(props.stopGraceMs(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            exited = false;
        }
        if (!exited) {
            log.warn("code tunnel did not exit within {}ms, force killing", props.stopGraceMs());
            p.destroyForcibly();
        }
        // onProcessExit 会被 onExit 异步触发；为了让 stop() 返回时状态就是 STOPPED，这里同步处理一次
        if (current.state() != TunnelState.STOPPED) {
            transitionTo(TunnelStatus.stopped());
        }
        return current;
    }

    @PreDestroy
    public void shutdown() {
        try {
            stop();
        } catch (RuntimeException e) {
            log.warn("error during shutdown", e);
        }
    }

    /* ---- 残留扫描与清理（R14 / R15，落地 RK5） ---- */

    private static final Duration RESIDUE_CMD_TIMEOUT = Duration.ofSeconds(5);

    /**
     * 扫描本机是否存在 `code tunnel` daemon（含上次 JVM 强退留下的孤儿）。
     * R15：不进锁——纯读，可与 start/stop 并发；最坏只会看到瞬时状态。
     */
    public TunnelLauncher.CommandResult scanResidue() {
        return launcher.runSubcommand(RESIDUE_CMD_TIMEOUT, "status");
    }

    /**
     * 杀掉本机所有 `code tunnel` daemon。
     * R15：必须进锁——避免与 start() 竞态（刚 spawn 就被自己杀掉的窗口）。
     * 注意：本命令无差别杀，调用方（Controller / UI）需要先保证内存状态为 STOPPED。
     */
    public synchronized TunnelLauncher.CommandResult killResidue() {
        TunnelLauncher.CommandResult r = launcher.runSubcommand(RESIDUE_CMD_TIMEOUT, "kill");
        // 兜底：如果状态机被卡在 ERROR/STOPPING 等非 STOPPED 态而 process 字段已空，借此机会归位
        if (this.process == null && current.state() != TunnelState.STOPPED) {
            transitionTo(TunnelStatus.stopped());
        }
        return r;
    }

    /* ---- SSE 订阅管理 ---- */

    /**
     * 注册一个订阅 key，并立即把当前 status 推送一次（R9）。
     * 调用方需先通过 SseEmitterRegistry.create(key) 拿到 emitter 并返回给客户端。
     */
    public synchronized void subscribe(String key) {
        subscribers.add(key);
        sseRegistry.publish(key, SSE_EVENT_NAME, current);
    }

    public void unsubscribe(String key) {
        subscribers.remove(key);
    }

    /* ---- Parser 回调（在 parser 虚拟线程上调用，进锁同步状态） ---- */

    synchronized void onDeviceCode(String code) {
        if (current.state() != TunnelState.STARTING) {
            return; // 状态已迁移，忽略迟到事件
        }
        transitionTo(current.withState(TunnelState.AUTH_REQUIRED).withDeviceCode(code));
    }

    synchronized void onTunnelUrl(String url) {
        if (current.state() != TunnelState.STARTING && current.state() != TunnelState.AUTH_REQUIRED) {
            return;
        }
        transitionTo(current.withState(TunnelState.RUNNING).withTunnelUrl(url));
    }

    synchronized void onProcessExit(int exitCode, String tailSnapshot) {
        if (current.state() == TunnelState.STOPPED) {
            return;
        }
        if (current.state() == TunnelState.STOPPING || exitCode == 0) {
            transitionTo(TunnelStatus.stopped());
        } else {
            String err = "code tunnel 进程异常退出 (exit=" + exitCode + "):\n" + tailSnapshot;
            if (err.length() > props.errorTailBytes() + 128) {
                err = err.substring(0, props.errorTailBytes() + 128);
            }
            transitionTo(current.withState(TunnelState.ERROR).withError(err));
        }
        this.process = null;
        this.parserThread = null;
    }

    private void transitionTo(TunnelStatus next) {
        log.info("vscode-tunnel state {} → {}", current.state(), next.state());
        this.current = next;
        for (String key : subscribers) {
            sseRegistry.publish(key, SSE_EVENT_NAME, next);
        }
    }
}
