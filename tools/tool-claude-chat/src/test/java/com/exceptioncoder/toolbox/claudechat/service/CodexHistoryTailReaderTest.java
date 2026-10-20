package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CodexHistoryTailReaderTest {
    @TempDir Path directory;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void coldLatestReadsATailWindowAndResumesAfterReaderRecreationAndAppend() throws Exception {
        Path file = directory.resolve("large.jsonl");
        String padding = mapper.writeValueAsString(Map.of("type", "padding", "payload", Map.of("data", "x".repeat(3_000_000))));
        Files.writeString(file, turn("old", "old question", "old answer") + padding + "\n"
                + turn("new", "最新问题", "最新回复"));
        var reader = new CodexHistoryTailReader(mapper);
        var latest = reader.page(file, null, 1);
        assertThat(latest.items()).extracting(ChatMessageView::text).containsExactly("最新回复");
        var cursor = CodexHistoryCursor.decode(mapper, latest.nextCursor());
        assertThat(cursor.start()).isGreaterThan(3_000_000);
        assertThat(cursor.snapshotSize() - cursor.start()).isLessThan(1000);
        Files.writeString(file, turn("added", "newer question", "newer answer"), StandardOpenOption.APPEND);
        var previous = new CodexHistoryTailReader(mapper).page(file, latest.nextCursor(), 1);
        assertThat(previous.items()).extracting(ChatMessageView::text).containsExactly("最新问题");
        var older = new CodexHistoryTailReader(mapper).page(file, previous.nextCursor(), 30);
        assertThat(older.items()).extracting(ChatMessageView::text).containsExactly("old question", "old answer");
        assertThat(older.nextCursor()).isNull();
        assertThat(reader.page(file, null, 100).items()).extracting(ChatMessageView::text)
                .contains("最新问题", "最新回复", "newer question", "newer answer");
    }

    @Test void paginationRetainsToolPairsTurnUsageAndStableIds() throws Exception {
        Path file = directory.resolve("tools.jsonl");
        Files.writeString(file, event("task_started", Map.of("turn_id", "t"))
                + event("user_message", Map.of("message", "question"))
                + event("function_call", Map.of("call_id", "c", "name", "shell", "arguments", "{\"q\":1}"))
                + event("agent_message", Map.of("message", "answer"))
                + event("function_call_output", Map.of("call_id", "c", "output", "result"))
                + event("token_count", Map.of("info", Map.of("last_token_usage", Map.of("output_tokens", 20)))));
        var reader = new CodexHistoryTailReader(mapper);
        var all = reader.page(file, null, 100);
        var latest = reader.page(file, null, 2);
        var oldest = reader.page(file, latest.nextCursor(), 2);
        List<ChatMessageView> combined = new ArrayList<>(oldest.items());
        combined.addAll(latest.items());
        assertThat(combined).isEqualTo(all.items());
        assertThat(combined.get(1).input()).isEqualTo(Map.of("q", 1));
        assertThat(combined.get(1).output()).isEqualTo("result");
        assertThat(combined.getLast().usage()).containsEntry("output_tokens", 20L);
        assertThat(combined.stream().map(ChatMessageView::id)).doesNotHaveDuplicates();
        assertThat(combined.getFirst().turnId()).isEqualTo("t");
    }

    @Test void cursorsRejectOtherFilesReplacementAndInvalidTokens() throws Exception {
        Path file = directory.resolve("original.jsonl"), other = directory.resolve("other.jsonl");
        Files.writeString(file, turn("t", "question", "answer"));
        Files.copy(file, other);
        var reader = new CodexHistoryTailReader(mapper);
        String cursor = reader.page(file, null, 1).nextCursor();
        assertThatThrownBy(() -> reader.page(other, cursor, 1)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> reader.page(file, "not-a-cursor", 1)).isInstanceOf(ResponseStatusException.class);
        Files.writeString(file, turn("t", "changed", "replacement"));
        assertThatThrownBy(() -> reader.page(file, cursor, 1)).isInstanceOf(ResponseStatusException.class);
        assertThat(reader.page(file, null, 1).items()).extracting(ChatMessageView::text).containsExactly("replacement");
    }

    @Test void resumedContextInsideALongTurnDoesNotLoseUsageOrTiming() throws Exception {
        Path file = directory.resolve("resumed.jsonl");
        String padding = mapper.writeValueAsString(Map.of("type", "padding", "payload", Map.of("data", "x".repeat(3_000_000))));
        String context = mapper.writeValueAsString(Map.of("type", "turn_context", "payload", Map.of("turn_id", "old"))) + "\n";
        Files.writeString(file, event("task_started", Map.of("turn_id", "old"))
                + timedEvent("user_message", Map.of("message", "question"), "2026-10-20T00:00:00Z")
                + timedEvent("agent_message", Map.of("message", "first answer"), "2026-10-20T00:00:01Z")
                + event("token_count", Map.of("info", Map.of("last_token_usage", Map.of("output_tokens", 20))))
                + padding + "\n" + context + event("agent_message", Map.of("message", "continued answer"))
                + timedEvent("token_count", Map.of("info", Map.of("last_token_usage", Map.of("output_tokens", 10))),
                        "2026-10-20T00:00:05Z"));
        var tail = new CodexHistoryTailReader(mapper).page(file, null, 30);
        var full = new CodexHistoryReader(mapper).page(file, null, null, 30);
        assertThat(tail.items()).hasSize(full.items().size());
        for (int index = 0; index < tail.items().size(); index++) {
            var actual = mapper.<com.fasterxml.jackson.databind.node.ObjectNode>valueToTree(tail.items().get(index));
            var expected = mapper.<com.fasterxml.jackson.databind.node.ObjectNode>valueToTree(full.items().get(index));
            actual.remove("id");
            expected.remove("id");
            assertThat(actual).isEqualTo(expected);
        }
        assertThat(tail.items().getLast().usage()).containsEntry("output_tokens", 30L);
        assertThat(tail.items().getLast().latencyMs()).isEqualTo(5000L);
        assertThat(tail.items().getLast().ttftMs()).isEqualTo(1000L);
    }

    @Test void unmatchedOutputsHaveDistinctSourceIdsAndOversizedTurnRequiresExplicitFallback() throws Exception {
        Path file = directory.resolve("unmatched.jsonl");
        Files.writeString(file, event("function_call_output", Map.of("call_id", "one", "output", "first"))
                + event("function_call_output", Map.of("call_id", "two", "output", "second")));
        assertThat(new CodexHistoryTailReader(mapper).page(file, null, 30).items())
                .extracting(ChatMessageView::id).doesNotHaveDuplicates();
        Files.writeString(file, turn("long", "question", "answer") + "{\"padding\":\"");
        try (var output = Files.newBufferedWriter(file, StandardOpenOption.APPEND)) {
            String block = "x".repeat(1024 * 1024);
            for (int index = 0; index < 33; index++) output.write(block);
            output.write("\"}\n");
        }
        assertThatThrownBy(() -> new CodexHistoryTailReader(mapper).page(file, null, 30))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        failure -> assertThat(failure.getStatusCode().value()).isEqualTo(413));
    }

    @Test void ignoresIncompleteTailAndDoesNotExposeStartupInstructionsOrAnalysis() throws Exception {
        Path file = directory.resolve("response.jsonl");
        String startup = response("user", "private startup", null);
        Files.writeString(file, startup + event("task_started", Map.of("turn_id", "t"))
                + mapper.writeValueAsString(Map.of("type", "turn_context", "payload", Map.of("turn_id", "t"))) + "\n"
                + response("user", "visible question", null) + response("assistant", "hidden analysis", "analysis")
                + response("assistant", "visible answer", "final") + "{\"type\":");
        var reader = new CodexHistoryTailReader(mapper);
        assertThat(reader.page(file, null, 30).items()).extracting(ChatMessageView::text)
                .containsExactly("visible question", "visible answer");
    }

    private String turn(String id, String question, String answer) throws Exception {
        return event("task_started", Map.of("turn_id", id)) + event("user_message", Map.of("message", question))
                + event("agent_message", Map.of("message", answer));
    }

    private String event(String type, Map<String, Object> values) throws Exception {
        var payload = new java.util.LinkedHashMap<>(values);
        payload.put("type", type);
        return mapper.writeValueAsString(Map.of("type", "event_msg", "payload", payload)) + "\n";
    }

    private String timedEvent(String type, Map<String, Object> values, String timestamp) throws Exception {
        var node = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(event(type, values));
        node.put("timestamp", timestamp);
        return mapper.writeValueAsString(node) + "\n";
    }

    private String response(String role, String text, String channel) throws Exception {
        var payload = new java.util.LinkedHashMap<String, Object>();
        payload.put("type", "message"); payload.put("role", role);
        payload.put("content", List.of(Map.of("type", "user".equals(role) ? "input_text" : "output_text", "text", text)));
        if (channel != null) payload.put("channel", channel);
        return mapper.writeValueAsString(Map.of("type", "response_item", "payload", payload)) + "\n";
    }
}
