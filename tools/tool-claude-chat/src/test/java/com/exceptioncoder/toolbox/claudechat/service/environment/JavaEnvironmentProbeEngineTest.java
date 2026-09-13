package com.exceptioncoder.toolbox.claudechat.service.environment;

import com.exceptioncoder.toolbox.claudechat.service.ForgeEnvironmentCommandRunner;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class JavaEnvironmentProbeEngineTest {
    @Test
    void shouldRunConcurrentlyWithinBoundAndKeepCatalogOrder() {
        var active = new AtomicInteger();
        var maximum = new AtomicInteger();
        var runner = new ForgeEnvironmentCommandRunner() {
            @Override
            public CommandResult runWithPath(List<String> command, Duration timeout, String path) {
                assertThat(path).isEqualTo("fixed-path");
                int current = active.incrementAndGet();
                maximum.accumulateAndGet(current, Math::max);
                try {
                    Thread.sleep(25);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                } finally {
                    active.decrementAndGet();
                }
                return new CommandResult(0, true, "1.2.3");
            }
        };
        var results = new JavaEnvironmentProbeEngine(runner).inspect("fixed-path");
        assertThat(maximum.get()).isBetween(2, 4);
        assertThat(results).extracting(EnvironmentProbeResult::id).containsExactlyElementsOf(EnvironmentProbeCatalog.IDS);
        assertThat(results).allSatisfy(result -> assertThat(result.durationMs()).isGreaterThanOrEqualTo(0));
    }
}
