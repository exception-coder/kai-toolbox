package com.exceptioncoder.toolbox.claudechat.service.autopilot;

import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

class RuntimeProbeFailureGuardTest {
    private final RuntimeProbeFailureGuard guard = new RuntimeProbeFailureGuard();
    private final Instant start = Instant.parse("2026-10-07T00:00:00Z");

    @Test void requiresBothElapsedTimeAndRepeatedFailures() {
        assertFalse(guard.observe("run:1", "STALE", start));
        assertFalse(guard.observe("run:1", "SIDECAR_UNREACHABLE", start.plusSeconds(15)));
        assertFalse(guard.observe("run:1", "STALE", start.plusSeconds(30)));
        assertTrue(guard.observe("run:1", "STALE", start.plusSeconds(60)));
    }

    @Test void normalBusyResetsFailureWindow() {
        guard.observe("run:1", "STALE", start);
        guard.observe("run:1", "STALE", start.plusSeconds(30));
        assertFalse(guard.observe("run:1", "CONSISTENT", start.plusSeconds(60)));
        assertFalse(guard.observe("run:1", "STALE", start.plusSeconds(90)));
    }

    @Test void resumedGenerationAndOtherSessionsHaveIndependentWindows() {
        guard.observe("run:1", "STALE", start);
        guard.observe("run:1", "STALE", start.plusSeconds(30));
        assertFalse(guard.observe("run:2", "STALE", start.plusSeconds(90)));
        assertFalse(guard.observe("other:1", "STALE", start.plusSeconds(90)));
        assertTrue(guard.observe("run:1", "STALE", start.plusSeconds(90)));
    }

    @Test void aSingleOldFailureIsNotEnough() {
        guard.observe("run:1", "STALE", start);
        assertFalse(guard.observe("run:1", "STALE", start.plusSeconds(3600)));
    }
}
