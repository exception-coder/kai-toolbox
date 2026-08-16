package com.exceptioncoder.toolbox.claudechat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class AntigravityHistoryReaderTest {

    @TempDir
    Path tempDir;

    @Test
    void readsUserAndAssistantMessagesFromTranscriptProjection() throws Exception {
        String id = "8550e3a1-ee2b-48dc-b040-e8b6604af698";
        Path transcript = tempDir.resolve("brain").resolve(id)
                .resolve(".system_generated/logs/transcript.jsonl");
        Files.createDirectories(transcript.getParent());
        Files.writeString(transcript, String.join("\n",
                "{\"source\":\"USER_EXPLICIT\",\"type\":\"USER_INPUT\",\"created_at\":\"2026-08-16T04:50:22Z\",\"content\":\"<USER_REQUEST>\\nRules\\n\\nUser task:\\n修复多轮\\n</USER_REQUEST>\"}",
                "{\"source\":\"SYSTEM\",\"type\":\"CHECKPOINT\",\"content\":\"hidden\"}",
                "{\"source\":\"MODEL\",\"type\":\"PLANNER_RESPONSE\",\"created_at\":\"2026-08-16T04:50:23Z\",\"content\":\"已经修复\"}"));

        AntigravityHistoryReader reader = new AntigravityHistoryReader(new ObjectMapper(), tempDir);

        assertThat(reader.readMessages(id))
                .extracting(message -> message.kind() + ":" + message.text())
                .containsExactly("user:修复多轮", "assistant:已经修复");
        assertThat(reader.exists(id)).isTrue();
        assertThat(reader.scanConversationIds()).containsExactly(id);
    }

    @Test
    void rejectsNonUuidAndTraversalConversationIds() {
        AntigravityHistoryReader reader = new AntigravityHistoryReader(new ObjectMapper(), tempDir);

        assertThat(reader.findTranscript("../../secrets")).isNull();
        assertThat(reader.findTranscript("not-a-uuid")).isNull();
    }
}
