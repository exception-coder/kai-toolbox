package com.exceptioncoder.toolbox.claudechat.service;

import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;

/**
 * Sidecar 断线后的后台重连调度：单飞去重、有限重试、连续失败后强制重建进程，
 * 连接恢复后回调会话恢复核对；停机时立即停手。从 ClaudeChatService 拆出，行为不变。
 */
@Slf4j
final class SidecarReconnector {

    /** 一轮重连结束后的冷却时长：同一次断开的后续事件落在窗口内即被丢弃 */
    private static final long SIDECAR_RECOVERY_COOLDOWN_MS = 1000;
    /** 连续这么多次连不上，才判定端口上是僵尸监听者并强制重建 sidecar */
    private static final int SIDECAR_RESTART_AFTER_ATTEMPTS = 3;

    private final SidecarClient sidecar;
    private final SidecarProcessRegistry processRegistry;
    private final BooleanSupplier shuttingDown;
    /** 按 Sidecar 真实快照恢复全部会话；返回 false 表示仍有会话状态待确认，需要继续重试 */
    private final BooleanSupplier resumeAll;
    /** 后台 sidecar 重连任务的去重锁，避免多次断开叠起多个重连循环 */
    private final AtomicBoolean recovering = new AtomicBoolean(false);

    SidecarReconnector(SidecarClient sidecar, SidecarProcessRegistry processRegistry,
                       BooleanSupplier shuttingDown, BooleanSupplier resumeAll) {
        this.sidecar = sidecar;
        this.processRegistry = processRegistry;
        this.shuttingDown = shuttingDown;
        this.resumeAll = resumeAll;
    }

    /**
     * sidecar 断开后后台自动重连并 resume 所有会话，无需用户手动重进会话。
     * 重连只针对 Java↔sidecar 链路（与浏览器网络无关），故前端的浏览器重连帮不上忙，必须由后端兜。
     */
    void schedule() {
        if (shuttingDown.getAsBoolean()) return;
        if (!recovering.compareAndSet(false, true)) return;
        Thread.ofVirtual().name("claude-chat-sidecar-recover").start(() -> {
            try {
                for (int attempt = 1; attempt <= 20; attempt++) {
                    if (shuttingDown.getAsBoolean()) return;
                    try {
                        if (!sidecar.isConnected()) {
                            // 连不上且已重试多次＝端口上多半是收不了连接的僵尸监听者，才强制重建；
                            // 正常路径一律沿用既有 sidecar，别把正在服务的实例杀掉。
                            if (attempt == SIDECAR_RESTART_AFTER_ATTEMPTS + 1) {
                                log.warn("[claude-chat] sidecar 连续 {} 次连不上，强制重建",
                                        SIDECAR_RESTART_AFTER_ATTEMPTS);
                                processRegistry.restart();
                            } else {
                                processRegistry.ensureStarted();
                            }
                            sidecar.ensureConnected();
                        }
                        if (resumeAll.getAsBoolean()) {
                            return;
                        }
                        throw new IOException("部分会话的Sidecar状态尚未确认");
                    } catch (IOException e) {
                        if (attempt == 20) {
                            log.warn("[claude-chat] sidecar 自动重连失败，放弃（等下次用户动作再试）：{}", e.getMessage());
                            return;
                        }
                        sleep(1500);
                    }
                }
            } finally {
                // 一次断开会连带多条连接级事件，冷却期内的重复触发直接被 CAS 丢弃，避免叠成多轮重连
                sleep(SIDECAR_RECOVERY_COOLDOWN_MS);
                recovering.set(false);
            }
        });
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
