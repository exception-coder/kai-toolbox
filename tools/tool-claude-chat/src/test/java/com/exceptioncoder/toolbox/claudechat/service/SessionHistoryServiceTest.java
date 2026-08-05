package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.repository.SessionAliasRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class SessionHistoryServiceTest {

    private static final String CONTINUATION_PREFIX =
            "This session is being continued from a previous conversation that ran out of context.";
    private static final String CONTINUATION_END =
            "Pick up the last task as if the break never happened.";

    @Test
    void shouldKeepNormalUserMessageUnchanged() {
        String message = "请继续修复历史消息显示。";

        assertThat(SessionHistoryService.normalizeCodexUserMessage(message)).isEqualTo(message);
    }

    @Test
    void shouldKeepOnlyRealInputAfterContinuationSummary() {
        String message = CONTINUATION_PREFIX
                + "\n\nSummary:\n- previous work"
                + "\n\n" + CONTINUATION_END
                + "\n\n\n这种内容为什么显示为我发送的？";

        assertThat(SessionHistoryService.normalizeCodexUserMessage(message))
                .isEqualTo("这种内容为什么显示为我发送的？");
    }

    @Test
    void shouldDropContinuationMessageWithoutRealInput() {
        String message = CONTINUATION_PREFIX
                + "\n\nSummary:\n- previous work"
                + "\n\n" + CONTINUATION_END;

        assertThat(SessionHistoryService.normalizeCodexUserMessage(message)).isEmpty();
    }

    @Test
    void shouldKeepIncompleteContinuationFrameUnchanged() {
        String message = CONTINUATION_PREFIX + "\n\n这是用户手动粘贴的片段。";

        assertThat(SessionHistoryService.normalizeCodexUserMessage(message)).isEqualTo(message);
    }

    @Test
    void shouldReadCodexRolloutFromSessionSpecificCodexHome(@TempDir Path tempDir) throws Exception {
        String sid = "019fb1cf-b3aa-7e31-b079-16177b490df5";
        Path codexHome = tempDir.resolve("codex-account-yx");
        Path rollout = codexHome.resolve("sessions/2026/07/30")
                .resolve("rollout-2026-07-30T00-01-02-" + sid + ".jsonl");
        Files.createDirectories(rollout.getParent());
        Files.writeString(rollout, """
                {"timestamp":"2026-07-30T00:01:01Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn-123"}}
                {"timestamp":"2026-07-30T00:01:02Z","type":"event_msg","payload":{"type":"user_message","message":"修复自定义目录历史"}}
                {"timestamp":"2026-07-30T00:01:03Z","type":"event_msg","payload":{"type":"agent_message","message":"已完成"}}
                """);
        SessionHistoryService service = new SessionHistoryService(
                new ObjectMapper(), mock(SessionAliasRepository.class));

        var page = service.readMessages(null, sid, codexHome.toString(), null, 30);

        assertThat(page.transcriptMissing()).isFalse();
        assertThat(page.items()).extracting(item -> item.kind() + ":" + item.text())
                .containsExactly("user:修复自定义目录历史", "assistant:已完成");
        assertThat(page.items().get(1).forkAnchor()).isEqualTo("turn-123");
        assertThat(service.transcriptExists(null, sid, codexHome.toString())).isTrue();
    }

    @Test
    void shouldBatchCheckEachSessionInItsOwnCodexHome(@TempDir Path tempDir) throws Exception {
        String existingSid = "019fb1cf-b3aa-7e31-b079-16177b490df5";
        String missingSid = "019fb1d8-4a4f-77a2-9e36-42b957ac7401";
        Path firstHome = tempDir.resolve("codex-account-yx");
        Path secondHome = tempDir.resolve("codex-account-other");
        Path rollout = firstHome.resolve("sessions/2026/07/30")
                .resolve("rollout-2026-07-30T00-01-02-" + existingSid + ".jsonl");
        Files.createDirectories(rollout.getParent());
        Files.writeString(rollout, "{}");
        SessionHistoryService service = new SessionHistoryService(
                new ObjectMapper(), mock(SessionAliasRepository.class));

        var missing = service.findMissingTranscriptsByLocation(List.of(
                new SessionHistoryService.TranscriptLocation(existingSid, firstHome.toString()),
                new SessionHistoryService.TranscriptLocation(missingSid, secondHome.toString())));

        assertThat(missing).containsExactly(missingSid);
    }
}
