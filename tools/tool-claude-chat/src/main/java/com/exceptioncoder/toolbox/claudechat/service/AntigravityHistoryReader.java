package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.api.dto.HistorySessionView;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

/** Read-only adapter for Antigravity's public transcript JSONL projection. */
final class AntigravityHistoryReader {

    private static final String TRANSCRIPT_RELATIVE = ".system_generated/logs/transcript.jsonl";
    private static final int TITLE_MAX_CHARS = 60;

    private final ObjectMapper mapper;
    private final Path antigravityRoot;

    AntigravityHistoryReader(ObjectMapper mapper, Path antigravityRoot) {
        this.mapper = mapper;
        this.antigravityRoot = antigravityRoot.toAbsolutePath().normalize();
    }

    static AntigravityHistoryReader forCurrentUser(ObjectMapper mapper) {
        return new AntigravityHistoryReader(mapper,
                Path.of(System.getProperty("user.home"), ".gemini", "antigravity-cli"));
    }

    Path findTranscript(String conversationId) {
        String normalizedId = normalizeConversationId(conversationId);
        if (normalizedId == null) return null;
        Path brainRoot = antigravityRoot.resolve("brain").normalize();
        Path transcript = brainRoot.resolve(normalizedId).resolve(TRANSCRIPT_RELATIVE).normalize();
        return transcript.startsWith(brainRoot) && Files.isRegularFile(transcript) ? transcript : null;
    }

    boolean exists(String conversationId) {
        return findTranscript(conversationId) != null;
    }

    Set<String> scanConversationIds() {
        Path brainRoot = antigravityRoot.resolve("brain");
        if (!Files.isDirectory(brainRoot)) return Set.of();
        Set<String> ids = new HashSet<>();
        try (Stream<Path> directories = Files.list(brainRoot)) {
            directories.filter(Files::isDirectory).forEach(directory -> {
                String id = normalizeConversationId(directory.getFileName().toString());
                if (id != null && Files.isRegularFile(directory.resolve(TRANSCRIPT_RELATIVE))) ids.add(id);
            });
        } catch (IOException ignored) {
            return Set.of();
        }
        return ids;
    }

    List<ChatMessageView> readMessages(String conversationId) throws IOException {
        Path transcript = findTranscript(conversationId);
        if (transcript == null) return List.of();
        List<ChatMessageView> messages = new ArrayList<>();
        try (BufferedReader reader = Files.newBufferedReader(transcript, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                JsonNode node;
                try {
                    node = mapper.readTree(line);
                } catch (Exception ignored) {
                    continue;
                }
                String source = node.path("source").asText("");
                String type = node.path("type").asText("");
                String content = node.path("content").asText("");
                Long timestamp = parseTimestamp(node.path("created_at").asText(null));
                if ("USER_EXPLICIT".equals(source) && "USER_INPUT".equals(type)) {
                    String userText = extractUserText(content);
                    if (!userText.isBlank()) messages.add(ChatMessageView.user("h" + messages.size(), userText, timestamp));
                } else if ("MODEL".equals(source) && "PLANNER_RESPONSE".equals(type) && !content.isBlank()) {
                    messages.add(ChatMessageView.assistant("h" + messages.size(), content, timestamp));
                }
            }
        }
        return messages;
    }

    List<HistorySessionView> list(String cwd, Map<String, String> aliases, int limit) {
        Path brainRoot = antigravityRoot.resolve("brain");
        if (!Files.isDirectory(brainRoot)) return List.of();
        Set<String> cwdConversationIds = conversationsForCwd(cwd);
        List<Path> transcripts = new ArrayList<>();
        try (Stream<Path> directories = Files.list(brainRoot)) {
            directories.filter(Files::isDirectory)
                    .map(directory -> directory.resolve(TRANSCRIPT_RELATIVE))
                    .filter(Files::isRegularFile)
                    .filter(path -> cwd == null || cwd.isBlank()
                            || cwdConversationIds.contains(path.getParent().getParent().getParent().getFileName().toString()))
                    .forEach(transcripts::add);
        } catch (IOException ignored) {
            return List.of();
        }
        transcripts.sort(Comparator.comparingLong(this::lastModified).reversed());
        List<HistorySessionView> result = new ArrayList<>();
        for (Path transcript : transcripts.stream().limit(limit).toList()) {
            String id = transcript.getParent().getParent().getParent().getFileName().toString();
            try {
                List<ChatMessageView> messages = readMessages(id);
                String title = messages.stream().filter(message -> "user".equals(message.kind()))
                        .map(ChatMessageView::text).findFirst().orElse("（无标题）");
                if (title.length() > TITLE_MAX_CHARS) title = title.substring(0, TITLE_MAX_CHARS) + "…";
                result.add(new HistorySessionView(id, cwd, aliases.getOrDefault(id, title),
                        lastModified(transcript), messages.size()));
            } catch (IOException ignored) {
                // A concurrently updated transcript is skipped and can be retried on refresh.
            }
        }
        return result;
    }

    private Set<String> conversationsForCwd(String cwd) {
        if (cwd == null || cwd.isBlank()) return Set.of();
        Path mapping = antigravityRoot.resolve("cache").resolve("last_conversations.json");
        if (!Files.isRegularFile(mapping)) return Set.of();
        try {
            JsonNode root = mapper.readTree(mapping.toFile());
            Set<String> ids = new HashSet<>();
            root.fields().forEachRemaining(entry -> {
                if (samePath(cwd, entry.getKey())) {
                    String id = normalizeConversationId(entry.getValue().asText());
                    if (id != null) ids.add(id);
                }
            });
            return ids;
        } catch (IOException ignored) {
            return Set.of();
        }
    }

    static String extractUserText(String content) {
        if (content == null || content.isBlank()) return "";
        String request = between(content, "<USER_REQUEST>", "</USER_REQUEST>");
        String candidate = request == null ? content : request;
        int marker = candidate.lastIndexOf("\nUser task:\n");
        if (marker >= 0) candidate = candidate.substring(marker + "\nUser task:\n".length());
        return candidate.strip();
    }

    private static String between(String value, String start, String end) {
        int from = value.indexOf(start);
        if (from < 0) return null;
        from += start.length();
        int to = value.indexOf(end, from);
        return to < 0 ? null : value.substring(from, to);
    }

    private static String normalizeConversationId(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return UUID.fromString(value.trim()).toString();
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static Long parseTimestamp(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Instant.parse(value).toEpochMilli();
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private static boolean samePath(String left, String right) {
        return Path.of(left).toAbsolutePath().normalize().toString()
                .equalsIgnoreCase(Path.of(right).toAbsolutePath().normalize().toString());
    }

    private long lastModified(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return 0L;
        }
    }
}
