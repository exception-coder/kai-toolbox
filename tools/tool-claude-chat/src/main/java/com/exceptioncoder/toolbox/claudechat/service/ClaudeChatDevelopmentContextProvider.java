package com.exceptioncoder.toolbox.claudechat.service;

import com.exceptioncoder.toolbox.claudechat.api.dto.ChatMessageView;
import com.exceptioncoder.toolbox.claudechat.domain.ClaudeChatSession;
import com.exceptioncoder.toolbox.claudechat.repository.ClaudeChatSessionRepository;
import com.exceptioncoder.toolbox.common.git.GitFileDiffResponse;
import com.exceptioncoder.toolbox.common.git.GitLogService;
import com.exceptioncoder.toolbox.common.git.GitStatusEntry;
import com.exceptioncoder.toolbox.common.git.GitStatusResponse;
import com.exceptioncoder.toolbox.llm.spi.DevelopmentChangeContextProvider;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Vibe Coding 的开发变更上下文适配器：统一聚合 Claude/Codex transcript 和工作区 Git 变化。
 */
@Service
public class ClaudeChatDevelopmentContextProvider implements DevelopmentChangeContextProvider {

    private static final int MAX_PARENT_DEPTH = 10;
    private static final int MAX_CONVERSATION_ENTRIES = 500;
    private static final int MAX_ENTRY_CHARS = 4_000;
    private static final int MAX_REPOSITORY_DIFF_CHARS = 80_000;

    private final ClaudeChatSessionRepository sessionRepository;
    private final SessionHistoryService historyService;
    private final GitLogService gitLogService;
    private final ObjectMapper mapper;

    public ClaudeChatDevelopmentContextProvider(ClaudeChatSessionRepository sessionRepository,
                                                SessionHistoryService historyService,
                                                GitLogService gitLogService,
                                                ObjectMapper mapper) {
        this.sessionRepository = sessionRepository;
        this.historyService = historyService;
        this.gitLogService = gitLogService;
        this.mapper = mapper;
    }

    @Override
    public DevelopmentChangeContext snapshot(String devSessionId, long afterSequence) {
        ClaudeChatSession session = sessionRepository.findById(devSessionId)
                .orElseThrow(() -> new IllegalArgumentException("开发会话不存在: " + devSessionId));
        List<String> warnings = new ArrayList<>();
        List<ConversationEntry> allEntries = readConversation(session, warnings);
        long toSequence = allEntries.isEmpty() ? afterSequence : allEntries.get(allEntries.size() - 1).sequence();
        List<ConversationEntry> incremental = allEntries.stream()
                .filter(entry -> entry.sequence() > afterSequence)
                .toList();
        if (incremental.size() > MAX_CONVERSATION_ENTRIES) {
            incremental = incremental.subList(incremental.size() - MAX_CONVERSATION_ENTRIES, incremental.size());
            warnings.add("增量对话超过 " + MAX_CONVERSATION_ENTRIES + " 条，已保留最近部分");
        }

        List<GitRepositoryChange> repositories = readGitChanges(Path.of(session.getCwd()), warnings);
        // 哈希覆盖完整会话事实 + 当前 Git 状态，游标只控制送给分析器的增量内容。
        // 这样文档同步后工作区未提交变化仍留着时，重复点击不会把同一快照登记第二次。
        String hash = hash(allEntries, repositories);
        return new DevelopmentChangeContext(afterSequence, toSequence, incremental, repositories, hash, warnings);
    }

    private List<ConversationEntry> readConversation(ClaudeChatSession session, List<String> warnings) {
        Set<String> sessionIds = new LinkedHashSet<>();
        String engineSessions = session.getEngineSessions();
        if (engineSessions != null && !engineSessions.isBlank()) {
            try {
                Map<String, String> parsed = mapper.readValue(engineSessions, new TypeReference<LinkedHashMap<String, String>>() {
                });
                parsed.values().stream().filter(value -> value != null && !value.isBlank()).forEach(sessionIds::add);
            } catch (Exception e) {
                warnings.add("引擎会话映射无法解析，已回退当前会话段");
            }
        }
        if (session.getSdkSessionId() != null && !session.getSdkSessionId().isBlank()) {
            sessionIds.add(session.getSdkSessionId());
        }

        List<TimedConversationEntry> collected = new ArrayList<>();
        long fallbackOffset = 0;
        for (String sdkSessionId : sessionIds) {
            var page = historyService.readMessages(session.getCwd(), sdkSessionId, null, Integer.MAX_VALUE);
            if (page.transcriptMissing()) {
                warnings.add("会话段 " + sdkSessionId + " 的 transcript 已丢失");
                continue;
            }
            for (ChatMessageView item : page.items()) {
                String role = item.kind();
                String content = switch (role) {
                    case "user", "assistant" -> item.text();
                    case "tool" -> formatTool(item);
                    default -> null;
                };
                if (content == null || content.isBlank()) {
                    continue;
                }
                long timestamp = item.ts() != null ? item.ts() : session.getStartedAt() + fallbackOffset++;
                collected.add(new TimedConversationEntry(timestamp, collected.size(), role,
                        truncate(content, MAX_ENTRY_CHARS)));
            }
        }
        collected.sort(Comparator.comparingLong(TimedConversationEntry::timestamp)
                .thenComparingLong(TimedConversationEntry::stableOrder));
        List<ConversationEntry> entries = new ArrayList<>(collected.size());
        long previousTimestamp = Long.MIN_VALUE;
        int tie = 0;
        for (TimedConversationEntry item : collected) {
            tie = item.timestamp() == previousTimestamp ? tie + 1 : 0;
            previousTimestamp = item.timestamp();
            entries.add(new ConversationEntry(item.timestamp() * 1_000 + tie, item.role(), item.content()));
        }
        return entries;
    }

