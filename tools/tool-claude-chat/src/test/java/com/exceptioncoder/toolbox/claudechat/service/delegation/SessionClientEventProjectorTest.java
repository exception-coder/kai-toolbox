package com.exceptioncoder.toolbox.claudechat.service.delegation;

import com.exceptioncoder.toolbox.claudechat.api.dto.ServerMessage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionClientEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SessionClientEventProjectorTest {

    private final SessionClientEventProjector projector = new SessionClientEventProjector(new ObjectMapper());

    @Test
    void dropsToolAndAdministrativeDiagnosticsByDefault() {
        assertThat(projector.project(new ServerMessage.ToolUse(1, "call", "Bash",
                Map.of("command", "type C:\\secret.txt")), 3)).isNull();
        assertThat(projector.project(new ServerMessage.Models(2, List.of(), "private-model"), 3)).isNull();
        assertThat(projector.project(new ServerMessage.EngineEvent(3, 1, "e", "s", "t",
                "codex", "diagnostic", 1, Map.of("token", "secret")), 3)).isNull();
    }

    @Test
    void removesAttachmentPathsFromQueuedMessage() {
        SessionClientEvent event = projector.project(new ServerMessage.QueueDispatched(7, "cmd", "hello",
                null, List.of(new ServerMessage.QueuedAttachment(
                        "a1", "quote.xlsx", "D:\\private\\quote.xlsx", "application/vnd.ms-excel")), 1), 5);

        assertThat(event).isNotNull();
        assertThat(event.type()).isEqualTo("message");
        assertThat(event.toString()).doesNotContain("D:\\private");
        SessionClientEvent.Message data = (SessionClientEvent.Message) event.data();
        assertThat(data.attachments()).containsExactly(
                new SessionClientEvent.Message.Attachment("a1", "quote.xlsx", "application/vnd.ms-excel"));
    }

    @Test
    void mapsInternalErrorToStableNonSensitiveError() {
        SessionClientEvent event = projector.project(new ServerMessage.Error(
                9, "UPSTREAM_SECRET", "token=abc path=D:\\work", true), 4);

        assertThat(event.error().code()).isEqualTo("SERVER_ERROR");
        assertThat(event.error().message()).doesNotContain("abc", "D:\\work", "UPSTREAM_SECRET");
    }

    @Test
    void projectsOnlyBoundAutopilotProgressFields() {
        SessionClientEvent event = projector.project(new ServerMessage.AutopilotState(11, Map.of(
                "state", "RUNNING", "phase", "APPLY", "currentTaskId", "6.4",
                "secret", "never-forward", "progress", Map.of("completedTasks", 4, "totalTasks", 8))), 2);

        SessionClientEvent.Progress progress = (SessionClientEvent.Progress) event.data();
        assertThat(progress.currentTaskId()).isEqualTo("6.4");
        assertThat(event.toString()).doesNotContain("never-forward");
    }

    @Test
    void projectsReplayGapWithoutLeakingInternalBufferState() {
        SessionClientEvent event = projector.project(new ServerMessage.ReplayGap(0, 14, 27), 6);

        assertThat(event.type()).isEqualTo("replayGap");
        assertThat(event.seq()).isZero();
        assertThat(event.sessionVersion()).isEqualTo(6);
        assertThat(event.data()).isEqualTo(new SessionClientEvent.ReplayGap(14, 27));
    }
}
