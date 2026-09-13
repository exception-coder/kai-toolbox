package com.exceptioncoder.toolbox.claudechat.service.environment;

import com.exceptioncoder.toolbox.claudechat.service.ForgeEnvironmentCommandRunner;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** 同一批固定版本命令的有界并行 Java 实现。 */
@Component("claudeChatJavaEnvironmentProbeEngine")
public class JavaEnvironmentProbeEngine implements EnvironmentProbeEngine {
    private final ForgeEnvironmentCommandRunner runner;

    public JavaEnvironmentProbeEngine(ForgeEnvironmentCommandRunner runner) {
        this.runner = runner;
    }

    @Override
    public String id() {
        return "java";
    }

    @Override
    public List<EnvironmentProbeResult> inspect(String path) {
        try (var executor = new ThreadPoolExecutor(EnvironmentProbeCatalog.CONCURRENCY, EnvironmentProbeCatalog.CONCURRENCY, 0, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(EnvironmentProbeCatalog.IDS.size()),
                Thread.ofVirtual().name("environment-probe-", 0).factory(),
                new ThreadPoolExecutor.AbortPolicy())) {
            var futures = EnvironmentProbeCatalog.IDS.stream()
                    .map(id -> CompletableFuture.supplyAsync(() -> probe(id, path), executor)).toList();
            return futures.stream().map(CompletableFuture::join).toList();
        }
    }

    private EnvironmentProbeResult probe(String id, String path) {
        long start = System.nanoTime();
        var result = runner.runWithPath(List.of(id, "--version"),
                Duration.ofSeconds(EnvironmentProbeCatalog.TIMEOUT_SECONDS), path);
        return new EnvironmentProbeResult(id, result.exitCode(), result.completed(), result.output(),
                TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start));
    }
}
