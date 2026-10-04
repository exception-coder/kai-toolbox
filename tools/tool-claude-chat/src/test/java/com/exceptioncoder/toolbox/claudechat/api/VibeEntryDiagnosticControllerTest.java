package com.exceptioncoder.toolbox.claudechat.api;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VibeEntryDiagnosticControllerTest {
    private final VibeEntryDiagnosticController controller = new VibeEntryDiagnosticController();
    private static final String TRACE = "11111111-1111-4111-8111-111111111111";

    @Test
    void acceptsAllowlistedTiming() {
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                TRACE, "history_latest", "timeout", 20_000, null)).getStatusCode().value()).isEqualTo(204);
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                TRACE, "bootstrap_timeout", "timeout", 10_000, null)).getStatusCode().value()).isEqualTo(204);
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                TRACE, "resource_summary", "ok", 1_000, null,
                new VibeEntryDiagnosticController.ResourceSummary(50, 30, 40, 100_000, 900, 250)))
                .getStatusCode().value()).isEqualTo(204);
    }

    @Test
    void rejectsUnboundedOrUnrecognizedValues() {
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                TRACE, null, "ok", 1, null)).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                TRACE, "history_latest", null, 1, null)).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                TRACE, "message_body", "ok", 1, null)).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                TRACE, "history_latest", "ok", 600_001, null)).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                "invalid", "history_latest", "ok", 1, null)).getStatusCode().value()).isEqualTo(400);
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                TRACE, "resource_summary", "ok", 1, null,
                new VibeEntryDiagnosticController.ResourceSummary(5_001, 0, 0, 0, 0, 0)))
                .getStatusCode().value()).isEqualTo(400);
        assertThat(controller.record(new VibeEntryDiagnosticController.EntryTiming(
                TRACE, "app_mount", "ok", 1, null,
                new VibeEntryDiagnosticController.ResourceSummary(1, 0, 0, 0, 0, 0)))
                .getStatusCode().value()).isEqualTo(400);
    }
}
