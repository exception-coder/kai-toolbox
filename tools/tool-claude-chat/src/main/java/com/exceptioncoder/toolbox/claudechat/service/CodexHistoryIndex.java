package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.MessagePage;
import com.exceptioncoder.toolbox.claudechat.api.dto.SessionUsageView;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 单个会话视图的消息位置、工具配对和累计用量，正文仅在物化目标页时读取。 */
final class CodexHistoryIndex {
    private final List<Entry> entries = new ArrayList<>();
    private final Map<String, Entry> calls = new HashMap<>();
    private final HistoryTurnAccumulator turn = new HistoryTurnAccumulator();
    private final HistoryUsageAccumulator usage = new HistoryUsageAccumulator();
    private final CodexHistoryMessageDecoder messages = new CodexHistoryMessageDecoder();
    private final String reviewCwd;
    private boolean visible;
    private String turnId;
    private long completedOffset;
    private long scannedRecords;

    CodexHistoryIndex(String reviewCwd) {
        this.reviewCwd = reviewCwd;
        this.visible = reviewCwd == null || reviewCwd.isBlank();
    }

    void update(ObjectMapper mapper, Path path, long size) throws IOException {
        try (CodexHistoryRecordReader reader = new CodexHistoryRecordReader(mapper, path, completedOffset, size, messages.hasTurnContext())) {
            CodexHistoryRecordReader.Record record;
            while ((record = reader.next()) != null) {
                accept(record);
                scannedRecords++;
            }
            completedOffset = reader.completedOffset();
        }
    }

    private void accept(CodexHistoryRecordReader.Record record) {
        JsonNode node = record.node();
        JsonNode payload = node.path("payload");
        messages.observe(node);
        if (!visible) {
            visible = "turn_context".equals(node.path("type").asText())
                    && reviewCwd.equals(normalizeCwd(payload.path("cwd").asText("")));
            return;
        }
        Long timestamp = timestamp(node);
        switch (payload.path("type").asText("")) {
            case "task_started" -> turnId = payload.path("turn_id").asText(null);
            case "user_message" -> acceptMessage(record, timestamp, "user");
            case "agent_message" -> acceptMessage(record, timestamp, "assistant");
            case "message" -> {
                if ("response_item".equals(node.path("type").asText())) {
                    acceptMessage(record, timestamp, payload.path("role").asText());
                }
            }
            case "function_call" -> addCall(record, timestamp);
            case "function_call_output" -> addOutput(record, timestamp);
            case "token_count" -> turn.accumulateCodex(payload.path("info").path("last_token_usage"), timestamp);
            default -> { }
        }
    }

    private void acceptMessage(CodexHistoryRecordReader.Record record, Long timestamp, String role) {
        if (!messages.accept(record.node(), role)) {
            return;
        }
        if ("user".equals(role)) {
            addUser(record, timestamp);
        } else if ("assistant".equals(role)) {
            addAssistant(record, timestamp);
        }
    }

    private void addUser(CodexHistoryRecordReader.Record record, Long timestamp) {
        String text = SessionHistoryService.normalizeCodexUserMessage(
                CodexHistoryMessageDecoder.text(record.node().path("payload")));
        if (text.isBlank()) {
            return;
        }
        ChatMessageView result = pendingTurn();
        if (result != null) {
            Entry entry = new Entry("result", -1, result.ts(), null);
            entry.result = result;
            entries.add(entry);
            usage.add(result);
        }
        turn.reset(timestamp);
        entries.add(new Entry("user", record.offset(), timestamp, turnId));
    }

    private void addAssistant(CodexHistoryRecordReader.Record record, Long timestamp) {
        if (CodexHistoryMessageDecoder.text(record.node().path("payload")).isBlank()) {
            return;
        }
        turn.observeOutput(timestamp);
        entries.add(new Entry("assistant", record.offset(), timestamp, turnId));
        usage.addStep();
    }

    private void addCall(CodexHistoryRecordReader.Record record, Long timestamp) {
        Entry entry = new Entry("tool", record.offset(), timestamp, null);
        String callId = record.node().path("payload").path("call_id").asText("");
        if (!callId.isBlank()) {
            calls.put(callId, entry);
        }
        turn.observeOutput(timestamp);
        entries.add(entry);
        usage.addStep();
    }

