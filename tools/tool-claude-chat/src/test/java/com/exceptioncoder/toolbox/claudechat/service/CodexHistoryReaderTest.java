package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CodexHistoryReaderTest {
    @TempDir
    Path directory;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void readsResponseMessagesAndDeduplicatesLegacyEventsWithoutStartupInstructions() throws Exception {
        Path file = write(event("task_started", Map.of("turn_id", "t1"), 0),
                response("user", "startup instructions"),
                mapper.writeValueAsString(Map.of("type", "turn_context", "payload", Map.of("cwd", "test"))),
                response("developer", "private policy"), response("user", "import button is grey"),
                event("user_message", Map.of("message", "import button is grey"), 1),
                event("agent_message", Map.of("message", "clearer button appearance"), 2),
                response("assistant", "clearer button appearance"));
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        assertThat(reader.page(file, null, null, 30).items().stream()
                .filter(item -> "user".equals(item.kind()) || "assistant".equals(item.kind()))
                .map(ChatMessageView::text).toList())
                .containsExactly("import button is grey", "clearer button appearance");
        append(file, event("task_started", Map.of("turn_id", "t2"), 3),
                mapper.writeValueAsString(Map.of("type", "turn_context", "payload", Map.of("cwd", "test"))),
                response("user", "import button is grey"), response("assistant", "second answer"));
        assertThat(reader.page(file, null, null, 30).items().stream()
                .filter(item -> "user".equals(item.kind())).count()).isEqualTo(2);
        assertThat(reader.page(file, null, null, 30).items().stream().map(ChatMessageView::text))
                .contains("second answer");
    }

    private String response(String role, String text) throws Exception {
        return mapper.writeValueAsString(Map.of("type", "response_item", "payload", Map.of(
                "type", "message", "role", role, "content", List.of(Map.of(
                        "type", "assistant".equals(role) ? "output_text" : "input_text", "text", text)))));
    }

    @Test
    void pagesKeepGlobalIdsAndBackfillToolsOutsideThePage() throws Exception {
        Path file = write(
                event("task_started", Map.of("turn_id", "turn-1"), 0),
                event("user_message", Map.of("message", "中文问题"), 0),
                event("function_call", Map.of("call_id", "a", "name", "shell", "arguments", "{\"cwd\":\"中文\"}"), 1),
                event("agent_message", Map.of("message", "第一步"), 2),
                event("function_call_output", Map.of("call_id", "a", "output", "跨页结果"), 3),
                tokens(4),
                event("user_message", Map.of("message", "第二轮"), 5),
                event("agent_message", Map.of("message", "第二步"), 6));
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        var newest = reader.page(file, null, null, 2);
        var middle = reader.page(file, null, newest.nextBefore(), 2);
        var oldest = reader.page(file, null, middle.nextBefore(), 2);
        List<ChatMessageView> combined = new ArrayList<>(oldest.items());
        combined.addAll(middle.items());
        combined.addAll(newest.items());

        assertThat(combined).extracting(item -> item.id()).containsExactly("h0", "h1", "h2", "h3", "h4", "h5");
        assertThat(combined).isEqualTo(reader.page(file, null, null, 100).items());
        assertThat(oldest.nextBefore()).isZero();
        assertThat(combined.getFirst().turnId()).isEqualTo("turn-1");
        assertThat(combined.get(1).input()).isEqualTo(Map.of("cwd", "中文"));
        assertThat(combined.get(1).output()).isEqualTo("跨页结果");
        assertThat(combined.get(1).elapsedMs()).isEqualTo(2_000);
        long scanned = reader.scannedRecords(file);
        var usage = reader.usage(file);
        assertThat(usage.steps()).isEqualTo(3);
        assertThat(usage.turns()).isEqualTo(1);
        assertThat(usage.outputTokens()).isEqualTo(25);
        assertThat(reader.scannedRecords(file)).isEqualTo(scanned);
    }

    @Test
    void appendUpdatesPendingTurnAndPriorToolWithoutReplayingHistory() throws Exception {
        Path file = write(event("user_message", Map.of("message", "one"), 0),
                event("function_call", Map.of("call_id", "a", "name", "shell"), 1), tokens(2));
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        assertThat(reader.page(file, null, null, 30).items()).extracting(item -> item.kind())
                .containsExactly("user", "tool", "result");
        assertThat(reader.usage(file).turns()).isEqualTo(1);
        append(file, event("function_call_output", Map.of("call_id", "a", "output", "done"), 3),
                event("agent_message", Map.of("message", "first answer"), 4), tokens(5));
        var expanded = reader.page(file, null, null, 30);
        assertThat(expanded.items()).extracting(item -> item.kind())
                .containsExactly("user", "tool", "assistant", "result");
        assertThat(expanded.items().get(1).output()).isEqualTo("done");
        assertThat(reader.usage(file).inputTokens()).isEqualTo(120);
        append(file, event("user_message", Map.of("message", "two"), 6), tokens(7));
        var complete = reader.page(file, null, null, 30);
        assertThat(complete.items()).extracting(item -> item.kind())
                .containsExactly("user", "tool", "assistant", "result", "user", "result");
        assertThat(reader.usage(file).turns()).isEqualTo(2);
        assertThat(reader.usage(file).inputTokens()).isEqualTo(180);
        assertThat(reader.scannedRecords(file)).isEqualTo(8);
    }

    @Test
    void retriesIncompleteTailAndSkipsMalformedCompletedRecords() throws Exception {
        Path file = write(event("user_message", Map.of("message", "valid"), 0));
        Files.writeString(file, "not-json\n{\"payload\":broken}\n", StandardOpenOption.APPEND);
        String last = event("agent_message", Map.of("message", "完整中文"), 1);
        int cut = last.length() - 5;
        Files.writeString(file, last.substring(0, cut), StandardOpenOption.APPEND);
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        assertThat(reader.page(file, null, null, 30).items()).extracting(item -> item.text()).containsExactly("valid");
        assertThat(reader.page(file, null, null, 30).items()).hasSize(1);
        Files.writeString(file, last.substring(cut), StandardOpenOption.APPEND);
        assertThat(reader.page(file, null, null, 30).items()).extracting(item -> item.text())
                .containsExactly("valid", "完整中文");
        assertThat(reader.scannedRecords(file)).isEqualTo(2);
    }

    @Test
    void acceptsCompletedFinalRecordWithoutNewlineAndLaterAppend() throws Exception {
        Path file = directory.resolve("no-newline.jsonl");
        Files.writeString(file, event("user_message", Map.of("message", "one"), 0));
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        assertThat(reader.page(file, null, null, 30).items()).hasSize(1);
        Files.writeString(file, "\n" + event("agent_message", Map.of("message", "two"), 1), StandardOpenOption.APPEND);
        assertThat(reader.page(file, null, null, 30).items()).extracting(item -> item.text()).containsExactly("one", "two");
        assertThat(reader.scannedRecords(file)).isEqualTo(2);
    }

    @Test
    void invalidatesTruncationSameSizeRewriteAndReplacement() throws Exception {
        Path file = write(event("user_message", Map.of("message", "old"), 0), tokens(1));
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        assertThat(reader.usage(file).turns()).isEqualTo(1);
        Files.writeString(file, event("user_message", Map.of("message", "new"), 0) + "\n");
        assertThat(reader.page(file, null, null, 30).items()).extracting(item -> item.text()).containsExactly("new");
        assertThat(reader.usage(file).turns()).isZero();
        FileTime modified = Files.getLastModifiedTime(file);
        Files.writeString(file, event("user_message", Map.of("message", "yes"), 0) + "\n");
        Files.setLastModifiedTime(file, modified);
        assertThat(reader.page(file, null, null, 30).items()).extracting(item -> item.text()).containsExactly("yes");
        Files.delete(file);
        Files.writeString(file, event("user_message", Map.of("message", "replacement"), 0) + "\n");
        assertThat(reader.page(file, null, null, 30).items()).extracting(item -> item.text())
                .containsExactly("replacement");
    }

    @Test
    void detectsRewriteThatLooksLikeAppend() throws Exception {
        Path file = write(event("user_message", Map.of("message", "old"), 0));
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        reader.usage(file);
        Files.writeString(file, event("user_message", Map.of("message", "replacement is longer"), 0) + "\n");
        assertThat(reader.page(file, null, null, 30).items()).extracting(item -> item.text())
                .containsExactly("replacement is longer");
    }

    @Test
    void rejectsFileRewrittenDuringPageMaterializationAndRecovers() throws Exception {
        Path file = write(event("user_message", Map.of("message", "old"), 0));
        String replacement = event("user_message", Map.of("message", "replacement"), 0) + "\n";
        var changed = new java.util.concurrent.atomic.AtomicBoolean();
        ObjectMapper changingMapper = new ObjectMapper() {
            @Override
            public com.fasterxml.jackson.databind.JsonNode readTree(java.io.InputStream input)
                    throws java.io.IOException {
                var node = super.readTree(input);
                if (changed.compareAndSet(false, true)) {
                    Files.writeString(file, replacement);
                }
                return node;
            }
        };
        CodexHistoryReader reader = new CodexHistoryReader(changingMapper);
        assertThatThrownBy(() -> reader.page(file, null, null, 30)).isInstanceOf(java.io.IOException.class);
        assertThat(reader.page(file, null, null, 30).items()).extracting(item -> item.text())
                .containsExactly("replacement");
    }

    @Test
    void duplicateAndOrphanToolOutputsPreserveUsageAndArguments() throws Exception {
        Path file = write(event("function_call_output", Map.of("output", Map.of("unpaired", true)), 0),
                event("function_call", Map.of("call_id", "a", "arguments", "not json"), 1),
                event("function_call_output", Map.of("call_id", "a", "output", "first"), 2));
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        var first = reader.page(file, null, null, 30);
        assertThat(first.items().getFirst().output()).isEqualTo("{\"unpaired\":true}");
        assertThat(first.items().get(1).input()).isEqualTo("not json");
        assertThat(reader.usage(file).toolDurationMs()).isEqualTo(1_000);
        append(file, event("function_call_output", Map.of("call_id", "a", "output", "latest"), 4));
        var latest = reader.page(file, null, null, 30);
        assertThat(latest.items().get(1).output()).isEqualTo("latest");
        assertThat(reader.usage(file).toolDurationMs()).isEqualTo(3_000);
        assertThat(reader.usage(file).steps()).isEqualTo(2);
    }

    @Test
    void normalAndReviewCachesNeverShareInheritedMessages() throws Exception {
        Path file = write(event("user_message", Map.of("message", "inherited"), 0), tokens(1),
                mapper.writeValueAsString(Map.of("type", "turn_context", "payload", Map.of("cwd", "C:\\review"))),
                event("user_message", Map.of("message", "review"), 2), tokens(3));
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        assertThat(reader.page(file, null, null, 30).items()).hasSize(4);
        var review = reader.page(file, "c:/review/", null, 30);
        assertThat(review.items()).extracting(item -> item.text()).containsExactly("review", null);
        assertThat(review.items()).extracting(item -> item.id()).containsExactly("h0", "h1");
        assertThat(reader.page(file, "c:/other", null, 30).items()).isEmpty();
        assertThat(reader.usage(file).turns()).isEqualTo(2);
    }

    @Test
    void concurrentPagesAndUsageBuildTheIndexOnce() throws Exception {
        Path file = write(event("user_message", Map.of("message", "hello"), 0), tokens(1));
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        var requests = IntStream.range(0, 20).mapToObj(index -> CompletableFuture.runAsync(() -> {
            try {
                if (index % 2 == 0) {
                    assertThat(reader.page(file, null, null, 30).items()).hasSize(2);
                } else {
                    assertThat(reader.usage(file).turns()).isEqualTo(1);
                }
            } catch (Exception error) {
                throw new AssertionError(error);
            }
        })).toArray(CompletableFuture[]::new);
        CompletableFuture.allOf(requests).join();
        assertThat(reader.scannedRecords(file)).isEqualTo(2);
    }

    @Test
    void coldIndexSkipsHugeOffPageBodiesUnderTightStringLimit() throws Exception {
        String large = "x".repeat(1_000_000);
        Path file = write(mapper.writeValueAsString(Map.of("type", "response_item", "payload",
                        Map.of("type", "message", "content", List.of(Map.of("text", large))))),
                event("function_call", Map.of("call_id", "large", "name", "shell", "arguments", large), 0),
                event("function_call_output", Map.of("call_id", "large", "output", large), 1),
                event("agent_message", Map.of("message", "small visible answer"), 2));
        ObjectMapper constrained = new ObjectMapper();
        constrained.getFactory().setStreamReadConstraints(StreamReadConstraints.builder().maxStringLength(256).build());
        CodexHistoryReader reader = new CodexHistoryReader(constrained);
        assertThat(reader.page(file, null, null, 1).items()).extracting(item -> item.text())
                .containsExactly("small visible answer");
        assertThat(reader.usage(file).steps()).isEqualTo(2);
        assertThat(reader.scannedRecords(file)).isEqualTo(4);
    }

    @Test
    void evictsOldViewsAndDoesNotReturnCachedDataForDeletedFiles() throws Exception {
        CodexHistoryReader reader = new CodexHistoryReader(mapper);
        for (int index = 0; index < 20; index++) {
            Path file = directory.resolve(index + ".jsonl");
            Files.writeString(file, event("agent_message", Map.of("message", "answer " + index), 0));
            assertThat(reader.page(file, null, null, 1).items()).extracting(item -> item.text())
                    .containsExactly("answer " + index);
        }
        Path first = directory.resolve("0.jsonl");
        assertThat(reader.page(first, null, null, 1).items()).extracting(item -> item.text()).containsExactly("answer 0");
        Files.delete(first);
        assertThatThrownBy(() -> reader.page(first, null, null, 1)).isInstanceOf(java.io.IOException.class);
    }

    private Path write(String... records) throws Exception {
        Path file = directory.resolve("rollout.jsonl");
        Files.writeString(file, String.join("\n", records) + "\n");
        return file;
    }

    private void append(Path file, String... records) throws Exception {
        Files.writeString(file, String.join("\n", records) + "\n", StandardOpenOption.APPEND);
    }

    private String tokens(int second) throws Exception {
        return event("token_count", Map.of("info", Map.of("last_token_usage", Map.of(
                "input_tokens", 100, "cached_input_tokens", 40, "output_tokens", 20, "reasoning_output_tokens", 5))), second);
    }

    private String event(String type, Map<String, Object> fields, int second) throws Exception {
        var payload = new java.util.LinkedHashMap<>(fields);
        payload.put("type", type);
        return mapper.writeValueAsString(Map.of("timestamp", String.format("2026-09-05T00:00:%02dZ", second),
                "type", "event_msg", "payload", payload));
    }
}
