package com.exceptioncoder.toolbox.claudechat.service;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/** 轻量查询活动 change 目录；任务数量仅用于候选展示，绑定仍由 CLI 严格预检。 */
@Service
public class OpenSpecChangeCatalog {
    private static final String SAFE_ID = "[A-Za-z0-9][A-Za-z0-9._-]{0,119}";

    public Page search(Path projectRoot, String query, int offset, int limit) {
        if (offset < 0 || limit < 1 || limit > 100) {
            throw new IllegalArgumentException("OpenSpec 查询分页参数不合法");
        }
        List<Entry> entries = entries(projectRoot).stream()
                .filter(entry -> query == null || query.isBlank()
                        || entry.id().toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT).trim()))
                .sorted(Comparator.comparing(Entry::modified).reversed().thenComparing(Entry::id))
                .toList();
        List<OpenSpecAutopilotAdapter.ChangeOption> items = entries.stream().skip(offset).limit(limit)
                .map(this::option).toList();
        int nextOffset = offset + items.size();
        return new Page(items, nextOffset < entries.size() ? nextOffset : null);
    }

    public List<OpenSpecAutopilotAdapter.ChangeOption> recommend(Path projectRoot, String context, int limit) {
        String normalized = context == null ? "" : context.toLowerCase(Locale.ROOT);
        return entries(projectRoot).stream()
                .sorted(Comparator.comparingInt((Entry entry) -> relevance(normalized, entry.id())).reversed()
                        .thenComparing(Entry::modified, Comparator.reverseOrder()).thenComparing(Entry::id))
                .limit(limit).map(this::option).toList();
    }

    public java.util.Optional<OpenSpecAutopilotAdapter.ChangeOption> find(Path projectRoot, String changeId) {
        if (changeId == null || !changeId.matches(SAFE_ID) || "archive".equals(changeId)) return java.util.Optional.empty();
        Path root = changeRoot(projectRoot);
        if (root == null) return java.util.Optional.empty();
        Path path = root.resolve(changeId).normalize();
        if (!Files.isDirectory(path) || Files.isSymbolicLink(path)) return java.util.Optional.empty();
        return java.util.Optional.of(option(new Entry(changeId, path, modified(path))));
    }

    public String proposalExcerpt(Path projectRoot, String changeId) {
        if (find(projectRoot, changeId).isEmpty()) return "";
        Path proposal = changeRoot(projectRoot).resolve(changeId).resolve("proposal.md");
        if (!Files.isRegularFile(proposal) || Files.isSymbolicLink(proposal)) return "";
        try {
            String contents = Files.readString(proposal, StandardCharsets.UTF_8);
            return contents.substring(0, Math.min(contents.length(), 900));
        } catch (IOException exception) {
            return "";
        }
    }

    private List<Entry> entries(Path projectRoot) {
        Path root = changeRoot(projectRoot);
        if (root == null) return List.of();
        try (Stream<Path> paths = Files.list(root)) {
            return paths.filter(path -> Files.isDirectory(path) && !Files.isSymbolicLink(path))
                    .filter(path -> path.getFileName().toString().matches(SAFE_ID))
                    .filter(path -> !"archive".equals(path.getFileName().toString()))
                    .map(path -> new Entry(path.getFileName().toString(), path, modified(path)))
                    .toList();
        } catch (IOException exception) {
            throw new IllegalStateException("读取 OpenSpec change 目录失败：" + exception.getMessage(), exception);
        }
    }

    private Path changeRoot(Path projectRoot) {
        for (Path directory = projectRoot.toAbsolutePath().normalize(); directory != null;
             directory = directory.getParent()) {
            Path changes = directory.resolve("openspec/changes");
            if (Files.isDirectory(changes) && !Files.isSymbolicLink(changes)
                    && !Files.isSymbolicLink(directory.resolve("openspec"))) return changes;
            if (Files.exists(directory.resolve(".git"))) break;
        }
        return null;
    }

    private Instant modified(Path change) {
        try {
            Path tasks = change.resolve("tasks.md");
            return Files.getLastModifiedTime(Files.isRegularFile(tasks) && !Files.isSymbolicLink(tasks)
                    ? tasks : change).toInstant();
        } catch (IOException exception) {
            return Instant.EPOCH;
        }
    }

    private OpenSpecAutopilotAdapter.ChangeOption option(Entry entry) {
        int completed = 0;
        int total = 0;
        Path tasks = entry.path().resolve("tasks.md");
        if (Files.isRegularFile(tasks) && !Files.isSymbolicLink(tasks)) {
            try (Stream<String> lines = Files.lines(tasks)) {
                for (String line : (Iterable<String>) lines::iterator) {
                    String trimmed = line.trim();
                    if (trimmed.matches("- \\[([ xX])\\].*")) {
                        total++;
                        if (trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]")) completed++;
                    }
                }
            } catch (IOException exception) {
                throw new IllegalStateException("读取 OpenSpec tasks 失败：" + entry.id(), exception);
            }
        }
        return new OpenSpecAutopilotAdapter.ChangeOption(entry.id(), completed, total,
                entry.modified().toString());
    }

    private int relevance(String context, String id) {
        String normalized = id.toLowerCase(Locale.ROOT);
        int score = context.contains(normalized) ? 100 : 0;
        for (String token : normalized.split("[-_.]+")) {
            if (token.length() >= 3 && context.contains(token)) score += 10;
        }
        return score;
    }

    private record Entry(String id, Path path, Instant modified) { }
    public record Page(List<OpenSpecAutopilotAdapter.ChangeOption> items, Integer nextOffset) { }
}