    private void addOutput(CodexHistoryRecordReader.Record record, Long timestamp) {
        String callId = record.node().path("payload").path("call_id").asText("");
        Entry entry = callId.isBlank() ? null : calls.get(callId);
        if (entry == null) {
            entry = new Entry("tool", -1, timestamp, null);
            entries.add(entry);
            usage.addStep();
        } else {
            Long elapsed = elapsed(entry.timestamp, timestamp);
            usage.adjustToolDuration(elapsed, entry.elapsed);
            entry.elapsed = elapsed;
        }
        entry.outputOffset = record.offset();
    }

    MessagePage page(ObjectMapper mapper, Path path, Integer before, int limit) throws IOException {
        ChatMessageView pending = pendingTurn();
        int count = entries.size() + (pending == null ? 0 : 1);
        int end = before == null ? count : Math.max(0, Math.min(before, count));
        int start = Math.max(0, end - Math.max(1, limit));
        List<ChatMessageView> messages = new ArrayList<>(end - start);
        for (int index = start; index < end; index++) {
            messages.add(index == entries.size() ? pending : materialize(mapper, path, entries.get(index), index));
        }
        return new MessagePage(messages, start, false);
    }

    private ChatMessageView materialize(ObjectMapper mapper, Path path, Entry entry, int index) throws IOException {
        if (entry.result != null) {
            return entry.result;
        }
        JsonNode payload = entry.offset < 0 ? mapper.createObjectNode() : readPayload(mapper, path, entry.offset);
        String id = "h" + index;
        return switch (entry.kind) {
            case "user" -> ChatMessageView.user(id,
                    SessionHistoryService.normalizeCodexUserMessage(CodexHistoryMessageDecoder.text(payload)),
                    entry.timestamp, entry.turnId);
            case "assistant" -> ChatMessageView.assistant(id, CodexHistoryMessageDecoder.text(payload),
                    entry.turnId, entry.timestamp);
            case "tool" -> toolMessage(mapper, path, entry, payload, id);
            default -> throw new IOException("Unknown indexed history kind: " + entry.kind);
        };
    }

    private ChatMessageView toolMessage(ObjectMapper mapper, Path path, Entry entry, JsonNode payload, String id)
            throws IOException {
        String output = null;
        if (entry.outputOffset >= 0) {
            JsonNode value = readPayload(mapper, path, entry.outputOffset).path("output");
            output = value.isMissingNode() || value.isNull() ? "" : value.isTextual() ? value.asText() : value.toString();
        }
        Object arguments = parseArguments(mapper, payload.get("arguments"));
        return ChatMessageView.tool(id, payload.path("name").asText(""), arguments, output, null,
                entry.timestamp, entry.elapsed);
    }

    private Object parseArguments(ObjectMapper mapper, JsonNode arguments) {
        if (arguments == null || arguments.isNull()) {
            return null;
        }
        if (arguments.isTextual()) {
            try {
                return mapper.convertValue(mapper.readTree(arguments.asText()), Object.class);
            } catch (com.fasterxml.jackson.core.JsonProcessingException | IllegalArgumentException invalid) {
                return arguments.asText();
            }
        }
        return mapper.convertValue(arguments, Object.class);
    }

    private JsonNode readPayload(ObjectMapper mapper, Path path, long offset) throws IOException {
        try (InputStream input = Files.newInputStream(path)) {
            input.skipNBytes(offset);
            return mapper.readTree(input).path("payload");
        }
    }

    SessionUsageView usage() {
        return usage.snapshot(pendingTurn());
    }

    long scannedRecords() {
        return scannedRecords;
    }

    private ChatMessageView pendingTurn() {
        return turn.result("h" + entries.size());
    }

    static String normalizeCwd(String cwd) {
        String normalized = cwd == null ? "" : cwd.trim().replace('\\', '/');
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized.toLowerCase(java.util.Locale.ROOT);
    }

    private static Long timestamp(JsonNode node) {
        if (!node.path("timestamp").isTextual()) {
            return null;
        }
        try {
            return Instant.parse(node.path("timestamp").asText()).toEpochMilli();
        } catch (DateTimeParseException invalid) {
            return null;
        }
    }

    private static Long elapsed(Long start, Long end) {
        return start == null || end == null || end < start ? null : end - start;
    }

    /** 索引项只保留定位和统计元数据，工具结果可回填更早的调用。 */
    private static final class Entry {
        private final String kind;
        private final long offset;
        private final Long timestamp;
        private final String turnId;
        private long outputOffset = -1;
        private Long elapsed;
        private ChatMessageView result;

        private Entry(String kind, long offset, Long timestamp, String turnId) {
            this.kind = kind;
            this.offset = offset;
            this.timestamp = timestamp;
            this.turnId = turnId;
        }
    }
}
