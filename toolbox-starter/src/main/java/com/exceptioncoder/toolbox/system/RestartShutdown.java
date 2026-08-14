package com.exceptioncoder.toolbox.system;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicBoolean;

/** 在 HTTP 响应有机会写回后关闭旧 Spring 上下文并结束 JVM。 */
@Component
public class RestartShutdown {

    private static final Logger log = LoggerFactory.getLogger(RestartShutdown.class);

    private final RestartProperties properties;
    private final RestartRuntime runtime;
    private final ConfigurableApplicationContext context;
    private final AtomicBoolean scheduled = new AtomicBoolean(false);

    public RestartShutdown(RestartProperties properties,
                           RestartRuntime runtime,
                           ConfigurableApplicationContext context) {
        this.properties = properties;
        this.runtime = runtime;
        this.context = context;
    }

    void afterResponse(ProcessHandle replacement, Runnable onCancelled) {
        if (replacement == null || !replacement.isAlive()) {
            throw new IllegalStateException("replacement JVM is not alive");
        }
        if (!scheduled.compareAndSet(false, true)) {
            throw new IllegalStateException("JVM shutdown is already scheduled");
        }
        Thread.ofPlatform().name("system-restart-handoff").daemon(false).start(() -> {
            try {
                Thread.sleep(properties.getExitDelay());
                if (!replacement.isAlive()) {
                    scheduled.set(false);
                    log.error("[restart] replacement JVM exited before old JVM shutdown; keeping current service alive");
                    onCancelled.run();
                    return;
                }
                log.warn("[restart] replacement JVM handshake confirmed; closing old Spring context");
                try {
                    context.close();
                } finally {
                    runtime.exit(0);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                scheduled.set(false);
                onCancelled.run();
                log.error("[restart] old JVM shutdown thread interrupted; keeping current service alive");
            } catch (RuntimeException e) {
                // Once context.close has started, remaining alive beside the waiting replacement would deadlock
                // the handoff. Force the normal JVM exit path after recording the failure.
                log.error("[restart] old JVM shutdown failed", e);
                runtime.exit(1);
            }
        });
    }
}