    private record TimedConversationEntry(long timestamp, long stableOrder, String role, String content) {
    }

    private String formatTool(ChatMessageView item) {
        StringBuilder text = new StringBuilder("工具 ").append(item.toolName());
        if (item.input() != null) {
            text.append("\n输入：").append(safeJson(item.input()));
        }
        if (item.output() != null && !item.output().isBlank()) {
            text.append("\n结果：").append(item.output());
        }
        if (Boolean.TRUE.equals(item.isError())) {
            text.append("\n状态：失败");
        }
        return text.toString();
    }

    private List<GitRepositoryChange> readGitChanges(Path cwd, List<String> warnings) {
        if (!Files.isDirectory(cwd)) {
            warnings.add("开发会话工作目录不存在，无法读取 Git 变化");
            return List.of();
        }
        List<Path> repositories = resolveRepositories(cwd.toAbsolutePath().normalize());
        if (repositories.isEmpty()) {
            warnings.add("开发会话工作目录未找到 Git 仓库");
            return List.of();
        }
        List<GitRepositoryChange> result = new ArrayList<>();
        for (Path repository : repositories) {
            try {
                result.add(readRepositoryChange(repository));
            } catch (Exception e) {
                result.add(new GitRepositoryChange(repository.toString(), List.of(), "", false, e.getMessage()));
            }
        }
        return result;
    }

    private GitRepositoryChange readRepositoryChange(Path repository) {
        GitStatusResponse status = gitLogService.gitStatus(repository);
        List<String> files = status.entries().stream()
                .map(entry -> entry.x() + entry.y() + " " + entry.path())
                .toList();
        StringBuilder diff = new StringBuilder();
        boolean truncated = false;
        for (GitStatusEntry entry : status.entries()) {
            if (diff.length() >= MAX_REPOSITORY_DIFF_CHARS) {
                truncated = true;
                break;
            }
            GitFileDiffResponse fileDiff = gitLogService.gitFileDiff(repository, entry.path(), entry.x());
            if (!fileDiff.diff().isBlank()) {
                int room = MAX_REPOSITORY_DIFF_CHARS - diff.length();
                String part = fileDiff.diff();
                diff.append(part, 0, Math.min(room, part.length())).append('\n');
                truncated = truncated || fileDiff.truncated() || part.length() > room;
            }
        }
        return new GitRepositoryChange(repository.toString(), files, diff.toString(), truncated, null);
    }

    private List<Path> resolveRepositories(Path cwd) {
        if (isRepository(cwd)) {
            return List.of(cwd);
        }
        Path current = cwd.getParent();
        for (int depth = 0; current != null && depth < MAX_PARENT_DEPTH; depth++, current = current.getParent()) {
            if (isRepository(current)) {
                return List.of(current);
            }
        }
        try (Stream<Path> children = Files.list(cwd)) {
            return children.filter(Files::isDirectory)
                    .filter(this::isRepository)
                    .sorted()
                    .toList();
        } catch (Exception e) {
            return List.of();
        }
    }

    private boolean isRepository(Path path) {
        return Files.exists(path.resolve(".git"));
    }

    private String safeJson(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            return String.valueOf(value);
        }
    }

    private String hash(List<ConversationEntry> conversation, List<GitRepositoryChange> repositories) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(mapper.writeValueAsString(conversation).getBytes(StandardCharsets.UTF_8));
            digest.update(mapper.writeValueAsString(repositories).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception e) {
            throw new IllegalStateException("生成开发变更快照失败", e);
        }
    }

    private static String truncate(String value, int maxChars) {
        return value.length() <= maxChars ? value : value.substring(0, maxChars) + "\n…（已截断）";
    }
}
