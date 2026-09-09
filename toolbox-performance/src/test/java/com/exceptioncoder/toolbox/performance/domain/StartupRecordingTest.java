package com.exceptioncoder.toolbox.performance.domain;

import org.junit.jupiter.api.Test;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.IntStream;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 验证缺失证据、失败保留和并发首次观测。 */
class StartupRecordingTest {

    @Test
    void preservesUnknownAndFirstObservation() {
        var clock = new AtomicLong(42);
        var recording = new StartupRecording("test", clock::get);
        assertThat(recording.milestones().get("applicationReady").elapsedMs()).isNull();
        recording.complete("mainEntered", "main");
        clock.set(99);
        assertThat(recording.complete("mainEntered", "duplicate")).isFalse();
        assertThat(recording.milestones().get("mainEntered").elapsedMs()).isEqualTo(42);
        recording.fail();
        assertThat(recording.milestones().get("mainEntered").status()).isEqualTo("COMPLETED");
        assertThat(recording.milestones().get("applicationReady").status()).isEqualTo("FAILED");
        assertThat(recording.milestones().get("applicationReady").elapsedMs()).isNull();
    }

    @Test
    void admitsOneConcurrentFirstSuccess() {
        var recording = new StartupRecording("test", () -> 10L);
        long accepted = IntStream.range(0, 100).parallel()
                .filter(index -> recording.complete("firstApiSuccess", "GET /api/test")).count();
        assertThat(accepted).isEqualTo(1);
    }

    @Test
    void boundsToolsAndDistinguishesUnobserved() {
        var recording = new StartupRecording("test", () -> 10L);
        recording.observeTool("rag", "NOT_OBSERVED");
        assertThat(recording.tools().get("rag").elapsedMs()).isNull();
        IntStream.range(0, 63).forEach(index -> recording.observeTool("tool-" + index, "SKIPPED"));
        assertThatThrownBy(() -> recording.observeTool("overflow", "COMPLETED"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> recording.observeTool("invalid/key", "COMPLETED"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
